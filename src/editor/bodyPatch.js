import * as THREE from 'three';
import { createBindSampler, createOwnerLookup, vertexOwner } from '../pose/skinnedBind.js';
import { au, createGroundShadowMesh, computeGroundShadowReach, xs } from '../materials/pgrToon.js';
import { buildLegRings, buildTrunkRings, buildTubeRings, fillShellHoles, loftRings } from './limbGeometry.js';
import { readTexturePixels, texelAt } from './texturePixels.js';

/**
 * Body patches: fills areas left bare when clothing/armor parts are hidden or cut.
 *
 * Supports:
 * - Regional trunk split (`pelvis`, `torso`, `neck`) so hiding only `Down` or
 *   only `Cloth` still detects and fills the exact missing anatomical area.
 * - Partial limb spans (`startAt`..`endAt`) so hiding partial coverings like
 *   `Sock` fills knee / lower-thigh gaps seamlessly.
 * - Per-part `rewriteOnHide` flag so individual parts can be switched between
 *   "rewrite into skin when hidden" and "stay empty when hidden".
 * - Face-mask awareness (Edit Mode deleted triangles trigger patching underneath).
 * - Modes: `'hybrid'` (fitted anatomical body + shell hands), `'shell'` (hidden
 *   part's own surface with hole-filling), and `'plain'` (procedural geometry).
 */

const SIDE = { L: 'kiri', R: 'kanan' };
const BARE_SHARE = 0.1;
const MIN_VERTICES = 16;
const SLICES = 10;
const MIN_PER_SLICE = 3;
const TRUNK_SLICES = 24;
const TRUNK_SECTORS = 16;
const TRUNK_CELLS = TRUNK_SLICES * TRUNK_SECTORS;
const TRUNK_ROLES = new Set(['pelvis', 'spine', 'neck', 'clavicle']);
const ORNAMENT_BONE_RE = /ribbon|skirt|frill|lace|bow|bangs|cape|cloak|wing|feather|tail|bell|strap|tassel/i;
const BREAST_BONE_RE = /oppein|breast|bust|boob|chest|pec|glute|butt|hip/i;
const SKIN_SAMPLES = 600;
const NOT_SKIN = /hair|eye|brow|shade|clock|weapon|face/i;

export const NON_REWRITE_DEFAULT_RE = /hair|eye|brow|shade|clock|weapon|face|glasses|halo|wing/i;

const TRUNK_SUBREGIONS = [
  { id: 'pelvis', label: 'Pinggul & panggul', sliceRange: [0, 9], section: 'pelvis' },
  { id: 'torso', label: 'Badan & dada', sliceRange: [10, 19], section: 'torso' },
  { id: 'neck', label: 'Leher & bahu', sliceRange: [20, 23], section: 'neck' },
];

const _owner = { owner: null, weight: 0 };

function nameOf(object) {
  return String(object?.userData?.originalName || object?.name || '');
}

function materialOf(mesh) {
  return Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1] ?? 0;
}

function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * fraction)))];
}

function sampleMesh(mesh) {
  const material = materialOf(mesh);
  const uv = mesh.geometry?.attributes?.uv;
  const pixels = readTexturePixels(material?.map);
  if (!uv || !pixels) return [];
  const step = Math.max(1, Math.floor(uv.count / SKIN_SAMPLES));
  const out = [];
  for (let i = 0; i < uv.count; i += step) {
    out.push({
      index: i,
      u: uv.getX(i),
      v: uv.getY(i),
      color: texelAt(pixels, uv.getX(i), uv.getY(i), [0, 0, 0, 0]),
    });
  }
  return out;
}

const colorDistance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function defaultPartRewriteOnHide(label) {
  return !NON_REWRITE_DEFAULT_RE.test(String(label || ''));
}

