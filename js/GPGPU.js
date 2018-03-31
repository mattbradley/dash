/* Partially adapted from https://github.com/turbo/js/blob/master/turbo.js
 *
 * Turbo.js License:
 * Copyright (c) 2016 minxomat
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

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
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler2DArray;
precision highp sampler3D;
precision highp samplerCube;

in vec2 kernelPosition;
out vec4 kernelOut;
uniform ivec2 kernelSize;
`;

export default class GPGPU {
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
      const options = shared[name];
      const { width, height, channels, data } = options;
      this.sharedTextures[name] = this._createTexture(data, width, height, channels, options);
    }
  }

  updateSharedTextures(shared) {
    this.sharedTextures = {};

    for (const name in shared) {
      const options = shared[name];
      const { width, height, channels, data } = options;
      if (this.sharedTextures[name]) this.gl.deleteTexture(this.sharedTextures[name]);
      this.sharedTextures[name] = this._createTexture(data, width, height, channels, options);
    }
  }

  updateProgram(programOrProgramIndex, config) {
    const program = typeof(programOrProgramIndex) == 'number' ? this.programs[programOrProgramIndex] : programOrProgramIndex;

    if (!program)
      throw new Error(`Program with index ${programOrProgramIndex} does not exist.`);

    if (config.inputs)
      throw new Error('The `updateProgram` function cannot be used to update inputs. Use `updateProgramInputs` instead.');

    if (config.meta)
      program.meta = Object.assign(program.meta, config.meta);

    if (config.width !== undefined && config.height !== undefined)
      this.updateProgramSize(program, config.width, config.height);

    if (typeof(config.uniforms) == 'object')
      this.updateProgramUniforms(program, config.uniforms);
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

  updateProgramSize(programOrProgramIndex, width, height) {
    const program = typeof(programOrProgramIndex) == 'number' ? this.programs[programOrProgramIndex] : programOrProgramIndex;

    if (!program)
      throw new Error(`Program with index ${programOrProgramIndex} does not exist.`);

    if (program.inputTextures.length != 0)
      throw new Error(`Size can only be updated on programs with no inputs.`);

    if (width == program.inputWidth && height == program.inputHeight) return;

    program.inputWidth = width;
    program.inputHeight = height;
    program.inputDataSize = width * height;

    this.gl.useProgram(program.glProgram);
    this.gl.uniform2i(program.kernelSizeLocation, program.inputWidth, program.inputHeight);
    this._prepareProgramOutput(program);
  }

  updateProgramUniforms(programOrProgramIndex, uniforms) {
    const program = typeof(programOrProgramIndex) == 'number' ? this.programs[programOrProgramIndex] : programOrProgramIndex;
    this.gl.useProgram(program.glProgram);

    if (!program)
      throw new Error(`Program with index ${programOrProgramIndex} does not exist.`);

    for (const uniformName in uniforms) {
      const value = uniforms[uniformName];
      let uniform;

      if (uniform = program.uniforms[uniformName]) {
        this._setUniform(uniform.type, uniform.location, value)
      } else if (uniform = program.uniformTextures[uniformName]) {
        if (typeof(value) != 'object' || value.type != 'texture')
          throw new Error(`Expected texture type for uniform ${uniformName}.`);

        const { width, height, channels, data } = uniform;
        if (program.uniformTextures[uniformName].texture) this.gl.deleteTexture(program.uniformTextures[uniformName].texture);
        program.uniformTextures[uniformName].texture = this._createTexture(data, width, height, channels, uniform);
      } else {
        throw new Error(`The uniform ${uniformName} does not exist in this program.`);
      }
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

      for (const uniformName in program.uniformTextures) {
        const uniformTexture = program.uniformTextures[uniformName];
        this.gl.activeTexture(this.gl.TEXTURE0 + uniformTexture.index);
        this.gl.bindTexture(uniformTexture.target, uniformTexture.texture || this.sharedTextures[uniformTexture.name] || this.outputTextures[uniformTexture.name]);
      }

      if (typeof(program.draw) == 'function') {
        program.draw(this, program);
      } else {
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.textureBuffer);
        this.gl.enableVertexAttribArray(program.textureLocation);
        this.gl.vertexAttribPointer(program.textureLocation, 2, this.gl.FLOAT, false, 0, 0);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
        this.gl.enableVertexAttribArray(program.positionLocation);
        this.gl.vertexAttribPointer(program.positionLocation, 2, this.gl.FLOAT, false, 0, 0);
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);

        if (program.drawProxy) {
          const draw = (() => this.gl.drawElements(this.gl.TRIANGLES, 6, this.gl.UNSIGNED_SHORT, 0)).bind(this);
          program.drawProxy(this, program, draw);
        } else {
          this.gl.drawElements(this.gl.TRIANGLES, 6, this.gl.UNSIGNED_SHORT, 0);
        }
      }

      if (program.output && program.output.name && !program.output.read) {
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
    let canvas;

    if (self.document)
      canvas = document.createElement('canvas');
    else if (self.OffscreenCanvas)
      canvas = new OffscreenCanvas(0, 0);
    else
      throw new Error('Could not create a canvas.');

    const attr = { alpha: false, antialias: false };
    this.gl = canvas.getContext("webgl2", attr) || canvas.getContext("experimental-webgl2", attr);

    if (!this.gl)
      throw new Error("Unable to initialize WebGL2. Your browser may not support it.");

    if (!this.gl.getExtension('EXT_color_buffer_float'))
      throw new Error('Required WebGL extension EXT_color_buffer_float not supported.');

    if (!this.gl.getExtension('OES_texture_float_linear'))
      throw new Error('Required WebGL extension OES_texture_float_linear not supported.');

    this.positionBuffer = this._newBuffer([-1, -1, 1, -1, 1, 1, -1, 1]);
    this.textureBuffer = this._newBuffer([0, 0, 1, 0, 1, 1, 0, 1]);
    this.indexBuffer = this._newBuffer([1, 2, 0, 3, 0, 2], Uint16Array, this.gl.ELEMENT_ARRAY_BUFFER);
  }

  _prepareProgram(config) {
    const program = { config };

    program.draw = config.draw;
    program.drawProxy = config.drawProxy;
    program.meta = Object.assign({}, config.meta);

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
    const uniforms = config.uniforms || {};

    this._prepareProgramInputs(program, inputs);

    let fragmentShaderConfig = "";
    
    for (const index in inputs)
      fragmentShaderConfig += `uniform sampler2D _input${index};\n`;

    if (program.inputWidth === undefined || program.inputHeight === undefined)
      throw new Error("Unknown kernel size. You must provide either an input or the `width` and `height` parameters in the kernel config.");

    program.uniformTextures = {};
    program.uniforms = {};

    for (const uniformName in uniforms) {
      const uniform = uniforms[uniformName];

      if (typeof(uniform) == 'number') {
        program.uniforms[uniformName] = {
          type: 'float',
          value: uniform
        };
        fragmentShaderConfig += `uniform float ${uniformName};\n`;
      } else if (Array.isArray(uniform)) {
        if (uniform.length < 2 || uniform.length > 4)
          throw new Error(`Array uniforms can only have lengths of 2, 3, or 4 elements (corresponding to vec2, vec3, and vec4).`);

        const type = ['vec2', 'vec3', 'vec4'][uniform.length - 2];
        program.uniforms[uniformName] = {
          type: type,
          value: uniform
        };
        fragmentShaderConfig += `uniform ${type} ${uniformName};\n`;
      } else {
        const { type, width, height, channels, data, value, length, name } = uniform;

        if (type == 'texture' || type == 'outputTexture' || type == 'sharedTexture') {
          let target, type;

          if (uniform.textureType == '3D') {
            target = this.gl.TEXTURE_3D;
            type = 'sampler3D';
          } else if (uniform.textureType == '2DArray') {
            target = this.gl.TEXTURE_2D_ARRAY;
            type = 'sampler2DArray';
          } else {
            target = this.gl.TEXTURE_2D;
            type = 'sampler2D';
          }

          if (type == 'texture') {
            program.uniformTextures[uniformName] = { target, texture: data ? this._createTexture(data, width, height, channels, uniform) : null };
          } else {
            program.uniformTextures[uniformName] = { target, texture: null, name: name || uniformName };
          }

          fragmentShaderConfig += `uniform ${type} ${uniformName};\n`;
        } else {
          program.uniforms[uniformName] = { type, value };
          if (length !== undefined)
            fragmentShaderConfig += `uniform ${type} ${uniformName}[${length}];\n`;
          else
            fragmentShaderConfig += `uniform ${type} ${uniformName};\n`;
        }
      }
    }

    const vertexShader = this.gl.createShader(this.gl.VERTEX_SHADER);
    this.gl.shaderSource(vertexShader, config.vertexShader || vertexShaderCode);
    this.gl.compileShader(vertexShader);

    if (!this.gl.getShaderParameter(vertexShader, this.gl.COMPILE_STATUS)) {
      throw new Error(
        "Could not build vertex shader (fatal).\n" + "\n" +
        "--- CODE DUMP ---\n" + (config.vertexShader || vertexShaderCode) + "\n\n" +
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

    for (const uniformName in program.uniformTextures) {
      program.uniformTextures[uniformName].index = textureIndex;
      const location = this.gl.getUniformLocation(program.glProgram, uniformName);
      this.gl.uniform1i(location, textureIndex);
      textureIndex++;
    }

    for (const uniformName in program.uniforms) {
      const { type, value } = program.uniforms[uniformName];
      const location = program.uniforms[uniformName].location = this.gl.getUniformLocation(program.glProgram, uniformName);

      if (value !== undefined)
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
    if (program.inputTextures)
      program.inputTextures.forEach(t => this.gl.deleteTexture(t));

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

    if (program.output && program.output.textureType !== '3D' && program.output.textureType !== '2DArray') {
      this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, outputTexture, 0);
      const frameBufferStatus = (this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER) == this.gl.FRAMEBUFFER_COMPLETE);
      if (!frameBufferStatus)
        throw new Error('Error attaching float texture to framebuffer. Your device is probably incompatible.');
    }

    if (program.outputTexture !== undefined)
      this.gl.deleteTexture(program.outputTexture);
    program.outputTexture = outputTexture;

    if (program.output && program.output.name)
      this.outputTextures[program.output.name] = outputTexture;
  }

  _setUniform(type, location, value) {
    switch (type) {
      case 'int': this.gl.uniform1i(location, value); break;
      case 'float': Array.isArray(value) ? this.gl.uniform1fv(location, value) : this.gl.uniform1f(location, value); break;
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

    const target = options.textureType == '3D' ? this.gl.TEXTURE_3D : options.textureType == '2DArray' ? this.gl.TEXTURE_2D_ARRAY : this.gl.TEXTURE_2D;

    this.gl.bindTexture(target, texture);
    this.gl.texParameteri(target, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(target, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(target, this.gl.TEXTURE_WRAP_R, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(target, this.gl.TEXTURE_MIN_FILTER, options.filter == 'linear' ? this.gl.LINEAR : this.gl.NEAREST);
    this.gl.texParameteri(target, this.gl.TEXTURE_MAG_FILTER, options.filter == 'linear' ? this.gl.LINEAR : this.gl.NEAREST);

    if (options.textureType == '3D' || options.textureType == '2DArray') {
      this.gl.texImage3D(target, 0, internalFormat, width, height, options.depth, 0, format, this.gl.FLOAT, data);
    } else {
      this.gl.texImage2D(target, 0, internalFormat, width, height, 0, format, this.gl.FLOAT, data);
    }

    this.gl.bindTexture(target, null);

    return texture;
  }
}
