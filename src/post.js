import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { xs, Wo, rd } from './materials/pgrToon.js';

export const DEFAULT_POST_CONFIG = {
  threshold: 0.3,
  scaler: 1,
  combine: [0.35, 0.35, 0.35, 0.5],
  blend: [0.25, 1],
  exposure: 13,
  contrast: 1.8,
};

export const LUT_URL = '/img/modelviewer/beautycooler2.png';
const LUT_WIDTH = 1024;

const FULLSCREEN_VERTEX_SHADER = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

function createFullscreenMaterial(name, fragmentShader, uniforms) {
  return new THREE.ShaderMaterial({
    name,
    vertexShader: FULLSCREEN_VERTEX_SHADER,
    fragmentShader,
    uniforms,
    blending: THREE.NoBlending,
    depthTest: false,
    depthWrite: false,
  });
}

export const PGR_ENCODE_CHUNK = `
vec3 pgrEncode(vec3 c) {
  return 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
}
`;

export const COMPOSITE_FRAGMENT_SHADER = `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform sampler2D tLut;
uniform vec2 pgrBlend;
uniform vec2 pgrCurve;
uniform vec4 pgrLutParams;
uniform float pgrUseLut;
varying vec2 vUv;
${PGR_ENCODE_CHUNK}

vec3 applyLut(vec3 c) {
  vec3 uvw = clamp(c, 0.0, 1.0);
  uvw.z *= pgrLutParams.z;
  float shift = floor(uvw.z);
  uvw.xy = uvw.xy * pgrLutParams.z * pgrLutParams.xy + pgrLutParams.xy * 0.5;
  uvw.x += shift * pgrLutParams.y;
  vec3 low = texture2D(tLut, uvw.xy).rgb;
  vec3 high = texture2D(tLut, uvw.xy + vec2(pgrLutParams.y, 0.0)).rgb;
  return mix(low, high, uvw.z - shift);
}

void main() {
  vec4 scene = texture2D(tScene, vUv);
  vec3 bloom = texture2D(tBloom, vUv).rgb;
  // The resolve averages edge samples with the transparent clear, so color shows up premultiplied.
  float coverage = scene.a;
  // Most of the frame is empty.
  if (coverage <= 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec3 color = scene.rgb / max(coverage, 1e-4);
  vec3 x = pgrBlend.x * pgrEncode(color) + pgrBlend.y * bloom;
  vec3 curved = pow(clamp(1.0 - exp2(-pgrCurve.x * x), 0.0, 1.0), vec3(pgrCurve.y + 0.01));
  vec3 screen = mix(curved, applyLut(curved), pgrUseLut);
  gl_FragColor = vec4(screen * coverage, coverage);
}
`;

function createCompositeMaterial(config) {
  return createFullscreenMaterial('pgr-post-composite', COMPOSITE_FRAGMENT_SHADER, {
    tScene: { value: null },
    tBloom: { value: null },
    tLut: { value: null },
    pgrBlend: { value: new THREE.Vector2(config.blend[0], config.blend[1]) },
    pgrCurve: { value: new THREE.Vector2(config.exposure, config.contrast) },
    pgrLutParams: { value: new THREE.Vector4(1 / LUT_WIDTH, 1 / 32, 31, 1) },
    pgrUseLut: { value: 0 },
  });
}

function setCompositeLut(material, lutTexture) {
  material.uniforms.tLut.value = lutTexture;
  material.uniforms.pgrUseLut.value = lutTexture ? 1 : 0;
}

function loadLutTexture(url) {
  return new THREE.TextureLoader().loadAsync(url).then((tex) => {
    tex.colorSpace = THREE.NoColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.flipY = false;
    tex.needsUpdate = true;
    return tex;
  });
}

const lutCache = Wo(loadLutTexture);

export function loadDefaultLut() {
  return lutCache.get(LUT_URL).catch(() => lutCache.get('/beautycooler2.png'));
}