export function createBodyPatcher({ rig, parts, bindWorld, physicsBones = new Set(), pgrModel, radiusOf = () => 0 }) {
  if (!rig || rig.limbs.length === 0) return null;

  const mainBones = rig.entries.filter((entry) => entry.role !== 'com').map((entry) => entry.bone);
  // Keep breast/chest soft-tissue bones resolvable to Spine2 so bra cups & bust meshes aren't dropped as orphans.
  const patchPhysicsBones = new Set(
    [...physicsBones].filter((bone) => !BREAST_BONE_RE.test(nameOf(bone))),
  );
  const ownerOf = createOwnerLookup(mainBones, patchPhysicsBones);
  const bindPosition = (bone) => new THREE.Vector3().setFromMatrixPosition(bindWorld.get(bone) ?? bone.matrixWorld);

  const nextJoint = new Map();
  for (const limb of rig.limbs) {
    nextJoint.set(limb.upper, limb.mid);
    nextJoint.set(limb.mid, limb.end);
  }
  const axes = new Map(
    [...nextJoint].map(([bone, next]) => {
      const from = bindPosition(bone);
      const along = bindPosition(next).sub(from);
      const length = along.length() || 1;
      return [bone, { from, dir: along.multiplyScalar(1 / length), length }];
    }),
  );

  const up = new THREE.Vector3(0, 1, 0);
  const forward = new THREE.Vector3(0, 0, 1);
  const leftLeg = rig.bones.legs.L?.upper ?? rig.bones.arms.L?.upper;
  const rightLeg = rig.bones.legs.R?.upper ?? rig.bones.arms.R?.upper;
  if (leftLeg && rightLeg) {
    forward.crossVectors(up, bindPosition(rightLeg).sub(bindPosition(leftLeg)));
    if (forward.lengthSq() > 1e-10) forward.normalize();
    else forward.set(0, 0, 1);
  }
  const lateralAxis = new THREE.Vector3().crossVectors(up, forward).normalize();

  const trunkBones = rig.entries.filter((entry) => TRUNK_ROLES.has(entry.role)).map((entry) => entry.bone);
  const trunkSet = new Set(trunkBones);
  let trunk = null;
  const trunkTop = rig.bones.neck ?? rig.bones.head ?? rig.bones.spine[rig.bones.spine.length - 1];
  if (rig.bones.pelvis && trunkTop) {
    const from = bindPosition(rig.bones.pelvis);
    const along = bindPosition(trunkTop).sub(from);
    const length = along.length();
    if (length > 1e-4) {
      const dir = along.multiplyScalar(1 / length);
      const front = forward.clone().addScaledVector(dir, -forward.dot(dir)).normalize();
      trunk = { from, to: bindPosition(trunkTop), dir, length, front, side: new THREE.Vector3().crossVectors(dir, front) };
    }
  }

  const trunkT = (point) => point.clone().sub(trunk.from).dot(trunk.dir) / trunk.length;
  const trunkCell = (point) => {
    const rel = _tmpPt.copy(point).sub(trunk.from);
    const t = rel.dot(trunk.dir) / trunk.length;
    const slice = THREE.MathUtils.clamp(Math.floor(((t + 0.35) / 1.5) * TRUNK_SLICES), 0, TRUNK_SLICES - 1);
    const angle = Math.atan2(rel.dot(trunk.side), rel.dot(trunk.front));
    const sector = Math.min(TRUNK_SECTORS - 1, Math.floor(((angle + Math.PI) / (2 * Math.PI)) * TRUNK_SECTORS));
    return slice * TRUNK_SECTORS + sector;
  };
  const _tmpPt = new THREE.Vector3();

  // Default full-mesh coverage (bind pose) & live coverage (excluding Edit-Mode deleted faces)
  const defaultCoverage = new Map();
  const liveCoverage = new Map();
  const shellCoverage = new Map();
  const defaultTrunkCoverage = new Map();
  const liveTrunkCoverage = new Map();
  const shellTrunkCoverage = new Map();
  const ornamentVertexMask = new Map();
  const ownerIndex = new Map();
  const cellIndex = new Map();
  const samplers = new Map();
  const mainIndex = new Map(mainBones.map((bone, index) => [bone, index]));

  // Trunk anatomical profile samples gathered from skin/inner clothing meshes
  const trunkSliceLat = Array.from({ length: TRUNK_SLICES }, () => []);
  const trunkSliceFwd = Array.from({ length: TRUNK_SLICES }, () => []);

  const _point = new THREE.Vector3();
  const _rel = new THREE.Vector3();

  function activeVerticesForPart(part) {
    const geom = part.object?.geometry;
    if (!geom) return null;
    const mask = part.faceMask ?? part.object?.userData?._faceMask;
    if (!mask) return null;
    const idx = geom.index;
    const count = geom.attributes.position.count;
    const active = new Uint8Array(count);
    // When meshEdit.applyFaceMask already filtered geom.index against _originalIndex,
    // every vertex remaining in geom.index is active.
    if (part.object?.userData?._originalIndex && part.object?.userData?._faceMask) {
      if (!idx) return active;
      for (let i = 0; i < idx.count; i++) active[idx.getX(i)] = 1;
      return active;
    }
    const triCount = idx ? Math.floor(idx.count / 3) : Math.floor(count / 3);
    for (let t = 0; t < triCount; t++) {
      if (mask[t] === 0) continue;
      const a = idx ? idx.getX(t * 3) : t * 3;
      const b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
      const c = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      active[a] = 1;
      active[b] = 1;
      active[c] = 1;
    }
    return active;
  }

  function buildOrnamentMask(part, sampler) {
    const mask = new Uint8Array(sampler.count);
    const geom = part.object?.geometry;
    const si = geom?.attributes?.skinIndex;
    const sw = geom?.attributes?.skinWeight;
    if (!si || !sw) return mask;
    for (let i = 0; i < sampler.count; i++) {
      let ornWeight = 0;
      for (let k = 0; k < 4; k++) {
        const bone = sampler.bones[si.getComponent(i, k)];
        const w = sw.getComponent(i, k);
        if (!bone || w <= 0) continue;
        const bName = nameOf(bone);
        if (!BREAST_BONE_RE.test(bName) && (physicsBones.has(bone) || ORNAMENT_BONE_RE.test(bName))) {
          ornWeight += w;
        }
      }
      if (ornWeight >= 0.35) mask[i] = 1;
    }
    return mask;
  }

  function computePartCoverage(part, { useMask = false, skipOrnaments = false } = {}) {
    const sampler = samplers.get(part);
    const slices = new Map();
    const cells = new Uint32Array(TRUNK_CELLS);
    if (!sampler) return { slices, cells };

    const activeVerts = useMask ? activeVerticesForPart(part) : null;
    const ornMask = skipOrnaments ? ornamentVertexMask.get(part) : null;
    const perVertex = ownerIndex.get(part);
    const perCell = cellIndex.get(part);
    const owners = sampler.bones.map(ownerOf);

    for (let i = 0; i < sampler.count; i++) {
      if (activeVerts && !activeVerts[i]) continue;
      if (ornMask && ornMask[i]) continue;
      const { owner, weight } = vertexOwner(sampler, owners, i, _owner);
      if (!owner || weight < 0.25) continue;
      if (perVertex && !useMask && !skipOrnaments) perVertex[i] = mainIndex.get(owner);

      if (trunk && trunkSet.has(owner)) {
        const cell = perCell && useMask ? perCell[i] : trunkCell(sampler.positionAt(i, _point));
        if (perCell && !useMask && !skipOrnaments) perCell[i] = cell;
        if (weight >= 0.5 && cell >= 0) cells[cell]++;
        continue;
      }
      if (weight < 0.5) continue;
      let counts = slices.get(owner);
      if (!counts) {
        counts = new Uint32Array(axes.has(owner) ? SLICES : 1);
        slices.set(owner, counts);
      }
      const axis = axes.get(owner);
      if (!axis) {
        counts[0]++;
        continue;
      }
      const t = sampler.positionAt(i, _point).sub(axis.from).dot(axis.dir) / axis.length;
      counts[THREE.MathUtils.clamp(Math.floor(t * SLICES), 0, SLICES - 1)]++;
    }
    return { slices, cells };
  }

  for (const part of parts) {
    if (part.rewriteOnHide === undefined) {
      part.rewriteOnHide = defaultPartRewriteOnHide(part.label);
    }
    const sampler = createBindSampler(part.object);
    samplers.set(part, sampler);
    if (!sampler) {
      defaultCoverage.set(part, new Map());
      liveCoverage.set(part, new Map());
      shellCoverage.set(part, new Map());
      defaultTrunkCoverage.set(part, new Uint32Array(TRUNK_CELLS));
      liveTrunkCoverage.set(part, new Uint32Array(TRUNK_CELLS));
      shellTrunkCoverage.set(part, new Uint32Array(TRUNK_CELLS));
      ornamentVertexMask.set(part, new Uint8Array(0));
      continue;
    }
    ownerIndex.set(part, new Int16Array(sampler.count).fill(-1));
    cellIndex.set(part, new Int16Array(sampler.count).fill(-1));
    ornamentVertexMask.set(part, buildOrnamentMask(part, sampler));
    const { slices, cells } = computePartCoverage(part, { useMask: false });
    defaultCoverage.set(part, slices);
    liveCoverage.set(part, slices);
    defaultTrunkCoverage.set(part, cells);
    liveTrunkCoverage.set(part, cells);
    const shellCov = computePartCoverage(part, { useMask: false, skipOrnaments: true });
    shellCoverage.set(part, shellCov.slices);
    shellTrunkCoverage.set(part, shellCov.cells);

    // Sample radial silhouette primarily from skin/Body mesh (skipping flared outer skirts/dresses)
    const hasDedicatedBody = parts.some((p) => p.defaultVisible && /body|skin/i.test(p.label));
    if (trunk && part.defaultVisible && !NOT_SKIN.test(part.label)) {
      const isBody = /body|skin/i.test(part.label);
      if (!hasDedicatedBody || isBody) {
        const owners = sampler.bones.map(ownerOf);
        const step = Math.max(1, Math.floor(sampler.count / 1500));
        for (let i = 0; i < sampler.count; i += step) {
          const { owner, weight } = vertexOwner(sampler, owners, i, _owner);
          if (!owner || weight < 0.5 || !trunkSet.has(owner)) continue;
          sampler.positionAt(i, _point);
          _rel.copy(_point).sub(trunk.from);
          const t = _rel.dot(trunk.dir) / trunk.length;
          const sl = THREE.MathUtils.clamp(Math.floor(((t + 0.35) / 1.5) * TRUNK_SLICES), 0, TRUNK_SLICES - 1);
          const lat = Math.abs(_rel.dot(trunk.side));
          const fwd = Math.abs(_rel.dot(trunk.front));
          trunkSliceLat[sl].push(lat);
          trunkSliceFwd[sl].push(fwd);
        }
      }
    }
  }

  const measuredTrunkProfile = trunk
    ? Array.from({ length: TRUNK_SLICES }, (_, sl) => {
        const t = ((sl + 0.5) / TRUNK_SLICES) * 1.5 - 0.35;
        const lats = trunkSliceLat[sl];
        const fwds = trunkSliceFwd[sl];
        const rx = lats.length >= 4 ? percentile(lats, 0.55) : 0;
        const rz = fwds.length >= 4 ? percentile(fwds, 0.45) : 0;
        return [t, rx, rz];
      })
    : null;

  const isPartVisible = (part) => Boolean(part.object?.visible) && !part.deleted;
  const shouldRewrite = (part) => part.rewriteOnHide !== false;

  const slicesStateOn = (bone) => {
    const len = axes.has(bone) ? SLICES : 1;
    const expected = new Uint32Array(len);
    const now = new Uint32Array(len);
    for (const part of parts) {
      const shown = isPartVisible(part);
      const liveCounts = liveCoverage.get(part)?.get(bone);
      if (shown && liveCounts) {
        for (let k = 0; k < len; k++) now[k] += liveCounts[k];
      }
      if (shouldRewrite(part)) {
        if (part.defaultVisible) {
          const defCounts = defaultCoverage.get(part)?.get(bone);
          if (defCounts) for (let k = 0; k < len; k++) expected[k] += defCounts[k];
        }
      } else if (shown && liveCounts) {
        for (let k = 0; k < len; k++) expected[k] += liveCounts[k];
      }
    }
    return { expected, now };
  };

  /** Missing slice info on a bone: returns missing slice indices & bare boolean. */
  const boneMissingInfo = (bone) => {
    const { expected, now } = slicesStateOn(bone);
    if (expected.length === 1) {
      const bare = expected[0] >= MIN_VERTICES && now[0] < expected[0] * BARE_SHARE;
      return { expected, now, missing: bare ? [0] : [], bare };
    }
    const missing = [];
    let covered = 0;
    for (let k = 0; k < expected.length; k++) {
      if (expected[k] < MIN_PER_SLICE) continue;
      covered++;
      if (now[k] < MIN_PER_SLICE) missing.push(k);
    }
    // Trigger if >= 2 slices lost OR an exposed joint/end slice lost significant coverage
    const significantSingle =
      missing.length === 1 &&
      expected[missing[0]] >= 10 &&
      (missing[0] === 0 || missing[0] === expected.length - 1);
    const bare = covered >= 1 && (missing.length >= 2 || significantSingle);
    return { expected, now, missing, bare };
  };

  const isBare = (bone) => boneMissingInfo(bone).bare;

  /** Trunk loss per subregion (`sliceRange: [sMin, sMax]`). */
  const trunkRegionLoss = (sliceRange = [0, TRUNK_SLICES - 1]) => {
    const lost = new Uint8Array(TRUNK_CELLS);
    let covered = 0;
    let count = 0;
    const [sMin, sMax] = sliceRange;
    for (let slice = sMin; slice <= sMax; slice++) {
      for (let sector = 0; sector < TRUNK_SECTORS; sector++) {
        const k = slice * TRUNK_SECTORS + sector;
        let expected = 0;
        let now = 0;
        for (const part of parts) {
          const shown = isPartVisible(part);
          const defVal = defaultTrunkCoverage.get(part)?.[k] ?? 0;
          const liveVal = liveTrunkCoverage.get(part)?.[k] ?? 0;
          if (shown) now += liveVal;
          if (shouldRewrite(part)) {
            if (part.defaultVisible) expected += defVal;
          } else if (shown) {
            expected += liveVal;
          }
        }
        if (expected < MIN_PER_SLICE) continue;
        covered++;
        if (now < MIN_PER_SLICE || (expected - now >= 20 && now < expected * 0.25)) {
          lost[k] = 1;
          count++;
        }
      }
    }
    const bare = covered >= 3 && (count >= 2 || count >= covered * 0.1);
    return { lost, covered, count, bare };
  };

  /**
   * Checks whether a hidden `defaultVisible && rewriteOnHide` clothing part has
   * significant structural (non-ornament) coverage in a region's core band.
   * Ensures hiding tight/skimpy clothing (e.g. a bikini top over partial skin)
   * still triggers direct skin-color shell replacement even when adjacent skin falls in the same cells.
   */
  const partCoversCoreRegion = (part, region) => {
    if (!(part.defaultVisible || part.wasVisible) || isPartVisible(part) || !shouldRewrite(part)) return false;
    if (!part.object?.isSkinnedMesh || NOT_SKIN.test(part.label) || /^(body|skin)\b/i.test(part.label)) {
      return false;
    }
    if (region.trunk) {
      if (region.id === 'neck') return false;
      const cells = shellTrunkCoverage.get(part);
      if (!cells) return false;
      const [sMin, sMax] = region.sliceRange;
      const lo = region.id === 'pelvis' ? sMin : sMin;
      const hi = region.id === 'pelvis' ? Math.max(sMin, sMax - 2) : sMax;
      let count = 0;
      for (let sl = lo; sl <= hi; sl++) {
        for (let sec = 0; sec < TRUNK_SECTORS; sec++) {
          count += cells[sl * TRUNK_SECTORS + sec];
          if (count >= MIN_VERTICES) return true;
        }
      }
      return false;
    }
    const cov = shellCoverage.get(part);
    if (!cov) return false;
    let count = 0;
    for (const bone of region.bones) {
      for (const value of cov.get(bone) ?? []) count += value;
    }
    return count >= MIN_VERTICES * 2;
  };

  const isRegionBare = (region) => {
    const bareByLoss = region.trunk
      ? trunkRegionLoss(region.sliceRange).bare
      : region.bones.some(isBare);
    if (bareByLoss) return true;
    if (mode === 'shell') {
      return parts.some((part) => partCoversCoreRegion(part, region));
    }
    return false;
  };

  const missingSpanForBone = (bone) => {
    const info = boneMissingInfo(bone);
    if (info.missing.length === 0) return [-0.06, 1.06];
    const minIdx = info.missing[0];
    const maxIdx = info.missing[info.missing.length - 1];
    const startAt = minIdx === 0 ? -0.08 : Math.max(-0.08, (minIdx - 0.6) / SLICES);
    const endAt = maxIdx === SLICES - 1 ? 1.08 : Math.min(1.08, (maxIdx + 1.6) / SLICES);
    return [startAt, endAt];
  };

  const regions = [];
  for (const limb of rig.limbs) {
    const side = SIDE[limb.side];
    if (limb.kind === 'leg') {
      regions.push({
        id: `leg${limb.side}`,
        label: `Kaki ${side}`,
        kind: 'leg',
        limb,
        bones: [limb.mid, limb.end],
      });
      regions.push({
        id: `thigh${limb.side}`,
        label: `Paha ${side}`,
        kind: 'tube',
        limb,
        bones: [limb.upper],
        segment: [limb.upper, limb.mid],
        parent: rig.bones.pelvis,
        child: limb.mid,
        taper: [1.18, 0.86],
      });
    } else {
      regions.push({
        id: `upperArm${limb.side}`,
        label: `Lengan atas ${side}`,
        kind: 'tube',
        limb,
        bones: [limb.upper],
        segment: [limb.upper, limb.mid],
        parent: limb.clavicle,
        child: limb.mid,
        taper: [1.08, 0.88],
      });
      regions.push({
        id: `forearm${limb.side}`,
        label: `Lengan bawah ${side}`,
        kind: 'tube',
        limb,
        bones: [limb.mid],
        segment: [limb.mid, limb.end],
        parent: limb.upper,
        child: limb.end,
        taper: [1.0, 0.72],
      });
      regions.push({
        id: `hand${limb.side}`,
        label: `Tangan ${side}`,
        kind: 'shell',
        limb,
        bones: [limb.end],
      });
    }
  }
  if (trunk && trunkBones.length) {
    for (const sub of TRUNK_SUBREGIONS) {
      regions.push({
        id: sub.id,
        label: sub.label,
        kind: 'trunk',
        trunk: true,
        section: sub.section,
        sliceRange: sub.sliceRange,
        limb: null,
        bones: trunkBones,
      });
    }
  }

  const ORDER = ['leg', 'thigh', 'pelvis', 'torso', 'neck', 'hand', 'forearm', 'upperArm'];
  const rank = (region) => ORDER.indexOf(region.id.replace(/[LR]$/, ''));
  regions.sort((x, y) => rank(x) - rank(y) || x.id.localeCompare(y.id));
  const regionById = new Map(regions.map((region) => [region.id, region]));

  /* ---------------------------------------------------------------- */
  /* Skin: which mesh, which texel                                     */
  /* ---------------------------------------------------------------- */

  function shadowMaskReader(mesh) {
    const material = pgrModel?.pgrState.get(mesh)?.material;
    const uniforms = material?.userData?.pgrUniforms;
    if (!uniforms) return null;
    const fromAlpha = (uniforms.pgrMainAlphaMask?.value ?? 0) > 0.5;
    const hasMask = (uniforms.pgrHasMask?.value ?? 0) > 0.5;
    const pixels = readTexturePixels(fromAlpha ? material.map : hasMask ? uniforms.pgrMask?.value : null);
    if (!pixels) return null;
    const { uv, uv1 } = mesh.geometry.attributes;
    const set = !fromAlpha && uv1 && (uniforms.pgrMaskUvSet?.value ?? 0) > 0.5 ? uv1 : uv;
    const scale = fromAlpha ? null : uniforms.pgrMaskScale?.value;
    const offset = fromAlpha ? null : uniforms.pgrMaskOffset?.value;
    const channel = fromAlpha ? 3 : 1;
    const px = [0, 0, 0, 0];
    return (index) => {
      const u = set.getX(index) * (scale?.x ?? 1) + (offset?.x ?? 0);
      const v = set.getY(index) * (scale?.y ?? 1) + (offset?.y ?? 0);
      return texelAt(pixels, u, v, px)[channel] / 255;
    };
  }

  let skin;
  function findSkin() {
    if (skin !== undefined) return skin;
    skin = null;

    const face = parts.find((part) => /face/i.test(part.label) || /face/i.test(materialOf(part.object)?.name ?? ''));
    const faceSamples = face ? sampleMesh(face.object) : [];
    const tone = faceSamples.length
      ? [0, 1, 2].map((channel) => median(faceSamples.map((sample) => sample.color[channel])))
      : null;

    let best = null;
    const candidates = parts.filter((part) => part !== face && part.defaultVisible && !NOT_SKIN.test(part.label));
    for (const part of candidates) {
      const samples = sampleMesh(part.object);
      if (samples.length === 0) continue;
      const matching = tone ? samples.filter((sample) => colorDistance(sample.color, tone) < 42) : samples;
      const score = matching.length * (/body|skin/i.test(part.label) ? 4 : 1);
      if (matching.length >= 8 && (!best || score > best.score)) best = { part, matching, score };
    }

    if (best) {
      const center = [0, 1, 2].map((channel) => median(best.matching.map((sample) => sample.color[channel])));
      let plain = best.matching;
      const maskAt = shadowMaskReader(best.part.object);
      if (maskAt) {
        const oddness = best.matching.map((sample) => Math.abs(maskAt(sample.index) - 0.5));
        const limit = Math.max(Math.min(...oddness) + 0.1, 0.25);
        plain = best.matching.filter((_, i) => oddness[i] <= limit);
      }
      let chosen = plain[0];
      let chosenScore = -Infinity;
      for (const sample of plain) {
        let neighbours = 0;
        for (const other of plain) {
          if (Math.hypot(sample.u - other.u, sample.v - other.v) < 0.06) neighbours++;
        }
        const score = neighbours - colorDistance(sample.color, center) * 0.05;
        if (score > chosenScore) {
          chosenScore = score;
          chosen = sample;
        }
      }
      const painted = best.part.object.geometry.attributes._pgrcolor;
      const vertexColor = painted
        ? Array.from({ length: painted.itemSize }, (_, channel) =>
            median(plain.map((sample) => painted.array[sample.index * painted.itemSize + channel])),
          )
        : null;
      skin = { mesh: best.part.object, index: chosen.index, color: center, vertexColor };
    } else if (tone) {
      skin = { mesh: null, index: -1, color: tone };
    }
    return skin;
  }

  let plainMaterial = null;
  let baseLayerMaterial = null;
  let fillStyle = 'skin'; // 'skin' | 'baselayer'
  let baseLayerColor = '#252730';

  function fallbackMaterial(color) {
    if (plainMaterial) return plainMaterial;
    plainMaterial = new THREE.MeshStandardMaterial({
      name: 'body-patch',
      color: new THREE.Color().setRGB(color[0] / 255, color[1] / 255, color[2] / 255, THREE.SRGBColorSpace),
      roughness: 1,
      metalness: 0,
    });
    plainMaterial.customProgramCacheKey = () => 'body-patch-mrt';
    plainMaterial.onBeforeCompile = (shader) => {
      shader.fragmentShader = xs(shader.fragmentShader, '0.15', 'diffuseColor.a');
    };
    return plainMaterial;
  }

  function getBaseLayerMaterial() {
    if (!baseLayerMaterial) {
      baseLayerMaterial = new THREE.MeshStandardMaterial({
        name: 'body-patch-baselayer',
        color: new THREE.Color(baseLayerColor),
        roughness: 0.78,
        metalness: 0.05,
      });
      baseLayerMaterial.customProgramCacheKey = () => 'body-patch-mrt';
      baseLayerMaterial.onBeforeCompile = (shader) => {
        shader.fragmentShader = xs(shader.fragmentShader, '0.15', 'diffuseColor.a');
      };
    } else {
      baseLayerMaterial.color.set(baseLayerColor);
    }
    return baseLayerMaterial;
  }

  function paintLikeSkin(geometry) {
    const source = findSkin();
    const count = geometry.attributes.position.count;
    if (!source?.mesh) {
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
      return;
    }
    for (const [name, attribute] of Object.entries(source.mesh.geometry.attributes)) {
      if (!(/^uv\d*$/.test(name) || name.startsWith('_pgr')) || name === '_pgrsmoothnormal') continue;
      const array = new attribute.array.constructor(count * attribute.itemSize);
      const typical = name === '_pgrcolor' ? source.vertexColor : null;
      for (let i = 0; i < count; i++) {
        for (let c = 0; c < attribute.itemSize; c++) {
          array[i * attribute.itemSize + c] = typical ? typical[c] : attribute.array[source.index * attribute.itemSize + c];
        }
      }
      geometry.setAttribute(name, new THREE.BufferAttribute(array, attribute.itemSize, attribute.normalized));
    }
  }

  /* ---------------------------------------------------------------- */
  /* Building                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * 'shell' (default): hidden part's own body-conforming surface repainted as skin.
   * 'hybrid': fitted anatomical procedural body & limbs + shell for hands/feet.
   * 'plain': procedural geometry everywhere (shell fallback only for hands).
   */
  let mode = 'shell';
  let thickness = 1;
  let suspended = false;
  const patches = new Map();
  const dismissed = new Set();

  function shellSources(region) {
    const lost = region.trunk ? trunkRegionLoss(region.sliceRange).lost : null;
    const match = (part, allowUnworn) => {
      if (isPartVisible(part) || !part.object?.isSkinnedMesh) return false;
      if (!shouldRewrite(part)) return false;
      if (!allowUnworn && !(part.defaultVisible || part.wasVisible)) return false;
      if (mode === 'shell' && partCoversCoreRegion(part, region)) return true;
      let count = 0;
      if (lost) {
        const cells = shellTrunkCoverage.get(part) ?? defaultTrunkCoverage.get(part);
        const [sMin, sMax] = region.sliceRange;
        for (let sl = sMin; sl <= sMax; sl++) {
          for (let sec = 0; sec < TRUNK_SECTORS; sec++) {
            const k = sl * TRUNK_SECTORS + sec;
            if (lost[k]) count += cells[k];
          }
        }
      } else {
        for (const bone of region.bones) {
          for (const value of (shellCoverage.get(part) ?? defaultCoverage.get(part))?.get(bone) ?? []) {
            count += value;
          }
        }
      }
      return count >= MIN_VERTICES;
    };
    const worn = parts.filter((part) => match(part, false));
    if (worn.length > 0 || region.kind !== 'shell') return worn;
    return parts.filter((part) => match(part, true));
  }

  function shellKey(region, sources) {
    const where = region.trunk
      ? trunkRegionLoss(region.sliceRange).lost.join('')
      : region.bones.map((bone) => boneMissingInfo(bone).missing.join(',')).join('|');
    return `shell:${sources.map((part) => part.index).join(',')}:${where}`;
  }

  function shellGeometry(part, region) {
    const source = part.object.geometry;
    const owners = ownerIndex.get(part);
    if (!owners) return null;
    const orn = ornamentVertexMask.get(part);
    let inRegion;
    if (region.trunk) {
      const cells = cellIndex.get(part);
      const { lost } = trunkRegionLoss(region.sliceRange);
      const partCells = shellTrunkCoverage.get(part);
      const directShell = mode === 'shell' && partCoversCoreRegion(part, region);
      const wanted = new Uint8Array(TRUNK_CELLS);
      const [sMin, sMax] = region.sliceRange;
      const rLo = Math.max(0, sMin - 2);
      const rHi = Math.min(TRUNK_SLICES - 1, sMax + 2);
      for (let slice = sMin; slice <= sMax; slice++) {
        let sliceActive = false;
        for (let sector = 0; sector < TRUNK_SECTORS; sector++) {
          const k = slice * TRUNK_SECTORS + sector;
          if (lost[k] || (directShell && partCells && partCells[k] > 0)) {
            sliceActive = true;
            break;
          }
        }
        if (!sliceActive) continue;
        // Fill full 360-degree slice band across active height interval so
        // adjacent skin/cleavage doesn't punch holes inside hidden garment shells.
        for (let ds = -2; ds <= 2; ds++) {
          const row = slice + ds;
          if (row < rLo || row > rHi) continue;
          for (let sector = 0; sector < TRUNK_SECTORS; sector++) {
            wanted[row * TRUNK_SECTORS + sector] = 1;
          }
        }
      }
      inRegion = (vertex) => (!orn || !orn[vertex]) && cells[vertex] >= 0 && wanted[cells[vertex]] === 1;
    } else {
      const directShell = mode === 'shell' && partCoversCoreRegion(part, region);
      const bare = directShell ? region.bones : region.bones.filter(isBare);
      const wanted = new Set((bare.length ? bare : region.bones).map((bone) => mainIndex.get(bone)));
      inRegion = (vertex) => (!orn || !orn[vertex]) && wanted.has(owners[vertex]);
    }

    const index = source.index;
    const count = index ? index.count : source.attributes.position.count;
    const picked = [];
    for (let i = 0; i + 2 < count; i += 3) {
      const a = index ? index.getX(i) : i;
      const b = index ? index.getX(i + 1) : i + 1;
      const c = index ? index.getX(i + 2) : i + 2;
      if (orn && (orn[a] ? 1 : 0) + (orn[b] ? 1 : 0) + (orn[c] ? 1 : 0) >= 2) continue;
      if (inRegion(a) + inRegion(b) + inRegion(c) >= 2) picked.push(a, b, c);
    }
    if (picked.length < 9) return null;

    const geometry = new THREE.BufferGeometry();
    const shared = [];
    for (const name of ['position', 'normal', 'tangent', 'skinIndex', 'skinWeight', '_pgrsmoothnormal']) {
      if (!source.attributes[name]) continue;
      geometry.setAttribute(name, source.attributes[name]);
      shared.push(name);
    }
    geometry.userData.shared = shared;
    geometry.setIndex(picked);
    paintLikeSkin(geometry);
    fillShellHoles(geometry, 48);
    return geometry;
  }

  function trunkShape(region) {
    const bones = [];
    const idxOf = new Map();
    const addBone = (bone) => {
      if (!bone) return -1;
      if (idxOf.has(bone)) return idxOf.get(bone);
      const idx = bones.length;
      bones.push(bone);
      idxOf.set(bone, idx);
      return idx;
    };

    const pelvisIdx = addBone(rig.bones.pelvis);
    const spineIdx = addBone(rig.bones.spine[0] ?? rig.bones.pelvis);
    const chestIdx = addBone(rig.bones.spine[rig.bones.spine.length - 1] ?? rig.bones.spine[0] ?? rig.bones.pelvis);
    const neckIdx = addBone(rig.bones.neck ?? rig.bones.head ?? rig.bones.spine[rig.bones.spine.length - 1]);
    const headIdx = addBone(rig.bones.head);

    const spinePoints = [];
    if (rig.bones.pelvis) spinePoints.push({ pos: bindPosition(rig.bones.pelvis), joint: pelvisIdx });
    for (const sb of rig.bones.spine) {
      spinePoints.push({ pos: bindPosition(sb), joint: addBone(sb) });
    }
    if (rig.bones.neck) spinePoints.push({ pos: bindPosition(rig.bones.neck), joint: neckIdx });
    if (rig.bones.head) spinePoints.push({ pos: bindPosition(rig.bones.head), joint: headIdx });

    const hipHalfSpan =
      rig.bones.legs.L?.upper && rig.bones.legs.R?.upper
        ? bindPosition(rig.bones.legs.L.upper).distanceTo(bindPosition(rig.bones.legs.R.upper)) * 0.5
        : 0.075;
    const shoulderHalfSpan =
      rig.bones.arms.L?.upper && rig.bones.arms.R?.upper
        ? bindPosition(rig.bones.arms.L.upper).distanceTo(bindPosition(rig.bones.arms.R.upper)) * 0.5
        : hipHalfSpan * 1.25;

    const shape = buildTrunkRings({
      section: region.section,
      pelvis: trunk.from,
      trunkTop: trunk.to,
      head: rig.bones.head ? bindPosition(rig.bones.head) : null,
      spinePoints,
      hipHalfSpan,
      shoulderHalfSpan,
      forward,
      thickness,
      measuredProfile: measuredTrunkProfile,
      joints: { pelvis: pelvisIdx, spine: spineIdx, chest: chestIdx, neck: neckIdx, head: headIdx },
    });
    return { shape, bones };
  }

  function limbShape(region, variant) {
    if (region.kind === 'trunk') return trunkShape(region);
    const { limb } = region;
    if (region.kind === 'leg' && !variant.startsWith('shin:')) {
      const knee = bindPosition(limb.mid);
      const ankle = bindPosition(limb.end);
      const toeBone = limb.end.children.find((child) => /toe/i.test(nameOf(child))) ?? null;
      const bones = [limb.mid, limb.end];
      if (limb.upper) bones.push(limb.upper);
      if (toeBone) bones.push(toeBone);
      const measured = radiusOf(limb.mid);
      const defaultMean = 0.104 * knee.distanceTo(ankle);
      // Cap fit so bulky boots don't make bare legs overly thick
      const fit = measured > 0 ? THREE.MathUtils.clamp((measured * 0.84) / defaultMean, 0.65, 0.92) : 0.9;
      const shape = buildLegRings({
        knee,
        ankle,
        toe: toeBone ? bindPosition(toeBone) : null,
        forward,
        up,
        thickness: thickness * fit,
        startAt: Number(variant.split(':')[1] ?? -0.08),
        joints: { calf: 0, foot: 1, thigh: limb.upper ? 2 : -1, toe: toeBone ? bones.length - 1 : -1 },
      });
      return { shape, bones };
    }

    const [fromBone, toBone] = region.kind === 'leg' ? [limb.mid, limb.end] : region.segment;
    const parent = region.kind === 'leg' ? limb.upper : region.parent;
    const child = region.kind === 'leg' ? limb.end : region.child;
    const taper = region.kind === 'leg' ? [1.15, 0.72] : region.taper;
    const from = bindPosition(fromBone);
    const to = bindPosition(toBone);
    const segLen = Math.max(1e-4, from.distanceTo(to));
    const measured = radiusOf(fromBone);
    // Clamp limb radius to realistic anatomical range so puffy sleeves or boots don't inflate bare limbs
    const minBase = segLen * 0.08;
    const maxBase = region.id.startsWith('forearm')
      ? segLen * 0.112
      : region.id.startsWith('upperArm')
        ? segLen * 0.128
        : segLen * 0.155;
    const rawBase = measured > 0 ? THREE.MathUtils.clamp(measured * 0.9, minBase, maxBase) : segLen * 0.12;
    const base = rawBase * thickness;
    const bones = [fromBone];
    if (parent) bones.push(parent);
    if (child) bones.push(child);

    let startAt = -0.06;
    let endAt = 1.06;
    if (variant.startsWith('tube:') || variant.startsWith('shin:')) {
      const partsArr = variant.split(':');
      startAt = Number(partsArr[1] ?? -0.06);
      endAt = Number(partsArr[2] ?? 1.06);
    }

    const shape = buildTubeRings({
      from,
      to,
      forward,
      radiusFrom: base * taper[0],
      radiusTo: base * taper[1],
      joints: { bone: 0, parent: parent ? 1 : -1, child: child ? bones.length - 1 : -1 },
      startAt,
      endAt,
    });
    return { shape, bones };
  }

  function proceduralVariantFor(region) {
    if (region.kind === 'shell') return null;
    if (region.kind === 'trunk') {
      return `trunk:${region.section}`;
    }

    if (region.kind === 'leg') {
      const shinInfo = boneMissingInfo(region.limb.mid);
      const footBare = isBare(region.limb.end);
      if (shinInfo.bare && !footBare) {
        const [lo, hi] = missingSpanForBone(region.limb.mid);
        return `shin:${lo.toFixed(2)}:${hi.toFixed(2)}`;
      }
      if (!shinInfo.bare && !footBare) return 'leg:-0.24';
      const firstMiss = shinInfo.missing[0] ?? 0;
      const start = firstMiss <= 0 ? -0.24 : Math.min((firstMiss - 0.5) / SLICES, 0.72);
      return `leg:${start <= 0.02 ? -0.24 : start.toFixed(2)}`;
    }

    const [lo, hi] = missingSpanForBone(region.bones[0]);
    return `tube:${lo.toFixed(2)}:${hi.toFixed(2)}`;
  }

  function variantFor(region) {
    if (region.kind === 'shell') {
      const sources = shellSources(region);
      return sources.length ? shellKey(region, sources) : null;
    }

    if (mode === 'shell') {
      const sources = shellSources(region);
      if (sources.length) return shellKey(region, sources);
    }

    return proceduralVariantFor(region);
  }

  function createItem(geometry, name, { skeleton, bindMatrix, parent }) {
    const useBaseLayer = fillStyle === 'baselayer';
    const source = findSkin();
    const sourceMesh = source?.mesh ?? null;
    const state = sourceMesh ? pgrModel?.pgrState.get(sourceMesh) : null;

    let material;
    if (useBaseLayer) {
      material = getBaseLayerMaterial();
    } else {
      material = state?.material ?? (sourceMesh ? sourceMesh.material : fallbackMaterial(source?.color ?? [236, 208, 200]));
    }

    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.name = name;
    mesh.userData.bodyPatch = true;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.bind(skeleton, bindMatrix);
    (parent ?? sourceMesh?.parent ?? rig.bones.pelvis?.parent).add(mesh);
    mesh.visible = !suspended;

    const item = { mesh, outline: null, caster: null };
    if (!sourceMesh || !state || !pgrModel || useBaseLayer) return item;

    mesh.renderOrder = state.renderOrder;
    mesh.castShadow = state.castShadow;
    mesh.receiveShadow = state.receiveShadow;
    mesh.customDepthMaterial = state.customDepthMaterial;
    if (state.onBeforeShadow) mesh.onBeforeShadow = state.onBeforeShadow;
    if (state.onBeforeRender) mesh.onBeforeRender = state.onBeforeRender;

    pgrModel.meshes.push(mesh);
    pgrModel.pgrState.set(mesh, { ...state });
    const pbr = pgrModel.pbrState.get(sourceMesh);
    if (pbr) pgrModel.pbrState.set(mesh, { ...pbr });

    const sourceOutline = sourceMesh.children.find((child) => child.isMesh && child.material?.name === 'pgr-outline');
    if (sourceOutline?.material) {
      const outlineMaterial = sourceOutline.material.clone();
      const defines = { ...outlineMaterial.defines };
      delete defines.PGR_VERTEX_COLOR;
      delete defines.PGR_SMOOTH_NORMAL;
      delete defines.USE_TANGENT;
      if (geometry.hasAttribute('_pgrsmoothnormal')) defines.PGR_SMOOTH_NORMAL = '';
      if (geometry.hasAttribute('tangent')) defines.USE_TANGENT = '';
      outlineMaterial.defines = defines;
      outlineMaterial.needsUpdate = true;
      item.outline = au(mesh, outlineMaterial, sourceOutline.renderOrder, 'outline');
      item.outline.receiveShadow = false;
      item.outline.visible = sourceOutline.visible;
      pgrModel.staticAuxMeshes.push(item.outline);
    }

    const sourceCaster = pgrModel.groundShadowCasters.find((caster) => caster.shadow.parent === sourceMesh);
    if (sourceCaster) {
      item.caster = {
        shadow: createGroundShadowMesh(mesh, sourceCaster.clip),
        reach: computeGroundShadowReach(mesh),
        clip: sourceCaster.clip,
        clamp: sourceCaster.clamp,
      };
      pgrModel.groundShadowCasters.push(item.caster);
    }
    return item;
  }

  function destroyItem(item) {
    const { mesh } = item;
    mesh.parent?.remove(mesh);
    if (pgrModel) {
      const drop = (list, entry) => {
        const index = list.indexOf(entry);
        if (index >= 0) list.splice(index, 1);
      };
      drop(pgrModel.meshes, mesh);
      pgrModel.pgrState.delete(mesh);
      pgrModel.pbrState.delete(mesh);
      if (item.outline) drop(pgrModel.staticAuxMeshes, item.outline);
      if (item.caster) drop(pgrModel.groundShadowCasters, item.caster);
    }
    item.outline?.material.dispose();
    for (const name of mesh.geometry.userData.shared ?? []) mesh.geometry.deleteAttribute(name);
    mesh.geometry.dispose();
  }

  function buildItems(region, variant) {
    if (variant.startsWith('shell:')) {
      const items = [];
      for (const part of shellSources(region)) {
        const geometry = shellGeometry(part, region);
        if (!geometry) continue;
        const source = part.object;
        items.push(
          createItem(geometry, `patch ${region.id} ${part.label}`, {
            skeleton: source.skeleton,
            bindMatrix: source.bindMatrix,
            parent: source.parent,
          }),
        );
      }
      return items;
    }
    const { shape, bones } = limbShape(region, variant);
    const segments = region.kind === 'trunk' ? 24 : 18;
    const geometry = loftRings(shape, { segments, capStart: true });
    paintLikeSkin(geometry);
    const skeleton = new THREE.Skeleton(
      bones,
      bones.map((bone) => (bindWorld.get(bone) ?? bone.matrixWorld).clone().invert()),
    );
    return [createItem(geometry, `patch ${region.id}`, { skeleton, bindMatrix: new THREE.Matrix4(), parent: null })];
  }

  function add(id, { auto = false } = {}) {
    const region = regionById.get(id);
    if (!region || patches.has(id)) return null;
    let variant = variantFor(region);
    if (!variant) return null;
    let items = buildItems(region, variant);
    if (items.length === 0 && variant.startsWith('shell:')) {
      const fallback = proceduralVariantFor(region);
      if (fallback) {
        variant = fallback;
        items = buildItems(region, variant);
      }
    }
    if (items.length === 0) return null;
    const patch = { id, region, variant, auto, items };
    patches.set(id, patch);
    return patch;
  }

  function remove(id) {
    const patch = patches.get(id);
    if (!patch) return false;
    patch.items.forEach(destroyItem);
    patches.delete(id);
    return true;
  }

  function rebuild(patch, variant = variantFor(patch.region)) {
    patch.items.forEach(destroyItem);
    let nextVariant = variant;
    let items = nextVariant ? buildItems(patch.region, nextVariant) : [];
    if (items.length === 0 && nextVariant?.startsWith('shell:')) {
      const fallback = proceduralVariantFor(patch.region);
      if (fallback) {
        nextVariant = fallback;
        items = buildItems(patch.region, nextVariant);
      }
    }
    patch.items = items;
    patch.variant = nextVariant;
    if (patch.items.length === 0) patches.delete(patch.id);
  }

  /** Computes coverage & missing/patched markers for debugging & coverage metrics. */
  function getGapReport() {
    let totalCovered = 0;
    let patchedCells = 0;
    let missingCells = 0;
    const markers = [];

    if (trunk) {
      for (const sub of TRUNK_SUBREGIONS) {
        const res = trunkRegionLoss(sub.sliceRange);
        totalCovered += res.covered;
        const isPatched = patches.has(sub.id);
        if (isPatched) patchedCells += res.count;
        else missingCells += res.count;

        const [sMin, sMax] = sub.sliceRange;
        for (let sl = sMin; sl <= sMax; sl++) {
          for (let sec = 0; sec < TRUNK_SECTORS; sec++) {
            const k = sl * TRUNK_SECTORS + sec;
            if (!res.lost[k]) continue;
            const t = ((sl + 0.5) / TRUNK_SLICES) * 1.5 - 0.35;
            const angle = ((sec + 0.5) / TRUNK_SECTORS) * Math.PI * 2 - Math.PI;
            const r = 0.11;
            const pos = trunk.from
              .clone()
              .addScaledVector(trunk.dir, t * trunk.length)
              .addScaledVector(trunk.front, Math.cos(angle) * r)
              .addScaledVector(trunk.side, Math.sin(angle) * r);
            markers.push({ pos, status: isPatched ? 'patched' : 'missing', regionId: sub.id });
          }
        }
      }
    }

    for (const region of regions) {
      if (region.trunk) continue;
      const isPatched = patches.has(region.id);
      for (const bone of region.bones) {
        const info = boneMissingInfo(bone);
        const axis = axes.get(bone);
        const expectedCount = info.expected.filter((v) => v >= (axis ? MIN_PER_SLICE : MIN_VERTICES)).length;
        totalCovered += expectedCount;
        if (info.missing.length === 0) continue;
        if (isPatched) patchedCells += info.missing.length;
        else missingCells += info.missing.length;

        for (const k of info.missing) {
          const pos = axis
            ? axis.from.clone().addScaledVector(axis.dir, ((k + 0.5) / SLICES) * axis.length)
            : bindPosition(bone);
          markers.push({ pos, status: isPatched ? 'patched' : 'missing', regionId: region.id });
        }
      }
    }

    const totalLost = patchedCells + missingCells;
    const coveragePct = totalLost === 0 ? 100 : Math.round((patchedCells / totalLost) * 100);
    return {
      totalCovered,
      patchedCount: patchedCells,
      missingCount: missingCells,
      coveragePct,
      bareRegions: regions.filter(isRegionBare).map((r) => r.id),
      markers,
    };
  }

  return {
    regions,
    has: (id) => patches.has(id),
    canBuild: (id) => Boolean(regionById.get(id) && variantFor(regionById.get(id))),
    get count() {
      return patches.size;
    },
    bareRegions() {
      return regions.filter(isRegionBare);
    },
    invalidatePart(part) {
      if (!samplers.has(part)) return;
      const hasMask = Boolean(part.faceMask || part.object?.userData?._faceMask);
      const { slices, cells } = computePartCoverage(part, { useMask: hasMask });
      liveCoverage.set(part, slices);
      liveTrunkCoverage.set(part, cells);
    },
    setPartRewrite(part, enabled) {
      if (!part) return;
      part.rewriteOnHide = Boolean(enabled);
    },
    add(id) {
      dismissed.delete(id);
      return add(id);
    },
    remove(id) {
      dismissed.add(id);
      return remove(id);
    },
    patchAllMissing() {
      const added = [];
      for (const region of regions) {
        if (!isRegionBare(region) || patches.has(region.id)) continue;
        dismissed.delete(region.id);
        if (add(region.id, { auto: false })) added.push(region);
      }
      return added;
    },
    sync({ auto = true } = {}) {
      for (const p of parts) {
        if (isPartVisible(p)) p.wasVisible = true;
      }
      const added = [];
      for (const region of regions) {
        const bare = isRegionBare(region);
        const patch = patches.get(region.id);
        if (!bare) dismissed.delete(region.id);
        if (patch) {
          if (auto && patch.auto && !bare) remove(region.id);
          else if (patch.variant !== variantFor(region)) rebuild(patch);
        } else if (auto && bare && !dismissed.has(region.id) && add(region.id, { auto: true })) {
          added.push(region);
        }
      }
      return added;
    },
    setSuspended(next) {
      suspended = Boolean(next);
      for (const patch of patches.values()) {
        for (const item of patch.items) item.mesh.visible = !suspended;
      }
    },
    get mode() {
      return mode;
    },
    setMode(next) {
      if (next === mode) return;
      mode = next;
      for (const patch of [...patches.values()]) rebuild(patch);
    },
    get thickness() {
      return thickness;
    },
    setThickness(value) {
      thickness = value;
      for (const patch of [...patches.values()]) {
        if (patch.variant && !patch.variant.startsWith('shell:')) rebuild(patch);
      }
    },
    get fillStyle() {
      return fillStyle;
    },
    setFillStyle(nextStyle, colorHex = baseLayerColor) {
      const changed = nextStyle !== fillStyle || colorHex !== baseLayerColor;
      fillStyle = nextStyle === 'baselayer' ? 'baselayer' : 'skin';
      if (colorHex) baseLayerColor = colorHex;
      if (!changed) return;
      if (fillStyle === 'baselayer' && baseLayerMaterial) {
        baseLayerMaterial.color.set(baseLayerColor);
      }
      for (const patch of [...patches.values()]) rebuild(patch);
    },
    get baseLayerColor() {
      return baseLayerColor;
    },
    getGapReport,
    getDismissedIds: () => [...dismissed],
    getManualIds: () => [...patches.values()].filter((p) => !p.auto).map((p) => p.id),
    restoreState({ manualIds = [], dismissedIds = [] } = {}) {
      dismissed.clear();
      for (const id of dismissedIds) dismissed.add(id);
      for (const id of [...patches.keys()]) remove(id);
      for (const id of manualIds) add(id, { auto: false });
    },
    dispose() {
      for (const id of [...patches.keys()]) remove(id);
      plainMaterial?.dispose();
      baseLayerMaterial?.dispose();
    },
  };
}
