import * as THREE from 'three';
import { createBindSampler, createOwnerLookup, vertexOwner } from './skinnedBind.js';

/**
 * Body collision for hair, skirts and ribbons.
 *
 * The models ship a few hand-placed colliders, but most physics chains do not
 * use them: in the game every clip is authored so hair never crosses the body.
 * A pose made by hand has no such guarantee, so while a pose is applied every
 * chain is tested against capsules fitted to the body.
 *
 * The capsules are measured from the skinned vertices of each main bone, so
 * they follow the character's actual proportions and clothing. A chain is
 * never pushed further than it already sat in the bind pose (`clearance`):
 * hair that rests against a shoulder by design stays there, and switching the
 * collision on does not disturb an untouched character.
 *
 * Must be created while the skeleton is in its bind pose with world matrices
 * up to date.
 */

/** Half the thickness of a hair lock or a fold of cloth around its bone. */
const PAD = 0.012;
/** Kept between a particle's resting place and the capsule it rests near. */
const MARGIN = 0.004;
/**
 * Downward pull per frame (metres at 60 fps) given to chains that have none.
 * The solver only applies the part of it that the chain's root has been
 * turned away from its bind orientation by, so an upright head feels nothing
 * and a tilted one lets its hair hang instead of sticking out sideways.
 */
const POSE_GRAVITY = 0.007;
/**
 * The authored stiffness keeps every lock within a few degrees of its
 * styled shape, which is what makes tilted hair look like a helmet. While a
 * pose is applied the limit is loosened so gravity and the body can bend it.
 */
const POSE_STIFFNESS = 0.6;
const MAX_VERTICES_PER_MESH = 24000;

const LIMB_ROLES = new Set(['upperArm', 'forearm', 'thigh', 'calf', 'neck']);
const BLOB_ROLES = new Set(['head', 'hand', 'foot', 'spine', 'pelvis']);

const _v = new THREE.Vector3();
const _seg = new THREE.Vector3();
const _owner = { owner: null, weight: 0 };
const _quat = new THREE.Quaternion();
const _inverse = new THREE.Matrix4();

function percentile(sorted, fraction) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * fraction)))];
}

function distanceToSegment(point, a, b) {
  _seg.subVectors(b, a);
  const lengthSq = _seg.lengthSq();
  const t = lengthSq > 0 ? THREE.MathUtils.clamp(_v.subVectors(point, a).dot(_seg) / lengthSq, 0, 1) : 0;
  return _v.copy(a).addScaledVector(_seg, t).distanceTo(point);
}

