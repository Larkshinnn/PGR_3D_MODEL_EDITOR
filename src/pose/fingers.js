import * as THREE from 'three';

/**
 * Fingers for the pose rig.
 *
 * A finger is a short chain of hinges. Posing it joint by joint is fiddly and
 * easily produces a broken-looking hand, so each finger is driven by two
 * values instead: how far it is curled, spread over its joints the way a real
 * finger folds, and how far it leans sideways at the knuckle. Every joint
 * keeps to its hinge and its range, so a finger can not bend backwards or
 * sideways through itself.
 *
 * All functions here read and write bone rotations directly. The pose rig
 * wraps them in its own layer (offsets over the animation, undo, reset).
 *
 * Must be created while the skeleton is in its rest pose: that pose is what
 * "straight" means.
 */

const DEG = Math.PI / 180;

const DIGIT_LABELS = ['Jempol', 'Telunjuk', 'Jari tengah', 'Jari manis', 'Kelingking'];
const DIGIT_NAMES = [/thumb/, /index/, /middle/, /ring/, /pinky|little/];
const FINGER_NAME = /finger|thumb|(^|hand|left|right|[lr])(index|middle|ring|pinky|little)/;
const NOT_A_JOINT = /nub|tip|end$/;

/** Flexion range of each kind of joint, measured from the rest pose. */
const RANGE = {
  meta: [-4 * DEG, 10 * DEG],
  prox: [-20 * DEG, 88 * DEG],
  mid: [-3 * DEG, 105 * DEG],
  dist: [-8 * DEG, 75 * DEG],
  cmc: [-15 * DEG, 40 * DEG],
  mcp: [-10 * DEG, 55 * DEG],
  ip: [-15 * DEG, 80 * DEG],
};
const FINGER_SPREAD = 18 * DEG;
const THUMB_SPREAD = 30 * DEG;

/** Ready-made hands: curl per digit (thumb first, 0 straight to 1 folded) and sideways spread. */
export const HAND_SHAPES = [
  { id: 'open', label: 'Lurus', curl: [0, 0, 0, 0, 0], spread: 0.15, thumbSpread: 0.2 },
  { id: 'relaxed', label: 'Rileks', curl: [0.2, 0.22, 0.3, 0.38, 0.45], spread: 0, thumbSpread: 0 },
  { id: 'fist', label: 'Kepal', curl: [0.7, 1, 1, 1, 1], spread: 0, thumbSpread: -0.5 },
  { id: 'point', label: 'Tunjuk', curl: [0.75, 0, 1, 1, 1], spread: 0, thumbSpread: -0.5 },
  { id: 'peace', label: 'Dua jari', curl: [0.8, 0, 0, 1, 1], spread: 0.9, thumbSpread: -0.6 },
  { id: 'thumb', label: 'Jempol', curl: [0, 1, 1, 1, 1], spread: 0, thumbSpread: 0.9 },
];

const PRINCIPAL_AXES = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
];

const _q = new THREE.Quaternion();
const _twist = new THREE.Quaternion();
const _swing = new THREE.Quaternion();
const _w = new THREE.Vector3();
const _tip = new THREE.Vector3();

function rawName(object) {
  return String(object?.userData?.originalName || object?.name || '');
}

function keyOf(object) {
  return rawName(object).replace(/[\s_\-.:|]+/g, '').toLowerCase();
}

const isFingerBone = (object) => {
  if (object.isMesh) return false;
  const key = keyOf(object);
  return FINGER_NAME.test(key) && !NOT_A_JOINT.test(key);
};

/** Which digit a chain is, from its root's name: 0 thumb to 4 little finger, or -1. */
function digitOf(root) {
  const key = keyOf(root);
  const named = DIGIT_NAMES.findIndex((pattern) => pattern.test(key));
  if (named >= 0) return named;
  // 3ds Max Biped: "Finger0" is the thumb, "Finger12" the index's third link.
  const numbered = /finger(\d)\d?$/.exec(key);
  return numbered ? Number(numbered[1]) : -1;
}

const worldPosition = (object) => new THREE.Vector3().setFromMatrixPosition(object.matrixWorld);

