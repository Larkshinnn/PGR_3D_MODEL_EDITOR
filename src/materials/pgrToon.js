import * as THREE from 'three';
import { attachOutlines } from './outline.js';
import {
  setupFaceShadowAxes,
  buildHairFades,
  FACE_EVENT_NAMES,
  createFaceSwapper,
} from './face.js';

const we = THREE.LineBasicMaterial;
const Te = THREE.UniformsUtils;
const Ee = THREE.Euler;
const De = THREE.RepeatWrapping;
const Oe = THREE.OrthographicCamera;
const ke = THREE.ShaderMaterial;
const Ae = THREE.Data3DTexture;
const je = THREE.RGFormat;
const Me = THREE.AmbientLight;
const Ne = THREE.MirroredRepeatWrapping;
const Pe = THREE.DepthStencilFormat;
const Fe = THREE.Raycaster;
const Ie = THREE.NormalAnimationBlendMode;
const Le = THREE.DepthFormat;
const Re = THREE.Ray;
const ze = THREE.NearestMipMapNearestFilter;
const Be = THREE.FloatType;
const Ve = THREE.Points;
const He = THREE.RGBADepthPacking;
const Ue = THREE.IncrementStencilOp;
const We = THREE.Skeleton;
const Ge = THREE.Frustum;
const Ke = THREE.PointsMaterial;
const qe = THREE.Interpolant;
const Je = THREE.TOUCH;
const Ye = THREE.InterleavedBuffer;
const Xe = THREE.Spherical;
const Ze = THREE.RGBAFormat;
const Qe = THREE.SRGBColorSpace;
const $e = THREE.PropertyBinding;
const et = THREE.ExternalTexture;
const nt = THREE.Plane;
const rt = THREE.FileLoader;
const it = THREE.PlaneGeometry;
const at = THREE.DepthTexture;
const ot = THREE.RedFormat;
const st = THREE.NumberKeyframeTrack;
const ct = THREE.Float32BufferAttribute;
const lt = THREE.PointLight;
const ut = THREE.Line;
const dt = THREE.Uint32BufferAttribute;
const ft = THREE.Group;
const pt = THREE.SRGBColorSpace;
const mt = THREE.Quaternion;
const ht = THREE.CubeTexture;
const gt = THREE.UniformsUtils.merge;
const _t = THREE.MeshStandardMaterial;
const vt = THREE.DataTexture;
const yt = THREE.RawShaderMaterial;
const bt = THREE.AmbientLight;
const xt = THREE.NearestMipMapLinearFilter;
const St = THREE.InstancedBufferAttribute;
const Ct = THREE.SkinnedMesh;
const wt = THREE.ImageBitmapLoader;
const Et = THREE.InstancedMesh;
const Dt = THREE.Sphere;
const Ot = THREE.InterpolateLinear;
const kt = THREE.AudioLoader;
const At = THREE.InterpolateDiscrete;
const jt = THREE.Texture;
const Mt = THREE.Layers;
const Nt = THREE.Uint16BufferAttribute;
const Pt = THREE.Color;
const Ft = THREE.AmbientLight;
const It = THREE.MeshBasicMaterial;
const Lt = THREE.AmbientLight;
const Rt = THREE.UnsignedShort4444Type;
const zt = THREE.LinearSRGBColorSpace;
const Bt = THREE.CubeCamera;
const Vt = THREE.AmbientLight;
const Ht = THREE.ArrayCamera;
const H = THREE.Vector2;
const Ut = THREE.LoaderUtils;
const Wt = THREE.BoxGeometry;
const Gt = THREE.VectorKeyframeTrack;
const Kt = THREE.MOUSE;
const qt = THREE.UnsignedByteType;
const Jt = THREE.LineLoop;
const Yt = THREE.BufferAttribute;
const Xt = THREE.WebGLCoordinateSystem;
const Zt = THREE.Material;
const Qt = THREE.ClampToEdgeWrapping;
const $t = THREE.AmbientLight;
const en = THREE.Mesh;
const tn = THREE.UniformsUtils.clone;
const nn = THREE.Matrix4;
const rn = THREE.UnsignedIntType;
const an = THREE.LinearMipMapNearestFilter;
const on = THREE.EventDispatcher;
const sn = THREE.ReplaceStencilOp;
const cn = THREE.PerspectiveCamera;
const ln = THREE.DirectionalLight;
const un = THREE.RedIntegerFormat;
const dn = THREE.Object3D;
const fn = THREE.Bone;
const U = THREE.Vector3;
const pn = THREE.LoopOnce;
const mn = THREE.WebXRController;
const hn = THREE.Matrix3;
const _n = THREE.UnsignedInt248Type;
const vn = THREE.LinearFilter;
const yn = THREE.AnimationClip;
const bn = THREE.UnsignedShort5551Type;
const xn = THREE.LinearTransfer;
const Sn = THREE.BufferGeometry;
const Cn = THREE.WebGLRenderTarget;
const wn = THREE.MathUtils;
const Tn = THREE.InterleavedBufferAttribute;
const En = THREE.SpotLight;
const Dn = THREE.RGBAIntegerFormat;
const kn = THREE.LinearMipMapLinearFilter;
const An = THREE.AnimationMixer;
const jn = THREE.UnsignedShortType;
const Mn = THREE.Loader;
const Pn = THREE.LineSegments;
const Fn = THREE.Box3;
const In = THREE.Vector4;
const Ln = THREE.LoopRepeat;
const Rn = THREE.ColorManagement;
const zn = THREE.AmbientLight;
const Bn = THREE.MeshDepthMaterial;
const Vn = THREE.DataArrayTexture;
const Hn = THREE.RGIntegerFormat;
const Un = THREE.AmbientLight;
const Wn = THREE.NearestFilter;
const Gn = THREE.CubeDepthTexture;
const Kn = THREE.AmbientLight;
const qn = THREE.MeshPhysicalMaterial;
const Jn = THREE.Controls;
const Yn = THREE.AmbientLight;
const Xn = THREE.MeshDistanceMaterial;
const Zn = THREE.HalfFloatType;
const Qn = THREE.Scene;
const $n = THREE.QuaternionKeyframeTrack;

// SpringBone collider helpers (Nn, On, gn)
function Nn(e, t = []) {
  return t.map((row) => {
    const node = row ? e.get(row.node) : undefined;
    return !row || !node
      ? null
      : {
          node,
          row,
          shape: {
            kind: row.kind,
            inside: row.bound === 'inside',
            radius: 0,
            a: new U(),
            b: new U(),
          },
          hits: 0,
        };
  });
}
const _colScale = new U();
function On({ node, row, shape }) {
  node.updateWorldMatrix(true, false);
  if (row.kind === 'plane') {
    shape.a.fromArray(row.center).applyMatrix4(node.matrixWorld);
    shape.b.fromArray(row.normal).transformDirection(node.matrixWorld);
    return;
  }
  shape.radius = row.radius * _colScale.setFromMatrixColumn(node.matrixWorld, 0).length();
  if (row.kind === 'sphere') {
    shape.a.fromArray(row.center);
    shape.b.fromArray(row.center);
  } else {
    shape.a.fromArray(row.ends[0]);
    shape.b.fromArray(row.ends[1]);
  }
  shape.a.applyMatrix4(node.matrixWorld);
  shape.b.applyMatrix4(node.matrixWorld);
}
const _colDiff = new U();
const _colSeg = new U();
const _colClosest = new U();
function _pushSphere(pos, center, radius, inside) {
  _colDiff.subVectors(pos, center);
  const distSq = _colDiff.lengthSq();
  if (inside ? distSq <= radius * radius : distSq <= 0 || distSq >= radius * radius) return false;
  pos.copy(center).addScaledVector(_colDiff, radius / Math.sqrt(distSq));
  return true;
}
function gn(shape, pos, particleRadius) {
  if (shape.kind === 'plane') {
    const d = _colDiff.subVectors(pos, shape.a).dot(shape.b);
    if (shape.inside ? d <= 0 : d >= 0) return false;
    pos.addScaledVector(shape.b, -d);
    return true;
  }
  const r = shape.inside ? shape.radius - particleRadius : shape.radius + particleRadius;
  if (shape.kind === 'sphere') return _pushSphere(pos, shape.a, r, shape.inside);
  _colSeg.subVectors(shape.b, shape.a);
  const lenSq = _colSeg.lengthSq();
  const proj = _colDiff.subVectors(pos, shape.a).dot(_colSeg);
  if (proj <= 0) return _pushSphere(pos, shape.a, r, shape.inside);
  if (proj >= lenSq) return _pushSphere(pos, shape.b, r, shape.inside);
  _colClosest.copy(shape.a).addScaledVector(_colSeg, proj / lenSq);
  return _pushSphere(pos, _colClosest, r, shape.inside);
}

export function Wo(e) {
  const t = new Map();
  return {
    get(n) {
      const r = t.get(n);
      if (r) return r;
      const i = e(n);
      t.set(n, i);
      i.catch(() => {
        if (t.get(n) === i) t.delete(n);
      });
      return i;
    },
    values() {
      return [...t.values()];
    },
    clear() {
      t.clear();
    },
  };
}

export function fs(e) {
  return e instanceof Error ? e.message : String(e);
}

// Lightweight schema validator for GLB material & scene extras
function makeSchema(check, defVal = undefined, opts = {}) {
  const s = {
    ...opts,
    default: (d) => makeSchema(check, d, opts),
    optional: () => makeSchema((v) => (v === undefined ? { ok: true, val: undefined } : s._run(v)), defVal, opts),
    nullable: () => makeSchema((v) => (v === null ? { ok: true, val: null } : s._run(v)), defVal, opts),
    finite: () => s,
    int: () => s,
    nonnegative: () => s,
    positive: () => s,
    min: () => s,
    max: () => s,
    superRefine: () => s,
    _run(v) {
      if (v === undefined && defVal !== undefined) {
        return { ok: true, val: typeof defVal === 'function' ? defVal() : defVal };
      }
      return check(v);
    },
    safeParse(v) {
      const r = s._run(v);
      return r.ok
        ? { success: true, data: r.val }
        : { success: false, error: { message: 'Invalid', issues: [] } };
    },
    parse(v) {
      const r = s.safeParse(v);
      if (!r.success) throw new Error('Schema parse failed');
      return r.data;
    },
  };
  return s;
}
const cl = () => makeSchema((v) => (typeof v === 'string' ? { ok: true, val: v } : { ok: false }));
const ll = () => makeSchema((v) => (typeof v === 'number' && Number.isFinite(v) ? { ok: true, val: v } : { ok: false }));
const ul = () => makeSchema((v) => (typeof v === 'boolean' ? { ok: true, val: v } : { ok: false }));
const dl = () => makeSchema((v) => ({ ok: true, val: v }));
const vl = (lit) => makeSchema((v) => (v === lit ? { ok: true, val: v } : { ok: false }));
const yl = (arr) => makeSchema((v) => (arr.includes(v) ? { ok: true, val: v } : { ok: false }), undefined, { options: arr });
const fl = (item) =>
  makeSchema((v) => {
    if (!Array.isArray(v)) return { ok: false };
    const out = [];
    for (const el of v) {
      const r = item._run(el);
      if (!r.ok) return { ok: false };
      out.push(r.val);
    }
    return { ok: true, val: out };
  });
const gl = (items) =>
  makeSchema((v) => {
    if (!Array.isArray(v) || v.length !== items.length) return { ok: false };
    const out = [];
    for (let i = 0; i < items.length; i++) {
      const r = items[i]._run(v[i]);
      if (!r.ok) return { ok: false };
      out.push(r.val);
    }
    return { ok: true, val: out };
  });
const _l = (kSchema, vSchema) =>
  makeSchema((v) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false };
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      const r = vSchema._run(val);
      if (!r.ok) return { ok: false };
      out[k] = r.val;
    }
    return { ok: true, val: out };
  });
const pl = (shape) =>
  makeSchema((v) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false };
    const out = {};
    for (const [k, propSchema] of Object.entries(shape)) {
      const r = propSchema._run(v[k]);
      if (!r.ok) return { ok: false };
      if (r.val !== undefined) out[k] = r.val;
    }
    return { ok: true, val: out };
  });
const ml = (schemas) =>
  makeSchema((v) => {
    for (const sc of schemas) {
      const r = sc._run(v);
      if (r.ok) return r;
    }
    return { ok: false };
  });
const hl = (disc, schemas) => ml(schemas);
const sl = (fn) => makeSchema((v) => (fn(v) ? { ok: true, val: v } : { ok: false }));

