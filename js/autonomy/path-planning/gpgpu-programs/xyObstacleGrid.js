const OBSTACLE_VERTEX_SHADER = `#version 300 es
uniform mat3 xform;
in vec2 position;

void main(void) {
  gl_Position = vec4((xform * vec3(position, 1)).xy, 0, 1);
}
`;

// Draw obstacle triangles to XY-space obstacle grid
export default function(config, xyWidth, xyHeight, xyCenterPoint, vehicleXform, obstacles) {
  const obstacleVertices = new Float32Array(Array.prototype.concat.apply([], obstacles.map(o => o.vertices)));

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

  const obstacleXform = scale.multiply(translate).multiply(vehicleXform);

  return {
    kernel: `vec4 kernel() { return vec4(1, 0, 0, 0); }`,
    vertexShader: OBSTACLE_VERTEX_SHADER,
    width: xyWidth,
    height: xyHeight,
    output: { name: 'xyObstacleGrid' },
    draw: (gl, program) => {
      gl.clearColor(0, 0, 0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, obstacleVertices, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(program.positionLocation);
      gl.vertexAttribPointer(program.positionLocation, 2, gl.FLOAT, false, 0, 0);

      const xformLocation = gl.getUniformLocation(program.glProgram, 'xform');
      gl.uniformMatrix3fv(xformLocation, false, obstacleXform.elements);

      gl.drawArrays(gl.TRIANGLES, 0, obstacleVertices.length / 2);
    }
  }
}
