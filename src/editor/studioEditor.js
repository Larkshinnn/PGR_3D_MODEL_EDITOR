import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import {
  compilePgrModel,
  DEFAULT_PGR_LIGHTING,
  xs,
  ou,
} from '../materials/pgrToon.js';
import { cloneCompactGeometry } from './meshEdit.js';
import { tidyGlb } from './glbTidy.js';
import { opaqueTextureCopy } from './texturePixels.js';
import { createPgrExportPlugin } from './pgrExport.js';

export const COLOR_PALETTES = [
  {
    id: 'azure-cyber',
    name: 'Biru',
    swatch: '#2cb8ff',
    albedo: '#cceeff',
    globalTint: '#88ddff',
    shadow1: '#3a7ca5',
    shadow2: '#1d3e5e',
    rim: '#44ddff',
    hueShift: -145,
    satShift: 15,
  },
  {
    id: 'violet-abyss',
    name: 'Ungu',
    swatch: '#a855f7',
    albedo: '#f0d9ff',
    globalTint: '#d8b4fe',
    shadow1: '#6b3fa0',
    shadow2: '#3b1d66',
    rim: '#c084fc',
    hueShift: -85,
    satShift: 10,
  },
  {
    id: 'emerald-valkyrie',
    name: 'Hijau',
    swatch: '#10b981',
    albedo: '#d1fae5',
    globalTint: '#6ee7b7',
    shadow1: '#2d7a5e',
    shadow2: '#134e3a',
    rim: '#34d399',
    hueShift: 135,
    satShift: 10,
  },
  {
    id: 'solar-gold',
    name: 'Emas',
    swatch: '#f59e0b',
    albedo: '#fef3c7',
    globalTint: '#fde68a',
    shadow1: '#b46924',
    shadow2: '#78350f',
    rim: '#fbbf24',
    hueShift: 38,
    satShift: 15,
  },
  {
    id: 'sakura-pearl',
    name: 'Pink',
    swatch: '#f472b6',
    albedo: '#fce7f3',
    globalTint: '#fbcfe8',
    shadow1: '#be4b82',
    shadow2: '#831843',
    rim: '#f9a8d4',
    hueShift: -30,
    satShift: 5,
  },
  {
    id: 'crimson-eclipse',
    name: 'Merah',
    swatch: '#ef4444',
    albedo: '#ffe4e6',
    globalTint: '#fca5a5',
    shadow1: '#991b1b',
    shadow2: '#450a0a',
    rim: '#f87171',
    hueShift: 0,
    satShift: 25,
  },
];

export const BUILTIN_PROPS = [
  { id: 'halo', name: 'Halo', defaultSocket: 'head' },
  { id: 'crown', name: 'Mahkota', defaultSocket: 'head' },
  { id: 'wings', name: 'Sayap', defaultSocket: 'chest' },
  { id: 'katana', name: 'Katana', defaultSocket: 'rightHand' },
  { id: 'orb', name: 'Orb', defaultSocket: 'leftHand' },
  { id: 'cube', name: 'Kubus', defaultSocket: 'root' },
  { id: 'sphere', name: 'Bola', defaultSocket: 'root' },
  { id: 'torus', name: 'Torus', defaultSocket: 'root' },
];

/**
 * The inverted-hull outline pass of a mesh. The shader pipeline adds it as a
 * child named '<mesh> outline'; nothing marks it in userData.
 */
export function findOutlineChild(mesh) {
  return mesh?.children.find((child) => child.isMesh && child.material?.name === 'pgr-outline') ?? null;
}

const initialMeshSnapshot = new WeakMap();
const originalTextureCache = new WeakMap();

export function snapshotMeshMaterialState(mesh) {
  if (!mesh || initialMeshSnapshot.has(mesh)) return;
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (!mat) return;
  const u = mat.userData?.pgrUniforms;
  const outlineChild = findOutlineChild(mesh);
  const ouUniforms = outlineChild?.material?.uniforms;

  if (mat.map && !originalTextureCache.has(mesh)) {
    originalTextureCache.set(mesh, mat.map);
  }

  initialMeshSnapshot.set(mesh, {
    color: mat.color ? mat.color.clone() : new THREE.Color(1, 1, 1),
    wireframe: Boolean(mat.wireframe),
    pgrGlobalTint: u?.pgrGlobalTint?.value?.clone(),
    pgrNoShadow: u?.pgrNoShadow?.value?.clone(),
    pgrOneShadow: u?.pgrOneShadow?.value?.clone(),
    pgrTwoShadow: u?.pgrTwoShadow?.value?.clone(),
    pgrFirst: u?.pgrFirst?.value,
    pgrSmooth: u?.pgrSmooth?.value,
    pgrRimColor: u?.pgrRimColor?.value?.clone(),
    pgrRimIntensity: u?.pgrRimIntensity?.value,
    pgrRimOn: u?.pgrRimOn?.value,
    pgrBloomFactor: u?.pgrBloomWeights?.value?.x,
    outlineColor: ouUniforms?.pgrBand1?.value?.clone(),
    outlineWidth: ouUniforms?.pgrWidth?.value,
    outlineVisible: outlineChild ? outlineChild.visible : true,
    position: mesh.position.clone(),
    quaternion: mesh.quaternion.clone(),
    scale: mesh.scale.clone(),
  });
}

