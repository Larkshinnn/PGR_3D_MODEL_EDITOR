import * as THREE from 'three';

/**
 * Geometry for body parts that a model does not have under its clothes.
 *
 * A limb is described as a row of elliptical rings along a centre line, each
 * ring carrying the bones it follows. `loftRings` skins those rings into one
 * closed surface. Everything is in scene space with the skeleton in its bind
 * pose; joint indices refer to the `bones` array the caller binds with.
 */

const _t = new THREE.Vector3();

const smooth = (edge0, edge1, x) => THREE.MathUtils.smoothstep(x, edge0, edge1);

/** Piecewise-linear lookup through [[x, y], …] sorted by x. */
function profile(points, x) {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (x <= points[i][0]) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return points[points.length - 1][1];
}

function ring(center, a, b, weights) {
  return { center: center.clone(), a, b, weights };
}

/**
 * Lower leg and foot, from the knee (or from further down when the top of
 * the shin is still covered) to the toes.
 *
 * @param {object} o
 * @param {THREE.Vector3} o.knee
 * @param {THREE.Vector3} o.ankle
 * @param {THREE.Vector3|null} o.toe   ball of the foot, if the rig has a toe joint
 * @param {THREE.Vector3} o.forward    which way the character faces
 * @param {THREE.Vector3} o.up
 * @param {number} o.thickness         1 = default proportions
 * @param {number} o.startAt           where on the shin to begin: -0.08 is just above the knee, 1 the ankle
 * @param {{thigh:number, calf:number, foot:number, toe:number}} o.joints  indices, -1 if absent
 */
export function buildLegRings({ knee, ankle, toe, forward, up, thickness = 1, startAt = -0.08, joints }) {
  const length = knee.distanceTo(ankle);
  const shin = ankle.clone().sub(knee).multiplyScalar(1 / length);

  // Without a toe joint, assume a foot that points forward and a little down.
  let ball = toe ? toe.clone() : null;
  if (!ball) ball = ankle.clone().addScaledVector(forward, 0.3 * length).addScaledVector(shin, 0.17 * length);
  const footLength = ankle.distanceTo(ball);
  const foot = ball.clone().sub(ankle).multiplyScalar(1 / footLength);

  // Everything lies in the plane of shin and foot; `lateral` is across it.
  const lateral = new THREE.Vector3().crossVectors(shin, foot);
  if (lateral.length() < 0.05) lateral.crossVectors(shin, forward);
  lateral.normalize();
  const instep = new THREE.Vector3().crossVectors(lateral, foot).normalize(); // top of the foot

  // Toes rest flat even when the foot is raised on a heel.
  const flat = foot.clone().addScaledVector(up, -foot.dot(up));
  if (flat.lengthSq() < 1e-6) flat.copy(foot);
  flat.normalize();
  const toeDir = foot.clone().multiplyScalar(0.25).addScaledVector(flat, 0.75).normalize();

  const unit = length * thickness;
  const r = (fraction) => fraction * unit;
  const only = (joint) => [[joint, 1]];
  const mix = (a, b, t) => (b < 0 ? only(a) : a < 0 ? only(b) : [[a, 1 - t], [b, t]]);

  const rings = [];

  // Shin: fuller at the calf, slim at the ankle.
  const shinProfile = [[-0.08, 0.116], [0, 0.118], [0.14, 0.127], [0.3, 0.128], [0.48, 0.112], [0.66, 0.092], [0.8, 0.078], [0.9, 0.071]];
  const start = Math.min(startAt, 0.72);
  const shinStops = [start, ...[0, 0.14, 0.3, 0.48, 0.66, 0.8, 0.9].filter((t) => t > start + 0.04)];
  for (const t of shinStops) {
    const radius = r(profile(shinProfile, t));
    const weights = t < 0 ? mix(joints.calf, joints.thigh, 0.6) : t === 0 ? mix(joints.calf, joints.thigh, 0.25) : only(joints.calf);
    rings.push(ring(knee.clone().addScaledVector(shin, t * length), radius, radius, weights));
  }

  // Ankle: the centre line swings from the shin into the foot around a point
  // below the joint, which is what gives the heel its roundness.
  const bendStart = knee.clone().addScaledVector(shin, 0.9 * length);
  const bendControl = ankle.clone().addScaledVector(shin, 0.13 * length).addScaledVector(foot, -0.03 * length);
  const bendEnd = ankle.clone().addScaledVector(foot, 0.42 * footLength).addScaledVector(instep, -0.03 * length);
  for (const tau of [0.14, 0.28, 0.42, 0.56, 0.7, 0.85, 1]) {
    const k = 1 - tau;
    const center = bendStart.clone().multiplyScalar(k * k)
      .addScaledVector(bendControl, 2 * k * tau)
      .addScaledVector(bendEnd, tau * tau);
    const a = r(0.071 + (0.1 - 0.071) * tau);
    // Deepest halfway round the turn: that is the heel.
    const b = r(0.071 + 0.036 * Math.sin(Math.PI * tau) ** 1.5 - 0.006 * tau);
    rings.push(ring(center, a, b, mix(joints.calf, joints.foot, smooth(0.1, 0.7, tau))));
  }

  // Foot: wider and flatter towards the ball.
  const ballCenter = ball.clone().addScaledVector(instep, r(0.012));
  rings.push(ring(bendEnd.clone().lerp(ballCenter, 0.5), r(0.106), r(0.058), only(joints.foot)));
  rings.push(ring(ballCenter, r(0.11), r(0.046), mix(joints.foot, joints.toe, 0.4)));

  // Toes, closed with a rounded tip.
  const toeLength = 0.17 * length;
  const toeWeights = joints.toe < 0 ? only(joints.foot) : only(joints.toe);
  for (const [t, a, b] of [[0.45, 0.104, 0.037], [0.8, 0.084, 0.028], [0.96, 0.05, 0.017]]) {
    rings.push(ring(ballCenter.clone().addScaledVector(toeDir, t * toeLength), r(a), r(b), toeWeights));
  }

  return { rings, lateral, tip: ballCenter.clone().addScaledVector(toeDir, toeLength), tipWeights: toeWeights };
}

