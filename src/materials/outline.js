import * as THREE from 'three';
import {
  xs,
  Ef,
  ff,
  Zl,
  au,
} from './pgrToon.js';

const SKINNING_PARS_VERT = `
#include <common>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
`;

const SKINNING_BODY_VERT = `
  #include <beginnormal_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
`;

export const OUTLINE_VERTEX_SHADER = `
${SKINNING_PARS_VERT}

uniform float pgrWidth, pgrDistanceScale, pgrZMaxOffset, pgrZOffset;
#ifdef PGR_SMOOTH_NORMAL
  attribute vec3 _pgrsmoothnormal;
#endif
#ifdef PGR_VERTEX_COLOR
  attribute vec4 _pgrcolor;
#endif
varying vec2 vPgrControl;

void main() {
${SKINNING_BODY_VERT}

  vec4 control = vec4(1.0);
  #ifdef PGR_VERTEX_COLOR
    control = _pgrcolor;
  #endif
  vPgrControl = control.gb;

  // Authored smooth normals use tangent space, so the skinned basis carries them.
  vec3 sn = objectNormal;
  #if defined(PGR_SMOOTH_NORMAL) && defined(USE_TANGENT)
    vec3 d = _pgrsmoothnormal * 2.0 - 1.0;
    vec3 bitangent = cross(objectNormal, objectTangent) * tangent.w;
    sn = objectTangent * d.x + bitangent * d.y + objectNormal * d.z;
  #endif

  vec4 p = modelViewMatrix * vec4(transformed, 1.0);
  vec3 push = normalize(p.xyz) * (pgrZMaxOffset * pgrDistanceScale * 0.5);
  float depth = max(-p.z, 0.0);
  float width = sqrt(depth / projectionMatrix[1][1] / pgrDistanceScale)
              * pgrDistanceScale * pgrWidth * 0.018 * control.b;

  // Camera-facing normals would divide by zero otherwise.
  vec3 dir = mat3(modelViewMatrix) * sn;
  dir.z = 0.001;
  dir.xy *= inversesqrt(dot(dir, dir));

  vec4 q = p + vec4(push, 0.0);
  q.xy += dir.xy * width;
  q.z += pgrZOffset;
  gl_Position = projectionMatrix * q;
}
`;

export const OUTLINE_FRAGMENT_SHADER = `
uniform vec3 pgrBand1, pgrBand2, pgrBand3, pgrBand4, pgrBand5, pgrGlobalTint;
uniform float pgrBrightness;
uniform float pgrBloom;
varying vec2 vPgrControl;

void main() {
  if (vPgrControl.y < 0.1) discard;

  vec3 rgb = pgrBand1;
  #ifdef PGR_MULTI_COLOR
    float g = vPgrControl.x;
    // The game adds both bands at shared boundaries.
    vec3 base = mix(pgrBand1, pgrBand2, g);
    vec4 m = vec4(g >= 0.001 && g <= 0.5, g >= 0.5 && g <= 0.7, g >= 0.7 && g <= 0.9, g >= 0.9 && g <= 1.0);
    rgb = base * m.x + pgrBand3 * m.y + pgrBand4 * m.z + pgrBand5 * m.w;
  #endif
  rgb *= pgrBrightness * pgrGlobalTint;

  gl_FragColor = vec4(rgb, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function parseOutlineInputs(extras, lighting) {
  const reader = Ef(extras.shader);
  const multiColor = reader.keyword('_MULTI_OUTLINE_COLOR');
  return {
    vertexColor: multiColor || reader.keyword('_OUTLINE_VERTEX_COLOR'),
    multiColor,
    width: reader.float('_XCharOutlineWidth'),
    distanceScale: reader.float('_XOutlineDitanceScale'),
    zMaxOffset: reader.float('_XOutlineZMaxOffset'),
    zOffset: reader.float('_XOutlineZOffset'),
    brightness: reader.float('_XOutlineBrightness'),
    bloom: reader.float('_OutlineBloom'),
    colors: [
      reader.linearColor('_OutlineColor'),
      reader.linearColor('_OutlineColor2'),
      reader.linearColor('_OutlineColor3'),
      reader.linearColor('_OutlineColor4'),
      reader.linearColor('_OutlineColor5'),
    ],
    globalTint: lighting.outlineColor,
    render: extras.render,
  };
}

export function createOutlineMaterial(inputs, geometry) {
  const defines = {};
  if (geometry.hasAttribute('_pgrsmoothnormal')) defines.PGR_SMOOTH_NORMAL = '';
  if (geometry.hasAttribute('tangent')) defines.USE_TANGENT = '';
  if (inputs.vertexColor && geometry.hasAttribute('_pgrcolor')) defines.PGR_VERTEX_COLOR = '';
  if (inputs.multiColor) defines.PGR_MULTI_COLOR = '';

  const [band1, band2, band3, band4, band5] = inputs.colors.map(ff);
  const material = new THREE.ShaderMaterial({
    name: 'pgr-outline',
    vertexShader: OUTLINE_VERTEX_SHADER,
    fragmentShader: xs(OUTLINE_FRAGMENT_SHADER, 'pgrBloom', '1.0'),
    defines,
    uniforms: {
      pgrWidth: { value: inputs.width },
      pgrDistanceScale: { value: inputs.distanceScale },
      pgrZMaxOffset: { value: inputs.zMaxOffset },
      pgrZOffset: { value: inputs.zOffset },
      pgrBrightness: { value: inputs.brightness },
      pgrBloom: { value: inputs.bloom },
      pgrGlobalTint: { value: ff(inputs.globalTint) },
      pgrBand1: { value: band1 },
      pgrBand2: { value: band2 },
      pgrBand3: { value: band3 },
      pgrBand4: { value: band4 },
      pgrBand5: { value: band5 },
    },
  });
  Zl(material, inputs.render);
  return material;
}

export function shouldSkipOutline(mesh, renderMap, outlineRenderOrder) {
  const render = renderMap.get(mesh);
  if (!render || !render.blend || render.depthWrite) return false;
  return ![...renderMap].some(
    ([otherMesh, otherRender]) =>
      otherMesh !== mesh &&
      otherMesh.geometry === mesh.geometry &&
      otherRender !== null &&
      otherRender.depthWrite &&
      otherRender.renderOrder <= outlineRenderOrder,
  );
}

export function attachOutlines(passes, renderMap, lighting) {
  const outlines = [];
  for (const { mesh, extras } of passes.filter((p) => p.extras.family === 'outline')) {
    const inputs = parseOutlineInputs(extras, lighting);
    const order = inputs.render.renderOrder;
    if (shouldSkipOutline(mesh, renderMap, order)) continue;
    const outlineMesh = au(mesh, createOutlineMaterial(inputs, mesh.geometry), order, 'outline');
    outlineMesh.receiveShadow = false;
    outlines.push(outlineMesh);
  }
  return outlines;
}