export function getMeshMaterialState(mesh) {
  if (!mesh) return null;
  snapshotMeshMaterialState(mesh);
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (!mat) return null;
  const u = mat.userData?.pgrUniforms;
  const outlineChild = findOutlineChild(mesh);
  const ouUniforms = outlineChild?.material?.uniforms;

  return {
    albedoHex: `#${(mat.color || new THREE.Color(1, 1, 1)).getHexString()}`,
    globalTintHex: `#${(u?.pgrGlobalTint?.value || new THREE.Color(1, 1, 1)).getHexString()}`,
    shadow1Hex: `#${(u?.pgrOneShadow?.value || new THREE.Color(0.7, 0.65, 0.68)).getHexString()}`,
    shadow2Hex: `#${(u?.pgrTwoShadow?.value || new THREE.Color(0.5, 0.45, 0.5)).getHexString()}`,
    rimHex: `#${(u?.pgrRimColor?.value || new THREE.Color(1, 1, 1)).getHexString()}`,
    rimIntensity: u?.pgrRimIntensity?.value ?? 0.35,
    celThreshold: u?.pgrFirst?.value ?? 0.5,
    celSmooth: u?.pgrSmooth?.value ?? 0.05,
    bloomFactor: u?.pgrBloomWeights?.value?.x ?? 0.1,
    outlineHex: `#${(ouUniforms?.pgrBand1?.value || new THREE.Color(0.12, 0.08, 0.08)).getHexString()}`,
    outlineWidth: ouUniforms?.pgrWidth?.value ?? 0.25,
    outlineVisible: outlineChild ? outlineChild.visible : false,
    hasOutline: Boolean(outlineChild),
    wireframe: Boolean(mat.wireframe),
    hueShift: mesh.userData.hueShift ?? 0,
    satShift: mesh.userData.satShift ?? 0,
    lightShift: mesh.userData.lightShift ?? 0,
  };
}

export function applyMeshMaterialProperty(mesh, prop, value) {
  if (!mesh) return;
  snapshotMeshMaterialState(mesh);
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const outlineChild = findOutlineChild(mesh);
  const ouUniforms = outlineChild?.material?.uniforms;

  for (const mat of materials) {
    if (!mat) continue;
    const u = mat.userData?.pgrUniforms;

    switch (prop) {
      case 'albedoHex':
        if (mat.color) mat.color.set(value);
        break;
      case 'globalTintHex':
        if (u?.pgrGlobalTint?.value) u.pgrGlobalTint.value.set(value);
        else if (mat.color) mat.color.set(value);
        break;
      case 'shadow1Hex':
        if (u?.pgrOneShadow?.value) u.pgrOneShadow.value.set(value);
        break;
      case 'shadow2Hex':
        if (u?.pgrTwoShadow?.value) u.pgrTwoShadow.value.set(value);
        break;
      case 'rimHex':
        if (u?.pgrRimColor?.value) {
          u.pgrRimColor.value.set(value);
          if (u.pgrRimOn) u.pgrRimOn.value = 1;
        }
        break;
      case 'rimIntensity':
        if (u?.pgrRimIntensity) {
          u.pgrRimIntensity.value = Number(value);
          if (u.pgrRimOn) u.pgrRimOn.value = Number(value) > 0.001 ? 1 : 0;
        }
        break;
      case 'celThreshold':
        if (u?.pgrFirst) u.pgrFirst.value = Number(value);
        break;
      case 'celSmooth':
        if (u?.pgrSmooth) u.pgrSmooth.value = Math.max(0.001, Number(value));
        break;
      case 'bloomFactor':
        if (u?.pgrBloomWeights?.value) u.pgrBloomWeights.value.x = Number(value);
        break;
      case 'wireframe':
        mat.wireframe = Boolean(value);
        break;
      default:
        break;
    }
  }

  if (prop === 'outlineHex' && ouUniforms) {
    for (const band of ['pgrBand1', 'pgrBand2', 'pgrBand3', 'pgrBand4', 'pgrBand5']) {
      if (ouUniforms[band]?.value) ouUniforms[band].value.set(value);
    }
  } else if (prop === 'outlineWidth' && ouUniforms?.pgrWidth) {
    ouUniforms.pgrWidth.value = Number(value);
  } else if (prop === 'outlineVisible' && outlineChild) {
    outlineChild.visible = Boolean(value);
  }
}

export function applyMeshTextureHSL(mesh, hueDeg = 0, satPct = 0, lightPct = 0) {
  if (!mesh) return;
  snapshotMeshMaterialState(mesh);
  mesh.userData.hueShift = hueDeg;
  mesh.userData.satShift = satPct;
  mesh.userData.lightShift = lightPct;

  const origTex = originalTextureCache.get(mesh);
  if (!origTex || !origTex.image) return;

  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

  if (Math.abs(hueDeg) < 0.5 && Math.abs(satPct) < 0.5 && Math.abs(lightPct) < 0.5) {
    for (const mat of materials) {
      if (mat && 'map' in mat) {
        mat.map = origTex;
        mat.needsUpdate = true;
      }
    }
    return;
  }

  const img = origTex.image;
  const w = Math.min(img.width || 512, 1024);
  const h = Math.min(img.height || 512, 1024);

  let canvas = mesh.userData._recolorCanvas;
  if (!canvas) {
    canvas = document.createElement('canvas');
    mesh.userData._recolorCanvas = canvas;
  }
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  const hShift = ((hueDeg % 360) + 360) % 360;
  const sMult = Math.max(0, 1 + satPct / 100);
  const lOffset = lightPct / 100;

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255;
    const g = d[i + 1] / 255;
    const b = d[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let l = (max + min) * 0.5;

    // Skip near-black or near-white lace/eyes details so contrast stays crisp
    if (delta < 0.04 && (l < 0.12 || l > 0.94)) continue;

    let hVal = 0;
    let sVal = 0;
    if (delta > 0) {
      sVal = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
      if (max === r) hVal = ((g - b) / delta + (g < b ? 6 : 0)) * 60;
      else if (max === g) hVal = ((b - r) / delta + 2) * 60;
      else hVal = ((r - g) / delta + 4) * 60;
    }

    hVal = (hVal + hShift) % 360;
    sVal = Math.min(1, Math.max(0, sVal * sMult));
    l = Math.min(1, Math.max(0, l + lOffset));

    const c = (1 - Math.abs(2 * l - 1)) * sVal;
    const x = c * (1 - Math.abs(((hVal / 60) % 2) - 1));
    const m = l - c * 0.5;
    let r1 = 0;
    let g1 = 0;
    let b1 = 0;
    if (hVal < 60) [r1, g1, b1] = [c, x, 0];
    else if (hVal < 120) [r1, g1, b1] = [x, c, 0];
    else if (hVal < 180) [r1, g1, b1] = [0, c, x];
    else if (hVal < 240) [r1, g1, b1] = [0, x, c];
    else if (hVal < 300) [r1, g1, b1] = [x, 0, c];
    else [r1, g1, b1] = [c, 0, x];

    d[i] = Math.round((r1 + m) * 255);
    d[i + 1] = Math.round((g1 + m) * 255);
    d[i + 2] = Math.round((b1 + m) * 255);
  }

  ctx.putImageData(imgData, 0, 0);

  let recolorTex = mesh.userData._recolorTexture;
  if (!recolorTex) {
    recolorTex = new THREE.CanvasTexture(canvas);
    recolorTex.flipY = origTex.flipY;
    recolorTex.wrapS = origTex.wrapS;
    recolorTex.wrapT = origTex.wrapT;
    recolorTex.colorSpace = THREE.SRGBColorSpace;
    mesh.userData._recolorTexture = recolorTex;
  }
  recolorTex.needsUpdate = true;

  for (const mat of materials) {
    if (mat && 'map' in mat) {
      mat.map = recolorTex;
      mat.needsUpdate = true;
    }
  }
}

