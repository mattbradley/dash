// Adapted from https://github.com/turbo/js/blob/master/turbo.js
const canvas = document.createElement('canvas');
const attr = { alpha: false, antialias: false };
const gl = canvas.getContext("webgl2", attr) || canvas.getContext("experimental-webgl2", attr);

if (!gl)
  throw new Error("Unable to initialize WebGL2. Your browser may not support it.");

if (!gl.getExtension('EXT_color_buffer_float'))
  throw new Error('Required texture format EXT_color_buffer_float not supported.');

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

function createTexture(data, size, width) {
  const texture = gl.createTexture();

  let internalFormat, format;

  switch (width) {
    case 1:
      internalFormat = gl.R32F;
      format = gl.RED;
      break;
    case 2:
      internalFormat = gl.RG32F;
      format = gl.RG;
      break;
    case 3:
      internalFormat = gl.RGB32F;
      format = gl.RGB;
      break;
    case 4:
      internalFormat = gl.RGBA32F;
      format = gl.RGBA;
      break;
    default:
      throw("Texel width must between 1 and 4.");
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, size, size, 0, format, gl.FLOAT, data);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return texture;
}

const fragmentShaderHeader = `
precision mediump float;
varying vec2 pos;
`;

/*
 * Input:
 *   [
 *     data: Float32Array,
 *     width: 1-4
 *   ]
 */
export default function(inputs, code) {
  const inputTextures = [];
  let fragmentShaderInputs = "";
  let inputSize = null;
  for (const [index, { data, width }] of inputs.entries()) {
    const size = Math.sqrt(data.length / width);
    if (size > 0 && (size & (size - 1)) != 0)
      throw new Error('Input size must be a power of two.');

    if (inputSize == null)
      inputSize = size;
    else if (size != inputSize)
      throw new Error(`All input sets must be of the same size. Received ${size} but expected ${inputSize}.`);

    inputTextures.push(createTexture(data, size, width));
    fragmentShaderInputs += `uniform sampler2D _input${index};\n`;
  }

  const fragmentShaderMain = `
void main() {
  gl_FragColor = kernel(${[...Array(inputs.length).keys()].map(i => `texture2D(_input${i}, pos)`).join(', ')});
}
  `;

  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  const fragmentShaderSource = fragmentShaderHeader + fragmentShaderInputs + code + fragmentShaderMain;
  gl.shaderSource(fragmentShader, fragmentShaderSource);
  gl.compileShader(fragmentShader);
  console.log(fragmentShaderSource);

  if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
    const source = fragmentShaderSource.split('\n');
    let dbgMsg = "ERROR: Could not build shader (fatal).\n\n------------------ KERNEL CODE DUMP ------------------\n"

    for (let l = 0; l < source.length; l++)
      dbgMsg += `${l + 1}> ${source[l]}\n`;

    dbgMsg += "\n--------------------- ERROR  LOG ---------------------\n" + gl.getShaderInfoLog(fragmentShader);

    throw new Error(dbgMsg);
  }

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error('Failed to link GLSL program code.');

  const aPosition = gl.getAttribLocation(program, 'position');
  const aTexture = gl.getAttribLocation(program, 'texture');

  gl.useProgram(program);

  gl.viewport(0, 0, inputSize, inputSize);
  gl.bindFramebuffer(gl.FRAMEBUFFER, gl.createFramebuffer());

  const output = new Float32Array(inputSize * inputSize * 4);
  const outTexture = createTexture(output, inputSize, 4);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, outTexture, 0);
  const frameBufferStatus = (gl.checkFramebufferStatus(gl.FRAMEBUFFER) == gl.FRAMEBUFFER_COMPLETE);
  if (!frameBufferStatus)
    throw new Error('Error attaching float texture to framebuffer. Your device is probably incompatible');

  for (const [index, texture] of inputTextures.entries()) {
    const textureUniform = gl.getUniformLocation(program, `_input${index}`);

    gl.activeTexture(gl.TEXTURE0 + index);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(textureUniform, index);
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, textureBuffer);
  gl.enableVertexAttribArray(aTexture);
  gl.vertexAttribPointer(aTexture, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.enableVertexAttribArray(aPosition);
  gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  gl.readPixels(0, 0, inputSize, inputSize, gl.RGBA, gl.FLOAT, output);

  return output;
}
