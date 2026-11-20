// Finger posing checks on a synthetic Biped-style skeleton. No browser or network needed:
//   npm run test:fingers
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPoseRig } from '../src/pose/rig.js';
import { fingerTip, setFingerCurl } from '../src/pose/fingers.js';

function bone(name, parent, x, y, z) {
  const object = new THREE.Bone();
  object.name = name;
  object.position.set(x, y, z);
  parent.add(object);
  return object;
}

/**
 * Faces +Z, left side at +X, arms out sideways with the palms down: fingers
 * run along the arm, the thumb leans forward, so the index is the finger
 * furthest forward and "into the palm" is straight down.
 */
function buildSkeleton({ fingers = true } = {}) {
  const root = new THREE.Group();
  const com = bone('Bip001', root, 0, 1, 0);
  const pelvis = bone('Bip001 Pelvis', com, 0, 0, 0);
  const spine = bone('Bip001 Spine', pelvis, 0, 0.1, 0);
  const spine1 = bone('Bip001 Spine1', spine, 0, 0.15, 0);
  const neck = bone('Bip001 Neck', spine1, 0, 0.2, 0);
  bone('Bip001 Head', neck, 0, 0.1, 0);
  for (const [side, sign] of [['L', 1], ['R', -1]]) {
    const clavicle = bone(`Bip001 ${side} Clavicle`, spine1, 0.05 * sign, 0.15, 0);
    const upperArm = bone(`Bip001 ${side} UpperArm`, clavicle, 0.12 * sign, 0, 0);
    const forearm = bone(`Bip001 ${side} Forearm`, upperArm, 0.28 * sign, 0, -0.02);
    const hand = bone(`Bip001 ${side} Hand`, forearm, 0.26 * sign, 0, 0.02);
    const thigh = bone(`Bip001 ${side} Thigh`, pelvis, 0.1 * sign, 0, 0);
    const calf = bone(`Bip001 ${side} Calf`, thigh, 0, -0.45, 0.02);
    bone(`Bip001 ${side} Foot`, calf, 0, -0.45, -0.02);
    if (!fingers) continue;
    // Thumb: three links, leaning forward out of the hand.
    const thumb = bone(`Bip001 ${side} Finger0`, hand, 0.015 * sign, 0, 0.03);
    const thumb1 = bone(`Bip001 ${side} Finger01`, thumb, 0.025 * sign, 0, 0.02);
    bone(`Bip001 ${side} Finger02`, thumb1, 0.02 * sign, 0, 0.016);
    // Four fingers: a root back in the palm, then three links along the arm.
    [0.018, 0.006, -0.006, -0.018].forEach((z, index) => {
      const digit = index + 1;
      const palm = bone(`Bip001 ${side} Finger${digit}`, hand, 0.02 * sign, 0, z);
      const first = bone(`Bip001 ${side} Finger${digit}1`, palm, 0.05 * sign, 0, 0);
      const second = bone(`Bip001 ${side} Finger${digit}2`, first, 0.032 * sign, 0, 0);
      bone(`Bip001 ${side} Finger${digit}3`, second, 0.02 * sign, 0, 0);
    });
    // Something else hanging off the hand that is not a finger.
    bone(`Bip001 ${side} HandWeaponCase`, hand, 0.04 * sign, -0.02, 0);
  }
  root.updateMatrixWorld(true);
  return root;
}

