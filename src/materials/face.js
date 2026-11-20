import * as THREE from 'three';
import {
  Cs,
  Wo,
  fs,
  nu,
  ru,
  au,
  Vh,
  Hh,
  cg,
} from './pgrToon.js';

export const HAIR_STENCIL_ORDER = {
  eye: 2350,
  eyeStencil: 2360,
  hair: 2370,
  transparent: 2380,
};

export const EYE_STENCIL_REF = 2;
const TAN_30_DEG = Math.tan(Math.PI / 6);
const FADE_DISTANCE_SCALE = 0.75;

export function maxFadeDistanceForFov(fov, fadeDistance) {
  return (fadeDistance * FADE_DISTANCE_SCALE * TAN_30_DEG) / Math.tan((fov * Math.PI) / 360);
}

export function shouldShowHairFade(fov, distance, fadeDistance) {
  return distance <= maxFadeDistanceForFov(fov, fadeDistance);
}

function setHairStencilTest(material, stencilFunc) {
  material.stencilWrite = true;
  material.stencilFunc = stencilFunc;
  material.stencilRef = EYE_STENCIL_REF;
  material.stencilFuncMask = EYE_STENCIL_REF;
  material.stencilWriteMask = 0;
}

export function applyHairStencilNotEqual(material) {
  setHairStencilTest(material, THREE.NotEqualStencilFunc); // 517
}

export function applyHairStencilEqual(material) {
  setHairStencilTest(material, THREE.EqualStencilFunc); // 514
}

const EYE_STENCIL_MASK_FRAGMENT = `
vec4 pgrMask = texture2D(map, vMapUv);
if (pgrMask.r < 0.5) discard;
`;

export function createEyeStencilMaterial(maskTexture) {
  const material = new THREE.MeshBasicMaterial({
    name: 'pgr-eye-stencil',
    map: maskTexture,
    side: THREE.FrontSide,
    colorWrite: false,
    depthWrite: false,
    stencilWrite: true,
    stencilFunc: THREE.AlwaysStencilFunc, // 519
    stencilRef: EYE_STENCIL_REF,
    stencilFuncMask: EYE_STENCIL_REF,
    stencilWriteMask: EYE_STENCIL_REF,
    stencilZPass: THREE.ReplaceStencilOp,
  });
  if (maskTexture) {
    material.customProgramCacheKey = () => 'pgr-eye-stencil';
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = Cs(shader.fragmentShader, 'map_fragment', EYE_STENCIL_MASK_FRAGMENT);
    };
  }
  return material;
}

const _targetPos = new THREE.Vector3();

export function updateHairFades(hairFades, fov, cameraWorldPos, fallbackCenter) {
  for (const entry of hairFades) {
    for (const s of entry.stencils) s.visible = false;
  }
  for (const entry of hairFades) {
    if (entry.target) {
      _targetPos.setFromMatrixPosition(entry.target.matrixWorld);
    } else if (fallbackCenter) {
      _targetPos.copy(fallbackCenter);
    }
    const visible =
      (entry.target !== null || fallbackCenter !== null) &&
      shouldShowHairFade(fov, cameraWorldPos.distanceTo(_targetPos), entry.fadeDistance);
    for (const copy of entry.copies) copy.visible = visible;
    if (visible) {
      for (const s of entry.stencils) s.visible = true;
    }
  }
}

export async function buildHairFades(gltf, hairFades, sources, nodes, context) {
  const stencilByNode = new Map();
  const rows = await Promise.all(
    hairFades.map(async (row) => {
      const pairs = [row, ...(row.additional ? [row.additional] : [])].flatMap((item) => {
        const mesh = Hh(nodes, item.node);
        return mesh ? [{ mesh, material: item.material }] : [];
      });
      if (pairs.length === 0) return null;
      const [materials, masks] = await Promise.all([
        Promise.all(
          pairs.map(({ mesh, material }) => cg(gltf, material, mesh, sources.get(mesh), context)),
        ),
        Promise.all(row.eyes.map((eye) => context.loadTexture(eye.mask, 'none'))),
      ]);
      return {
        row,
        hairs: pairs.map(({ mesh }, idx) => ({ mesh, material: materials[idx] })),
        masks,
      };
    }),
  );

  const result = [];
  for (const item of rows) {
    if (!item) continue;
    const { row, hairs, masks } = item;
    const copies = hairs.map(({ mesh, material }) => {
      applyHairStencilEqual(material);
      nu(mesh).forEach((m) => applyHairStencilNotEqual(m));
      mesh.renderOrder = HAIR_STENCIL_ORDER.hair;
      const copy = au(mesh, material, HAIR_STENCIL_ORDER.transparent, 'fade');
      copy.receiveShadow = mesh.receiveShadow;
      copy.visible = false;
      return copy;
    });
    const stencils = [];
    for (const [idx, eye] of row.eyes.entries()) {
      let stencil = stencilByNode.get(eye.node);
      if (!stencil) {
        const eyeMesh = Hh(nodes, eye.node);
        const maskTex = masks[idx] ?? null;
        if (!eyeMesh || (eye.mask !== null && !maskTex)) continue;
        eyeMesh.renderOrder = HAIR_STENCIL_ORDER.eye;
        stencil = au(eyeMesh, createEyeStencilMaterial(maskTex), HAIR_STENCIL_ORDER.eyeStencil, 'stencil');
        stencil.receiveShadow = false;
        stencil.visible = false;
        stencilByNode.set(eye.node, stencil);
      }
      stencils.push(stencil);
    }
    result.push({
      stencils,
      copies,
      target: nodes.get(row.checkNode) ?? null,
      fadeDistance: row.fadeDistance,
    });
  }
  return result;
}