const EDGE_COLOR_CHUNK = `
vec3 pgrEdgeColor(vec4 c) {
  return c.rgb + 0.5 * (1.0 - c.a);
}
`;

const FXAA_FRAGMENT_SHADER = `
uniform sampler2D tColor;
uniform vec2 pgrTexel;
varying vec2 vUv;
${EDGE_COLOR_CHUNK}

const vec4 CONSOLE = vec4(0.5, 8.0, 0.125, 0.05);
const vec3 LUMA = vec3(0.22, 0.707, 0.071);

float luma(vec4 c) {
  return dot(pgrEdgeColor(c), LUMA);
}

float luma(vec2 uv) {
  return luma(texture2D(tColor, uv));
}

void main() {
  vec4 corners = vec4(-0.5, -0.5, 0.5, 0.5) * pgrTexel.xyxy + vUv.xyxy;
  float nw = luma(corners.xy);
  float sw = luma(corners.xw);
  float ne = luma(corners.zy) + 0.00260416674;
  float se = luma(corners.zw);
  vec4 center = texture2D(tColor, vUv);
  float m = luma(center);

  float maxLuma = max(max(sw, nw), max(se, ne));
  float minLuma = min(min(sw, nw), min(se, ne));
  float range = max(m, maxLuma) - min(m, minLuma);
  if (range < max(maxLuma * CONSOLE.z, CONSOLE.w)) {
    gl_FragColor = center;
    return;
  }

  vec2 dir = normalize(vec2((sw - ne) + (se - nw), (sw - ne) - (se - nw)));
  vec4 a = texture2D(tColor, vUv - dir * pgrTexel * CONSOLE.x);
  vec4 b = texture2D(tColor, vUv + dir * pgrTexel * CONSOLE.x);
  vec2 far = clamp(dir / (min(abs(dir.x), abs(dir.y)) * CONSOLE.y), -2.0, 2.0);
  vec4 c = texture2D(tColor, vUv - far * pgrTexel * 2.0);
  vec4 d = texture2D(tColor, vUv + far * pgrTexel * 2.0);
  vec4 near = (a + b) * 0.25;
  vec4 wide = (c + d) * 0.25 + near;
  float wideLuma = luma(wide);
  gl_FragColor = wideLuma < minLuma || maxLuma < wideLuma ? near * 2.0 : wide;
}
`;

const SMAA_COLOR_READ_REGEX = /texture2D\( colorTex, ([\w.[\]]+) \)\.rgb/g;

function createSmaaPass() {
  const pass = new SMAAPass();
  pass.renderToScreen = true;
  const edgeMat = pass._materialEdges;
  if (!edgeMat.fragmentShader.match(SMAA_COLOR_READ_REGEX)) {
    throw new Error('SMAA edge shader changed: no color reads to rewrite');
  }
  edgeMat.fragmentShader =
    EDGE_COLOR_CHUNK +
    edgeMat.fragmentShader.replace(SMAA_COLOR_READ_REGEX, 'pgrEdgeColor( texture2D( colorTex, $1 ) )');
  edgeMat.needsUpdate = true;
  return pass;
}

function createScreenAntialias() {
  let mode = 'off';
  let fxaa = null;
  let smaa = null;
  const size = new THREE.Vector2(1, 1);

  const ensurePass = () => {
    if (mode === 'smaa' && !smaa) {
      try {
        smaa = createSmaaPass();
        smaa.setSize(size.x, size.y);
      } catch (err) {
        console.warn('SMAA setup failed, using FXAA instead', err);
        mode = 'fxaa';
      }
    }
    if (mode === 'fxaa' && !fxaa) {
      const material = createFullscreenMaterial('pgr-fxaa', FXAA_FRAGMENT_SHADER, {
        tColor: { value: null },
        pgrTexel: { value: new THREE.Vector2() },
      });
      fxaa = { material, quad: new FullScreenQuad(material) };
    }
  };

  return {
    get mode() {
      return mode;
    },
    setMode(next) {
      mode = next;
      ensurePass();
    },
    setSize(w, h) {
      size.set(w, h);
      smaa?.setSize(w, h);
    },
    render(renderer, screenTarget) {
      if (mode === 'fxaa' && fxaa) {
        fxaa.material.uniforms.tColor.value = screenTarget.texture;
        fxaa.material.uniforms.pgrTexel.value.set(1 / screenTarget.width, 1 / screenTarget.height);
        renderer.setRenderTarget(null);
        fxaa.quad.render(renderer);
      } else if (mode === 'smaa' && smaa) {
        smaa.render(renderer, screenTarget, screenTarget, 0, false);
      }
    },
    dispose() {
      fxaa?.material.dispose();
      fxaa?.quad.dispose();
      smaa?.dispose();
    },
  };
}