export function resetMeshMaterialState(mesh) {
  if (!mesh) return;
  const snap = initialMeshSnapshot.get(mesh);
  if (!snap) return;

  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const origTex = originalTextureCache.get(mesh);

  for (const mat of materials) {
    if (!mat) continue;
    if (mat.color && snap.color) mat.color.copy(snap.color);
    mat.wireframe = snap.wireframe;
    if (origTex && 'map' in mat) {
      mat.map = origTex;
      mat.needsUpdate = true;
    }
    const u = mat.userData?.pgrUniforms;
    if (u) {
      if (snap.pgrGlobalTint && u.pgrGlobalTint?.value) u.pgrGlobalTint.value.copy(snap.pgrGlobalTint);
      if (snap.pgrNoShadow && u.pgrNoShadow?.value) u.pgrNoShadow.value.copy(snap.pgrNoShadow);
      if (snap.pgrOneShadow && u.pgrOneShadow?.value) u.pgrOneShadow.value.copy(snap.pgrOneShadow);
      if (snap.pgrTwoShadow && u.pgrTwoShadow?.value) u.pgrTwoShadow.value.copy(snap.pgrTwoShadow);
      if (snap.pgrFirst !== undefined && u.pgrFirst) u.pgrFirst.value = snap.pgrFirst;
      if (snap.pgrSmooth !== undefined && u.pgrSmooth) u.pgrSmooth.value = snap.pgrSmooth;
      if (snap.pgrRimColor && u.pgrRimColor?.value) u.pgrRimColor.value.copy(snap.pgrRimColor);
      if (snap.pgrRimIntensity !== undefined && u.pgrRimIntensity) u.pgrRimIntensity.value = snap.pgrRimIntensity;
      if (snap.pgrRimOn !== undefined && u.pgrRimOn) u.pgrRimOn.value = snap.pgrRimOn;
      if (snap.pgrBloomFactor !== undefined && u.pgrBloomWeights?.value) {
        u.pgrBloomWeights.value.x = snap.pgrBloomFactor;
      }
    }
  }

  const outlineChild = findOutlineChild(mesh);
  if (outlineChild) {
    outlineChild.visible = snap.outlineVisible;
    const ouUniforms = outlineChild.material?.uniforms;
    if (ouUniforms && snap.outlineColor) {
      for (const band of ['pgrBand1', 'pgrBand2', 'pgrBand3', 'pgrBand4', 'pgrBand5']) {
        if (ouUniforms[band]?.value) ouUniforms[band].value.copy(snap.outlineColor);
      }
    }
    if (ouUniforms?.pgrWidth && snap.outlineWidth !== undefined) {
      ouUniforms.pgrWidth.value = snap.outlineWidth;
    }
  }

  mesh.userData.hueShift = 0;
  mesh.userData.satShift = 0;
  mesh.userData.lightShift = 0;
}

export function applyColorPaletteToMesh(mesh, palette) {
  if (!mesh || !palette) return;
  applyMeshMaterialProperty(mesh, 'albedoHex', palette.albedo);
  applyMeshMaterialProperty(mesh, 'globalTintHex', palette.globalTint);
  applyMeshMaterialProperty(mesh, 'shadow1Hex', palette.shadow1);
  applyMeshMaterialProperty(mesh, 'shadow2Hex', palette.shadow2);
  applyMeshMaterialProperty(mesh, 'rimHex', palette.rim);
  applyMeshTextureHSL(mesh, palette.hueShift || 0, palette.satShift || 0, 0);
}