/** Signed angle of the part of `q` that turns about the unit `axis`. */
function twistAngle(q, axis) {
  let angle = 2 * Math.atan2(q.x * axis.x + q.y * axis.y + q.z * axis.z, q.w);
  if (angle > Math.PI) angle -= 2 * Math.PI;
  else if (angle < -Math.PI) angle += 2 * Math.PI;
  return angle;
}

/**
 * Brings a hinge guessed from the hand's shape onto the bone's own axis when
 * the rig was clearly built that way (the bone runs along one of its axes).
 */
function snapToBoneAxis(axis, boneDirection, taken = null) {
  const aligned = PRINCIPAL_AXES.some((principal) => principal.dot(boneDirection) > 0.9);
  if (!aligned) return axis;
  let best = null;
  let bestDot = 0.5;
  for (const principal of PRINCIPAL_AXES) {
    if (Math.abs(principal.dot(boneDirection)) > 0.5) continue;
    if (taken && Math.abs(principal.dot(taken)) > 0.9) continue;
    const dot = principal.dot(axis);
    if (dot > bestDot) {
      bestDot = dot;
      best = principal;
    }
  }
  return best ? best.clone() : axis;
}

function findChains(hand, exclude) {
  const chains = [];
  const visit = (object) => {
    for (const child of object.children) {
      if (child.isMesh || exclude?.has(child)) continue;
      if (!isFingerBone(child)) {
        // Some rigs hang the fingers off a palm bone.
        if (/palm|metacarp/.test(keyOf(child))) visit(child);
        continue;
      }
      const bones = [child];
      for (;;) {
        const next = bones[bones.length - 1].children.find((item) => isFingerBone(item) && !exclude?.has(item));
        if (!next || bones.length >= 4) break;
        bones.push(next);
      }
      if (bones.length >= 2) chains.push(bones);
    }
  };
  visit(hand);
  return chains;
}

/**
 * Finds and measures the fingers of one hand.
 * `side` is 'L' or 'R'; it settles which face of the hand is the palm.
 * Returns [] when the hand has no finger bones that can be understood.
 */
