// Checks for the .glb tidy-up that runs after export. No browser needed:
//   npm run test:glb
import assert from 'node:assert/strict';
import { dropStaleExtras, facingRootIndex, isOwnExport, tidyGlb } from '../src/editor/glbTidy.js';

/** A small hand-made .glb: a JSON chunk and a binary chunk of `binLength` bytes. */
function makeGlb(json, binLength = 12) {
  const enc = new TextEncoder();
  let text = enc.encode(JSON.stringify(json));
  const padded = (text.length + 3) & ~3;
  const grown = new Uint8Array(padded).fill(0x20);
  grown.set(text);
  text = grown;
  const bin = new Uint8Array(binLength).map((_, i) => (i * 37) & 0xff);
  const total = 12 + 8 + text.length + 8 + bin.length;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, text.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(text, 20);
  view.setUint32(20 + text.length, bin.length, true);
  view.setUint32(24 + text.length, 0x004e4942, true);
  out.set(bin, 28 + text.length);
  return { buffer: out.buffer, bin };
}

function readGlb(buffer) {
  const view = new DataView(buffer);
  const length = view.getUint32(12, true);
  return {
    total: view.getUint32(8, true),
    jsonLength: length,
    json: JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length))),
    binChunk: new Uint8Array(buffer, 20 + length),
  };
}

const sample = () => ({
  asset: { version: '2.0', generator: 'THREE.GLTFExporter' },
  scene: 0,
  scenes: [{ name: 'AuxScene', nodes: [0] }],
  nodes: [
    { name: '', children: [1, 2, 3, 4] },
    { name: 'n14', extras: { originalName: 'Bip001' } },
    { name: 'n4', mesh: 0, extras: { originalName: 'Body' } },
    { name: 'n7', extras: { originalName: 'Bone001' } },
    { name: 'n8', extras: { originalName: 'Bone001' } },
  ],
  meshes: [{ primitives: [] }],
  animations: [{ channels: [{ sampler: 0, target: { node: 1, path: 'rotation' } }], samplers: [] }],
});

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('nodes get their original names back, duplicates keep the short one', () => {
  const { buffer } = makeGlb(sample());
  const { json } = readGlb(tidyGlb(buffer));
  assert.deepEqual(json.nodes.slice(1, 5).map((node) => node.name), ['Bip001', 'Body', 'n7', 'n8']);
  // Animations target node indices, which do not move.
  assert.equal(json.animations[0].channels[0].target.node, 1);
});

test('one named root holds the scene and turns a -Z facing character to +Z', () => {
  const { buffer } = makeGlb(sample());
  const { json } = readGlb(tidyGlb(buffer, { name: 'Kurumi Tokisaki', front: { x: 0, y: 0.3, z: -4 } }));
  const root = json.nodes[json.scenes[0].nodes[0]];
  assert.equal(json.scenes[0].nodes.length, 1);
  assert.equal(root.name, 'Kurumi Tokisaki');
  assert.equal(json.scenes[0].name, 'Kurumi Tokisaki');
  assert.deepEqual(root.children, [0]);
  // Half a turn about +Y.
  assert.deepEqual(root.rotation.map((v) => Math.abs(v)), [0, 1, 0, 0]);
});

test('a character already facing +Z is not turned; a slight angle snaps to the axis', () => {
  let { json } = readGlb(tidyGlb(makeGlb(sample()).buffer, { front: { x: 0.2, z: 3 } }));
  assert.equal(json.nodes.at(-1).rotation, undefined);
  ({ json } = readGlb(tidyGlb(makeGlb(sample()).buffer, { front: { x: 3, z: 0.4 } })));
  // Facing +X: a quarter turn back to +Z.
  const [x, y, z, w] = json.nodes.at(-1).rotation;
  assert.deepEqual([x, z], [0, 0]);
  assert.ok(Math.abs(Math.abs(y) - Math.SQRT1_2) < 1e-9 && Math.abs(w - Math.SQRT1_2) < 1e-9);
  assert.ok(y < 0, 'turns clockwise seen from above');
});

test('the file stays a valid .glb with the binary chunk untouched', () => {
  const { buffer, bin } = makeGlb(sample(), 40);
  const out = tidyGlb(buffer, { name: 'Ünïcode name', front: { x: 0, z: -1 } });
  const { total, jsonLength, json, binChunk } = readGlb(out);
  assert.equal(total, out.byteLength);
  assert.equal(jsonLength % 4, 0);
  assert.equal(json.nodes.at(-1).name, 'Ünïcode name');
  const view = new DataView(binChunk.buffer, binChunk.byteOffset);
  assert.equal(view.getUint32(0, true), bin.length);
  assert.equal(view.getUint32(4, true), 0x004e4942);
  assert.deepEqual([...binChunk.subarray(8)], [...bin]);
  assert.throws(() => tidyGlb(new Uint8Array(16).buffer), /binary glTF/);
});

test('game data that points into the game file is dropped, names and morph names stay', () => {
  const json = sample();
  json.materials = [{ name: 'Face', extras: { shader: { textures: { _MaskTex: { index: 14 } } }, passes: [2], family: 'character', render: {}, kurumiToonParams: { a: 1 } } }];
  json.nodes[0].extras = { springBones: { chains: [{ node: 326 }] }, anchors: { head: 108 }, objectTags: [], alternates: {}, originalName: 'Root' };
  json.meshes[0].extras = { targetNames: ['blink'] };
  const { json: out } = readGlb(tidyGlb(makeGlb(json).buffer));
  assert.deepEqual(Object.keys(out.materials[0].extras), ['kurumiToonParams']);
  assert.deepEqual(Object.keys(out.nodes[0].extras), ['originalName']);
  assert.deepEqual(out.meshes[0].extras.targetNames, ['blink']);
  // In place on a parsed file too, and harmless on one without any of it.
  assert.equal(dropStaleExtras({ asset: {} }).asset !== undefined, true);
});

test('our own exports are recognised, with or without the root marker', () => {
  assert.equal(isOwnExport({ asset: { generator: 'THREE.GLTFExporter r186' } }), true);
  assert.equal(isOwnExport({ asset: { generator: 'Unity glTF' } }), false);
  const { json } = readGlb(tidyGlb(makeGlb(sample()).buffer, { name: 'Bianca', front: { x: 0, z: -1 } }));
  assert.equal(facingRootIndex(json), json.nodes.length - 1);
  // A file from before the marker: same shape, no extras.
  delete json.nodes.at(-1).extras;
  assert.equal(facingRootIndex(json), json.nodes.length - 1);
  // An ordinary file: the root holds a mesh, or there are several roots.
  assert.equal(facingRootIndex(sample()), -1);
  assert.equal(facingRootIndex({ scenes: [{ nodes: [0, 1] }], nodes: [{}, {}] }), -1);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}\n      ${error.message}`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