export function serializeMeshMaterialEdits(mesh) {
  if (!mesh) return null;
  const state = getMeshMaterialState(mesh);
  if (!state) return null;
  const snap = initialMeshSnapshot.get(mesh);
  const changed =
    !snap ||
    state.hueShift !== 0 ||
    state.satShift !== 0 ||
    state.lightShift !== 0 ||
    state.wireframe !== Boolean(snap.wireframe) ||
    state.outlineVisible !== Boolean(snap.outlineVisible) ||
    (snap.color && state.albedoHex !== `#${snap.color.getHexString()}`) ||
    (snap.pgrGlobalTint && state.globalTintHex !== `#${snap.pgrGlobalTint.getHexString()}`) ||
    (snap.pgrOneShadow && state.shadow1Hex !== `#${snap.pgrOneShadow.getHexString()}`) ||
    (snap.pgrTwoShadow && state.shadow2Hex !== `#${snap.pgrTwoShadow.getHexString()}`) ||
    (snap.pgrRimColor && state.rimHex !== `#${snap.pgrRimColor.getHexString()}`) ||
    (snap.outlineColor && state.outlineHex !== `#${snap.outlineColor.getHexString()}`) ||
    Math.abs((state.rimIntensity ?? 0) - (snap.pgrRimIntensity ?? 0)) > 1e-4 ||
    Math.abs((state.celThreshold ?? 0) - (snap.pgrFirst ?? 0)) > 1e-4 ||
    Math.abs((state.celSmooth ?? 0) - (snap.pgrSmooth ?? 0)) > 1e-4 ||
    Math.abs((state.bloomFactor ?? 0) - (snap.pgrBloomFactor ?? 0)) > 1e-4 ||
    Math.abs((state.outlineWidth ?? 0) - (snap.outlineWidth ?? 0)) > 1e-4;
  return changed ? state : null;
}

export function applyMeshMaterialEdits(mesh, state) {
  if (!mesh || !state) return;
  snapshotMeshMaterialState(mesh);
  for (const key of [
    'albedoHex',
    'globalTintHex',
    'shadow1Hex',
    'shadow2Hex',
    'rimHex',
    'rimIntensity',
    'celThreshold',
    'celSmooth',
    'bloomFactor',
    'outlineHex',
    'outlineWidth',
    'outlineVisible',
    'wireframe',
  ]) {
    if (state[key] !== undefined) applyMeshMaterialProperty(mesh, key, state[key]);
  }
  if (state.hueShift || state.satShift || state.lightShift) {
    applyMeshTextureHSL(mesh, state.hueShift || 0, state.satShift || 0, state.lightShift || 0);
  }
}

/* ------------------------------------------------------------------ */
/* Bone Socket Discovery                                              */
/* ------------------------------------------------------------------ */

export function findBoneByRawName(root, rawName) {
  if (!root || !rawName) return null;
  let found = null;
  root.traverse((obj) => {
    if (found) return;
    const name = (obj.userData?.originalName || obj.name || '').trim();
    if (name === rawName) found = obj;
  });
  return found;
}

export function findCharacterSockets(root) {
  const sockets = {
    root,
    head: null,
    neck: null,
    chest: null,
    pelvis: null,
    leftHand: null,
    rightHand: null,
    weapon1: null,
    weapon2: null,
  };

  const allBones = [];
  root.traverse((obj) => {
    const rawName = obj.userData?.originalName || obj.name || '';
    if (obj.isBone || /Bip001|WeaponCase|Bone/i.test(rawName)) {
      allBones.push({ obj, name: rawName });
    }
    if (/Bip001\s*Head$/i.test(rawName) && !sockets.head) sockets.head = obj;
    else if (/Bip001\s*Neck$/i.test(rawName) && !sockets.neck) sockets.neck = obj;
    else if (/Bip001\s*Spine2$/i.test(rawName) && !sockets.chest) sockets.chest = obj;
    else if (/Bip001\s*Spine1$/i.test(rawName) && !sockets.chest) sockets.chest = obj;
    else if (/Bip001\s*Pelvis$/i.test(rawName) && !sockets.pelvis) sockets.pelvis = obj;
    else if (/Bip001\s*L\s*Hand$/i.test(rawName) && !sockets.leftHand) sockets.leftHand = obj;
    else if (/Bip001\s*R\s*Hand$/i.test(rawName) && !sockets.rightHand) sockets.rightHand = obj;
    else if (/WeaponCase1$/i.test(rawName) && !sockets.weapon1) sockets.weapon1 = obj;
    else if (/WeaponCase2$/i.test(rawName) && !sockets.weapon2) sockets.weapon2 = obj;
  });

  return { sockets, allBones };
}

/* ------------------------------------------------------------------ */
/* Kitbash: Donor PGR Character Loader & Auto-Rigging                 */
/* ------------------------------------------------------------------ */

const donorModelCache = new Map();

export async function loadDonorCharacterModel(baseUrl, cubemaps) {
  if (donorModelCache.has(baseUrl)) return donorModelCache.get(baseUrl);

  const loader = new GLTFLoader();
  const manifestRes = await fetch(`${baseUrl}manifest.json`, { mode: 'cors', cache: 'force-cache' });
  const manifest = manifestRes.ok ? await manifestRes.json() : { model: 'base.glb' };
  const modelFile = manifest.model || 'base.glb';

  const gltf = await new Promise((resolve, reject) => {
    loader.load(`${baseUrl}${modelFile}`, resolve, undefined, reject);
  });

  // Preserve original bone/node names before compilation
  gltf.scene.traverse((obj) => {
    if (!obj.userData.originalName) obj.userData.originalName = obj.name;
  });

  const pgrDonor = await compilePgrModel(gltf, {
    cubemaps,
    lighting: DEFAULT_PGR_LIGHTING,
  });

  const donorParts = pgrDonor.meshes.map((mesh, idx) => ({
    index: idx,
    mesh,
    label: cleanMeshLabel(mesh),
  }));

  const entry = { gltf, pgrDonor, donorParts };
  donorModelCache.set(baseUrl, entry);
  return entry;
}

function cleanMeshLabel(mesh) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  let name = mats.find(Boolean)?.name || mesh.userData?.originalName || mesh.name || 'Mesh';
  name = name
    .replace(/^[A-Z]\d[A-Za-z]+Md\d+/i, '')
    .replace(/Md\d+/gi, '')
    .replace(/VC$/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim();
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : `Part ${mesh.id}`;
}

/**
 * Equips a mesh part from a donor PGR character onto the current host character.
 * Supports automatic bone retargeting (`bindMode = 'skeleton'`) so clothing, hair,
 * and accessories animate seamlessly with the host character!
 */
