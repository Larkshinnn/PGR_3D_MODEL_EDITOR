import * as THREE from 'three';
import { dbDelete, dbGet, dbGetAll, dbPut } from './studioDb.js';

/**
 * Pose serialization, cross-character mapping, mirroring (L <-> R),
 * scoped apply, .pose.json import/export, and IndexedDB library storage.
 */

const SCOPE_ROLES = {
  all: null,
  upper: new Set(['spine', 'neck', 'head', 'clavicle', 'upperArm', 'forearm', 'hand', 'finger']),
  lower: new Set(['com', 'pelvis', 'thigh', 'calf', 'foot']),
  hands: new Set(['hand', 'finger']),
};

const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _qRaw = new THREE.Quaternion();
const _qRootInv = new THREE.Quaternion();
const _qSrcBase = new THREE.Quaternion();
const _qDstBase = new THREE.Quaternion();
const _v1 = new THREE.Vector3();

function swapSideCanonical(key) {
  if (!key) return key;
  if (key.endsWith(':L')) return `${key.slice(0, -2)}:R`;
  if (key.endsWith(':R')) return `${key.slice(0, -2)}:L`;
  if (key.startsWith('fingerL')) return `fingerR${key.slice(7)}`;
  if (key.startsWith('fingerR')) return `fingerL${key.slice(7)}`;
  return key;
}

function swapSideRawName(name) {
  if (!name) return name;
  return name
    .replace(/\bLeft\b/g, '__RIGHT__')
    .replace(/\bRight\b/g, 'Left')
    .replace(/__RIGHT__/g, 'Right')
    .replace(/(\b|Bip\d+\s*)L(\s*[A-Z])/g, '$1__R__$2')
    .replace(/(\b|Bip\d+\s*)R(\s*[A-Z])/g, '$1L$2')
    .replace(/__R__/g, 'R');
}

export function captureViewportThumbnail(canvas, maxSize = 220) {
  if (typeof document === 'undefined' || !canvas || !canvas.width || !canvas.height) return null;
  const aspect = canvas.width / canvas.height;
  const w = aspect >= 1 ? maxSize : Math.max(1, Math.round(maxSize * aspect));
  const h = aspect >= 1 ? Math.max(1, Math.round(maxSize / aspect)) : maxSize;
  const thumb = document.createElement('canvas');
  thumb.width = w;
  thumb.height = h;
  const ctx = thumb.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#1b1c1f';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(canvas, 0, 0, w, h);
  try {
    return thumb.toDataURL('image/webp', 0.82);
  } catch {
    return thumb.toDataURL('image/png');
  }
}

