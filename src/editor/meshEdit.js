import * as THREE from 'three';
import { ou } from '../materials/pgrToon.js';

/**
 * Blender-like object and Edit Mode mesh operations:
 * - Non-destructive face masking (delete / separate faces with undo support)
 * - Click / Box (B) / Circle-Brush (C) / Linked (L) face selection on posed meshes
 * - Object duplication (Shift+D)
 * - Bone parenting & nearest-bone auto-skinning (Ctrl+P)
 */

const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _cen = new THREE.Vector3();
const _ndc = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _mat = new THREE.Matrix4();

export function ensureFaceMask(mesh) {
  if (!mesh?.geometry) return null;
  const geom = mesh.geometry;
  if (mesh.userData._faceMask && mesh.userData._originalIndex) {
    return {
      mask: mesh.userData._faceMask,
      originalIndex: mesh.userData._originalIndex,
      activeMap: mesh.userData._activeFaceMap,
    };
  }
  const pos = geom.attributes.position;
  if (!pos) return null;

  let orig;
  if (geom.index) {
    orig = geom.index.array.slice();
  } else {
    const count = pos.count;
    orig = count > 65535 ? new Uint32Array(count) : new Uint16Array(count);
    for (let i = 0; i < count; i++) orig[i] = i;
  }
  const triCount = Math.floor(orig.length / 3);
  const mask = new Uint8Array(triCount);
  mask.fill(1);
  const activeMap = new Int32Array(triCount);
  for (let t = 0; t < triCount; t++) activeMap[t] = t;

  mesh.userData._originalIndex = orig;
  mesh.userData._faceMask = mask;
  mesh.userData._activeFaceMap = activeMap;
  return { mask, originalIndex: orig, activeMap };
}

export function applyFaceMask(mesh) {
  const data = ensureFaceMask(mesh);
  if (!data) return 0;
  const { mask, originalIndex } = data;
  const triCount = mask.length;

  let kept = 0;
  for (let t = 0; t < triCount; t++) {
    if (mask[t]) kept++;
  }

  const IndexArray = originalIndex.constructor;
  const next = new IndexArray(kept * 3);
  const activeMap = new Int32Array(kept);
  let write = 0;
  let faceWrite = 0;
  for (let t = 0; t < triCount; t++) {
    if (!mask[t]) continue;
    const base = t * 3;
    next[write++] = originalIndex[base];
    next[write++] = originalIndex[base + 1];
    next[write++] = originalIndex[base + 2];
    activeMap[faceWrite++] = t;
  }

  mesh.geometry.setIndex(new THREE.BufferAttribute(next, 1));
  mesh.geometry.index.needsUpdate = true;
  mesh.userData._activeFaceMap = activeMap;
  return kept;
}

export function getDeletedFaceIndices(mesh) {
  const mask = mesh?.userData?._faceMask;
  if (!mask) return [];
  const deleted = [];
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 0) deleted.push(i);
  }
  return deleted;
}

export function setDeletedFaceIndices(mesh, deletedIndices = []) {
  const data = ensureFaceMask(mesh);
  if (!data) return;
  data.mask.fill(1);
  for (const idx of deletedIndices) {
    if (idx >= 0 && idx < data.mask.length) data.mask[idx] = 0;
  }
  applyFaceMask(mesh);
}

export function cloneFaceMaskArray(mesh) {
  const data = ensureFaceMask(mesh);
  return data ? data.mask.slice() : null;
}

export function restoreFaceMaskArray(mesh, savedMask) {
  const data = ensureFaceMask(mesh);
  if (!data || !savedMask) return;
  data.mask.set(savedMask);
  applyFaceMask(mesh);
}

export function visibleHitToOriginalFace(mesh, visibleFaceIndex) {
  if (visibleFaceIndex == null || visibleFaceIndex < 0) return -1;
  const data = ensureFaceMask(mesh);
  if (!data) return -1;
  return data.activeMap[visibleFaceIndex] ?? -1;
}

function quantKey(posAttr, vertexIndex) {
  const x = Math.round(posAttr.getX(vertexIndex) * 10000);
  const y = Math.round(posAttr.getY(vertexIndex) * 10000);
  const z = Math.round(posAttr.getZ(vertexIndex) * 10000);
  return `${x},${y},${z}`;
}

