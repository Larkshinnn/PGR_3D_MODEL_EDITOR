import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATHS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];

function findBrowser() {
  for (const p of CHROME_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('No Chromium browser (Chrome/Edge) found for E2E test.');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runE2E() {
  const outDir = path.resolve('tests/output');
  fs.mkdirSync(outDir, { recursive: true });

  const vite = await createServer({
    root: process.cwd(),
    server: { port: 0, host: '127.0.0.1', watch: null },
  });
  await vite.listen();
  const { port } = vite.httpServer.address();
  const url = `http://127.0.0.1:${port}/?clip=Stand1`;

  const userDataDir = path.join(outDir, '.chrome-e2e-' + Date.now());
  fs.mkdirSync(userDataDir, { recursive: true });

  const browserBin = findBrowser();
  const debugPort = 9320 + Math.floor(Math.random() * 50);
  const chrome = spawn(browserBin, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    '--window-size=1600,1000',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--use-angle=d3d11',
    `--user-data-dir=${userDataDir}`,
    url,
  ]);

  let wsUrl = null;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    try {
      const res = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const pages = await res.json();
      const page = pages.find((p) => p.type === 'page');
      if (page?.webSocketDebuggerUrl) {
        wsUrl = page.webSocketDebuggerUrl;
        break;
      }
    } catch {}
  }
  if (!wsUrl) {
    chrome.kill();
    await vite.close();
    throw new Error('Failed to connect to headless browser.');
  }

  const ws = new WebSocket(wsUrl);
  let msgId = 0;
  const pending = new Map();
  const errors = [];

  ws.addEventListener('message', (ev) => {
    const data = JSON.parse(ev.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(data.error.message));
      else resolve(data.result);
    } else if (data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error') {
      errors.push((data.params.args || []).map((a) => a.value ?? a.description ?? '').join(' '));
    } else if (data.method === 'Runtime.exceptionThrown') {
      errors.push(data.params.exceptionDetails?.exception?.description || data.params.exceptionDetails?.text);
    }
  });

  await new Promise((resolve) => ws.addEventListener('open', resolve));

  const send = (method, params = {}) => {
    const id = ++msgId;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  };

  const evalJs = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    }
    return res.result?.value;
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });

  let ready = false;
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    ready = await evalJs('Boolean(window.__viewerReady && window.__viewerReady() && document.querySelector("#loading").hidden)');
    if (ready) break;
  }
  if (!ready) {
    const diag = await evalJs('({ ready: window.__viewerReady?.(), loadingHidden: document.querySelector("#loading")?.hidden, loadingText: document.querySelector("#loading-text")?.textContent, partsLen: window.__viewer?.parts?.length })');
    chrome.kill();
    await vite.close();
    throw new Error('Viewer load timed out: ' + JSON.stringify({ diag, errors }));
  }
  await sleep(600);

  // 1. Switch to Bagian tab & verify Outliner + per-part rewrite toggle + Auto patch
  await evalJs('document.querySelector(".tab[data-tab=edit]").click()');
  await sleep(250);
  const partsCount = await evalJs('document.querySelectorAll("#parts-list .row").length');
  console.log('Outliner parts:', partsCount, 'errors:', errors);
  assert.ok(partsCount >= 11, `Expected >=11 parts, got ${partsCount}. Errors: ${errors.join(' | ')}`);

  // Hide Cloth -> torso & forearms must auto-patch with 0 missing
  await evalJs(`
    (() => {
      const rows = [...document.querySelectorAll('#parts-list .row')];
      const cloth = rows.find(r => r.querySelector('.row-label').textContent.includes('Cloth'));
      cloth.querySelector('.row-btn').click();
    })()
  `);
  await sleep(400);
  const afterHideCloth = await evalJs(`
    (() => {
      const bp = window.__viewer.bodyPatcher;
      return {
        hasTorso: bp.has('torso'),
        hasForearmL: bp.has('forearmL'),
        missing: bp.getGapReport().missingCount,
        cov: bp.getGapReport().coveragePct,
      };
    })()
  `);
  console.log('Hide Cloth:', afterHideCloth);
  assert.equal(afterHideCloth.hasTorso, true);
  assert.equal(afterHideCloth.hasForearmL, true);
  assert.equal(afterHideCloth.missing, 0);

  const shotHideCloth = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'e2e_hide_cloth.png'), Buffer.from(shotHideCloth.data, 'base64'));

  // Capture shell ("Ikuti baju", default) side view close-up matching chest/corset
  await evalJs(`
    (() => {
      const v = window.__viewer;
      const prevDamp = v.controls.enableDamping;
      v.controls.enableDamping = false;
      v.camera.position.set(0.88, 1.18, 0.25);
      v.controls.target.set(0, 1.14, 0.02);
      v.controls.update();
      v.controls.enableDamping = prevDamp;
    })()
  `);
  await sleep(300);
  const shotShellSide = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'e2e_shell_cloth_side.png'), Buffer.from(shotShellSide.data, 'base64'));

  await evalJs(`
    (() => {
      const v = window.__viewer;
      const prevDamp = v.controls.enableDamping;
      v.controls.enableDamping = false;
      v.camera.position.set(0, 1.0, 2.2);
      v.controls.target.set(0, 0.9, 0);
      v.controls.update();
      v.controls.enableDamping = prevDamp;
    })()
  `);
  await sleep(250);

  // 2. Toggle Cloth's "Timpa kulit saat hide" OFF -> torso/forearms stay EMPTY (not rewritten!)
  await evalJs(`
    (() => {
      const rows = [...document.querySelectorAll('#parts-list .row')];
      const cloth = rows.find(r => r.querySelector('.row-label').textContent.includes('Cloth'));
      cloth.querySelectorAll('.row-btn')[1].click();
    })()
  `);
  await sleep(300);
  const afterRewriteOff = await evalJs(`
    (() => {
      const bp = window.__viewer.bodyPatcher;
      return { hasTorso: bp.has('torso'), hasForearmL: bp.has('forearmL') };
    })()
  `);
  console.log('Cloth rewrite OFF:', afterRewriteOff);
  assert.equal(afterRewriteOff.hasTorso, false);
  assert.equal(afterRewriteOff.hasForearmL, false);

  const shotEmpty = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'e2e_cloth_empty.png'), Buffer.from(shotEmpty.data, 'base64'));

  // Toggle Cloth rewrite back ON + hide Down too -> check torso + pelvis + legs all patched
  await evalJs(`
    (() => {
      const rows = [...document.querySelectorAll('#parts-list .row')];
      const cloth = rows.find(r => r.querySelector('.row-label').textContent.includes('Cloth'));
      cloth.querySelectorAll('.row-btn')[1].click();
      const down = rows.find(r => r.querySelector('.row-label').textContent.includes('Down'));
      down.querySelector('.row-btn').click();
    })()
  `);
  await sleep(400);
  const afterHideClothDown = await evalJs(`
    (() => {
      const bp = window.__viewer.bodyPatcher;
      return {
        pelvis: bp.has('pelvis'),
        torso: bp.has('torso'),
        legL: bp.has('legL'),
        missing: bp.getGapReport().missingCount,
      };
    })()
  `);
  console.log('Hide Cloth+Down:', afterHideClothDown);
  assert.equal(afterHideClothDown.pelvis, true);
  assert.equal(afterHideClothDown.torso, true);
  assert.equal(afterHideClothDown.legL, true);
  assert.equal(afterHideClothDown.missing, 0);

  const shotHideBoth = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'e2e_hide_cloth_down.png'), Buffer.from(shotHideBoth.data, 'base64'));

  // 4. Delete Down via Outliner trash button -> appears in Terhapus -> Global Undo restores it
  await evalJs(`
    (() => {
      const rows = [...document.querySelectorAll('#parts-list .row')];
      const down = rows.find(r => r.querySelector('.row-label').textContent.includes('Down'));
      down.querySelector('.row-btn.is-danger').click();
    })()
  `);
  await sleep(250);
  const deletedCount = await evalJs('document.querySelectorAll("#deleted-parts-list .row").length');
  assert.equal(deletedCount, 1);
  await evalJs('document.querySelector("#global-undo").click()');
  await sleep(250);
  const deletedAfterUndo = await evalJs('document.querySelectorAll("#deleted-parts-list .row").length');
  assert.equal(deletedAfterUndo, 0);

  // 5. Add prop via Shift+A menu & Duplicate via button
  await evalJs(`
    (() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'A', shiftKey: true }));
      const halo = [...document.querySelectorAll('#add-menu-props .chip')].find(c => c.textContent.includes('Halo'));
      halo.click();
    })()
  `);
  await sleep(250);
  await evalJs('document.querySelector("#outliner-dup-btn").click()');
  await sleep(250);
  const extraCount = await evalJs('document.querySelectorAll("#outliner-extra-list .row").length');
  console.log('Extra outliner items after Add+Dup:', extraCount);
  assert.equal(extraCount, 2);

  // 6. Pose mode: pause animation, pose arm, save pose to library, reset pose, apply from library
  await evalJs('document.querySelector(".tab[data-tab=pose]").click()');
  await sleep(250);
  const poseRoundTrip = await evalJs(`
    (async () => {
      const playBtn = document.querySelector('#play');
      if (playBtn && playBtn.classList.contains('playing')) playBtn.click();
      await new Promise(r => setTimeout(r, 80));
      const v = window.__viewer;
      const rig = v.poseRig;
      const drag = rig.beginDrag('handL');
      rig.dragTo(drag, drag.start.clone().add(new v.THREE.Vector3(0.2, 0.35, -0.15)));
      rig.endDrag(drag);
      const posedPos = new v.THREE.Vector3().setFromMatrixPosition(rig.bones.arms.L.end.matrixWorld).toArray();

      document.querySelector('#pose-save-name').value = 'E2E Pose';
      document.querySelector('#pose-save-btn').click();
      await new Promise(r => setTimeout(r, 350));

      rig.resetAll();
      await new Promise(r => setTimeout(r, 150));

      const applyBtn = document.querySelector('#pose-library-grid .pose-card .btn-s');
      applyBtn.click();
      await new Promise(r => setTimeout(r, 200));

      const restoredPos = new v.THREE.Vector3().setFromMatrixPosition(rig.bones.arms.L.end.matrixWorld).toArray();
      const diff = Math.hypot(
        posedPos[0] - restoredPos[0],
        posedPos[1] - restoredPos[1],
        posedPos[2] - restoredPos[2],
      );
      return { cardCount: document.querySelectorAll('#pose-library-grid .pose-card').length, diff };
    })()
  `);
  console.log('Pose Library round-trip:', poseRoundTrip);
  assert.ok(poseRoundTrip.cardCount >= 1);
  assert.ok(poseRoundTrip.diff < 1e-4);

  // 6.5 Edit Face mode: select Cloth faces, delete, verify patch + undo restore
  await evalJs('document.querySelector(".tab[data-tab=edit]").click()');
  await sleep(150);
  const editFlow = await evalJs(`
    (async () => {
      const rows = [...document.querySelectorAll('#parts-list .row')];
      const clothRow = rows.find(r => r.querySelector('.row-label').textContent.includes('Cloth'));
      const clothPart = window.__viewer.parts.find(p => /Cloth/i.test(p.label));
      if (!clothPart.object.visible) clothRow.querySelector('.row-btn').click();
      clothRow.querySelector('.row-label').click();
      await new Promise(r => setTimeout(r, 120));
      document.querySelector('button[data-editor-mode="edit"]').click();
      await new Promise(r => setTimeout(r, 150));
      const beforeCount = clothPart.object.geometry.index.count;
      document.querySelector('#edit-select-all-btn').click();
      await new Promise(r => setTimeout(r, 80));
      document.querySelector('#edit-delete-faces-btn').click();
      await new Promise(r => setTimeout(r, 200));
      const afterDelCount = clothPart.object.geometry.index.count;
      const patchActive = window.__viewer.bodyPatcher.has('torso');
      document.querySelector('#global-undo').click();
      await new Promise(r => setTimeout(r, 150));
      const afterUndoCount = clothPart.object.geometry.index.count;
      document.querySelector('button[data-editor-mode="object"]').click();
      await new Promise(r => setTimeout(r, 100));
      return { beforeCount, afterDelCount, patchActive, afterUndoCount };
    })()
  `);
  console.log('Edit Face delete + undo:', editFlow);
  assert.ok(editFlow.beforeCount > 0);
  assert.equal(editFlow.afterDelCount, 0);
  assert.equal(editFlow.patchActive, true);
  assert.equal(editFlow.afterUndoCount, editFlow.beforeCount);

  // 7. Test GLB export via button click and validate binary glTF header
  await evalJs('document.querySelector(".tab[data-tab=scene]").click()');
  await sleep(200);
  const glbCheck = await evalJs(`
    (async () => {
      const origCreate = URL.createObjectURL.bind(URL);
      let capturedBlob = null;
      URL.createObjectURL = (blob) => {
        if (blob instanceof Blob) capturedBlob = blob;
        return origCreate(blob);
      };
      try {
        document.querySelector('#export-glb-btn').click();
        const deadline = Date.now() + 8000;
        while (!capturedBlob && Date.now() < deadline) {
          await new Promise(r => setTimeout(r, 100));
        }
        if (!capturedBlob) return { ok: false, size: 0, magic: '' };
        const buf = new Uint8Array(await capturedBlob.slice(0, 4).arrayBuffer());
        const magic = String.fromCharCode(...buf);
        return { ok: magic === 'glTF' && capturedBlob.size > 100000, size: capturedBlob.size, magic };
      } finally {
        URL.createObjectURL = origCreate;
      }
    })()
  `);
  console.log('GLB Export Check:', glbCheck);
  assert.equal(glbCheck.ok, true);
  assert.equal(glbCheck.magic, 'glTF');

  ws.close();
  chrome.kill();
  await vite.close();

  console.log('E2E Runtime/Console Errors:', errors.length);
  if (errors.length > 0) {
    throw new Error(`Expected 0 errors, got: ${errors.join(' | ')}`);
  }
  console.log('E2E PASSED!');
}

runE2E().catch((err) => {
  console.error(err);
  process.exit(1);
});
