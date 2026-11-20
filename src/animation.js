import * as THREE from 'three';

const VALUE_SCALE = 100000;
const ROT_SCALE = 32768 * Math.SQRT2;

function cumulative(values, offset, count) {
  const out = new Float64Array(count);
  let sum = 0;
  for (let i = 0; i < count; i++) {
    sum += values[offset + i];
    out[i] = sum;
  }
  return out;
}

function decodeQuaternion(track, count) {
  const cols = [0, 1, 2].map((col) => cumulative(track.deltas, col * count, count));
  const drops = Array.isArray(track.dropped)
    ? track.dropped
    : track.dropped
      ? [track.dropped]
      : [];
  const dropAt = new Map(drops.map((entry) => [entry.at, entry.component]));
  let drop = dropAt.has(0) ? dropAt.get(0) : 3;

  const out = new Float32Array(count * 4);
  for (let frame = 0; frame < count; frame++) {
    if (dropAt.has(frame)) drop = dropAt.get(frame);

    const q = [0, 0, 0, 0];
    let other = 0;
    for (let component = 0; component < 4; component++) {
      if (component !== drop) q[component] = cols[other++][frame] / ROT_SCALE;
    }

    const rest = 1 - (q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
    q[drop] = Math.sqrt(Math.max(0, rest + q[drop] * q[drop]));

    const length = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    const offset = frame * 4;
    out[offset] = q[0] / length;
    out[offset + 1] = q[1] / length;
    out[offset + 2] = q[2] / length;
    out[offset + 3] = q[3] / length;
  }
  return out;
}

function decodeVector(track, count) {
  const cols = [0, 1, 2].map((col) => cumulative(track.deltas, col * count, count));
  const out = new Float32Array(count * 3);
  for (let frame = 0; frame < count; frame++) {
    const offset = frame * 3;
    out[offset] = cols[0][frame] / VALUE_SCALE;
    out[offset + 1] = cols[1][frame] / VALUE_SCALE;
    out[offset + 2] = cols[2][frame] / VALUE_SCALE;
  }
  return out;
}

function decodeWeights(track, count) {
  const values = cumulative(track.deltas, 0, count);
  const out = new Float32Array(count);
  for (let frame = 0; frame < count; frame++) out[frame] = values[frame] / VALUE_SCALE;
  return out;
}

/**
 * Converts a huaxu/PGR packed animation JSON into a THREE.AnimationClip.
 *
 * @param {string} name clip name, used for mixer bookkeeping
 * @param {object} data parsed animation JSON
 * @param {{duration?: number, loop?: boolean}} meta manifest clip metadata
 * @param {(node: number) => string} nodeName name used for node TRS tracks
 * @param {(node: number) => string} meshName name used for morph tracks
 */
export function buildClip(name, data, meta, nodeName, meshName) {
  const times = data?.packing?.times ?? [];
  const count = times.length;
  if (!count) throw new Error(`Animasi "${name}" tidak punya data sampel.`);

  const tracks = [];
  for (const track of data.tracks ?? []) {
    if (!track.deltas || track.deltas.length === 0) continue;

    switch (track.property) {
      case 'quaternion':
        tracks.push(
          new THREE.QuaternionKeyframeTrack(
            `${nodeName(track.node)}.quaternion`,
            times,
            decodeQuaternion(track, count),
          ),
        );
        break;
      case 'position':
        tracks.push(
          new THREE.VectorKeyframeTrack(
            `${nodeName(track.node)}.position`,
            times,
            decodeVector(track, count),
          ),
        );
        break;
      case 'scale':
        tracks.push(
          new THREE.VectorKeyframeTrack(
            `${nodeName(track.node)}.scale`,
            times,
            decodeVector(track, count),
          ),
        );
        break;
      case 'weights':
        tracks.push(
          new THREE.NumberKeyframeTrack(
            `${meshName(track.node)}.morphTargetInfluences[${track.target}]`,
            times,
            decodeWeights(track, count),
          ),
        );
        break;
      default:
        break;
    }
  }

  const duration = Math.max(meta?.duration ?? 0, times[count - 1] ?? 0);
  const clip = new THREE.AnimationClip(name, duration, tracks);
  clip.userData.loop = meta?.loop ?? true;
  clip.userData.frameRate = data?.packing?.frameRate ?? null;
  return clip;
}