const BLOOM_SIZES = [256, 128, 64, 32];
const BLOOM_KERNELS = {
  narrow: {
    offsets: [-0.011912, -0.004764, 0.001547, 0.008234, 0.015625],
    weights: [0.008609, 0.308026, 0.607088, 0.075852, 0.000425],
  },
  medium: {
    offsets: [-0.047556, -0.032535, -0.017878, -0.003554, 0.010686, 0.025158, 0.040005, 0.054688],
    weights: [0.000394, 0.015949, 0.163609, 0.439939, 0.31658, 0.060512, 0.002982, 0.000034],
  },
  wide: {
    offsets: [
      -0.143376, -0.112941, -0.082662, -0.052524, -0.02249, 0.007495, 0.037498, 0.067578,
      0.097783, 0.128139, 0.015625,
    ],
    weights: [
      0.000271, 0.003893, 0.029742, 0.12125, 0.264445, 0.30905, 0.193602, 0.064945, 0.011641,
      0.001112, 0.000048,
    ],
  },
};
const BLOOM_KERNEL_ORDER = ['narrow', 'medium', 'wide', 'wide'];

const BOX_FILTER_CHUNK = `
uniform vec2 pgrTexelSize;

vec4 box(sampler2D map) {
  vec2 t = pgrTexelSize;
  vec4 c = texture2D(map, vUv + t);
  c += texture2D(map, vUv + vec2(t.x, -t.y));
  c += texture2D(map, vUv - t);
  c += texture2D(map, vUv + vec2(-t.x, t.y));
  return c * 0.25;
}
`;

const BLOOM_PREFILTER_FRAGMENT = `
uniform sampler2D tDiffuse;
uniform sampler2D tWeight;
uniform vec2 pgrThreshold;
varying vec2 vUv;
${PGR_ENCODE_CHUNK}
${BOX_FILTER_CHUNK}

void main() {
  // Most of the frame has no weight.
  float weight = box(tWeight).r;
  if (weight <= 0.0) discard;
  vec3 c = pgrEncode(box(tDiffuse).rgb);
  c = max((max(c, vec3(0.0)) - pgrThreshold.x) * pgrThreshold.y, vec3(0.0));
  gl_FragColor = vec4(max(c * weight, vec3(0.0)), 1.0);
}
`;

const BLOOM_COPY_FRAGMENT = `
uniform sampler2D tDiffuse;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(tDiffuse, vUv);
}
`;

const BLOOM_DOWNSAMPLE_FRAGMENT = `
uniform sampler2D tDiffuse;
varying vec2 vUv;
${BOX_FILTER_CHUNK}

void main() {
  gl_FragColor = box(tDiffuse);
}
`;

function buildBlurFragment(kernelName) {
  const { offsets, weights } = BLOOM_KERNELS[kernelName];
  return `
uniform sampler2D tDiffuse;
uniform vec2 pgrDirection;
varying vec2 vUv;
void main() {
  vec4 c = vec4(0.0);
${offsets.map((off, idx) => `  c += texture2D(tDiffuse, vUv + pgrDirection * ${off.toFixed(6)}) * ${weights[idx].toFixed(6)};`).join('\n')}
  gl_FragColor = c;
}
`;
}

