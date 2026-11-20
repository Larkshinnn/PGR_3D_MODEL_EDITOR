import * as THREE from 'three';

const _p = new THREE.Vector3();
const _acc = new THREE.Vector3();

/**
 * Where a skinned mesh's vertices sit in the scene while the skeleton is in
 * its bind pose.
 *
 * The raw `position` attribute is in the skin's own bind space (for these
 * models that is a Z-up space), not in scene space, so it can not be compared
 * with bone positions directly. Running the vertex through the skinning sum
 * puts it where it is actually drawn.
 *
 * Call while the skeleton is in its bind pose with world matrices up to date.
 * Returns null for meshes that are not skinned.
 */
export function createBindSampler(mesh) {
  if (!mesh?.isSkinnedMesh || !mesh.skeleton) return null;
  const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
  if (!position || !skinIndex || !skinWeight) return null;

  const { bones, boneInverses } = mesh.skeleton;
  const matrices = bones.map((bone, index) => new THREE.Matrix4()
    .multiplyMatrices(bone.matrixWorld, boneInverses[index])
    .multiply(mesh.bindMatrix));

  return {
    count: position.count,
    bones,
    skinIndex,
    skinWeight,
    /** Scene-space position of vertex `i` in the bind pose. */
    positionAt(i, out) {
      _acc.set(0, 0, 0);
      let total = 0;
      for (let k = 0; k < 4; k++) {
        const weight = skinWeight.getComponent(i, k);
        if (weight <= 0) continue;
        _p.fromBufferAttribute(position, i).applyMatrix4(matrices[skinIndex.getComponent(i, k)]);
        _acc.addScaledVector(_p, weight);
        total += weight;
      }
      if (total <= 0) return out.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      return out.copy(_acc).multiplyScalar(1 / total);
    },
  };
}

/**
 * Maps any skin joint to the main (pose rig) bone it belongs to: the bone
 * itself, or the first main bone above it. Twist and repair bones, fingers
 * and toes therefore count as part of their limb. Joints that the physics
 * drives (hair, skirts) belong to nobody.
 *
 * @param {Iterable<THREE.Object3D>} mainBones
 * @param {Set<THREE.Object3D>} physicsBones
 */
export function createOwnerLookup(mainBones, physicsBones = new Set()) {
  const main = new Set(mainBones);
  const cache = new Map();
  return (joint) => {
    if (cache.has(joint)) return cache.get(joint);
    let owner = null;
    for (let cur = joint; cur; cur = cur.parent) {
      if (physicsBones.has(cur)) break;
      if (main.has(cur)) {
        owner = cur;
        break;
      }
    }
    cache.set(joint, owner);
    return owner;
  };
}

/**
 * The main bone a vertex follows and how strongly (influences that share an
 * owner add up). Writes into `out` = { owner, weight } and returns it.
 */
export function vertexOwner(sampler, owners, i, out) {
  const { skinIndex, skinWeight } = sampler;
  out.owner = null;
  out.weight = 0;
  for (let k = 0; k < 4; k++) {
    const weight = skinWeight.getComponent(i, k);
    if (weight <= 0) continue;
    const owner = owners[skinIndex.getComponent(i, k)];
    if (!owner) continue;
    let total = weight;
    for (let j = k + 1; j < 4; j++) {
      if (owners[skinIndex.getComponent(i, j)] === owner) total += skinWeight.getComponent(i, j);
    }
    if (total > out.weight) {
      out.weight = total;
      out.owner = owner;
    }
  }
  return out;
}