export function createHandFingers(hand, side, { exclude = null } = {}) {
  const chains = findChains(hand, exclude);
  if (chains.length < 2) return [];

  // Digits by name where the names say so, otherwise in the order found.
  const taken = new Set();
  const digits = chains.map((bones) => {
    const digit = digitOf(bones[0]);
    if (digit < 0 || digit > 4 || taken.has(digit)) return -1;
    taken.add(digit);
    return digit;
  });
  let free = 0;
  for (let i = 0; i < digits.length; i++) {
    if (digits[i] >= 0) continue;
    while (taken.has(free)) free++;
    digits[i] = Math.min(free, 4);
    taken.add(free);
  }

  const wrist = worldPosition(hand);
  const raw = chains.map((bones, index) => {
    const points = bones.map(worldPosition);
    const last = points.length - 1;
    // The tip: a nub bone when the rig has one, otherwise a little beyond the last joint.
    const nub = bones[last].children.find((child) => !child.isMesh && NOT_A_JOINT.test(keyOf(child)));
    const tip = nub
      ? worldPosition(nub)
      : points[last].clone().addScaledVector(points[last].clone().sub(points[last - 1]), 0.9);
    return { bones, points, tip, digit: digits[index], thumb: digits[index] === 0 && taken.size > 2 };
  }).sort((a, b) => a.digit - b.digit);

  const others = raw.filter((item) => !item.thumb);
  if (others.length === 0) return [];

  // The hand's own frame: along the fingers, across the knuckles, out of the palm.
  const along = new THREE.Vector3();
  for (const item of others) along.add(item.tip.clone().sub(item.points[0]).normalize());
  along.normalize();
  const across = new THREE.Vector3();
  if (others.length >= 2) {
    // The second joints: knuckles, where the roots can be bunched up at the wrist.
    across.subVectors(others[0].points[1], others[others.length - 1].points[1]);
  } else {
    const thumb = raw.find((item) => item.thumb);
    if (!thumb) return [];
    across.subVectors(thumb.points[1], others[0].points[1]);
  }
  across.addScaledVector(along, -across.dot(along));
  if (across.lengthSq() < 1e-10) return [];
  const width = across.length();
  across.normalize();
  // With the thumb side known, which face is the palm depends only on which hand it is.
  const palm = new THREE.Vector3().crossVectors(across, along).multiplyScalar(side === 'L' ? -1 : 1).normalize();
  const centre = new THREE.Vector3();
  for (const item of others) centre.add(item.points[1]);
  centre.multiplyScalar(1 / others.length);

  /** `shared`: the bone axis the other fingers of this hand hinge on, if they agree on one. */
  const measure = (item, shared = null) => {
    const { bones, points, tip, thumb } = item;
    const count = bones.length;
    // A root that sits back in the palm is a metacarpal: it barely moves.
    const inPalm = !thumb && count >= 3
      && points[0].distanceTo(wrist) < points[1].distanceTo(wrist) * 0.5;
    const kinds = thumb
      ? ['cmc', 'mcp', 'ip', 'ip']
      : inPalm ? ['meta', 'prox', 'mid', 'dist'] : ['prox', 'mid', 'dist', 'dist'];
    const knuckle = thumb ? 0 : inPalm ? 1 : 0;

    // Fingers fold into the palm; the thumb folds across it.
    const fold = thumb
      ? new THREE.Vector3().addScaledVector(across, -0.8).addScaledVector(palm, 0.6).normalize()
      : palm;

    const joints = bones.map((bone, index) => {
      const next = index + 1 < count ? points[index + 1] : tip;
      const direction = next.clone().sub(points[index]).normalize();
      const toLocal = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
      const localDirection = direction.clone().applyQuaternion(toLocal);

      const hingeWorld = new THREE.Vector3().crossVectors(direction, fold);
      if (hingeWorld.lengthSq() < 1e-8) hingeWorld.crossVectors(direction, palm);
      hingeWorld.normalize();
      let hinge;
      if (shared && Math.abs(shared.dot(localDirection)) < 0.5) {
        // Which way a thumb folds is hard to tell from the hand's shape alone.
        // A rig that hinges every finger on the same bone axis does the same
        // for its thumb, whose bones are rolled so that this folds it across
        // the palm.
        hinge = shared.clone();
        hingeWorld.copy(hinge).applyQuaternion(toLocal.clone().invert());
      } else {
        hinge = snapToBoneAxis(hingeWorld.clone().applyQuaternion(toLocal), localDirection);
      }

      let spreadAxis = null;
      let spreadGain = 0;
      let spreadLimit = 0;
      if (index === knuckle) {
        const axisWorld = thumb ? hingeWorld.clone().cross(direction).normalize() : palm.clone();
        spreadAxis = snapToBoneAxis(axisWorld.clone().applyQuaternion(toLocal), localDirection, hinge);
        // Which way a positive turn carries the finger, against "away from the middle of the hand".
        const carried = spreadAxis.clone().applyQuaternion(toLocal.clone().invert()).cross(direction);
        if (thumb) {
          spreadGain = Math.sign(carried.dot(across)) || 1;
          spreadLimit = THUMB_SPREAD;
        } else {
          const offCentre = points[1].clone().sub(centre).dot(across) / Math.max(width * 0.5, 1e-6);
          spreadGain = THREE.MathUtils.clamp(offCentre, -1, 1) * (Math.sign(carried.dot(across)) || 1);
          spreadLimit = FINGER_SPREAD;
        }
      }

      const [min, max] = RANGE[kinds[index]];
      return { bone, rest: bone.quaternion.clone(), hinge, min, max, spreadAxis, spreadGain, spreadLimit };
    });

    const lastBone = bones[count - 1];
    return {
      id: `finger${side}${item.digit}`,
      side,
      digit: item.digit,
      thumb,
      label: DIGIT_LABELS[item.digit] ?? `Jari ${item.digit + 1}`,
      bones,
      joints,
      knuckle: joints[knuckle],
      tipBone: lastBone,
      tipLocal: lastBone.worldToLocal(tip.clone()),
    };
  };

  const fingers = others.map((item) => measure(item));
  const thumb = raw.find((item) => item.thumb);
  if (thumb) {
    const votes = new Map();
    let joints = 0;
    for (const finger of fingers) {
      for (const joint of finger.joints) {
        joints++;
        const axis = PRINCIPAL_AXES.find((principal) => principal.equals(joint.hinge));
        if (axis) votes.set(axis, (votes.get(axis) ?? 0) + 1);
      }
    }
    const [axis, count] = [...votes].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
    fingers.unshift(measure(thumb, count * 2 > joints ? axis : null));
  }
  return fingers;
}

