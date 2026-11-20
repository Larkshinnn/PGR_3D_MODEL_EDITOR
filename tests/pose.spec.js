// Pose rig checks on a synthetic Biped-style skeleton. No browser or network needed:
//   npm run test:pose
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPoseRig } from '../src/pose/rig.js';

const X = new THREE.Vector3(1, 0, 0);

function bone(name, parent, x, y, z) {
  const object = new THREE.Bone();
  object.name = name;
  object.position.set(x, y, z);
  parent.add(object);
  return object;
}

/** Faces +Z, left side at +X. Knees start slightly forward, elbows slightly back. */
function buildSkeleton({ straight = false } = {}) {
  const bendOffset = straight ? 0 : 0.02;
  const root = new THREE.Group();
  const com = bone('Bip001', root, 0, 1, 0);
  const pelvis = bone('Bip001 Pelvis', com, 0, 0, 0);
  const spine = bone('Bip001 Spine', pelvis, 0, 0.1, 0);
  const spine1 = bone('Bip001 Spine1', spine, 0, 0.15, 0);
  const neck = bone('Bip001 Neck', spine1, 0, 0.2, 0);
  bone('Bip001 Head', neck, 0, 0.1, 0);
  const nodes = { root, com, pelvis };
  for (const [side, sign] of [['L', 1], ['R', -1]]) {
    const clavicle = bone(`Bip001 ${side} Clavicle`, spine1, 0.05 * sign, 0.15, 0);
    const upperArm = bone(`Bip001 ${side} UpperArm`, clavicle, 0.12 * sign, 0, 0);
    const forearm = bone(`Bip001 ${side} Forearm`, upperArm, 0.28 * sign, 0, -bendOffset);
    bone(`Bip001 ${side} Hand`, forearm, 0.26 * sign, 0, bendOffset);
    const thigh = bone(`Bip001 ${side} Thigh`, pelvis, 0.1 * sign, 0, 0);
    const calf = bone(`Bip001 ${side} Calf`, thigh, 0, -0.45, bendOffset);
    bone(`Bip001 ${side} Foot`, calf, 0, -0.45, -bendOffset);
    nodes[`thigh${side}`] = thigh;
    nodes[`calf${side}`] = calf;
  }
  // A knee helper that really follows the knee, plus two bones that must not be mistaken for one.
  nodes.knee = bone('ThighrepairBoneL1', nodes.thighL, 0, -0.45, 0.05);
  nodes.loose = bone('Bone014', nodes.thighL, 0.03, -0.2, 0);
  nodes.skirt = bone('SkirtBoneL01', nodes.pelvis, 0.1, -0.1, 0.1);
  root.updateMatrixWorld(true);
  return nodes;
}

const kneePosition = (angle) => new THREE.Vector3(0, -0.45 + 0.03 * Math.sin(angle), 0.05 + 0.06 * Math.sin(angle / 2));
const kneeRotation = (angle) => new THREE.Quaternion().setFromAxisAngle(X, angle / 2);

/** Clips where the knee helper is an exact function of the calf's bend. */
function buildClips(nodes) {
  const makeClip = (name, frames, calfAngle, thighAngle) => {
    const times = Array.from({ length: frames }, (_, i) => i / 30);
    const quats = (fn) => times.flatMap((_, i) => fn(i / (frames - 1)).toArray());
    const noise = (seed) => (t) => new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(seed + t * 31) * 0.6, Math.cos(seed * 3 + t * 17) * 0.6, 0));
    const tracks = [
      new THREE.QuaternionKeyframeTrack(`${nodes.calfL.name}.quaternion`, times, quats((t) => new THREE.Quaternion().setFromAxisAngle(X, calfAngle(t)))),
      new THREE.QuaternionKeyframeTrack(`${nodes.thighL.name}.quaternion`, times, quats((t) => new THREE.Quaternion().setFromAxisAngle(X, thighAngle(t)))),
      new THREE.QuaternionKeyframeTrack(`${nodes.knee.name}.quaternion`, times, quats((t) => kneeRotation(calfAngle(t)))),
      new THREE.VectorKeyframeTrack(`${nodes.knee.name}.position`, times, times.flatMap((_, i) => kneePosition(calfAngle(i / (frames - 1))).toArray())),
      new THREE.QuaternionKeyframeTrack(`${nodes.loose.name}.quaternion`, times, quats(noise(name.length))),
      new THREE.QuaternionKeyframeTrack(`${nodes.skirt.name}.quaternion`, times, quats(noise(7))),
    ];
    return new THREE.AnimationClip(name, -1, tracks);
  };
  return [
    makeClip('Run', 60, (t) => 0.9 - 0.9 * Math.cos(t * Math.PI * 2), (t) => -0.7 * Math.sin(t * Math.PI * 4)),
    makeClip('Standup', 80, (t) => 2.0 * (1 - t), (t) => -1.1 * t * t),
  ];
}