const BLOOM_COMBINE_FRAGMENT = `
uniform sampler2D tLevel0, tLevel1, tLevel2, tLevel3;
uniform vec4 pgrCoeff;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tLevel0, vUv) * pgrCoeff.x;
  c += texture2D(tLevel1, vUv) * pgrCoeff.y;
  c += texture2D(tLevel2, vUv) * pgrCoeff.z;
  c += texture2D(tLevel3, vUv) * pgrCoeff.w;
  gl_FragColor = c;
}
`;

function createBloomTarget(w, h, type) {
  return new THREE.WebGLRenderTarget(w, h, {
    type,
    colorSpace: THREE.LinearSRGBColorSpace,
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
  });
}

function createBloomMaterials(config) {
  return {
    prefilter: createFullscreenMaterial('pgr-bloom-prefilter', BLOOM_PREFILTER_FRAGMENT, {
      tDiffuse: { value: null },
      tWeight: { value: null },
      pgrTexelSize: { value: new THREE.Vector2() },
      pgrThreshold: { value: new THREE.Vector2(config.threshold, config.scaler) },
    }),
    copy: createFullscreenMaterial('pgr-bloom-copy', BLOOM_COPY_FRAGMENT, {
      tDiffuse: { value: null },
    }),
    downsample: createFullscreenMaterial('pgr-bloom-downsample', BLOOM_DOWNSAMPLE_FRAGMENT, {
      tDiffuse: { value: null },
      pgrTexelSize: { value: new THREE.Vector2() },
    }),
    blurs: BLOOM_KERNEL_ORDER.map((k) =>
      createFullscreenMaterial(`pgr-bloom-blur-${k}`, buildBlurFragment(k), {
        tDiffuse: { value: null },
        pgrDirection: { value: new THREE.Vector2() },
      }),
    ),
    combine: createFullscreenMaterial('pgr-bloom-combine', BLOOM_COMBINE_FRAGMENT, {
      tLevel0: { value: null },
      tLevel1: { value: null },
      tLevel2: { value: null },
      tLevel3: { value: null },
      pgrCoeff: { value: new THREE.Vector4(...config.combine) },
    }),
  };
}