/* ------------------------------------------------------------------ */
/* Reading and writing one joint                                       */
/* ------------------------------------------------------------------ */

/**
 * Splits a joint's rotation (relative to rest) into flexion about the hinge,
 * sideways lean about the spread axis, and whatever is left over.
 */
function readJoint(joint, out) {
  _q.copy(joint.rest).invert().multiply(joint.bone.quaternion);
  out.flex = twistAngle(_q, joint.hinge);
  _twist.setFromAxisAngle(joint.hinge, out.flex).invert();
  _swing.copy(_q).multiply(_twist);
  out.spread = 0;
  if (joint.spreadAxis) {
    out.spread = twistAngle(_swing, joint.spreadAxis);
    _twist.setFromAxisAngle(joint.spreadAxis, out.spread).invert();
    _swing.multiply(_twist);
  }
  out.leftover.copy(_swing);
  return out;
}

function writeJoint(joint, flex, spread, leftover) {
  const q = joint.bone.quaternion.copy(joint.rest);
  if (leftover) q.multiply(leftover);
  if (joint.spreadAxis && spread) q.multiply(_twist.setFromAxisAngle(joint.spreadAxis, spread));
  q.multiply(_twist.setFromAxisAngle(joint.hinge, flex)).normalize();
}

const newReading = () => ({ flex: 0, spread: 0, leftover: new THREE.Quaternion() });
const _reading = newReading();

/** Where a joint sits for a curl of `amount`: 0 straight, 1 folded, below 0 bent back. */
const flexAt = (joint, amount) => (amount >= 0 ? amount * joint.max : -amount * joint.min);

/** How far the finger is curled right now: 0 straight, 1 fully folded, below 0 bent back. */
export function fingerCurl(finger) {
  let flex = 0;
  let folded = 0;
  let back = 0;
  for (const joint of finger.joints) {
    flex += readJoint(joint, _reading).flex;
    folded += joint.max;
    back -= joint.min;
  }
  return THREE.MathUtils.clamp(flex >= 0 ? flex / folded : flex / back, -1, 1);
}

/** How far the finger leans sideways at its knuckle, in units of its own range: -1 to 1. */
export function fingerSpread(finger) {
  const joint = finger.knuckle;
  return THREE.MathUtils.clamp(readJoint(joint, _reading).spread / joint.spreadLimit, -1, 1);
}

/**
 * Sets how far the finger is curled, keeping whatever else its joints are
 * doing (the sideways lean, small twists from the animation).
 * With `clean`, the joints are set to exactly this curl and `spread` instead.
 */
export function setFingerCurl(finger, amount, { clean = false, spread = 0 } = {}) {
  for (const joint of finger.joints) {
    const flex = flexAt(joint, amount);
    if (clean) {
      writeJoint(joint, flex, joint === finger.knuckle ? spread * joint.spreadLimit : 0, null);
    } else {
      readJoint(joint, _reading);
      writeJoint(joint, flex, _reading.spread, _reading.leftover);
    }
  }
  finger.bones[0].updateWorldMatrix(false, true);
}

/** Leans the finger sideways at its knuckle by `amount` of its range (-1 to 1). */
export function setFingerSpread(finger, amount) {
  const joint = finger.knuckle;
  readJoint(joint, _reading);
  writeJoint(joint, _reading.flex, THREE.MathUtils.clamp(amount, -1, 1) * joint.spreadLimit, _reading.leftover);
  finger.bones[0].updateWorldMatrix(false, true);
}

/** Spreads the fingers of one hand apart (positive) or together (negative). */
export function setHandSpread(fingers, amount) {
  for (const finger of fingers) {
    if (!finger.thumb) setFingerSpread(finger, amount * finger.knuckle.spreadGain);
  }
}

/** How far apart the fingers of one hand are spread: -1 to 1. */
export function handSpread(fingers) {
  let sum = 0;
  let weight = 0;
  for (const finger of fingers) {
    if (finger.thumb) continue;
    const gain = finger.knuckle.spreadGain;
    sum += fingerSpread(finger) * gain;
    weight += gain * gain;
  }
  return weight > 1e-6 ? THREE.MathUtils.clamp(sum / weight, -1, 1) : 0;
}

