// Adapted from https://github.com/turbo/js/blob/master/turbo.js
const canvas = document.createElement('canvas');
const attr = { alpha: false, antialias: false };
const gl = canvas.getContext("webgl", attr) || canvas.getContext("experimental-webgl2", attr);

if (!gl)
  throw new Error("Unable to initialize WebGL2. Your browser may not support it.");

if (!gl.getExtension('OES_texture_float'))
  throw new Error('turbojs: Required texture format OES_texture_float not supported.');

function newBuffer(data, f, e) {
  const buf = gl.createBuffer();

  gl.bindBuffer((e || gl.ARRAY_BUFFER), buf);
  gl.bufferData((e || gl.ARRAY_BUFFER), new (f || Float32Array)(data), gl.STATIC_DRAW);

  return buf;
}

const positionBuffer = newBuffer([-1, -1, 1, -1, 1, 1, -1, 1]);
const textureBuffer = newBuffer([0, 0, 1, 0, 1, 1, 0, 1]);
const indexBuffer = newBuffer([1, 2, 0, 3, 0, 2], Uint16Array, gl.ELEMENT_ARRAY_BUFFER);

const vertexShaderCode = `
  attribute vec2 position;
  varying vec2 pos;
  attribute vec2 texture;
  void main(void) {
    pos = texture;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;
const vertexShader = gl.createShader(gl.VERTEX_SHADER);
gl.shaderSource(vertexShader, vertexShaderCode);
gl.compileShader(vertexShader);

if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
  throw new Error(
    "Could not build internal vertex shader (fatal).\n" + "\n" +
    "--- CODE DUMP ---\n" + vertexShaderCode + "\n\n" +
    "--- ERROR LOG ---\n" + gl.getShaderInfoLog(vertexShader)
  );
}

function createTexture(data, size) {
  const texture = gl.createTexture();

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.FLOAT, data);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return texture;
}

const fragmentShaderHeader = `
  precision mediump float;
  uniform sampler2D texture0;
  varying vec2 pos;
`;

/*
 * Input:
 * [
 *   {
 *     data: Float32Array,
 *     type: RGBA | 
 *   }
 * ]
 */
export default function(input, code) {
  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fragmentShader, fragmentShaderHeader + code);
  gl.compileShader(fragmentShader);

  if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
    const LOC = code.split('\n');
    const dbgMsg = "ERROR: Could not build shader (fatal).\n\n------------------ KERNEL CODE DUMP ------------------\n"

    for (let nl = 0; nl < LOC.length; nl++)
      dbgMsg += (fragmentShaderHeader.split('\n').length + nl) + "> " + LOC[nl] + "\n";

    dbgMsg += "\n--------------------- ERROR  LOG ---------------------\n" + gl.getShaderInfoLog(fragmentShader);

    throw new Error(dbgMsg);
  }

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error('Failed to link GLSL program code.');

  const texture0 = gl.getUniformLocation(program, 'texture0');
  const aPosition = gl.getAttribLocation(program, 'position');
  const aTexture = gl.getAttribLocation(program, 'texture');

  gl.useProgram(program);

  const size = Math.sqrt(input.length / 4);
  const texture = createTexture(input, size);

  gl.viewport(0, 0, size, size);
  gl.bindFramebuffer(gl.FRAMEBUFFER, gl.createFramebuffer());

  const outTexture = createTexture(new Float32Array(input.length), size);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, outTexture, 0);
  const frameBufferStatus = (gl.checkFramebufferStatus(gl.FRAMEBUFFER) == gl.FRAMEBUFFER_COMPLETE);
  if (!frameBufferStatus)
    throw new Error('Error attaching float texture to framebuffer. Your device is probably incompatible. Error info: ' + frameBufferStatus.message);

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform1i(texture0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, textureBuffer);
  gl.enableVertexAttribArray(aTexture);
  gl.vertexAttribPointer(aTexture, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.enableVertexAttribArray(aPosition);
  gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  gl.readPixels(0, 0, size, size, gl.RGBA, gl.FLOAT, input);

  return input;
}
