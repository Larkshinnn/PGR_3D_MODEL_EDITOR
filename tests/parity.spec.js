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
  throw new Error('No Chromium browser (Chrome/Edge) found for parity test.');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function srgbToLab(r, g, b) {
  const toLin = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const R = toLin(r);
  const G = toLin(g);
  const B = toLin(b);

  const X = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047;
  const Y = (R * 0.2126729 + G * 0.7151522 + B * 0.0721750) / 1.00000;
  const Z = (R * 0.0193339 + G * 0.1191920 + B * 0.9503041) / 1.08883;

  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X);
  const fy = f(Y);
  const fz = f(Z);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function deltaE76(rgbA, rgbB) {
  const [L1, a1, b1] = srgbToLab(...rgbA);
  const [L2, a2, b2] = srgbToLab(...rgbB);
  return Math.hypot(L1 - L2, a1 - a2, b1 - b2);
}

async function runParityTest() {
  const outDir = process.env.PARITY_OUT_DIR || path.resolve('tests/output');
  fs.mkdirSync(outDir, { recursive: true });

  const vite = await createServer({
    root: process.cwd(),
    // No file watching: the browser profile below lives inside the project, and
    // watching Chrome's locked files crashes the server on Windows (EBUSY).
    server: { port: 0, host: '127.0.0.1', watch: null },
  });
  await vite.listen();
  const { port } = vite.httpServer.address();
  const url = `http://127.0.0.1:${port}/?clip=Stand1&t=0.46&cam=front&bg=flat`;

  const userDataDir = path.join(outDir, '.chrome-profile-' + Date.now());
  fs.mkdirSync(userDataDir, { recursive: true });

  const browserBin = findBrowser();
  const debugPort = 9240 + Math.floor(Math.random() * 50);
  const chrome = spawn(browserBin, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    '--window-size=1920,1080',
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
    throw new Error('Failed to connect to headless browser DevTools.');
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
      const text = (data.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
      errors.push(text);
    } else if (data.method === 'Runtime.exceptionThrown') {
      const desc = data.params.exceptionDetails?.exception?.description || data.params.exceptionDetails?.text;
      errors.push(desc);
    }
  });

  await new Promise((resolve) => ws.addEventListener('open', resolve));

  function send(method, params = {}) {
    const id = ++msgId;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  }

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  });

  for (let i = 0; i < 120; i++) {
    await sleep(500);
    const evalRes = await send('Runtime.evaluate', {
      expression: 'Boolean(window.__viewerReady && window.__viewerReady() && document.querySelector("#loading").hidden)',
      returnByValue: true,
    });
    if (evalRes?.result?.value === true) break;
  }

  await sleep(1000);

  // Capture PGR screenshot with HUD
  const pgrHudShot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'kurumi_pgr_hud.png'), Buffer.from(pgrHudShot.data, 'base64'));

  // Sample pixel regions and inspect pipeline state in browser
  const reportRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const v = window.__viewer;
      const canvas = document.querySelector('#scene');
      const off = document.createElement('canvas');
      off.width = canvas.width;
      off.height = canvas.height;
      const ctx = off.getContext('2d');
      ctx.drawImage(canvas, 0, 0);

      function samplePatch(cx, cy, r = 4) {
        const data = ctx.getImageData(cx - r, cy - r, r * 2 + 1, r * 2 + 1).data;
        let R = 0, G = 0, B = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] > 200) {
            R += data[i];
            G += data[i + 1];
            B += data[i + 2];
            n++;
          }
        }
        return n > 0 ? [Math.round(R / n), Math.round(G / n), Math.round(B / n)] : [0, 0, 0];
      }

      // Project 3D world points on face skin and red dress to 2D canvas coordinates
      function worldToPixel(x, y, z) {
        const p = new v.THREE.Vector3(x, y, z).project(v.camera);
        return [
          Math.round((p.x * 0.5 + 0.5) * canvas.width),
          Math.round((-p.y * 0.5 + 0.5) * canvas.height),
        ];
      }

      const chestSkinPx = worldToPixel(0.0, 1.355, -0.08);
      const dressRedPx = worldToPixel(-0.05, 0.66, -0.18);

      return {
        meshes: v.pgrModel.meshes.length,
        outlines: v.pgrModel.outlines.length,
        hairFades: v.pgrModel.hairFades.length,
        groundShadowCasters: v.pgrModel.groundShadowCasters.length,
        hasSprings: Boolean(v.springSystem),
        skinRgb: samplePatch(chestSkinPx[0], chestSkinPx[1], 5),
        dressRgb: samplePatch(dressRedPx[0], dressRedPx[1], 8),
        chestSkinPx,
        dressRedPx,
        uiTitle: document.title,
      };
    })()`,
    returnByValue: true,
  });

  const report = reportRes?.result?.value;

  // Switch to PBR mode and capture screenshot
  await send('Runtime.evaluate', {
    expression: 'window.__viewer.applyMaterialMode("pbr")',
  });
  await sleep(300);
  const pbrHudShot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'kurumi_pbr_hud.png'), Buffer.from(pbrHudShot.data, 'base64'));

  // Sample PBR skin and dress for comparison
  const pbrSampleRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const canvas = document.querySelector('#scene');
      const off = document.createElement('canvas');
      off.width = canvas.width;
      off.height = canvas.height;
      const ctx = off.getContext('2d');
      ctx.drawImage(canvas, 0, 0);
      function samplePatch(cx, cy, r = 4) {
        const data = ctx.getImageData(cx - r, cy - r, r * 2 + 1, r * 2 + 1).data;
        let R = 0, G = 0, B = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] > 200) {
            R += data[i];
            G += data[i + 1];
            B += data[i + 2];
            n++;
          }
        }
        return n > 0 ? [Math.round(R / n), Math.round(G / n), Math.round(B / n)] : [0, 0, 0];
      }
      return {
        skinRgb: samplePatch(${report.chestSkinPx[0]}, ${report.chestSkinPx[1]}, 5),
        dressRgb: samplePatch(${report.dressRedPx[0]}, ${report.dressRedPx[1]}, 8),
      };
    })()`,
    returnByValue: true,
  });
  const pbrSample = pbrSampleRes?.result?.value;

  ws.close();
  chrome.kill();
  await vite.close();

  // Reference Huaxu PGR target colors on Kurumi Stand1 (t=0.46, front camera)
  const HUAXU_SKIN_TARGET = [245, 224, 223];
  const HUAXU_DRESS_TARGET = [219, 77, 43];

  const skinDeltaE = deltaE76(report.skinRgb, HUAXU_SKIN_TARGET);
  const dressDeltaE = deltaE76(report.dressRgb, HUAXU_DRESS_TARGET);

  console.log('=== PGR Render Parity Report ===');
  console.log('WebGL / Runtime Errors:', errors.length);
  console.log('Active Meshes:', report.meshes);
  console.log('Active Outlines:', report.outlines);
  console.log('Hair Stencil Fades:', report.hairFades);
  console.log('Planar Ground Shadows:', report.groundShadowCasters);
  console.log('SpringBone Physics:', report.hasSprings);
  console.log('UI Title (UTF-8 check):', report.uiTitle);
  console.log('PGR Skin RGB:', report.skinRgb, `(ΔE76 vs Huaxu target: ${skinDeltaE.toFixed(2)}, threshold < 8)`);
  console.log('PGR Dress RGB:', report.dressRgb, `(ΔE76 vs Huaxu target: ${dressDeltaE.toFixed(2)}, threshold < 10)`);
  console.log('PBR Skin RGB:', pbrSample.skinRgb);
  console.log('PBR Dress RGB:', pbrSample.dressRgb);

  if (errors.length > 0) {
    throw new Error(`Expected 0 runtime errors, got ${errors.length}: ${errors[0]}`);
  }
}

runParityTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
