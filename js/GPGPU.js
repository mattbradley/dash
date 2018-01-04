// Adapted from https://github.com/turbo/js/blob/master/turbo.js

const vertexShaderCode = `#version 300 es
in vec2 position;
in vec2 texture;
out vec2 gpgpuPos;

void main(void) {
  gpgpuPos = texture;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const fragmentShaderHeader = `#version 300 es
precision mediump float;
in vec2 gpgpuPos;
out vec4 gpgpuOut;
`;

export default class {
  static alloc(size, stride) {
    if (!Number.isInteger(stride) || stride < 1 || stride > 4)
      throw new Error("Data stride must be an integer between 1 and 4.");

    // Find the smallest perfect square greater than or equal to size
    const squareSize = Math.pow(Math.ceil(Math.sqrt(size)), 2);

    const data = new Float32Array(squareSize * stride);
    data.gpgpuSize = size;
    data.gpgpuStride = stride;
    return data;
  }

  static run(config, kernel) {
    return (new this(config, kernel)).run();
  }

  constructor(config, kernel) {
    this.setUpGL();

    let inputs;
    let globals;

    if (Array.isArray(config)) {
      inputs = config;
      globals = [];
    } else {
      inputs = config.inputs;
      globals = config.globals;
    }

    let fragmentShaderConfig = "";
    this.inputTextures = [];

    for (const [index, data] of inputs.entries()) {
      if (data.gpgpuSize === undefined || data.gpgpuStride === undefined)
        throw new Error('GPGPU inputs must be created by the `alloc` function.');

      const size = Math.sqrt(data.length / data.gpgpuStride);
      if (size <= 0 || size % 1 != 0)
        throw new Error('GPGPU input size is expected to be a perfect square.');

      if (this.inputSize === undefined) {
        this.inputSize = size;
        this.inputDataSize = data.gpgpuSize;
      } else if (size != this.inputSize) {
        throw new Error(`All GPGPU inputs must be of the same size. Received ${data.gpgpuSize} (internal ${size * size}) but expected ${this.inputDataSize} (internal ${this.inputSize * this.inputSize}).`);
      }

      this.inputTextures.push(this.createTexture(data, size, size, data.gpgpuStride));
      fragmentShaderConfig += `uniform sampler2D _input${index};\n`;
    }

    this.globalTextures = {};

    for (const globalName in globals) {
      const { type, width, height, stride, data } = globals[globalName];

      if (type == 'texture') {
        this.globalTextures[globalName] = this.createTexture(data, width, height, stride);
        fragmentShaderConfig += `uniform sampler2D ${globalName};\n`;
      }
    }

    const vertexShader = this.gl.createShader(this.gl.VERTEX_SHADER);
    this.gl.shaderSource(vertexShader, vertexShaderCode);
    this.gl.compileShader(vertexShader);

    if (!this.gl.getShaderParameter(vertexShader, this.gl.COMPILE_STATUS)) {
      throw new Error(
        "Could not build internal vertex shader (fatal).\n" + "\n" +
        "--- CODE DUMP ---\n" + vertexShaderCode + "\n\n" +
        "--- ERROR LOG ---\n" + this.gl.getShaderInfoLog(vertexShader)
      );
    }

    const fragmentShaderMain = `
