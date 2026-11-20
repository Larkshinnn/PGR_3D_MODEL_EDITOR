import * as THREE from 'three';

/**
 * Helper-bone correctives.
 *
 * Game rigs carry extra "repair" and twist bones around knees, elbows,
 * shoulders and hips. Their motion is baked into every clip as a function of
 * the joint they belong to, and they hold a lot of skin weight: bend a knee
 * by hand without moving its repair bone and the knee collapses.
 *
 * Nothing in the file says which joint drives which helper, and the names
 * differ per character, so the relation is learned from the clips themselves:
 * for every helper we look for the nearby joint whose rotation predicts the
 * helper best, keep the (joint rotation → helper transform) samples, and at
 * pose time move the helper by the difference between what those samples say
 * for the posed joint and for the animated joint. With no pose offset the
 * difference is zero, so the original animation is never altered.
 */

const DEG = Math.PI / 180;
const SAMPLES_PER_CLIP = 90;
const MAX_GROUP_SAMPLES = 420;
const THIN_ANGLE = 2.5 * DEG;
/** Samples this close in the same clip do not count as independent evidence. */
const NEIGHBOUR_GAP = 6;

const HINT = /twist|repair|fuzhu|_f_|knee|elbow|shoulder|clavicle|calf|thigh|upperarm|uparm|forearm|pelvis|helper|assist|fix|roll/i;
const SKIP = /hair|bang|skirt|cloth|ribbon|sleeve|adorn|pack|tail|wing|cape|coat|scarf|weapon|prop|table|oppein|breast|finger|toe|eye|brow|mouth|jaw|tongue|spring|case|effect|mark|nub|camera/i;

const _pA = new THREE.Vector3();
const _pB = new THREE.Vector3();
const _qA = new THREE.Quaternion();
const _qB = new THREE.Quaternion();

function nameOf(object) {
  return String(object?.userData?.originalName || object?.name || '');
}

function quatAngle(a, i, b, j) {
  const dot = Math.abs(a[i] * b[j] + a[i + 1] * b[j + 1] + a[i + 2] * b[j + 2] + a[i + 3] * b[j + 3]);
  return dot >= 1 ? 0 : 2 * Math.acos(dot);
}

function posDistance(a, i, j) {
  return Math.hypot(a[i] - a[j], a[i + 1] - a[j + 1], a[i + 2] - a[j + 2]);
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
}

