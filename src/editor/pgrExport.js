/**
 * Keeps the game's toon shading in an exported .glb.
 *
 * The game's file describes its look in extras: per material the shader, its
 * textures and its render states, plus outline and other passes; per model
 * the hair physics, anchors, tags, face swaps and alternate parts. All of
 * these point at textures, materials and nodes by their index in the game's
 * file. GLTFExporter writes a new file with new indices and only the
 * textures a standard material uses, so as written those references point at
 * the wrong things or at nothing.
 *
 * This GLTFExporter plugin copies every texture the game data uses into the
 * new file, byte for byte from the source file (shadow masks live in the
 * alpha channel, and redrawing them through a canvas would destroy them),
 * copies pass materials that no mesh carries, and rewrites every index. The
 * scene gets `extras.pgrRemapped`, so the viewer knows the data can be
 * trusted when the file is opened again.
 *
 * Blender and other tools ignore all of it and see the plain materials.
 */

import { REMAPPED_MARKER } from './glbTidy.js';

const STANDARD_TEXTURE_SLOTS = [
  ['pbrMetallicRoughness', 'baseColorTexture'],
  ['pbrMetallicRoughness', 'metallicRoughnessTexture'],
  [null, 'normalTexture'],
  [null, 'occlusionTexture'],
  [null, 'emissiveTexture'],
];

const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const isIndex = (value) => Number.isInteger(value) && value >= 0;

/**
 * @param {object} options
 * @param {object} options.source  the loaded glTF the model came from (needs `.parser`)
 * @param {Map<THREE.Material, THREE.Material>} options.materialOrigins  export material → the source file's material
 */
export function createPgrExportPlugin({ source, materialOrigins }) {
  return (writer) => ({
    afterParse() {
      // Async work the writer waits for before it assembles the file.
      writer.pending.push(remap(writer, source, materialOrigins).catch((error) => {
        console.warn('[export] game shader data left out:', error);
      }));
    },
  });
}

async function remap(writer, source, materialOrigins) {
  const parser = source?.parser;
  const src = parser?.json;
  if (!src) return;
  const json = writer.json;
  const associations = parser.associations;

  /* ---- nodes: source index → new index ---- */
  const nodes = new Map();
  for (const [object, index] of writer.nodeMap) {
    const old = associations.get(object)?.nodes;
    if (isIndex(old) && !nodes.has(old)) nodes.set(old, index);
  }
  const node = (old) => (isIndex(old) && nodes.has(old) ? nodes.get(old) : null);

  /* ---- materials that meshes carry ---- */
  const materials = new Map();
  const nameToSource = new Map((src.materials ?? []).map((def, index) => [def.name, index]));
  for (const [exportMaterial, sourceMaterial] of materialOrigins) {
    const index = writer.cache.materials.get(exportMaterial);
    if (!isIndex(index)) continue;
    let old = associations.get(sourceMaterial)?.materials;
    if (!isIndex(old)) old = nameToSource.get(sourceMaterial?.name ?? exportMaterial.name);
    if (isIndex(old) && !materials.has(old)) materials.set(old, Promise.resolve(index));
  }
  const writtenByExporter = (json.materials ?? []).length;

  /* ---- textures, copied byte for byte ---- */
  const samplers = new Map();
  const sampler = (old) => {
    if (!samplers.has(old)) {
      const def = src.samplers?.[old];
      if (!def) return undefined;
      json.samplers ??= [];
      samplers.set(old, json.samplers.push(clone(def)) - 1);
    }
    return samplers.get(old);
  };
  const textures = new Map();
  const texture = (old) => {
    if (!isIndex(old)) return Promise.resolve(null);
    if (!textures.has(old)) textures.set(old, copyTexture(old));
    return textures.get(old);
  };
  async function copyTexture(old) {
    const def = src.textures?.[old];
    if (!def) return null;
    const webp = def.extensions?.EXT_texture_webp?.source;
    const imageIndex = isIndex(webp) ? webp : def.source;
    const image = src.images?.[imageIndex];
    if (!image || !isIndex(image.bufferView)) return null;
    const bytes = await parser.getDependency('bufferView', image.bufferView);
    const bufferView = await writer.processBufferViewImage(new Blob([bytes], { type: image.mimeType }));
    json.images ??= [];
    const newImage = json.images.push({ mimeType: image.mimeType, bufferView, ...(image.name ? { name: image.name } : {}) }) - 1;
    const out = {};
    if (def.name) out.name = def.name;
    const newSampler = isIndex(def.sampler) ? sampler(def.sampler) : undefined;
    if (newSampler !== undefined) out.sampler = newSampler;
    if (isIndex(webp)) {
      out.extensions = { EXT_texture_webp: { source: newImage } };
      writer.extensionsUsed.EXT_texture_webp = true;
      writer.extensionsRequired.EXT_texture_webp = true;
    } else {
      out.source = newImage;
    }
    json.textures ??= [];
    return json.textures.push(out) - 1;
  }

  /* ---- materials no mesh carries (outline and other passes, alternates) ---- */
  const material = (old) => {
    if (!isIndex(old)) return Promise.resolve(null);
    if (!materials.has(old)) materials.set(old, copyMaterial(old));
    return materials.get(old);
  };
  async function copyMaterial(old) {
    const def = clone(src.materials?.[old]);
    if (!def) return null;
    delete def.extensions;
    json.materials ??= [];
    // The index is taken before anything inside is followed, so passes that
    // point back at this material find it instead of copying it again.
    const index = json.materials.push(def) - 1;
    for (const [group, slot] of STANDARD_TEXTURE_SLOTS) {
      const holder = group ? def[group] : def;
      if (!holder?.[slot]) continue;
      const mapped = await texture(holder[slot].index);
      if (mapped === null) delete holder[slot];
      else {
        holder[slot].index = mapped;
        delete holder[slot].extensions;
      }
    }
    await remapMaterialExtras(def.extras);
    return index;
  }

  async function remapMaterialExtras(extras) {
    if (!extras) return;
    const list = extras.shader?.textures;
    if (list && typeof list === 'object') {
      for (const key of Object.keys(list)) {
        const mapped = await texture(list[key]?.index);
        if (mapped === null) delete list[key];
        else list[key].index = mapped;
      }
    }
    if (Array.isArray(extras.passes)) {
      const passes = await Promise.all(extras.passes.map(material));
      extras.passes = passes.filter(isIndex);
    }
  }

  // The exporter wrote the mesh materials with the source file's extras.
  for (let i = 0; i < writtenByExporter; i++) {
    const def = json.materials[i];
    if (def.extras?.shader) await remapMaterialExtras(def.extras);
  }

  /* ---- model data on the scene ---- */
  const sceneExtras = clone(src.scenes?.[src.scene ?? 0]?.extras) ?? {};
  const out = await remapModelExtras(sceneExtras, { node, material, texture });
  out[REMAPPED_MARKER] = 1;
  const scene = json.scenes?.[json.scene ?? 0];
  if (scene) scene.extras = { ...(scene.extras ?? {}), ...out };
}