/**
 * A plain limb segment between two joints: a thigh, an upper arm, a forearm,
 * or a partial span along a limb when part of it is still covered.
 *
 * @param {object} o
 * @param {THREE.Vector3} o.from
 * @param {THREE.Vector3} o.to
 * @param {THREE.Vector3} o.forward
 * @param {number} o.radiusFrom   radius at the first joint
 * @param {number} o.radiusTo     radius at the second joint
 * @param {{parent:number, bone:number, child:number}} o.joints
 * @param {number} [o.startAt=-0.06]
 * @param {number} [o.endAt=1.06]
 */
export function buildTubeRings({ from, to, forward, radiusFrom, radiusTo, joints, startAt = -0.06, endAt = 1.06 }) {
  const length = Math.max(1e-4, from.distanceTo(to));
  const axis = to.clone().sub(from).multiplyScalar(1 / length);
  const lateral = new THREE.Vector3().crossVectors(axis, forward);
  if (lateral.length() < 0.05) lateral.crossVectors(axis, new THREE.Vector3(0, 1, 0));
  if (lateral.length() < 0.05) lateral.set(1, 0, 0);
  lateral.normalize();

  const only = (joint) => [[joint, 1]];
  const mix = (a, b, t) => (b < 0 ? only(a) : a < 0 ? only(b) : [[a, 1 - t], [b, t]]);
  const rings = [];

  const lo = THREE.MathUtils.clamp(startAt, -0.14, 0.94);
  const hi = THREE.MathUtils.clamp(endAt, lo + 0.08, 1.14);
  const baseStops = [-0.06, 0, 0.2, 0.4, 0.6, 0.8, 1, 1.06];
  const stops = [lo, ...baseStops.filter((t) => t > lo + 0.03 && t < hi - 0.03), hi];

  for (const t of stops) {
    const clamped = THREE.MathUtils.clamp(t, 0, 1);
    const radius = THREE.MathUtils.lerp(radiusFrom, radiusTo, clamped)
      * (1 + 0.06 * Math.sin(Math.PI * clamped));
    let weights = only(joints.bone);
    if (t <= 0) weights = mix(joints.bone, joints.parent, t < 0 ? 0.6 : 0.3);
    else if (t >= 1) weights = mix(joints.bone, joints.child, t > 1 ? 0.6 : 0.3);
    rings.push(ring(from.clone().addScaledVector(axis, t * length), radius, radius, weights));
  }
  return { rings, lateral, tip: null, tipWeights: null };
}