export function createHelperCorrectives({ entries, entryOf, exclude = null, unit = () => 0.5 }) {
  let groups = [];
  let enabled = true;
  let helperCount = 0;

  const mainBones = new Set(entries.map((entry) => entry.bone));
  const mainChildren = new Map(entries.map((entry) => [entry, []]));
  for (const entry of entries) {
    let cur = entry.bone.parent;
    while (cur && !mainBones.has(cur)) cur = cur.parent;
    if (cur) mainChildren.get(entryOf.get(cur)).push(entry);
  }

  /** Non-controlled bones hanging off a controlled one, with the joints that might drive them. */
  function findCandidates() {
    const out = [];
    for (const anchor of entries) {
      if (anchor.role === 'com') continue;
      const drivers = [anchor, ...mainChildren.get(anchor)].filter((entry) => entry.role !== 'com');
      const stack = [...anchor.bone.children];
      while (stack.length) {
        const object = stack.pop();
        if (mainBones.has(object) || object.isMesh || exclude?.has(object)) continue;
        const name = nameOf(object);
        if (SKIP.test(name)) continue;
        stack.push(...object.children);
        out.push({ bone: object, hinted: HINT.test(name), drivers });
      }
    }
    return out;
  }

  function indexClips(clips) {
    const tables = [];
    for (const clip of clips) {
      const byNode = new Map();
      let frames = 0;
      for (const track of clip.tracks) {
        const dot = track.name.lastIndexOf('.');
        if (dot < 0) continue;
        const property = track.name.slice(dot + 1);
        if (property !== 'quaternion' && property !== 'position') continue;
        const node = track.name.slice(0, dot);
        let record = byNode.get(node);
        if (!record) {
          record = {};
          byNode.set(node, record);
        }
        record[property] = track;
        if (track.times.length > frames) frames = track.times.length;
      }
      if (frames > 1) tables.push({ byNode, frames });
    }
    return tables;
  }

  /** True when the clips animate at least one bone that could be a helper. */
  function hasCandidates(clips) {
    const tables = indexClips(clips);
    if (tables.length === 0) return false;
    return findCandidates().some((candidate) => tables.some((table) => table.byNode.has(candidate.bone.name)));
  }

  function restore() {
    for (const group of groups) {
      for (const helper of group.helpers) {
        if (!helper.applied) continue;
        helper.bone.position.copy(helper.basePos);
        helper.bone.quaternion.copy(helper.baseQuat);
        helper.applied = false;
      }
    }
  }

  function kernelWeights(group, q, out) {
    const { quats, dist, count } = group;
    let nearest = Infinity;
    for (let k = 0; k < count; k++) {
      const o = k * 4;
      const dot = Math.abs(q.x * quats[o] + q.y * quats[o + 1] + q.z * quats[o + 2] + q.w * quats[o + 3]);
      const d = dot >= 1 ? 0 : 2 * Math.acos(dot);
      dist[k] = d;
      if (d < nearest) nearest = d;
    }
    // Measured from the nearest sample, so a pose far outside the sampled
    // range falls back to its closest known shape instead of to nothing.
    const inv = 1 / group.sigma;
    let sum = 0;
    for (let k = 0; k < count; k++) {
      const t = (dist[k] - nearest) * inv;
      const w = t > 3 ? 0 : Math.exp(-t * t);
      out[k] = w;
      sum += w;
    }
    const norm = 1 / sum;
    for (let k = 0; k < count; k++) out[k] *= norm;
  }

  function blendPosition(values, weights, count, out) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (let k = 0; k < count; k++) {
      const w = weights[k];
      if (w === 0) continue;
      const o = k * 3;
      x += values[o] * w;
      y += values[o + 1] * w;
      z += values[o + 2] * w;
    }
    return out.set(x, y, z);
  }

  function blendQuaternion(values, weights, count, out) {
    let ref = 0;
    for (let k = 1; k < count; k++) if (weights[k] > weights[ref]) ref = k;
    const rx = values[ref * 4];
    const ry = values[ref * 4 + 1];
    const rz = values[ref * 4 + 2];
    const rw = values[ref * 4 + 3];
    let x = 0;
    let y = 0;
    let z = 0;
    let w = 0;
    for (let k = 0; k < count; k++) {
      let weight = weights[k];
      if (weight === 0) continue;
      const o = k * 4;
      if (values[o] * rx + values[o + 1] * ry + values[o + 2] * rz + values[o + 3] * rw < 0) weight = -weight;
      x += values[o] * weight;
      y += values[o + 1] * weight;
      z += values[o + 2] * weight;
      w += values[o + 3] * weight;
    }
    return out.set(x, y, z, w).normalize();
  }

  function apply() {
    if (!enabled) return;
    for (const group of groups) {
      const { driver, count } = group;
      if (!driver.active) continue;
      kernelWeights(group, driver.base, group.weightsBase);
      kernelWeights(group, driver.bone.quaternion, group.weightsPosed);
      for (const helper of group.helpers) {
        helper.basePos.copy(helper.bone.position);
        helper.baseQuat.copy(helper.bone.quaternion);
        if (helper.pos) {
          blendPosition(helper.pos, group.weightsBase, count, _pA);
          blendPosition(helper.pos, group.weightsPosed, count, _pB);
          helper.bone.position.add(_pB.sub(_pA));
        }
        if (helper.quats) {
          blendQuaternion(helper.quats, group.weightsBase, count, _qA);
          blendQuaternion(helper.quats, group.weightsPosed, count, _qB);
          helper.bone.quaternion.multiply(_qA.invert().multiply(_qB)).normalize();
        }
        helper.applied = true;
      }
    }
  }

  /**
   * @param {THREE.AnimationClip[]} clips clips whose tracks are named `<object.name>.<property>`
   * @param {(bone: THREE.Object3D) => ({position: THREE.Vector3, quaternion: THREE.Quaternion}|undefined)} bindOf
   */
  function learn(clips, bindOf = () => undefined) {
    restore();
    groups = [];
    helperCount = 0;

    const tables = indexClips(clips);
    const candidates = tables.length ? findCandidates() : [];
    if (candidates.length === 0) return { helpers: 0, joints: 0 };

    const sampleClip = [];
    const sampleFrame = [];
    tables.forEach((table, clipIndex) => {
      const step = Math.max(1, Math.round(table.frames / SAMPLES_PER_CLIP));
      for (let frame = 0; frame < table.frames; frame += step) {
        sampleClip.push(clipIndex);
        sampleFrame.push(frame);
      }
    });
    const total = sampleClip.length;

    const sample = (bone, property, stride) => {
      const out = new Float32Array(total * stride);
      const rest = bindOf(bone)?.[property] ?? bone[property];
      for (let i = 0; i < total; i++) {
        const table = tables[sampleClip[i]];
        const track = table.byNode.get(bone.name)?.[property];
        if (track && track.times.length === table.frames) {
          const from = sampleFrame[i] * stride;
          for (let c = 0; c < stride; c++) out[i * stride + c] = track.values[from + c];
        } else {
          rest.toArray(out, i * stride);
        }
      }
      return out;
    };
    const animated = (bone) => tables.some((table) => table.byNode.has(bone.name));

    const driverCache = new Map();
    const driverData = (entry) => {
      let data = driverCache.get(entry);
      if (data) return data;
      const quats = sample(entry.bone, 'quaternion', 4);
      let range = 0;
      for (let i = 1; i < total; i++) range = Math.max(range, quatAngle(quats, 0, quats, i * 4));
      // For every sample: the most similar joint rotation that is not just
      // its own neighbour in time. If the helper is a function of the joint,
      // the helper at that other sample must look alike too.
      const nearest = new Int32Array(total).fill(-1);
      for (let i = 0; i < total; i++) {
        let best = -1;
        let bestAngle = Infinity;
        for (let j = 0; j < total; j++) {
          if (j === i || (sampleClip[j] === sampleClip[i] && Math.abs(j - i) <= NEIGHBOUR_GAP)) continue;
          const angle = quatAngle(quats, i * 4, quats, j * 4);
          if (angle < bestAngle) {
            bestAngle = angle;
            best = j;
          }
        }
        nearest[i] = best;
      }
      data = { quats, range, nearest };
      driverCache.set(entry, data);
      return data;
    };

    const minMove = unit() * 0.004;
    const byDriver = new Map();
    for (const candidate of candidates) {
      if (!animated(candidate.bone)) continue;
      const quats = sample(candidate.bone, 'quaternion', 4);
      const pos = sample(candidate.bone, 'position', 3);
      let rotRange = 0;
      let posRange = 0;
      for (let i = 1; i < total; i++) {
        rotRange = Math.max(rotRange, quatAngle(quats, 0, quats, i * 4));
        posRange = Math.max(posRange, posDistance(pos, 0, i * 3));
      }
      const useRot = rotRange > 1.5 * DEG;
      const usePos = posRange > minMove;
      if (!useRot && !usePos) continue;

      let best = null;
      for (const driver of candidate.drivers) {
        const data = driverData(driver);
        if (data.range < 8 * DEG) continue;
        let rotError = 0;
        let posError = 0;
        let pairs = 0;
        for (let i = 0; i < total; i++) {
          const j = data.nearest[i];
          if (j < 0) continue;
          rotError += quatAngle(quats, i * 4, quats, j * 4);
          posError += posDistance(pos, i * 3, j * 3);
          pairs++;
        }
        if (pairs === 0) continue;
        const score = Math.max(
          useRot ? rotError / pairs / rotRange : 0,
          usePos ? posError / pairs / posRange : 0,
        );
        if (!best || score < best.score) best = { driver, score };
      }
      if (!best || best.score >= (candidate.hinted ? 0.5 : 0.15)) continue;

      if (!byDriver.has(best.driver)) byDriver.set(best.driver, []);
      byDriver.get(best.driver).push({
        bone: candidate.bone,
        quats: useRot ? quats : null,
        pos: usePos ? pos : null,
        score: best.score,
      });
    }

    for (const [driver, helpers] of byDriver) {
      const { quats } = driverData(driver);
      const kept = [];
      for (let i = 0; i < total && kept.length < MAX_GROUP_SAMPLES; i++) {
        let distinct = true;
        for (const k of kept) {
          if (quatAngle(quats, i * 4, quats, k * 4) < THIN_ANGLE) {
            distinct = false;
            break;
          }
        }
        if (distinct) kept.push(i);
      }
      const count = kept.length;
      if (count < 2) continue;

      const pick = (source, stride) => {
        const out = new Float32Array(count * stride);
        kept.forEach((index, k) => {
          for (let c = 0; c < stride; c++) out[k * stride + c] = source[index * stride + c];
        });
        return out;
      };
      const groupQuats = pick(quats, 4);
      const spacing = [];
      for (let a = 0; a < count; a++) {
        let nearest = Infinity;
        for (let b = 0; b < count; b++) {
          if (a !== b) nearest = Math.min(nearest, quatAngle(groupQuats, a * 4, groupQuats, b * 4));
        }
        spacing.push(nearest);
      }

      groups.push({
        driver,
        count,
        quats: groupQuats,
        sigma: THREE.MathUtils.clamp(median(spacing) * 1.2, 4 * DEG, 14 * DEG),
        dist: new Float32Array(count),
        weightsBase: new Float32Array(count),
        weightsPosed: new Float32Array(count),
        helpers: helpers.map((helper) => ({
          bone: helper.bone,
          quats: helper.quats ? pick(helper.quats, 4) : null,
          pos: helper.pos ? pick(helper.pos, 3) : null,
          score: helper.score,
          basePos: new THREE.Vector3(),
          baseQuat: new THREE.Quaternion(),
          applied: false,
        })),
      });
      helperCount += helpers.length;
    }

    return { helpers: helperCount, joints: groups.length };
  }

  return {
    apply,
    restore,
    learn,
    hasCandidates,
    get groups() {
      return groups;
    },
    get count() {
      return helperCount;
    },
    get enabled() {
      return enabled;
    },
    /** Callers must restore() before and apply() after flipping this while attached. */
    set enabled(value) {
      enabled = Boolean(value);
    },
  };
}