function createBloomPipeline(config, hdr) {
  const type = hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const quad = new FullScreenQuad();
  const { prefilter, copy, downsample, blurs, combine } = createBloomMaterials(config);
  const ping = BLOOM_SIZES.map((s) => createBloomTarget(s, s, type));
  const pong = BLOOM_SIZES.map((s) => createBloomTarget(s, s, type));
  const combined = createBloomTarget(BLOOM_SIZES[0], BLOOM_SIZES[0], type);
  let halfTarget = null;
  let chain = [];

  const drawPass = (renderer, material, inputTex, target) => {
    if (inputTex) material.uniforms.tDiffuse.value = inputTex;
    quad.material = material;
    renderer.setRenderTarget(target);
    quad.render(renderer);
  };

  const drawDownsample = (renderer, srcTarget, dstTarget) => {
    downsample.uniforms.pgrTexelSize.value.set(1 / srcTarget.width, 1 / srcTarget.height);
    drawPass(renderer, downsample, srcTarget.texture, dstTarget);
  };

  const ensureHalfTarget = (w, h) => {
    const hw = Math.max(1, Math.floor(w / 2));
    const hh = Math.max(1, Math.floor(h / 2));
    if (!halfTarget || halfTarget.width !== hw || halfTarget.height !== hh) {
      halfTarget?.dispose();
      halfTarget = createBloomTarget(hw, hh, type);
    }
  };

  const ensureChain = (w, h) => {
    const dims = [];
    while (w > BLOOM_SIZES[0] * 4 || h > BLOOM_SIZES[0] * 4) {
      w = Math.max(1, Math.floor(w / 2));
      h = Math.max(1, Math.floor(h / 2));
      dims.push([w, h]);
    }
    if (
      dims.length !== chain.length ||
      !dims.every(([cw, ch], i) => chain[i].width === cw && chain[i].height === ch)
    ) {
      chain.forEach((t) => t.dispose());
      chain = dims.map(([cw, ch]) => createBloomTarget(cw, ch, type));
    }
  };

  return {
    texture: combined.texture,
    render: (renderer, colorTex, weightTex, w, h) => {
      ensureHalfTarget(w, h);
      prefilter.uniforms.pgrTexelSize.value.set(1 / w, 1 / h);
      prefilter.uniforms.tWeight.value = weightTex;
      renderer.setRenderTarget(halfTarget);
      renderer.clear(true, false, false);
      drawPass(renderer, prefilter, colorTex, halfTarget);

      let current = halfTarget;
      ensureChain(current.width, current.height);
      for (const stepTarget of chain) {
        drawDownsample(renderer, current, stepTarget);
        current = stepTarget;
      }
      for (let i = 0; i < BLOOM_SIZES.length; i++) {
        const dst = ping[i];
        const tmp = pong[i];
        const blurMat = blurs[i];
        const dir = blurMat.uniforms.pgrDirection.value;
        if (i === 0) drawDownsample(renderer, current, dst);
        else drawPass(renderer, copy, current.texture, dst);
        dir.set(1, 0);
        drawPass(renderer, blurMat, dst.texture, tmp);
        dir.set(0, 1);
        drawPass(renderer, blurMat, tmp.texture, dst);
        current = dst;
      }
      ping.forEach((t, i) => {
        combine.uniforms[`tLevel${i}`].value = t.texture;
      });
      drawPass(renderer, combine, null, combined);
    },
    bytes() {
      return [...ping, ...pong, ...chain, combined, halfTarget]
        .filter((t) => t !== null)
        .reduce((sum, t) => sum + rd(t), 0);
    },
    dispose() {
      [...ping, ...pong, ...chain, combined, halfTarget].forEach((t) => t?.dispose());
      [prefilter, copy, downsample, combine, ...blurs].forEach((m) => m.dispose());
      quad.dispose();
    },
  };
}

function supportsHdrRenderTarget(renderer) {
  const gl = renderer.getContext();
  return (
    gl.getExtension('EXT_color_buffer_half_float') !== null ||
    gl.getExtension('EXT_color_buffer_float') !== null
  );
}

function createSceneMrtTarget(renderer, hdr) {
  const target = new THREE.WebGLRenderTarget(1, 1, {
    count: 2,
    type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
    colorSpace: hdr ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace,
    depthBuffer: true,
    stencilBuffer: true,
    resolveDepthBuffer: false,
    resolveStencilBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
  });
  if (renderer.capabilities.reversedDepthBuffer) {
    target.depthTexture = new THREE.DepthTexture(1, 1, THREE.FloatType);
    target.depthTexture.format = THREE.DepthStencilFormat;
  }
  target.textures[0].name = 'pgr-post-color';
  target.textures[1].name = 'pgr-post-weight';
  target.textures[1].format = THREE.RedFormat;
  target.textures[1].colorSpace = THREE.LinearSRGBColorSpace;
  return target;
}

function createScreenTarget() {
  const target = new THREE.WebGLRenderTarget(1, 1, {
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
  });
  target.texture.name = 'pgr-post-screen';
  return target;
}