const worldPos = (object) => new THREE.Vector3().setFromMatrixPosition(object.matrixWorld);
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('finds every handle on a Biped rig', () => {
  const rig = createPoseRig(buildSkeleton().root);
  assert.deepEqual(
    rig.handles.map((handle) => handle.id).sort(),
    ['chest', 'elbowL', 'elbowR', 'footL', 'footR', 'handL', 'handR', 'head', 'hips', 'kneeL', 'kneeR', 'shoulderL', 'shoulderR'],
  );
});

test('returns null when there is no recognisable rig', () => {
  const root = new THREE.Group();
  bone('Armature', root, 0, 0, 0);
  assert.equal(createPoseRig(root), null);
});

test('IK reaches the target and never changes a bone length', () => {
  const { root } = buildSkeleton();
  const rig = createPoseRig(root);
  const lengths = () => rig.limbs.flatMap((limb) => [
    worldPos(limb.upper).distanceTo(worldPos(limb.mid)),
    worldPos(limb.mid).distanceTo(worldPos(limb.end)),
  ]);
  const before = lengths();
  for (const id of ['handL', 'handR', 'footL', 'footR']) {
    const { limb } = rig.handle(id);
    const reach = before[rig.limbs.indexOf(limb) * 2] + before[rig.limbs.indexOf(limb) * 2 + 1];
    for (let i = 0; i < 25; i++) {
      root.updateMatrixWorld(true);
      const target = worldPos(limb.upper).addScaledVector(new THREE.Vector3().randomDirection(), reach * (0.4 + 0.55 * Math.random()));
      const drag = rig.beginDrag(id);
      rig.dragTo(drag, target);
      rig.endDrag(drag);
      root.updateMatrixWorld(true);
      assert.ok(worldPos(limb.end).distanceTo(target) < 1e-4, `${id} misses its target`);
    }
  }
  lengths().forEach((length, i) => assert.ok(Math.abs(length - before[i]) < 1e-5, 'a bone changed length'));
});

test('a target out of reach straightens the limb instead of stretching it', () => {
  const { root } = buildSkeleton();
  const rig = createPoseRig(root);
  const { limb } = rig.handle('handL');
  const reach = worldPos(limb.upper).distanceTo(worldPos(limb.mid)) + worldPos(limb.mid).distanceTo(worldPos(limb.end));
  const drag = rig.beginDrag('handL');
  rig.dragTo(drag, worldPos(limb.upper).add(new THREE.Vector3(5, 3, 1)));
  rig.endDrag(drag);
  root.updateMatrixWorld(true);
  assert.ok(Math.abs(worldPos(limb.upper).distanceTo(worldPos(limb.end)) - reach) < 1e-4);
});

for (const straight of [false, true]) test(`knees fold forward and elbows fold back (${straight ? 'from perfectly straight limbs' : 'from a slight bend'})`, () => {
  const { root } = buildSkeleton({ straight });
  const rig = createPoseRig(root);
  const foot = rig.handle('footL');
  let drag = rig.beginDrag('footL');
  rig.dragTo(drag, drag.start.clone().add(new THREE.Vector3(0, 0.4, 0)));
  rig.endDrag(drag);
  root.updateMatrixWorld(true);
  assert.ok(worldPos(foot.limb.mid).z > 0.1, 'knee should move forward');

  const hand = rig.handle('handL');
  drag = rig.beginDrag('handL');
  rig.dragTo(drag, drag.start.clone().add(new THREE.Vector3(-0.3, 0, 0)));
  rig.endDrag(drag);
  root.updateMatrixWorld(true);
  assert.ok(worldPos(hand.limb.mid).z < -0.05, 'elbow should move back');
});

test('pinned feet stay planted when the hips move or a knee swings', () => {
  const { root } = buildSkeleton();
  const rig = createPoseRig(root);
  rig.pins.feet = true;
  const feet = () => rig.limbs.filter((limb) => limb.kind === 'leg').map((limb) => worldPos(limb.end));
  const start = feet();
  let drag = rig.beginDrag('hips');
  rig.dragTo(drag, drag.start.clone().add(new THREE.Vector3(0.06, -0.25, 0.05)));
  rig.endDrag(drag);
  root.updateMatrixWorld(true);
  feet().forEach((position, i) => assert.ok(position.distanceTo(start[i]) < 1e-4, 'foot slid during hips drag'));

  drag = rig.beginDrag('kneeL');
  rig.dragTo(drag, drag.start.clone().add(new THREE.Vector3(0.2, 0, 0)));
  rig.endDrag(drag);
  root.updateMatrixWorld(true);
  feet().forEach((position, i) => assert.ok(position.distanceTo(start[i]) < 1e-4, 'foot slid during knee swivel'));
});

