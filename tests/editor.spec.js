// Editor subsystems checks (history, Edit Mode face masking, pose library, project store):
//   npm run test:editor
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHistoryManager } from '../src/editor/history.js';
import {
  ensureFaceMask,
  applyFaceMask,
  getDeletedFaceIndices,
  setDeletedFaceIndices,
  visibleHitToOriginalFace,
  selectLinkedFaces,
  separateSelectedFaces,
  duplicateSceneObject,
  reparentPreservingWorld,
  autoSkinObjectToHost,
} from '../src/editor/meshEdit.js';
import { createPoseRig } from '../src/pose/rig.js';
import { serializePose, applyPoseData, savePoseRecord, listSavedPoses, deletePoseRecord } from '../src/editor/poseLibrary.js';
import { serializeProject, saveAutosaveProject, loadAutosaveProject } from '../src/editor/projectStore.js';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

function bone(name, parent, x, y, z) {
  const object = new THREE.Bone();
  object.name = name;
  object.userData.originalName = name;
  object.position.set(x, y, z);
  parent.add(object);
  return object;
}

function buildTestCharacter() {
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
    bone(`Bip001 ${side} Hand`, forearm, 0.26 * sign, 0, 0.02);
    const thigh = bone(`Bip001 ${side} Thigh`, pelvis, 0.1 * sign, 0, 0);
    const calf = bone(`Bip001 ${side} Calf`, thigh, 0, -0.45, 0.02);
    bone(`Bip001 ${side} Foot`, calf, 0, -0.45, -0.02);
  }
  root.updateMatrixWorld(true);
  return root;
}

test('history manager executes, undoes, redoes, and respects limit', () => {
  let value = 0;
  const history = createHistoryManager({ limit: 3 });
  for (let i = 1; i <= 4; i++) {
    const prev = value;
    const next = i;
    history.execute({
      label: `set ${i}`,
      undo: () => { value = prev; },
      redo: () => { value = next; },
    });
  }
  assert.equal(value, 4);
  assert.equal(history.undoCount, 3);
  assert.equal(history.undo(), true);
  assert.equal(value, 3);
  assert.equal(history.redo(), true);
  assert.equal(value, 4);
});

test('meshEdit: non-destructive face mask delete, undo restore, linked select, and separate', () => {
  // Build two disconnected boxes merged into one mesh
  const b1 = new THREE.BoxGeometry(0.4, 0.4, 0.4);
  const b2 = new THREE.BoxGeometry(0.4, 0.4, 0.4);
  b2.translate(2, 0, 0);

  const pos1 = b1.attributes.position.array;
  const pos2 = b2.attributes.position.array;
  const pos = new Float32Array(pos1.length + pos2.length);
  pos.set(pos1, 0);
  pos.set(pos2, pos1.length);
  const vOffset = b1.attributes.position.count;
  const idx = [...b1.index.array, ...Array.from(b2.index.array).map((v) => v + vOffset)];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);

  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
  const data = ensureFaceMask(mesh);
  const totalTris = data.mask.length;
  assert.equal(totalTris, 24);

  // Select linked faces from face 0 -> should pick only the 12 triangles of box 1
  const linked = selectLinkedFaces(mesh, 0);
  assert.equal(linked.size, 12);

  // Delete face 0 and face 5
  data.mask[0] = 0;
  data.mask[5] = 0;
  const kept = applyFaceMask(mesh);
  assert.equal(kept, 22);
  assert.deepEqual(getDeletedFaceIndices(mesh), [0, 5]);
  assert.equal(visibleHitToOriginalFace(mesh, 0), 1);

  // Separate box 2 faces (12..23) into a new mesh
  const sep = separateSelectedFaces(mesh, new Set(Array.from({ length: 12 }, (_, i) => i + 12)), 'Box2');
  assert.ok(sep && sep.extractedTris.length === 12);
  assert.equal(sep.newMesh.geometry.index.count, 36);
  assert.equal(mesh.geometry.index.count, 30);

  // Restore original faces
  setDeletedFaceIndices(mesh, []);
  assert.equal(mesh.geometry.index.count, 72);
});