var ps=`
#include <common>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
`,ms=`
  #include <beginnormal_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
`,hs=`
  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
`,gs=ms+hs,_s=`
vec2 pgrGame(vec2 v) {
  return vec2(v.x, 1.0 - v.y);
}

vec4 pgrFetch(sampler2D map, vec2 v) {
  return texture2D(map, pgrGame(v));
}

vec2 pgrRot(vec2 p, vec4 r) {
  return vec2(p.x * r.x + p.y * r.y, p.x * r.z + p.y * r.w);
}

// params x, y: scroll speed of the red and green taps. Z, w: their strengths.
float pgrVertexOffsetAmount(sampler2D map, vec2 uv, vec4 st, vec4 params, float time) {
  vec2 tapR = vec2(uv.x + time * params.x, uv.y) * st.xy + st.zw;
  vec2 tapG = vec2(uv.x + time * params.y, uv.y) * st.xy + st.zw;
  return textureLod(map, pgrGame(tapR), 0.0).r * params.z + textureLod(map, pgrGame(tapG), 0.0).g * params.w;
}

// Two scrolling taps, xy and zw.
vec4 pgrFlowUv(vec2 uv, vec4 st, vec4 speed, float time) {
  return (uv * st.xy + st.zw).xyxy + speed * time;
}

vec2 pgrFlowSample(sampler2D map, vec4 uv, float intensity) {
  return (pgrFetch(map, uv.xy).rg + pgrFetch(map, uv.zw).rg - 1.0) * intensity;
}

// The game's soft threshold. Softness 0 is a hard step.
float pgrSoftStep(float threshold, float soft, float x) {
  float lo = threshold * (1.0 + soft) - soft;
  return soft > 0.0 ? smoothstep(lo, lo + soft, x) : step(lo, x);
}

float pgrRimFalloff(float facing, float range) {
  float x = min(facing, 0.98);
  float k = max(range - abs(x), 0.0);
  return k * k * (2.0 - x - k * k);
}
`,vs=`
#define PGR_DIR_SHADOW(i) getShadow(directionalShadowMap[i], directionalLightShadows[i].shadowMapSize, directionalLightShadows[i].shadowIntensity, directionalLightShadows[i].shadowBias, directionalLightShadows[i].shadowRadius, vDirectionalShadowCoord[i])
`;function ys(e){return`vec4(${e.map(e=>Number.isInteger(e)?e.toFixed(1):String(e)).join(`, `)})`}var bs=`layout(location = 1) out vec4 pgrWeight;
`;function xs(e,t,n){let r=`  pgrWeight = vec4(${t}, 0.0, 0.0, ${n});\n`,i=Ss(e);return bs+e.slice(0,i)+r+e.slice(i)}function Ss(e){let t=e.search(/void\s+main\s*\(\s*(void)?\s*\)\s*\{/);if(t<0)throw Error(`Weight output needs a fragment shader with main()`);let n=e.indexOf(`{`,t),r=0;for(let t=n;t<e.length;t++)if(e[t]===`{`?r++:e[t]===`}`&&r--,r===0){if(/\breturn\b/.test(e.slice(n,t)))throw Error(`Weight output can't follow a return in main()`);return t}throw Error(`Weight output found no closing brace for main()`)}function Cs(e,t,n){let r=`#include <${t}>`;if(!e.includes(r))throw Error(`Shader has no ${r} to replace`);return e.replace(r,n)}

var $=ll().finite(),bl=$.int(),xl=bl.nonnegative(),Sl=gl([$,$,$,$]),Cl=pl({speed:$.default(1),startFlow:$.default(0),extendedRange:$.positive().default(1),useAnimation:ul().default(!0),curve:fl(Sl).default([[0,0,1,1],[1,1,1,1]])});function wl(e){let t=e.emissionFlow;if(t===void 0)return null;let n=Cl.safeParse(t);return n.success?n.data:(console.warn(`Ignoring a malformed emissionFlow block: ${n.error.message}`),null)}var Tl=1e5;function El(e,t){let n=e[0];if(!n)return 0;let r=e[e.length-1];if(t<=n[0])return n[1];if(t>=r[0])return r[1];let i=1;for(;e[i][0]<t;)i++;let[a,o,,s]=e[i-1],[c,l,u]=e[i],d=c-a;if(d<=0)return l;if(Math.abs(s)>=Tl||Math.abs(u)>=Tl)return o;let f=(t-a)/d,p=f*f,m=p*f,h=2*m-3*p+1,g=m-2*p+f,_=-2*m+3*p,v=m-p;return h*o+g*s*d+_*l+v*u*d}function Dl(e,t){let n=e.useAnimation?e.speed/e.extendedRange*t:0,r=(e.startFlow+n)%1;return r<0?r+1:r}function Ol(e){return[1,1/e.extendedRange]}function kl(e,t){return 1-1/e.extendedRange-El(e.curve,Dl(e,t))}function Al(e,t){return[0,kl(e,t)]}function jl(e,t,n){n.set(0,kl(e,t))}var Ml={eye:2350,eyeStencil:2360,hair:2370,transparent:2380},Nl=2,Pl=Math.tan(Math.PI/6),Fl=.75;function Il(e,t){return t*Fl*Pl/Math.tan(e*Math.PI/360)}function Ll(e,t,n){return t<=Il(e,n)}function Rl(e,t){e.stencilWrite=!0,e.stencilFunc=t,e.stencilRef=Nl,e.stencilFuncMask=Nl,e.stencilWriteMask=0}function zl(e){Rl(e,517)}function Bl(e){Rl(e,514)}var Vl=`
vec4 pgrMask = texture2D(map, vMapUv);
if (pgrMask.r < 0.5) discard;
`;function Hl(e){let t=new It({name:`pgr-eye-stencil`,map:e,side:0,colorWrite:!1,depthWrite:!1,stencilWrite:!0,stencilFunc:519,stencilRef:Nl,stencilFuncMask:Nl,stencilWriteMask:Nl,stencilZPass:sn});return e?(t.customProgramCacheKey=()=>`pgr-eye-stencil`,t.onBeforeCompile=e=>{e.fragmentShader=Cs(e.fragmentShader,`map_fragment`,Vl)},t):t}var Ul=new U;function Wl(e,t,n,r){e.flatMap(e=>e.stencils).forEach(e=>{e.visible=!1});for(let i of e){i.target?Ul.setFromMatrixPosition(i.target.matrixWorld):r&&Ul.copy(r);let e=(i.target!==null||r!==null)&&Ll(t,n.distanceTo(Ul),i.fadeDistance);i.copies.forEach(t=>{t.visible=e}),e&&i.stencils.forEach(e=>{e.visible=!0})}}var Gl={zero:200,one:201,srcColor:202,oneMinusSrcColor:203,dstColor:208,oneMinusDstColor:209,srcAlpha:204,oneMinusSrcAlpha:205,dstAlpha:206,oneMinusDstAlpha:207},Kl={...Gl,srcAlphaSaturate:210},ql={never:0,less:2,equal:4,lequal:3,greater:6,notequal:7,gequal:5,always:1};function Jl(e){return e===`none`?2:+(e===`front`)}function Yl(e,t){if(!t){e.blending=1;return}e.blending=5,e.blendSrc=Kl[t.src],e.blendDst=Gl[t.dst],e.blendSrcAlpha=t.dst===`one`?207:201,e.blendDstAlpha=t.dst===`one`?201:Gl[t.dst]}function Xl(e,t){e.depthWrite=t.depthWrite,e.depthTest=!0,e.depthFunc=ql[t.zTest],e.side=Jl(t.cull)}function Zl(e,t){Yl(e,t.blend),Xl(e,t),e.alphaTest=t.alphaTest,e.colorWrite=t.colorMask!==``,e.needsUpdate=!0}function Ql(e){return!e.colorMask.includes(`a`)}function $l(e,t){return Ql(e)?`0.0`:e.blend?t:`1.0`}function eu(e,t){Zl(e,t),!t.blend&&Ql(t)&&Yl(e,{src:`srcAlpha`,dst:`oneMinusSrcAlpha`})}function tu(e){let t=[];return e.traverse(e=>{e instanceof en&&t.push(e)}),t}function nu(e){return[e.material].flat()}function ru(e){return e instanceof en?[e]:e.children.filter(e=>e instanceof en)}var iu=new WeakSet;function au(e,t,n,r){let i=e.clone(!1);return i.morphTargetInfluences=e.morphTargetInfluences,i.material=t,i.renderOrder=n,i.castShadow=!1,i.name=`${e.name} ${r}`,i.position.set(0,0,0),i.quaternion.identity(),i.scale.set(1,1,1),e.add(i),iu.add(i),i}function ou(e){return iu.has(e)}var su=2500;function cu(e,t){let n=new Map;e.traverse(e=>{if(!(e instanceof en)||t.has(e))return;let r=e.renderOrder>su;for(let t of nu(e))n.get(t)===!r&&console.warn(`Material ${t.name} is drawn in both phases`),n.set(t,r),t.transparent=r,t.forceSinglePass=!0})}var lu=0,uu=.001,du=.1,fu=2.2;function pu(e,t){let n=e.projectionShadow,r=n.intensity*n.colorAlpha;return!(r>0)||!(t.groundAngle.value>0)?null:{height:n.height,color:n.color,alpha:r}}function mu(e,t,n,r){let i=new Fn;if(e.isEmpty()||e.max.y<t)return i;let a=new U;for(let o of[e.min.x,e.max.x])for(let s of[Math.max(e.min.y,t),e.max.y]){let c=(s-t)/r;for(let r of[e.min.z,e.max.z])a.set(o-n.x*c,t+uu,r-n.z*c),i.expandByPoint(a)}return i}var hu=`
uniform vec3 pgrShadowDir;
uniform float pgrShadowAngle;
uniform float pgrShadowHeight;
`,gu=e=>`
vec4 pgrWorld = modelMatrix * vec4(transformed, 1.0);
float pgrT = ${e?`(pgrWorld.y - pgrShadowHeight)`:`max(pgrWorld.y - pgrShadowHeight, 0.0)`} / pgrShadowAngle;
pgrWorld.xz -= pgrShadowDir.xz * pgrT;
pgrWorld.y = pgrShadowHeight + ${uu};
${e?`vPgrAbove = pgrT;`:``}
vec4 mvPosition = viewMatrix * pgrWorld;
gl_Position = projectionMatrix * mvPosition;
`,_u=`
uniform vec3 pgrShadowRgb;
uniform float pgrShadowAlpha;
`,vu=`
varying float vPgrAbove;
`,yu=e=>`
${e?`if (vPgrAbove < 0.0) discard;`:``}
gl_FragColor = vec4(pgrShadowRgb, pgrShadowAlpha);
`;function bu(e){let[t,n,r]=e.color.map(t=>(1-e.alpha*(1-t))**(1/fu)),i=Math.min(t,n,r);return{rgb:new U(t-i,n-i,r-i),alpha:1-i}}function xu(e,t,n,r=!0){let i=new It({name:r?`pgr-ground-shadow-clip`:`pgr-ground-shadow`,map:n,alphaTest:n?du:0,side:2,transparent:!0,forceSinglePass:!0,stencilWrite:!0,stencilFunc:514,stencilRef:0,stencilFuncMask:1,stencilWriteMask:1,stencilZPass:Ue});Yl(i,{src:`dstColor`,dst:`oneMinusSrcAlpha`}),i.customProgramCacheKey=()=>i.name;let a=bu(e);return i.onBeforeCompile=n=>{Object.assign(n.uniforms,{pgrShadowDir:t.ground,pgrShadowAngle:t.groundAngle,pgrShadowHeight:{value:e.height},pgrShadowRgb:{value:a.rgb},pgrShadowAlpha:{value:a.alpha}});let i=r?vu:``;n.vertexShader=hu+i+Cs(n.vertexShader,`project_vertex`,gu(r));let o=Cs(n.fragmentShader,`opaque_fragment`,yu(r));n.fragmentShader=_u+i+Cs(o,`colorspace_fragment`,``),n.fragmentShader=xs(n.fragmentShader,`0.0`,`0.0`)},i}var Su=4;function Cu(e){let t=e.geometry,n=t.getAttribute(`position`),r=new U,i=new U,a=(t.morphAttributes.position??[]).map(e=>{let a=0;for(let o=0;o<e.count;o++)r.fromBufferAttribute(e,o),t.morphTargetsRelative||r.sub(i.fromBufferAttribute(n,o)),a=Math.max(a,r.length());return a});if(!(e instanceof Ct))return t.computeBoundingSphere(),{bones:[],radii:[],morphs:a,sphere:t.boundingSphere};let{bones:o,boneInverses:s}=e.skeleton,c=t.getAttribute(`skinIndex`),l=t.getAttribute(`skinWeight`),u=s.map(t=>new nn().multiplyMatrices(t,e.bindMatrix)),d=Array(o.length).fill(-1);for(let e=0;e<n.count;e++)for(let t=0;t<Su;t++){if(l.getComponent(e,t)<=0)continue;let i=c.getComponent(e,t);r.fromBufferAttribute(n,e).applyMatrix4(u[i]),d[i]=Math.max(d[i],r.length())}let f=o.map((e,t)=>t).filter(e=>d[e]>=0);return{bones:f.map(e=>o[e]),radii:f.map(e=>d[e]),morphs:a,sphere:null}}function wu(e){let t=e.elements,n=e=>t[e]*t[e]+t[e+1]*t[e+1]+t[e+2]*t[e+2];return Math.sqrt(Math.max(n(0),n(4),n(8)))}var Tu=new U;function Eu(e,t){let n=0,r=e.morphTargetInfluences??[];for(let e=0;e<t.morphs.length;e++)n+=Math.abs(r[e]??0)*t.morphs[e];if(t.sphere)return Tu.copy(t.sphere.center).applyMatrix4(e.matrixWorld).y-(t.sphere.radius+n)*wu(e.matrixWorld);let i=1/0;for(let e=0;e<t.bones.length;e++){let r=t.bones[e].matrixWorld;i=Math.min(i,r.elements[13]-(t.radii[e]+n)*wu(r))}return i}function Du(e,t){for(let n of e)n.clip===n.clamp||!n.shadow.visible||(n.shadow.material=Eu(n.shadow,n.reach)<t?n.clip:n.clamp)}function Ou(e,t){let n=au(e,t,lu,`shadow`);return n.receiveShadow=!1,n.frustumCulled=!1,n}var ku=[1,1,1],Au={noShadow:ku,oneShadow:ku,twoShadow:ku,rim:ku,shadowIntensity:1},ju={lightYaw:0,lightDir:[0,.49999999999999994,-.8660254037844387],lightColor:ku,lightIntensity:1,ambientColor:ku,charSpecularColor:ku,charSpecularIntensity:1,noShadowBloomAdd:0,outlineColor:ku,cloth:Au,skin:Au,projectionShadow:{color:[0,0,0],colorAlpha:1,intensity:.550000011920929,height:0,lightDir:[-.468448839404176,.6129070373774529,-.6363180402865176]},scene:{lightDir:[.24227028722773344,.8053079003650387,.5410954569539873],lightColor:ku,lightIntensity:1,specularColor:ku,specularIntensity:1,dynamicAmbientColor:ku,dynamicAmbientIntensity:1},modelYaw:175,rimEulerOffset:[331,269,0]};function Mu(e){return[e[0],e[1],-e[2]]}function Nu(e,t){let n=t*Math.PI/180,r=Math.cos(n),i=Math.sin(n);return[e[0]*r+e[2]*i,e[1],-e[0]*i+e[2]*r]}function Pu(e,t){return Mu(Nu(e,-t))}function Fu(e){return Pu(e.lightDir,e.modelYaw)}var Iu=new nn().makeScale(1,1,-1),Lu=new nn,Ru=new Ee,zu=new Ee;function Bu(e,t,n){return Lu.makeRotationFromQuaternion(e).premultiply(Iu).multiply(Iu),Ru.setFromRotationMatrix(Lu,`YXZ`),zu.set(Ru.x+t[0]*Math.PI/180,Ru.y+t[1]*Math.PI/180,Ru.z+t[2]*Math.PI/180,`YXZ`),n.set(0,0,1).applyEuler(zu),n.z=-n.z,n.normalize()}var Vu=5,Hu=89;function Uu(e,t){let n=wn.degToRad(t.pitch),r=wn.degToRad(e.lightYaw+t.yawOffset-e.modelYaw);return new U(Math.sin(r)*Math.cos(n),-Math.sin(n),-Math.cos(r)*Math.cos(n)).normalize()}function Wu(e){return{yaw:wn.radToDeg(Math.atan2(e.x,e.z)),pitch:wn.radToDeg(Math.asin(e.y))}}function Gu(e,t,n,r,i){if(n===0&&r===0){e.copy(t);return}let a=Wu(t),o=wn.degToRad(a.yaw+n),s=wn.degToRad(wn.clamp(a.pitch+r,i,Hu));e.set(Math.cos(s)*Math.sin(o),Math.sin(s),Math.cos(s)*Math.cos(o))}function Ku(e,t){let n=new U(...Fu(e)).normalize(),r=new U(...Pu(e.scene.lightDir,e.modelYaw)).normalize(),i=new U(...Pu(e.projectionShadow.lightDir,e.modelYaw)),a=t?Uu(e,t).negate():null,o=Wu(n),s={key:{value:n.clone()},scene:{value:r.clone()},ground:{value:i.clone()},groundAngle:{value:Math.atan2(i.y,Math.hypot(i.x,i.z))},selfShadow:a?a.clone().negate():null,angles(e,t){return{yaw:wn.euclideanModulo(o.yaw+e+180,360)-180,pitch:wn.clamp(o.pitch+t,-89,Hu)}},rotate(e,t){Gu(s.key.value,n,e,t,-89),Gu(s.scene.value,r,e,t,-89),Gu(s.ground.value,i,e,t,Vu);let o=s.ground.value;s.groundAngle.value=Math.atan2(o.y,Math.hypot(o.x,o.z)),a&&s.selfShadow&&(Gu(s.selfShadow,a,e,t,-89),s.selfShadow.negate())}};return s}function qu(e,t){let n=e.clone();return n.colorSpace=t===`sRGB`?Qe:``,n.needsUpdate=!0,n}function Ju(e){let t=[];for(let n of Object.values(e))n instanceof jt&&t.push(n);if(e instanceof ke)for(let n of Object.values(e.uniforms))n.value instanceof jt&&t.push(n.value);return t}function Yu(e,t=255){let n=new vt(new Uint8Array([e,e,e,t]),1,1,Ze);return n.needsUpdate=!0,n}var Xu=4/3,Zu=6;function Qu(e){if(!e||typeof e!=`object`)return null;let{width:t,height:n}=e;return typeof t!=`number`||typeof n!=`number`?null:[t,n]}function $u(e){let t=4;e.format===1028?t=1:e.format===1030&&(t=2);let n=1;return e.type===1015?n=4:e.type===1016&&(n=2),t*n}function ed(e,t){let n=Qu(e.image[0]);if(!n)return 0;let r=n[0]*n[1]*t*Zu,i=e.mipmaps;if(i?.length)for(let e of i){let n=Qu(e.image[0]);n&&(r+=n[0]*n[1]*t*Zu)}else e.generateMipmaps&&(r*=Xu);return r}function td(e){let t=new Map,n=new Map;for(let r of e){let e=`${r.source.uuid}:${r.colorSpace}`,i=n.get(r.source.uuid)??new Set;if(i.add(r.colorSpace),n.set(r.source.uuid,i),t.has(e))continue;let a=$u(r),o=0;if(r instanceof ht)o=ed(r,a);else{let e=Qu(r.image);e&&(o=e[0]*e[1]*a*(r.generateMipmaps?Xu:1))}t.set(e,o)}let r=0;for(let e of n.values())r+=e.size-1;let i=0;for(let e of t.values())i+=e;return{count:t.size,bytes:i,duplicates:r}}function nd(e,t=[]){let n=new Set(t);for(let t of tu(e))for(let e of nu(t))for(let t of Ju(e))n.add(t);return n}function rd(e){let t=e.width*e.height,n=e.samples>0?e.samples+1:1,r=0;for(let i of e.textures)r+=t*$u(i)*n;let i=e.depthTexture?.type===1015?8:4;return e.depthBuffer&&(r+=t*i*n),r}function id(e,t){return e*t*8}

function lf(e){return e<.04045?e*.0773993808:(e*.9478672986+.0521327014)**2.4}function uf(e){return[lf(e[0]),lf(e[1]),lf(e[2])]}function df(e,t){return e.map(e=>e*t)}function ff(e){return new Pt().setRGB(e[0],e[1],e[2])}var pf=gl([$,$]),mf=gl([$,$,$,$]),hf=pl({index:xl,texCoord:xl,scale:pf,offset:pf}),gf=yl([`zero`,`one`,`srcColor`,`oneMinusSrcColor`,`dstColor`,`oneMinusDstColor`,`srcAlpha`,`oneMinusSrcAlpha`,`dstAlpha`,`oneMinusDstAlpha`]),_f=pl({blend:pl({src:yl([...gf.options,`srcAlphaSaturate`]),dst:gf}).nullable(),colorMask:cl(),depthWrite:ul(),zTest:yl([`never`,`less`,`equal`,`lequal`,`greater`,`notequal`,`gequal`,`always`]),alphaTest:$,cull:yl([`none`,`front`,`back`]),reversedWinding:ul(),renderOrder:$}),vf=pl({base:cl(),keywords:fl(cl()),textures:_l(cl(),hf),floats:_l(cl(),$),colors:_l(cl(),mf),vectors:_l(cl(),mf),cubemap:cl().optional(),emissionFlow:dl().optional()}),yf=[`character`,`effectCharacter`,`underwater`,`outline`,`sparkle`,`bloom`,`effect`,`effectShield`,`scenePbr`,`standardSimple`,`fur`,`shadowVolume`],bf=pl({family:cl().nullable(),render:_f,shader:vf,passes:fl(xl).optional()});function xf(e,t){let n=bf.safeParse(e??{});if(!n.success)return e&&Object.keys(e).length>0&&console.warn(`Material ${t??`(unnamed)`} has malformed extras, drawing it plain`,n.error.issues),null;let{family:r,...i}=n.data,a=yf.includes(r??``);return{...i,family:a?r:null,familyName:r,passes:i.passes??[]}}var Sf=new WeakMap;function Cf(e){return Sf.has(e)||Sf.set(e,xf(e.userData,e.name)),Sf.get(e)}var wf=new Set;function Tf(e,t,n){let r=`${e}:${t}:${n}`;wf.has(r)||(wf.add(r),console.warn(`${e} declares no ${t} ${n}`))}function Ef(e,t=!1){let n=new Set(e.keywords),r=n=>{let r=e.colors[n];return!r&&!t&&Tf(e.base,`color`,n),r??[0,0,0,0]};return{float(n){let r=e.floats[n];return r===void 0&&!t&&Tf(e.base,`float`,n),r??0},color:r,linearColor:e=>uf(r(e)),vector(n){let r=e.vectors[n];return!r&&!t&&Tf(e.base,`vector`,n),r??[0,0,0,0]},keyword:e=>n.has(e),texture:t=>e.textures[t]??null,keywords:e.keywords}}function Df(e){if(!e)return{scale:[1,1],offset:[0,0]};let[t,n]=e.scale,[r,i]=e.offset;return{scale:[t,n],offset:[r,1-n-i]}}function Of(e){let{scale:t,offset:n}=Df(e);return new In(...t,...n)}function kf(e){return e?new In(...e.scale,...e.offset):new In(1,1,0,0)}function Af(e){return new In(...e??[1,1,1,1])}function jf(e,t){let n=Object.fromEntries(t.floats.map(t=>[t,e.float(t)])),r={};for(let n of t.colors)r[n]=[...e.linearColor(n),e.color(n)[3]];for(let n of t.vectors)r[n]=e.vector(n);let i=Object.fromEntries(Object.entries(t.slots).map(([t,n])=>[t,e.texture(n)])),a={};for(let n of e.keywords){let e=t.keywords[n];e&&(a[e]=``)}return{defines:a,bindings:i,floats:n,colors:r}}var Mf=1e-8;function Nf(e){let t=e.attributes.normal,n=e.attributes.tangent;if(!t||!n||n.itemSize!==4)return 0;let r=new U,i=new U,a=new U,o=0;for(let e=0;e<n.count;e++){if(r.fromBufferAttribute(t,e).normalize(),i.fromBufferAttribute(n,e),i.addScaledVector(r,-r.dot(i)),i.lengthSq()>=Mf)continue;let s=Math.abs(r.x),c=Math.abs(r.y),l=Math.abs(r.z);a.set(+(s<=c&&s<=l),+(c<s&&c<=l),+(l<s&&l<c)),i.crossVectors(r,a).normalize(),n.setXYZ(e,i.x,i.y,i.z),o++}return o&&(n.needsUpdate=!0),o}

function Xf(e,t,n){for(let r of t)e.set(r,n)}var Zf=1e-6,Qf=.001;function $f(e,t){let n=30,r=e=>Math.floor(e*n),i=e=>Math.floor(e.time*n+Qf),a=()=>{new Set(e.values()).forEach(e=>e.reset?.())},o=(t=null)=>{new Set(e.values()).forEach(e=>e.enter?e.enter(t):e.reset?.())},s=(t,n,r=!1)=>{for(let i of t){if(!n(i))continue;let t=e.get(i.function);!t||r&&!t.replay||t.apply(i)}};return{async preload(t){let n=t.flatMap(t=>e.get(t.function)?.preload?.(t)??[]);for(let e of await Promise.allSettled(n))e.status===`rejected`&&console.warn(`Clip event preload: ${fs(e.reason)}`)},enter(e,a,c,l){if(n=c,o(l),t===`frames`){let t=r(a);s(e,e=>i(e)<=t);return}s(e,e=>Math.abs(e.time-a)<Zf)},advance(e,n,a,o,c){if(t===`frames`){let t=r(n),o=r(a);s(e,e=>{let n=i(e);return t<n&&n<=o});return}if(!o){s(e,e=>e.time>n&&e.time<=a);return}let l=Math.max(n,a);s(e,e=>e.time>l&&e.time<=c),s(e,e=>e.time<=a)},seek(e,n,a){o(a);let c=r(n);s(e,t===`frames`?e=>i(e)<=c:e=>e.time<=n,!0)},clear:a}}

var ip=gl([$,$,$]),ap=fl(gl([$,$,$,$])),op=pl({name:cl().optional(),damping:$,elasticity:$,stiffness:$,inert:$,weight:$,gravity:ip,force:ip,dampingCurve:ap.optional(),elasticityCurve:ap.optional(),stiffnessCurve:ap.optional(),inertCurve:ap.optional(),freezeAxis:xl.optional()}),sp=pl({node:xl,root:xl,preset:xl,exclusions:fl(xl).optional(),endLength:$.optional(),endOffset:ip.optional(),radius:$.optional(),radiusCurve:ap.optional(),colliders:fl(xl).optional()}),cp=hl(`kind`,[pl({node:xl,kind:vl(`sphere`),bound:yl([`outside`,`inside`]),center:ip,radius:$}),pl({node:xl,kind:vl(`capsule`),bound:yl([`outside`,`inside`]),ends:gl([ip,ip]),radius:$}),pl({node:xl,kind:vl(`plane`),bound:yl([`outside`,`inside`]),center:ip,normal:ip})]),lp=pl({partId:ll().int(),entries:fl(pl({node:xl,hide:ul(),material:xl.optional()}))}),up=pl({node:xl,material:xl,fadeDistance:$,eyes:fl(pl({node:xl,mask:xl.nullable()})),checkNode:xl,set:cl().optional(),additional:pl({node:xl,material:xl}).optional()});function dp(e,t,n){return t===void 0?[]:Array.isArray(t)?t.map((t,r)=>{let i=e.safeParse(t);return i.success?i.data:(console.warn(`${n}[${r}] ignored, malformed`,i.error.issues),null)}):(console.warn(`${n} is not a list, ignoring it`),[])}function fp(e,t,n){return dp(e,t,n).filter(e=>e!==null)}function pp(e,t,n){if(t==null)return null;let r=e.safeParse(t);return r.success?r.data:(console.warn(`${n} ignored, malformed`,r.error.issues),null)}var mp=_l(cl(),dl());function hp(e){let t=mp.safeParse(e??{}).data??{},n=mp.safeParse(t.alternates??{}).data??{},r=pp(mp,t.springBones,`springBones`);return{anchors:pp(pl({head:xl.nullable(),body:xl.nullable()}),t.anchors,`anchors`)??{head:null,body:null},objectTags:fp(pl({name:cl(),nodes:fl(xl)}),t.objectTags,`objectTags`),parts:fp(lp,n.parts,`alternates.parts`),initialPart:pp(ll().int(),n.initial,`alternates.initial`),hairFades:fp(up,n.hairFade,`alternates.hairFade`),springBones:r?{presets:dp(op,r.presets,`springBones.presets`),chains:fp(sp,r.chains,`springBones.chains`),colliders:dp(cp,r.colliders,`springBones.colliders`)}:null,selfShadow:pp(pl({pitch:$,yawOffset:$}),t.selfShadow,`selfShadow`),faces:pp(pl({node:xl,textures:fl(xl)}),t.faces,`faces`)}}var gp=`#`,_p=e=>`${gp}${e}`;function vp(e,t){return t.startsWith(gp)?[Number(t.slice(1))]:e.tags.findLast(e=>e.name===t)?.nodes??[]}function yp(e,t){return t.startsWith(gp)?e.nodes[Number(t.slice(1))]?.name??t:t}function bp(e,t,n=new Set){n.add(t);for(let r of e[t]?.children??[])bp(e,r,n);return n}function xp(e,t){let n=new Set;return t.flatMap(t=>vp(e,t)).forEach(t=>bp(e.nodes,t,n)),n}var Sp=`ModelCase`;function Cp(e){let t=new Set(e.tags.map(e=>e.name));t.delete(Sp);let n=new Map;for(let r of t){let t=[...xp(e,[r])],i=t.filter(t=>e.nodes[t]?.mesh!==void 0);if(!i.length)continue;let a=i.sort((e,t)=>e-t).join(),o=n.get(a);(!o||t.length<o.size)&&n.set(a,{name:r,size:t.length})}let r=new Set([...n.values()].map(e=>e.name));return[...t].filter(e=>r.has(e))}function wp(e,t){let n=t=>[...xp(e,[t])].filter(t=>e.nodes[t]?.mesh!==void 0),r=xp(e,t.map(_p)),i=Cp(e);if(e.nodes.every((e,t)=>e.mesh===void 0||r.has(t)))return{parts:i,hidden:[]};let a=[],o=new Set;for(let e of[...i].sort((e,t)=>n(t).length-n(e).length)){let t=n(e);!t.length||!t.every(e=>r.has(e))||t.every(e=>o.has(e))||(a.push(e),t.forEach(e=>o.add(e)))}let s=[...new Set(t)].map(_p).filter(e=>{let t=n(e);return!t.length||!t.every(e=>o.has(e))}),c=s.filter(e=>n(e).length);return{parts:[...i,...c],hidden:[...a,...s]}}function Tp(e){let t=e.replace(/md\d+$/i,``);return RegExp(`^${t}md(\\d{6})`,`i`)}function Ep(e,t){return e.replace(Tp(t),``)||e}function Dp(e,t,n=[]){let r=Tp(t),i=new Map;return e.nodes.forEach((e,a)=>{let o=_p(a);if(e.mesh===void 0||n.includes(o))return;let s=e.name??`Node ${a}`,c=e.name?.match(r)?.[1]??`Other`;i.set(c,[...i.get(c)??[],{name:o,label:Ep(s,t),title:s}])}),[...i].map(([e,t])=>({label:e,parts:t.sort((e,t)=>e.label.localeCompare(t.label))}))}function Op(e,t,n){let[r]=vp(e,n);return r===void 0?null:t.find(t=>t!==n&&xp(e,[t]).has(r))??null}

var kp=`
uniform samplerCube pgrCubemap;
// Cos/sin of the model's Unity yaw.
uniform vec2 pgrCubemapYaw;

struct PgrPbrSurface {
  float rough;
  float metallic;
  float ao;
};

// The game's PBR mask: R roughness, G metallic, B occlusion. A is the caller's business.
PgrPbrSurface pgrPbrSurface(vec4 mask, float roughScale, float metallicScale, float aoScale) {
  return PgrPbrSurface(mask.r * roughScale, mask.g * metallicScale, aoScale * (mask.b - 1.0) + 1.0);
}

vec3 pgrPbrF0(vec3 albedo, float metallic, vec3 specular) {
  return mix(vec3(0.04), albedo, metallic) * specular;
}

// Karis environment BRDF with the game's coefficients.
vec3 pgrEnvBrdf(vec3 f0, float rough, float NoV) {
  vec4 r = rough * vec4(-1.0, -0.0275, -0.572, 0.022) + vec4(1.0, 0.0425, 1.04, -0.04);
  float a004 = min(r.x * r.x, exp2(-9.28 * NoV)) * r.x + r.y;
  vec2 ab = vec2(-1.04, 1.04) * a004 + r.zw;
  ab.y *= clamp(50.0 * f0.g, 0.0, 1.0);
  return f0 * ab.x + ab.y;
}

// GGX distribution only, no visibility term.
float pgrGgxD(float rough, float NoH) {
  float a2 = max(rough * rough, 0.002);
  a2 *= a2;
  float d = NoH * (NoH * a2 - NoH) + 1.00001;
  return a2 * 0.318309873 / (d * d + 1e-7);
}

// Undo the exporter's Z flip and model yaw before sampling the world cubemap.
// The game stores cubemap intensity in alpha.
vec3 pgrCubemapSample(vec3 N, vec3 V, float rough) {
  // A cube lookup needs no unit vector.
  vec3 reflected = reflect(-V, N) * mat3(viewMatrix);
  reflected.z = -reflected.z;
  reflected.xz = vec2(
    reflected.x * pgrCubemapYaw.x + reflected.z * pgrCubemapYaw.y,
    -reflected.x * pgrCubemapYaw.y + reflected.z * pgrCubemapYaw.x
  );
  // 8 is the game's step count, not this cube's mips. Past the last level the GPU clamps, same as the game.
  float mip = (1.7 - 0.7 * rough) * rough * 8.0;
  vec4 cube = textureCubeLodEXT(pgrCubemap, reflected, mip);
  return cube.rgb * cube.a * 6.0;
}
`;function Ap(e,t,n,r){let{scale:i,offset:a}=Df(t);return{maskTexture:t?.index??null,maskScale:i,maskOffset:a,metallic:e.float(`_Metallic`),roughness:e.float(`_Roughness`),metallicScale:e.float(`_MetallicMapScale`),roughnessScale:e.float(`_RoughnessMapScale`),aoScale:e.float(`_AOScale`),cubemap:n,cubemapColor:e.linearColor(`_CubemapColor`),cubemapIntensity:e.float(`_CubemapIntensity`),cubemapYaw:r}}function jp(e,t){let n=t*Math.PI/180;return{pgrCubemap:{value:e},pgrCubemapYaw:{value:new H(Math.cos(n),Math.sin(n))}}}function Mp(e,t){return e.map((e,n)=>e*t[n])}function Np(e,t){return e.float(t)>.1}function Pp(e){return e.keyword(`_PBR`)?`mask`:e.keyword(`_SIMPLE_PBR`)?`simple`:null}function Fp(e,t,n){let r=Pp(e);return r?{...Ap(e,r===`mask`?e.texture(`_PBRMask`):null,t,n.modelYaw),mode:r,rate:e.float(`_PBRRate`),specularColor:e.linearColor(`_PBRSpecularColor`),specularIntensity:e.float(`_PBRSpecularIntensity`),directLightColor:e.linearColor(`_DirectLightColor`),indirectLightColor:e.linearColor(`_IndirectLightColor`),indirectLightIntensity:e.float(`_IndirectLightIntensity`)}:null}function Ip(e,t){let n=e.keyword(`_MUTLI_CHANEL_SKIN`),r=e.keyword(`_MUTLI_CHANEL_SHADOW_COLOR`);if(!n&&!r)return null;let i=(t,n)=>[t,`${t}1`,`${t}2`,`${t}3`].map(t=>Mp(e.linearColor(t),n));return{skin:n?{colors:[`_SkinColor1`,`_SkinColor2`,`_SkinColor3`,`_SkinColor4`].map(e.linearColor),rates:e.vector(`_MutliSkinRate`),intensities:e.vector(`_MutliSkinIntensity`)}:null,shadow:r?{noShadow:i(`_NoShadowColor`,t.noShadow),oneShadow:i(`_FirstShadowColor`,t.oneShadow),twoShadow:i(`_SecondShadowColor`,t.twoShadow)}:null}}function Lp(e){let t=e.texture(`_MatCapTex`);return!e.keyword(`_USE_MATCAP`)||!t?null:{texture:t.index,yScale:e.float(`_MatCapYScale`),mask:e.float(`_MatcapMask`),shadowStrength:e.float(`_MapCapShadowStrength`),alpha:e.float(`IF_USE_MATCAP_ALPHA`)>0,alphaUseMask:e.float(`_MapCapAlphaUseMask`)>.5}}function Rp(e,t){let n=e.texture(`_EmissionFlowMap`);if(t&&!n)return null;let r=e.keyword(`_MULTI_CHANNEL_EMISSION`)?{colors:[`_EmissionColor1`,`_EmissionColor2`,`_EmissionColor3`,`_EmissionColor4`].map(e.linearColor),intensities:e.vector(`_MultiEmissionIntensity`)}:null,i=e.float(`_EmissionIntensity`);return(r?Math.max(...r.intensities)>0:i>0)?{color:e.linearColor(`_EmissionColor`),intensity:i,flow:t&&n?{texture:n.index,...Df(n)}:null,zones:r}:null}function zp(e){let t=e.texture(`_DetailMap`);return!e.keyword(`_ALBEDO_DETAIL`)||!t?null:{texture:t.index,texCoord:t.texCoord,...Df(t)}}function Bp(e){let t=e.texture(`_FaceMap`);return!e.keyword(`_FACE`)||!t?null:{texture:t.index,texCoord:t.texCoord}}function Vp(e){let t=e.float(`_AlbedoColorIntensity`);return{color:df(e.linearColor(`_AlbedoColor`),t),alpha:e.color(`_AlbedoColor`)[3]*t}}function Hp(e,t){return Np(e,`IF_RIM`)?{color:Mp(e.linearColor(`_RimColor`),t.rim),intensity:e.float(`_RimIntensity`),min:e.float(`_RimMin`),max:e.float(`_RimMax`),threshold:e.float(`_RimThreshold`)}:null}function Up(e,t){let n=df(t.charSpecularColor,t.charSpecularIntensity);return{color:Mp(e.linearColor(`_SpecularColor`),n),intensity:e.float(`_SpecularIntensity`),shininess:e.float(`_SpecularShiness`),smoothFactor:e.float(`_SpecularSmoothFactor`),invert:e.float(`IF_INVERT_SPECULAR`),attenuation:Np(e,`IF_SPEC_ATTENUATION`),attenuationPow:e.float(`_SpecAttenuationPow`),attenuationSmoothness:e.float(`_SpecAttenuationSmoothness`),shadowIntensity:Np(e,`IF_SPECULAR_SHADOW_INTENSITY`)?e.float(`_SpecularShadowIntensity`):null}}function Wp(e,t,n=null){let r=Ef(e.shader,n!==null),i=r.texture(`_MaskTex`),a=Df(i),o=Np(r,`IF_GI_SKIN`)?t.skin:t.cloth,s=Np(r,`IF_SKIN`),c=!n&&r.keyword(`_USE_EMISSION_FLOWING`);return{lightColor:df(t.lightColor,t.lightIntensity),ambientColor:t.ambientColor,globalTint:r.linearColor(`_GlobalTint`),noShadow:Mp(r.linearColor(`_NoShadowColor`),o.noShadow),oneShadow:Mp(r.linearColor(`_FirstShadowColor`),o.oneShadow),twoShadow:Mp(r.linearColor(`_SecondShadowColor`),o.twoShadow),shadowIntensity:o.shadowIntensity,firstShadow:r.float(`_FirstShadow`),secondShadow:r.float(`_SecondShadow`),smoothFactor:r.float(`_SmoothFactor`),smoothShadow:Np(r,`IF_SMOOTH_SHADOW`),mainAlphaForShadowMask:r.float(`IF_MAIN_ALPHA_FOR_SHADOWMASK`),skinRate:s?r.float(`_SkinRate`):0,skinOn:s,skinIntensity:r.float(`_SkinIntensity`),skinColor:r.linearColor(`_SkinColor`),skinRampTexture:r.texture(`_SkinRamp`)?.index??null,maskTexture:i?.index??null,maskUv:i?.texCoord??0,maskScale:a.scale,maskOffset:a.offset,faceShadow:r.keyword(`_SHADOW_OBJECT_SPACE_NORMAL_MAP`),faceUp:r.float(`IF_SHADOW_OBJECT_SPACE_NORMAL_MAP_Y`),skinVertexColor:r.keyword(`_SKIN_VERTEX_COLOR`),specular:Up(r,t),pbr:Fp(r,e.shader.cubemap??null,t),rim:Hp(r,o),vertexColor:r.keyword(`_VERTEX_COLOR`),matcap:Lp(r),zones:Ip(r,o),albedo:Vp(r),detail:zp(r),faceMap:Bp(r),emission:Rp(r,c),emissionFlow:n?null:wl(e.shader),bloom:{factor:r.float(`_BloomFactor`),emissionFactor:r.float(`_EmissionBloomFactor`),noShadowAdd:t.noShadowBloomAdd},blended:r.keyword(`_ALPHABLEND_ON`),effect:n}}var Gp=[0,.26,.51,.76],Kp=[.25,.5,.75,1],qp=[.875,.625,.375,.125],Jp=pl({clip:xl,blend:fl(xl).optional(),speed:$.optional(),cycleOffset:$.optional(),mirror:ul().optional(),skills:fl(bl).optional(),face:bl.nonnegative().optional(),faceLock:ul().optional(),faceKeep:ul().optional()}),Yp=pl({name:cl(),blending:yl([`override`,`additive`]),default:cl().nullable(),mask:fl(xl).optional(),states:_l(cl(),Jp)}),Xp=pl({id:cl(),layers:fl(Yp)}),Zp=pl({name:cl(),file:cl(),duration:$,frameRate:$,loop:ul(),rootNode:xl.nullable()}),Qp=ml([pl({controller:cl(),layer:xl,state:cl()}),pl({clip:xl})]),$p=pl({default:$,layers:fl(_l(cl(),_l(cl(),$)))}),em=pl({base:cl().nullable(),levels:fl(cl()).optional(),entry:Qp.nullable(),idle:Qp.nullable(),hiddenNodes:fl(xl).optional(),stateHides:_l(cl(),fl(xl)).optional(),mounts:fl(pl({slot:bl,name:cl(),node:xl,skillNode:xl.nullable()})).optional(),partNpcs:fl(pl({target:cl(),node:xl})).optional(),transitions:$p.optional(),rotation:gl([$,$,$,$]).optional()}),tm=pl({formatVersion:vl(1),target:cl(),model:cl().nullable(),modelStoredBytes:bl.optional(),characterId:bl.optional(),eventDispatch:yl([`native`,`frames`]),controllers:fl(Xp),clips:fl(Zp),contexts:_l(cl(),em),defaultContext:cl().optional()}).superRefine((e,t)=>{let n=(e,n)=>t.addIssue({code:q.custom,path:e,message:n}),r=new Map(e.controllers.map(e=>[e.id,e])),i=t=>e.clips[t]!==void 0;e.controllers.forEach((e,t)=>e.layers.forEach((e,r)=>Object.entries(e.states).filter(([,e])=>!i(e.clip)).forEach(([e])=>n([`controllers`,t,`layers`,r,`states`,e,`clip`],`Missing clip`))));for(let[t,a]of Object.entries(e.contexts)){[a.base,...a.levels??[]].filter(e=>e!==null&&!r.has(e)).forEach(e=>n([`contexts`,t],`Missing controller ${e}`));for(let e of[`entry`,`idle`]){let o=a[e];o&&((`clip`in o?i(o.clip):r.get(o.controller)?.layers[o.layer]?.states[o.state])||n([`contexts`,t,e],`Plays nothing in this manifest`))}}}),nm=sl(e=>Array.isArray(e),`Expected an array of numbers`),rm=pl({node:bl.nonnegative(),property:yl([`position`,`quaternion`,`scale`,`weights`]),target:bl.nonnegative().optional(),value:fl($).optional(),deltas:nm.optional(),dropped:fl(pl({at:bl.nonnegative(),component:bl.min(0).max(3)})).optional()}),im=pl({time:$,function:cl(),int:bl,float:$,face:bl.nonnegative().optional()}),am=pl({version:vl(1),packing:pl({times:nm,rotationBits:bl,valueDigits:bl}).optional(),tracks:fl(rm),events:fl(im).optional()}),om=[{name:`fight`,label:`Fight`,title:`Combat animations and parts`},{name:`menu`,label:`Menu`,title:`Character screen animations and parts`},{name:`show`,label:`Show`,title:`Weapon showcase animations`},{name:`dorm`,label:`Dorm`,title:`Dorm animations`}],sm={"":`Default`,tx:`Chibi`,txpu:`Chibi (PU)`,mz:`Moe War`,dw:`RPG Maker`,gm:`Golden Miner`,planet:`Planet Running`,pbr:`PBR`,pbr2:`PBR 2`,fk:`Block Puzzle`,mg:`Maze`,weaponchess:`Weapon Chess`,samecolor:`Same Color`};function cm(e){let t=om.map(({name:e})=>e),n=Object.keys(e.contexts);return[...t.filter(e=>n.includes(e)),...n.filter(e=>!t.includes(e))]}function lm(e,t){return e.startsWith(t.toLowerCase())?e.slice(t.length):null}function um(e,t){let n=om.find(t=>t.name===e);if(n)return n.label;let r=lm(e,t);if(r!==null){let e=r.match(/^ui(\d*)$/);return e?`Menu ${e[1]||1}`:sm[r]??r.toUpperCase()}return e.charAt(0).toUpperCase()+e.slice(1)}function dm(e,t){let n=om.find(t=>t.name===e);return n?n.title:lm(e,t)===null?void 0:e}function fm(e){return e.startsWith(`weaponprefab/`)?`weapon`:`character`}function pm(e){return tm.parse(e)}function mm(e){return am.parse(e)}function hm(e,t){let n=e.endsWith(`/`)?e:`${e}/`;return new URL(`models/${t}`,n).toString()}function gm(e,t){return hm(e,`${t}/manifest.json`)}async function _m(e,t,n){
    const localMatch = typeof t === 'string' && t.match(/\/models\/_shared\/cubemaps\/.+$/);
    if (localMatch) {
      try {
        const localRes = await e(localMatch[0], n ? { signal: n } : undefined);
        if (localRes.ok && (localRes.headers.get('content-type') || '').indexOf('text/html') === -1) {
          return localRes;
        }
      } catch {}
    }
    let r=await e(t,n?{signal:n}:void 0);
    if(!r.ok)throw Error(`Request failed (${r.status}): ${t}`);
    return r
  }var vm=1179937895,ym=12,bm=8;function xm(e){let t=new Uint8Array(ym),n=0;for(let r of e)if(t.set(r.subarray(0,ym-n),n),n+=Math.min(r.length,ym-n),n===ym)break;let r=new DataView(t.buffer);return r.getUint32(0,!0)===vm?r.getUint32(bm,!0):null}async function Sm(e,t){let n=e.body?.getReader();if(!n)return e.arrayBuffer();let r=[],i=null,a=0,o=!1;try{for(;;){let{done:e,value:s}=await n.read();if(e)break;if(i){if(a+s.length>i.length)throw Error(`Model is longer than its header says`);i.set(s,a)}else r.push(s);if(a+=s.length,!o&&a>=ym){o=!0;let e=xm(r);if(e!==null){if(e<a)throw Error(`Model is longer than its header says`);i=new Uint8Array(e);let t=0;for(let e of r)i.set(e,t),t+=e.length;r=[]}}t?.(i?a/i.length:null)}if(i){if(a!==i.length)throw Error(`Model is shorter than its header says`);return i.buffer}return new Blob(r).arrayBuffer()}catch(e){throw await n.cancel().catch(()=>{}),e}finally{n.releaseLock()}}async function Cm(e,t,{fetcher:n=globalThis.fetch,signal:r}={}){let i=gm(e,t);return{manifest:pm(await(await _m(n,i,r)).json()),manifestUrl:i}}async function wm({manifest:e,manifestUrl:t},{fetcher:n=globalThis.fetch,signal:r,onProgress:i}={}){if(e.model===null)return null;let a=await _m(n,new URL(e.model,t).toString(),r),o=Number(a.headers.get(`content-length`)),s=o>0?o:e.modelStoredBytes??null;return Sm(a,e=>i?.({fraction:e,size:s}))}async function Tm(e,t,{fetcher:n=globalThis.fetch,signal:r}={}){return mm(await(await _m(n,new URL(t,e).toString(),r)).json())}var Em=6,Dm=pl({name:cl(),faceSize:bl.positive(),mips:bl.positive(),encoding:yl([`RGBM6`,`LDR6`]),colorSpace:yl([`sRGB`,`linear`])}),Om=pl({formatVersion:vl(1),cubemaps:_l(cl(),Dm)});async function km(e,t,n){let r=await(await _m(n,e)).blob(),i={imageOrientation:`none`,premultiplyAlpha:`none`,colorSpaceConversion:`none`},a=await createImageBitmap(r,i),o=0;try{return await Promise.all(Array.from({length:t.mips},(e,n)=>{let r=Math.max(t.faceSize>>n,1),s=o;return o+=r,Promise.all(Array.from({length:Em},(e,t)=>createImageBitmap(a,t*r,s,r,r,{...i,resizeWidth:r,resizeHeight:r})))}))}finally{a.close()}}async function Am(e,t,n=globalThis.fetch){let r=await km(hm(e,`_shared/cubemaps/${t.name}.webp`),t,n),i=new ht(r[0]);return i.mipmaps=r.slice(1).map(e=>({image:e})),i.generateMipmaps=!1,i.minFilter=kn,i.colorSpace=t.colorSpace===`sRGB`?Qe:``,i.needsUpdate=!0,i}var jm=null;function Mm(){if(jm)return jm;let e=Array.from({length:Em},()=>Yu(128,128));return jm=new ht(e),jm.generateMipmaps=!1,jm.colorSpace=``,jm.needsUpdate=!0,jm}async function Nm(e,t=globalThis.fetch,n){let r=await _m(t,hm(e,`_shared/cubemaps/index.json`),n),i=Om.parse(await r.json()),a=Wo(n=>Am(e,i.cubemaps[n],t));return{get(e){return i.cubemaps[e]?a.get(e):Promise.reject(Error(`Cubemap ${e} is missing from the index.`))},dispose(){for(let e of a.values())e.then(e=>e.dispose(),()=>{});a.clear()}}}var Pm=Wo(e=>Nm(e));function Fm(e = `https://assets.huaxu.app`){return Pm.get(e).catch(e=>(console.warn(fs(e)),null))}var Im={base:`_MainTex`,main:`_Effect_MainTex`,second:`_Effect_SecondTex`,mask:`_Effect_MaskTex`,flow:`_FlowTex`,dissolution:`_Effect_DissolutionTex`,dissolutionMask:`_Effect_DissolutionMaskTex`,character:`_CharacterDissolutionTex`,noise:`_CharacterDissolutionNoiseTex`,vertexOffset:`_VertexOffset_Tex`},Lm=new Set([`flow`,`noise`]),Rm={CHARACTER_EFFECT_ENABLE:`PGR_FX`,_ALPHABLEND_ON:`PGR_FX_BLEND`,_ALPHATEST_ON:`PGR_FX_ALPHA_TEST`,_FLOWMAP:`PGR_FX_FLOW`,_MAIN_TEX_UV0:`PGR_FX_MAIN_UV0`,_SECOND_TEX:`PGR_FX_SECOND`,_DISSOLUTION:`PGR_FX_DISSOLVE`,_DISSOLUTION_MASK_TEX:`PGR_FX_DISSOLVE_MASK`,_RIM_LERP_WITH_ALPHA:`PGR_FX_RIM_ALPHA`,_MASK_ON_FINAL_ALPHA:`PGR_FX_MASK_FINAL_ALPHA`,_CHARACTER_DISSOLUTION:`PGR_CHAR_DISSOLVE`,_CHARACTER_DISSOLUTION_NOISE:`PGR_CHAR_DISSOLVE_NOISE`,_VERTEX_OFFSET:`PGR_FX_VERTEX_OFFSET`},zm=[`_AlbedoColorIntensity`,`IF_MAIN_ALPHA_FOR_SHADOWMASK`,`_FlowIntensity`,`IF_MainTexFlowMap`,`IF_MaskFlowMapKeyword`,`IF_DissolutionFlowMap`,`_Effect_Brightness`,`_Effect_BrightnessR`,`_Effect_BrightnessG`,`_Effect_BrightnessB`,`_Effect_DissolutionThreshold`,`_Effect_DissolutionSoftness`,`_Effect_RimRange`,`_CharacterDissolutionThreshold`,`_CharacterDissolutionSoftness`,`_CharacterDissolutionColorStrength`,`_InvertDissolution`,`_AlphaTest`,`_VertexOffset_Speed_R`,`_VertexOffset_Speed_G`,`_VertexOffset_Strength_R`,`_VertexOffset_Strength_G`,`_VertexOffset_AlphaMask`],Bm=[`_AlbedoColor`,`_Effect_MainTexColor`,`_Effect_SecondColor`,`_Effect_TintColor`,`_Effect_RimColor`,`_Effect_DissolutionColor`,`_CharacterDissolutionColor`],Vm=[`_FlowSpeed`,`_FlowIntensityParamter`,`_Effect_MaskRotationParams`,`_Effect_DissolutionParamter`,`_CharacterDissolutionNoiseParam`];function Hm(e){let t=Ef(e.shader),n=jf(t,{slots:Im,keywords:Rm,floats:zm,colors:Bm,vectors:Vm}),{defines:r,colors:i}=n;(t.keyword(`_RIM_LERP`)||t.keyword(`_RIM_LERP_WITH_ALPHA`))&&(r.PGR_FX_RIM=``),(t.keyword(`_MASKUV0`)||t.keyword(`_MASKUV3`))&&(r.PGR_FX_MASK=``);let a=i._CharacterDissolutionNoiseParam,o=`PGR_FX`in r&&`PGR_FX_FLOW`in r||`PGR_FX_DISSOLVE`in r&&i._Effect_DissolutionParamter.slice(0,2).some(e=>e!==0)||`PGR_CHAR_DISSOLVE_NOISE`in r&&(a[0]!==0||a[1]!==0)||`PGR_FX_VERTEX_OFFSET`in r;return{...n,lit:t.keyword(`CHARACTER_MATERIAL_ENABLE`),render:e.render,animated:o}}function Um(e,t){let n=e=>{let t=Math.min(Math.max(e,0),1);return t*t*(3-2*t)};return t===0?Number(e>0)+Number(e<1)-1:n(e/t)+n((e-1)/-t)-1}var Wm=`
uniform float pgrTime;
uniform vec4 pgrFxFlowST, pgrFxFlowSpeed, pgrFxMaskST, pgrFxMaskRot, pgrFxDissST;
uniform vec4 pgrCharDissST, pgrCharNoiseST;
// xy: effect dissolve scroll, zw: character noise scroll, both per _Time.x.
uniform vec4 pgrFxScroll;
uniform sampler2D pgrFxVertexOffset;
// x, y: scroll speed of the red and green taps. Z, w: their strengths.
uniform vec4 pgrFxVoST, pgrFxVoParams;
uniform float pgrFxVoAlphaMask;

#if defined(PGR_FX_VO_ALPHA) && !defined(PGR_SKIN_VERTEX_COLOR) && !defined(PGR_VERTEX_COLOR)
  attribute vec4 _pgrcolor;
#endif

varying vec2 vPgrFxUv0, vPgrFxMainUv, vPgrFxMaskUv, vPgrFxDissUv, vPgrCharUv, vPgrCharNoiseUv;
varying vec4 vPgrFxFlowUv;
${_s}
`,Gm=`
  vec2 fxUv0 = pgrGame(uv);

  #ifdef PGR_FX_VERTEX_OFFSET
    float voAmount = pgrVertexOffsetAmount(pgrFxVertexOffset, PGR_FX_VO_SOURCE, pgrFxVoST, pgrFxVoParams, pgrTime);
    #ifdef PGR_FX_VO_ALPHA
      voAmount *= mix(1.0, _pgrcolor.a, pgrFxVoAlphaMask);
    #endif
    transformed += voAmount * objectNormal;
  #endif

  vPgrFxUv0 = fxUv0;
  #ifdef PGR_FX_MAIN_UV0
    vPgrFxMainUv = fxUv0;
  #else
    vPgrFxMainUv = vec2(0.0);
  #endif
  vPgrFxMaskUv = pgrRot(PGR_FX_MASK_SOURCE * pgrFxMaskST.xy + pgrFxMaskST.zw, pgrFxMaskRot);
  vPgrFxDissUv = fxUv0 * pgrFxDissST.xy + pgrFxDissST.zw + pgrFxScroll.xy * pgrTime / 20.0;
  vPgrFxFlowUv = pgrFlowUv(fxUv0, pgrFxFlowST, pgrFxFlowSpeed, pgrTime);
  vPgrCharUv = PGR_CHAR_SOURCE * pgrCharDissST.xy + pgrCharDissST.zw;
  vPgrCharNoiseUv = fxUv0 * pgrCharNoiseST.xy + pgrCharNoiseST.zw + pgrFxScroll.zw * pgrTime / 20.0;
`,Km=`
uniform sampler2D pgrFxMain, pgrFxSecond, pgrFxMask, pgrFxFlow, pgrFxDiss, pgrFxDissMask, pgrCharDiss, pgrCharNoise;
uniform vec4 pgrFxMainST, pgrFxSecondST, pgrFxDissMaskST;
uniform vec4 pgrFxMainColor, pgrFxSecondColor, pgrFxTint, pgrFxRimColor, pgrFxDissColor;
// x: brightness, yzw: per-channel brightness.
uniform vec4 pgrFxBrightness;
// x: flow intensity. Y, z, w: the main, mask and dissolve gates times their _FlowIntensityParamter.
uniform vec4 pgrFxFlowParams;
// x: threshold, y: softness.
uniform vec2 pgrFxDissParams;
uniform float pgrFxRimRange, pgrFxAlphaTest;
// x: threshold, y: softness, z: noise weight, w: invert.
uniform vec4 pgrCharDissParams;
// rgb: color times strength, a: blend.
uniform vec4 pgrCharDissColor;

varying vec2 vPgrFxUv0, vPgrFxMainUv, vPgrFxMaskUv, vPgrFxDissUv, vPgrCharUv, vPgrCharNoiseUv;
varying vec4 vPgrFxFlowUv;
${_s}

// base: the lit or unlit surface color. coverage: albedo alpha. litAlpha: the lit program's base
// alpha, its bloom weight when opaque.
// Returns the final color and the alpha the game writes, which is also the bloom weight.
vec4 pgrEffectCharacter(vec3 base, float coverage, float litAlpha, vec3 N, vec3 V) {
  vec3 fxColor = vec3(0.0);
  float a = 0.0;
  float m = 1.0;

  #ifdef PGR_FX
    vec2 flow = vec2(0.0);
    #ifdef PGR_FX_FLOW
      flow = pgrFlowSample(pgrFxFlow, vPgrFxFlowUv, pgrFxFlowParams.x);
    #endif

    vec4 fx = pgrFetch(pgrFxMain, vPgrFxMainUv * pgrFxMainST.xy + pgrFxMainST.zw + flow * pgrFxFlowParams.y) * pgrFxMainColor;
    #ifdef PGR_FX_SECOND
      vec4 second = pgrFetch(pgrFxSecond, vPgrFxMainUv * pgrFxSecondST.xy + pgrFxSecondST.zw + flow) * pgrFxSecondColor;
      fx = mix(fx, second, second.a);
    #endif
    fx *= pgrFxTint;

    #ifdef PGR_FX_MASK
      m = pgrFetch(pgrFxMask, vPgrFxMaskUv + flow * pgrFxFlowParams.z).r;
    #endif
    fxColor = fx.rgb * pgrFxBrightness.x;
    a = fx.a * m;

    #ifdef PGR_FX_RIM
      float rim = pgrRimFalloff(dot(N, V), pgrFxRimRange);
      fxColor = mix(fxColor, pgrFxRimColor.rgb * pgrFxBrightness.x, rim);
      #ifdef PGR_FX_RIM_ALPHA
        a = mix(a, pgrFxRimColor.a, rim);
      #endif
    #endif

    #ifdef PGR_FX_DISSOLVE
      float d = pgrFetch(pgrFxDiss, vPgrFxDissUv + flow * pgrFxFlowParams.w).r;
      #ifdef PGR_FX_DISSOLVE_MASK
        d = clamp(d - pgrFetch(pgrFxDissMask, vPgrFxUv0 * pgrFxDissMaskST.xy + pgrFxDissMaskST.zw).r, 0.0, 1.0);
      #endif
      float e = pgrSoftStep(pgrFxDissParams.x, max(pgrFxDissParams.y, 1e-4), d);
      fxColor = mix(fxColor, mix(fxColor, pgrFxDissColor.rgb * pgrFxBrightness.x, pgrFxDissColor.a), e);
      a *= 1.0 - e;
    #endif

    fxColor = clamp(fxColor * pgrFxBrightness.yzw, 0.0, 500.0);
    // XEffect's mystery 1.871 gain, same deal.
    a = clamp(a * 1.871, 0.0, 1.0);
  #endif

  #ifdef PGR_FX_LIT
    float baseAlpha = litAlpha;
  #else
    float baseAlpha = coverage;
  #endif
  #if defined(PGR_FX_LIT) && !defined(PGR_FX_BLEND)
    float litCoverage = coverage;
  #else
    float litCoverage = 1.0;
  #endif

  vec4 result;
  #ifdef PGR_CHAR_DISSOLVE
    vec4 c = mix(vec4(base, baseAlpha), vec4(fxColor, a), a);
    #ifdef PGR_FX_MASK_FINAL_ALPHA
      c.a *= m;
    #endif
    float cd = pgrFetch(pgrCharDiss, vPgrCharUv).r;
    #ifdef PGR_CHAR_DISSOLVE_NOISE
      cd += pgrFetch(pgrCharNoise, vPgrCharNoiseUv).r * pgrCharDissParams.z;
    #endif
    float k = pgrSoftStep(pgrCharDissParams.x, pgrCharDissParams.y, cd);
    vec3 kColor = mix(c.rgb, mix(c.rgb, pgrCharDissColor.rgb, pgrCharDissColor.a), k);
    float W = 1.0 - k;
    if (pgrCharDissParams.w != 0.0) {
      kColor = c.rgb;
      W = k;
    }
    result = vec4(mix(kColor, c.rgb, W), W * (c.a * litCoverage - W) + W);
    #ifdef PGR_FX
      result.a *= step(0.01, a);
    #else
      result.a *= step(0.01, coverage);
    #endif
  #else
    result.rgb = mix(base, fxColor, a);
    #if defined(PGR_FX_LIT) && !defined(PGR_FX_BLEND)
      result.a = coverage * mix(litAlpha, a, a);
    #else
      result.a = coverage;
    #endif
  #endif
  result.a = max(result.a, 0.0);

  #ifdef PGR_FX_ALPHA_TEST
    if (result.a < pgrFxAlphaTest) discard;
  #endif
  return result;
}
`,qm=`
${ps}
${Wm}

varying vec3 vPgrNormal, vPgrViewPos;

void main() {
${gs}
${Gm}
  vPgrNormal = normalMatrix * objectNormal;
  #include <project_vertex>
  vPgrViewPos = mvPosition.xyz;
}
`,Jm=`
uniform sampler2D pgrBase;
uniform vec4 pgrBaseST, pgrAlbedo;
uniform float pgrMainAlphaMask;

varying vec3 vPgrNormal, vPgrViewPos;
${Km}

void main() {
  vec4 tex = pgrFetch(pgrBase, vPgrFxUv0 * pgrBaseST.xy + pgrBaseST.zw);
  float coverage = pgrAlbedo.a * mix(tex.a, 1.0 - tex.a, pgrMainAlphaMask);
  vec4 result = pgrEffectCharacter(tex.rgb * pgrAlbedo.rgb, coverage, 0.0, normalize(vPgrNormal), normalize(-vPgrViewPos));
  float outAlpha = result.a;
  #ifdef PGR_FX_BLEND
    gl_FragColor = result;
  #else
    gl_FragColor = vec4(result.rgb, 1.0);
  #endif
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`,Ym=Yu(255),Xm=Yu(128);function Zm(e,t,n){let r=e?.texCoord??0;return r===0?`fxUv0`:t.has(`uv${r}`)?(n[`USE_UV${r}`]=``,`pgrGame(uv${r})`):`vec2(0.0)`}function Qm(e,t){let{floats:n,bindings:r}=e,i={...e.defines};return e.lit&&(i.PGR_FX_LIT=``),i.PGR_FX_MASK_SOURCE=Zm(r.mask,t,i),i.PGR_CHAR_SOURCE=Zm(r.character,t,i),`PGR_FX_VERTEX_OFFSET`in i&&(i.PGR_FX_VO_SOURCE=Zm(r.vertexOffset,t,i),n._VertexOffset_AlphaMask!==0&&t.has(`_pgrcolor`)&&(i.PGR_FX_VO_ALPHA=``)),i}function $m(e,t,n){let{floats:r,colors:i,bindings:a}=e,o=e=>t[e]??(Lm.has(e)?Xm:Ym),s=r._CharacterDissolutionThreshold,c=i._CharacterDissolutionNoiseParam,l=i._Effect_DissolutionParamter,u=i._FlowIntensityParamter,d=i._CharacterDissolutionColor,f=r._CharacterDissolutionColorStrength;return{pgrTime:n,pgrFxMain:{value:o(`main`)},pgrFxSecond:{value:o(`second`)},pgrFxMask:{value:o(`mask`)},pgrFxFlow:{value:o(`flow`)},pgrFxDiss:{value:o(`dissolution`)},pgrFxDissMask:{value:o(`dissolutionMask`)},pgrCharDiss:{value:o(`character`)},pgrCharNoise:{value:o(`noise`)},pgrFxVertexOffset:{value:o(`vertexOffset`)},pgrFxMainST:{value:kf(a.main)},pgrFxSecondST:{value:kf(a.second)},pgrFxMaskST:{value:kf(a.mask)},pgrFxFlowST:{value:kf(a.flow)},pgrFxDissST:{value:kf(a.dissolution)},pgrFxDissMaskST:{value:kf(a.dissolutionMask)},pgrCharDissST:{value:kf(a.character)},pgrCharNoiseST:{value:kf(a.noise)},pgrFxVoST:{value:kf(a.vertexOffset)},pgrFxMaskRot:{value:Af(i._Effect_MaskRotationParams)},pgrFxFlowSpeed:{value:Af(i._FlowSpeed)},pgrFxScroll:{value:new In(l[0],l[1],c[0],c[1])},pgrFxMainColor:{value:Af(i._Effect_MainTexColor)},pgrFxSecondColor:{value:Af(i._Effect_SecondColor)},pgrFxTint:{value:Af(i._Effect_TintColor)},pgrFxRimColor:{value:Af(i._Effect_RimColor)},pgrFxDissColor:{value:Af(i._Effect_DissolutionColor)},pgrFxBrightness:{value:new In(r._Effect_Brightness,r._Effect_BrightnessR,r._Effect_BrightnessG,r._Effect_BrightnessB)},pgrFxFlowParams:{value:new In(r._FlowIntensity,r.IF_MainTexFlowMap*u[0],r.IF_MaskFlowMapKeyword*u[1],r.IF_DissolutionFlowMap*u[2])},pgrFxDissParams:{value:new H(r._Effect_DissolutionThreshold,r._Effect_DissolutionSoftness)},pgrFxRimRange:{value:r._Effect_RimRange},pgrFxAlphaTest:{value:r._AlphaTest},pgrCharDissParams:{value:new In(s,r._CharacterDissolutionSoftness,c[2]*Um(s,c[3]),r._InvertDissolution)},pgrCharDissColor:{value:new In(d[0]*f,d[1]*f,d[2]*f,d[3])},pgrFxVoParams:{value:new In(r._VertexOffset_Speed_R,r._VertexOffset_Speed_G,r._VertexOffset_Strength_R,r._VertexOffset_Strength_G)},pgrFxVoAlphaMask:{value:r._VertexOffset_AlphaMask}}}function eh(e,t,n){return{defines:Qm(e,n.attributes),uniforms:$m(e,t,n.time)}}function th(e,t){eu(e,t.render),e.alphaTest=0,e.userData.animated=t.animated}function nh(e,t,n){let{defines:r,uniforms:i}=eh(e,t,n),{floats:a,colors:o}=e,s=o._AlbedoColor,c=a._AlbedoColorIntensity,l=new ke({name:`pgr-effect-character`,defines:r,vertexShader:qm,fragmentShader:xs(Jm,`outAlpha`,$l(e.render,`outAlpha`)),uniforms:{...i,pgrBase:{value:t.base??Ym},pgrBaseST:{value:kf(e.bindings.base)},pgrAlbedo:{value:new In(...s).multiplyScalar(c)},pgrMainAlphaMask:{value:a.IF_MAIN_ALPHA_FOR_SHADOWMASK}}});return th(l,e),l}function rh(e,t){let{render:n}=e;if(n.blend||!n.depthWrite||n.zTest!==`lequal`||`PGR_FX_ALPHA_TEST`in e.defines)return null;let{defines:r,uniforms:i}=t;return new ke({name:`pgr-prepass-fx`,defines:r,vertexShader:qm,fragmentShader:`void main() {}`,uniforms:i,side:Jl(n.cull),colorWrite:!1})}var ih=`
${ps}
#include <uv_pars_vertex>
#include <normal_pars_vertex>
#include <shadowmap_pars_vertex>

uniform float pgrMaskUvSet;
uniform vec2 pgrMaskScale;
uniform vec2 pgrMaskOffset;

// Vertex color isn't albedo here. Red gates the skin ramp, alpha the rim.
#if defined(PGR_SKIN_VERTEX_COLOR) || defined(PGR_VERTEX_COLOR)
  attribute vec4 _pgrcolor;
#endif

#ifdef PGR_PBR
  uniform vec2 pgrPbrMaskScale;
  uniform vec2 pgrPbrMaskOffset;
  varying vec2 vPgrPbrMaskUv;
#endif

#ifdef PGR_EMISSION_FLOW
  uniform vec2 pgrFlowScale;
  uniform vec2 pgrFlowOffset;
  varying vec2 vPgrFlowUv;
#endif

// USE_UV1 provides the attribute, but no varying.
#ifdef PGR_DETAIL
  uniform vec2 pgrDetailScale;
  uniform vec2 pgrDetailOffset;
  varying vec2 vPgrDetailUv;
#endif
#ifdef PGR_FACE_MAP
  varying vec2 vPgrFaceUv;
#endif

// Unity stores zone ids in uv1.zw.
#ifdef PGR_ZONES
  attribute vec2 _pgrzone;
#endif

#ifdef PGR_EFFECT_CHARACTER
  ${Wm}
#endif

varying vec3 vViewPosition;
varying vec2 vPgrMaskUv;
varying float vPgrSkinGate;
varying float vPgrRimGate;
#if defined(PGR_ZONE_SKIN) || defined(PGR_ZONE_SHADOW)
  varying vec2 vPgrZone;
#endif

void main() {
  #include <uv_vertex>

  #ifdef PGR_SKIN_VERTEX_COLOR
    vPgrSkinGate = _pgrcolor.r;
  #else
    vPgrSkinGate = 1.0;
  #endif
  #ifdef PGR_VERTEX_COLOR
    vPgrRimGate = _pgrcolor.a;
  #else
    vPgrRimGate = 1.0;
  #endif
  #if defined(PGR_ZONES)
    vPgrZone = _pgrzone;
  #elif defined(PGR_ZONE_SKIN) || defined(PGR_ZONE_SHADOW)
    vPgrZone = vec2(0.0, 1.0);
  #endif

  vPgrMaskUv = uv;
  #ifdef USE_UV1
    if (pgrMaskUvSet > 0.5) vPgrMaskUv = uv1;
  #endif
  vPgrMaskUv = vPgrMaskUv * pgrMaskScale + pgrMaskOffset;

  #ifdef PGR_PBR
    vPgrPbrMaskUv = uv * pgrPbrMaskScale + pgrPbrMaskOffset;
  #endif
  // Flow always uses UV0, regardless of the mask's UV set.
  #ifdef PGR_EMISSION_FLOW
    vPgrFlowUv = uv * pgrFlowScale + pgrFlowOffset;
  #endif
  #ifdef PGR_DETAIL
    vPgrDetailUv = PGR_DETAIL_UV * pgrDetailScale + pgrDetailOffset;
  #endif
  #ifdef PGR_FACE_MAP
    vPgrFaceUv = PGR_FACE_UV;
  #endif

${ms}
  #include <defaultnormal_vertex>
  #include <normal_vertex>

${hs}
  #ifdef PGR_EFFECT_CHARACTER
    ${Gm}
  #endif
  #include <project_vertex>
  #include <worldpos_vertex>
  #include <shadowmap_vertex>

  vViewPosition = -mvPosition.xyz;
}
`,ah=`
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphatest_pars_fragment>
#include <normal_pars_fragment>
#include <normalmap_pars_fragment>
#include <shadowmap_pars_fragment>
${vs}

uniform vec3 diffuse;
uniform float opacity;

uniform vec3 pgrLightDir, pgrLightColor, pgrAmbient, pgrGlobalTint;
uniform vec3 pgrNoShadow, pgrOneShadow, pgrTwoShadow, pgrSkinColor;
uniform float pgrShadowIntensity, pgrFirst, pgrSecond, pgrSmooth, pgrSmoothOn;
uniform float pgrHasMask, pgrMainAlphaMask, pgrSkinRate, pgrSkinIntensity;
uniform float pgrFaceShadow, pgrFaceUp;
uniform vec3 pgrObjectY, pgrObjectZ;
uniform sampler2D pgrMask, pgrSkinRamp;

uniform vec3 pgrSpecularColor;
uniform float pgrSpecularIntensity, pgrSpecularShininess, pgrSpecularSmooth, pgrSpecularInvert;
uniform float pgrSpecularAttenuation, pgrSpecularAttenuationPow, pgrSpecularAttenuationSmoothness;
uniform float pgrSpecularShadowOn, pgrSpecularShadowIntensity;

uniform vec3 pgrRimDir, pgrRimColor;
uniform float pgrRimOn, pgrRimIntensity, pgrRimMin, pgrRimMax, pgrRimThreshold;

#ifdef PGR_ZONE_SKIN
  uniform vec3 pgrZoneSkinColors[4];
  uniform vec4 pgrZoneSkinRates, pgrZoneSkinIntensities;
  uniform float pgrSkinOn;
#endif
#ifdef PGR_ZONE_SHADOW
  uniform vec3 pgrZoneNoShadow[4], pgrZoneOneShadow[4], pgrZoneTwoShadow[4];
#endif

#ifdef PGR_MATCAP
  uniform sampler2D pgrMatcap;
  uniform float pgrMatcapYScale, pgrMatcapMask, pgrMatcapShadowStrength, pgrMatcapAlpha, pgrMatcapAlphaUseMask;
#endif

#ifdef PGR_DETAIL
  uniform sampler2D pgrDetail;
  varying vec2 vPgrDetailUv;
#endif
#ifdef PGR_FACE_MAP
  uniform sampler2D pgrFaceMap;
  varying vec2 vPgrFaceUv;
#endif

uniform vec2 pgrBloomWeights;
#ifdef PGR_EMISSION
  uniform vec3 pgrEmissionColor;
  uniform float pgrEmissionIntensity;
  #ifdef PGR_EMISSION_FLOW
    uniform sampler2D pgrFlow;
    varying vec2 vPgrFlowUv;
  #endif
  #ifdef PGR_EMISSION_ZONES
    uniform vec3 pgrEmissionZoneColors[4];
    uniform vec4 pgrEmissionZoneIntensities;
  #endif
#endif

#if defined(PGR_PBR) || defined(PGR_SIMPLE_PBR)
  ${kp}
  uniform vec3 pgrPbrSpecularColor, pgrDirectLightColor, pgrIndirectLightColor, pgrCubemapColor;
  uniform float pgrPbrRate, pgrPbrSpecularIntensity, pgrIndirectLightIntensity, pgrCubemapIntensity;
  #ifdef PGR_PBR
    uniform sampler2D pgrPbrMask;
    uniform float pgrPbrHasMask, pgrMetallicScale, pgrRoughnessScale, pgrAoScale;
    varying vec2 vPgrPbrMaskUv;
  #else
    uniform float pgrMetallic, pgrRoughness;
  #endif
#endif

varying vec3 vViewPosition;
varying vec2 vPgrMaskUv;
varying float vPgrSkinGate;
varying float vPgrRimGate;
#if defined(PGR_ZONE_SKIN) || defined(PGR_ZONE_SHADOW)
  varying vec2 vPgrZone;
#endif

#ifdef PGR_EFFECT_CHARACTER
  ${Km}
  uniform float pgrNoShadowBloomAdd;
#endif

vec4 zoneWeights(float zone) {
  return step(${ys(Gp)}, vec4(zone)) * step(vec4(zone), ${ys(Kp)});
}

vec3 pickZone(vec3 a, vec3 b, vec3 c, vec3 d, vec4 w) {
  return a * w.x + b * w.y + c * w.z + d * w.w;
}

// The face mask packs a normal in the root bone's Y and Z, B for Z and A for Y when pgrFaceUp is
// on. Light from the other side mirrors the sample, then it's half-Lambert on the horizontal plane.
float faceLambert(vec3 lightWorld) {
  vec2 uv = vPgrMaskUv;
  if (dot(lightWorld, pgrObjectZ) <= 0.0) uv.x = 1.0 - uv.x;
  vec4 packed = texture2D(pgrMask, uv);
  float alongZ = packed.b * 2.0 - 1.0;
  float alongY = pgrFaceUp * (packed.a * 2.0 - 2.0) + 1.0;
  vec2 n = normalize(vec2(alongY, alongZ));
  vec3 nWorld = normalize(n.x * pgrObjectY + n.y * pgrObjectZ);
  return dot(normalize(lightWorld.xz), nWorld.xz) * 0.5 + 0.5;
}

#if defined(PGR_PBR) || defined(PGR_SIMPLE_PBR)
// A GGX lobe and a cubemap reflection, blended over the flat albedo by the mask's alpha
// times _PBRRate. The result feeds the cel bands like a plain albedo would.
vec3 pbrAlbedo(vec3 albedo, vec3 N, vec3 V, vec3 L, float NoV, float NoH) {
  #ifdef PGR_PBR
    vec4 mask = pgrPbrHasMask > 0.5 ? texture2D(pgrPbrMask, vPgrPbrMaskUv) : vec4(1.0);
    PgrPbrSurface surface = pgrPbrSurface(mask, pgrRoughnessScale, pgrMetallicScale, pgrAoScale);
    float weight = mask.a * pgrPbrRate;
  #else
    PgrPbrSurface surface = PgrPbrSurface(pgrRoughness, pgrMetallic, 1.0);
    float weight = pgrPbrRate;
  #endif
  if (weight <= 0.0) return albedo;
  float rough = surface.rough;
  float ao = surface.ao;

  vec3 diffuseTerm = albedo * 0.96 * (1.0 - surface.metallic) * pgrIndirectLightColor;
  vec3 f0Env = pgrEnvBrdf(pgrPbrF0(albedo, surface.metallic, pgrPbrSpecularColor), rough, NoV);
  vec3 ggx = pgrGgxD(rough, NoH) * f0Env * pgrPbrSpecularIntensity;
  vec3 cubeSpec = f0Env * pgrCubemapSample(N, V, rough) * pgrCubemapColor * pgrCubemapIntensity;

  vec3 direct = (cubeSpec + ggx) * pgrDirectLightColor;
  vec3 indirect = diffuseTerm * pgrIndirectLightIntensity + cubeSpec;
  vec3 pbr = direct * clamp(dot(N, L), 0.0, 1.0) + ao * indirect;

  return mix(albedo, pbr, weight);
}
#endif

void main() {
  vec4 diffuseColor = vec4(diffuse, opacity);
  #include <map_fragment>
  // Tint both layers to match the game's blend-before-tint order.
  #ifdef PGR_DETAIL
    vec4 detail = texture2D(pgrDetail, vPgrDetailUv);
    diffuseColor.rgb = mix(diffuseColor.rgb, detail.rgb * diffuse, detail.a);
  #endif
  #ifdef PGR_FACE_MAP
    vec4 faceMap = texture2D(pgrFaceMap, vPgrFaceUv);
    diffuseColor.rgb = mix(diffuseColor.rgb, faceMap.rgb * diffuse, faceMap.a);
  #endif
  #include <alphatest_fragment>
  #if defined(USE_NORMALMAP_TANGENTSPACE) && defined(USE_TANGENT)
    // Normalize after combining the interpolated tangent frame.
    vec3 mapN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
    mapN.xy *= normalScale;
    vec3 normal = mapN.x * vTangent + mapN.y * vBitangent + mapN.z * vNormal;
    #ifdef DOUBLE_SIDED
      if (!gl_FrontFacing) normal = -normal;
    #endif
    normal = normalize(normal);
  #else
    #include <normal_fragment_begin>
    #include <normal_fragment_maps>
  #endif

  // Both already unit length, three's chunks and a rotation don't stretch anything.
  vec3 N = normal;
  vec3 V = normalize(vViewPosition);
  vec3 light = mat3(viewMatrix) * pgrLightDir;
  float halfLambert = dot(N, light) * 0.5 + 0.5;
  if (pgrFaceShadow > 0.5) halfLambert = faceLambert(pgrLightDir);
  float NoV = clamp(dot(N, V), 0.0, 1.0);
  float NoH = clamp(dot(N, normalize(V + light)), 0.0, 1.0);

  // A missing mask samples as white, like Unity's default texture.
  vec4 maskSample = pgrHasMask > 0.5 ? texture2D(pgrMask, vPgrMaskUv) : vec4(1.0);
  // The shadow mask reads the texture's own alpha, before the material's tint.
  #ifdef USE_MAP
    float mainAlpha = sampledDiffuseColor.a;
  #else
    float mainAlpha = 1.0;
  #endif
  float maskGreen = mix(maskSample.g, mainAlpha, pgrMainAlphaMask);

  // The game uses different mask formulas above and below 0.5.
  float maskBranch = 1.0 - floor(1.5 - maskGreen);
  float maskEdge = mix(maskGreen * 1.25 - 0.12, maskGreen * 1.2 - 0.1, maskBranch);

  // First shadow: a hard floor() step, or a clamp() ramp of width 2 * pgrSmooth when smoothing is on.
  float firstValue = (halfLambert + maskEdge) * 0.5 + 1.0 - pgrFirst;
  float hard = 1.0 - floor(firstValue);
  float soft = 1.0 - clamp((firstValue - 1.0 + pgrSmooth) / (2.0 * pgrSmooth), 0.0, 1.0);
  float banded = mix(hard, soft, pgrSmoothOn);
  // Already fully shadowed means no sample. The head map wins inside its 2% border, the body map
  // gets the rest. EffectCharacter's forward pass never samples one at all.
  float lit = 1.0;
  #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0 && !defined(PGR_EFFECT_CHARACTER)
    if (banded < 1.0) {
      bool inHead = false;
      #if NUM_DIR_LIGHT_SHADOWS > 1
        vec2 headCoord = vDirectionalShadowCoord[1].xy / vDirectionalShadowCoord[1].w;
        inHead = all(greaterThan(headCoord, vec2(0.02))) && all(lessThan(headCoord, vec2(0.98)));
        if (inHead) {
          lit = PGR_DIR_SHADOW(1);
        }
      #endif
      if (!inHead) {
        lit = PGR_DIR_SHADOW(0);
      }
    }
  #endif
  float firstWeight = pgrShadowIntensity * mix(1.0, banded, lit);

  // Second shadow is always a hard step, and only where the mask is below 0.1.
  float secondWeight = pgrShadowIntensity * (1.0 - floor((halfLambert + maskGreen) * 0.5 + 1.0 - pgrSecond));
  float secondAllowed = pgrShadowIntensity * (1.0 - floor(maskGreen + 0.9));

  vec3 noShadow = pgrNoShadow;
  vec3 oneShadow = pgrOneShadow;
  vec3 twoShadow = pgrTwoShadow;
  #ifdef PGR_ZONE_SHADOW
    vec4 wz = zoneWeights(vPgrZone.y);
    noShadow = pickZone(pgrZoneNoShadow[0], pgrZoneNoShadow[1], pgrZoneNoShadow[2], pgrZoneNoShadow[3], wz);
    oneShadow = pickZone(pgrZoneOneShadow[0], pgrZoneOneShadow[1], pgrZoneOneShadow[2], pgrZoneOneShadow[3], wz);
    twoShadow = pickZone(pgrZoneTwoShadow[0], pgrZoneTwoShadow[1], pgrZoneTwoShadow[2], pgrZoneTwoShadow[3], wz);
  #endif
  vec3 band = mix(noShadow, oneShadow, firstWeight);
  band = mix(band, mix(oneShadow, twoShadow, secondWeight), secondAllowed);

  vec3 albedo = diffuseColor.rgb;
  #if defined(PGR_PBR) || defined(PGR_SIMPLE_PBR)
    albedo = pbrAlbedo(albedo, N, V, light, NoV, NoH);
  #endif

  #ifdef PGR_ZONE_SKIN
    vec4 ws = zoneWeights(vPgrZone.x);
    float skinRate = pgrSkinOn * dot(pgrZoneSkinRates, ws) * vPgrSkinGate;
    if (skinRate > 0.0) {
      float row = dot(ws, ${ys(qp)});
      vec3 ramp = texture2D(pgrSkinRamp, vec2(halfLambert, row)).rgb;
      vec3 skinColor = pickZone(pgrZoneSkinColors[0], pgrZoneSkinColors[1], pgrZoneSkinColors[2], pgrZoneSkinColors[3], ws)
        * dot(pgrZoneSkinIntensities, ws);
      albedo = mix(albedo, albedo * ramp * skinColor, skinRate);
    }
  #else
    float skinRate = pgrSkinRate * vPgrSkinGate;
    if (skinRate > 0.0) {
      vec3 ramp = texture2D(pgrSkinRamp, vec2(halfLambert, 0.5)).rgb;
      albedo = mix(albedo, albedo * ramp * pgrSkinColor * pgrSkinIntensity, skinRate);
    }
  #endif

  // Blinn-Phong lifted by mask red, cut at a threshold _SpecularSmoothFactor softens, scaled by
  // mask blue. The matcap wants the attenuation too, so that lives outside the gate.
  float specAttenuation = 1.0;
  if (pgrSpecularAttenuation > 0.5) {
    float falloff = clamp(pow(NoV, pgrSpecularAttenuationPow) / pgrSpecularAttenuationSmoothness, 0.0, 1.0);
    specAttenuation = min(falloff * falloff * (3.0 - 2.0 * falloff), 1.0);
  }
  float specularGate = maskSample.b * pgrSpecularIntensity;
  float highlight = 0.0;
  if (specularGate > 0.0) {
    float noh = max(NoH, 0.0001);
    float lobe = pow(mix(noh, 1.0 - noh, pgrSpecularInvert), pgrSpecularShininess) + maskSample.r;
    highlight = clamp((lobe - pgrSpecularSmooth - 1.0) / pgrSpecularSmooth, 0.0, 1.0) * specAttenuation;
    if (pgrSpecularShadowOn > 0.5) {
      float shaded = step(0.0001, firstWeight + secondAllowed);
      highlight = mix(highlight, highlight * pgrSpecularShadowIntensity, shaded);
    }
  }
  vec3 highlightColor = albedo * specularGate * pgrSpecularColor;

  // A window on 1 - NdotV between _RimMin and _RimMax, front faces turned toward the rim light only.
  // The game's distance fade is off outside fights, so it's not here either.
  vec3 rim = vec3(0.0);
  if (pgrRimOn > 0.5 && gl_FrontFacing) {
    vec3 rimDir = mat3(viewMatrix) * pgrRimDir;
    float edge = clamp((1.0 - NoV - pgrRimMin) / max(pgrRimMax - pgrRimMin, 0.0001), 0.0, 1.0);
    edge = edge * edge * (3.0 - 2.0 * edge);
    float allowed = step(0.0, dot(N, V) + pgrRimThreshold);
    rim = edge * pgrRimIntensity * pgrRimColor * allowed * vPgrRimGate * clamp(dot(N, rimDir), 0.0, 1.0);
  }

  vec3 matcap = vec3(0.0);
  #ifdef PGR_MATCAP
    vec3 nv = N;
    nv.y = mix(nv.y, dot(N, viewMatrix[1].xyz), pgrMatcapYScale);
    nv = normalize(nv);
    // Flip V, Unity's origin is bottom-left and glTF's top-left.
    vec4 cap = texture2D(pgrMatcap, vec2(0.5 * nv.x + 0.5, 0.5 - 0.5 * nv.y));
    float capShadow = 1.0 - pgrMatcapShadowStrength * step(0.001, firstWeight) * firstWeight;
    float capMask = mix(1.0, maskSample.r * specAttenuation, pgrMatcapMask);
    matcap = cap.rgb * capShadow * capMask;
    // Matcap alpha affects coverage, not alpha clipping.
    if (pgrMatcapAlpha > 0.5) {
      diffuseColor.a = pgrMatcapAlphaUseMask > 0.5 ? mix(diffuseColor.a, cap.a, maskSample.r) : cap.a;
    }
  #endif

  // Emission bypasses the key light, but still takes ambient and global tint.
  vec3 emission = vec3(0.0);
  float bloomWeight = pgrBloomWeights.x;
  #ifdef PGR_EMISSION
    float emissionMask = maskSample.a;
    #ifdef PGR_EMISSION_FLOW
      if (emissionMask > 0.0) emissionMask *= texture2D(pgrFlow, vPgrFlowUv).r;
    #endif
    #ifdef PGR_EMISSION_ZONES
      vec4 we = zoneWeights(maskSample.b);
      vec3 emissionColor = pickZone(pgrEmissionZoneColors[0], pgrEmissionZoneColors[1], pgrEmissionZoneColors[2], pgrEmissionZoneColors[3], we)
        * dot(pgrEmissionZoneIntensities, we);
    #else
      vec3 emissionColor = pgrEmissionColor * pgrEmissionIntensity;
    #endif
    emission = diffuseColor.rgb * emissionColor * emissionMask;
    bloomWeight = mix(pgrBloomWeights.x, pgrBloomWeights.y, emissionMask);
  #endif
  #ifdef PGR_BLENDED
    // The game's blended programs write opacity here. An XTransparentBloomModify pass fixes it up.
    bloomWeight = diffuseColor.a;
  #endif

  vec3 outgoingLight = ((albedo * band + highlightColor * highlight + rim + matcap) * pgrLightColor + emission) * pgrAmbient * pgrGlobalTint;

  #ifdef PGR_EFFECT_CHARACTER
    // EffectCharacter's own coverage and lit weight. The specular bloom term is off on every material.
    float fxCoverage = opacity * mix(mainAlpha, 1.0 - mainAlpha, pgrMainAlphaMask);
    float noShadowAdd = pgrNoShadowBloomAdd * (1.0 - clamp(firstWeight, 0.0, 1.0));
    float fxWeight = fxCoverage * (1.0 + noShadowAdd) * pgrBloomWeights.x
      + mix(pgrBloomWeights.x, pgrBloomWeights.y, maskSample.a);
    #ifdef PGR_FX_BLEND
      float fxLitAlpha = fxCoverage * (1.0 + noShadowAdd);
    #else
      float fxLitAlpha = fxWeight;
    #endif
    vec4 fxResult = pgrEffectCharacter(outgoingLight, fxCoverage, fxLitAlpha, N, V);
    outgoingLight = fxResult.rgb;
    bloomWeight = fxResult.a;
    // Opaque color replaces the pixel through the over blend.
    #ifdef PGR_FX_BLEND
      diffuseColor.a = fxResult.a;
    #else
      diffuseColor.a = 1.0;
    #endif
  #endif

  #include <opaque_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;function oh(e,t,n){if(e===0)return`uv`;let r=`uv${e}`;return t.has(r)?(n[`USE_UV${e}`]=``,r):null}function sh(e,t,n){let r=e.emission,i=r?.flow&&t.flow?r.flow:null,a=r&&(r.flow===null||i)?r:null;return{faceShadow:e.faceShadow&&t.mask!==null,matcapInputs:t.matcap?e.matcap:null,emitting:a,flowing:i,flowCurve:i?e.emissionFlow:null,effect:e.effect?n.effect:null}}function ch(e,t,n,r){let{pbr:i,zones:a}=e,{emitting:o,flowing:s}=n,c={};e.maskUv===1&&(c.USE_UV1=``),i&&(c[i.mode===`mask`?`PGR_PBR`:`PGR_SIMPLE_PBR`]=``),n.matcapInputs&&(c.PGR_MATCAP=``),a?.skin&&(c.PGR_ZONE_SKIN=``),a?.shadow&&(c.PGR_ZONE_SHADOW=``),o&&(c.PGR_EMISSION=``),o&&s&&(c.PGR_EMISSION_FLOW=``),o?.zones&&(c.PGR_EMISSION_ZONES=``),e.blended&&(c.PGR_BLENDED=``);let l=t.detail&&e.detail?oh(e.detail.texCoord,r,c):null,u=t.faceMap&&e.faceMap?oh(e.faceMap.texCoord,r,c):null;return l&&(c.PGR_DETAIL=``,c.PGR_DETAIL_UV=l),u&&(c.PGR_FACE_MAP=``,c.PGR_FACE_UV=u),r.has(`_pgrcolor`)&&(e.skinVertexColor&&(c.PGR_SKIN_VERTEX_COLOR=``),e.vertexColor&&(c.PGR_VERTEX_COLOR=``)),a&&r.has(`_pgrzone`)&&(c.PGR_ZONES=``),n.effect&&e.effect&&Object.assign(c,n.effect.defines,{PGR_EFFECT_CHARACTER:``}),{defines:c,detailUv:l,faceUv:u}}var lh=1e-4;function uh(e,t,n,r,i,a){let{mask:o,skinRamp:s}=n,{specular:c,rim:l}=t;return{pgrLightDir:r.lightDir,pgrLightColor:{value:ff(t.lightColor)},pgrAmbient:{value:ff(t.ambientColor)},pgrGlobalTint:{value:ff(t.globalTint)},pgrNoShadow:{value:ff(t.noShadow)},pgrOneShadow:{value:ff(t.oneShadow)},pgrTwoShadow:{value:ff(t.twoShadow)},pgrShadowIntensity:{value:t.shadowIntensity},pgrFirst:{value:t.firstShadow},pgrSecond:{value:t.secondShadow},pgrSmooth:{value:Math.max(t.smoothFactor,lh)},pgrSmoothOn:{value:+!!t.smoothShadow},pgrMask:{value:o??e.map},pgrHasMask:{value:+!!o},pgrMaskUvSet:{value:t.maskUv},pgrMaskScale:{value:new H(...t.maskScale)},pgrMaskOffset:{value:new H(...t.maskOffset)},pgrMainAlphaMask:{value:t.mainAlphaForShadowMask},pgrFaceShadow:{value:+!!i.faceShadow},pgrFaceUp:{value:t.faceUp},pgrObjectY:a.y,pgrObjectZ:a.z,pgrSkinRamp:{value:s??e.map},pgrSkinRate:{value:s?t.skinRate:0},pgrSkinIntensity:{value:t.skinIntensity},pgrSkinColor:{value:ff(t.skinColor)},pgrSpecularColor:{value:ff(c.color)},pgrSpecularIntensity:{value:c.intensity},pgrSpecularShininess:{value:c.shininess},pgrSpecularSmooth:{value:Math.max(c.smoothFactor,lh)},pgrSpecularInvert:{value:c.invert},pgrSpecularAttenuation:{value:+!!c.attenuation},pgrSpecularAttenuationPow:{value:c.attenuationPow},pgrSpecularAttenuationSmoothness:{value:Math.max(c.attenuationSmoothness,lh)},pgrSpecularShadowOn:{value:c.shadowIntensity===null?0:1},pgrSpecularShadowIntensity:{value:c.shadowIntensity??1},pgrRimDir:r.rimDirection,pgrRimOn:{value:+!!l},pgrRimColor:{value:ff(l?.color??[0,0,0])},pgrRimIntensity:{value:l?.intensity??0},pgrRimMin:{value:l?.min??0},pgrRimMax:{value:l?.max??1},pgrRimThreshold:{value:l?.threshold??0}}}function dh(e,t){let n=e.zones,r={};return n?.skin&&Object.assign(r,{pgrZoneSkinColors:{value:n.skin.colors.map(ff)},pgrZoneSkinRates:{value:new In(...n.skin.rates)},pgrZoneSkinIntensities:{value:new In(...n.skin.intensities)},pgrSkinOn:{value:t&&e.skinOn?1:0}}),n?.shadow&&Object.assign(r,{pgrZoneNoShadow:{value:n.shadow.noShadow.map(ff)},pgrZoneOneShadow:{value:n.shadow.oneShadow.map(ff)},pgrZoneTwoShadow:{value:n.shadow.twoShadow.map(ff)}}),r}function fh(e,t,n){let{emitting:r,flowing:i,flowCurve:a}=e;if(!r)return{};let o={pgrEmissionColor:{value:ff(r.color)},pgrEmissionIntensity:{value:r.intensity}};return i&&n&&Object.assign(o,{pgrFlow:{value:t},pgrFlowScale:{value:new H(...a?Ol(a):i.scale)},pgrFlowOffset:n}),r.zones&&Object.assign(o,{pgrEmissionZoneColors:{value:r.zones.colors.map(ff)},pgrEmissionZoneIntensities:{value:new In(...r.zones.intensities)}}),o}function ph(e,t){return{pgrMatcap:{value:t},pgrMatcapYScale:{value:e.yScale},pgrMatcapMask:{value:e.mask},pgrMatcapShadowStrength:{value:e.shadowStrength},pgrMatcapAlpha:{value:+!!e.alpha},pgrMatcapAlphaUseMask:{value:+!!e.alphaUseMask}}}function mh(e,t,n){let{pbrMask:r,cubemap:i}=n;return{...jp(i??Mm(),t.cubemapYaw),pgrPbrMask:{value:r??e.map},pgrPbrHasMask:{value:+!!r},pgrPbrMaskScale:{value:new H(...t.maskScale)},pgrPbrMaskOffset:{value:new H(...t.maskOffset)},pgrMetallic:{value:t.metallic},pgrRoughness:{value:t.roughness},pgrMetallicScale:{value:t.metallicScale},pgrRoughnessScale:{value:t.roughnessScale},pgrAoScale:{value:t.aoScale},pgrPbrRate:{value:t.rate},pgrPbrSpecularColor:{value:ff(t.specularColor)},pgrPbrSpecularIntensity:{value:t.specularIntensity},pgrDirectLightColor:{value:ff(t.directLightColor)},pgrIndirectLightColor:{value:ff(t.indirectLightColor)},pgrIndirectLightIntensity:{value:t.indirectLightIntensity},pgrCubemapColor:{value:ff(t.cubemapColor)},pgrCubemapIntensity:{value:t.cubemapIntensity}}}function hh(e,t,n,r){let{matcap:i,flow:a,detail:o,faceMap:s}=n,c=e.clone();Zl(c,r.render);let l=Ql(r.render);c.color.setRGB(...t.albedo.color),c.opacity=t.albedo.alpha,i&&(i.wrapS=Qt,i.wrapT=Qt,i.needsUpdate=!0);let u=sh(t,n,r),{flowing:d,flowCurve:f,effect:p,matcapInputs:m}=u,h={y:{value:new U(0,1,0)},z:{value:new U(0,0,1)}},g=d?{value:new H(...f?Al(f,0):d.offset)}:null,{defines:_,detailUv:v,faceUv:y}=ch(t,n,u,r.attributes),b=v?t.detail:null,x=y?{value:s}:null;c.defines=_,t.effect&&th(c,t.effect);let S=l?`pgr-cel-keep-weight`:`pgr-cel`;return c.customProgramCacheKey=()=>S,c.onBeforeCompile=s=>{Object.assign(s.uniforms,uh(e,t,n,r,u,h)),Object.assign(s.uniforms,dh(t,n.skinRamp)),b&&Object.assign(s.uniforms,{pgrDetail:{value:o},pgrDetailScale:{value:new H(...b.scale)},pgrDetailOffset:{value:new H(...b.offset)}}),x&&(s.uniforms.pgrFaceMap=x),Object.assign(s.uniforms,fh(u,a,g)),m&&Object.assign(s.uniforms,ph(m,i)),t.pbr&&Object.assign(s.uniforms,mh(e,t.pbr,n)),p&&(Object.assign(s.uniforms,p.uniforms),s.uniforms.pgrNoShadowBloomAdd={value:t.bloom.noShadowAdd}),s.uniforms.pgrBloomWeights={value:new H(t.bloom.factor,t.bloom.emissionFactor)},c.userData.pgrUniforms=s.uniforms,s.vertexShader=ih,s.fragmentShader=xs(ah,`bloomWeight`,l?`0.0`:`diffuseColor.a`)},{material:c,family:t.effect?`effectCharacter`:`character`,objectAxes:u.faceShadow?h:null,flow:f?.useAnimation&&g?{flow:f,offset:g}:null,depth:null,faceMap:x,furShell:null}}function gh(e,t){let n=Ef(e.shader),r=t.scene;return{...Ap(n,n.keyword(`_MASK`)?n.texture(`_MaskMap`):null,e.shader.cubemap??null,t.modelYaw),bloomFactor:n.float(`_BloomFactor`),lightColor:df(r.lightColor,r.lightIntensity),ambientColor:df(r.dynamicAmbientColor,r.dynamicAmbientIntensity),lightSpecularColor:df(r.specularColor,r.specularIntensity),color:n.linearColor(`_Color`),alpha:n.color(`_Color`)[3],specularColor:df(n.linearColor(`_SpecularColor`),n.float(`_SpecularIntensity`)),customCubemap:n.keyword(`_CUSTOM_CUBETEX`),emissionColor:df(n.linearColor(`_EmissionColor`),n.float(`_EmissionIntensity`))}}var _h=`
${ps}
#include <uv_pars_vertex>
#include <normal_pars_vertex>
#include <shadowmap_pars_vertex>

#ifdef PGR_PBR
  uniform vec2 pgrPbrMaskScale;
  uniform vec2 pgrPbrMaskOffset;
  varying vec2 vPgrPbrMaskUv;
#endif

varying vec3 vViewPosition;

void main() {
  #include <uv_vertex>

  #ifdef PGR_PBR
    vPgrPbrMaskUv = uv * pgrPbrMaskScale + pgrPbrMaskOffset;
  #endif

${ms}
  #include <defaultnormal_vertex>
  #include <normal_vertex>

${hs}
  #include <project_vertex>
  #include <worldpos_vertex>
  #include <shadowmap_vertex>

  vViewPosition = -mvPosition.xyz;
}
`,vh=`
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphatest_pars_fragment>
#include <normal_pars_fragment>
#include <normalmap_pars_fragment>
#include <shadowmap_pars_fragment>
${vs}
${kp}

uniform vec3 diffuse;
uniform float opacity;

uniform float pgrBloomFactor;
uniform vec3 pgrLightDir, pgrLightColor, pgrAmbient, pgrLightSpecularColor;
uniform vec3 pgrSpecularColor, pgrCubemapColor, pgrEmissionColor;
uniform float pgrMetallic, pgrRoughness, pgrMetallicScale, pgrRoughnessScale, pgrAoScale, pgrCubemapIntensity;

#ifdef PGR_PBR
  uniform sampler2D pgrPbrMask;
  varying vec2 vPgrPbrMaskUv;
#endif

varying vec3 vViewPosition;

void main() {
  vec4 diffuseColor = vec4(diffuse, opacity);
  #include <map_fragment>
  #include <alphatest_fragment>
  #include <normal_fragment_begin>
  #include <normal_fragment_maps>

  vec3 N = normalize(normal);
  vec3 V = normalize(vViewPosition);
  vec3 L = normalize(mat3(viewMatrix) * pgrLightDir);
  float NoV = clamp(dot(N, V), 0.0, 1.0);
  float NoH = clamp(dot(N, normalize(V + L)), 0.0, 1.0);

  #ifdef PGR_PBR
    vec4 mask = texture2D(pgrPbrMask, vPgrPbrMaskUv);
    PgrPbrSurface surface = pgrPbrSurface(mask, pgrRoughnessScale, pgrMetallicScale, pgrAoScale);
    float emissionMask = mask.a;
  #else
    PgrPbrSurface surface = PgrPbrSurface(pgrRoughness, pgrMetallic, 1.0);
    float emissionMask = 0.0;
  #endif
  float rough = surface.rough;
  float ao = surface.ao;

  vec3 albedo = diffuseColor.rgb;
  vec3 diffuseTerm = albedo * (1.0 - 0.96 * surface.metallic);
  vec3 f0Env = pgrEnvBrdf(pgrPbrF0(albedo, surface.metallic, pgrSpecularColor), rough, NoV);
  vec3 ggx = pgrGgxD(rough, NoH) * f0Env;
  #ifdef PGR_CUBEMAP
    vec3 envSpec = f0Env * pgrCubemapSample(N, V, rough) * pgrLightSpecularColor * pgrCubemapColor * pgrCubemapIntensity;
  #else
    vec3 envSpec = vec3(0.0);
  #endif

  float lit = 1.0;
  #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
    lit = PGR_DIR_SHADOW(0);
  #endif
  float NoL = clamp(dot(N, L), 0.0, 1.0) * lit;

  vec3 outgoingLight = diffuseTerm * (pgrLightColor * NoL + ao * pgrAmbient)
    + ggx * pgrLightColor * NoL
    + ao * envSpec
    + albedo * pgrEmissionColor * emissionMask;

  #include <opaque_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;function yh(e,t,n,r,i){let{mask:a,cubemap:o}=n,s=e.clone();Zl(s,i),s.color.setRGB(...t.color),s.opacity=t.alpha;let c={};return a&&(c.PGR_PBR=``),o&&(c.PGR_CUBEMAP=``),s.defines=c,s.customProgramCacheKey=()=>`pgr-scene-pbr`,s.onBeforeCompile=n=>{Object.assign(n.uniforms,{pgrLightDir:r,pgrBloomFactor:{value:t.bloomFactor},pgrLightColor:{value:ff(t.lightColor)},pgrAmbient:{value:ff(t.ambientColor)},pgrLightSpecularColor:{value:ff(t.lightSpecularColor)},pgrPbrMask:{value:a??e.map},pgrPbrMaskScale:{value:new H(...t.maskScale)},pgrPbrMaskOffset:{value:new H(...t.maskOffset)},pgrMetallic:{value:t.metallic},pgrRoughness:{value:t.roughness},pgrMetallicScale:{value:t.metallicScale},pgrRoughnessScale:{value:t.roughnessScale},pgrAoScale:{value:t.aoScale},pgrSpecularColor:{value:ff(t.specularColor)},...jp(o,t.cubemapYaw),pgrCubemapColor:{value:ff(t.cubemapColor)},pgrCubemapIntensity:{value:t.cubemapIntensity},pgrEmissionColor:{value:ff(t.emissionColor)}}),n.vertexShader=_h,n.fragmentShader=xs(vh,`pgrBloomFactor`,`diffuseColor.a`)},{material:s,family:`scenePbr`,objectAxes:null,flow:null,depth:null,faceMap:null,furShell:null}}var bh={main:`_MainTex`,second:`_SecondTex`,mask:`_MaskTex`,flow:`_FlowTex`,dissolution:`_DissolutionTex`,vertexOffset:`_VertexOffset_Tex`},xh={_ADDITIVE_ON:`PGR_ADDITIVE`,_MAINTEX_DISABLE:`PGR_MAINTEX_DISABLE`,_SECOND_TEX:`PGR_SECOND_TEX`,_FLOWMAP:`PGR_FLOWMAP`,_DISSOLUTION:`PGR_DISSOLUTION`,_DISSOLUTION_COLOR_OFFSET:`PGR_DISSOLUTION_COLOR_OFFSET`,_USE_UV_INTENSITY_MASK:`PGR_UV_INTENSITY_MASK`,_RIM_LERP:`PGR_RIM_LERP`,_RIM_LERP_WITH_ALPHA:`PGR_RIM_LERP_WITH_ALPHA`,_VERTEX_ALPHA_OFF:`PGR_VERTEX_ALPHA_OFF`,_VERTEX_RGB_OFF:`PGR_VERTEX_RGB_OFF`,_MAINTEX_SCREEN_UV:`PGR_MAINTEX_SCREEN_UV`,_VERTEX_OFFSET:`PGR_VERTEX_OFFSET`,_PARALLAX:`PGR_PARALLAX`},Sh=`_EffectBrightness._EffectBrightnessR._EffectBrightnessG._EffectBrightnessB._CustomAlpha._FlowIntensity.IF_MainTexFlowMap.IF_MaskFlowMapKeyword.IF_DissolutionFlowMap._DissolutionThreshold._DissolutionSoftness._DissolutionColorOffset._DissolutionColorIntensity._UVIntensityMaskStepMiddle._UVIntensityMaskStepSoft._UVIntensityMaskLinear._UVIntensityMaskApplyDissolveInvert._UVIntensityMaskApplyDissolve._UVIntensityMaskApplyDissolveUseLerp._UVIntensityMaskApplyDissolveLerpValue._RimRange._RimUseAdvance._RimInverse._RimSharpness._ZOffset._ParallaxScale._ParallaxZOffset._VertexOffset_Speed_R._VertexOffset_Speed_G._VertexOffset_Strength_R._VertexOffset_Strength_G._VertexOffset_AlphaMask._VertexOffset_UseVertexColor`.split(`.`),Ch=[`_MainTexColor`,`_TintColor`,`_SecondColor`,`_RimColor`,`_DissolutionColor`,`_DissolutionColorStart`],wh=[`_MainTexRemap`,`_MainTexAlphaSelectorParams`,`_FlowSpeed`,`_FlowIntensityToMultiMap`,`_MainRotationParams`,`_SecondRotationParams`,`_MaskRotationParams`,`_DissolutionRotationParams`,`_UVIntensityMaskApplyDissolveParam`];function Th(e){let t=Ef(e.shader),n=jf(t,{slots:bh,keywords:xh,floats:Sh,colors:Ch,vectors:wh}),{defines:r}=n;return(t.keyword(`_MASKUV0`)||t.keyword(`_MASKUV1`))&&(r.PGR_MASK=``),{...n,render:e.render,animated:`PGR_FLOWMAP`in r||`PGR_VERTEX_OFFSET`in r}}var Eh=`
${ps}

#ifdef PGR_VERTEX_COLOR
  attribute vec4 _pgrcolor;
#endif

uniform float pgrTime, pgrZOffset, pgrNearScale;
// x: scale, y: z offset.
uniform vec2 pgrParallax;
uniform vec4 pgrMainST, pgrMaskST, pgrMaskRot, pgrDissST, pgrDissRot, pgrFlowST, pgrFlowSpeed;
uniform sampler2D pgrVertexOffset;
uniform vec4 pgrVoST, pgrVoParams, pgrVoShape;

varying vec4 vPgrColor;
varying vec2 vPgrUv0, vPgrMaskUv, vPgrDissUv, vPgrScreenUv;
varying vec4 vPgrFlowUv;
varying vec3 vPgrNormal, vPgrViewPos;
${_s}

void main() {
${gs}

  vec4 color = vec4(1.0);
  #ifdef PGR_VERTEX_COLOR
    color = _pgrcolor;
  #endif
  vec2 uv0 = pgrGame(uv);

  #ifdef PGR_VERTEX_OFFSET
    #ifdef PGR_NO_VERTEX_OFFSET_MAP
      float amount = pgrVoParams.z + pgrVoParams.w;
    #else
      float amount = pgrVertexOffsetAmount(pgrVertexOffset, uv0, pgrVoST, pgrVoParams, pgrTime);
    #endif
    // x: alpha mask, y: use vertex color as the direction.
    amount *= mix(1.0, color.a, pgrVoShape.x);
    // Vertex colors are authored in Unity's space, which has Z mirrored.
    vec3 direction = pgrVoShape.y > 0.5 ? (color.rgb * 2.0 - 1.0) * vec3(1.0, 1.0, -1.0) : objectNormal;
    transformed += amount * direction;
  #endif

  #if defined(PGR_PARALLAX) && defined(USE_TANGENT)
    vec3 view = transformed - (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
    // The exporter's Z flip negates the rebuilt bitangent against Unity's.
    vec3 bitangent = cross(objectNormal, objectTangent) * tangent.w;
    vec2 shift = vec2(dot(view, objectTangent), -dot(view, bitangent)) / (dot(view, objectNormal) + pgrParallax.y);
    uv0 -= shift * pgrParallax.x;
  #endif

  vPgrColor = color;
  vPgrUv0 = uv0;

  #ifdef PGR_MASK
    #if defined(PGR_MASK_UV2)
      vec2 maskUv = pgrGame(uv2);
    #elif defined(PGR_MASK_UV1)
      vec2 maskUv = pgrGame(uv1);
    #else
      vec2 maskUv = uv0;
    #endif
    vPgrMaskUv = pgrRot(maskUv * pgrMaskST.xy + pgrMaskST.zw, pgrMaskRot);
  #endif
  #ifdef PGR_DISSOLUTION
    vPgrDissUv = pgrRot(uv0 * pgrDissST.xy + pgrDissST.zw, pgrDissRot);
  #endif
  #ifdef PGR_FLOWMAP
    vPgrFlowUv = pgrFlowUv(uv0, pgrFlowST, pgrFlowSpeed, pgrTime);
  #endif

  vPgrNormal = normalMatrix * objectNormal;
  #include <project_vertex>
  vPgrViewPos = mvPosition.xyz;

  #ifdef PGR_MAINTEX_SCREEN_UV
    // The game offsets from the pivot in clip space without dividing by w. View-space xy
    // keeps the pattern at the same density across canvas sizes.
    vec4 pivot = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vPgrScreenUv = (mvPosition.xy - pivot.xy) * PGR_SCREEN_SCALE * pgrMainST.xy + pgrMainST.zw;
  #endif

  // Match the game's near plane when applying the clip-space depth offset. Reversed depth runs
  // the other way over half the range.
  #ifdef USE_REVERSED_DEPTH_BUFFER
    gl_Position.z += pgrZOffset * 0.0005 * pgrNearScale;
  #else
    gl_Position.z -= pgrZOffset * 0.001 * pgrNearScale;
  #endif
}
`,Dh=`
uniform sampler2D pgrMain, pgrSecond, pgrMask, pgrFlow, pgrDiss;
uniform vec4 pgrMainST, pgrMainRot, pgrSecondST, pgrSecondRot;
uniform vec4 pgrMainColor, pgrTint, pgrSecondColor, pgrRimColor, pgrDissColor, pgrDissColorStart;
uniform vec4 pgrRemap, pgrAlphaSelector, pgrFlowMulti, pgrBrightness;
// x: intensity. Y, z, w: the main, mask and dissolve IF_* multipliers.
uniform vec4 pgrFlowParams;
// x: threshold, y: softness, z: color offset, w: color intensity.
uniform vec4 pgrDissParams;
// x: step middle, y: step soft, z: linear, w: apply.
uniform vec4 pgrUvMaskParams;
// x: invert, y: use lerp, z: lerp value.
uniform vec4 pgrUvMaskApply;
uniform vec4 pgrUvMaskWeights;
// x: range, y: use advance, z: inverse, w: sharpness.
uniform vec4 pgrRimParams;
uniform float pgrCustomAlpha;

varying vec4 vPgrColor;
varying vec2 vPgrUv0, vPgrMaskUv, vPgrDissUv, vPgrScreenUv;
varying vec4 vPgrFlowUv;
varying vec3 vPgrNormal, vPgrViewPos;
${_s}

void main() {
  vec2 flow = vec2(0.0);
  #if defined(PGR_FLOWMAP) && !defined(PGR_NO_FLOW_MAP)
    flow = pgrFlowSample(pgrFlow, vPgrFlowUv, pgrFlowParams.x);
  #endif

  // Mask and dissolve coverage first, before any color sampling. The alpha factors further down
  // follow the game's order.
  float gate = 1.0;
  #if !defined(PGR_VERTEX_ALPHA_OFF) && !defined(PGR_DISSOLUTION)
    gate *= vPgrColor.a;
  #endif
  #if defined(PGR_MASK) && !defined(PGR_NO_MASK_MAP)
    float maskAlpha = pgrFetch(pgrMask, vPgrMaskUv + flow * pgrFlowParams.z * pgrFlowMulti.z).r;
    gate *= maskAlpha;
  #endif
  #ifdef PGR_DISSOLUTION
    #ifdef PGR_VERTEX_ALPHA_OFF
      float threshold = pgrDissParams.x;
    #else
      float threshold = vPgrColor.a;
    #endif
    #ifdef PGR_NO_DISS_MAP
      float noise = 1.0;
    #else
      float noise = pgrFetch(pgrDiss, vPgrDissUv + flow * pgrFlowParams.w * pgrFlowMulti.w).r;
    #endif
    #ifdef PGR_UV_INTENSITY_MASK
      vec4 gradient = vec4(vPgrUv0, 1.0 - vPgrUv0);
      vec4 stepped = clamp((gradient - (pgrUvMaskParams.x - pgrUvMaskParams.y)) / (2.0 * pgrUvMaskParams.y), 0.0, 1.0);
      stepped = stepped * stepped * (3.0 - 2.0 * stepped);
      float uvMask = dot(pgrUvMaskWeights, mix(stepped, gradient, pgrUvMaskParams.z));
      uvMask = clamp(pgrUvMaskApply.x != 0.0 ? 1.0 - uvMask : uvMask, 0.0, 1.0);
      float masked = pgrUvMaskApply.y != 0.0 ? mix(noise, uvMask, pgrUvMaskApply.z) : uvMask * noise;
      noise = pgrUvMaskParams.w > 0.0 ? masked : noise;
    #endif
    float soft = max(pgrDissParams.y, 1e-4);
    float dissolved = pgrSoftStep(threshold, soft, noise);
    #ifdef PGR_DISSOLUTION_COLOR_OFFSET
      float colorThreshold = (threshold - pgrDissParams.z) / (1.0 - pgrDissParams.z);
      float tinted = pgrSoftStep(colorThreshold, soft, noise);
    #endif
    gate *= 1.0 - dissolved;
  #endif
  // Zero coverage leaves both attachments alone. Rim alpha can bring coverage back, and
  // depth-writing fragments still have to run.
  #if !defined(PGR_OPAQUE) && !defined(PGR_DEPTH_WRITE) && !defined(PGR_RIM_LERP_WITH_ALPHA)
    if (gate <= 0.0) discard;
  #endif

  #ifdef PGR_MAINTEX_DISABLE
    vec4 c = vec4(1.0);
  #else
    #ifdef PGR_MAINTEX_SCREEN_UV
      vec2 mainUv = vPgrScreenUv;
    #else
      vec2 mainUv = vPgrUv0 * pgrMainST.xy + pgrMainST.zw;
    #endif
    mainUv = pgrRot(mainUv + flow * pgrFlowParams.y * pgrFlowMulti.x, pgrMainRot);
    #ifdef PGR_NO_MAIN_MAP
      vec4 m = vec4(1.0);
    #else
      vec4 m = pgrFetch(pgrMain, mainUv);
    #endif
    vec3 rgb = m.rgb;
    if (pgrRemap.z > 0.0) {
      vec3 remapped = min(exp2(log2(m.rgb * pgrRemap.y) * pgrRemap.x), 1.0);
      rgb = mix(m.rgb, remapped, pgrRemap.z);
    }
    vec4 c = vec4(rgb, clamp(dot(vec4(rgb, m.a), pgrAlphaSelector), 0.0, 1.0)) * pgrMainColor;
    #ifdef PGR_SECOND_TEX
      vec2 secondUv = pgrRot(vPgrUv0 * pgrSecondST.xy + pgrSecondST.zw + flow * pgrFlowMulti.y, pgrSecondRot);
      #ifdef PGR_NO_SECOND_MAP
        vec4 second = vec4(1.0);
      #else
        vec4 second = pgrFetch(pgrSecond, secondUv);
      #endif
      #ifdef PGR_ADDITIVE
        // Additive programs sum premultiplied layers.
        vec4 layer = second * pgrSecondColor;
        c = vec4(c.rgb * c.a + layer.rgb * layer.a, min(c.a + layer.a, 1.0));
      #else
        c = mix(c, second * pgrSecondColor, second.a * pgrSecondColor.a);
      #endif
    #endif
  #endif
  c *= pgrTint;

  vec3 color = c.rgb * pgrBrightness.x;
  #ifndef PGR_VERTEX_RGB_OFF
    color *= vPgrColor.rgb;
  #endif
  float alpha = c.a;
  // Vertex alpha sets the dissolve threshold, or opacity when dissolve is off.
  #if !defined(PGR_VERTEX_ALPHA_OFF) && !defined(PGR_DISSOLUTION)
    alpha *= vPgrColor.a;
  #endif

  #if defined(PGR_MASK) && !defined(PGR_NO_MASK_MAP)
    alpha *= maskAlpha;
  #endif

  #if defined(PGR_RIM_LERP) || defined(PGR_RIM_LERP_WITH_ALPHA)
    float facing = dot(normalize(-vPgrViewPos), normalize(vPgrNormal));
    float rim;
    if (pgrRimParams.y != 0.0) {
      float edge = max(1.0 - abs(facing), 0.0);
      if (pgrRimParams.z != 0.0) edge = 1.0 - edge;
      rim = pgrSoftStep(pgrRimParams.x, clamp(1.0 - pgrRimParams.w, 0.0, 1.0), edge);
    } else {
      rim = pgrRimFalloff(facing, pgrRimParams.x);
    }
    color = mix(color, pgrRimColor.rgb * pgrBrightness.x, rim);
    #ifdef PGR_RIM_LERP_WITH_ALPHA
      alpha = mix(alpha, pgrRimColor.a, rim);
    #endif
  #endif

  #ifdef PGR_DISSOLUTION
    #ifdef PGR_DISSOLUTION_COLOR_OFFSET
      vec3 edgeStart = mix(color, pgrDissColorStart.rgb, pgrDissColorStart.a);
      vec3 edgeEnd = mix(color, pgrDissColor.rgb, pgrDissColor.a);
      color = mix(color, mix(edgeStart, edgeEnd, tinted) * pgrBrightness.x * pgrDissParams.w, tinted);
    #else
      color = mix(color, mix(color, pgrDissColor.rgb * pgrBrightness.x, pgrDissColor.a), dissolved);
    #endif
    alpha *= 1.0 - dissolved;
  #endif

  // 1.871 is baked into every FX program. Don't ask.
  float outAlpha = clamp(clamp(alpha * 1.871, 0.0, 1.0) * pgrCustomAlpha, 0.0, 1.0);
  // Zero alpha leaves both attachments alone, unless the pass writes depth.
  #if !defined(PGR_OPAQUE) && !defined(PGR_DEPTH_WRITE)
    if (outAlpha <= 0.0) discard;
  #endif
  vec3 outColor = min(max(color * pgrBrightness.yzw, 0.0), vec3(500.0));

  #ifdef PGR_OPAQUE
    gl_FragColor = vec4(outColor, 1.0);
  #else
    gl_FragColor = vec4(outColor, outAlpha);
  #endif
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`,Oh=.1,kh=20,Ah=[3412,1919],jh=1/Math.tan(kh/2*Math.PI/180),Mh=[jh*Ah[1]/Ah[0]/Ah[0],jh/Ah[1]];function Nh(e,t,n){let{bindings:r}=e,i={...e.defines};n.attributes.has(`_pgrcolor`)&&(i.PGR_VERTEX_COLOR=``),i.PGR_SCREEN_SCALE=`vec2(${Mh[0].toExponential(8)}, ${Mh[1].toExponential(8)})`;let a=r.mask?.texCoord??0;`PGR_MASK`in i&&a===1&&n.attributes.has(`uv1`)&&(i.PGR_MASK_UV1=``,i.USE_UV1=``),`PGR_PARALLAX`in i&&n.attributes.has(`tangent`)&&(i.USE_TANGENT=``),e.render.depthWrite&&(i.PGR_DEPTH_WRITE=``),`PGR_MASK`in i&&a===2&&n.attributes.has(`uv2`)&&(i.PGR_MASK_UV2=``,i.USE_UV2=``);for(let[e,n]of[[`main`,`PGR_NO_MAIN_MAP`],[`second`,`PGR_NO_SECOND_MAP`],[`mask`,`PGR_NO_MASK_MAP`],[`flow`,`PGR_NO_FLOW_MAP`],[`dissolution`,`PGR_NO_DISS_MAP`],[`vertexOffset`,`PGR_NO_VERTEX_OFFSET_MAP`]])t[e]||(i[n]=``);return e.render.blend||(i.PGR_OPAQUE=``),i}function Ph(e,t,n){let{floats:r,colors:i,bindings:a}=e;return{pgrMain:{value:t.main},pgrSecond:{value:t.second},pgrMask:{value:t.mask},pgrFlow:{value:t.flow},pgrDiss:{value:t.dissolution},pgrVertexOffset:{value:t.vertexOffset},pgrMainST:{value:kf(a.main)},pgrSecondST:{value:kf(a.second)},pgrMaskST:{value:kf(a.mask)},pgrFlowST:{value:kf(a.flow)},pgrDissST:{value:kf(a.dissolution)},pgrVoST:{value:kf(a.vertexOffset)},pgrMainRot:{value:Af(i._MainRotationParams)},pgrSecondRot:{value:Af(i._SecondRotationParams)},pgrMaskRot:{value:Af(i._MaskRotationParams)},pgrDissRot:{value:Af(i._DissolutionRotationParams)},pgrMainColor:{value:Af(i._MainTexColor)},pgrTint:{value:Af(i._TintColor)},pgrSecondColor:{value:Af(i._SecondColor)},pgrRimColor:{value:Af(i._RimColor)},pgrDissColor:{value:Af(i._DissolutionColor)},pgrDissColorStart:{value:Af(i._DissolutionColorStart)},pgrRemap:{value:Af(i._MainTexRemap)},pgrAlphaSelector:{value:Af(i._MainTexAlphaSelectorParams)},pgrFlowSpeed:{value:Af(i._FlowSpeed)},pgrFlowMulti:{value:Af(i._FlowIntensityToMultiMap)},pgrUvMaskWeights:{value:Af(i._UVIntensityMaskApplyDissolveParam)},pgrBrightness:{value:new In(r._EffectBrightness,r._EffectBrightnessR,r._EffectBrightnessG,r._EffectBrightnessB)},pgrFlowParams:{value:new In(r._FlowIntensity,r.IF_MainTexFlowMap,r.IF_MaskFlowMapKeyword,r.IF_DissolutionFlowMap)},pgrDissParams:{value:new In(r._DissolutionThreshold,r._DissolutionSoftness,r._DissolutionColorOffset,r._DissolutionColorIntensity)},pgrUvMaskParams:{value:new In(r._UVIntensityMaskStepMiddle,r._UVIntensityMaskStepSoft,r._UVIntensityMaskLinear,r._UVIntensityMaskApplyDissolve)},pgrUvMaskApply:{value:new In(r._UVIntensityMaskApplyDissolveInvert,r._UVIntensityMaskApplyDissolveUseLerp,r._UVIntensityMaskApplyDissolveLerpValue,0)},pgrRimParams:{value:new In(r._RimRange,r._RimUseAdvance,r._RimInverse,r._RimSharpness)},pgrVoParams:{value:new In(r._VertexOffset_Speed_R,r._VertexOffset_Speed_G,r._VertexOffset_Strength_R,r._VertexOffset_Strength_G)},pgrVoShape:{value:new In(r._VertexOffset_AlphaMask,r._VertexOffset_UseVertexColor,0,0)},pgrCustomAlpha:{value:r._CustomAlpha},pgrZOffset:{value:r._ZOffset},pgrParallax:{value:new H(r._ParallaxScale,r._ParallaxZOffset)},pgrNearScale:{value:1},pgrTime:n}}function Fh(e,t,n){let{render:r}=e,i=new ke({name:`pgr-effect`,defines:Nh(e,t,n),vertexShader:Eh,fragmentShader:xs(Dh,`outAlpha`,$l(r,`outAlpha`)),uniforms:Ph(e,t,n.time)});return eu(i,r),i.userData.animated=e.animated,i.onBeforeRender=(e,t,n)=>{let r=n.near;i.uniforms.pgrNearScale.value=r?r/Oh:1},i}var Ih=[.05,.1,.15,.2,.25];function Lh(e,t){let n=Ef(e.shader),r=n.vector(`_Gravity`);return{furLength:n.float(`_FurLength`),cutoff:n.float(`_Cutoff`),cutoffStart:n.float(`_CutoffStart`),cutoffEnd:n.float(`_CutoffEnd`),edgeFade:n.float(`_EdgeFade`),gravity:Pu([r[0],r[1],r[2]],t.modelYaw),gravityStrength:n.float(`_GravityStrength`),shadow:n.float(`_Shadow`),bumpScale:n.float(`_BumpScale`),bloomFactor:n.float(`_BloomFactor`),main:n.texture(`_MainTex`),bump:n.texture(`_BumpMap`),layer:n.texture(`_LayerTex`),lightColor:df(t.lightColor,t.lightIntensity),ambientColor:t.ambientColor,noShadow:t.cloth.noShadow,oneShadow:Mp(n.linearColor(`_ShadowColor`),t.cloth.oneShadow),render:e.render}}var Rh=`
${ps}

uniform float pgrLayer, pgrFurLength, pgrGravityStrength;
uniform vec3 pgrGravity;

varying vec2 vPgrUv;
varying vec3 vPgrWorldPosition, vPgrNormal, vPgrTangent;
varying float vPgrTangentSign;

void main() {
${gs}

  vPgrUv = uv;
  vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
  vPgrWorldPosition = worldPosition.xyz;
  vPgrNormal = normalize(mat3(modelMatrix) * objectNormal);
  #ifdef USE_TANGENT
    vPgrTangent = mat3(modelMatrix) * objectTangent;
    vPgrTangentSign = tangent.w;
  #endif

  #ifdef PGR_FUR_SHELL
    // Shade at the surface point, before extrusion.
    vec3 direction = normalize(vPgrNormal + pgrLayer * pgrGravityStrength * (pgrGravity - vPgrNormal));
    worldPosition.xyz += direction * pgrFurLength * pgrLayer;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  #else
    #include <project_vertex>
  #endif
}
`,zh=`
uniform sampler2D pgrMain, pgrBump, pgrLayerTex;
uniform vec4 pgrBumpST, pgrLayerST;
uniform float pgrLayer, pgrCutoff, pgrCutoffStart, pgrCutoffEnd, pgrEdgeFade, pgrShadow, pgrBumpScale, pgrBloomFactor;
uniform vec3 pgrLightDir, pgrLightColor, pgrAmbient, pgrNoShadow, pgrOneShadow;

varying vec2 vPgrUv;
varying vec3 vPgrWorldPosition, vPgrNormal, vPgrTangent;
varying float vPgrTangentSign;

void main() {
  vec4 albedo = texture2D(pgrMain, vPgrUv);
  #ifdef PGR_FUR_SHELL
    if (albedo.a < pgrCutoff) discard;
  #endif

  vec3 normal = normalize(vPgrNormal);
  #ifdef USE_TANGENT
    vec2 bumpXy = (texture2D(pgrBump, vPgrUv * pgrBumpST.xy + pgrBumpST.zw).xy * 2.0 - 1.0) * pgrBumpScale;
    vec3 bump = vec3(bumpXy, sqrt(max(1.0 - dot(bumpXy, bumpXy), 0.0)));
    vec3 tangent = normalize(vPgrTangent - normal * dot(normal, vPgrTangent));
    vec3 bitangent = cross(normal, tangent) * vPgrTangentSign;
    normal = normalize(tangent * bump.x + bitangent * bump.y + normal * bump.z);
  #endif

  float halfLambert = dot(normal, normalize(pgrLightDir)) * 0.5 + 0.5;
  float shadowed = floor(1.0 - (pgrShadow * 1.1 + halfLambert - 1.0));
  vec3 rgb = mix(albedo.rgb * pgrNoShadow, albedo.rgb * pgrOneShadow, shadowed) * pgrLightColor * pgrAmbient;

  #ifdef PGR_FUR_SHELL
    vec3 view = normalize(cameraPosition - vPgrWorldPosition);
    float edge = max(clamp(dot(view, normal), 0.0, 1.0) - pgrEdgeFade + (1.0 - pgrLayer * pgrLayer), 0.0);
    float noise = texture2D(pgrLayerTex, vPgrUv * pgrLayerST.xy + pgrLayerST.zw).r;
    // Head-on alpha goes past 1. Leave it, the blend wants it raw.
    float alpha = noise >= mix(pgrCutoffStart, pgrCutoffEnd, pgrLayer) ? edge : 0.0;
    gl_FragColor = vec4(rgb, alpha);
  #else
    gl_FragColor = vec4(rgb, 1.0);
  #endif
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;function Bh(e,t,n,r,i){let a={};n.has(`tangent`)&&t.bump&&(a.USE_TANGENT=``),r!==null&&(a.PGR_FUR_SHELL=``);let o=new ke({name:r===null?`pgr-fur`:`pgr-fur-shell`,defines:a,vertexShader:Rh,fragmentShader:r===null?xs(zh,`pgrBloomFactor`,`1.0`):xs(zh,`0.0`,`0.0`),uniforms:{pgrMain:{value:t.main},pgrBump:{value:t.bump},pgrLayerTex:{value:t.layer},pgrBumpST:{value:Of(e.bump)},pgrLayerST:{value:Of(e.layer)},pgrLayer:{value:r??0},pgrFurLength:{value:e.furLength},pgrGravity:{value:new U(...e.gravity)},pgrGravityStrength:{value:e.gravityStrength},pgrCutoff:{value:e.cutoff},pgrCutoffStart:{value:e.cutoffStart},pgrCutoffEnd:{value:e.cutoffEnd},pgrEdgeFade:{value:e.edgeFade},pgrShadow:{value:e.shadow},pgrBumpScale:{value:e.bumpScale},pgrBloomFactor:{value:e.bloomFactor},pgrLightDir:i,pgrLightColor:{value:ff(e.lightColor)},pgrAmbient:{value:ff(e.ambientColor)},pgrNoShadow:{value:ff(e.noShadow)},pgrOneShadow:{value:ff(e.oneShadow)}},side:2,depthWrite:!0,depthTest:!0,depthFunc:3});return r===null?Zl(o,e.render):Yl(o,{src:`srcAlpha`,dst:`oneMinusSrcAlpha`}),o}function Vh(e,t){for(let n=t;n;n=n.parent)if(e.parser.associations.get(n)?.nodes!==void 0)return n;return null}function Hh(e,t){let n=e.get(t);return n instanceof en?n:null}async function Uh(e){return(await Promise.allSettled(e)).map(e=>{if(e.status===`rejected`)throw e.reason;return e.value})}async function Wh(e){let t=Object.keys(e),n=await Uh(t.map(t=>e[t]));return Object.fromEntries(t.map((e,t)=>[e,n[t]]))}function Gh(e,t){let n=e.parser.json,r=n=>Wo(async r=>{let i=await e.parser.getDependency(`texture`,r);if(!i)return null;let a=qu(i,n);return t.add(a),a}),i=r(`sRGB`),a=r(void 0);return(e,t)=>e===null?Promise.resolve(null):((t??n.textures?.[e]?.extras?.colorSpace)===`sRGB`?i:a).get(e)}function Kh(e){let t=new Map;for(let n of e)for(let e of nu(n)){let r=t.get(e)??new Set;Object.keys(n.geometry.attributes).forEach(e=>r.add(e)),t.set(e,r)}return t}function qh(e,t,n,r,i,a){return{lighting:n,shaded:new Map,attributes:Kh(t),cubemaps:i,flows:[],rimDirection:{value:new U(0,0,1)},time:{value:0},light:r,loadTexture:Gh(e,a.textures),created:a,unshaded:new Set}}function Jh(e,t,n){return e===null||!n?Promise.resolve(null):n.get(e).catch(e=>(console.warn(`Material ${t.name}: ${fs(e)}`),null))}function Yh(e,t){let n={};for(let r of Object.keys(e))n[r]=t(e[r]?.index??null);return Wh(n)}function Xh(e,t){return{material:e,family:t,objectAxes:null,flow:null,depth:null,faceMap:null,furShell:null}}async function Zh(e,t,n,r,i){let a=Wp(t,i.lighting,n),{loadTexture:o}=i,{effect:s,...c}=await Wh({mask:o(a.maskTexture),skinRamp:o(a.skinRampTexture),pbrMask:o(a.pbr?.maskTexture??null),matcap:o(a.matcap?.texture??null),flow:o(a.emission?.flow?.texture??null),detail:o(a.detail?.texture??null),faceMap:o(a.faceMap?.texture??null),cubemap:Jh(a.pbr?.cubemap??null,e,i.cubemaps),effect:a.effect?Yh(a.effect.bindings,o):Promise.resolve(null)}),l=a.effect&&s?eh(a.effect,s,{attributes:r,time:i.time}):null,u=hh(e,a,c,{attributes:r,rimDirection:i.rimDirection,time:i.time,lightDir:i.light.key,render:t.render,effect:l});return!a.effect||!l?u:{...u,depth:rh(a.effect,l)}}async function Qh(e,t,n){let r=gh(t,n.lighting),{mask:i,cubemap:a}=await Wh({mask:n.loadTexture(r.maskTexture),cubemap:r.customCubemap?Jh(r.cubemap,e,n.cubemaps):Promise.resolve(null)});return yh(e,r,{mask:i,cubemap:r.customCubemap?a??Mm():null},n.light.scene,t.render)}async function $h(e,t,n){let r=Th(e);return Xh(Fh(r,await Yh(r.bindings,n.loadTexture),{attributes:t,time:n.time}),`effect`)}async function eg(e,t,n){let r=Lh(e,n.lighting),i=await Wh({main:n.loadTexture(r.main?.index??null),bump:n.loadTexture(r.bump?.index??null),layer:n.loadTexture(r.layer?.index??null)}),a=e=>Bh(r,i,t,e,n.light.key);return{...Xh(a(null),`fur`),furShell:a}}async function tg(e,t,n){return Xh(nh(e,await Yh(e.bindings,n.loadTexture),{attributes:t,time:n.time}),`effectCharacter`)}function ng(e,t){let n=e.familyName??`null (${e.shader.base})`;t.has(n)||(t.add(n),console.warn(`No renderer for material family ${n}, drawing it plain`))}function rg(e,t,n,r){switch(t.family){case`character`:return Zh(e,t,null,n,r);case`effectCharacter`:{let i=Hm(t);return i.lit?Zh(e,t,i,n,r):tg(i,n,r)}case`scenePbr`:return Qh(e,t,r);case`effect`:return $h(t,n,r);case`fur`:return eg(t,n,r);default:return ng(t,r.unshaded),null}}async function ig(e,t,n){let r=Cf(e);if(!r||!(e instanceof _t))return null;let i=await rg(e,r,t,n);return i&&(n.shaded.set(i.material,i),n.created.materials.add(i.material),i.depth&&n.created.materials.add(i.depth),i.flow&&n.flows.push(i.flow)),i}function ag(e){let t=Cf(e);t&&Zl(e,t.render),e.onBeforeCompile=e=>{e.fragmentShader=xs(e.fragmentShader,`0.0`,`diffuseColor.a`)}}async function og(e){let t=new Map;return await Uh([...e.attributes].map(async([n,r])=>{let i=await ig(n,r,e);i?t.set(n,i):ag(n)})),t}async function sg(e,t,n,r,i){let a=await e.parser.getDependency(`material`,t);return{source:a,shaded:await ig(a,i.attributes.get(r)??new Set(Object.keys(n.geometry.attributes)),i)}}async function cg(e,t,n,r,i){let{source:a,shaded:o}=await sg(e,t,n,r,i);return o?(a.dispose(),o.material):(ag(a),i.created.materials.add(a),a)}function lg(e,t,n,r,i){let a=e.parser.json;for(let o of t){let t=i.sets.flatMap(e=>e.entries.flatMap(e=>e.mesh===o&&e.material?[e.material]:[])),s=[...nu(o),...t].map(e=>n.get(e)?.objectAxes).filter(e=>e!=null);if(s.length===0)continue;let c=Vh(e,o),l=c?e.parser.associations.get(c)?.nodes:void 0,u=l===void 0?void 0:a.nodes?.[l]?.skin,d=u===void 0?void 0:a.skins?.[u]?.skeleton,f=(d===void 0?null:r.get(d))??o;o.onBeforeRender=()=>{for(let{y:e,z:t}of s)e.value.setFromMatrixColumn(f.matrixWorld,1).normalize(),t.value.setFromMatrixColumn(f.matrixWorld,2).normalize()}}}function ug(e,t){let n=Ef(e.shader),r=n.keyword(`_MULTI_OUTLINE_COLOR`);return{vertexColor:r||n.keyword(`_OUTLINE_VERTEX_COLOR`),multiColor:r,width:n.float(`_XCharOutlineWidth`),distanceScale:n.float(`_XOutlineDitanceScale`),zMaxOffset:n.float(`_XOutlineZMaxOffset`),zOffset:n.float(`_XOutlineZOffset`),brightness:n.float(`_XOutlineBrightness`),bloom:n.float(`_OutlineBloom`),colors:[n.linearColor(`_OutlineColor`),n.linearColor(`_OutlineColor2`),n.linearColor(`_OutlineColor3`),n.linearColor(`_OutlineColor4`),n.linearColor(`_OutlineColor5`)],globalTint:t.outlineColor,render:e.render}}var dg=`
${ps}

uniform float pgrWidth, pgrDistanceScale, pgrZMaxOffset, pgrZOffset;
#ifdef PGR_SMOOTH_NORMAL
  attribute vec3 _pgrsmoothnormal;
#endif
#ifdef PGR_VERTEX_COLOR
  attribute vec4 _pgrcolor;
#endif
varying vec2 vPgrControl;

void main() {
${gs}

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
`,fg=`
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
`;function pg(e,t){let n={};t.hasAttribute(`_pgrsmoothnormal`)&&(n.PGR_SMOOTH_NORMAL=``),t.hasAttribute(`tangent`)&&(n.USE_TANGENT=``),e.vertexColor&&t.hasAttribute(`_pgrcolor`)&&(n.PGR_VERTEX_COLOR=``),e.multiColor&&(n.PGR_MULTI_COLOR=``);let[r,i,a,o,s]=e.colors.map(ff),c=new ke({name:`pgr-outline`,vertexShader:dg,fragmentShader:xs(fg,`pgrBloom`,`1.0`),defines:n,uniforms:{pgrWidth:{value:e.width},pgrDistanceScale:{value:e.distanceScale},pgrZMaxOffset:{value:e.zMaxOffset},pgrZOffset:{value:e.zOffset},pgrBrightness:{value:e.brightness},pgrBloom:{value:e.bloom},pgrGlobalTint:{value:ff(e.globalTint)},pgrBand1:{value:r},pgrBand2:{value:i},pgrBand3:{value:a},pgrBand4:{value:o},pgrBand5:{value:s}}});return Zl(c,e.render),c}function mg(e){let t=Ef(e.shader);return{main:t.texture(`_MainTex`),mask:t.texture(`_MaskTex`),ramp:t.texture(`_RampTex`),shiningSpeed:t.float(`_ShiningSpeed`),power:t.float(`_Power`),maxBrightness:t.float(`_MaxBrightness`),atten:t.float(`_Atten`),attenSmooth:t.float(`_AttenSmooth`),rampSpeed:t.float(`_RampTexSpeed`),intensity:t.float(`_Intensity`),color:[...t.linearColor(`_Color`),t.color(`_Color`)[3]],render:e.render}}var hg=`
${ps}

uniform vec4 pgrMainST, pgrMaskST;
varying vec2 vPgrMainUv, vPgrMaskUv;
varying vec3 vPgrNormal;

void main() {
${gs}

  vPgrMainUv = uv * pgrMainST.xy + pgrMainST.zw;
  vPgrMaskUv = uv * pgrMaskST.xy + pgrMaskST.zw;
  vPgrNormal = normalMatrix * objectNormal;
  // Match the main draw's projection and depth.
  #include <project_vertex>
}
`,gg=`
uniform sampler2D pgrMain, pgrMask, pgrRamp;
uniform float pgrHasMain, pgrHasMask, pgrHasRamp;
uniform float pgrTime, pgrShiningSpeed, pgrPower, pgrMaxBrightness, pgrAtten, pgrAttenSmooth, pgrRampSpeed, pgrIntensity;
uniform vec4 pgrColor;
uniform vec3 pgrLightDir;
varying vec2 vPgrMainUv, vPgrMaskUv;
varying vec3 vPgrNormal;

void main() {
  // Unity's _Time.x is seconds / 20.
  float t = pgrTime / 20.0;

  vec3 light = normalize(mat3(viewMatrix) * pgrLightDir);
  float NoL = dot(normalize(vPgrNormal), light);
  float lit = clamp((NoL + pgrAttenSmooth) / (2.0 * pgrAttenSmooth), 0.0, 1.0);
  lit = lit * lit * (3.0 - 2.0 * lit);
  lit = lit * (1.0 - pgrAtten) + pgrAtten;

  // Alpha can't beat lit * mask, so most pixels bail before the main and ramp taps.
  float mask = pgrHasMask > 0.5 ? texture2D(pgrMask, vPgrMaskUv).r : 1.0;
  if (lit * mask < 0.1) discard;

  float shift = t * pgrShiningSpeed;
  vec2 uvA = vec2(vPgrMainUv.x * 1.4 + shift, vPgrMainUv.y * 1.4 - 0.4);
  float a = pgrHasMain > 0.5 ? texture2D(pgrMain, uvA).r : 1.0;
  float b = pgrHasMain > 0.5 ? texture2D(pgrMain, vPgrMainUv + vec2(0.0, -shift)).r : 1.0;
  float field = pow(a * b * pgrMaxBrightness, pgrPower);
  float alpha = lit * clamp(field * pgrColor.a, 0.0, 1.0) * mask;
  if (alpha < 0.1) discard;

  float rampX = vPgrMainUv.x * (1.0 - vPgrMainUv.y) + t * pgrRampSpeed;
  vec3 ramp = pgrHasRamp > 0.5 ? texture2D(pgrRamp, vec2(rampX, 0.5)).rgb : vec3(1.0);
  vec3 rgb = lit * field * ramp * pgrIntensity * pgrColor.rgb;

  // Alpha gates discard and bloom. The color draw stays opaque.
  gl_FragColor = vec4(clamp(rgb, 0.0, 30.0), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;function _g(e,t,n,r){let i=new ke({name:`pgr-sparkle`,vertexShader:hg,fragmentShader:xs(gg,`alpha`,`1.0`),uniforms:{pgrMain:{value:t.main},pgrMask:{value:t.mask},pgrRamp:{value:t.ramp},pgrHasMain:{value:+!!t.main},pgrHasMask:{value:+!!t.mask},pgrHasRamp:{value:+!!t.ramp},pgrMainST:{value:Of(e.main)},pgrMaskST:{value:Of(e.mask)},pgrTime:n,pgrShiningSpeed:{value:e.shiningSpeed},pgrPower:{value:e.power},pgrMaxBrightness:{value:e.maxBrightness},pgrAtten:{value:e.atten},pgrAttenSmooth:{value:e.attenSmooth},pgrRampSpeed:{value:e.rampSpeed},pgrIntensity:{value:e.intensity},pgrColor:{value:new In(...e.color)},pgrLightDir:r}});return Zl(i,e.render),i}var vg=25;function yg(e,t,n){let r=e.index,i=e.getAttribute(`uv`);if(!r||!i||e.groups.length>0)return null;let{red:a,width:o,height:s}=t,c=[],l=[0,0,0],u=[0,0,0];for(let e=0;e<r.count;e+=3){for(let t=0;t<3;t++){let a=r.getX(e+t);l[t]=i.getX(a)*n.x+n.z,u[t]=i.getY(a)*n.y+n.w}let t=Math.min(l[0],l[1],l[2]),d=Math.max(l[0],l[1],l[2]),f=Math.min(u[0],u[1],u[2]),p=Math.max(u[0],u[1],u[2]),m=!(d-t<1&&p-f<1),h=Math.floor(t*o)-1,g=Math.floor(d*o)+1,_=Math.floor(f*s)-1,v=Math.floor(p*s)+1;for(let e=_;e<=v&&!m;e++){let t=(e%s+s)%s*o;for(let e=h;e<=g&&!m;e++)m=a[t+(e%o+o)%o]>vg}m&&c.push(r.getX(e),r.getX(e+1),r.getX(e+2))}if(c.length===r.count)return null;let d=new Sn;for(let[t,n]of Object.entries(e.attributes))d.setAttribute(t,n);return d.morphAttributes=e.morphAttributes,d.morphTargetsRelative=e.morphTargetsRelative,d.setIndex(c),d}var bg=new WeakMap;function xg(e){if(e.minFilter!==1006&&e.minFilter!==1003||e.flipY||e.wrapS!==1e3||e.wrapT!==1e3)return null;let t=bg.get(e.source);if(t)return t;let n=e.image;if(!n?.width||!n.height)return null;let r=n.data??Sg(n);if(!r)return null;let i=new Uint8Array(n.width*n.height);for(let e=0;e<i.length;e++)i[e]=r[e*4];let a={red:i,width:n.width,height:n.height};return bg.set(e.source,a),a}function Sg(e){if(typeof OffscreenCanvas>`u`)return null;let t=new OffscreenCanvas(e.width,e.height).getContext(`2d`,{willReadFrequently:!0});return t?(t.drawImage(e,0,0),t.getImageData(0,0,e.width,e.height).data):null}function Cg(e){let t=Ef(e.shader),n=t.keyword(`ENABLE_MAIN`);return{main:t.texture(`_MainTex`),useMain:n,alphaTest:n&&t.keyword(`_ALPHATEST_ON`),threshold:t.float(`_AlphaTestThresould`),factor:t.float(`_BloomFactor`),replace:e.render.blend===null,render:e.render}}var wg=`
${ps}

uniform vec4 pgrMainST;
varying vec2 vPgrMainUv;

void main() {
  #include <skinbase_vertex>
${hs}
  vPgrMainUv = uv * pgrMainST.xy + pgrMainST.zw;
  // Match the main draw's projection and depth.
  #include <project_vertex>
}
`,Tg=`
uniform sampler2D pgrMain;
uniform float pgrHasMain, pgrAlphaTest, pgrThreshold, pgrFactor, pgrReplace;
varying vec2 vPgrMainUv;

void main() {
  float a = pgrHasMain > 0.5 ? texture2D(pgrMain, vPgrMainUv).a : 1.0;
  if (pgrAlphaTest > 0.5 && a < pgrThreshold) discard;
  float weight = a * pgrFactor;
  float weightAlpha = pgrReplace > 0.5 ? 1.0 : weight;
  // Zero source under ONE, ONE_MINUS_SRC_ALPHA leaves the color untouched.
  gl_FragColor = vec4(0.0);
}
`;function Eg(e,t){let n=e.useMain?t:null,r=new ke({name:`pgr-bloom-weight`,vertexShader:wg,fragmentShader:xs(Tg,`weight`,`weightAlpha`),uniforms:{pgrMain:{value:n},pgrHasMain:{value:+!!n},pgrAlphaTest:{value:n&&e.alphaTest?1:0},pgrThreshold:{value:e.threshold},pgrFactor:{value:e.factor},pgrReplace:{value:+!!e.replace},pgrMainST:{value:Of(e.main)}}});return Yl(r,{src:`one`,dst:`oneMinusSrcAlpha`}),Xl(r,e.render),r}var Dg=new WeakMap;function Og(e){let t=Dg.get(e);if(t!==void 0)return t;let n=e.getContext().getExtension(`OES_draw_buffers_indexed`);return Dg.set(e,n),n}function kg(e,t){e.onBeforeRender=e=>{Og(e)?.colorMaskiOES(t,!1,!1,!1,!1)},e.onAfterRender=e=>{Og(e)?.colorMaskiOES(t,!0,!0,!0,!0)}}var Ag=new Set([`outline`,`sparkle`,`bloom`]);function jg(e,t,n){let r=new Map,i=t=>{if(!r.has(t)){let n=e.materials?.[t];r.set(t,xf(n?.extras,n?.name))}return r.get(t)??null};return t.flatMap(e=>(n.get(e)?.passes??[]).flatMap(t=>{let n=i(t);return n?[{mesh:e,index:t,extras:n}]:[]}))}function Mg(e,t){return e.filter(e=>e.extras.family===t)}var Ng=new Bn({colorWrite:!1});function Pg(e,t,n,r){if(e.castShadow=t?.userData.castsShadow!==!1,e.receiveShadow=n&&t?.userData.receivesShadow!==!1,!e.castShadow)return;let i=r?.shader.keywords.includes(`_ALPHACLIP`)?nu(e).find(e=>e instanceof _t&&e.map!==null)?.map:null;if(i){let t=new Bn({depthPacking:He,map:i,colorWrite:!1}),n={value:r.render.alphaTest};t.customProgramCacheKey=()=>`pgr-clip-caster`,t.onBeforeCompile=e=>{e.uniforms.pgrCutoff=n,e.fragmentShader=`uniform float pgrCutoff;\n${Cs(e.fragmentShader,`alphatest_fragment`,`if (diffuseColor.a < pgrCutoff) discard;`)}`},e.customDepthMaterial=t;return}e.customDepthMaterial=Ng,e.onBeforeShadow=()=>{Ng.map=null,Ng.alphaMap=null}}function Fg(e,t,n){let r=t.get(e);return!r||!r.blend||r.depthWrite?!1:![...t].some(([t,r])=>t!==e&&t.geometry===e.geometry&&r!==null&&r.depthWrite&&r.renderOrder<=n)}function Ig(e,t,n){for(let{mesh:r,extras:i}of Mg(e,`outline`)){let e=ug(i,n),a=e.render.renderOrder;if(Fg(r,t,a))continue;let o=au(r,pg(e,r.geometry),a,`outline`);o.receiveShadow=!1}}async function Lg({mesh:e,extras:t},n,r,i){let a=mg(t),[o,s,c]=await Promise.all([i(a.main?.index??null),i(a.mask?.index??null),i(a.ramp?.index??null)]),l=au(e,_g(a,{main:o,mask:s,ramp:c},r,n.key),a.render.renderOrder,`sparkle`),u=s?xg(s):null,d=u?yg(e.geometry,u,Of(a.mask)):null;return d&&(l.geometry=d),l}function Rg(e,t){if(!t.some(e=>e.defines?.PGR_VERTEX_COLOR!==void 0)||e.geometry.getAttribute(`_pgrcolor`))return;let n=e.geometry.getAttribute(`position`).count;e.geometry.setAttribute(`_pgrcolor`,new ct(new Float32Array(n*4).fill(1),4))}function zg(e,t){for(let n of e){let e=nu(n).filter(e=>t.get(e)?.family===`effect`);e.length!==0&&(n.castShadow=!1,Rg(n,e))}}var Bg=-1;function Vg(e,t){let n=new Map,r=e=>{let t=n.get(e);return t||(t=new Bn({colorWrite:!1,side:e}),n.set(e,t)),t};for(let n of e){let e=nu(n);if(e.length!==1)continue;let i=e[0];if(!(i instanceof _t))continue;let a,o=t.get(i);if(o?.family===`effectCharacter`){if(!o.depth||i.transparent||i.stencilWrite)continue;o.depth.side=i.side,a=o.depth}else{if(i.transparent||!i.depthWrite||i.alphaTest>0||i.stencilWrite||i.blending!==1&&i.blending!==0)continue;a=r(i.side)}let s=au(n,a,Bg,`prepass`);s.receiveShadow=!1}}async function Hg(e,{mesh:t,index:n,extras:r},i,a){let{source:o,shaded:s}=await sg(e,n,t,i,a);if(o.dispose(),!s)return null;let c=au(t,s.material,r.render.renderOrder,`secondary`);return c.receiveShadow=t.receiveShadow&&s.family!==`effect`,c}var Ug=10;function Wg(e,t){for(let n of e){let e=t.get(nu(n)[0])?.furShell;if(e)for(let[t,r]of Ih.entries()){let i=n.renderOrder+(t+1)/Ug,a=au(n,e(r),i,`fur ${t+1}`);a.receiveShadow=!1}}}async function Gg({mesh:e,extras:t},n){let r=Cg(t),i=au(e,Eg(r,r.useMain?await n(r.main?.index??null,`none`):null),r.render.renderOrder,`bloom`);return i.receiveShadow=!1,kg(i,0),i}async function Kg(e,t,n,r,i,a){if(!n)return[];let o=null,s=null;return(await Uh(t.map(async t=>{let c=Vh(e,t);if(c?.userData.castsProjectionShadow===!1)return null;let l=c?.userData.projectionShadowAlpha,u=l===void 0?null:await i(l),d;return u?d=xu(n,r,u):(o??=xu(n,r,null),s??=xu(n,r,null,!1),d=o),a.add(d),s&&a.add(s),{shadow:Ou(t,d),reach:Cu(t),clip:d,clamp:u?d:s}}))).filter(e=>e!==null)}async function qg(e,t,n,r,i){let a=new Map,o=await Promise.all(t.map(async t=>{let a=[t,...t.additional?[t.additional]:[]].flatMap(e=>{let t=Hh(r,e.node);return t?[{mesh:t,material:e.material}]:[]});if(a.length===0)return null;let[o,s]=await Promise.all([Promise.all(a.map(({mesh:t,material:r})=>cg(e,r,t,n.get(t),i))),Promise.all(t.eyes.map(e=>i.loadTexture(e.mask,`none`)))]);return{row:t,hairs:a.map(({mesh:e},t)=>({mesh:e,material:o[t]})),masks:s}})),s=[];for(let e of o){if(!e)continue;let{row:t,hairs:n,masks:i}=e,o=n.map(({mesh:e,material:t})=>{Bl(t),nu(e).forEach(e=>zl(e)),e.renderOrder=Ml.hair;let n=au(e,t,Ml.transparent,`fade`);return n.receiveShadow=e.receiveShadow,n.visible=!1,n}),c=[];for(let[e,n]of t.eyes.entries()){let t=a.get(n.node);if(!t){let o=Hh(r,n.node),s=i[e]??null;if(!o||n.mask!==null&&!s)continue;o.renderOrder=Ml.eye,t=au(o,Hl(s),Ml.eyeStencil,`stencil`),t.receiveShadow=!1,t.visible=!1,a.set(n.node,t)}c.push(t)}s.push({stencils:c,copies:o,target:r.get(t.checkNode)??null,fadeDistance:t.fadeDistance})}return s}async function Jg({gltf:e,meshes:t,passes:n,sources:r,nodes:i,hairFades:a,groundShadow:o},s){let{light:c,time:l,loadTexture:u}=s,d=n.filter(e=>!Ag.has(e.extras.family??``)),f=await Wh({sparkles:Uh(Mg(n,`sparkle`).map(e=>Lg(e,c,l,u))),groundShadowCasters:Kg(e,t,o,c,u,s.created.materials),hairFades:qg(e,a,r,i,s),bloomWeights:Uh(Mg(n,`bloom`).map(e=>Gg(e,u))),secondaries:Uh(d.map(t=>Hg(e,t,r.get(t.mesh),s)))});return{sparkles:f.sparkles,groundShadowCasters:f.groundShadowCasters,hairFades:f.hairFades,secondaries:f.secondaries.filter(e=>e!==null)}}function Yg(e,t,n,r,i){let a=e=>r.get(e)?.material??e,o=new Map;for(let r of t){let t=n.get(r)??null;o.set(r,t?.render??null);for(let e of nu(r)){let t=Cf(e)?.render;t&&(r.renderOrder=Math.max(r.renderOrder,t.renderOrder))}r.material=Array.isArray(r.material)?r.material.map(a):a(r.material),r.frustumCulled=!1;let s=nu(r).some(e=>i.has(e));Pg(r,Vh(e,r),s,t),nu(r).some(e=>i.get(e)?.family===`fur`)&&(r.castShadow=!1,r.receiveShadow=!1)}return o}function Xg(e,t){for(let n of e.keys())n.dispose(),t.materials.delete(n)}

async function Zg(e,t,n,r,i){let a=new Map,o=new Map,s=await Uh(t.parts.map(async(t,s)=>{let c=(o.get(t.partId)??0)+1;return o.set(t.partId,c),{id:s,label:`part${t.partId}${c>1?`_${c}`:``}`,entries:(await Uh(t.entries.map(async t=>{let o=Hh(r,t.node);return o?(a.set(o,o.material),t.material===void 0?{mesh:o,material:null,hide:t.hide}:{mesh:o,material:await cg(e,t.material,o,n.get(o),i),hide:t.hide}):null}))).filter(e=>e!==null)}})),c=t.parts.findIndex(e=>e.partId===t.initialPart);return{sets:s,initial:t.initialPart===null||c<0?null:c,base:a,hidden:new Set}}function Qg(e,t){let n=new Map;return t.traverse(t=>{let r=e.parser.associations.get(t)?.nodes;r!==void 0&&n.set(r,t)}),n}function $g(e,t){let n=e=>e===null?null:t.get(e)??null;return{head:n(e.anchors.head),body:n(e.anchors.body)}}

var B_=60,V_=2,H_=e=>wn.clamp(e,0,1),U_=(e,t,n)=>t?.length&&n!==null?e*El(t,n):e,W_=new U,G_=new U,K_=new mt;function q_(e,t,n,r,i){let a=r>0||i.lengthSq()>0,o=[],s=(e,t,n,r,i)=>(o.push({bone:e,local:t,parentBone:n,parent:r,boneLength:i,damping:0,elasticity:0,stiffness:0,inert:0,radius:0,position:new U,previous:new U,last:new U,rest:new U}),o.length-1),c=(t,n)=>{t.getWorldPosition(W_);let a=new U;if(r>0){if(!t.parent)return;t.parent.getWorldPosition(G_),a.copy(W_).multiplyScalar(2).sub(G_),t.worldToLocal(a),a.multiplyScalar(r)}else a.copy(i).applyQuaternion(e.getWorldQuaternion(K_)).add(W_),t.worldToLocal(a);let c=t.localToWorld(G_.copy(a)).distanceTo(W_);s(null,a,t,n,o[n].boneLength+c)},l=(e,t,r,i)=>{let o=s(e,e.position,t,r,i),u=e.getWorldPosition(new U);for(let t of e.children)n.has(t)?a&&c(e,o):l(t,e,o,i+t.getWorldPosition(W_).distanceTo(u));a&&e.children.length===0&&c(e,o)};return l(t,t,-1,0),o}function J_(e,t,n){let r=Math.max(...e.map(e=>e.boneLength));for(let i of e){let e=r<=0?null:i.boneLength/r;i.damping=H_(U_(t.damping,t.dampingCurve,e)),i.elasticity=H_(U_(t.elasticity,t.elasticityCurve,e)),i.stiffness=wn.lerp(1,H_(U_(t.stiffness,t.stiffnessCurve,e)),H_(t.weight)),i.inert=H_(U_(t.inert,t.inertCurve,e)),i.radius=Math.max(U_(n.radius??0,n.radiusCurve,e),0)}}function Y_(e,t,n,r){let i=e.get(t.node),a=e.get(t.root);if(!i||!a||!n)return null;let o=new Set((t.exclusions??[]).map(t=>e.get(t))),s=new U().fromArray(t.endOffset??[0,0,0]),c=q_(i,a,o,t.endLength??0,s);if(c.length<2)return null;J_(c,n,t);let l=new U().fromArray(n.gravity??[0,0,0]);return{holder:i,root:a,particles:c,gravity:l,localGravity:l.clone().applyQuaternion(a.getWorldQuaternion(K_).invert()),force:new U().fromArray(n.force??[0,0,0]),holderPrevious:new U,objectScale:1,colliders:(t.colliders??[]).flatMap(e=>r[e]??[]),freezeAxis:n.freezeAxis??0}}function X_(e,t,n){return(t.chains??[]).map(r=>Y_(e,r,t.presets?.[r.preset],n)).filter(e=>e!==null)}var Z_=1e-10,Q_=10,$_=1e-6,ev=.5,tv=2,nv=1e-5;function rv(e,t){let n=Math.min(e*B_,V_),r=t>$_?t:n;return{dtN:n,velScale:wn.clamp(r>$_?n/r:1,ev,tv),forceCoef:.5*n*(n+r)}}var iv=new U,av=new U,ov=new U,sv=new U,cv=new U,lv=new U,uv=new mt,dv=new U,fv=new U;function pv(e,t){let{holder:n,root:r,particles:i}=e;n.getWorldPosition(iv),e.objectScale=Math.abs(n.getWorldScale(av).x),ov.subVectors(iv,e.holderPrevious),e.holderPrevious.copy(iv),sv.copy(e.gravity),cv.copy(e.gravity),cv.length()>nv?cv.normalize():cv.set(0,0,0),lv.copy(e.localGravity).applyQuaternion(r.getWorldQuaternion(uv)),sv.addScaledVector(cv,-Math.max(lv.dot(cv),0)),sv.add(e.force).multiplyScalar(e.objectScale*t.forceCoef);for(let e of i){if(e.parent<0){e.previous.copy(e.position),e.position.copy(e.rest);continue}dv.subVectors(e.position,e.previous),fv.copy(ov).multiplyScalar(e.inert),e.previous.copy(e.position).add(fv),e.position.addScaledVector(dv,t.velScale*(1-e.damping)).add(sv).add(fv)}}var mv=new U,hv=new nn,gv=new U,_v=new U;function vv(e,t){let{particles:n}=e;for(let r=1;r<n.length;r++){let i=n[r],a=n[i.parent],o=a.rest.distanceTo(i.rest);if((i.stiffness>0||i.elasticity>0)&&(hv.copy(i.parentBone.matrixWorld).setPosition(a.position),mv.copy(i.local).applyMatrix4(hv),i.position.addScaledVector(gv.subVectors(mv,i.position),i.elasticity*t.dtN),i.stiffness>0)){gv.subVectors(mv,i.position);let e=gv.length(),t=o*(1-i.stiffness)*2;e>t&&i.position.addScaledVector(gv,(e-t)/e)}let s=i.radius*e.objectScale;for(let t of e.colliders)gn(t.shape,i.position,s)&&t.hits++;if(e.bodyColliders)for(let t of e.bodyColliders){let n=Math.min(t.shape.radius+s+t.pad*e.objectScale,t.clearance[r]*e.objectScale);n>0&&gn(t.shape,i.position,n-t.shape.radius)}if(e.freezeAxis>=1&&e.freezeAxis<=3){_v.setFromMatrixColumn(i.parentBone.matrixWorld,e.freezeAxis-1).normalize();let t=gv.subVectors(i.position,a.position).dot(_v);i.position.addScaledVector(_v,-t)}gv.subVectors(a.position,i.position);let c=gv.length();c>0&&i.position.addScaledVector(gv,(c-o)/c)}}var yv=new U,bv=new U,xv=new mt,Sv=new mt,Cv=new mt,wv=new U,Tv=new U,Ev=new nn;function Dv(e){let{particles:t}=e;for(let e=1;e<t.length;e++){let n=t[e],r=t[n.parent],i=n.parentBone;i.children.length<=1&&(i.matrixWorld.decompose(wv,Sv,Tv),yv.copy(n.local).applyQuaternion(Sv),bv.subVectors(n.position,r.position),yv.lengthSq()>0&&bv.lengthSq()>0&&(xv.setFromUnitVectors(yv.normalize(),bv.normalize()),Sv.premultiply(xv),i.parent?(i.parent.matrixWorld.decompose(wv,Cv,Tv),Cv.invert()):Cv.identity(),i.quaternion.copy(Cv.multiply(Sv)),i.updateWorldMatrix(!1,!1))),n.bone&&(Ev.copy(i.matrixWorld).invert(),n.bone.position.copy(n.position).applyMatrix4(Ev),n.bone.updateWorldMatrix(!1,!1))}}function Ov(e){e.root.updateWorldMatrix(!0,!0);for(let t of e.particles)t.bone?t.rest.setFromMatrixPosition(t.bone.matrixWorld):t.rest.copy(t.local).applyMatrix4(t.parentBone.matrixWorld)}function kv(e){let t=new Map;for(let n of e)for(let{bone:e}of n.particles)!e||t.has(e)||t.set(e,{bindPosition:e.position.clone(),bindQuaternion:e.quaternion.clone(),position:e.position.clone(),quaternion:e.quaternion.clone()});return t}function Av(e,t){let n=0,r=0;for(let i of e){Ov(i),pv(i,t),vv(i,t),Dv(i);for(let e of i.particles)n=Math.max(n,e.position.distanceToSquared(e.rest)),r=Math.max(r,e.position.distanceToSquared(e.last)),e.last.copy(e.position)}return{stray:n,travel:r}}var jv=-1;function Mv(e,t){let n=X_(e,t,Nn(e,t.colliders));if(!n.length)return null;let r=[...new Set(n.flatMap(e=>e.colliders))],i=kv(n),a=!1,o=Q_,s=jv,c,l={chains:n.length,particles:n.reduce((e,t)=>e+t.particles.length,0),dtN:0,velScale:1,stray:0,travel:0,moving:!1,ms:0},u=e=>{if(c=e,a){a=!1;for(let[t,n]of i){let r=e?.has(t)??!1;t.position.copy(r?n.position:n.bindPosition),t.quaternion.copy(r?n.quaternion:n.bindQuaternion)}}},d=()=>{for(let e of n){Ov(e);for(let t of e.particles)t.position.copy(t.rest),t.previous.copy(t.rest),t.last.copy(t.rest);e.holder.getWorldPosition(e.holderPrevious)}l.stray=0,l.travel=0,l.moving=!1,o=Q_;for(let e of r)e.hits=0},f=e=>{l.dtN=0,l.velScale=1,u(c);for(let[e,t]of i)t.position.copy(e.position),t.quaternion.copy(e.quaternion);if(s===jv)return d(),s=0,!0;if(a=!0,e<=0){for(let e of n)Ov(e),Dv(e);return!1}let t=rv(e,s);s=t.dtN,l.dtN=t.dtN,l.velScale=t.velScale;for(let e of r)On(e),e.hits=0;let f=l.moving,{stray:p,travel:m}=Av(n,t);return l.stray=Math.sqrt(p),l.travel=Math.sqrt(m),o=m>Z_?0:o+1,l.moving=o<Q_,l.moving||f};return{chains:n,colliders:r,stats:l,restore:u,step(e){let t=performance.now(),n=f(e);return l.ms=performance.now()-t,n},reset(){s=jv}}}var Nv=e=>$e.parseTrackName(e.name).nodeName;function Pv(e,t){return e.tracks.filter(e=>t.has(Nv(e)))}var Fv=e=>e===`position`||e===`quaternion`||e===`scale`,Iv={vector:new U,rotation:new mt,partial:new mt};function Lv(e,t,n){let r=[];for(let i of Pv(e,t)){let e=$e.parseTrackName(i.name).propertyName,a=t.get(Nv(i));if(!a||!Fv(e))continue;let o=i.createInterpolant(),s=null;if(n===`additive`){let t=o.evaluate(0);s=e===`quaternion`?new mt().fromArray(t).invert():new U().fromArray(t)}r.push({node:a,property:e,sampler:o,reference:s})}let i=(e,t)=>{let{vector:n,rotation:i,partial:a}=Iv;for(let{node:o,property:s,sampler:c,reference:l}of r){let r=c.evaluate(e);if(s===`quaternion`){if(i.fromArray(r),l){let e=i.premultiply(l);o.quaternion.multiply(a.identity().slerp(e,t))}else o.quaternion.slerp(i,t);continue}n.fromArray(r);let u=o[s];if(!l)u.lerp(n,t);else if(s===`position`)u.addScaledVector(n.sub(l),t);else{let e=l;u.x*=1+((e.x?n.x/e.x:1)-1)*t,u.y*=1+((e.y?n.y/e.y:1)-1)*t,u.z*=1+((e.z?n.z/e.z:1)-1)*t}}};return{duration:e.duration,nodes:[...new Set(r.map(e=>e.node))],apply:i}}function Rv(e){let t=new Map;for(let n of e)t.set(n,{position:n.position.clone(),quaternion:n.quaternion.clone(),scale:n.scale.clone()});return{restore(e){for(let n of e){let e=t.get(n);e&&(n.position.copy(e.position),n.quaternion.copy(e.quaternion),n.scale.copy(e.scale))}}}}

export {
  ps,
  ms,
  hs,
  gs,
  _s,
  vs,
  ys,
  bs,
  xs,
  Ss,
  Cs,
  Ef,
  ff,
  Zl,
  Ql,
  $l,
  eu,
  tu,
  nu,
  ru,
  iu,
  au,
  ou,
  cu,
  Vh,
  Hh,
  cg,
  rd,
  ju as DEFAULT_PGR_LIGHTING,
  Ku as createPgrLightController,
  Bu as updateRimDirection,
  Du as updateGroundShadows,
  Ou as createGroundShadowMesh,
  Cu as computeGroundShadowReach,
  mu as computeGroundShadowBounds,
  jl as updateEmissionFlow,
  Fm as loadCubemapRegistry,
  Mv as createSpringBoneSystem,
  ih as CHARACTER_VERTEX_SHADER,
  ah as CHARACTER_FRAGMENT_SHADER,
  kp as PBR_HYBRID_CHUNK,
};

/**
 * Compiles all PGR shaders, outlines, face shadow axes, hair/eye stencils,
 * sparkles, bloom weights, planar ground shadows, and depth prepasses on an
 * already-loaded GLTF model while preserving original PBR materials for toggling.
 */
export async function compilePgrModel(gltf, { cubemaps = null, signal, lighting = ju } = {}) {
  const s = gltf.scene;
  const c = gltf.parser.json;
  const l = hp(c.scenes?.[c.scene ?? 0]?.extras);
  const u = tu(s);
  for (const mesh of u) Nf(mesh.geometry);

  const d = new Map(u.map((mesh) => [mesh, nu(mesh)[0]]));
  const f = new Map(u.map((mesh) => [mesh, Cf(d.get(mesh))]));

  // Record original PBR state (with clean cloned materials before PGR onBeforeCompile mutates them)
  const pbrCloneCache = new Map();
  const clonePbrMaterial = (mat) => {
    if (!mat || typeof mat.clone !== 'function') return mat;
    if (!pbrCloneCache.has(mat)) {
      const cloned = mat.clone();
      cloned.needsUpdate = true;
      pbrCloneCache.set(mat, cloned);
    }
    return pbrCloneCache.get(mat);
  };
  const pbrState = new Map();
  for (const mesh of u) {
    pbrState.set(mesh, {
      material: Array.isArray(mesh.material)
        ? mesh.material.map(clonePbrMaterial)
        : clonePbrMaterial(mesh.material),
      renderOrder: mesh.renderOrder,
      castShadow: mesh.castShadow,
      receiveShadow: mesh.receiveShadow,
      customDepthMaterial: mesh.customDepthMaterial,
      onBeforeRender: mesh.onBeforeRender,
      onBeforeShadow: mesh.onBeforeShadow,
    });
  }

  const p = { materials: new Set(u.flatMap(nu)), textures: new Set() };
  const m = Ku(lighting, l.selfShadow ?? undefined);
  const h = qh(gltf, u, lighting, m, cubemaps, p);

  signal?.throwIfAborted();
  const compiledMap = await og(h);
  signal?.throwIfAborted();

  const renderMap = Yg(gltf, u, f, compiledMap, h.shaded);
  Wg(u, h.shaded);

  const passes = jg(c, u, f);
  const outlines = attachOutlines(passes, renderMap, lighting);

  const nodes = Qg(gltf, s);
  const partSwaps = await Zg(gltf, l, d, nodes, h);
  signal?.throwIfAborted();

  setupFaceShadowAxes(gltf, u, h.shaded, nodes, partSwaps);

  const groundShadowProj = pu(lighting, m);
  const {
    sparkles,
    groundShadowCasters,
    hairFades,
    secondaries,
  } = await Jg(
    {
      gltf,
      meshes: u,
      passes,
      sources: d,
      nodes,
      hairFades: l.hairFades,
      groundShadow: groundShadowProj,
    },
    h,
  );

  zg([...u, ...secondaries], h.shaded);
  cu(s, new Set(groundShadowCasters.map((caster) => caster.shadow)));
  Vg(u.filter((mesh) => !partSwaps.base.has(mesh)), h.shaded);

  // Record PGR state and collect static auxiliary child meshes
  const pgrState = new Map();
  const dynamicAuxSet = new Set([
    ...groundShadowCasters.map((caster) => caster.shadow),
    ...hairFades.flatMap((hf) => [...hf.stencils, ...hf.copies]),
  ]);
  const staticAuxMeshes = [];

  for (const mesh of u) {
    pgrState.set(mesh, {
      material: mesh.material,
      renderOrder: mesh.renderOrder,
      castShadow: mesh.castShadow,
      receiveShadow: mesh.receiveShadow,
      customDepthMaterial: mesh.customDepthMaterial,
      onBeforeRender: mesh.onBeforeRender,
      onBeforeShadow: mesh.onBeforeShadow,
    });
    for (const child of mesh.children) {
      if (ou(child) && !dynamicAuxSet.has(child)) {
        staticAuxMeshes.push(child);
      }
    }
  }

  const faces = l.faces
    ? createFaceSwapper(l.faces, {
        root: s,
        nodes,
        shaded: h.shaded,
        loadTexture: h.loadTexture,
        textures: new Set(p.textures),
      })
    : null;
  const events = new Map();
  if (faces) Xf(events, FACE_EVENT_NAMES, faces.handler);

  const animated = [...p.materials].some((mat) => mat.userData.animated);

  return {
    root: s,
    anchors: $g(l, nodes),
    tags: { nodes: c.nodes ?? [], tags: l.objectTags },
    partSwaps,
    nodes,
    meshes: u,
    pbrState,
    pgrState,
    staticAuxMeshes,
    outlines,
    groundShadowCasters,
    groundShadowProjection: groundShadowProj,
    hairFades,
    flows: h.flows,
    time: h.time,
    timeDriven: sparkles.length > 0 || h.flows.length > 0 || animated,
    light: m,
    materials: [...p.materials],
    rimDirection: h.rimDirection,
    springs: l.springBones,
    faces,
    events,
  };
}

/**
 * Switches between 'pgr' (authentic in-game PGR shaders, outlines, hair stencils,
 * face shadow, ground shadow) and 'pbr' (raw GLTF MeshStandardMaterial).
 */
export function applyPgrMaterialMode(pgrModel, mode) {
  if (!pgrModel) return;
  const isPgr = mode === 'pgr';
  const targetState = isPgr ? pgrModel.pgrState : pgrModel.pbrState;

  for (const mesh of pgrModel.meshes) {
    const state = targetState.get(mesh);
    if (!state) continue;
    mesh.material = state.material;
    mesh.renderOrder = state.renderOrder;
    mesh.castShadow = state.castShadow;
    mesh.receiveShadow = state.receiveShadow;
    mesh.customDepthMaterial = state.customDepthMaterial;
    mesh.onBeforeRender = state.onBeforeRender || (() => {});
    mesh.onBeforeShadow = state.onBeforeShadow || (() => {});
  }

  for (const aux of pgrModel.staticAuxMeshes) {
    aux.visible = isPgr;
  }

  if (!isPgr) {
    for (const caster of pgrModel.groundShadowCasters) {
      caster.shadow.visible = false;
    }
    for (const hf of pgrModel.hairFades) {
      for (const s of hf.stencils) s.visible = false;
      for (const c of hf.copies) c.visible = false;
    }
  }
}