/**
 * Generates an anatomical trunk region (`pelvis`, `torso`, or `neck`) from a
 * stack of spine joints and measured or proportioned cross-section radii.
 */
export function buildTrunkRings({
  section = 'torso',
  pelvis,
  trunkTop,
  head = null,
  spinePoints = [],
  hipHalfSpan = 0.075,
  shoulderHalfSpan = 0.095,
  forward,
  thickness = 1,
  measuredProfile = null,
  joints,
}) {
  const span = trunkTop.clone().sub(pelvis);
  const length = Math.max(1e-4, span.length());
  const dir = span.clone().multiplyScalar(1 / length);
  const lateral = new THREE.Vector3().crossVectors(dir, forward);
  if (lateral.lengthSq() < 1e-6) lateral.set(1, 0, 0);
  lateral.normalize();
  const front = new THREE.Vector3().crossVectors(lateral, dir).normalize();
  if (front.dot(forward) < 0) front.negate();

  const unit = Math.max(hipHalfSpan, length * 0.19);
  const sUnit = Math.max(shoulderHalfSpan, unit * 1.15);

  // [t along pelvis->trunkTop, half-width (a), half-depth (b), forwardOffset]
  // Calibrated to blend smoothly into thigh sockets at the hips and collarbone at the chest.
  const defaultCurve = [
    [-0.22, unit * 0.38, unit * 0.44, 0.0],
    [-0.12, unit * 1.36, unit * 1.04, -unit * 0.03],
    [-0.01, unit * 2.02, unit * 1.24, -unit * 0.01],
    [0.09,  unit * 1.78, unit * 1.12, 0.02 * unit],
    [0.24,  unit * 1.22, unit * 0.88, 0.05 * unit],
    [0.42,  unit * 1.14, unit * 0.86, 0.07 * unit],
    [0.60,  unit * 1.30, unit * 1.00, 0.12 * unit],
    [0.78,  sUnit * 1.16, unit * 0.96, 0.10 * unit],
    [0.92,  sUnit * 0.90, unit * 0.72, 0.03 * unit],
    [1.00,  unit * 0.54, unit * 0.50, 0.0],
    [1.12,  unit * 0.48, unit * 0.46, 0.0],
    [1.22,  unit * 0.46, unit * 0.44, 0.0],
  ];

  const sectionRanges = {
    pelvis: [-0.20, -0.12, -0.02, 0.07, 0.16, 0.25],
    torso: [0.16, 0.26, 0.38, 0.52, 0.66, 0.78, 0.88],
    neck: [0.88, 0.96, 1.04, 1.12, 1.20],
  };
  const stops = sectionRanges[section] ?? sectionRanges.torso;

  const sampleCurve = (t, col) => profile(defaultCurve.map((r) => [r[0], r[col]]), t);

  const spineAt = (t) => {
    if (spinePoints.length >= 2) {
      const proj = spinePoints
        .map((sp) => ({
          t: sp.pos.clone().sub(pelvis).dot(dir) / length,
          pos: sp.pos,
          joint: sp.joint,
        }))
        .sort((a, b) => a.t - b.t);
      if (t <= proj[0].t) {
        return proj[0].pos.clone().addScaledVector(dir, (t - proj[0].t) * length);
      }
      if (t >= proj[proj.length - 1].t) {
        return proj[proj.length - 1].pos.clone().addScaledVector(dir, (t - proj[proj.length - 1].t) * length);
      }
      for (let i = 1; i < proj.length; i++) {
        if (t <= proj[i].t) {
          const spanT = Math.max(1e-4, proj[i].t - proj[i - 1].t);
          const alpha = (t - proj[i - 1].t) / spanT;
          return proj[i - 1].pos.clone().lerp(proj[i].pos, alpha);
        }
      }
    }
    if (head && t > 1) {
      return trunkTop.clone().lerp(head, THREE.MathUtils.clamp((t - 1) / 0.35, 0, 1));
    }
    return pelvis.clone().addScaledVector(dir, t * length);
  };

  const weightsAt = (t) => {
    if (spinePoints.length >= 2) {
      const proj = spinePoints
        .map((sp) => ({ t: sp.pos.clone().sub(pelvis).dot(dir) / length, joint: sp.joint }))
        .filter((sp) => sp.joint >= 0)
        .sort((a, b) => a.t - b.t);
      if (proj.length >= 1) {
        if (t <= proj[0].t) return [[proj[0].joint, 1]];
        if (t >= proj[proj.length - 1].t) return [[proj[proj.length - 1].joint, 1]];
        for (let i = 1; i < proj.length; i++) {
          if (t <= proj[i].t) {
            const alpha = (t - proj[i - 1].t) / Math.max(1e-4, proj[i].t - proj[i - 1].t);
            if (proj[i - 1].joint === proj[i].joint) return [[proj[i].joint, 1]];
            return [[proj[i - 1].joint, 1 - alpha], [proj[i].joint, alpha]];
          }
        }
      }
    }
    if (t < 0.2) return [[joints.pelvis, 1]];
    if (t < 0.55) {
      const a = (t - 0.2) / 0.35;
      return [[joints.pelvis, 1 - a], [joints.spine >= 0 ? joints.spine : joints.pelvis, a]];
    }
    if (t < 0.9) return [[joints.chest >= 0 ? joints.chest : joints.pelvis, 1]];
    return [[joints.neck >= 0 ? joints.neck : joints.pelvis, 1]];
  };

  const rings = [];
  for (const t of stops) {
    let a = sampleCurve(t, 1);
    let b = sampleCurve(t, 2);
    const fwdShift = sampleCurve(t, 3);
    if (measuredProfile && measuredProfile.length >= 2) {
      const ma = profile(measuredProfile.map((p) => [p[0], p[1]]), t);
      const mb = profile(measuredProfile.map((p) => [p[0], p[2]]), t);
      if (Number.isFinite(ma) && ma > 0) {
        a = THREE.MathUtils.clamp(ma * 0.92, a * 0.75, a * 1.12);
      }
      if (Number.isFinite(mb) && mb > 0) {
        b = THREE.MathUtils.clamp(mb * 0.92, b * 0.75, b * 1.12);
      }
    }
    const center = spineAt(t).addScaledVector(front, fwdShift);
    rings.push(ring(center, a * thickness, b * thickness, weightsAt(t)));
  }

  return { rings, lateral, tip: null, tipWeights: null };
}

