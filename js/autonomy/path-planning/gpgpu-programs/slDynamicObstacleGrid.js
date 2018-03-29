const DYNAMIC_OBSTACLE_VERTEX_SHADER = `#version 300 es
uniform mat3 xform;
in vec3 position;
out float color;

void main(void) {
  gl_Position = vec4((xform * vec3(position.xy, 1)).xy, position.z, 1);

  // The z coordinate is 0.25 for collision zone and 0.75 for hazard zone,
  // so that the collision zone is drawn on top.
  // Convert this to 1.0 for collision zone, 0.5 for hazard zone
  color = (1.0 - step(0.5, position.z)) * 0.5 + 0.5;
}
`;

const DYNAMIC_OBSTACLE_KERNEL = `
  in float color;

  vec4 kernel() {
    return vec4(color, 0, 0, 1);
  }
`;

let obstacleVertices;
let obstacleXform;
const numDynamicFrames = 20;

// Draw dynamic obstacle triangles to SL-space obstacle grid
export default {
  setUp() {
    return {
      kernel: DYNAMIC_OBSTACLE_KERNEL,
      vertexShader: DYNAMIC_OBSTACLE_VERTEX_SHADER,
      output: { name: 'slDynamicObstacleGrid', textureType: '2DArray', depth: numDynamicFrames },
      draw: (gpgpu, program) => {
        const gl = gpgpu.gl;

        gl.enable(gl.DEPTH_TEST);

        const renderbuffer = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, program.inputWidth, program.inputHeight);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, renderbuffer);

        for (let frame = 0; frame < numDynamicFrames; frame++) {
          gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, program.outputTexture, 0, frame);
          const frameBufferStatus = (gl.checkFramebufferStatus(gl.FRAMEBUFFER) == gl.FRAMEBUFFER_COMPLETE);
          if (!frameBufferStatus)
            throw new Error('Error attaching float texture to framebuffer. Your device is probably incompatible.');

          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

          if (obstacleVertices[frame].length > 0) {
            const buf = gl.createBuffer();

            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(gl.ARRAY_BUFFER, obstacleVertices[frame], gl.STATIC_DRAW);
            gl.enableVertexAttribArray(program.positionLocation);
            gl.vertexAttribPointer(program.positionLocation, 3, gl.FLOAT, false, 0, 0);

            const xformLocation = gl.getUniformLocation(program.glProgram, 'xform');
            gl.uniformMatrix3fv(xformLocation, false, obstacleXform.elements);

            gl.drawArrays(gl.TRIANGLES, 0, obstacleVertices[frame].length / 3);

            if (frame == 0) {
              const obstacleGrid = new Float32Array(program.inputWidth * program.inputHeight * 4);
              gl.readPixels(0, 0, program.inputWidth, program.inputHeight, gl.RGBA, gl.FLOAT, obstacleGrid);
              gpgpu._dynamicObstacleGrid = obstacleGrid;
            }

            gl.deleteBuffer(buf);
          }
        }

        gl.bindRenderbuffer(gl.RENDERBUFFER, null);
        gl.deleteRenderbuffer(renderbuffer);
        gl.disable(gl.DEPTH_TEST);
      }
    };
  },

  update(config, slWidth, slHeight, slCenterPoint, vehicleStation, startTime, dynamicFrameTime, dynamicObstacles) {
    obstacleVertices = [];

    let time = startTime;
    for (let frame = 0; frame < numDynamicFrames; frame++) {
      const vertices = Array.prototype.concat.apply([], dynamicObstacles.map(o => o.verticesInTimeRange(time, time + dynamicFrameTime, config)));
      obstacleVertices.push(new Float32Array(vertices));
      time += dynamicFrameTime;
    }

    const translate = new THREE.Matrix3();
    translate.set(
      1, 0, -slCenterPoint.x - vehicleStation,
      0, 1, -slCenterPoint.y,
      0, 0, 1
    );

    const scale = new THREE.Matrix3();
    scale.set(
      2 / (slWidth * config.slGridCellSize), 0, 0,
      0, 2 / (slHeight * config.slGridCellSize), 0,
      0, 0, 1
    );

    obstacleXform = scale.multiply(translate);

    return {
      width: slWidth,
      height: slHeight
    }
  }
}
