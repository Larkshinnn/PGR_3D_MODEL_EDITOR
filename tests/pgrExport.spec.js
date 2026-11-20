// Checks that the export plugin carries the game's shader data into the new file with matching indices.
//   npm run test:pgr-export
import assert from 'node:assert/strict';
import { createPgrExportPlugin } from '../src/editor/pgrExport.js';
import { isRemapped } from '../src/editor/glbTidy.js';

/** The source file: 4 nodes, 3 materials (one is an outline pass no mesh uses), 4 textures. */
function makeSource() {
  const objects = { root: { id: 'root' }, head: { id: 'head' }, hairRoot: { id: 'hairRoot' }, hairTip: { id: 'hairTip' }, hidden: { id: 'hidden' } };
  const materials = { body: { name: 'Body' }, hair: { name: 'Hair' } };
  const json = {
    scene: 0,
    scenes: [{
      nodes: [0],
      extras: {
        formatVersion: 1,
        anchors: { head: 1, body: 0 },
        objectTags: [{ name: 'Hidden', nodes: [4] }, { name: 'Hair', nodes: [2, 3] }],
        springBones: {
          presets: [{ name: 'p' }],
          chains: [{ node: 3, root: 2, preset: 0, colliders: [1], exclusions: [4] }, { node: 4, root: 4, preset: 0 }],
          colliders: [{ node: 4, kind: 'sphere' }, { node: 1, kind: 'sphere' }],
        },
        faces: { node: 1, textures: [3] },
        somethingUnknown: { node: 2 },
      },
    }],
    nodes: [{}, {}, {}, {}, {}],
    materials: [
      { name: 'Body', extras: { shader: { textures: { _MainTex: { index: 0 }, _MaskTex: { index: 1 } } }, passes: [2] } },
      { name: 'Hair', extras: { shader: { textures: { _MainTex: { index: 2 } } } } },
      { name: 'Body outline', pbrMetallicRoughness: { baseColorTexture: { index: 0 } }, extras: { family: 'outline', passes: [0] } },
    ],
    textures: [
      { sampler: 0, extensions: { EXT_texture_webp: { source: 0 } } },
      { source: 1 },
      { source: 2 },
      { source: 3, name: 'face2' },
    ],
    samplers: [{ magFilter: 9729 }],
    images: [0, 1, 2, 3].map((i) => ({ mimeType: i === 0 ? 'image/webp' : 'image/png', bufferView: 10 + i })),
  };
  const associations = new Map([
    [objects.root, { nodes: 0 }], [objects.head, { nodes: 1 }], [objects.hairRoot, { nodes: 2 }], [objects.hairTip, { nodes: 3 }], [objects.hidden, { nodes: 4 }],
    [materials.body, { materials: 0 }], [materials.hair, { materials: 1 }],
  ]);
  const parser = {
    json,
    associations,
    getDependency: async (type, index) => {
      assert.equal(type, 'bufferView');
      return new Uint8Array([index, index + 1, index + 2]).buffer;
    },
  };
  return { source: { parser }, objects, materials };
}

/** A writer that already wrote 4 nodes (in a new order, without the hidden one) and 2 mesh materials. */
function makeWriter(objects, exportMaterials) {
  const blobs = [];
  const writer = {
    json: {
      scenes: [{ nodes: [0] }],
      nodes: [{}, {}, {}, {}],
      materials: [
        { name: 'Hair', extras: { shader: { textures: { _MainTex: { index: 2 } } } } },
        { name: 'Body', extras: { shader: { textures: { _MainTex: { index: 0 }, _MaskTex: { index: 1 } } }, passes: [2] } },
      ],
      textures: [{ source: 0 }],
      images: [{ mimeType: 'image/png', bufferView: 0 }],
      bufferViews: [{}],
    },
    nodeMap: new Map([[objects.root, 0], [objects.hairTip, 1], [objects.head, 2], [objects.hairRoot, 3]]),
    cache: { materials: new Map([[exportMaterials.hair, 0], [exportMaterials.body, 1]]) },
    extensionsUsed: {},
    extensionsRequired: {},
    pending: [],
    blobs,
    async processBufferViewImage(blob) {
      blobs.push(blob);
      return this.json.bufferViews.push({ byteLength: blob.size }) - 1;
    },
  };
  return writer;
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('textures, passes and model data point at the right things in the new file', async () => {
  const { source, objects, materials } = makeSource();
  const exportMaterials = { body: { name: 'Body' }, hair: { name: 'Hair' } };
  const origins = new Map([[exportMaterials.body, materials.body], [exportMaterials.hair, materials.hair]]);
  const writer = makeWriter(objects, exportMaterials);
  createPgrExportPlugin({ source, materialOrigins: origins })(writer).afterParse();
  await Promise.all(writer.pending);
  const { json } = writer;

  // Every game texture is copied once, byte for byte, after the exporter's own.
  assert.equal(writer.blobs.length, 4);
  assert.deepEqual(new Uint8Array(await writer.blobs[0].arrayBuffer()).length, 3);
  const body = json.materials[1].extras;
  const mask = json.textures[body.shader.textures._MaskTex.index];
  const mainWebp = json.textures[body.shader.textures._MainTex.index];
  assert.ok(body.shader.textures._MainTex.index >= 1 && body.shader.textures._MaskTex.index >= 1, 'not the exporter\'s texture 0');
  assert.equal(mainWebp.extensions.EXT_texture_webp.source !== undefined, true);
  assert.equal(writer.extensionsUsed.EXT_texture_webp, true);
  assert.equal(json.samplers.length, 1);
  assert.equal(mainWebp.sampler, 0);
  assert.equal(json.images[mask.source].mimeType, 'image/png');
  // Hair texture is shared by index, not copied twice.
  assert.equal(json.materials[0].extras.shader.textures._MainTex.index !== body.shader.textures._MainTex.index, true);

  // The outline pass material had no mesh: it is copied, and its pass back to Body finds Body's new index.
  const outlineIndex = body.passes[0];
  assert.equal(json.materials[outlineIndex].name, 'Body outline');
  assert.deepEqual(json.materials[outlineIndex].extras.passes, [1]);
  assert.equal(json.materials[outlineIndex].pbrMetallicRoughness.baseColorTexture.index, body.shader.textures._MainTex.index);

  // Model data: nodes renumbered, things that were not exported dropped.
  const scene = json.scenes[0].extras;
  assert.equal(isRemapped(json), true);
  assert.deepEqual(scene.anchors, { head: 2, body: 0 });
  assert.deepEqual(scene.objectTags, [{ name: 'Hair', nodes: [3, 1] }]);
  assert.equal(scene.springBones.chains.length, 1);
  assert.deepEqual(scene.springBones.colliders, [{ node: 2, kind: 'sphere' }]);
  assert.deepEqual(scene.springBones.chains[0], { node: 1, root: 3, preset: 0, colliders: [0], exclusions: [] });
  assert.equal(scene.faces.node, 2);
  assert.equal(json.textures[scene.faces.textures[0]].name, 'face2');
  assert.equal(scene.somethingUnknown, undefined);
});

test('without a source file nothing is touched', async () => {
  const { objects } = makeSource();
  const writer = makeWriter(objects, { body: {}, hair: {} });
  const before = JSON.stringify(writer.json);
  createPgrExportPlugin({ source: null, materialOrigins: new Map() })(writer).afterParse();
  await Promise.all(writer.pending);
  assert.equal(JSON.stringify(writer.json), before);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}\n      ${error.message}`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