/**
 * Skins a row of rings into an indexed, skinned BufferGeometry.
 *
 * @param {{rings: object[], lateral: THREE.Vector3, tip: THREE.Vector3|null, tipWeights: Array|null}} shape
 * @param {{segments?: number, capStart?: boolean}} options
 */
export function loftRings({ rings, lateral, tip = null, tipWeights = null }, { segments = 16, capStart = true } = {}) {
  const positions = [];
  const skinIndex = [];
  const skinWeight = [];
  const indices = [];

  const pushVertex = (point, weights) => {
    positions.push(point.x, point.y, point.z);
    const total = weights.reduce((sum, [, weight]) => sum + weight, 0) || 1;
    for (let k = 0; k < 4; k++) {
      const entry = weights[k];
      skinIndex.push(entry ? entry[0] : 0);
      skinWeight.push(entry ? entry[1] / total : 0);
    }
    return positions.length / 3 - 1;
  };

  const point = new THREE.Vector3();
  const normal = new THREE.Vector3();
  rings.forEach((current, i) => {
    const before = rings[Math.max(0, i - 1)].center;
    const after = rings[Math.min(rings.length - 1, i + 1)].center;
    _t.subVectors(after, before).normalize();
    normal.crossVectors(lateral, _t).normalize();
    for (let j = 0; j < segments; j++) {
      const phi = (j / segments) * Math.PI * 2;
      point.copy(current.center)
        .addScaledVector(lateral, current.a * Math.cos(phi))
        .addScaledVector(normal, current.b * Math.sin(phi));
      pushVertex(point, current.weights);
    }
  });

  for (let i = 0; i + 1 < rings.length; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * segments + j;
      const b = i * segments + ((j + 1) % segments);
      const c = a + segments;
      const d = b + segments;
      indices.push(a, c, b, b, c, d);
    }
  }

  if (capStart) {
    const center = pushVertex(rings[0].center, rings[0].weights);
    for (let j = 0; j < segments; j++) indices.push(center, j, (j + 1) % segments);
  }
  const last = (rings.length - 1) * segments;
  const end = pushVertex(tip ?? rings[rings.length - 1].center, tipWeights ?? rings[rings.length - 1].weights);
  for (let j = 0; j < segments; j++) indices.push(end, last + ((j + 1) % segments), last + j);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Fills interior or small boundary holes on a shell BufferGeometry by adding
 * centroid-fan triangles along closed boundary loops whose edge count is
 * within `maxLoopEdges`. Returns the number of triangles added.
 */