const worldPos = (object) => new THREE.Vector3().setFromMatrixPosition(object.matrixWorld);
const tipOf = (finger) => fingerTip(finger, new THREE.Vector3());
const lengthsOf = (finger) => finger.bones.slice(1).map((item, index) => worldPos(item).distanceTo(worldPos(finger.bones[index])));
const near = (actual, expected, tolerance, message) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('finds five fingers per hand without adding them to the main joints', () => {
  const rig = createPoseRig(buildSkeleton());
  const plain = createPoseRig(buildSkeleton({ fingers: false }));
  for (const side of ['L', 'R']) {
    const hand = rig.hands[side];
    assert.equal(hand.length, 5);
    assert.deepEqual(hand.map((finger) => finger.id), [0, 1, 2, 3, 4].map((digit) => `finger${side}${digit}`));
    assert.deepEqual(hand.map((finger) => finger.thumb), [true, false, false, false, false]);
    assert.deepEqual(hand.map((finger) => finger.bones.length), [3, 4, 4, 4, 4]);
    // The root of a finger lies back in the palm: its knuckle is the second bone.
    assert.equal(hand[1].knuckle.bone, hand[1].bones[1]);
    assert.equal(hand[0].knuckle.bone, hand[0].bones[0]);
    for (const finger of hand) assert.equal(rig.handle(finger.id).kind, 'finger');
    assert.equal(rig.handle(`hand${side}`).hand, side);
  }
  // Skin ownership, colliders and helper bones all read `entries`.
  assert.equal(rig.entries.length, plain.entries.length);
  assert.ok(rig.entries.every((entry) => !/Finger/.test(entry.bone.name)));
  assert.deepEqual(plain.hands, {});
  assert.ok(plain.handles.every((handle) => handle.kind !== 'finger'));
  assert.equal(plain.handle('handL').hand, null);
});

test('curling folds a finger into the palm on either hand and keeps its length', () => {
  const rig = createPoseRig(buildSkeleton());
  for (const side of ['L', 'R']) {
    for (const finger of rig.hands[side].slice(1)) {
      const before = tipOf(finger);
      const lengths = lengthsOf(finger);
      const knuckle = worldPos(finger.knuckle.bone);
      // Palms face down here: half curled, the tip hangs well below the hand.
      rig.beginFingerEdit();
      rig.setFingerCurl(finger.id, 0.5);
      const half = tipOf(finger);
      assert.ok(half.y < before.y - 0.02, `${finger.id} tip goes down: ${before.y} -> ${half.y}`);
      // Fully folded, it has come round under the knuckle, back towards the wrist.
      rig.setFingerCurl(finger.id, 1);
      rig.endEdit();
      const after = tipOf(finger);
      assert.ok(after.y < knuckle.y, `${finger.id} tip ends under the knuckle`);
      assert.ok(Math.abs(after.x) < Math.abs(before.x) - 0.03, `${finger.id} tip comes back towards the wrist`);
      near(after.z, before.z, 1e-6, `${finger.id} does not drift sideways`);
      lengthsOf(finger).forEach((value, index) => near(value, lengths[index], 1e-9, `${finger.id} segment ${index}`));
      near(rig.fingerCurl(finger.id), 1, 1e-6, `${finger.id} reads back as folded`);
    }
  }
});

test('the thumb folds across the palm, towards the other fingers', () => {
  const rig = createPoseRig(buildSkeleton());
  for (const side of ['L', 'R']) {
    const thumb = rig.hands[side][0];
    const before = tipOf(thumb);
    const lengths = lengthsOf(thumb);
    rig.beginFingerEdit();
    rig.setFingerCurl(thumb.id, 1);
    rig.endEdit();
    const after = tipOf(thumb);
    assert.ok(after.z < before.z - 0.01, `${thumb.id} comes back from the front: ${before.z} -> ${after.z}`);
    assert.ok(after.y < before.y - 0.005, `${thumb.id} dips towards the palm`);
    lengthsOf(thumb).forEach((value, index) => near(value, lengths[index], 1e-9, `${thumb.id} segment ${index}`));
  }
});

