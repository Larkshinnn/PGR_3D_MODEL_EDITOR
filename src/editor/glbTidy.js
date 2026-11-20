/**
 * Tidies a binary glTF written by three's GLTFExporter so it opens cleanly in
 * Blender and other DCC tools:
 *
 * - Nodes get their names from the game file back. The viewer renames every
 *   node for the animation mixer ("n14"); the original name travels along in
 *   `extras.originalName`. Animations point at node indices, so renaming here
 *   can not break them. A name used by more than one node keeps the short one.
 * - Game data that points into the game's own file is dropped: material
 *   shader notes name textures by their index there (mask, ramp and normal
 *   maps are not even exported), hair physics, anchors and tags name nodes by
 *   index. Left in, they point at the wrong things the moment the file is
 *   opened again, here or anywhere else.
 * - Everything is put under one root node named after the character and
 *   turned so the character faces +Z, the glTF "front". Blender's importer
 *   turns +Z into -Y, which is what its Front view (numpad 1) looks at.
 *
 * Pure byte and JSON work: no three.js, no DOM.
 */

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"

function readGlb(buffer) {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error('Not a binary glTF file');
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== CHUNK_JSON) throw new Error('The first chunk of the glTF file is not JSON');
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)));
  // Whatever follows the JSON chunk (the binary chunk) is kept byte for byte.
  const rest = new Uint8Array(buffer, 20 + jsonLength);
  return { json, rest };
}

function writeGlb(json, rest) {
  let text = new TextEncoder().encode(JSON.stringify(json));
  // Chunks are 4-byte aligned; the JSON chunk is padded with spaces.
  const padded = (text.length + 3) & ~3;
  if (padded !== text.length) {
    const grown = new Uint8Array(padded).fill(0x20);
    grown.set(text);
    text = grown;
  }
  const total = 12 + 8 + text.length + rest.length;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, text.length, true);
  view.setUint32(16, CHUNK_JSON, true);
  out.set(text, 20);
  out.set(rest, 20 + text.length);
  return out.buffer;
}

/** Material extras that describe the game's shader, with texture indices into the game's file. */
export const STALE_MATERIAL_KEYS = ['family', 'render', 'shader', 'passes'];
/** Model extras whose node references are indices into the game's file. */
export const STALE_NODE_KEYS = ['springBones', 'anchors', 'objectTags', 'alternates', 'selfShadow', 'formatVersion'];

/** Set on the scene by the export when the game data was rewritten to match the file (see pgrExport.js). */
export const REMAPPED_MARKER = 'pgrRemapped';
export const isRemapped = (json) => Boolean(json?.scenes?.some((scene) => scene?.extras?.[REMAPPED_MARKER]));

/** True for a glTF that three's exporter wrote, i.e. one of our own exports. */
export const isOwnExport = (json) => /^THREE\.GLTFExporter/.test(json?.asset?.generator ?? '');

function dropKeys(holder, keys) {
  if (!holder?.extras) return;
  for (const key of keys) delete holder.extras[key];
  if (Object.keys(holder.extras).length === 0) delete holder.extras;
}

/**
 * Removes the game data that no longer matches the file (see above) from a
 * glTF JSON, in place. Safe to run on a file that has none of it.
 */
export function dropStaleExtras(json) {
  // Copies left on nodes (the exporter writes the source scene's extras onto
  // the model's root node) are always stale. Material and scene data are
  // kept when the export rewrote them for this file.
  for (const node of json.nodes ?? []) dropKeys(node, STALE_NODE_KEYS);
  if (isRemapped(json)) return json;
  for (const material of json.materials ?? []) dropKeys(material, STALE_MATERIAL_KEYS);
  for (const scene of json.scenes ?? []) dropKeys(scene, STALE_NODE_KEYS);
  dropKeys(json, STALE_NODE_KEYS);
  return json;
}

/**
 * Index of the root node tidyGlb added to an export, or -1. Files from
 * before the marker existed are recognised by their shape: a single root
 * without a mesh, named like the scene, holding only a turn.
 */
export function facingRootIndex(json) {
  const scene = json?.scenes?.[json.scene ?? 0];
  if (!scene || scene.nodes?.length !== 1) return -1;
  const index = scene.nodes[0];
  const node = json.nodes?.[index];
  if (!node || node.mesh !== undefined || node.translation || node.scale) return -1;
  if (node.extras?.facingRoot) return index;
  return node.rotation && node.name && node.name === scene.name ? index : -1;
}

/** Quaternion [x, y, z, w] for a turn of `angle` radians about +Y. */
const yaw = (angle) => [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)];

/**
 * @param {ArrayBuffer} buffer  a .glb from GLTFExporter
 * @param {object} options
 * @param {string} [options.name]   name for the root node and the scene
 * @param {{x: number, z: number}} [options.front]  the way the character faces, in the exported space
 * @returns {ArrayBuffer} the tidied .glb
 */
export function tidyGlb(buffer, { name = 'Character', front = null } = {}) {
  const { json, rest } = readGlb(buffer);
  dropStaleExtras(json);
  const nodes = json.nodes ?? [];

  // 1. Original names, where they are unambiguous.
  const uses = new Map();
  for (const node of nodes) {
    const original = node.extras?.originalName;
    if (original) uses.set(original, (uses.get(original) ?? 0) + 1);
  }
  for (const node of nodes) {
    const original = node.extras?.originalName;
    if (original && uses.get(original) === 1) node.name = original;
  }

  // 2. One root, facing +Z. Snapped to quarter turns: game models face along an axis.
  const scene = json.scenes?.[json.scene ?? 0];
  if (scene?.nodes?.length) {
    let turn = 0;
    if (front && Math.hypot(front.x, front.z) > 1e-6) {
      const facing = Math.atan2(front.x, front.z);
      turn = -Math.round(facing / (Math.PI / 2)) * (Math.PI / 2);
    }
    // Marked, so the viewer can turn it back when the file is opened there.
    const root = { name, children: scene.nodes, extras: { facingRoot: true } };
    if (Math.abs(Math.sin(turn / 2)) > 1e-9) root.rotation = yaw(turn).map((value) => Math.round(value * 1e9) / 1e9);
    nodes.push(root);
    json.nodes = nodes;
    scene.nodes = [nodes.length - 1];
    scene.name = name;
  }

  return writeGlb(json, rest);
}
