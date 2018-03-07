const XY_OBSTACLE_COST_KERNEL = `

vec4 kernel() {
  vec2 xy = (kernelPosition - 0.5) * vec2(kernelSize) * vec2(xyGridCellSize) + xyCenterPoint;

  vec2 xyTexCoords = (xy - xyCenterPoint) / vec2(textureSize(xyslMap, 0)) / vec2(xyGridCellSize) + 0.5;
  vec2 sl = texture(xyslMap, xyTexCoords).xy;

  vec2 slTexCoords = (sl - slCenterPoint) / vec2(textureSize(slObstacleGrid, 0)) / vec2(slGridCellSize) + 0.5;
  return texture(slObstacleGrid, slTexCoords);
}

`;

// Build XY obstacle costs using XYSL map
export default {
  setUp() {
    return {
      kernel: XY_OBSTACLE_COST_KERNEL,
      output: { name: 'xyObstacleCostGrid', read: true },
      uniforms: {
        xyslMap: { type: 'outputTexture' },
        slObstacleGrid: { type: 'outputTexture', name: 'slObstacleGridDilated' },
        xyCenterPoint: { type: 'vec2' },
        xyGridCellSize: { type: 'float'},
        slCenterPoint: { type: 'vec2' },
        slGridCellSize: { type: 'float'}
      }
    };
  },

  update(config, xyWidth, xyHeight, xyCenterPoint, slCenterPoint) {
    return {
      width: xyWidth,
      height: xyHeight,
      uniforms: {
        xyCenterPoint: [xyCenterPoint.x, xyCenterPoint.y],
        xyGridCellSize: config.xyGridCellSize,
        slCenterPoint: [slCenterPoint.x, slCenterPoint.y],
        slGridCellSize: config.slGridCellSize
      }
    };
  }
}
