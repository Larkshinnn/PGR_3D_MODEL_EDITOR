import * as THREE from 'three';
import { createHelperCorrectives } from './correctives.js';
import * as Fingers from './fingers.js';

/**
 * Pose rig: a non-destructive pose layer on top of whatever the animation
 * mixer (or the bind pose) writes into the skeleton.
 *
 * Every controlled bone keeps the value the animation gave it (`base`) and a
 * local rotation offset. Only rotations are ever edited (plus one translation
 * on the hip mover), so bone lengths and therefore the character's proportions
 * can not change. Fingers are driven through pose/fingers.js: curled along
 * their hinges and leaned at the knuckle, within each joint's range.
 *
 * The layer has to be taken off before the mixer reads or writes bones and put
 * back afterwards:  rig.detach(); mixer.update(dt); rig.attach();
 */

const DEG = Math.PI / 180;

const LIMITS = {
  spine: 32 * DEG,
  neck: 38 * DEG,
  head: 48 * DEG,
  clavicle: 32 * DEG,
};

/** Smallest elbow / knee interior angle the solver will fold a limb to. */
const MIN_JOINT_ANGLE = 20 * DEG;
/** Furthest a knee or elbow may be swung around its limb in one drag. */
const MAX_SWIVEL = 100 * DEG;
/** sin(interior angle) above which the current bend plane is trusted. */
const BEND_CONFIDENCE = 0.03;
const UNDO_LIMIT = 60;

const SIDED_PARTS = {
  clavicle: ['clavicle', 'shoulder'],
  upperArm: ['upperarm', 'arm'],
  forearm: ['forearm', 'lowerarm'],
  hand: ['hand'],
  thigh: ['thigh', 'upleg', 'upperleg'],
  calf: ['calf', 'leg', 'lowerleg'],
  foot: ['foot'],
};

const SIDE_LABEL = { L: 'kiri', R: 'kanan' };

const _pa = new THREE.Vector3();
const _pb = new THREE.Vector3();
const _pc = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _qParent = new THREE.Quaternion();
const _mInv = new THREE.Matrix4();

const PRINCIPAL_AXES = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
];

/** The viewer renames nodes for the mixer; the name from the file is kept in userData. */
function rawBoneName(object) {
  return String(object?.userData?.originalName || object?.name || '');
}

function classify(object) {
  let key = rawBoneName(object).replace(/[\s_\-.:|]+/g, '').toLowerCase();
  if (!key) return null;
  key = key.replace(/^mixamorig\d*/, '');
  const biped = /^bip\d*/.exec(key);
  if (biped) {
    key = key.slice(biped[0].length);
    if (!key) return { role: 'com' };
  }
  if (/^(pelvis|hips)$/.test(key)) return { role: 'pelvis' };
  if (/^(spine\d*|chest|upperchest)$/.test(key)) return { role: 'spine' };
  if (/^neck\d*$/.test(key)) return { role: 'neck' };
  if (key === 'head') return { role: 'head' };
  const sided = /^(left|right|l|r)([a-z]+)$/.exec(key);
  if (sided) {
    const side = sided[1][0] === 'l' ? 'L' : 'R';
    for (const [role, names] of Object.entries(SIDED_PARTS)) {
      if (names.includes(sided[2])) return { role, side };
    }
  }
  return null;
}

function isAncestor(ancestor, object) {
  for (let cur = object?.parent; cur; cur = cur.parent) {
    if (cur === ancestor) return true;
  }
  return false;
}

function depthOf(object) {
  let depth = 0;
  for (let cur = object.parent; cur; cur = cur.parent) depth++;
  return depth;
}

/** Rotates `bone` by the world-space rotation `q` about its own origin. */
function rotateWorld(bone, q) {
  if (bone.parent) {
    bone.parent.getWorldQuaternion(_qParent);
    _q3.copy(_qParent).invert().multiply(q).multiply(_qParent);
  } else {
    _q3.copy(q);
  }
  bone.quaternion.premultiply(_q3).normalize();
  bone.updateWorldMatrix(false, true);
}

function setWorldQuaternion(bone, worldQuat) {
  if (bone.parent) {
    bone.parent.getWorldQuaternion(_qParent);
    bone.quaternion.copy(_qParent).invert().multiply(worldQuat).normalize();
  } else {
    bone.quaternion.copy(worldQuat);
  }
  bone.updateWorldMatrix(false, true);
}