export function serializePose({
  id = null,
  name = 'Pose Baru',
  rig,
  model = null,
  morphParts = [],
  morphOverrides = null,
  clipName = null,
  clipTime = 0,
  bindPoseActive = false,
  thumbnail = null,
  includeMorphs = true,
  includeRoot = true,
  includeClip = false,
} = {}) {
  const bones = {};
  if (rig) {
    const entries = rig.posedEntries ? rig.posedEntries() : rig.entries;
    for (const entry of entries) {
      if (!entry.active) continue;
      const key = entry.rawName || entry.bone.userData?.originalName || entry.bone.name;
      if (!key) continue;
      bones[key] = {
        canonical: entry.canonicalKey || null,
        role: entry.role,
        side: entry.side,
        q: entry.offset.toArray(),
        localQ: entry.bone.quaternion.toArray(),
        p: entry.movable ? entry.posOffset.toArray() : null,
      };
    }
  }

  const morphs = {};
  if (includeMorphs && morphParts.length > 0) {
    for (const part of morphParts) {
      const influences = part.object?.morphTargetInfluences;
      if (!influences) continue;
      for (const target of part.targets) {
        const val = influences[target.index] ?? 0;
        if (val > 0.001) {
          morphs[`${part.label}/${target.name}`] = Number(val.toFixed(4));
        }
      }
    }
    if (morphOverrides) {
      for (const ov of morphOverrides.values()) {
        const part = morphParts.find((p) => p.object === ov.object);
        const target = part?.targets.find((t) => t.index === ov.index);
        if (part && target && ov.value > 0.001) {
          morphs[`${part.label}/${target.name}`] = Number(ov.value.toFixed(4));
        }
      }
    }
  }

  return {
    type: 'kurumi-pose',
    version: 1,
    id: id || `pose_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: String(name || 'Pose Baru').trim(),
    skeleton: 'Bip001',
    space: 'offset',
    createdAt: new Date().toISOString(),
    base: includeClip ? { clip: clipName || null, time: Number(clipTime || 0), bindPose: Boolean(bindPoseActive) } : { clip: null, time: 0, bindPose: Boolean(bindPoseActive) },
    root: includeRoot && model
      ? { scale: Number(model.scale.x.toFixed(4)), rotationY: Number(THREE.MathUtils.radToDeg(model.rotation.y).toFixed(2)) }
      : null,
    bones,
    pins: rig ? { feet: Boolean(rig.pins.feet), hands: Boolean(rig.pins.hands) } : { feet: true, hands: false },
    morphs,
    thumbnail,
  };
}

function mirrorQuaternionViaRigBases(qOffset, srcBone, dstBone, modelRoot) {
  if (!srcBone || !dstBone) {
    return _q1.set(qOffset.x, -qOffset.y, -qOffset.z, qOffset.w).normalize();
  }
  if (modelRoot) {
    modelRoot.getWorldQuaternion(_qRootInv).invert();
  } else {
    _qRootInv.identity();
  }
  srcBone.getWorldQuaternion(_qSrcBase).premultiply(_qRootInv);
  dstBone.getWorldQuaternion(_qDstBase).premultiply(_qRootInv);

  // R_model = W_src * qOffset * W_src^-1
  _q1.copy(_qSrcBase).multiply(qOffset).multiply(_q2.copy(_qSrcBase).invert());
  // Reflect rotation across YZ plane (x -> -x): (x, -y, -z, w)
  _q1.set(_q1.x, -_q1.y, -_q1.z, _q1.w).normalize();
  // Project back into dstBone's base local frame: W_dst^-1 * R_mirrored * W_dst
  return _q2.copy(_qDstBase).invert().multiply(_q1).multiply(_qDstBase).normalize();
}

export function applyPoseData(
  poseData,
  {
    rig,
    model = null,
    morphParts = [],
    setMorphOverride = null,
    clearMorphs = null,
    scope = 'all',
    mirror = false,
    applyMorphs = true,
    applyPins = true,
    applyRoot = false,
  } = {},
) {
  if (!poseData || !rig) return { appliedCount: 0, missingBones: [] };
  const allowedRoles = SCOPE_ROLES[scope] ?? null;

  const entries = rig.posedEntries ? rig.posedEntries() : rig.entries;
  const byRawName = new Map();
  const byCanonical = new Map();
  for (const entry of entries) {
    const raw = entry.rawName || entry.bone.userData?.originalName || entry.bone.name;
    if (raw) byRawName.set(raw, entry);
    if (entry.canonicalKey) byCanonical.set(entry.canonicalKey, entry);
  }

  const wasAttached = rig.attached;
  rig.detach();
  model?.updateMatrixWorld(true);

  if (scope === 'all') {
    for (const entry of entries) {
      entry.offset.identity();
      entry.posOffset.set(0, 0, 0);
      entry.active = false;
    }
  } else if (allowedRoles) {
    for (const entry of entries) {
      if (!allowedRoles.has(entry.role)) continue;
      entry.offset.identity();
      entry.posOffset.set(0, 0, 0);
      entry.active = false;
    }
  }

  let appliedCount = 0;
  const missingBones = [];
  const savedBones = poseData.bones || {};

  for (const [savedName, saved] of Object.entries(savedBones)) {
    if (!saved || !Array.isArray(saved.q)) continue;
    const targetCanonical = mirror ? swapSideCanonical(saved.canonical) : saved.canonical;
    const targetName = mirror ? swapSideRawName(savedName) : savedName;

    const dstEntry =
      (targetCanonical && byCanonical.get(targetCanonical)) ||
      byRawName.get(targetName) ||
      (!mirror ? byRawName.get(savedName) : null);

    if (!dstEntry) {
      missingBones.push(savedName);
      continue;
    }
    if (allowedRoles && !allowedRoles.has(dstEntry.role)) continue;

    const qRaw = _qRaw.fromArray(saved.q).normalize();
    if (mirror) {
      const srcEntry =
        (saved.canonical && byCanonical.get(saved.canonical)) ||
        byRawName.get(savedName) ||
        null;
      const mirrored = mirrorQuaternionViaRigBases(qRaw, srcEntry?.bone, dstEntry.bone, model);
      dstEntry.offset.copy(mirrored);
    } else {
      dstEntry.offset.copy(qRaw);
    }

    if (dstEntry.movable && Array.isArray(saved.p)) {
      _v1.fromArray(saved.p);
      if (mirror) _v1.x = -_v1.x;
      dstEntry.posOffset.copy(_v1);
    } else {
      dstEntry.posOffset.set(0, 0, 0);
    }

    const rotated = 2 * Math.acos(Math.min(1, Math.abs(dstEntry.offset.w))) > 1e-4;
    const moved = dstEntry.movable && dstEntry.posOffset.lengthSq() > 1e-10;
    dstEntry.active = rotated || moved;
    if (dstEntry.active) appliedCount++;
  }

  if (applyPins && poseData.pins) {
    rig.pins.feet = Boolean(poseData.pins.feet);
    rig.pins.hands = Boolean(poseData.pins.hands);
  }

  if (applyRoot && model && poseData.root) {
    if (Number.isFinite(poseData.root.scale)) model.scale.setScalar(poseData.root.scale);
    if (Number.isFinite(poseData.root.rotationY)) {
      model.rotation.y = THREE.MathUtils.degToRad(poseData.root.rotationY);
    }
  }

  if (applyMorphs && poseData.morphs && setMorphOverride) {
    if (clearMorphs && scope === 'all') clearMorphs();
    for (const [morphPath, val] of Object.entries(poseData.morphs)) {
      const slash = morphPath.indexOf('/');
      const partName = slash >= 0 ? morphPath.slice(0, slash) : null;
      const targetName = slash >= 0 ? morphPath.slice(slash + 1) : morphPath;
      const part = (partName && morphParts.find((p) => p.label === partName)) || morphParts[0];
      const target = part?.targets.find((t) => t.name === targetName);
      if (part && target) {
        setMorphOverride(part.object, target.index, Number(val));
      }
    }
  }

  if (wasAttached) rig.attach();
  rig.commitChange?.();
  return { appliedCount, missingBones };
}

export function validatePoseJson(data) {
  if (!data || typeof data !== 'object') return [];
  if (data.type === 'kurumi-pose-bundle' && Array.isArray(data.poses)) {
    return data.poses.filter((p) => p && typeof p.bones === 'object');
  }
  if (data.type === 'kurumi-pose' || typeof data.bones === 'object') {
    return [data];
  }
  return [];
}

export async function listSavedPoses() {
  const list = await dbGetAll('poses');
  return list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export async function savePoseRecord(pose) {
  const record = {
    ...pose,
    id: pose.id || `pose_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    updatedAt: new Date().toISOString(),
  };
  await dbPut('poses', record);
  return record;
}

export async function getPoseRecord(id) {
  return dbGet('poses', id);
}

export async function deletePoseRecord(id) {
  return dbDelete('poses', id);
}