export function equipDonorMeshOnHost(donorMesh, hostRoot, { bindMode = 'skeleton', socketNode = null } = {}) {
  const hostBonesByName = new Map();
  hostRoot.traverse((obj) => {
    const rawName = (obj.userData?.originalName || obj.name || '').trim();
    if (rawName && (obj.isBone || !hostBonesByName.has(rawName))) {
      hostBonesByName.set(rawName, obj);
    }
  });

  const cloned = donorMesh.clone(false);
  cloned.geometry = donorMesh.geometry;
  cloned.material = Array.isArray(donorMesh.material)
    ? donorMesh.material.map((m) => m)
    : donorMesh.material;
  cloned.renderOrder = donorMesh.renderOrder;
  cloned.castShadow = donorMesh.castShadow;
  cloned.receiveShadow = donorMesh.receiveShadow;
  cloned.customDepthMaterial = donorMesh.customDepthMaterial;
  cloned.frustumCulled = false;
  cloned.visible = true;
  cloned.userData = {
    ...donorMesh.userData,
    isKitbashItem: true,
    kitbashName: cleanMeshLabel(donorMesh),
  };

  // Copy outline & prepass auxiliary children
  for (const child of donorMesh.children) {
    if (/ (outline|prepass)$/.test(child.name)) {
      const auxClone = child.clone(false);
      auxClone.geometry = child.geometry;
      auxClone.material = child.material;
      auxClone.renderOrder = child.renderOrder;
      auxClone.frustumCulled = false;
      auxClone.userData = { ...child.userData };
      cloned.add(auxClone);
    }
  }

  if (bindMode === 'skeleton' && donorMesh.isSkinnedMesh && donorMesh.skeleton) {
    const donorBones = donorMesh.skeleton.bones;
    const donorInverses = donorMesh.skeleton.boneInverses;

    // Transfer any physics/skirt/hair child bones that don't exist in host onto their nearest matching host ancestor
    const mappedBones = donorBones.map((dBone) => {
      const bName = (dBone.userData?.originalName || dBone.name || '').trim();
      if (hostBonesByName.has(bName)) {
        return hostBonesByName.get(bName);
      }
      // Clone missing bone hierarchy onto nearest matching host parent
      return ensureDynamicBoneOnHost(dBone, hostBonesByName);
    });

    const newSkeleton = new THREE.Skeleton(
      mappedBones,
      donorInverses.map((inv) => inv.clone()),
    );
    cloned.bind(newSkeleton, donorMesh.bindMatrix.clone());
    for (const child of cloned.children) {
      if (child.isSkinnedMesh) {
        child.bind(newSkeleton, donorMesh.bindMatrix.clone());
      }
    }

    hostRoot.add(cloned);
    return cloned;
  }

  // Socket attachment mode
  const targetParent = socketNode || hostRoot;
  cloned.position.set(0, 0, 0);
  cloned.rotation.set(0, 0, 0);
  cloned.scale.setScalar(1);
  targetParent.add(cloned);
  return cloned;
}

function ensureDynamicBoneOnHost(donorBone, hostBonesByName) {
  const bName = (donorBone.userData?.originalName || donorBone.name || '').trim();
  if (hostBonesByName.has(bName)) return hostBonesByName.get(bName);

  const newBone = new THREE.Bone();
  newBone.name = bName || donorBone.name;
  newBone.userData.originalName = bName;
  newBone.position.copy(donorBone.position);
  newBone.quaternion.copy(donorBone.quaternion);
  newBone.scale.copy(donorBone.scale);

  if (bName) hostBonesByName.set(bName, newBone);

  if (donorBone.parent) {
    const parentName = (donorBone.parent.userData?.originalName || donorBone.parent.name || '').trim();
    const hostParent = hostBonesByName.get(parentName) || ensureDynamicBoneOnHost(donorBone.parent, hostBonesByName);
    hostParent.add(newBone);
  }
  return newBone;
}

/* ------------------------------------------------------------------ */
/* MRT-Compatible PGR Cel Material for Built-in Props & Custom GLBs   */
/* ------------------------------------------------------------------ */

const PROP_VERTEX_SHADER = `
#include <common>
varying vec3 vNormalView;
varying vec3 vViewPos;
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vNormalView = normalize(normalMatrix * normal);
  vViewPos = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const PROP_FRAGMENT_SHADER = xs(
  `
uniform vec3 uBaseColor;
uniform vec3 uShadowColor;
uniform vec3 uRimColor;
uniform float uRimIntensity;
uniform float uBloom;
varying vec3 vNormalView;
varying vec3 vViewPos;