export function fillShellHoles(geometry, maxLoopEdges = 42) {
  const index = geometry.index;
  const posAttr = geometry.attributes.position;
  if (!index || !posAttr || index.count < 9) return 0;

  const directed = new Set();
  const edgeOrder = [];
  for (let i = 0; i + 2 < index.count; i += 3) {
    const a = index.getX(i);
    const b = index.getX(i + 1);
    const c = index.getX(i + 2);
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      directed.add(`${u}_${v}`);
      edgeOrder.push([u, v]);
    }
  }

  // Boundary edges are directed edges u->v whose opposite v->u is absent.
  // The hole's interior edge loop runs in reverse (v->u), so walk v->u via outgoing boundary edges.
  const adj = new Map();
  for (const [u, v] of edgeOrder) {
    if (!directed.has(`${v}_${u}`)) {
      let list = adj.get(v);
      if (!list) {
        list = [];
        adj.set(v, list);
      }
      list.push(u);
    }
  }
  if (adj.size === 0) return 0;

  const visited = new Set();
  const loops = [];
  for (const [startU, nexts] of adj) {
    for (const startV of nexts) {
      const edgeKey = `${startU}_${startV}`;
      if (visited.has(edgeKey)) continue;
      const loop = [];
      let curU = startU;
      let curV = startV;
      let guard = 0;
      while (guard++ <= maxLoopEdges + 2) {
        const k = `${curU}_${curV}`;
        if (visited.has(k)) break;
        visited.add(k);
        loop.push(curU);
        const candidates = adj.get(curV);
        if (!candidates || candidates.length === 0) break;
        const nextW = candidates.find((w) => !visited.has(`${curV}_${w}`));
        if (nextW === undefined) {
          if (curV === startU) loops.push(loop);
          break;
        }
        curU = curV;
        curV = nextW;
        if (curU === startU && curV === startV) {
          loops.push(loop);
          break;
        }
      }
    }
  }

  const eligibleLoops = loops.filter((loop) => loop.length >= 3 && loop.length <= maxLoopEdges);
  if (eligibleLoops.length === 0) return 0;

  const newIndices = Array.from(index.array);
  const attrCopies = {};
  for (const [name, attr] of Object.entries(geometry.attributes)) {
    attrCopies[name] = Array.from(attr.array);
  }
  const origVertCount = posAttr.count;
  let nextVert = origVertCount;
  let addedTris = 0;

  for (const loop of eligibleLoops) {
    const n = loop.length;
    if (n === 3) {
      newIndices.push(loop[0], loop[1], loop[2]);
      addedTris += 1;
      continue;
    }

    const centerIdx = nextVert++;
    for (const [name, attr] of Object.entries(geometry.attributes)) {
      const arr = attrCopies[name];
      const itemSize = attr.itemSize;
      if (name === 'position' || name === 'normal' || name === '_pgrsmoothnormal') {
        for (let c = 0; c < itemSize; c++) {
          let sum = 0;
          for (const vi of loop) sum += attr.array[vi * itemSize + c];
          arr.push(sum / n);
        }
      } else {
        const ref = loop[0];
        for (let c = 0; c < itemSize; c++) {
          arr.push(attr.array[ref * itemSize + c]);
        }
      }
    }

    for (let i = 0; i < n; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % n];
      newIndices.push(centerIdx, a, b);
      addedTris += 1;
    }
  }

  if (addedTris === 0) return 0;

  if (nextVert !== origVertCount) {
    delete geometry.userData.shared;
    for (const [name, attr] of Object.entries(geometry.attributes)) {
      const Typed = attr.array.constructor;
      geometry.setAttribute(name, new THREE.BufferAttribute(new Typed(attrCopies[name]), attr.itemSize, attr.normalized));
    }
  }
  geometry.setIndex(newIndices);
  geometry.computeVertexNormals();
  return addedTris;
}