void main() {
  gpgpuOut = vec4(kernel(${[...Array(inputs.length).keys()].map(i => `texture(_input${i}, gpgpuPos)`).join(', ')}));
}
    `;

    const fragmentShader = this.gl.createShader(this.gl.FRAGMENT_SHADER);
    const fragmentShaderSource = fragmentShaderHeader + fragmentShaderConfig + kernel + fragmentShaderMain;
    this.gl.shaderSource(fragmentShader, fragmentShaderSource);
    this.gl.compileShader(fragmentShader);

    if (!this.gl.getShaderParameter(fragmentShader, this.gl.COMPILE_STATUS)) {
      const source = fragmentShaderSource.split('\n');
      let dbgMsg = "ERROR: Could not build shader (fatal).\n\n------------------ KERNEL CODE DUMP ------------------\n"

      for (let l = 0; l < source.length; l++)
        dbgMsg += `${l + 1}> ${source[l]}\n`;

      dbgMsg += "\n--------------------- ERROR  LOG ---------------------\n" + this.gl.getShaderInfoLog(fragmentShader);

      throw new Error(dbgMsg);
    }

    this.program = this.gl.createProgram();
    this.gl.attachShader(this.program, vertexShader);
    this.gl.attachShader(this.program, fragmentShader);
    this.gl.linkProgram(this.program);

    if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS))
      throw new Error('Failed to link GLSL program code.');

    const positionBuffer = this.newBuffer([-1, -1, 1, -1, 1, 1, -1, 1]);
    const textureBuffer = this.newBuffer([0, 0, 1, 0, 1, 1, 0, 1]);
    const indexBuffer = this.newBuffer([1, 2, 0, 3, 0, 2], Uint16Array, this.gl.ELEMENT_ARRAY_BUFFER);

    const aPosition = this.gl.getAttribLocation(this.program, 'position');
    const aTexture = this.gl.getAttribLocation(this.program, 'texture');

    this.gl.useProgram(this.program);
    this.gl.viewport(0, 0, this.inputSize, this.inputSize);
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.gl.createFramebuffer());
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, textureBuffer);
    this.gl.enableVertexAttribArray(aTexture);
    this.gl.vertexAttribPointer(aTexture, 2, this.gl.FLOAT, false, 0, 0);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
    this.gl.enableVertexAttribArray(aPosition);
    this.gl.vertexAttribPointer(aPosition, 2, this.gl.FLOAT, false, 0, 0);
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  }

  run() {
    const outTexture = this.createTexture(null, this.inputSize, this.inputSize, 4);
    this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, outTexture, 0);
    const frameBufferStatus = (this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER) == this.gl.FRAMEBUFFER_COMPLETE);
    if (!frameBufferStatus)
      throw new Error('Error attaching float texture to framebuffer. Your device is probably incompatible');

    let textureIndex = 0;

    for (const texture of this.inputTextures) {
      const textureUniform = this.gl.getUniformLocation(this.program, `_input${textureIndex}`);

      this.gl.activeTexture(this.gl.TEXTURE0 + textureIndex);
      this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
      this.gl.uniform1i(textureUniform, textureIndex);
      textureIndex++;
    }

    for (const globalName in this.globalTextures) {
      const textureUniform = this.gl.getUniformLocation(this.program, globalName);

      this.gl.activeTexture(this.gl.TEXTURE0 + textureIndex);
      this.gl.bindTexture(this.gl.TEXTURE_2D, this.globalTextures[globalName]);
      this.gl.uniform1i(textureUniform, textureIndex);
      textureIndex++;
    }

    this.gl.drawElements(this.gl.TRIANGLES, 6, this.gl.UNSIGNED_SHORT, 0);

    const output = new Float32Array(this.inputSize * this.inputSize * 4);
    this.gl.readPixels(0, 0, this.inputSize, this.inputSize, this.gl.RGBA, this.gl.FLOAT, output);

    return output.subarray(0, this.inputDataSize * 4);
  }

  setUpGL() {
    const canvas = document.createElement('canvas');
    const attr = { alpha: false, antialias: false };
    this.gl = canvas.getContext("webgl2", attr) || canvas.getContext("experimental-webgl2", attr);

    if (!this.gl)
      throw new Error("Unable to initialize WebGL2. Your browser may not support it.");

    if (!this.gl.getExtension('EXT_color_buffer_float'))
      throw new Error('Required texture format EXT_color_buffer_float not supported.');
  }

  newBuffer(data, klass, target) {
    const buf = this.gl.createBuffer();

    this.gl.bindBuffer((target || this.gl.ARRAY_BUFFER), buf);
    this.gl.bufferData((target || this.gl.ARRAY_BUFFER), new (klass || Float32Array)(data), this.gl.STATIC_DRAW);

    return buf;
  }

  createTexture(data, width, height, stride) {
    const texture = this.gl.createTexture();

    let internalFormat, format;

    switch (stride) {
      case 1:
        internalFormat = this.gl.R32F;
        format = this.gl.RED;
        break;
      case 2:
        internalFormat = this.gl.RG32F;
        format = this.gl.RG;
        break;
      case 3:
        internalFormat = this.gl.RGB32F;
        format = this.gl.RGB;
        break;
      case 4:
        internalFormat = this.gl.RGBA32F;
        format = this.gl.RGBA;
        break;
      default:
        throw("Texel stride must between 1 and 4.");
    }

    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, this.gl.FLOAT, data);
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);

    return texture;
  }
}