export function selectLinkedFaces(mesh, seedOriginalFace) {
  const data = ensureFaceMask(mesh);
  if (!data || seedOriginalFace < 0 || seedOriginalFace >= data.mask.length) return new Set();
  if (!data.mask[seedOriginalFace]) return new Set();

  const posAttr = mesh.geometry.attributes.position;
  const orig = data.originalIndex;
  const mask = data.mask;

  let byPos = mesh.userData._faceAdjByPos;
  if (!byPos) {
    byPos = new Map();
    const triCount = mask.length;
    for (let t = 0; t < triCount; t++) {
      for (let k = 0; k < 3; k++) {
        const key = quantKey(posAttr, orig[t * 3 + k]);
        let list = byPos.get(key);
        if (!list) {
          list = [];
          byPos.set(key, list);
        }
        list.push(t);
      }
    }
    mesh.userData._faceAdjByPos = byPos;
  }

  const result = new Set([seedOriginalFace]);
  const queue = [seedOriginalFace];
  while (queue.length > 0) {
    const cur = queue.pop();
    for (let k = 0; k < 3; k++) {
      const key = quantKey(posAttr, orig[cur * 3 + k]);
      const neighbors = byPos.get(key);
      if (!neighbors) continue;
      for (const n of neighbors) {
        if (mask[n] && !result.has(n)) {
          result.add(n);
          queue.push(n);
        }
      }
    }
  }
  return result;
}

export function selectFacesInBox(mesh, camera, ndcMinX, ndcMinY, ndcMaxX, ndcMaxY) {
  const data = ensureFaceMask(mesh);
  if (!data) return new Set();
  const { mask, originalIndex } = data;
  mesh.updateMatrixWorld(true);
  if (mesh.isSkinnedMesh && mesh.skeleton) mesh.skeleton.update();

  const selected = new Set();
  const triCount = mask.length;
  for (let t = 0; t < triCount; t++) {
    if (!mask[t]) continue;
    const b = t * 3;
    mesh.getVertexPosition(originalIndex[b], _vA);
    mesh.getVertexPosition(originalIndex[b + 1], _vB);
    mesh.getVertexPosition(originalIndex[b + 2], _vC);
    _cen.copy(_vA).add(_vB).add(_vC).multiplyScalar(1 / 3).applyMatrix4(mesh.matrixWorld);
    _ndc.copy(_cen).project(camera);
    if (_ndc.z >= -1 && _ndc.z <= 1 && _ndc.x >= ndcMinX && _ndc.x <= ndcMaxX && _ndc.y >= ndcMinY && _ndc.y <= ndcMaxY) {
      selected.add(t);
    }
  }
  return selected;
}

export function selectFacesInCircle(mesh, camera, ndcX, ndcY, ndcRadiusX, ndcRadiusY) {
  const data = ensureFaceMask(mesh);
  if (!data) return new Set();
  const { mask, originalIndex } = data;
  mesh.updateMatrixWorld(true);
  if (mesh.isSkinnedMesh && mesh.skeleton) mesh.skeleton.update();

  const selected = new Set();
  const triCount = mask.length;
  for (let t = 0; t < triCount; t++) {
    if (!mask[t]) continue;
    const b = t * 3;
    mesh.getVertexPosition(originalIndex[b], _vA);
    mesh.getVertexPosition(originalIndex[b + 1], _vB);
    mesh.getVertexPosition(originalIndex[b + 2], _vC);
    _cen.copy(_vA).add(_vB).add(_vC).multiplyScalar(1 / 3).applyMatrix4(mesh.matrixWorld);
    _ndc.copy(_cen).project(camera);
    if (_ndc.z < -1 || _ndc.z > 1) continue;
    const dx = (_ndc.x - ndcX) / Math.max(1e-5, ndcRadiusX);
    const dy = (_ndc.y - ndcY) / Math.max(1e-5, ndcRadiusY);
    if (dx * dx + dy * dy <= 1) selected.add(t);
  }
  return selected;
}

export function getAllVisibleFaces(mesh) {
  const data = ensureFaceMask(mesh);
  const out = new Set();
  if (!data) return out;
  for (let t = 0; t < data.mask.length; t++) {
    if (data.mask[t]) out.add(t);
  }
  return out;
}

/**
 * Updates or creates the orange highlight overlay mesh for selected faces in Edit Mode.
 */
