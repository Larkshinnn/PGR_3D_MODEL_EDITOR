import * as THREE from 'three';
import { dbDelete, dbGet, dbGetAll, dbPut } from './studioDb.js';
import { getDeletedFaceIndices } from './meshEdit.js';
import { serializePose } from './poseLibrary.js';
import { serializeMeshMaterialEdits } from './studioEditor.js';

/**
 * Non-destructive Project Recipe (.kproj.json) serializer + IndexedDB Autosave
 * and binary asset cache for imported GLB accessories.
 */

const AUTOSAVE_ID = '__autosave__';

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunks = [];
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
  }
  return btoa(chunks.join(''));
}

function base64ToArrayBuffer(base64) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export async function saveBinaryAsset(id, buffer, name = 'asset.glb') {
  const assetId = id || `asset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await dbPut('assets', { id: assetId, name, buffer });
  return assetId;
}

export async function loadBinaryAsset(assetId) {
  return dbGet('assets', assetId);
}

function parentBoneRawName(object, modelRoot) {
  const p = object?.parent;
  if (!p || p === modelRoot) return null;
  return (p.userData?.originalName || p.name || '').trim() || null;
}

function sameVec(a, b, eps = 1e-4) {
  return (
    Math.abs(a.x - b.x) < eps &&
    Math.abs(a.y - b.y) < eps &&
    Math.abs(a.z - b.z) < eps
  );
}

function sameQuat(a, b, eps = 1e-4) {
  return Math.abs(a.dot(b)) > 1 - eps;
}

export function serializeProject({
  id = null,
  name = '',
  modelBase,
  modelMeta,
  modelAssetId = null,
  model,
  bindTransforms,
  parts,
  activeKitbashItems,
  bodyPatcher,
  patchAuto = true,
  rig,
  morphParts,
  morphOverrides,
  currentClipName = null,
  currentClipTime = 0,
  bindPoseActive = false,
  sceneSettings = {},
} = {}) {
  const partsState = parts.map((part) => {
    const obj = part.object;
    const orig = bindTransforms?.get(obj);
    const transformChanged =
      !orig ||
      !sameVec(obj.position, orig.position) ||
      !sameQuat(obj.quaternion, orig.quaternion) ||
      !sameVec(obj.scale, orig.scale);

    return {
      index: part.index,
      label: part.label,
      customName: part.customName || null,
      visible: Boolean(obj.visible),
      deleted: Boolean(part.deleted),
      rewriteOnHide: part.rewriteOnHide !== false,
      exportExcluded: Boolean(obj.userData?.exportExcluded),
      transform: transformChanged
        ? {
            p: obj.position.toArray(),
            q: obj.quaternion.toArray(),
            s: obj.scale.toArray(),
          }
        : null,
      deletedFaces: getDeletedFaceIndices(obj),
      materialEdits: serializeMeshMaterialEdits(obj),
    };
  });

  const kitbashState = activeKitbashItems.map((item) => {
    const obj = item.object;
    const firstMesh = obj.isMesh ? obj : (() => {
      let m = null;
      obj.traverse((c) => {
        if (!m && c.isMesh) m = c;
      });
      return m;
    })();
    return {
      id: item.id || null,
      kind: item.type,
      name: item.name,
      propId: obj.userData?.propId || item.propId || null,
      donorBaseUrl: item.donorBaseUrl || obj.userData?.donorBaseUrl || null,
      donorMeshIndex: item.donorMeshIndex ?? obj.userData?.donorMeshIndex ?? null,
      bindMode: item.bindMode || obj.userData?.bindMode || 'skeleton',
      sourcePartIndex: item.sourcePartIndex ?? null,
      separatedFaces: item.separatedFaces || null,
      assetId: item.assetId || obj.userData?.assetId || null,
      assetName: obj.userData?.customAssetName || item.name,
      parentBoneName: parentBoneRawName(obj, model),
      visible: Boolean(obj.visible),
      exportExcluded: Boolean(obj.userData?.exportExcluded),
      transform: {
        p: obj.position.toArray(),
        q: obj.quaternion.toArray(),
        s: obj.scale.toArray(),
      },
      deletedFaces: firstMesh ? getDeletedFaceIndices(firstMesh) : [],
      materialEdits: firstMesh ? serializeMeshMaterialEdits(firstMesh) : null,
    };
  });

  const pose = serializePose({
    name: `${modelMeta?.frame || 'Karakter'} Pose`,
    rig,
    model,
    morphParts,
    morphOverrides,
    clipName: currentClipName,
    clipTime: currentClipTime,
    bindPoseActive,
    includeMorphs: true,
    includeRoot: true,
    includeClip: true,
  });

  const projectName = name || modelMeta?.frame || modelMeta?.charName || 'Proyek Karakter';

  return {
    type: 'kurumi-project',
    version: 1,
    id: id || `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: projectName,
    savedAt: new Date().toISOString(),
    modelBase,
    modelAssetId,
    modelMeta: { ...modelMeta },
    modelTransform: model
      ? {
          scale: Number(model.scale.x.toFixed(4)),
          rotationY: Number(THREE.MathUtils.radToDeg(model.rotation.y).toFixed(2)),
        }
      : { scale: 1, rotationY: 0 },
    parts: partsState,
    patches: {
      auto: Boolean(patchAuto),
      mode: bodyPatcher?.mode ?? 'hybrid',
      thickness: bodyPatcher?.thickness ?? 1,
      fillStyle: bodyPatcher?.fillStyle ?? 'skin',
      baseLayerColor: bodyPatcher?.baseLayerColor ?? '#252730',
      manualIds: bodyPatcher?.getManualIds?.() ?? [],
      dismissedIds: bodyPatcher?.getDismissedIds?.() ?? [],
    },
    kitbash: kitbashState,
    pose,
    clip: {
      name: currentClipName,
      time: Number(currentClipTime || 0),
      bindPoseActive: Boolean(bindPoseActive),
    },
    scene: {
      materialMode: sceneSettings.materialMode ?? 'pgr',
      stageMode: sceneSettings.stageMode ?? 'dark',
      customBgColor: sceneSettings.customBgColor ?? '#303236',
      showGrid: Boolean(sceneSettings.showGrid),
      showShadow: sceneSettings.showShadow !== false,
      lightYaw: Number(sceneSettings.lightYaw ?? 175),
      lightPitch: Number(sceneSettings.lightPitch ?? 30),
    },
  };
}