/** Puts a whole hand into one of HAND_SHAPES. */
export function shapeHand(fingers, shape) {
  for (const finger of fingers) {
    const curl = shape.curl[Math.min(finger.digit, shape.curl.length - 1)] ?? 0;
    const spread = finger.thumb
      ? shape.thumbSpread * finger.knuckle.spreadGain
      : shape.spread * finger.knuckle.spreadGain;
    setFingerCurl(finger, curl, { clean: true, spread });
  }
}

export function fingerTip(finger, out) {
  return out.copy(finger.tipLocal).applyMatrix4(finger.tipBone.matrixWorld);
}

/* ------------------------------------------------------------------ */
/* Dragging a fingertip                                                */
/* ------------------------------------------------------------------ */

/** Remembers the finger as it is when grabbed. */
export function grabFinger(finger) {
  const joints = finger.joints.map((joint) => {
    const reading = readJoint(joint, newReading());
    return {
      ...reading,
      // A joint the animation already holds outside its range may stay there.
      low: Math.min(joint.min, reading.flex),
      high: Math.max(joint.max, reading.flex),
    };
  });
  const knuckle = joints[finger.joints.indexOf(finger.knuckle)];
  const limit = finger.knuckle.spreadLimit;
  return {
    joints,
    curl: fingerCurl(finger),
    spreadLow: Math.min(-limit, knuckle.spread),
    spreadHigh: Math.max(limit, knuckle.spread),
  };
}

function poseFromGrab(finger, grab, curl, lean) {
  finger.joints.forEach((joint, index) => {
    const start = grab.joints[index];
    const flex = THREE.MathUtils.clamp(
      start.flex + flexAt(joint, curl) - flexAt(joint, grab.curl),
      start.low,
      start.high,
    );
    const spread = joint === finger.knuckle
      ? THREE.MathUtils.clamp(start.spread + lean, grab.spreadLow, grab.spreadHigh)
      : start.spread;
    writeJoint(joint, flex, spread, start.leftover);
  });
  finger.bones[0].updateWorldMatrix(false, true);
}

/**
 * Curls and leans the finger so its tip comes as close as it can to where the
 * pointer is. `target` is a point under the pointer; with `eye` (the camera's
 * position) the tip is matched on screen, to the line of sight through that
 * point, which is what "under the pointer" means to the person dragging.
 */
export function dragFinger(finger, grab, target, eye = null) {
  const sight = eye ? _w.subVectors(target, eye).normalize() : null;
  const error = (curl, lean) => {
    poseFromGrab(finger, grab, curl, lean);
    fingerTip(finger, _tip);
    let miss;
    if (sight) {
      // Measured as an angle from the eye: a tip that swings towards the
      // camera must not count as closer just because it is nearer.
      _tip.sub(eye);
      const depth = Math.max(_tip.dot(sight), 1e-6);
      miss = _tip.addScaledVector(sight, -depth).lengthSq() / (depth * depth);
    } else {
      miss = _tip.sub(target).lengthSq();
    }
    // Between two equally good answers, folding in beats bending back.
    return miss * (1 + 0.5 * Math.max(0, -curl));
  };

  // Folding and bending back can both shorten a finger on screen, so look
  // along the whole range first and refine from the best place found.
  let curl = grab.curl;
  let lean = 0;
  let best = error(curl, lean);
  for (let step = -4; step <= 4; step++) {
    const value = error(step / 4, 0);
    if (value < best - 1e-12) {
      best = value;
      curl = step / 4;
    }
  }

  let curlStep = 0.125;
  let leanStep = 8 * DEG;
  for (let i = 0; i < 48 && curlStep > 0.002; i++) {
    let improved = false;
    for (const [dc, dl] of [[curlStep, 0], [-curlStep, 0], [0, leanStep], [0, -leanStep]]) {
      const nextCurl = THREE.MathUtils.clamp(curl + dc, -1, 1);
      const nextLean = lean + dl;
      const value = error(nextCurl, nextLean);
      if (value < best - 1e-12) {
        best = value;
        curl = nextCurl;
        lean = nextLean;
        improved = true;
      }
    }
    if (!improved) {
      curlStep *= 0.5;
      leanStep *= 0.5;
    }
  }
  poseFromGrab(finger, grab, curl, lean);
}