function discover(root) {
  const found = { spine: [] };
  root.traverse((object) => {
    if (object.isMesh) return;
    const info = classify(object);
    if (!info) return;
    if (info.role === 'spine') {
      found.spine.push(object);
      return;
    }
    const key = info.side ? `${info.role}${info.side}` : info.role;
    if (!found[key]) found[key] = object;
  });

  const { pelvis = null, neck = null, head = null } = found;
  const com = found.com && pelvis && isAncestor(found.com, pelvis) ? found.com : null;

  const arms = {};
  const legs = {};
  for (const side of ['L', 'R']) {
    const upper = found[`upperArm${side}`];
    const fore = found[`forearm${side}`];
    const hand = found[`hand${side}`];
    if (upper && fore && hand && isAncestor(upper, fore) && isAncestor(fore, hand)) {
      const clavicle = found[`clavicle${side}`];
      arms[side] = {
        clavicle: clavicle && isAncestor(clavicle, upper) ? clavicle : null,
        upper,
        mid: fore,
        end: hand,
      };
    }
    const thigh = found[`thigh${side}`];
    const calf = found[`calf${side}`];
    const foot = found[`foot${side}`];
    if (thigh && calf && foot && isAncestor(thigh, calf) && isAncestor(calf, foot)) {
      legs[side] = { upper: thigh, mid: calf, end: foot };
    }
  }

  const spineTip = neck || head || arms.L?.upper || arms.R?.upper || null;
  const spine = found.spine
    .filter((bone) => !spineTip || isAncestor(bone, spineTip))
    .sort((a, b) => depthOf(a) - depthOf(b));

  const usable = pelvis || head || spine.length || arms.L || arms.R || legs.L || legs.R;
  if (!usable) return null;
  return { com, pelvis, spine, neck: neck && (!head || isAncestor(neck, head)) ? neck : null, head, arms, legs };
}

