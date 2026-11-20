/**
 * Reads a texture's pixels back on the CPU, downscaled, with all four
 * channels intact.
 *
 * A 2D canvas premultiplies by alpha, which wipes the colour of every texel
 * whose alpha is zero, and the game's masks pack unrelated data into alpha.
 * So the image goes through a small WebGL context instead, which hands the
 * stored bytes back unchanged.
 */

import * as THREE from 'three';

const SIZE = 256;
const cache = new WeakMap();
let scratch;

function createScratch() {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false, depth: false, stencil: false });
  if (!gl) return null;

  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  };
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, 'attribute vec2 p; varying vec2 uv; void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }'));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, 'precision mediump float; uniform sampler2D t; varying vec2 uv; void main() { gl_FragColor = texture2D(t, uv); }'));
  gl.bindAttribLocation(program, 0, 'p');
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  // One triangle that covers the whole target.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.disable(gl.BLEND);
  return gl;
}

function readThroughWebgl(image, width = SIZE, height = SIZE) {
  if (scratch === undefined) scratch = createScratch();
  const gl = scratch;
  if (!gl || gl.isContextLost()) return null;
  if (gl.canvas.width !== width || gl.canvas.height !== height) {
    gl.canvas.width = width;
    gl.canvas.height = height;
  }
  gl.viewport(0, 0, width, height);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  // The first row read back is the image's first row: nothing was flipped on
  // the way in, and the target's bottom edge shows the image's top edge.
  const data = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.deleteTexture(texture);
  return gl.getError() === gl.NO_ERROR ? data : null;
}

/** Fallback: correct wherever alpha is opaque, which is what an albedo map is. */
function readThroughCanvas(image) {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, SIZE, SIZE);
  return context.getImageData(0, 0, SIZE, SIZE).data;
}

/** `{ data, size, flipY }` with `size` × `size` RGBA bytes, or null when the texture can not be read. */
export function readTexturePixels(texture) {
  const image = texture?.image;
  if (!image || !image.width || image.data) return null;
  let entry = cache.get(image);
  if (entry === undefined) {
    let data = null;
    try {
      data = readThroughWebgl(image) ?? readThroughCanvas(image);
    } catch {
      data = null;
    }
    entry = data ? { data, size: SIZE } : null;
    cache.set(image, entry);
  }
  return entry ? { ...entry, flipY: texture.flipY } : null;
}

/**
 * The texture's pixels at full size (up to `maxSize`) with alpha forced to
 * 255, as a canvas texture three's GLTFExporter writes without loss. For maps whose
 * alpha is data (shadow masks) rather than opacity: going through a 2D
 * canvas, as the exporter does, would blacken every pixel with low alpha.
 * Returns null when the texture can not be read.
 */
export function opaqueTextureCopy(texture, maxSize = 4096) {
  const image = texture?.image;
  if (!image || !image.width || image.data) return null;
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  let data;
  try {
    data = readThroughWebgl(image, width, height);
  } catch {
    data = null;
  }
  if (!data) return null;
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  // A canvas, not a DataTexture: the exporter redraws some maps with drawImage.
  // With alpha at 255 everywhere nothing is lost on the way through.
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data.buffer), width, height), 0, 0);
  const copy = new THREE.CanvasTexture(canvas);
  copy.name = texture.name;
  copy.flipY = texture.flipY;
  copy.colorSpace = texture.colorSpace;
  copy.wrapS = texture.wrapS;
  copy.wrapT = texture.wrapT;
  copy.magFilter = texture.magFilter;
  copy.minFilter = texture.minFilter;
  copy.offset.copy(texture.offset);
  copy.repeat.copy(texture.repeat);
  copy.rotation = texture.rotation;
  copy.center.copy(texture.center);
  copy.channel = texture.channel;
  copy.userData = { ...texture.userData };
  copy.needsUpdate = true;
  return copy;
}

/** Writes the texel at (u, v) into `out` as [r, g, b, a] in 0 to 255. */
export function texelAt(pixels, u, v, out) {
  const { data, size, flipY } = pixels;
  const x = Math.min(size - 1, Math.max(0, Math.floor((u - Math.floor(u)) * size)));
  const row = (flipY ? 1 - (v - Math.floor(v)) : v - Math.floor(v)) * size;
  const y = Math.min(size - 1, Math.max(0, Math.floor(row)));
  const o = (y * size + x) * 4;
  out[0] = data[o];
  out[1] = data[o + 1];
  out[2] = data[o + 2];
  out[3] = data[o + 3];
  return out;
}
