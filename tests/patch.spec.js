// Body patching & trunk/limb geometry checks (including real base.glb verification):
//   npm run test:patch
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { buildTrunkRings, buildTubeRings, fillShellHoles, loftRings } from '../src/editor/limbGeometry.js';
import { createBodyPatcher, defaultPartRewriteOnHide } from '../src/editor/bodyPatch.js';
import { createPoseRig } from '../src/pose/rig.js';
import { createSpringBoneSystem } from '../src/materials/pgrToon.js';
import { ensureFaceMask, applyFaceMask } from '../src/editor/meshEdit.js';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

function assertWatertightAndOutward(shape, geometry, label) {
  const { position, normal, skinIndex, skinWeight } = geometry.attributes;
  const index = geometry.index;
  assert.ok(position.count > 20, `${label}: too few vertices`);
  for (let i = 0; i < position.count; i++) {
    let sum = 0;
    for (let k = 0; k < 4; k++) {
      sum += skinWeight.getComponent(i, k);
      assert.ok(Number.isFinite(skinIndex.getComponent(i, k)));
    }
    assert.ok(Math.abs(sum - 1) < 1e-5, `${label}: skin weights must sum to 1`);
  }

  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  let outward = 0;
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    n.fromBufferAttribute(normal, i);
    let nearest = shape.rings[0].center;
    for (const r of shape.rings) if (r.center.distanceTo(p) < nearest.distanceTo(p)) nearest = r.center;
    if (n.dot(p.clone().sub(nearest)) > 0) outward++;
  }
  assert.ok(outward / position.count > 0.94, `${label}: normals face inward (${outward}/${position.count})`);

  const edges = new Map();
  for (let i = 0; i < index.count; i += 3) {
    for (let k = 0; k < 3; k++) {
      const a = index.getX(i + k);
      const b = index.getX(i + ((k + 1) % 3));
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  assert.ok([...edges.values()].every((c) => c === 2), `${label}: mesh is not watertight`);
}

for (const section of ['pelvis', 'torso', 'neck']) {
  test(`trunk (${section}): closed, watertight, outward-facing with valid skinning`, () => {
    const pelvis = new THREE.Vector3(0, 0.93, -0.02);
    const spine = new THREE.Vector3(0, 0.99, -0.04);
    const spine2 = new THREE.Vector3(0, 1.15, -0.04);
    const neck = new THREE.Vector3(0, 1.31, 0.005);
    const head = new THREE.Vector3(0, 1.40, -0.005);
    const shape = buildTrunkRings({
      section,
      pelvis,
      trunkTop: neck,
      head,
      spinePoints: [
        { pos: pelvis, joint: 0 },
        { pos: spine, joint: 1 },
        { pos: spine2, joint: 2 },
        { pos: neck, joint: 3 },
        { pos: head, joint: 4 },
      ],
      hipHalfSpan: 0.075,
      shoulderHalfSpan: 0.09,
      forward: new THREE.Vector3(0, 0, -1),
      joints: { pelvis: 0, spine: 1, chest: 2, neck: 3, head: 4 },
    });
    const geom = loftRings(shape, { segments: 24, capStart: true });
    assertWatertightAndOutward(shape, geom, `trunk:${section}`);
  });
}

test('partial tube span builds only requested interval along limb', () => {
  const from = new THREE.Vector3(0, 1.0, 0);
  const to = new THREE.Vector3(0, 0.5, 0);
  const partial = loftRings(
    buildTubeRings({
      from,
      to,
      forward: new THREE.Vector3(0, 0, 1),
      radiusFrom: 0.06,
      radiusTo: 0.04,
      joints: { bone: 0, parent: 1, child: 2 },
      startAt: 0.65,
      endAt: 1.05,
    }),
  );
  partial.computeBoundingBox();
  assert.ok(partial.boundingBox.max.y < 0.72, `expected partial tube below y=0.72, got ${partial.boundingBox.max.y}`);
  assert.ok(partial.boundingBox.min.y < 0.50, 'expected partial tube to overlap knee');
});

test('fillShellHoles closes a triangular hole in a shared-vertex closed mesh', () => {
  // Build an 8-vertex closed cube where all faces share corner indices
  const geo = new THREE.BufferGeometry();
  const verts = new Float32Array([
    -1, -1, -1,  1, -1, -1,  1,  1, -1, -1,  1, -1,
    -1, -1,  1,  1, -1,  1,  1,  1,  1, -1,  1,  1,
  ]);
  const indices = [
    0, 2, 1, 0, 3, 2, // back
    4, 5, 6, 4, 6, 7, // front
    0, 1, 5, 0, 5, 4, // bottom
    3, 7, 6, 3, 6, 2, // top
    0, 4, 7, 0, 7, 3, // left
    1, 2, 6, 1, 6, 5, // right
  ];
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  const removed = indices.splice(0, 3); // open 1 triangular hole
  geo.setIndex(indices);
  assert.equal(removed.length, 3);
  const added = fillShellHoles(geo, 16);
  assert.equal(added, 1, 'should fill the single 3-edge hole');
});

function loadBaseGlbForTest() {
  const buf = fs.readFileSync('base.glb');
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
  const bin = buf.slice(20 + jsonLen + 8);
  const nodes = gltf.nodes.map((n, i) => {
    const o = new THREE.Object3D();
    o.name = n.name || 'n' + i;
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.scale) o.scale.fromArray(n.scale);
    return o;
  });
  gltf.nodes.forEach((n, i) => {
    (n.children || []).forEach((c) => nodes[i].add(nodes[c]));
  });
  const root = new THREE.Group();
  (gltf.scenes[0].nodes || []).forEach((ni) => root.add(nodes[ni]));
  root.updateMatrixWorld(true);

  const nodeMap = new Map(nodes.map((o, i) => [i, o]));
  const springSys = createSpringBoneSystem(nodeMap, gltf.scenes[0].extras.springBones);
  const physicsBones = new Set();
  for (const c of springSys.chains) for (const p of c.particles) if (p.bone) physicsBones.add(p.bone);

  const readAcc = (accIdx) => {
    const acc = gltf.accessors[accIdx];
    const bv = gltf.bufferViews[acc.bufferView];
    const off = (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const compCount = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[acc.type];
    const len = acc.count * compCount;
    const Typed = {
      5120: Int8Array,
      5121: Uint8Array,
      5122: Int16Array,
      5123: Uint16Array,
      5125: Uint32Array,
      5126: Float32Array,
    }[acc.componentType];
    if (bv.byteStride && bv.byteStride !== compCount * Typed.BYTES_PER_ELEMENT) {
      const out = new Typed(len);
      const dv = new DataView(bin.buffer, bin.byteOffset + off);
      for (let i = 0; i < acc.count; i++) {
        for (let c = 0; c < compCount; c++) {
          const b = i * bv.byteStride + c * Typed.BYTES_PER_ELEMENT;
          out[i * compCount + c] =
            Typed === Float32Array
              ? dv.getFloat32(b, true)
              : Typed === Uint16Array
                ? dv.getUint16(b, true)
                : dv.getUint8(b);
        }
      }
      return out;
    }
    return new Typed(bin.buffer, bin.byteOffset + off, len);
  };

  const parts = [];
  gltf.nodes.forEach((n, idx) => {
    if (n.mesh === undefined) return;
    const prim = gltf.meshes[n.mesh].primitives[0];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(readAcc(prim.attributes.POSITION), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(readAcc(prim.attributes.NORMAL), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(readAcc(prim.attributes.TEXCOORD_0), 2));
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(readAcc(prim.attributes.JOINTS_0), 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(readAcc(prim.attributes.WEIGHTS_0), 4));
    geo.setIndex(new THREE.BufferAttribute(readAcc(prim.indices), 1));
    const skin = gltf.skins[n.skin];
    const bones = skin.joints.map((ji) => nodes[ji]);
    const ibmRaw = readAcc(skin.inverseBindMatrices);
    const inverses = [];
    for (let i = 0; i < bones.length; i++) inverses.push(new THREE.Matrix4().fromArray(ibmRaw, i * 16));
    const sm = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial({ name: gltf.materials[prim.material].name }));
    sm.name = n.name;
    sm.bind(new THREE.Skeleton(bones, inverses), new THREE.Matrix4());
    root.add(sm);
    const label = n.name.replace('R3KurumiMd010011', '');
    parts.push({
      index: idx,
      object: sm,
      label,
      defaultVisible: true,
      deleted: false,
      rewriteOnHide: defaultPartRewriteOnHide(label),
    });
  });

  root.updateMatrixWorld(true);
  const bindWorld = new Map();
  root.traverse((o) => bindWorld.set(o, o.matrixWorld.clone()));
  const rig = createPoseRig(root, { exclude: physicsBones });
  const patcher = createBodyPatcher({ rig, parts, bindWorld, physicsBones, pgrModel: null });
  return { root, parts, rig, patcher };
}

test('base.glb: hiding Cloth patches torso and forearms with 100% gap coverage', () => {
  const { parts, patcher } = loadBaseGlbForTest();
  for (const p of parts) p.object.visible = p.label !== 'Cloth';
  patcher.sync({ auto: true });
  const report = patcher.getGapReport();
  assert.equal(report.missingCount, 0);
  assert.equal(report.coveragePct, 100);
  assert.ok(patcher.has('torso'));
  assert.ok(patcher.has('forearmL'));
  assert.ok(patcher.has('forearmR'));
});

test('base.glb: hiding Down patches pelvis and both lower legs with 100% gap coverage', () => {
  const { parts, patcher } = loadBaseGlbForTest();
  for (const p of parts) p.object.visible = p.label !== 'Down';
  patcher.sync({ auto: true });
  const report = patcher.getGapReport();
  assert.equal(report.missingCount, 0);
  assert.equal(report.coveragePct, 100);
  assert.ok(patcher.has('pelvis'));
  assert.ok(patcher.has('legL'));
  assert.ok(patcher.has('legR'));
});

test('base.glb: hiding Sock patches partial thigh and knee gaps', () => {
  const { parts, patcher } = loadBaseGlbForTest();
  for (const p of parts) p.object.visible = p.label !== 'Sock';
  patcher.sync({ auto: true });
  assert.equal(patcher.getGapReport().missingCount, 0);
  assert.ok(patcher.has('thighL') && patcher.has('thighR'));
  assert.ok(patcher.has('legL') && patcher.has('legR'));
});

test('base.glb: per-part rewriteOnHide=false keeps hidden part empty while rewriteOnHide=true patches others', () => {
  const { parts, patcher } = loadBaseGlbForTest();
  for (const p of parts) {
    p.object.visible = !['Cloth', 'Down'].includes(p.label);
    patcher.setPartRewrite(p, p.label === 'Down');
  }
  patcher.sync({ auto: true });
  assert.equal(patcher.has('torso'), false, 'Cloth had rewriteOnHide=false so torso must remain empty');
  assert.equal(patcher.has('forearmL'), false, 'Cloth forearm must remain empty');
  assert.equal(patcher.has('pelvis'), true, 'Down had rewriteOnHide=true so pelvis must be patched');
  assert.equal(patcher.has('legL'), true, 'Down had rewriteOnHide=true so leg must be patched');
});

test('base.glb: Edit Mode face deletion triggers body patch under cut triangles', () => {
  const { parts, patcher } = loadBaseGlbForTest();
  const cloth = parts.find((p) => p.label === 'Cloth');
  const data = ensureFaceMask(cloth.object);
  // Delete all faces on Cloth (simulates cutting a large part in Edit Mode while Cloth stays visible)
  data.mask.fill(0);
  applyFaceMask(cloth.object);
  patcher.invalidatePart(cloth);
  patcher.sync({ auto: true });
  assert.ok(patcher.has('torso'), 'cutting faces from Cloth should auto-patch bare torso underneath');
});

test('base.glb: shell and plain modes and baselayer fillStyle build without errors', () => {
  const { root, parts, patcher } = loadBaseGlbForTest();
  for (const p of parts) p.object.visible = !['Cloth', 'Down', 'Sock'].includes(p.label);
  for (const m of ['hybrid', 'shell', 'plain']) {
    patcher.setMode(m);
    patcher.sync({ auto: true });
    assert.ok(patcher.count >= 5, `mode ${m} should produce patches`);
  }
  patcher.setFillStyle('baselayer', '#1e2028');
  const patchMeshes = [];
  root.traverse((o) => {
    if (o.userData?.bodyPatch) patchMeshes.push(o);
  });
  assert.ok(patchMeshes.length > 0);
  assert.equal(patchMeshes[0].material.name, 'body-patch-baselayer');
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}\n      ${error.stack || error.message}`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