test('meshEdit: duplicateSceneObject, reparentPreservingWorld, and autoSkinObjectToHost', () => {
  const root = buildTestCharacter();
  const hand = root.getObjectByName('Bip001 L Hand');
  const prop = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshStandardMaterial());
  prop.position.set(0.5, 1.2, 0.1);
  root.add(prop);

  const dup = duplicateSceneObject(prop, 'Prop Copy');
  assert.equal(dup.userData.kitbashName, 'Prop Copy');
  assert.notEqual(dup.material, prop.material);

  prop.updateMatrixWorld(true);
  const beforeWorld = new THREE.Vector3();
  prop.getWorldPosition(beforeWorld);
  reparentPreservingWorld(prop, hand);
  prop.updateMatrixWorld(true);
  const afterWorld = new THREE.Vector3();
  prop.getWorldPosition(afterWorld);
  assert.ok(beforeWorld.distanceTo(afterWorld) < 1e-5, 'world position preserved after reparent');

  const mainBones = [];
  root.traverse((o) => { if (o.isBone) mainBones.push(o); });
  const skinned = autoSkinObjectToHost(dup, root, mainBones);
  assert.equal(skinned.length, 1);
  assert.equal(skinned[0].isSkinnedMesh, true);
});

test('poseLibrary: serialize, apply round-trip, mirror L<->R, scope filter & DB CRUD', async () => {
  const rootA = buildTestCharacter();
  const rigA = createPoseRig(rootA);
  const drag = rigA.beginDrag('handL');
  rigA.dragTo(drag, drag.start.clone().add(new THREE.Vector3(-0.2, 0.35, 0.15)));
  rigA.endDrag(drag);

  const handLWorld = new THREE.Vector3().setFromMatrixPosition(rigA.bones.arms.L.end.matrixWorld);
  const pose = serializePose({ name: 'Wave L', rig: rigA, model: rootA });
  await savePoseRecord(pose);
  const list = await listSavedPoses();
  assert.ok(list.some((p) => p.name === 'Wave L'));

  // Apply to fresh rig B
  const rootB = buildTestCharacter();
  const rigB = createPoseRig(rootB);
  const res = applyPoseData(pose, { rig: rigB, model: rootB, scope: 'all', mirror: false });
  assert.ok(res.appliedCount > 0);
  assert.equal(res.missingBones.length, 0);
  rootB.updateMatrixWorld(true);
  const handBWorld = new THREE.Vector3().setFromMatrixPosition(rigB.bones.arms.L.end.matrixWorld);
  assert.ok(handLWorld.distanceTo(handBWorld) < 1e-4, 'round-trip pose should match exact position');

  // Mirror onto rig B: now right hand should lift instead of left hand
  const origR = new THREE.Vector3().setFromMatrixPosition(rigA.bones.arms.R.end.matrixWorld);
  applyPoseData(pose, { rig: rigB, model: rootB, scope: 'upper', mirror: true });
  rootB.updateMatrixWorld(true);
  const mirroredR = new THREE.Vector3().setFromMatrixPosition(rigB.bones.arms.R.end.matrixWorld);
  assert.ok(mirroredR.distanceTo(origR) > 0.1, 'mirrored pose should move right hand');

  await deletePoseRecord(pose.id);
});

test('projectStore: serializeProject and autosave round-trip', async () => {
  const root = buildTestCharacter();
  const rig = createPoseRig(root);
  const partMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshBasicMaterial());
  root.add(partMesh);
  const parts = [{ index: 1, object: partMesh, label: 'Cloth', defaultVisible: true, deleted: false, rewriteOnHide: false }];
  const project = serializeProject({
    name: 'Test Project',
    modelBase: 'https://example.com/model/',
    modelMeta: { charName: 'Kurumi', frame: 'R3', code: 'MD01' },
    model: root,
    bindTransforms: new Map([[partMesh, { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3(1, 1, 1) }]]),
    parts,
    activeKitbashItems: [],
    bodyPatcher: null,
    rig,
    morphParts: [],
  });
  assert.equal(project.type, 'kurumi-project');
  assert.equal(project.parts[0].rewriteOnHide, false);
  await saveAutosaveProject(project);
  const loaded = await loadAutosaveProject();
  assert.equal(loaded.name, 'Test Project');
  assert.equal(loaded.parts[0].rewriteOnHide, false);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}\n      ${error.stack || error.message}`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