test('offsets survive the animation changing underneath, and come off cleanly', () => {
  const { root, thighL } = buildSkeleton();
  const rig = createPoseRig(root);
  const drag = rig.beginDrag('footL');
  rig.dragTo(drag, drag.start.clone().add(new THREE.Vector3(0.1, 0.3, 0.2)));
  rig.endDrag(drag);
  const entry = rig.entries.find((item) => item.bone === thighL);
  const offset = entry.offset.clone();

  // What the mixer does every frame: write a new animated value while detached.
  const animated = new THREE.Quaternion().setFromAxisAngle(X, 0.4);
  for (let i = 0; i < 50; i++) {
    rig.detach();
    thighL.quaternion.copy(animated);
    rig.attach();
  }
  assert.ok(thighL.quaternion.angleTo(animated.clone().multiply(offset)) < 1e-6, 'offset drifted');

  rig.resetAll();
  assert.ok(thighL.quaternion.angleTo(animated) < 1e-6, 'reset did not return the animated value');
  assert.equal(rig.hasPose(), false);
});

test('undo and redo walk through the edits', () => {
  const { root } = buildSkeleton();
  const rig = createPoseRig(root);
  const hand = rig.handle('handL').anchor;
  root.updateMatrixWorld(true);
  const rest = worldPos(hand);
  const drag = rig.beginDrag('handL');
  rig.dragTo(drag, drag.start.clone().add(new THREE.Vector3(-0.2, 0.3, 0.1)));
  rig.endDrag(drag);
  root.updateMatrixWorld(true);
  const posed = worldPos(hand);
  assert.ok(posed.distanceTo(rest) > 0.1);

  assert.equal(rig.undo(), true);
  root.updateMatrixWorld(true);
  assert.ok(worldPos(hand).distanceTo(rest) < 1e-6);
  assert.equal(rig.redo(), true);
  root.updateMatrixWorld(true);
  assert.ok(worldPos(hand).distanceTo(posed) < 1e-6);
});

test('a click that moves nothing leaves no undo step', () => {
  const rig = createPoseRig(buildSkeleton().root);
  rig.endDrag(rig.beginDrag('handL'));
  assert.equal(rig.canUndo(), false);
});

test('joint limits cap how far the spine can be pulled', () => {
  const rig = createPoseRig(buildSkeleton().root);
  const drag = rig.beginDrag('chest');
  rig.dragTo(drag, drag.start.clone().add(new THREE.Vector3(3, -4, 2)));
  rig.endDrag(drag);
  for (const entry of rig.entries.filter((item) => item.role === 'spine')) {
    assert.ok(2 * Math.acos(Math.min(1, entry.offset.w)) <= entry.limit + 1e-6);
  }
});

test('helper bones are matched to their joint from the clips and follow a pose', () => {
  const nodes = buildSkeleton();
  const rig = createPoseRig(nodes.root);
  const clips = buildClips(nodes);
  assert.equal(rig.correctives.hasCandidates(clips), true);

  const summary = rig.correctives.learn(clips);
  assert.deepEqual(summary, { helpers: 1, joints: 1 }, 'only the knee helper should be learned');
  const [group] = rig.correctives.groups;
  assert.equal(group.driver.bone, nodes.calfL);
  assert.equal(group.helpers[0].bone, nodes.knee);

  const restPosition = nodes.knee.position.clone();
  const drag = rig.beginDrag('footL');
  rig.dragTo(drag, drag.start.clone().add(new THREE.Vector3(0, 0.35, 0.1)));
  rig.endDrag(drag);

  const calf = rig.entries.find((item) => item.bone === nodes.calfL);
  const bend = 2 * Math.acos(Math.min(1, calf.offset.w));
  assert.ok(bend > 0.5, 'the knee should be clearly bent');
  assert.ok(nodes.knee.position.distanceTo(kneePosition(bend)) < 0.004, 'helper position does not match the bend');
  assert.ok(nodes.knee.quaternion.angleTo(kneeRotation(bend)) < 0.05, 'helper rotation does not match the bend');

  // Switching the correction off, or resetting the pose, gives the helper back untouched.
  rig.correctives.enabled = false;
  rig.refresh();
  assert.ok(nodes.knee.position.distanceTo(restPosition) < 1e-9);
  rig.correctives.enabled = true;
  rig.refresh();
  rig.resetAll();
  assert.ok(nodes.knee.position.distanceTo(restPosition) < 1e-9);
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
