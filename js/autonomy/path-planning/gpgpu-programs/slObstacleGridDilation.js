const SL_OBSTACLE_DILATION_KERNEL = `

// TODO: test performance of returning early if non-zero pixel found
vec4 kernel() {
  float val = 0.0;

  for (int d = 0; d <= collisionDilation; d++) {
    val = max(val, texture(slObstacleGrid, kernelPosition + delta * vec2(d)).r);
    val = max(val, texture(slObstacleGrid, kernelPosition + delta * vec2(-d)).r);
  }

  for (int d = collisionDilation + 1; d <= collisionDilation + hazardDilation; d++) {
    val = max(val, texture(slObstacleGrid, kernelPosition + delta * vec2(d)).r * 0.5);
    val = max(val, texture(slObstacleGrid, kernelPosition + delta * vec2(-d)).r * 0.5);
  }

  val = max(val, step(0.1, val) * 0.5);

  return vec4(val, 0, 0, 1);
}

`;

export default {
  setUp() {
    return [
      { // SL-space obstacle grid S dilation
        kernel: SL_OBSTACLE_DILATION_KERNEL,
        output: { name: 'slObstacleGridStationDilated' },
        uniforms: {
          slObstacleGrid: { type: 'outputTexture' },
          delta: { type: 'vec2' },
          collisionDilation: { type: 'int' },
          hazardDilation: { type: 'int' }
        }
      },
      { // SL-space obstacle grid L dilation
        kernel: SL_OBSTACLE_DILATION_KERNEL,
        output: { name: 'slObstacleGridDilated' },
        uniforms: {
          slObstacleGrid: { type: 'outputTexture', name: 'slObstacleGridStationDilated' },
          delta: { type: 'vec2' },
          collisionDilation: { type: 'int' },
          hazardDilation: { type: 'int' }
        }
      }
    ];
  },

  update(config, slWidth, slHeight) {
    return [
      { // SL-space obstacle grid S dilation
        width: slWidth,
        height: slHeight,
        uniforms: {
          delta: [1 / slWidth, 0],
          collisionDilation: Math.ceil(config.collisionDilationS / config.slGridCellSize),
          hazardDilation: Math.ceil(config.hazardDilationS / config.slGridCellSize)
        }
      },
      { // SL-space obstacle grid L dilation
        width: slWidth,
        height: slHeight,
        uniforms: {
          delta: [0, 1 / slHeight],
          collisionDilation: Math.ceil(config.collisionDilationL / config.slGridCellSize),
          hazardDilation: Math.ceil(config.hazardDilationL / config.slGridCellSize)
        }
      }
    ];
  }
}
