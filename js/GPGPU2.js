// Adapted from https://github.com/turbo/js/blob/master/turbo.js

const vertexShaderCode = `#version 300 es
in vec2 position;
in vec2 texture;
out vec2 kernelPosition;

void main(void) {
  kernelPosition = texture;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const fragmentShaderHeader = `#version 300 es
precision mediump float;
in vec2 kernelPosition;
out vec4 kernelOut;
uniform ivec2 kernelSize;
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

  constructor(configs, shared = {}) {
    this._setUpGL();

    this.outputTextures = {};
    this.sharedTextures = {};

    this.programs = configs.map(c => this._prepareProgram(c));

    for (const name in shared) {
      const { width, height, channels, data, ...options } = shared[name];
      this.sharedTextures[name] = this._createTexture(data, width, height, channels, options);
    }
  }

  updateProgramInputs(programIndex, inputs) {
    const program = this.programs[programIndex];

    if (!program)
      throw new Error(`Program with index ${programIndex} does not exist.`);

    if (program.inputTextures.length != inputs.length)
      throw new Error(`You must provide the same number of inputs as when the program was set up: got ${inputs.length} but expected ${program.inputTextures.length}.`);

    const previousInputWidth = program.inputWidth;
    const previousInputHeight = program.inputHeight;

    const config = program.config;

    if (config.width === undefined || config.height === undefined) {
      program.inputWidth = undefined;
      program.inputHeight = undefined;
      program.inputDataSize = undefined;
    }

    this._prepareProgramInputs(program, inputs);

    if (program.inputWidth != previousInputWidth || program.inputHeight != previousInputHeight) {
      this.gl.useProgram(program.glProgram);
      this.gl.uniform2i(program.kernelSizeLocation, program.inputWidth, program.inputHeight);
      this._prepareProgramOutput(program);
    }
  }

  updateProgramSize(programIndex, width, height) {
    const program = this.programs[programIndex];

    if (!program)
      throw new Error(`Program with index ${programIndex} does not exist.`);

    if (program.inputTextures.length != 0)
      throw new Error(`Size can only be updated on programs with no inputs.`);

    if (width == program.inputWidth && height == program.inputHeight) return;

    program.inputWidth = width;
    program.inputHeight = height;
    program.inputDataSize = width * height;

    this._prepareProgramOutput(program);
  }

  updateProgramGlobal(programIndex, globalName, value) {
    const program = this.programs[programIndex];

    if (!program)
      throw new Error(`Program with index ${programIndex} does not exist.`);

    let global;

    if (global = program.uniforms[globalName]) {
      this._setUniform(global.type, global.location, value)
    } else if (global = program.globalTextures[globalName]) {
      if (typeof(value) != 'object' || value.type != 'texture')
        throw new Error(`Expected texture type for global ${globalName}.`);

      const { width, height, channels, data, ...options } = global;
      program.globalTextures[globalName].texture = this._createTexture(data, width, height, channels, options);
    } else {
      throw new Error(`The global ${globalName} does not exist in this program.`);
    }
  }

  run() {
    const outputs = [];

    for (const program of this.programs) {
      this.gl.useProgram(program.glProgram);
      this.gl.viewport(0, 0, program.inputWidth, program.inputHeight);
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, program.frameBuffer);

      for (const [index, inputTexture] of program.inputTextures.entries()) {
        this.gl.activeTexture(this.gl.TEXTURE0 + index);
        this.gl.bindTexture(this.gl.TEXTURE_2D, inputTexture);
      }

      for (const globalName in program.globalTextures) {
        const globalTexture = program.globalTextures[globalName];
        this.gl.activeTexture(this.gl.TEXTURE0 + globalTexture.index);
        this.gl.bindTexture(this.gl.TEXTURE_2D, globalTexture.texture || this.sharedTextures[globalTexture.name] || this.outputTextures[globalTexture.name]);
      }

      if (typeof(program.draw) == 'function') {
        program.draw(this.gl, program);
      } else {
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.textureBuffer);
        this.gl.enableVertexAttribArray(program.textureLocation);
        this.gl.vertexAttribPointer(program.textureLocation, 2, this.gl.FLOAT, false, 0, 0);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
        this.gl.enableVertexAttribArray(program.positionLocation);
        this.gl.vertexAttribPointer(program.positionLocation, 2, this.gl.FLOAT, false, 0, 0);
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);

        this.gl.drawElements(this.gl.TRIANGLES, 6, this.gl.UNSIGNED_SHORT, 0);
      }

      if (program.output && program.output.name) {
        outputs.push(null);
      } else {
        const output = new Float32Array(program.inputWidth * program.inputHeight * 4);
        this.gl.readPixels(0, 0, program.inputWidth, program.inputHeight, this.gl.RGBA, this.gl.FLOAT, output);
        outputs.push(output.subarray(0, program.inputDataSize * 4));
      }
    }

    return outputs;
  }

  _setUpGL() {
    const canvas = document.createElement('canvas');
    const attr = { alpha: false, antialias: false };
    this.gl = canvas.getContext("webgl2", attr) || canvas.getContext("experimental-webgl2", attr);

    if (!this.gl)
      throw new Error("Unable to initialize WebGL2. Your browser may not support it.");

    if (!this.gl.getExtension('EXT_color_buffer_float'))
      throw new Error('Required texture format EXT_color_buffer_float not supported.');

    this.positionBuffer = this._newBuffer([-1, -1, 1, -1, 1, 1, -1, 1]);
    this.textureBuffer = this._newBuffer([0, 0, 1, 0, 1, 1, 0, 1]);
    this.indexBuffer = this._newBuffer([1, 2, 0, 3, 0, 2], Uint16Array, this.gl.ELEMENT_ARRAY_BUFFER);
  }

  _prepareProgram(config) {
    const program = { config };

    program.draw = config.draw;

    if (config.width && config.height) {
      program.inputWidth = config.width;
      program.inputHeight = config.height;
      program.inputDataSize = config.width * config.height;
    }

    program.output = config.output;

    const kernel = config.kernel;

    if (typeof(kernel) != 'string' || kernel.length == 0)
      throw new Error("Kernel code cannot be empty.");

    const inputs = config.inputs || [];
    const globals = config.globals || {};

    this._prepareProgramInputs(program, inputs);

    let fragmentShaderConfig = "";
    
    for (const index in inputs)
      fragmentShaderConfig += `uniform sampler2D _input${index};\n`;

    if (program.inputWidth === undefined || program.inputHeight === undefined)
      throw new Error("Unknown kernel size. You must provide either an input or the `width` and `height` parameters in the kernel config.");

    program.globalTextures = {};
    program.uniforms = {};

    for (const globalName in globals) {
      const global = globals[globalName];

      if (typeof(global) == 'number') {
        program.uniforms[globalName] = {
          type: 'float',
          value: global
        };
        fragmentShaderConfig += `uniform float ${globalName};\n`;
      } else if (Array.isArray(global)) {
        if (global.length < 2 || global.length > 4)
          throw new Error(`Array globals can only have lengths of 2, 3, or 4 elements (corresponding to vec2, vec3, and vec4).`);

        const type = ['vec2', 'vec3', 'vec4'][global.length - 2];
        program.uniforms[globalName] = {
          type: type,
          value: global
        };
        fragmentShaderConfig += `uniform ${type} ${globalName};\n`;
      } else {
        const { type, width, height, channels, data, value, name, ...options } = global;

        if (type == 'texture') {
          program.globalTextures[globalName] = { texture: data ? this._createTexture(data, width, height, channels, options) : null };
          fragmentShaderConfig += `uniform sampler2D ${globalName};\n`;
        } else if (type == 'outputTexture' || type == 'sharedTexture') {
          program.globalTextures[globalName] = { texture: null, name: name || globalName };
          fragmentShaderConfig += `uniform sampler2D ${globalName};\n`;
        } else {
          program.uniforms[globalName] = { type, value };
          fragmentShaderConfig += `uniform ${type} ${globalName};\n`;
        }
      }
    }

    const vertexShader = this.gl.createShader(this.gl.VERTEX_SHADER);
    this.gl.shaderSource(vertexShader, config.vertexShader || vertexShaderCode);
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
  kernelOut = vec4(kernel(${[...Array(inputs.length).keys()].map(i => `texture(_input${i}, kernelPosition)`).join(', ')}));
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

    program.glProgram = this.gl.createProgram();
    this.gl.attachShader(program.glProgram, vertexShader);
    this.gl.attachShader(program.glProgram, fragmentShader);
    this.gl.linkProgram(program.glProgram);
    this.gl.useProgram(program.glProgram);

    if (!this.gl.getProgramParameter(program.glProgram, this.gl.LINK_STATUS))
      throw new Error('Failed to link GLSL program code.');

    let textureIndex = 0;

    for (const input of program.inputTextures) {
      const location = this.gl.getUniformLocation(program.glProgram, `_input${textureIndex}`);
      this.gl.uniform1i(location, textureIndex);
      textureIndex++;
    }

    for (const globalName in program.globalTextures) {
      program.globalTextures[globalName].index = textureIndex;
      const location = this.gl.getUniformLocation(program.glProgram, globalName);
      this.gl.uniform1i(location, textureIndex);
      textureIndex++;
    }

    for (const uniformName in program.uniforms) {
      const { type, value } = program.uniforms[uniformName];
      const location = program.uniforms[uniformName].location = this.gl.getUniformLocation(program.glProgram, uniformName);

      this._setUniform(type, location, value);

      delete program.uniforms[uniformName].value;
    }

    program.kernelSizeLocation = this.gl.getUniformLocation(program.glProgram, 'kernelSize');
    this.gl.uniform2i(program.kernelSizeLocation, program.inputWidth, program.inputHeight);

    program.positionLocation = this.gl.getAttribLocation(program.glProgram, 'position');
    program.textureLocation = this.gl.getAttribLocation(program.glProgram, 'texture');

    program.frameBuffer = this.gl.createFramebuffer();
    this._prepareProgramOutput(program);

    return program;
  }

  _prepareProgramInputs(program, inputs) {
    program.inputTextures = [];

    for (const [index, data] of inputs.entries()) {
      if (data.gpgpuSize === undefined || data.gpgpuStride === undefined)
        throw new Error('GPGPU inputs must be created by the `alloc` function.');

      const size = Math.sqrt(data.length / data.gpgpuStride);
      if (size <= 0 || size % 1 != 0)
        throw new Error('GPGPU input size is expected to be a perfect square.');

      if (program.inputWidth === undefined || program.inputHeight === undefined) {
        program.inputWidth = size;
        program.inputHeight = size;
        program.inputDataSize = data.gpgpuSize;
      } else if (size != program.inputWidth || size != program.inputHeight) {
        throw new Error(`All GPGPU inputs must be of the same size. Received ${data.gpgpuSize} (internal ${size * size}) but expected ${program.inputDataSize} (internal ${program.inputWidth * program.inputHeight}).`);
      }

      program.inputTextures.push(this._createTexture(data, size, size, data.gpgpuStride));
    }
  }

  _prepareProgramOutput(program) {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, program.frameBuffer);

    const outputTexture = this._createTexture(null, program.inputWidth, program.inputHeight, 4, program.output);
    this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, outputTexture, 0);
    const frameBufferStatus = (this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER) == this.gl.FRAMEBUFFER_COMPLETE);
    if (!frameBufferStatus)
      throw new Error('Error attaching float texture to framebuffer. Your device is probably incompatible');

    if (program.output && program.output.name)
      this.outputTextures[program.output.name] = outputTexture;
  }

  _setUniform(type, location, value) {
    switch (type) {
      case 'int': this.gl.uniform1i(location, value); break;
      case 'float': this.gl.uniform1f(location, value); break;
      case 'vec2': this.gl.uniform2fv(location, value); break;
      case 'vec3': this.gl.uniform3fv(location, value); break;
      case 'vec4': this.gl.uniform4fv(location, value); break;
      case 'mat3': this.gl.uniformMatrix3fv(location, value); break;
      default: throw new Error(`Unknown uniform type ${type}.`);
    }
  }

  _newBuffer(data, klass, target) {
    const buf = this.gl.createBuffer();

    this.gl.bindBuffer((target || this.gl.ARRAY_BUFFER), buf);
    this.gl.bufferData((target || this.gl.ARRAY_BUFFER), new (klass || Float32Array)(data), this.gl.STATIC_DRAW);

    return buf;
  }

  _createTexture(data, width, height, channels, options = {}) {
    const texture = this.gl.createTexture();

    let internalFormat, format;

    switch (channels) {
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
        throw("Texture channels must between 1 and 4.");
    }

    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, options.filter == 'linear' ? this.gl.LINEAR : this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, options.filter == 'linear' ? this.gl.LINEAR : this.gl.NEAREST);
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, this.gl.FLOAT, data);
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);

    return texture;
  }
}