export function setupFaceShadowAxes(gltf, meshes, shaded, nodes, partSwaps) {
  const json = gltf.parser.json;
  for (const mesh of meshes) {
    const swapMats = partSwaps.sets.flatMap((set) =>
      set.entries.flatMap((entry) => (entry.mesh === mesh && entry.material ? [entry.material] : [])),
    );
    const axesList = [...nu(mesh), ...swapMats]
      .map((mat) => shaded.get(mat)?.objectAxes)
      .filter((axes) => axes != null);
    if (axesList.length === 0) continue;

    const assocNode = Vh(gltf, mesh);
    const nodeIdx = assocNode ? gltf.parser.associations.get(assocNode)?.nodes : undefined;
    const skinIdx = nodeIdx === undefined ? undefined : json.nodes?.[nodeIdx]?.skin;
    const skeletonRootIdx = skinIdx === undefined ? undefined : json.skins?.[skinIdx]?.skeleton;
    const basisNode = (skeletonRootIdx === undefined ? null : nodes.get(skeletonRootIdx)) ?? mesh;

    mesh.onBeforeRender = () => {
      for (const { y, z } of axesList) {
        y.value.setFromMatrixColumn(basisNode.matrixWorld, 1).normalize();
        z.value.setFromMatrixColumn(basisNode.matrixWorld, 2).normalize();
      }
    };
  }
}

export const FACE_EVENT_NAMES = [
  'FrameEventFaceTex',
  'ChangeFaceTex',
  'OnEnterState',
  'FrameEventFaceName',
];

function collectFaceMeshes(node, allNodesSet) {
  return ru(node).filter((m) => m === node || !allNodesSet.has(m));
}

function collectFaceUniforms(root, targetMeshes, shaded, defaultsMap, warnedSet) {
  const sharedMaterials = new Set();
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && !targetMeshes.includes(obj)) {
      nu(obj).forEach((m) => sharedMaterials.add(m));
    }
  });
  return targetMeshes.flatMap((mesh) =>
    nu(mesh).flatMap((mat) => {
      const faceUniform = shaded.get(mat)?.faceMap;
      if (!faceUniform) return [];
      if (sharedMaterials.has(mat)) {
        if (!warnedSet.has(mat)) console.warn(`Face swap skips shared material ${mat.name}`);
        warnedSet.add(mat);
        return [];
      }
      if (!defaultsMap.has(faceUniform)) defaultsMap.set(faceUniform, faceUniform.value);
      return [faceUniform];
    }),
  );
}

export function createFaceSwapper(facesConfig, context) {
  const { root, nodes, shaded, textures } = context;
  const targetNode = nodes.get(facesConfig.node);
  if (!targetNode) return null;
  const targetMeshes = collectFaceMeshes(targetNode, new Set(nodes.values()));
  const defaultsMap = new Map();
  const warnedSet = new Set();
  let uniforms = collectFaceUniforms(root, targetMeshes, shaded, defaultsMap, warnedSet);
  let disposed = false;
  const ownedTextures = new Set();
  let activeTex = null;
  let token = 0;
  let state = { slot: null, texture: null, event: null };

  const cache = Wo(async (texIdx) => {
    const tex = await context.loadTexture(texIdx);
    if (!tex) return null;
    if (disposed) {
      if (!textures.has(tex)) tex.dispose();
      return null;
    }
    if (!textures.has(tex)) ownedTextures.add(tex);
    return tex;
  });

  const loadSlotTex = (texIdx) => (disposed ? Promise.resolve(null) : cache.get(texIdx));
  const restoreDefaults = () => {
    for (const [u, defVal] of defaultsMap) u.value = defVal;
  };
  const applyCurrent = () => {
    restoreDefaults();
    if (activeTex) {
      for (const u of uniforms) u.value = activeTex;
    }
  };
  const resetState = () => {
    token++;
    activeTex = null;
    restoreDefaults();
    state = { slot: null, texture: null, event: null };
  };
  const selectSlot = (slot, event) => {
    const texIdx = facesConfig.textures[slot];
    if (texIdx === undefined) return;
    const req = ++token;
    loadSlotTex(texIdx)
      .then((tex) => {
        if (req !== token || !tex) return;
        activeTex = tex;
        applyCurrent();
        state = { slot, texture: texIdx, event };
      })
      .catch((err) => {
        console.warn(`Face texture ${texIdx}: ${fs(err)}`);
      });
  };

  let locked = false;
  const handler = {
    replay: true,
    reset() {
      locked = false;
      resetState();
    },
    enter(info) {
      locked = info?.faceLock ?? false;
      if (!info?.faceKeep) {
        resetState();
        if (info?.face !== undefined) selectSlot(info.face, null);
      }
    },
    apply(event) {
      if (!locked && event.face !== undefined) selectSlot(event.face, event);
    },
    async preload(event) {
      const texIdx = event.face === undefined ? undefined : facesConfig.textures[event.face];
      if (texIdx !== undefined) await loadSlotTex(texIdx);
    },
  };

  return {
    handler,
    readout: () => state,
    refresh() {
      uniforms = collectFaceUniforms(root, targetMeshes, shaded, defaultsMap, warnedSet);
      applyCurrent();
    },
    dispose() {
      handler.reset?.();
      disposed = true;
      cache.clear();
      ownedTextures.forEach((t) => t.dispose());
      ownedTextures.clear();
    },
  };
}