export function createBodyColliders({ rig, meshes, springSystem, physicsBones = new Set() }) {
  if (!rig || !springSystem || springSystem.chains.length === 0) return null;

  const entryOf = new Map(rig.entries.filter((entry) => entry.role !== 'com').map((entry) => [entry.bone, entry]));

  const ownerOf = createOwnerLookup(entryOf.keys(), physicsBones);

  // Bind-pose world positions of the vertices each main bone carries.
  const points = new Map([...entryOf.keys()].map((bone) => [bone, []]));
  for (const mesh of meshes) {
    const sampler = createBindSampler(mesh);
    if (!sampler) continue;
    const owners = sampler.bones.map(ownerOf);
    const step = Math.max(1, Math.ceil(sampler.count / MAX_VERTICES_PER_MESH));
    for (let i = 0; i < sampler.count; i += step) {
      const { owner: best, weight: bestWeight } = vertexOwner(sampler, owners, i, _owner);
      if (!best || bestWeight < 0.5) continue;
      sampler.positionAt(i, _v);
      points.get(best).push(_v.x, _v.y, _v.z, bestWeight);
    }
  }

  const childOf = new Map();
  for (const limb of rig.limbs) {
    childOf.set(limb.upper, limb.mid);
    childOf.set(limb.mid, limb.end);
  }
  if (rig.bones.neck && rig.bones.head) childOf.set(rig.bones.neck, rig.bones.head);

  const colliders = [];
  const addCapsule = (bone, a, b, radius) => {
    colliders.push({
      node: bone,
      row: { kind: 'capsule', bound: 'outside', ends: [a.toArray(), b.toArray()], radius },
      shape: { kind: 'capsule', inside: false, radius: 0, a: new THREE.Vector3(), b: new THREE.Vector3() },
      hits: 0,
      bindA: a.clone().applyMatrix4(bone.matrixWorld),
      bindB: b.clone().applyMatrix4(bone.matrixWorld),
    });
  };

  for (const [bone, entry] of entryOf) {
    const world = points.get(bone);
    const count = world.length / 4;
    _inverse.copy(bone.matrixWorld).invert();
    const local = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      _v.set(world[i * 4], world[i * 4 + 1], world[i * 4 + 2]).applyMatrix4(_inverse);
      local[i * 3] = _v.x;
      local[i * 3 + 1] = _v.y;
      local[i * 3 + 2] = _v.z;
    }

    const child = childOf.get(bone);
    if (LIMB_ROLES.has(entry.role) && child) {
      // A capsule from this joint to the next, as thick as the limb's surface.
      const end = new THREE.Vector3().setFromMatrixPosition(child.matrixWorld).applyMatrix4(_inverse);
      const length = end.length();
      if (length < 1e-4) continue;
      const dir = end.clone().multiplyScalar(1 / length);
      // Cloth that hangs between two limbs is shared between them; only
      // vertices that clearly belong to this one describe its surface.
      const radial = [];
      for (let i = 0; i < count; i++) {
        if (world[i * 4 + 3] < 0.8) continue;
        _v.set(local[i * 3], local[i * 3 + 1], local[i * 3 + 2]);
        const along = _v.dot(dir);
        if (along < -0.1 * length || along > 1.1 * length) continue;
        radial.push(_v.addScaledVector(dir, -along).length());
      }
      radial.sort((x, y) => x - y);
      const measured = radial.length >= 12 ? percentile(radial, 0.6) : length * 0.13;
      const radius = THREE.MathUtils.clamp(measured, length * 0.07, length * 0.4);
      addCapsule(bone, new THREE.Vector3(), end, radius);
    } else if (BLOB_ROLES.has(entry.role) && count >= 24) {
      // A capsule along the widest side of the bone's vertex cloud: a torso
      // is wider than it is deep, so its capsule lies across the body.
      const min = [0, 0, 0];
      const max = [0, 0, 0];
      for (let axis = 0; axis < 3; axis++) {
        const values = new Float32Array(count);
        for (let i = 0; i < count; i++) values[i] = local[i * 3 + axis];
        values.sort();
        min[axis] = percentile(values, 0.08);
        max[axis] = percentile(values, 0.92);
      }
      const half = min.map((value, axis) => (max[axis] - value) / 2);
      const long = half.indexOf(Math.max(...half));
      const radius = (half[(long + 1) % 3] + half[(long + 2) % 3]) / 2;
      if (radius < 1e-4) continue;
      const center = new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
      const offset = new THREE.Vector3().setComponent(long, Math.max(0, half[long] - radius));
      addCapsule(bone, center.clone().sub(offset), center.clone().add(offset), radius);
    }
  }
  if (colliders.length === 0) return null;

  // The solver refreshes every collider in this list before each step.
  springSystem.colliders.push(...colliders);

  /** How close a point sat to each capsule in the bind pose. */
  const clearances = (position) => Float32Array.from(
    colliders,
    (collider) => Math.max(0, distanceToSegment(position, collider.bindA, collider.bindB) - MARGIN),
  );

  // A chain's authored particle radius says how much surface hangs on each
  // bone: a centimetre for a lock of hair, several for a panel of a skirt.
  // Wide panels sag between their bones, so they are held further out.
  const padOf = (chain) => Math.max(PAD, 1.5 * Math.max(...chain.particles.map((particle) => particle.radius)));

  const lists = new Map();
  for (const chain of springSystem.chains) {
    const rest = chain.particles.map((particle) => clearances(particle.bone
      ? _v.clone().setFromMatrixPosition(particle.bone.matrixWorld)
      : particle.local.clone().applyMatrix4(particle.parentBone.matrixWorld)));
    lists.set(chain, colliders.map((collider, index) => ({
      shape: collider.shape,
      pad: padOf(chain),
      clearance: Float32Array.from(rest, (perParticle) => perParticle[index]),
    })));
  }

  // Chains that already have authored gravity keep it.
  const gravity = new Map();
  for (const chain of springSystem.chains) {
    if (chain.gravity.lengthSq() > 0) continue;
    const world = new THREE.Vector3(0, -POSE_GRAVITY, 0);
    gravity.set(chain, {
      world,
      local: world.clone().applyQuaternion(chain.root.getWorldQuaternion(_quat).invert()),
    });
  }
  const stiffness = new Map(springSystem.chains.map((chain) => [chain, chain.particles.map((particle) => particle.stiffness)]));

  const applyToChains = (on) => {
    for (const chain of springSystem.chains) {
      chain.bodyColliders = on ? lists.get(chain) : null;
      const pull = gravity.get(chain);
      if (!pull) continue;
      const authored = stiffness.get(chain);
      chain.particles.forEach((particle, index) => {
        particle.stiffness = authored[index] * (on ? POSE_STIFFNESS : 1);
      });
      if (on) {
        chain.gravity.copy(pull.world);
        chain.localGravity.copy(pull.local);
      } else {
        chain.gravity.set(0, 0, 0);
        chain.localGravity.set(0, 0, 0);
      }
    }
  };

  // Stems: the bones between the body and a physics chain (the waistband
  // rows of a skirt, the base of a ponytail). The physics never moves them,
  // so a raised thigh would pass straight through the top of a skirt. Each
  // stem is turned just far enough to keep the joint at its end outside the
  // body. It is plain geometry with no state, so it can not jitter.
  const stems = [];
  const seen = new Set();
  for (const chain of springSystem.chains) {
    const path = [chain.root];
    let cur = chain.root.parent;
    while (cur && !entryOf.has(cur) && !physicsBones.has(cur)) {
      path.unshift(cur);
      cur = cur.parent;
    }
    if (!cur || !entryOf.has(cur)) continue;
    for (let i = 0; i + 1 < path.length; i++) {
      const key = `${path[i].uuid}>${path[i + 1].uuid}`;
      if (seen.has(key)) continue;
      seen.add(key);
      stems.push({
        bone: path[i],
        tip: path[i + 1],
        depth: i,
        pad: padOf(chain) + Math.max(...chain.particles.map((particle) => particle.radius)),
        clearance: clearances(new THREE.Vector3().setFromMatrixPosition(path[i + 1].matrixWorld)),
        base: new THREE.Quaternion(),
        applied: false,
      });
    }
  }
  stems.sort((a, b) => a.depth - b.depth);

  let enabled = true;
  let active = false;
  const wanted = () => enabled && rig.hasPose();

  const _origin = new THREE.Vector3();
  const _tip = new THREE.Vector3();
  const _moved = new THREE.Vector3();
  const _closest = new THREE.Vector3();
  const _ca = new THREE.Vector3();
  const _cb = new THREE.Vector3();
  const _parent = new THREE.Quaternion();
  const _turn = new THREE.Quaternion();
  const _scale = new THREE.Vector3();

  const layer = {
    apply() {
      if (stems.length === 0 || !wanted()) return;
      for (const collider of colliders) collider.node.updateWorldMatrix(true, false);

      for (const stem of stems) {
        const { bone, tip } = stem;
        bone.updateWorldMatrix(true, true);
        _origin.setFromMatrixPosition(bone.matrixWorld);
        _tip.setFromMatrixPosition(tip.matrixWorld);
        _moved.copy(_tip);
        let pushed = false;

        colliders.forEach((collider, index) => {
          const world = collider.node.matrixWorld;
          const scale = _scale.setFromMatrixColumn(world, 0).length();
          const reach = Math.min((collider.row.radius + stem.pad) * scale, stem.clearance[index] * scale);
          if (reach <= 0) return;
          _ca.fromArray(collider.row.ends[0]).applyMatrix4(world);
          _cb.fromArray(collider.row.ends[1]).applyMatrix4(world);
          _seg.subVectors(_cb, _ca);
          const lengthSq = _seg.lengthSq();
          const t = lengthSq > 0 ? THREE.MathUtils.clamp(_v.subVectors(_moved, _ca).dot(_seg) / lengthSq, 0, 1) : 0;
          _closest.copy(_ca).addScaledVector(_seg, t);
          const distance = _closest.distanceTo(_moved);
          if (distance >= reach || distance < 1e-6) return;
          _moved.sub(_closest).multiplyScalar(reach / distance).add(_closest);
          pushed = true;
        });
        if (!pushed) continue;

        _tip.sub(_origin);
        _moved.sub(_origin);
        if (_tip.lengthSq() < 1e-12 || _moved.lengthSq() < 1e-12) continue;
        _turn.setFromUnitVectors(_tip.normalize(), _moved.normalize());
        stem.base.copy(bone.quaternion);
        stem.applied = true;
        if (bone.parent) {
          bone.parent.getWorldQuaternion(_parent);
          _turn.premultiply(_quat.copy(_parent).invert()).multiply(_parent);
        }
        bone.quaternion.premultiply(_turn).normalize();
      }
    },
    restore() {
      for (let i = stems.length - 1; i >= 0; i--) {
        const stem = stems[i];
        if (!stem.applied) continue;
        stem.bone.quaternion.copy(stem.base);
        stem.applied = false;
      }
    },
  };

  return {
    colliders,
    stems,
    layer,
    get active() {
      return active;
    },
    get enabled() {
      return enabled;
    },
    /** The user's switch. Call rig.refresh() afterwards so the stems follow. */
    set enabled(value) {
      enabled = Boolean(value);
    },
    /** Call once per frame before the physics step. */
    sync() {
      const next = wanted();
      if (next === active) return;
      active = next;
      applyToChains(active);
    },
    dispose() {
      layer.restore();
      applyToChains(false);
      for (const collider of colliders) {
        const index = springSystem.colliders.indexOf(collider);
        if (index >= 0) springSystem.colliders.splice(index, 1);
      }
    },
  };
}
