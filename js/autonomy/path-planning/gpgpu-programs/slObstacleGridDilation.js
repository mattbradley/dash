const SL_OBSTACLE_DILATION_KERNEL = `

// TODO: test performance of returning early if non-zero pixel found
vec4 kernel() {
  float val = 0.0;

  for (int d = 0; d <= lethalDilation; d++) {
    val = max(val, texture(slObstacleGrid, kernelPosition + delta * vec2(d)).r);
    val = max(val, texture(slObstacleGrid, kernelPosition + delta * vec2(-d)).r);
  }

  for (int d = lethalDilation + 1; d <= lethalDilation + hazardDilation; d++) {
    val = max(val, texture(slObstacleGrid, kernelPosition + delta * vec2(d)).r * 0.5);
    val = max(val, texture(slObstacleGrid, kernelPosition + delta * vec2(-d)).r * 0.5);
  }

  val = max(val, step(0.1, val) * 0.5);
  float obs = texture(slObstacleGrid, kernelPosition).g;

  return vec4(val, obs, 0, 1);
}

`;

export default function(config, slObstacleWidth, slObstacleHeight) {
  return [
    { // SL-space obstacle grid S dilation
      kernel: SL_OBSTACLE_DILATION_KERNEL,
      width: slObstacleWidth,
      height: slObstacleHeight,
      output: { name: 'slObstacleGridStationDilated' },
      globals: {
        slObstacleGrid: { type: 'outputTexture' },
        delta: [1 / slObstacleWidth, 0],
        lethalDilation: { type: 'int', value: Math.ceil(config.lethalDilationS / config.slGridCellSize) },
        hazardDilation: { type: 'int', value: Math.ceil(config.hazardDilationS / config.slGridCellSize) }
      }
    },
    { // SL-space obstacle grid L dilation
      kernel: SL_OBSTACLE_DILATION_KERNEL,
      width: slObstacleWidth,
      height: slObstacleHeight,
      output: { name: 'slObstacleGridDilated' },
      globals: {
        slObstacleGrid: { type: 'outputTexture', name: 'slObstacleGridStationDilated' },
        delta: [0, 1 / slObstacleHeight],
        lethalDilation: { type: 'int', value: Math.ceil(config.lethalDilationL / config.slGridCellSize) },
        hazardDilation: { type: 'int', value: Math.ceil(config.hazardDilationL / config.slGridCellSize) }
      }
    }
  ];
}