export function syncEditOverlayMesh(existingOverlay, sourceMesh, selectedFaces) {
  if (!sourceMesh || !selectedFaces || selectedFaces.size === 0) {
    if (existingOverlay) existingOverlay.visible = false;
    return existingOverlay;
  }
  const data = ensureFaceMask(sourceMesh);
  if (!data) return existingOverlay;

  const { mask, originalIndex } = data;
  const pickedIndices = [];
  for (const t of selectedFaces) {
    if (t >= 0 && t < mask.length && mask[t]) {
      const b = t * 3;
      pickedIndices.push(originalIndex[b], originalIndex[b + 1], originalIndex[b + 2]);
    }
  }
  if (pickedIndices.length === 0) {
    if (existingOverlay) existingOverlay.visible = false;
    return existingOverlay;
  }

  let overlay = existingOverlay;
  const needsNewMesh =
    !overlay ||
    overlay.userData.sourceUuid !== sourceMesh.uuid ||
    overlay.isSkinnedMesh !== sourceMesh.isSkinnedMesh;

  if (needsNewMesh) {
    if (overlay) {
      overlay.parent?.remove(overlay);
      overlay.geometry?.dispose();
      overlay.material?.dispose();
    }
    const geo = new THREE.BufferGeometry();
    for (const attrName of ['position', 'normal', 'skinIndex', 'skinWeight']) {
      if (sourceMesh.geometry.attributes[attrName]) {
        geo.setAttribute(attrName, sourceMesh.geometry.attributes[attrName]);
      }
    }
    const mat = new THREE.MeshBasicMaterial({
      name: 'edit-face-highlight',
      color: 0xff8c24,
      transparent: true,
      opacity: 0.55,
      depthTest: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    overlay = sourceMesh.isSkinnedMesh
      ? new THREE.SkinnedMesh(geo, mat)
      : new THREE.Mesh(geo, mat);
    overlay.frustumCulled = false;
    overlay.renderOrder = 999;
    overlay.userData.isDebugOverlay = true;
    overlay.userData.sourceUuid = sourceMesh.uuid;
    if (sourceMesh.isSkinnedMesh && sourceMesh.skeleton) {
      overlay.bind(sourceMesh.skeleton, sourceMesh.bindMatrix);
    }
  }

  overlay.geometry.setIndex(pickedIndices);
  overlay.visible = true;
  if (sourceMesh.parent && overlay.parent !== sourceMesh.parent) {
    sourceMesh.parent.add(overlay);
  }
  overlay.position.copy(sourceMesh.position);
  overlay.quaternion.copy(sourceMesh.quaternion);
  overlay.scale.copy(sourceMesh.scale);
  return overlay;
}

/**
 * Separates `selectedFaces` from `sourceMesh` into a standalone mesh object,
 * hiding those faces on `sourceMesh` via its faceMask.
 */
export function separateSelectedFaces(sourceMesh, selectedFaces, newName = 'Bagian terpisah') {
  const data = ensureFaceMask(sourceMesh);
  if (!data || !selectedFaces || selectedFaces.size === 0) return null;

  const { mask, originalIndex } = data;
  const extractedTris = [];
  for (const t of selectedFaces) {
    if (t >= 0 && t < mask.length && mask[t]) {
      extractedTris.push(t);
    }
  }
  if (extractedTris.length === 0) return null;

  const newIndices = [];
  for (const t of extractedTris) {
    const b = t * 3;
    newIndices.push(originalIndex[b], originalIndex[b + 1], originalIndex[b + 2]);
    mask[t] = 0;
  }
  applyFaceMask(sourceMesh);

  const geo = cloneCompactGeometry(sourceMesh.geometry, newIndices);
  const cloneMat = cloneMaterialSafe(sourceMesh.material);
  const newMesh = sourceMesh.isSkinnedMesh
    ? new THREE.SkinnedMesh(geo, cloneMat)
    : new THREE.Mesh(geo, cloneMat);

  newMesh.name = newName;
  newMesh.position.copy(sourceMesh.position);
  newMesh.quaternion.copy(sourceMesh.quaternion);
  newMesh.scale.copy(sourceMesh.scale);
  newMesh.castShadow = sourceMesh.castShadow;
  newMesh.receiveShadow = sourceMesh.receiveShadow;
  newMesh.frustumCulled = false;
  newMesh.renderOrder = sourceMesh.renderOrder;
  newMesh.customDepthMaterial = sourceMesh.customDepthMaterial;
  newMesh.onBeforeRender = sourceMesh.onBeforeRender;
  newMesh.onBeforeShadow = sourceMesh.onBeforeShadow;
  newMesh.userData = {
    isKitbashItem: true,
    isSeparatedPart: true,
    kitbashName: newName,
    sourceMeshName: sourceMesh.userData?.originalName || sourceMesh.name,
  };

  if (sourceMesh.isSkinnedMesh && sourceMesh.skeleton) {
    newMesh.bind(sourceMesh.skeleton, sourceMesh.bindMatrix.clone());
  }

  return { newMesh, extractedTris };
}

/**
 * Creates a compact BufferGeometry containing only vertices referenced by `indices`.
 */
export function cloneCompactGeometry(sourceGeometry, rawIndices = null) {
  const idxAttr = sourceGeometry.index;
  let srcIndices;
  if (rawIndices) {
    srcIndices = rawIndices;
  } else if (idxAttr) {
    srcIndices = idxAttr.array;
  } else {
    const count = sourceGeometry.attributes.position.count;
    srcIndices = Array.from({ length: count }, (_, i) => i);
  }

  const remap = new Map();
  const usedOldVerts = [];
  const nextIndices = new Uint32Array(srcIndices.length);
  for (let i = 0; i < srcIndices.length; i++) {
    const oldV = srcIndices[i];
    let newV = remap.get(oldV);
    if (newV === undefined) {
      newV = usedOldVerts.length;
      remap.set(oldV, newV);
      usedOldVerts.push(oldV);
    }
    nextIndices[i] = newV;
  }

  // Reads through getComponent so interleaved attributes work too.
  const compact = (attr) => {
    const itemSize = attr.itemSize;
    const Typed = (attr.isInterleavedBufferAttribute ? attr.data.array : attr.array).constructor;
    const arr = new Typed(usedOldVerts.length * itemSize);
    for (let i = 0; i < usedOldVerts.length; i++) {
      for (let c = 0; c < itemSize; c++) arr[i * itemSize + c] = attr.getComponent(usedOldVerts[i], c);
    }
    return new THREE.BufferAttribute(arr, itemSize, attr.normalized);
  };

  const out = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(sourceGeometry.attributes)) {
    out.setAttribute(name, compact(attr));
  }
  // Shape keys (face expressions) belong to the vertices as much as positions do.
  for (const [name, list] of Object.entries(sourceGeometry.morphAttributes)) {
    out.morphAttributes[name] = list.map((attr) => {
      const copy = compact(attr);
      copy.name = attr.name;
      return copy;
    });
  }
  out.morphTargetsRelative = sourceGeometry.morphTargetsRelative;
  // Index ranges keep their meaning when every triangle is kept in order.
  if (!rawIndices) for (const group of sourceGeometry.groups) out.addGroup(group.start, group.count, group.materialIndex);
  const finalIdx = usedOldVerts.length <= 65535 ? new Uint16Array(nextIndices) : nextIndices;
  out.setIndex(new THREE.BufferAttribute(finalIdx, 1));
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

function cloneMaterialSafe(mat) {
  if (Array.isArray(mat)) return mat.map(cloneMaterialSafe);
  if (!mat || typeof mat.clone !== 'function') return mat;
  const cloned = mat.clone();
  if (mat.userData?.pgrUniforms) {
    // Deep-clone pgrUniforms so recoloring the duplicate doesn't mutate the original!
    const nextUniforms = {};
    for (const [k, u] of Object.entries(mat.userData.pgrUniforms)) {
      if (!u) continue;
      if (u.value?.clone) nextUniforms[k] = { value: u.value.clone() };
      else nextUniforms[k] = { value: u.value };
    }
    cloned.userData = { ...mat.userData, pgrUniforms: nextUniforms };
    if (cloned.uniforms) {
      for (const [k, v] of Object.entries(nextUniforms)) {
        if (k in cloned.uniforms) cloned.uniforms[k] = v;
      }
    }
  }
  return cloned;
}

/**
 * Duplicates a scene object (Mesh, SkinnedMesh, or Group) with independent transforms
 * and materials while sharing the skeleton if skinned.
 */
export function duplicateSceneObject(source, newName = '') {
  if (!source) return null;

  const cloneSingle = (node) => {
    let copy;
    if (node.isSkinnedMesh) {
      const clonedGeo = node.geometry.clone();
      copy = new THREE.SkinnedMesh(clonedGeo, cloneMaterialSafe(node.material));
      if (node.skeleton) copy.bind(node.skeleton, node.bindMatrix.clone());
    } else if (node.isMesh) {
      copy = new THREE.Mesh(node.geometry.clone(), cloneMaterialSafe(node.material));
    } else {
      copy = node.clone(false);
    }
    copy.name = newName || `${node.name || 'Object'}_copy`;
    copy.position.copy(node.position);
    copy.quaternion.copy(node.quaternion);
    copy.scale.copy(node.scale);
    copy.visible = true;
    copy.castShadow = node.castShadow;
    copy.receiveShadow = node.receiveShadow;
    copy.frustumCulled = false;
    copy.renderOrder = node.renderOrder;
    copy.customDepthMaterial = node.customDepthMaterial;
    copy.onBeforeRender = node.onBeforeRender;
    copy.onBeforeShadow = node.onBeforeShadow;
    copy.userData = {
      ...node.userData,
      isKitbashItem: true,
      kitbashName: newName || `${node.userData?.kitbashName || node.name || 'Bagian'} (Salinan)`,
    };
    delete copy.userData._faceMask;
    delete copy.userData._originalIndex;
    delete copy.userData._activeFaceMap;
    delete copy.userData._faceAdjByPos;
    if (node.userData?._faceMask) {
      copy.userData._faceMask = node.userData._faceMask.slice();
      copy.userData._originalIndex = node.userData._originalIndex.slice();
      copy.userData._activeFaceMap = node.userData._activeFaceMap.slice();
    }

    for (const child of node.children) {
      if (ou(child) || child.userData?.isDebugOverlay) continue;
      copy.add(cloneSingle(child));
    }
    return copy;
  };

  return cloneSingle(source);
}

/**
 * Re-parents `object` to `targetParent` while preserving its world-space transform.
 */
export function reparentPreservingWorld(object, targetParent) {
  if (!object || !targetParent || object === targetParent) return false;
  object.updateMatrixWorld(true);
  targetParent.updateMatrixWorld(true);
  const worldMat = object.matrixWorld.clone();
  const invTarget = targetParent.matrixWorld.clone().invert();
  const localMat = invTarget.multiply(worldMat);
  localMat.decompose(_pos, _quat, _scale);
  targetParent.add(object);
  object.position.copy(_pos);
  object.quaternion.copy(_quat);
  object.scale.copy(_scale);
  object.updateMatrixWorld(true);
  return true;
}

/**
 * Binds a rigid Mesh (or Group of Meshes) onto the host skeleton by assigning
 * each vertex to its nearest 2 main bones in current world space.
 */
export function autoSkinObjectToHost(object, hostRoot, mainBones) {
  if (!object || !hostRoot || !mainBones || mainBones.length === 0) return [];
  hostRoot.updateMatrixWorld(true);
  object.updateMatrixWorld(true);

  const bonePositions = mainBones.map((b) => new THREE.Vector3().setFromMatrixPosition(b.matrixWorld));
  const boneInverses = mainBones.map((b) => b.matrixWorld.clone().invert());
  const sharedSkeleton = new THREE.Skeleton(mainBones, boneInverses);

  const created = [];
  const toConvert = [];
  object.traverse((c) => {
    if (c.isMesh && !c.isSkinnedMesh && !ou(c) && !c.userData?.isDebugOverlay) {
      toConvert.push(c);
    }
  });

  const vWorld = new THREE.Vector3();
  const invHost = hostRoot.matrixWorld.clone().invert();

  for (const mesh of toConvert) {
    const geom = mesh.geometry.clone();
    // Bake mesh's current world transform into host-local bind space
    _mat.multiplyMatrices(invHost, mesh.matrixWorld);
    geom.applyMatrix4(_mat);

    const pos = geom.attributes.position;
    const count = pos.count;
    const skinIdx = new Uint16Array(count * 4);
    const skinW = new Float32Array(count * 4);

    for (let i = 0; i < count; i++) {
      vWorld.fromBufferAttribute(pos, i).applyMatrix4(hostRoot.matrixWorld);
      let b1 = 0;
      let d1 = Infinity;
      let b2 = 0;
      let d2 = Infinity;
      for (let b = 0; b < bonePositions.length; b++) {
        const d = vWorld.distanceToSquared(bonePositions[b]);
        if (d < d1) {
          d2 = d1;
          b2 = b1;
          d1 = d;
          b1 = b;
        } else if (d < d2) {
          d2 = d;
          b2 = b;
        }
      }
      const dist1 = Math.sqrt(d1) + 1e-4;
      const dist2 = Math.sqrt(d2) + 1e-4;
      const w1Raw = 1 / (dist1 * dist1);
      const w2Raw = d2 < Infinity ? 1 / (dist2 * dist2) : 0;
      const sum = w1Raw + w2Raw || 1;
      skinIdx[i * 4] = b1;
      skinIdx[i * 4 + 1] = b2;
      skinW[i * 4] = w1Raw / sum;
      skinW[i * 4 + 1] = w2Raw / sum;
    }

    geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIdx, 4));
    geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinW, 4));

    const skinned = new THREE.SkinnedMesh(geom, mesh.material);
    skinned.name = mesh.name;
    skinned.castShadow = mesh.castShadow;
    skinned.receiveShadow = mesh.receiveShadow;
    skinned.frustumCulled = false;
    skinned.userData = { ...mesh.userData, isAutoSkinned: true };
    skinned.bind(sharedSkeleton, new THREE.Matrix4());

    hostRoot.add(skinned);
    mesh.parent?.remove(mesh);
    created.push(skinned);
  }
  return created;
}
