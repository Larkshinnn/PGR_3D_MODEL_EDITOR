// Checks on the generated limb geometry (body patches). Pure node:
//   npm run test:limbs
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildLegRings, buildTubeRings, loftRings } from '../src/editor/limbGeometry.js';

const forward = new THREE.Vector3(0, 0, 1);
const up = new THREE.Vector3(0, 1, 0);

/** A standing leg; `heel` raises the ankle the way a high-heeled rig does. */
function leg({ heel = 0, toe = true, startAt = -0.08 } = {}) {
  const knee = new THREE.Vector3(0.07, 0.5, 0);
  const ankle = new THREE.Vector3(0.07, 0.09 + heel, 0.01);
  const ball = new THREE.Vector3(0.07, 0.02, 0.13 - heel * 0.4);
  return buildLegRings({
    knee,
    ankle,
    toe: toe ? ball : null,
    forward,
    up,
    startAt,
    joints: { calf: 0, foot: 1, thigh: 2, toe: toe ? 3 : -1 },
  });
}

/** Share of vertices whose normal points away from the limb's centre line. */
function outwardShare(shape, geometry) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  let outward = 0;
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    n.fromBufferAttribute(normal, i);
    let nearest = shape.rings[0].center;
    for (const ring of shape.rings) if (ring.center.distanceTo(p) < nearest.distanceTo(p)) nearest = ring.center;
    if (n.dot(p.clone().sub(nearest)) > 0) outward++;
  }
  return outward / position.count;
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

for (const [label, options] of [['flat foot', {}], ['high heel', { heel: 0.07 }], ['no toe joint', { toe: false }]]) {
  test(`leg (${label}): closed, outward-facing surface with valid skinning`, () => {
    const shape = leg(options);
    const geometry = loftRings(shape, { segments: 16 });
    const { position, skinIndex, skinWeight } = geometry.attributes;
    const index = geometry.index;

    assert.ok(position.count > 100);
    for (let i = 0; i < index.count; i++) assert.ok(index.getX(i) < position.count, 'index out of range');
    for (let i = 0; i < position.count; i++) {
      let total = 0;
      for (let k = 0; k < 4; k++) {
        total += skinWeight.getComponent(i, k);
        assert.ok(skinIndex.getComponent(i, k) <= 3, 'joint index out of range');
        assert.ok(Number.isFinite(position.getComponent(i, Math.min(k, 2))));
      }
      assert.ok(Math.abs(total - 1) < 1e-5, 'skin weights must sum to 1');
    }
    // Inverted faces would light the limb from the inside and flip its outline.
    assert.ok(outwardShare(shape, geometry) > 0.97, 'surface faces inward');

    // Every edge is shared by exactly two triangles: no holes for the outline to leak through.
    const edges = new Map();
    for (let i = 0; i < index.count; i += 3) {
      for (let k = 0; k < 3; k++) {
        const a = index.getX(i + k);
        const b = index.getX(i + ((k + 1) % 3));
        const key = a < b ? `${a}_${b}` : `${b}_${a}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    assert.ok([...edges.values()].every((count) => count === 2), 'mesh is not watertight');
  });
}

test('leg: the foot reaches forward past the ball and stays near the ground', () => {
  const shape = leg();
  const geometry = loftRings(shape);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  assert.ok(box.max.z > 0.17, 'toes should extend beyond the ball joint');
  assert.ok(box.min.y > -0.03 && box.min.y < 0.03, `sole should sit at ground level, got ${box.min.y.toFixed(3)}`);
  assert.ok(box.max.y > 0.52, 'the shin should reach up past the knee');
});

test('leg: startAt begins the shin lower, under whatever still covers it', () => {
  const full = loftRings(leg());
  const partial = loftRings(leg({ startAt: 0.5 }));
  full.computeBoundingBox();
  partial.computeBoundingBox();
  assert.ok(partial.boundingBox.max.y < full.boundingBox.max.y - 0.15);
  assert.ok(Math.abs(partial.boundingBox.min.y - full.boundingBox.min.y) < 1e-6, 'the foot itself is unchanged');
});

test('leg: thickness scales the girth, not the length', () => {
  const thin = loftRings(buildLegRings({ knee: new THREE.Vector3(0, 0.5, 0), ankle: new THREE.Vector3(0, 0.09, 0.01), toe: new THREE.Vector3(0, 0.02, 0.13), forward, up, thickness: 0.8, joints: { calf: 0, foot: 1, thigh: 2, toe: 3 } }));
  const thick = loftRings(buildLegRings({ knee: new THREE.Vector3(0, 0.5, 0), ankle: new THREE.Vector3(0, 0.09, 0.01), toe: new THREE.Vector3(0, 0.02, 0.13), forward, up, thickness: 1.3, joints: { calf: 0, foot: 1, thigh: 2, toe: 3 } }));
  thin.computeBoundingBox();
  thick.computeBoundingBox();
  assert.ok(thick.boundingBox.max.x > thin.boundingBox.max.x * 1.4);
  assert.ok(Math.abs(thick.boundingBox.max.y - thin.boundingBox.max.y) < 0.01);
});

test('tube: a limb segment between two joints, blended into its neighbours', () => {
  const shape = buildTubeRings({
    from: new THREE.Vector3(0.2, 1.3, 0),
    to: new THREE.Vector3(0.45, 1.25, 0),
    forward,
    radiusFrom: 0.035,
    radiusTo: 0.028,
    joints: { bone: 0, parent: 1, child: 2 },
  });
  const geometry = loftRings(shape);
  assert.ok(outwardShare(shape, geometry) > 0.97);
  const { skinIndex, skinWeight } = geometry.attributes;
  // The first ring leans on the parent bone, the last on the child.
  assert.ok(skinIndex.getX(0) === 0 && skinIndex.getY(0) === 1 && skinWeight.getY(0) > 0.5);
  const last = (shape.rings.length - 1) * 16;
  assert.ok(skinIndex.getY(last) === 2 && skinWeight.getY(last) > 0.5);
  geometry.computeBoundingBox();
  assert.ok(geometry.boundingBox.min.x < 0.2 && geometry.boundingBox.max.x > 0.45);
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