export function createPgrPostProcessor(renderer, config = DEFAULT_POST_CONFIG) {
  const hdr = supportsHdrRenderTarget(renderer);
  const mrtTarget = createSceneMrtTarget(renderer, hdr);
  const bloom = createBloomPipeline(config, hdr);
  const compositeMat = createCompositeMaterial(config);
  const compositeQuad = new FullScreenQuad(compositeMat);
  const screenTarget = createScreenTarget();
  const aa = createScreenAntialias();
  aa.setMode('smaa');

  return {
    hdr,
    get samples() {
      return mrtTarget.samples;
    },
    setSize: (w, h) => {
      if (w <= 0 || h <= 0) return;
      if (mrtTarget.width !== w || mrtTarget.height !== h) {
        mrtTarget.setSize(w, h);
        screenTarget.setSize(w, h);
        aa.setSize(w, h);
      }
    },
    setSamples: (samples) => {
      const clamped = Math.min(samples, renderer.capabilities.maxSamples);
      if (mrtTarget.samples !== clamped) {
        mrtTarget.samples = clamped;
        mrtTarget.dispose();
      }
    },
    setScreenAntialias(mode) {
      aa.setMode(mode);
      if (mode === 'off') screenTarget.dispose();
    },
    compile: async (scene, camera) => {
      renderer.setRenderTarget(mrtTarget);
      try {
        await renderer.compileAsync(scene, camera);
      } finally {
        renderer.setRenderTarget(null);
      }
    },
    render: (scene, camera) => {
      renderer.setRenderTarget(mrtTarget);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(scene, camera);
      bloom.render(renderer, mrtTarget.textures[0], mrtTarget.textures[1], mrtTarget.width, mrtTarget.height);
      compositeMat.uniforms.tScene.value = mrtTarget.textures[0];
      compositeMat.uniforms.tBloom.value = bloom.texture;
      if (aa.mode === 'off') {
        renderer.setRenderTarget(null);
        compositeQuad.render(renderer);
        return;
      }
      renderer.setRenderTarget(screenTarget);
      compositeQuad.render(renderer);
      aa.render(renderer, screenTarget);
    },
    setLut: (lutTexture) => setCompositeLut(compositeMat, lutTexture),
    bytes: () => rd(mrtTarget) + (aa.mode === 'off' ? 0 : rd(screenTarget)) + bloom.bytes(),
    dispose() {
      mrtTarget.dispose();
      screenTarget.dispose();
      aa.dispose();
      bloom.dispose();
      compositeMat.dispose();
      compositeQuad.dispose();
    },
  };
}

const GRID_FADE_RADIUS = 6;
const GRID_FADE_START = '0.35';
const GRID_MINOR_SPACING = '0.5';
const GRID_MAJOR_SPACING = '2.0';

const GRID_VERTEX_SHADER = `
varying vec3 vPgrWorld;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vPgrWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const GRID_FRAGMENT_SHADER = `
uniform vec3 pgrMinorColor, pgrMajorColor;
uniform float pgrMinorAlpha, pgrMajorAlpha, pgrFadeRadius;
uniform vec2 pgrCenter;
varying vec3 vPgrWorld;

float pgrLine(vec2 at, vec2 width, float spacing) {
  vec2 gap = abs(fract(at / spacing - 0.5) - 0.5) / (width / spacing);
  return 1.0 - min(min(gap.x, gap.y), 1.0);
}