export async function embedAssetsIntoProject(project) {
  const embeddedAssets = {};
  const ids = new Set();
  if (project.modelAssetId) ids.add(project.modelAssetId);
  for (const kb of project.kitbash || []) {
    if (kb.assetId) ids.add(kb.assetId);
  }
  for (const id of ids) {
    const rec = await loadBinaryAsset(id);
    if (rec?.buffer) {
      embeddedAssets[id] = {
        name: rec.name || 'asset.glb',
        data: arrayBufferToBase64(rec.buffer),
      };
    }
  }
  return { ...project, embeddedAssets };
}

export async function restoreEmbeddedAssetsFromProject(project) {
  const embedded = project?.embeddedAssets;
  if (!embedded || typeof embedded !== 'object') return;
  for (const [id, entry] of Object.entries(embedded)) {
    if (!entry?.data) continue;
    await saveBinaryAsset(id, base64ToArrayBuffer(entry.data), entry.name || 'asset.glb');
  }
}

export async function saveAutosaveProject(project) {
  const record = { ...project, id: AUTOSAVE_ID, updatedAt: new Date().toISOString() };
  await dbPut('projects', record);
  return record;
}

export async function loadAutosaveProject() {
  return dbGet('projects', AUTOSAVE_ID);
}

export async function clearAutosaveProject() {
  return dbDelete('projects', AUTOSAVE_ID);
}

export async function saveNamedProject(project) {
  const record = {
    ...project,
    id:
      project.id && project.id !== AUTOSAVE_ID
        ? project.id
        : `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    updatedAt: new Date().toISOString(),
  };
  await dbPut('projects', record);
  return record;
}

export async function listSavedProjects() {
  const all = await dbGetAll('projects');
  return all
    .filter((p) => p.id !== AUTOSAVE_ID)
    .sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')));
}

export async function deleteSavedProject(id) {
  return dbDelete('projects', id);
}