/** Rewrites the model extras the toon pipeline reads; keys it does not know are left out. */
async function remapModelExtras(extras, { node, material, texture }) {
  const out = {};
  if (extras.formatVersion !== undefined) out.formatVersion = extras.formatVersion;
  if (extras.selfShadow) out.selfShadow = extras.selfShadow;

  if (extras.anchors) out.anchors = { head: node(extras.anchors.head), body: node(extras.anchors.body) };

  if (Array.isArray(extras.objectTags)) {
    out.objectTags = extras.objectTags
      .map((tag) => ({ ...tag, nodes: (tag.nodes ?? []).map(node).filter(isIndex) }))
      .filter((tag) => tag.nodes.length);
  }

  if (extras.faces && isIndex(node(extras.faces.node))) {
    const faceTextures = await Promise.all((extras.faces.textures ?? []).map(texture));
    out.faces = { ...extras.faces, node: node(extras.faces.node), textures: faceTextures.filter(isIndex) };
  }

  if (extras.alternates) {
    const alternates = {};
    if (extras.alternates.initial !== undefined) alternates.initial = extras.alternates.initial;
    if (Array.isArray(extras.alternates.parts)) {
      alternates.parts = [];
      for (const part of extras.alternates.parts) {
        const entries = [];
        for (const entry of part.entries ?? []) {
          if (!isIndex(node(entry.node))) continue;
          const next = { ...entry, node: node(entry.node) };
          if (entry.material !== undefined) {
            const mapped = await material(entry.material);
            if (isIndex(mapped)) next.material = mapped;
            else delete next.material;
          }
          entries.push(next);
        }
        if (entries.length) alternates.parts.push({ ...part, entries });
      }
    }
    if (Array.isArray(extras.alternates.hairFade)) {
      alternates.hairFade = [];
      for (const row of extras.alternates.hairFade) {
        const rowNode = node(row.node);
        const checkNode = node(row.checkNode);
        const rowMaterial = await material(row.material);
        if (![rowNode, checkNode, rowMaterial].every(isIndex)) continue;
        const eyes = [];
        for (const eye of row.eyes ?? []) {
          if (!isIndex(node(eye.node))) continue;
          eyes.push({ node: node(eye.node), mask: eye.mask === null ? null : await texture(eye.mask) });
        }
        const next = { ...row, node: rowNode, checkNode, material: rowMaterial, eyes };
        if (row.additional) {
          const extraNode = node(row.additional.node);
          const extraMaterial = await material(row.additional.material);
          if (isIndex(extraNode) && isIndex(extraMaterial)) next.additional = { node: extraNode, material: extraMaterial };
          else delete next.additional;
        }
        alternates.hairFade.push(next);
      }
    }
    out.alternates = alternates;
  }

  if (extras.springBones) {
    const colliderIndex = new Map();
    const colliders = [];
    (extras.springBones.colliders ?? []).forEach((collider, index) => {
      const mapped = node(collider.node);
      if (!isIndex(mapped)) return;
      colliderIndex.set(index, colliders.length);
      colliders.push({ ...collider, node: mapped });
    });
    const chains = [];
    for (const chain of extras.springBones.chains ?? []) {
      const chainNode = node(chain.node);
      const root = node(chain.root);
      if (!isIndex(chainNode) || !isIndex(root)) continue;
      const next = { ...chain, node: chainNode, root };
      if (chain.exclusions) next.exclusions = chain.exclusions.map(node).filter(isIndex);
      if (chain.colliders) next.colliders = chain.colliders.map((i) => colliderIndex.get(i)).filter(isIndex);
      chains.push(next);
    }
    out.springBones = { presets: extras.springBones.presets ?? [], chains, colliders };
  }
  return out;
}