test('spreading moves the outer fingers apart and leaves the curl alone', () => {
  const rig = createPoseRig(buildSkeleton());
  for (const side of ['L', 'R']) {
    const [, index, middle, ring, little] = rig.hands[side];
    rig.beginFingerEdit();
    rig.setFingerCurl(ring.id, 0.4);
    rig.endEdit();
    const before = [index, middle, little].map(tipOf);
    rig.beginFingerEdit();
    rig.setHandSpread(side, 1);
    rig.endEdit();
    const after = [index, middle, little].map(tipOf);
    assert.ok(after[0].z > before[0].z + 0.01, `${side} index moves forward, away from the middle finger`);
    assert.ok(after[2].z < before[2].z - 0.01, `${side} little finger moves the other way`);
    assert.ok(Math.abs(after[1].z - before[1].z) < Math.abs(after[0].z - before[0].z) * 0.5, `${side} middle finger moves least`);
    near(rig.handSpread(side), 1, 1e-6, 'spread reads back');
    near(rig.fingerCurl(ring.id), 0.4, 1e-6, 'curl is kept');
    near(rig.fingerCurl(index.id), 0, 1e-6, 'a straight finger stays straight');
  }
});

test('a dragged fingertip lands under the pointer; nothing else moves', () => {
  const rig = createPoseRig(buildSkeleton());
  const finger = rig.hands.L[2];
  // Where the tip is for a 60 % curl, then back to straight.
  setFingerCurl(finger, 0.6);
  const target = tipOf(finger);
  setFingerCurl(finger, 0);
  const eye = new THREE.Vector3(target.x, target.y + 0.1, target.z + 2);
  const others = [...rig.entries.map((entry) => entry.bone), ...rig.hands.L.filter((item) => item !== finger).flatMap((item) => item.bones), ...rig.hands.R.flatMap((item) => item.bones)];
  const before = others.map((item) => item.quaternion.clone());

  const drag = rig.beginDrag(finger.id);
  rig.dragTo(drag, tipOf(finger).lerp(target, 0.5), eye);
  rig.dragTo(drag, target, eye);
  rig.endDrag(drag);

  const sight = target.clone().sub(eye).normalize();
  const miss = tipOf(finger).sub(eye);
  miss.addScaledVector(sight, -miss.dot(sight));
  assert.ok(miss.length() < 5e-4, `tip is ${(miss.length() * 1000).toFixed(3)} mm off the pointer`);
  near(rig.fingerCurl(finger.id), 0.6, 0.02, 'the curl that was asked for');
  others.forEach((item, index) => assert.ok(Math.abs(item.quaternion.dot(before[index])) > 1 - 1e-12, `${item.name} moved`));
  assert.ok(rig.isGroupModified(finger.id));
  assert.ok(!rig.isGroupModified(rig.hands.L[1].id));
  assert.ok(rig.canUndo());
});

test('a finger can not be dragged backwards or sideways out of its range', () => {
  const rig = createPoseRig(buildSkeleton());
  const finger = rig.hands.L[1];
  const start = tipOf(finger);
  const eye = new THREE.Vector3(start.x, start.y, start.z + 2);
  const flexOf = (joint) => {
    const relative = joint.rest.clone().invert().multiply(joint.bone.quaternion);
    return 2 * Math.atan2(relative.x * joint.hinge.x + relative.y * joint.hinge.y + relative.z * joint.hinge.z, relative.w);
  };

  // Far above the back of the hand.
  let drag = rig.beginDrag(finger.id);
  rig.dragTo(drag, start.clone().add(new THREE.Vector3(-0.05, 0.4, 0)), eye);
  rig.endDrag(drag);
  for (const joint of finger.joints) {
    const flex = flexOf(joint);
    assert.ok(flex >= joint.min - 1e-6 && flex <= joint.max + 1e-6, `${joint.bone.name} flex ${flex} outside ${joint.min}..${joint.max}`);
  }
  assert.ok(tipOf(finger).y - start.y < 0.03, 'the finger only arches back a little');

  // Far below and behind the wrist: fully folded, no further.
  drag = rig.beginDrag(finger.id);
  rig.dragTo(drag, start.clone().add(new THREE.Vector3(-0.3, -0.3, 0)), eye);
  rig.endDrag(drag);
  for (const joint of finger.joints) {
    const flex = flexOf(joint);
    assert.ok(flex >= joint.min - 1e-6 && flex <= joint.max + 1e-6, `${joint.bone.name} flex ${flex} outside ${joint.min}..${joint.max}`);
  }

  // Far to the side: the knuckle leans, within its limit.
  rig.resetGroup(finger.id);
  drag = rig.beginDrag(finger.id);
  rig.dragTo(drag, start.clone().add(new THREE.Vector3(0, 0, 0.5)), new THREE.Vector3(start.x, start.y + 2, start.z));
  rig.endDrag(drag);
  const lean = Math.atan2(tipOf(finger).z - worldPos(finger.knuckle.bone).z, tipOf(finger).x - worldPos(finger.knuckle.bone).x);
  assert.ok(Math.abs(lean) > 0.1 && Math.abs(lean) <= finger.knuckle.spreadLimit + 1e-6, `lean ${lean}`);
});