export function createPoseRig(root, { exclude = null } = {}) {
  const bones = discover(root);
  if (!bones) return null;

  const entries = [];
  // Finger joints ride the same layer but stay out of `entries`: skinning
  // ownership, body colliders and the helper correction work on main joints.
  const fingerEntries = [];
  const entryOf = new Map();
  const addEntry = (bone, role, side = null, list = entries, canonicalKey = null) => {
    if (!bone || entryOf.has(bone)) return entryOf.get(bone) ?? null;
    const entry = {
      bone,
      rawName: rawBoneName(bone),
      role,
      side,
      canonicalKey: canonicalKey || (side ? `${role}:${side}` : role),
      base: bone.quaternion.clone(),
      offset: new THREE.Quaternion(),
      basePos: bone.position.clone(),
      posOffset: new THREE.Vector3(),
      movable: false,
      limit: LIMITS[role] ?? 0,
      active: false,
    };
    list.push(entry);
    entryOf.set(bone, entry);
    return entry;
  };

  const mover = bones.com || bones.pelvis;
  if (bones.com) addEntry(bones.com, 'com', null, entries, 'com');
  addEntry(bones.pelvis, 'pelvis', null, entries, 'pelvis');
  if (mover) entryOf.get(mover).movable = true;
  bones.spine.forEach((bone, idx) => addEntry(bone, 'spine', null, entries, `spine:${idx}`));
  addEntry(bones.neck, 'neck', null, entries, 'neck');
  addEntry(bones.head, 'head', null, entries, 'head');

  const limbs = [];
  for (const side of ['L', 'R']) {
    const arm = bones.arms[side];
    if (arm) {
      addEntry(arm.clavicle, 'clavicle', side);
      addEntry(arm.upper, 'upperArm', side);
      addEntry(arm.mid, 'forearm', side);
      addEntry(arm.end, 'hand', side);
      limbs.push({ kind: 'arm', side, ...arm, bendAxis: new THREE.Vector3(), hasBendAxis: false });
    }
    const leg = bones.legs[side];
    if (leg) {
      addEntry(leg.upper, 'thigh', side);
      addEntry(leg.mid, 'calf', side);
      addEntry(leg.end, 'foot', side);
      limbs.push({ kind: 'leg', side, clavicle: null, ...leg, bendAxis: new THREE.Vector3(), hasBendAxis: false });
    }
  }

  root.updateWorldMatrix(true, true);
  const hands = {};
  for (const limb of limbs) {
    if (limb.kind !== 'arm') continue;
    const list = Fingers.createHandFingers(limb.end, limb.side, { exclude });
    if (list.length === 0) continue;
    hands[limb.side] = list;
    for (const finger of list) {
      finger.bones.forEach((bone, phalanxIdx) =>
        addEntry(bone, 'finger', limb.side, fingerEntries, `${finger.id}:${phalanxIdx}`),
      );
    }
  }
  const fingers = Object.values(hands).flat();
  const fingerById = new Map(fingers.map((finger) => [finger.id, finger]));
  /** Everything the layer writes: main joints, then finger joints. */
  const posed = [...entries, ...fingerEntries];

  /* ---------------------------------------------------------------- */
  /* Handles                                                           */
  /* ---------------------------------------------------------------- */

  const headTop = new THREE.Vector3();
  const handles = [];
  const groups = new Map();
  const groupOf = (name, list) => {
    groups.set(name, list.filter(Boolean).map((bone) => entryOf.get(bone)).filter(Boolean));
    return name;
  };

  const chestAnchor = bones.neck || bones.head;
  if (mover && bones.pelvis) {
    handles.push({
      id: 'hips',
      label: 'Pinggul',
      kind: 'body',
      type: 'move',
      anchor: bones.pelvis,
      gizmo: bones.pelvis,
      group: groupOf('hips', [mover, bones.pelvis]),
    });
  }
  if (bones.spine.length && chestAnchor) {
    handles.push({
      id: 'chest',
      label: 'Dada',
      kind: 'body',
      type: 'chain',
      chain: bones.spine,
      weights: null,
      anchor: chestAnchor,
      gizmo: bones.spine[bones.spine.length - 1],
      group: groupOf('spine', bones.spine),
    });
  }
  if (bones.head) {
    handles.push({
      id: 'head',
      label: 'Kepala',
      kind: 'body',
      type: 'chain',
      chain: bones.neck ? [bones.neck, bones.head] : [bones.head],
      weights: bones.neck ? [0.4, 1] : [1],
      anchor: bones.head,
      anchorOffset: headTop,
      gizmo: bones.head,
      group: groupOf('head', [bones.neck, bones.head]),
    });
  }
  for (const limb of limbs) {
    const side = SIDE_LABEL[limb.side];
    if (limb.kind === 'arm') {
      const group = groupOf(`arm${limb.side}`, [limb.clavicle, limb.upper, limb.mid, limb.end]);
      if (limb.clavicle) {
        handles.push({
          id: `shoulder${limb.side}`,
          label: `Bahu ${side}`,
          kind: 'joint',
          type: 'chain',
          chain: [limb.clavicle],
          weights: [1],
          anchor: limb.upper,
          gizmo: limb.upper,
          group,
          limb,
        });
      }
      handles.push(
        { id: `elbow${limb.side}`, label: `Siku ${side}`, kind: 'joint', type: 'mid', anchor: limb.mid, gizmo: limb.mid, group, limb },
        { id: `hand${limb.side}`, label: `Tangan ${side}`, kind: 'end', type: 'ik', anchor: limb.end, gizmo: limb.end, group, limb, hand: hands[limb.side] ? limb.side : null },
      );
      // One small handle on each fingertip. They belong to the hand: the
      // view shows them once that hand is picked or seen from close by.
      const hand = hands[limb.side];
      if (hand) {
        groupOf(`fingers${limb.side}`, hand.flatMap((finger) => finger.bones));
        for (const finger of hand) {
          handles.push({
            id: finger.id,
            label: `${finger.label} ${side}`,
            kind: 'finger',
            type: 'finger',
            anchor: finger.tipBone,
            anchorOffset: finger.tipLocal,
            gizmo: finger.knuckle.bone,
            group: groupOf(finger.id, finger.bones),
            finger,
            hand: limb.side,
          });
        }
      }
    } else {
      const group = groupOf(`leg${limb.side}`, [limb.upper, limb.mid, limb.end]);
      handles.push(
        { id: `knee${limb.side}`, label: `Lutut ${side}`, kind: 'joint', type: 'mid', anchor: limb.mid, gizmo: limb.mid, group, limb },
        { id: `foot${limb.side}`, label: `Kaki ${side}`, kind: 'end', type: 'ik', anchor: limb.end, gizmo: limb.end, group, limb },
      );
    }
  }
  if (handles.length === 0) return null;
  const handleById = new Map(handles.map((handle) => [handle.id, handle]));

  // Stick-figure segments drawn between joints so the handles read as a rig.
  const links = [];
  const point = (bone, offset = null) => ({ bone, offset });
  if (bones.pelvis && chestAnchor) links.push([point(bones.pelvis), point(chestAnchor)]);
  if (bones.head && chestAnchor && chestAnchor !== bones.head) links.push([point(chestAnchor), point(bones.head, headTop)]);
  for (const limb of limbs) {
    const rootPoint = limb.kind === 'arm' ? chestAnchor : bones.pelvis;
    if (rootPoint) links.push([point(rootPoint), point(limb.upper)]);
    links.push([point(limb.upper), point(limb.mid)], [point(limb.mid), point(limb.end)]);
  }
  for (const finger of fingers) {
    const knuckle = finger.knuckle.bone;
    const wrist = bones.arms[finger.side].end;
    for (const link of [
      [point(wrist), point(knuckle)],
      [point(knuckle), point(finger.tipBone, finger.tipLocal)],
    ]) {
      link.hand = finger.side;
      links.push(link);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Layer: base (animation) + offsets                                 */
  /* ---------------------------------------------------------------- */

  let attached = false;
  const listeners = new Set();
  /** Extra passes that derive from the posed skeleton, e.g. cloth stems. */
  const layers = [];
  const pins = { feet: true, hands: false };
  const undoStack = [];
  const redoStack = [];

  const correctives = createHelperCorrectives({
    entries,
    entryOf,
    exclude,
    unit: () => referenceLength(),
  });

  function referenceLength() {
    if (bones.pelvis && chestAnchor) {
      _v1.setFromMatrixPosition(bones.pelvis.matrixWorld);
      _v2.setFromMatrixPosition(chestAnchor.matrixWorld);
      const length = _v1.distanceTo(_v2);
      if (length > 1e-4) return length;
    }
    return 0.5;
  }

  function emit(reason, detail = null) {
    for (const listener of listeners) listener(reason, detail);
  }

  function attach() {
    if (attached) return;
    for (const entry of posed) {
      entry.base.copy(entry.bone.quaternion);
      if (entry.movable) entry.basePos.copy(entry.bone.position);
      if (!entry.active) continue;
      entry.bone.quaternion.multiply(entry.offset);
      if (entry.movable) entry.bone.position.add(entry.posOffset);
    }
    correctives.apply();
    for (const layer of layers) layer.apply();
    attached = true;
  }

  function detach() {
    if (!attached) return;
    for (let i = layers.length - 1; i >= 0; i--) layers[i].restore();
    correctives.restore();
    for (const entry of posed) {
      if (!entry.active) continue;
      entry.bone.quaternion.copy(entry.base);
      if (entry.movable) entry.bone.position.copy(entry.basePos);
    }
    attached = false;
  }

  /** Reads the offsets back from the bones after a solver or gizmo moved them. */
  function capture() {
    for (const entry of posed) {
      _q1.copy(entry.base).invert().multiply(entry.bone.quaternion);
      if (_q1.w < 0) _q1.set(-_q1.x, -_q1.y, -_q1.z, -_q1.w);
      entry.offset.copy(_q1).normalize();
      const rotated = 2 * Math.acos(Math.min(1, entry.offset.w)) > 1e-4;
      let moved = false;
      if (entry.movable) {
        entry.posOffset.subVectors(entry.bone.position, entry.basePos);
        moved = entry.posOffset.lengthSq() > 1e-10;
      }
      if (!rotated) entry.offset.identity();
      if (!moved) entry.posOffset.set(0, 0, 0);
      entry.active = rotated || moved;
    }
  }

  /** Clamps how far a bone may be turned away from the animation's value. */
  function enforceLimit(bone) {
    const entry = entryOf.get(bone);
    if (!entry || !entry.limit) return;
    _q1.copy(entry.base).invert().multiply(entry.bone.quaternion);
    if (_q1.w < 0) _q1.set(-_q1.x, -_q1.y, -_q1.z, -_q1.w);
    const angle = 2 * Math.acos(Math.min(1, _q1.w));
    if (angle <= entry.limit) return;
    _q2.identity().slerp(_q1, entry.limit / angle);
    bone.quaternion.copy(entry.base).multiply(_q2).normalize();
    bone.updateWorldMatrix(false, true);
  }

  function refreshHelpers() {
    for (let i = layers.length - 1; i >= 0; i--) layers[i].restore();
    correctives.restore();
    correctives.apply();
    for (const layer of layers) layer.apply();
  }

  function snapshotState() {
    return posed.map((entry) => ({
      offset: entry.offset.clone(),
      posOffset: entry.posOffset.clone(),
      active: entry.active,
    }));
  }

  function applyState(state) {
    const wasAttached = attached;
    detach();
    posed.forEach((entry, index) => {
      const saved = state[index];
      entry.offset.copy(saved.offset);
      entry.posOffset.copy(saved.posOffset);
      entry.active = saved.active;
    });
    if (wasAttached) attach();
  }

  function pushUndo() {
    undoStack.push(snapshotState());
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack.length = 0;
  }

  function sameState(a, b) {
    return a.every((item, index) => item.active === b[index].active
      && Math.abs(item.offset.dot(b[index].offset)) > 1 - 1e-9
      && item.posOffset.distanceToSquared(b[index].posOffset) < 1e-12);
  }

  /** Drops the undo step again when an interaction ended without a change. */
  function discardIfUnchanged() {
    const last = undoStack[undoStack.length - 1];
    if (last && sameState(last, snapshotState())) undoStack.pop();
  }

  /* ---------------------------------------------------------------- */
  /* Solvers                                                           */
  /* ---------------------------------------------------------------- */

  function bodyFrame(forward, up) {
    up.set(0, 1, 0);
    if (bones.pelvis && chestAnchor) {
      _v1.setFromMatrixPosition(bones.pelvis.matrixWorld);
      up.setFromMatrixPosition(chestAnchor.matrixWorld).sub(_v1);
      if (up.lengthSq() < 1e-8) up.set(0, 1, 0);
      up.normalize();
    }
    const left = bones.legs.L?.upper || bones.arms.L?.upper;
    const right = bones.legs.R?.upper || bones.arms.R?.upper;
    if (left && right) {
      _v1.setFromMatrixPosition(right.matrixWorld);
      _v2.setFromMatrixPosition(left.matrixWorld);
      forward.crossVectors(up, _v1.sub(_v2));
      if (forward.lengthSq() > 1e-10) {
        forward.normalize();
        return;
      }
    }
    forward.set(0, 0, 1).transformDirection(root.matrixWorld);
  }

  /** Records the limb's hinge axis (in the upper bone's frame) when it is clearly bent. */
  function observeLimb(limb) {
    _pa.setFromMatrixPosition(limb.upper.matrixWorld);
    _pb.setFromMatrixPosition(limb.mid.matrixWorld);
    _pc.setFromMatrixPosition(limb.end.matrixWorld);
    _v1.subVectors(_pa, _pb);
    _v2.subVectors(_pc, _pb);
    _axis.crossVectors(_v2, _v1);
    const scale = _v1.length() * _v2.length();
    if (scale < 1e-10 || _axis.length() / scale < BEND_CONFIDENCE) return false;
    _axis.normalize();
    limb.upper.getWorldQuaternion(_q1).invert();
    limb.bendAxis.copy(_axis).applyQuaternion(_q1);
    limb.hasBendAxis = true;
    return true;
  }

  /** Closing axis for a straight limb: knees fold forward, elbows fold back. */
  function guessBendAxis(limb, lowerDir, out) {
    const forward = _v1;
    const up = _v3;
    bodyFrame(forward, up);
    if (limb.kind === 'arm') forward.negate();
    out.crossVectors(forward, lowerDir);
    if (out.lengthSq() < 0.02) {
      if (limb.kind === 'arm') up.negate();
      out.crossVectors(up, lowerDir);
    }
    if (out.lengthSq() < 1e-8) out.set(1, 0, 0);
    out.normalize();

    // Rigs built from hinges have the hinge on one of the bone's own axes.
    limb.mid.getWorldQuaternion(_q1);
    let bestDot = 0.8;
    let best = null;
    for (const principal of PRINCIPAL_AXES) {
      const dot = _v2.copy(principal).applyQuaternion(_q1).dot(out);
      if (dot > bestDot) {
        bestDot = dot;
        best = principal;
      }
    }
    if (best) out.copy(best).applyQuaternion(_q1);
  }

  /**
   * Analytic two-bone IK. Bends the middle joint about its hinge so the end
   * is the right distance from the root, then swings the whole limb onto the
   * target. Only rotations change, so segment lengths are preserved exactly.
   */
  function solveLimb(limb, target, endWorldQuat = null) {
    const { upper, mid, end } = limb;
    _pa.setFromMatrixPosition(upper.matrixWorld);
    _pb.setFromMatrixPosition(mid.matrixWorld);
    _pc.setFromMatrixPosition(end.matrixWorld);
    const upperLength = _pa.distanceTo(_pb);
    const lowerLength = _pb.distanceTo(_pc);
    if (upperLength < 1e-6 || lowerLength < 1e-6) return;

    const toTarget = _v3.subVectors(target, _pa);
    const wanted = toTarget.length();
    if (wanted < 1e-6) return;
    const folded = Math.sqrt(
      upperLength * upperLength + lowerLength * lowerLength
        - 2 * upperLength * lowerLength * Math.cos(MIN_JOINT_ANGLE),
    );
    const distance = THREE.MathUtils.clamp(wanted, folded, upperLength + lowerLength);
    toTarget.multiplyScalar(1 / wanted);

    // 1) Bend the middle joint.
    const toRoot = _v1.subVectors(_pa, _pb);
    const toEnd = _v2.subVectors(_pc, _pb);
    const current = toRoot.angleTo(toEnd);
    const desired = Math.acos(THREE.MathUtils.clamp(
      (upperLength * upperLength + lowerLength * lowerLength - distance * distance)
        / (2 * upperLength * lowerLength),
      -1,
      1,
    ));
    _axis.crossVectors(toEnd, toRoot);
    if (_axis.length() / (upperLength * lowerLength) >= BEND_CONFIDENCE) {
      _axis.normalize();
    } else if (limb.hasBendAxis) {
      upper.getWorldQuaternion(_q1);
      _axis.copy(limb.bendAxis).applyQuaternion(_q1);
    } else {
      const lowerDir = _pc.clone().sub(_pb).normalize();
      guessBendAxis(limb, lowerDir, _axis);
      // guessBendAxis used the scratch vectors: restore what the swing needs.
      _pa.setFromMatrixPosition(upper.matrixWorld);
      _v3.subVectors(target, _pa).normalize();
    }
    _q1.setFromAxisAngle(_axis, current - desired);
    rotateWorld(mid, _q1);

    // 2) Swing the limb so the end lands on the target.
    _pc.setFromMatrixPosition(end.matrixWorld);
    _v1.subVectors(_pc, _pa);
    if (_v1.lengthSq() > 1e-12) {
      _q1.setFromUnitVectors(_v1.normalize(), _v3);
      rotateWorld(upper, _q1);
    }

    if (endWorldQuat) setWorldQuaternion(end, endWorldQuat);
    observeLimb(limb);
  }

  /**
   * Turns the limb about the root→end axis: the middle joint moves, the end stays.
   * Returns false when the limb is too straight for that to do anything useful.
   */
  function swivelLimb(limb, target, endWorldQuat = null) {
    _pa.setFromMatrixPosition(limb.upper.matrixWorld);
    _pb.setFromMatrixPosition(limb.mid.matrixWorld);
    _pc.setFromMatrixPosition(limb.end.matrixWorld);
    _axis.subVectors(_pc, _pa);
    if (_axis.lengthSq() < 1e-10) return false;
    _axis.normalize();
    _v1.subVectors(_pb, _pa);
    _v1.addScaledVector(_axis, -_v1.dot(_axis));
    _v2.subVectors(target, _pa);
    _v2.addScaledVector(_axis, -_v2.dot(_axis));
    // A nearly straight limb has no meaningful bend direction: turning it
    // would only twist the leg or arm about itself, so the response fades
    // out as the limb straightens.
    const bend = _v1.length() / Math.max(_pa.distanceTo(_pb), 1e-6);
    const response = THREE.MathUtils.smoothstep(bend, 0.04, 0.22);
    if (response <= 0 || _v2.lengthSq() < 1e-10) return false;
    const angle = Math.atan2(_v3.crossVectors(_v1, _v2).dot(_axis), _v1.dot(_v2));
    _q1.setFromAxisAngle(_axis, THREE.MathUtils.clamp(angle, -MAX_SWIVEL, MAX_SWIVEL) * response);
    rotateWorld(limb.upper, _q1);
    if (endWorldQuat) setWorldQuaternion(limb.end, endWorldQuat);
    return response > 0.2;
  }

  /** Turns `bone` so that `effector` (a point that moves with it) heads for `target`. */
  function aimBone(bone, effector, target, fraction = 1) {
    _pa.setFromMatrixPosition(bone.matrixWorld);
    _v1.subVectors(effector, _pa);
    _v2.subVectors(target, _pa);
    if (_v1.lengthSq() < 1e-12 || _v2.lengthSq() < 1e-12) return;
    _q1.setFromUnitVectors(_v1.normalize(), _v2.normalize());
    if (fraction < 1) _q1.copy(_q2.identity().slerp(_q1, fraction));
    rotateWorld(bone, _q1);
    enforceLimit(bone);
  }

  function handlePosition(handle, out) {
    if (handle.anchorOffset) return out.copy(handle.anchorOffset).applyMatrix4(handle.anchor.matrixWorld);
    return out.setFromMatrixPosition(handle.anchor.matrixWorld);
  }

  function isPinned(limb) {
    return limb.kind === 'leg' ? pins.feet : pins.hands;
  }

  function recordPins() {
    return limbs.filter(isPinned).map((limb) => ({
      limb,
      position: new THREE.Vector3().setFromMatrixPosition(limb.end.matrixWorld),
      quaternion: limb.end.getWorldQuaternion(new THREE.Quaternion()),
    }));
  }

  function applyPins(pinList, skipBone = null, skipLimb = null) {
    for (const pin of pinList) {
      const { limb } = pin;
      if (limb === skipLimb) continue;
      if (skipBone && (limb.upper === skipBone || limb.mid === skipBone || limb.end === skipBone)) continue;
      // A hand or foot that has not been carried away needs no correction;
      // solving anyway would only add rounding noise to an untouched limb.
      _pc.setFromMatrixPosition(limb.end.matrixWorld);
      if (_pc.distanceToSquared(pin.position) < 1e-10) continue;
      solveLimb(limb, pin.position, pin.quaternion);
    }
  }

  function updateSkeletonMatrices() {
    const top = mover || entries[0].bone;
    top.updateWorldMatrix(true, true);
  }

  /* ---------------------------------------------------------------- */
  /* Dragging a handle                                                 */
  /* ---------------------------------------------------------------- */

  function beginDrag(id) {
    const handle = handleById.get(id);
    if (!handle) return null;
    attach();
    updateSkeletonMatrices();
    for (const limb of limbs) observeLimb(limb);
    pushUndo();
    const drag = {
      handle,
      start: handlePosition(handle, new THREE.Vector3()),
      pose: posed.map((entry) => ({
        quaternion: entry.bone.quaternion.clone(),
        position: entry.bone.position.clone(),
      })),
      pins: recordPins(),
      moverStart: mover ? new THREE.Vector3().setFromMatrixPosition(mover.matrixWorld) : null,
      endQuat: handle.limb ? handle.limb.end.getWorldQuaternion(new THREE.Quaternion()) : null,
      finger: handle.type === 'finger' ? Fingers.grabFinger(handle.finger) : null,
    };
    return drag;
  }

  /** `eye` is the camera's position; fingertips are matched along its line of sight. */
  function dragTo(drag, target, eye = null) {
    const { handle } = drag;
    // Always solve from the pose at grab time: the result then depends only on
    // where the pointer is, not on the path it took to get there.
    posed.forEach((entry, index) => {
      entry.bone.quaternion.copy(drag.pose[index].quaternion);
      if (entry.movable) entry.bone.position.copy(drag.pose[index].position);
    });
    updateSkeletonMatrices();

    let skipLimb = null;
    if (handle.type === 'move') {
      _v1.copy(drag.moverStart).add(target).sub(drag.start);
      if (mover.parent) mover.parent.worldToLocal(_v1);
      mover.position.copy(_v1);
      mover.updateWorldMatrix(false, true);
    } else if (handle.type === 'chain') {
      const count = handle.chain.length;
      const effector = new THREE.Vector3();
      handle.chain.forEach((bone, index) => {
        handlePosition(handle, effector);
        aimBone(bone, effector, target, handle.weights ? handle.weights[index] : 1 / (count - index));
      });
    } else if (handle.type === 'mid') {
      const { limb } = handle;
      if (isPinned(limb)) {
        const pin = drag.pins.find((item) => item.limb === limb);
        const turned = swivelLimb(limb, target, pin?.quaternion ?? null);
        skipLimb = limb;
        if (!turned && !drag.stuck) {
          drag.stuck = true;
          emit('stuck', handle);
        }
      } else {
        aimBone(limb.upper, _pb.setFromMatrixPosition(limb.mid.matrixWorld).clone(), target);
      }
    } else if (handle.type === 'ik') {
      const { limb } = handle;
      solveLimb(limb, target, limb.kind === 'leg' ? drag.endQuat : null);
      skipLimb = limb;
    } else if (handle.type === 'finger') {
      Fingers.dragFinger(handle.finger, drag.finger, target, eye);
    }

    applyPins(drag.pins, null, skipLimb);
    capture();
    refreshHelpers();
    emit('pose');
  }

  function endDrag() {
    discardIfUnchanged();
    emit('commit');
  }

  /* ---------------------------------------------------------------- */
  /* Direct rotation (gizmo)                                           */
  /* ---------------------------------------------------------------- */

  function beginEdit(bone) {
    attach();
    updateSkeletonMatrices();
    pushUndo();
    return { bone, pins: recordPins() };
  }

  function updateEdit(edit) {
    enforceLimit(edit.bone);
    edit.bone.updateWorldMatrix(false, true);
    applyPins(edit.pins, edit.bone);
    capture();
    refreshHelpers();
    emit('pose');
  }

  function endEdit() {
    discardIfUnchanged();
    emit('commit');
  }

  /* ---------------------------------------------------------------- */
  /* Fingers (sliders and ready-made hands)                            */
  /* ---------------------------------------------------------------- */

  /** Opens an edit that a slider then feeds; close it with endEdit(). */
  function beginFingerEdit() {
    attach();
    updateSkeletonMatrices();
    pushUndo();
  }

  function fingersChanged() {
    capture();
    refreshHelpers();
    emit('pose');
  }

  /** 0 straight to 1 folded. Call between beginFingerEdit() and endEdit(). */
  function setFingerCurl(id, amount) {
    const finger = fingerById.get(id);
    if (!finger) return;
    Fingers.setFingerCurl(finger, amount);
    fingersChanged();
  }

  /** -1 together to 1 apart. Call between beginFingerEdit() and endEdit(). */
  function setHandSpread(side, amount) {
    if (!hands[side]) return;
    Fingers.setHandSpread(hands[side], amount);
    fingersChanged();
  }

  /** Puts a hand into one of Fingers.HAND_SHAPES, as one undo step. */
  function shapeHand(side, shapeId) {
    const shape = Fingers.HAND_SHAPES.find((item) => item.id === shapeId);
    if (!hands[side] || !shape) return false;
    beginFingerEdit();
    Fingers.shapeHand(hands[side], shape);
    capture();
    refreshHelpers();
    endEdit();
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* Reset / undo                                                      */
  /* ---------------------------------------------------------------- */

  function clearEntries(list) {
    const wasAttached = attached;
    detach();
    for (const entry of list) {
      entry.offset.identity();
      entry.posOffset.set(0, 0, 0);
      entry.active = false;
    }
    if (wasAttached) attach();
  }

  function resetGroup(groupName) {
    const list = groups.get(groupName);
    if (!list || !list.some((entry) => entry.active)) return false;
    pushUndo();
    clearEntries(list);
    emit('commit');
    return true;
  }

  function resetAll() {
    if (!posed.some((entry) => entry.active)) return false;
    pushUndo();
    clearEntries(posed);
    emit('commit');
    return true;
  }

  function undo() {
    if (undoStack.length === 0) return false;
    redoStack.push(snapshotState());
    applyState(undoStack.pop());
    emit('commit');
    return true;
  }

  function redo() {
    if (redoStack.length === 0) return false;
    undoStack.push(snapshotState());
    applyState(redoStack.pop());
    emit('commit');
    return true;
  }

  /** Places the head handle at the middle of the head, measured from the model's bounds. */
  function calibrate(box) {
    if (!bones.head) return;
    bones.head.updateWorldMatrix(true, false);
    const headPos = _pa.setFromMatrixPosition(bones.head.matrixWorld);
    const direction = _v1.set(0, 1, 0);
    let neckLength = 0;
    if (bones.neck) {
      _pb.setFromMatrixPosition(bones.neck.matrixWorld);
      neckLength = headPos.distanceTo(_pb);
      if (neckLength > 1e-5) direction.subVectors(headPos, _pb).normalize();
    }
    const fallback = neckLength > 0 ? neckLength * 1.2 : referenceLength() * 0.2;
    let lift = fallback;
    if (box && !box.isEmpty()) {
      const measured = (box.max.y - headPos.y) * 0.5;
      const lower = neckLength > 0 ? neckLength * 0.6 : fallback * 0.5;
      const upper = neckLength > 0 ? neckLength * 6 : fallback * 4;
      if (Number.isFinite(measured)) lift = THREE.MathUtils.clamp(measured, lower, upper);
    }
    _pc.copy(headPos).addScaledVector(direction, lift);
    headTop.copy(_pc).applyMatrix4(_mInv.copy(bones.head.matrixWorld).invert());
  }

  root.updateWorldMatrix(true, true);
  calibrate(null);
  for (const limb of limbs) observeLimb(limb);
  attach();

  return {
    handles,
    links,
    bones,
    limbs,
    entries,
    pins,
    correctives,
    get attached() {
      return attached;
    },
    attach,
    detach,
    calibrate,
    handle: (id) => handleById.get(id) ?? null,
    handlePosition,
    pointPosition(pointRef, out) {
      if (pointRef.offset) return out.copy(pointRef.offset).applyMatrix4(pointRef.bone.matrixWorld);
      return out.setFromMatrixPosition(pointRef.bone.matrixWorld);
    },
    isPinned: (handle) => Boolean(handle.type === 'ik' && isPinned(handle.limb)),
    isGroupModified: (groupName) => Boolean(groups.get(groupName)?.some((entry) => entry.active)),
    hasPose: () => posed.some((entry) => entry.active),
    beginDrag,
    dragTo,
    endDrag,
    beginEdit,
    updateEdit,
    endEdit,
    /** Fingers per hand: { L: [...], R: [...] }, thumb first. Empty for a rig without finger bones. */
    hands,
    handShapes: Fingers.HAND_SHAPES,
    fingerCurl: (id) => (fingerById.has(id) ? Fingers.fingerCurl(fingerById.get(id)) : 0),
    handSpread: (side) => (hands[side] ? Fingers.handSpread(hands[side]) : 0),
    beginFingerEdit,
    setFingerCurl,
    setHandSpread,
    shapeHand,
    resetGroup,
    resetAll,
    undo,
    redo,
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    posedEntries: () => posed,
    snapshotRaw: () => snapshotState(),
    restoreRaw(state, { recordUndo = false } = {}) {
      if (!state) return false;
      if (recordUndo) pushUndo();
      applyState(state);
      emit('commit');
      return true;
    },
    commitChange() {
      emit('commit');
    },
    /** Re-runs the helper correction, e.g. after it was learned or toggled. */
    refresh() {
      if (!attached) return;
      refreshHelpers();
      emit('pose');
    },
    /**
     * Adds a pass with apply() / restore() that runs after the pose and the
     * helper correction, and is undone again before the mixer writes.
     */
    addLayer(layer) {
      layers.push(layer);
      if (attached) layer.apply();
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      listeners.clear();
      undoStack.length = 0;
      redoStack.length = 0;
    },
  };
}