void main() {
  vec2 width = fwidth(vPgrWorld.xz);
  float fade = 1.0 - smoothstep(pgrFadeRadius * ${GRID_FADE_START}, pgrFadeRadius, distance(vPgrWorld.xz, pgrCenter));
  if (fade <= 0.0) {
    discard;
  }

  float minor = pgrLine(vPgrWorld.xz, width, ${GRID_MINOR_SPACING});
  float major = pgrLine(vPgrWorld.xz, width, ${GRID_MAJOR_SPACING});
  float alpha = max(minor * pgrMinorAlpha, major * pgrMajorAlpha) * fade;
  if (alpha <= 0.0) {
    discard;
  }

  gl_FragColor = vec4(mix(pgrMinorColor, pgrMajorColor, major), alpha);
}
`;

export function createPgrGrid() {
  const material = new THREE.ShaderMaterial({
    vertexShader: GRID_VERTEX_SHADER,
    fragmentShader: xs(GRID_FRAGMENT_SHADER, '0.0', '0.0'),
    uniforms: {
      pgrMinorColor: { value: new THREE.Color('#525252') },
      pgrMajorColor: { value: new THREE.Color('#58683c') },
      pgrMinorAlpha: { value: 0.35 },
      pgrMajorAlpha: { value: 0.7 },
      pgrFadeRadius: { value: GRID_FADE_RADIUS },
      pgrCenter: { value: new THREE.Vector2() },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return {
    mesh,
    setCenter(x, y, z) {
      mesh.position.set(x, y, z);
      material.uniforms.pgrCenter.value.set(x, z);
    },
    dispose() {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}

const MAX_SHADOW_MAP_SIZE = 4096;
const MIN_SHADOW_MAP_SIZE = 256;

export function setShadowMapSize(shadowLights, size) {
  shadowLights.body.shadow.mapSize.set(size, size);
  const headSize = Math.max(size / 2, MIN_SHADOW_MAP_SIZE);
  shadowLights.head.shadow.mapSize.set(headSize, headSize);
}

export function createShadowLights(scene) {
  const body = new THREE.DirectionalLight(0xffffff, 0);
  body.castShadow = false;
  const head = new THREE.DirectionalLight(0xffffff, 0);
  head.castShadow = false;
  setShadowMapSize({ body, head }, 2048);
  scene.add(body, body.target, head, head.target);
  return { body, head };
}

const SHADOW_DIST_SCALE = 2;
const SHADOW_NEAR_SCALE = 0.5;
const SHADOW_FAR_SCALE = 3.5;
const SHADOW_NORMAL_BIAS = 0.005;
const HEAD_FRUSTUM_SCALE = 0.25;

export function updateShadowLights(shadowLights, pgrModel, boundsBox) {
  shadowLights.body.castShadow = false;
  shadowLights.head.castShadow = false;
  if (!pgrModel?.light.selfShadow || !boundsBox || boundsBox.isEmpty()) return;

  const { center, radius } = boundsBox.getBoundingSphere(new THREE.Sphere());
  const dir = pgrModel.light.selfShadow;

  shadowLights.body.castShadow = true;
  shadowLights.body.position.copy(center).addScaledVector(dir, -radius * SHADOW_DIST_SCALE);
  shadowLights.body.target.position.copy(center);

  const lightView = new THREE.Matrix4()
    .lookAt(shadowLights.body.position, center, shadowLights.body.up)
    .invert();
  const localBox = new THREE.Box3();
  const corner = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    corner.set(
      i & 1 ? boundsBox.max.x : boundsBox.min.x,
      i & 2 ? boundsBox.max.y : boundsBox.min.y,
      i & 4 ? boundsBox.max.z : boundsBox.min.z,
    );
    localBox.expandByPoint(corner.sub(center).applyMatrix4(lightView));
  }

  const bodyCam = shadowLights.body.shadow.camera;
  bodyCam.left = localBox.min.x;
  bodyCam.right = localBox.max.x;
  bodyCam.bottom = localBox.min.y;
  bodyCam.top = localBox.max.y;
  bodyCam.near = radius * SHADOW_NEAR_SCALE;
  bodyCam.far = radius * SHADOW_FAR_SCALE;
  bodyCam.updateProjectionMatrix();
  shadowLights.body.shadow.normalBias = radius * SHADOW_NORMAL_BIAS;

  const anchor = pgrModel.anchors.head ?? pgrModel.anchors.body;
  if (!anchor) return;

  shadowLights.head.castShadow = true;
  const halfExtent = radius * HEAD_FRUSTUM_SCALE;
  const anchorPos = anchor.getWorldPosition(new THREE.Vector3());
  shadowLights.head.position.copy(anchorPos).addScaledVector(dir, -radius * SHADOW_DIST_SCALE);
  shadowLights.head.target.position.copy(anchorPos);

  const headCam = shadowLights.head.shadow.camera;
  headCam.left = -halfExtent;
  headCam.right = halfExtent;
  headCam.bottom = -halfExtent;
  headCam.top = halfExtent;
  headCam.near = radius * SHADOW_NEAR_SCALE;
  headCam.far = radius * SHADOW_FAR_SCALE;
  headCam.updateProjectionMatrix();
  shadowLights.head.shadow.normalBias = radius * SHADOW_NORMAL_BIAS;
}