test('hand shapes are one undo step and ride on top of the animation', () => {
  const root = buildSkeleton();
  const rig = createPoseRig(root);
  const curls = () => rig.hands.L.map((finger) => Number(rig.fingerCurl(finger.id).toFixed(4)));

  assert.equal(rig.shapeHand('L', 'point'), true);
  assert.deepEqual(curls(), [0.75, 0, 1, 1, 1]);
  assert.equal(rig.hasPose(), true);
  assert.equal(rig.isGroupModified('fingersL'), true);
  assert.equal(rig.isGroupModified('fingersR'), false);
  assert.equal(rig.isGroupModified('armL'), false);

  rig.undo();
  assert.deepEqual(curls(), [0, 0, 0, 0, 0]);
  assert.equal(rig.hasPose(), false);
  rig.redo();
  assert.deepEqual(curls(), [0.75, 0, 1, 1, 1]);

  // Taking the layer off gives the animation its own values back, exactly.
  const knuckle = rig.hands.L[2].knuckle.bone;
  const posed = knuckle.quaternion.clone();
  rig.detach();
  assert.ok(rig.hands.L.every((finger) => finger.bones.every((item) => item.quaternion.equals(new THREE.Quaternion()))));
  // The animation moves the finger; the pose stays on top of it.
  const animated = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.1);
  knuckle.quaternion.copy(animated);
  rig.attach();
  assert.ok(knuckle.quaternion.angleTo(animated.clone().multiply(posed)) < 1e-9);
  rig.detach();
  assert.ok(knuckle.quaternion.angleTo(animated) < 1e-12);
  knuckle.quaternion.identity();
  rig.attach();

  assert.equal(rig.resetGroup('fingersL'), true);
  assert.deepEqual(curls(), [0, 0, 0, 0, 0]);
  assert.equal(rig.hasPose(), false);
  assert.equal(rig.shapeHand('L', 'nothing'), false);
});

test('posing the arm carries the fingers along unchanged', () => {
  const rig = createPoseRig(buildSkeleton());
  rig.shapeHand('R', 'fist');
  const hand = rig.bones.arms.R.end;
  const local = (finger) => hand.worldToLocal(tipOf(finger));
  const before = rig.hands.R.map(local);
  const drag = rig.beginDrag('handR');
  rig.dragTo(drag, worldPos(hand).add(new THREE.Vector3(0.2, 0.25, 0.2)));
  rig.endDrag(drag);
  rig.hands.R.forEach((finger, index) => assert.ok(local(finger).distanceTo(before[index]) < 1e-9, `${finger.id} kept its shape`));
  assert.deepEqual(rig.hands.R.map((finger) => Number(rig.fingerCurl(finger.id).toFixed(4))), [0.7, 1, 1, 1, 1]);
  // Resetting the arm leaves the fist; resetting everything clears it.
  rig.resetGroup('armR');
  near(rig.fingerCurl('fingerR2'), 1, 1e-6, 'fist survives an arm reset');
  rig.resetAll();
  near(rig.fingerCurl('fingerR2'), 0, 1e-6, 'reset all');
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}\n      ${error.message}`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
