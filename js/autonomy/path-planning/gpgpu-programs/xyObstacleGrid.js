const OBSTACLE_VERTEX_SHADER = `#version 300 es
uniform mat3 xform;
in vec2 position;

void main(void) {
  gl_Position = vec4((xform * vec3(position, 1)).xy, 0, 1);
}
`;

const OBSTACLE_KERNEL = `
  vec4 kernel() {
    return vec4(1, 0, 0, 1);
  }
`;

let obstacleVertices;
let obstacleXform;

// Draw obstacle triangles to XY-space obstacle grid
export default {
  setUp() {
    return {
      kernel: OBSTACLE_KERNEL,
      vertexShader: OBSTACLE_VERTEX_SHADER,
      output: { name: 'xyObstacleGrid' },
      draw: (gpgpu, program) => {
        const gl = gpgpu.gl;

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        if (obstacleVertices.length > 0) {
          const buf = gl.createBuffer();

          gl.bindBuffer(gl.ARRAY_BUFFER, buf);
          gl.bufferData(gl.ARRAY_BUFFER, obstacleVertices, gl.STATIC_DRAW);
          gl.enableVertexAttribArray(program.positionLocation);
          gl.vertexAttribPointer(program.positionLocation, 2, gl.FLOAT, false, 0, 0);

          const xformLocation = gl.getUniformLocation(program.glProgram, 'xform');
          gl.uniformMatrix3fv(xformLocation, false, obstacleXform.elements);

          gl.drawArrays(gl.TRIANGLES, 0, obstacleVertices.length / 2);

          gl.deleteBuffer(buf);
        }
      }
    };
  },

  update(config, xyWidth, xyHeight, xyCenterPoint, vehicleXform, obstacles) {
    obstacleVertices = new Float32Array(Array.prototype.concat.apply([], obstacles.map(o => o.vertices)));

    const translate = new THREE.Matrix3();
    translate.set(
      1, 0, -xyCenterPoint.x,
      0, 1, -xyCenterPoint.y,
      0, 0, 1
    );

    const scale = new THREE.Matrix3();
    scale.set(
      2 / (xyWidth * config.xyGridCellSize), 0, 0,
      0, 2 / (xyHeight * config.xyGridCellSize), 0,
      0, 0, 1
    );

    obstacleXform = scale.multiply(translate).multiply(vehicleXform);

    return {
      width: xyWidth,
      height: xyHeight
    }
  }
}