void main() {
  vec3 N = normalize(vNormalView);
  vec3 V = normalize(vViewPos);
  vec3 L = normalize(vec3(0.25, 0.75, 0.6));
  float ndl = dot(N, L) * 0.5 + 0.5;
  float ramp = smoothstep(0.45, 0.52, ndl);
  vec3 col = mix(uShadowColor, uBaseColor, ramp);
  float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
  col += uRimColor * rim * uRimIntensity;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`,
  'uBloom',
  '1.0',
);

export function createPgrPropMaterial({
  color = '#ff4757',
  shadow = '#6b1d2f',
  rim = '#ff9ff3',
  rimIntensity = 0.45,
  bloom = 0.25,
} = {}) {
  const uBaseColor = { value: new THREE.Color(color) };
  const uShadowColor = { value: new THREE.Color(shadow) };
  const uRimColor = { value: new THREE.Color(rim) };
  const uRimIntensity = { value: rimIntensity };
  const uBloom = { value: bloom };

  const mat = new THREE.ShaderMaterial({
    name: 'pgr-custom-prop',
    vertexShader: PROP_VERTEX_SHADER,
    fragmentShader: PROP_FRAGMENT_SHADER,
    uniforms: {
      uBaseColor,
      uShadowColor,
      uRimColor,
      uRimIntensity,
      uBloom,
    },
  });

  mat.color = uBaseColor.value;
  mat.userData.pgrUniforms = {
    pgrGlobalTint: uBaseColor,
    pgrOneShadow: uShadowColor,
    pgrTwoShadow: uShadowColor,
    pgrRimColor: uRimColor,
    pgrRimIntensity: uRimIntensity,
    pgrBloomWeights: { value: new THREE.Vector2(bloom, bloom) },
  };
  return mat;
}

export function createBuiltinPropMesh(typeId) {
  let geometry;
  let matOptions = {};
  let defaultPos = new THREE.Vector3(0, 0, 0);
  let defaultRot = new THREE.Euler(0, 0, 0);

  switch (typeId) {
    case 'halo': {
      geometry = new THREE.TorusGeometry(0.16, 0.014, 16, 48);
      matOptions = { color: '#fff3b0', shadow: '#e09f3e', rim: '#ffffff', rimIntensity: 0.85, bloom: 0.8 };
      defaultPos.set(0, 0.22, 0);
      defaultRot.set(Math.PI / 2, 0, 0);
      break;
    }
    case 'crown': {
      geometry = new THREE.ConeGeometry(0.11, 0.12, 6, 1, true);
      matOptions = { color: '#ffd166', shadow: '#b5651d', rim: '#fff8d6', rimIntensity: 0.65, bloom: 0.45 };
      defaultPos.set(0, 0.18, 0);
      break;
    }
    case 'wings': {
      const group = new THREE.Group();
      const wingGeo = new THREE.ConeGeometry(0.12, 0.65, 4);
      const wingMat = createPgrPropMaterial({
        color: '#38bdf8',
        shadow: '#0369a1',
        rim: '#bae6fd',
        rimIntensity: 0.8,
        bloom: 0.7,
      });
      for (let side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const feather = new THREE.Mesh(wingGeo, wingMat);
          feather.position.set(side * (0.14 + i * 0.1), 0.12 - i * 0.08, 0.14);
          feather.rotation.z = side * (-0.55 - i * 0.22);
          feather.rotation.x = 0.25;
          group.add(feather);
        }
      }
      group.userData = { isKitbashItem: true, kitbashName: 'Sayap', propId: 'wings' };
      return group;
    }
    case 'katana': {
      const bladeGeo = new THREE.BoxGeometry(0.018, 0.88, 0.04);
      geometry = bladeGeo;
      matOptions = { color: '#f43f5e', shadow: '#881337', rim: '#fda4af', rimIntensity: 0.75, bloom: 0.65 };
      defaultPos.set(0, 0.38, 0);
      break;
    }
    case 'orb': {
      geometry = new THREE.OctahedronGeometry(0.1, 2);
      matOptions = { color: '#a855f7', shadow: '#4c1d95', rim: '#e9d5ff', rimIntensity: 0.9, bloom: 0.85 };
      defaultPos.set(0, 0.15, 0);
      break;
    }
    case 'sphere': {
      geometry = new THREE.SphereGeometry(0.14, 32, 24);
      matOptions = { color: '#60a5fa', shadow: '#1e3a8a', rim: '#bfdbfe', rimIntensity: 0.5, bloom: 0.2 };
      defaultPos.set(0, 0.9, 0);
      break;
    }
    case 'torus': {
      geometry = new THREE.TorusGeometry(0.18, 0.045, 20, 48);
      matOptions = { color: '#34d399', shadow: '#065f46', rim: '#a7f3d0', rimIntensity: 0.55, bloom: 0.3 };
      defaultPos.set(0, 0.9, 0);
      break;
    }
    case 'cube':
    default: {
      geometry = new THREE.BoxGeometry(0.22, 0.22, 0.22);
      matOptions = { color: '#f472b6', shadow: '#831843', rim: '#fbcfe8', rimIntensity: 0.5, bloom: 0.2 };
      defaultPos.set(0, 0.9, 0);
      break;
    }
  }

  const mat = createPgrPropMaterial(matOptions);
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.copy(defaultPos);
  mesh.rotation.copy(defaultRot);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.userData = {
    isKitbashItem: true,
    propId: typeId,
    kitbashName: BUILTIN_PROPS.find((p) => p.id === typeId)?.name || 'Aksesori',
  };
  return mesh;
}

function patchCustomMeshMaterialsForMrt(root, name) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.frustumCulled = false;
    obj.castShadow = true;
    obj.receiveShadow = true;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    obj.material = mats.map((m) => {
      if (!m) return m;
      const cloned = m.clone();
      cloned.userData = { ...m.userData, _isMrtPatched: true };
      cloned.customProgramCacheKey = () => 'pgr-custom-glb-mrt';
      cloned.onBeforeCompile = (shader) => {
        shader.fragmentShader = xs(shader.fragmentShader, '0.15', 'diffuseColor.a');
      };
      return cloned;
    });
    if (obj.material.length === 1) obj.material = obj.material[0];
  });
  root.userData = {
    isKitbashItem: true,
    kitbashName: name,
  };
  return root;
}

export async function loadCustomGlbBuffer(arrayBuffer, filename = 'custom.glb') {
  const loader = new GLTFLoader();
  const gltf = await new Promise((resolve, reject) => {
    loader.parse(arrayBuffer, '', resolve, reject);
  });
  const root = patchCustomMeshMaterialsForMrt(
    gltf.scene,
    filename.replace(/\.(glb|gltf)$/i, ''),
  );
  return root;
}

export async function loadCustomGlbFile(file) {
  const buffer = await file.arrayBuffer();
  const root = await loadCustomGlbBuffer(buffer, file.name);
  root.userData.customAssetBuffer = buffer;
  root.userData.customAssetName = file.name;
  return root;
}

function makeExportMaterialForMesh(mesh, pgrModel) {
  const activeMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const pbrEntry = pgrModel?.pbrState?.get(mesh);
  const toonState = getMeshMaterialState(mesh);

  if (pbrEntry?.material) {
    const srcPbr = Array.isArray(pbrEntry.material) ? pbrEntry.material[0] : pbrEntry.material;
    const exportMat = srcPbr.clone();
    // Preserve any HSL recolored texture or tint edits applied by the user
    if (activeMat?.map) exportMat.map = activeMat.map;
    if (activeMat?.color) exportMat.color.copy(activeMat.color);
    if (toonState) exportMat.userData = { ...exportMat.userData, kurumiToonParams: toonState };
    return exportMat;
  }

  if (activeMat?.isShaderMaterial) {
    const u = activeMat.userData?.pgrUniforms;
    const baseHex = activeMat.color || u?.pgrGlobalTint?.value || activeMat.uniforms?.uBaseColor?.value;
    const exportMat = new THREE.MeshStandardMaterial({
      name: activeMat.name || mesh.name || 'custom-mat',
      color: baseHex ? baseHex.clone() : new THREE.Color(0xffffff),
      roughness: 0.72,
      metalness: 0.05,
      map: activeMat.map || null,
    });
    if (toonState) exportMat.userData = { kurumiToonParams: toonState };
    return exportMat;
  }

  if (mesh.userData?.bodyPatch && activeMat) {
    return new THREE.MeshStandardMaterial({
      name: activeMat.name || 'body-patch',
      color: activeMat.color ? activeMat.color.clone() : new THREE.Color(0xebd0c8),
      roughness: activeMat.roughness ?? 0.85,
      metalness: activeMat.metalness ?? 0.02,
      map: activeMat.map || null,
    });
  }

  if (activeMat && activeMat.userData?._isMrtPatched) {
    const exportMat = new THREE.MeshStandardMaterial({
      name: activeMat.name || 'custom-prop',
      color: activeMat.color ? activeMat.color.clone() : new THREE.Color(0xffffff),
      map: activeMat.map || null,
      roughness: activeMat.roughness ?? 0.8,
      metalness: activeMat.metalness ?? 0.05,
      transparent: Boolean(activeMat.transparent),
      opacity: activeMat.opacity ?? 1,
      side: activeMat.side ?? THREE.FrontSide,
    });
    return exportMat;
  }

  return null;
}

function createStaticPoseBakedMesh(skinnedMesh) {
  skinnedMesh.updateMatrixWorld(true);
  skinnedMesh.skeleton?.update();
  const srcGeo = skinnedMesh.geometry;
  const posAttr = srcGeo.attributes.position;
  const bakedGeo = new THREE.BufferGeometry();
  const outPos = new Float32Array(posAttr.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < posAttr.count; i++) {
    skinnedMesh.getVertexPosition(i, v);
    outPos[i * 3] = v.x;
    outPos[i * 3 + 1] = v.y;
    outPos[i * 3 + 2] = v.z;
  }
  bakedGeo.setAttribute('position', new THREE.BufferAttribute(outPos, 3));
  for (const attrName of ['uv', 'uv1', 'uv2', 'color']) {
    if (srcGeo.attributes[attrName]) bakedGeo.setAttribute(attrName, srcGeo.attributes[attrName]);
  }
  if (srcGeo.index) bakedGeo.setIndex(srcGeo.index);
  bakedGeo.computeVertexNormals();
  const mesh = new THREE.Mesh(bakedGeo, skinnedMesh.material);
  mesh.name = skinnedMesh.name;
  if (skinnedMesh.userData?.originalName) mesh.userData.originalName = skinnedMesh.userData.originalName;
  mesh.position.copy(skinnedMesh.position);
  mesh.quaternion.copy(skinnedMesh.quaternion);
  mesh.scale.copy(skinnedMesh.scale);
  return mesh;
}

/**
 * Copies of the clips that GLTFExporter can write. The game's clips address
 * face morphs by number ("n8.morphTargetInfluences[12]"), the exporter only
 * by name, so numbers become the morph's name. Tracks for things that are not
 * in the export (a removed part, a morph that does not exist) are left out
 * instead of failing the whole file.
 */
function clipsForExport(clips, root) {
  const out = [];
  for (const clip of clips) {
    const tracks = [];
    for (const track of clip.tracks) {
      const binding = THREE.PropertyBinding.parseTrackName(track.name);
      const node = THREE.PropertyBinding.findNode(root, binding.nodeName);
      if (!node) continue;
      if (binding.propertyName !== 'morphTargetInfluences' || binding.propertyIndex === undefined) {
        tracks.push(track);
        continue;
      }
      const dictionary = node.morphTargetDictionary ?? {};
      let morphName = binding.propertyIndex;
      if (!(morphName in dictionary) && /^\d+$/.test(morphName)) {
        morphName = Object.keys(dictionary).find((key) => dictionary[key] === Number(binding.propertyIndex));
      }
      if (morphName === undefined || !(morphName in dictionary)) continue;
      const renamed = track.clone();
      renamed.name = `${binding.nodeName}.morphTargetInfluences[${morphName}]`;
      tracks.push(renamed);
    }
    if (tracks.length) out.push(new THREE.AnimationClip(clip.name, clip.duration, tracks, clip.blendMode));
  }
  return out;
}

export async function exportModelToGlb(
  rootObject,
  filename = 'pgr-custom-model.glb',
  {
    pgrModel = null,
    includePatches = true,
    includeAnimations = false,
    animations = [],
    bakePoseToMesh = false,
    returnBuffer = false,
    // Name of the root node in the file, and the way the character faces in
    // the viewer; the file is turned so it faces +Z (Blender's Front view).
    name = 'Character',
    front = null,
    // The loaded glTF the model came from: with it, the game's toon shading
    // data is carried into the file (see pgrExport.js).
    source = null,
  } = {},
) {
  const exporter = new GLTFExporter();
  const restoreCallbacks = [];
  const materialOrigins = new Map();
  if (source?.parser) exporter.register(createPgrExportPlugin({ source, materialOrigins }));
  // Meshes that share a material (a body and its patches) share it in the
  // file too, instead of arriving in Blender as Body, Body.001, Body.002.
  const exportMaterials = new Map();
  // PGR textures keep shadow masks and the like in alpha. Wherever alpha is
  // not opacity, the exporter gets a copy with alpha filled in (see
  // opaqueTextureCopy); one copy per source texture.
  const opaqueCopies = new Map();
  const TEXTURE_SLOTS = ['map', 'normalMap', 'emissiveMap', 'roughnessMap', 'metalnessMap', 'aoMap'];
  const fillAlpha = (material) => {
    const alphaIsOpacity = material.transparent || material.alphaTest > 0 || Boolean(material.alphaMap);
    for (const slot of TEXTURE_SLOTS) {
      const texture = material[slot];
      if (!texture || (slot === 'map' && alphaIsOpacity)) continue;
      if (!opaqueCopies.has(texture)) opaqueCopies.set(texture, opaqueTextureCopy(texture));
      const copy = opaqueCopies.get(texture);
      if (copy) material[slot] = copy;
    }
  };
  restoreCallbacks.push(() => {
    for (const copy of opaqueCopies.values()) copy?.dispose();
  });
  const materialKey = (mesh) => {
    const active = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const pbr = pgrModel?.pbrState?.get(mesh)?.material;
    return `${active?.uuid}|${(Array.isArray(pbr) ? pbr[0] : pbr)?.uuid ?? ''}`;
  };

  rootObject.updateMatrixWorld(true);
  rootObject.traverse((obj) => {
    const shouldHide =
      ou(obj) ||
      obj.userData?.isDebugOverlay ||
      obj.userData?.exportExcluded === true ||
      (!includePatches && obj.userData?.bodyPatch);

    if (shouldHide && obj.visible) {
      obj.visible = false;
      restoreCallbacks.push(() => {
        obj.visible = true;
      });
      return;
    }
    if (!obj.isMesh || !obj.visible) return;

    // Swap ShaderMaterials / PGR materials to clean MeshStandardMaterial for Blender compatibility
    const key = materialKey(obj);
    let exportMat = exportMaterials.get(key);
    if (exportMat === undefined) {
      exportMat = makeExportMaterialForMesh(obj, pgrModel);
      if (exportMat) {
        fillAlpha(exportMat);
        const original = pgrModel?.pbrState?.get(obj)?.material;
        materialOrigins.set(exportMat, Array.isArray(original) ? original[0] : original);
      }
      exportMaterials.set(key, exportMat);
      if (exportMat) restoreCallbacks.push(() => exportMat.dispose());
    }
    if (exportMat) {
      const prevMat = obj.material;
      obj.material = exportMat;
      restoreCallbacks.push(() => {
        obj.material = prevMat;
      });
    }

    // Compact geometry with shared buffers (shell patches) or deleted faces
    // (faceMask). The game's own vertex data (_pgrcolor, _pgrsmoothnormal,
    // _pgrzone) stays: the toon shader and its outline need it when the file
    // is opened here again, and other tools keep it as plain attributes.
    const hasShared = Boolean(obj.geometry?.userData?.shared);
    const hasMask = Boolean(obj.geometry && obj.userData?._faceMask);
    if (hasShared || hasMask) {
      const prevGeo = obj.geometry;
      const compact = cloneCompactGeometry(prevGeo);
      obj.geometry = compact;
      restoreCallbacks.push(() => {
        obj.geometry = prevGeo;
        compact.dispose();
      });
    }
  });

  let exportRoot = rootObject;
  if (bakePoseToMesh) {
    const bakedGroup = new THREE.Group();
    bakedGroup.name = rootObject.name || 'CharacterBaked';
    bakedGroup.position.copy(rootObject.position);
    bakedGroup.quaternion.copy(rootObject.quaternion);
    bakedGroup.scale.copy(rootObject.scale);
    rootObject.traverse((obj) => {
      if (!obj.isMesh || !obj.visible) return;
      let vis = true;
      for (let p = obj; p; p = p.parent) {
        if (!p.visible) {
          vis = false;
          break;
        }
      }
      if (!vis) return;
      const m = obj.isSkinnedMesh
        ? createStaticPoseBakedMesh(obj)
        : new THREE.Mesh(obj.geometry.clone(), obj.material);
      if (!obj.isSkinnedMesh) {
        m.name = obj.name;
        if (obj.userData?.originalName) m.userData.originalName = obj.userData.originalName;
      }
      if (!obj.isSkinnedMesh) {
        obj.updateMatrixWorld(true);
        const relMat = rootObject.matrixWorld.clone().invert().multiply(obj.matrixWorld);
        relMat.decompose(m.position, m.quaternion, m.scale);
      }
      bakedGroup.add(m);
    });
    exportRoot = bakedGroup;
  }

  try {
    const parseOpts = { binary: true, onlyVisible: true };
    if (includeAnimations && !bakePoseToMesh && animations.length > 0) {
      parseOpts.animations = clipsForExport(animations, exportRoot);
    }
    const raw = await new Promise((resolve, reject) => {
      exporter.parse(exportRoot, resolve, reject, parseOpts);
    });
    const buffer = tidyGlb(raw, { name, front });
    if (returnBuffer) return buffer;
    const blob = new Blob([buffer], { type: 'model/gltf-binary' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    return buffer;
  } finally {
    if (exportRoot !== rootObject) {
      exportRoot.traverse((c) => {
        if (c.isMesh) c.geometry?.dispose();
      });
    }
    for (let i = restoreCallbacks.length - 1; i >= 0; i--) {
      restoreCallbacks[i]();
    }
  }
}
