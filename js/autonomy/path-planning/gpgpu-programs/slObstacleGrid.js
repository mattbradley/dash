const SL_OBSTACLE_KERNEL = `

vec4 kernel() {
  vec2 sl = (kernelPosition - 0.5) * vec2(kernelSize) * vec2(slGridCellSize) + slCenterPoint;
  float centerlineCoord = sl.x / stationInterval / float(textureSize(centerline, 0).x);
  if (centerlineCoord < 0.0 || centerlineCoord > 1.0) return vec4(0);

  vec3 centerlineSample = texture(centerline, vec2(centerlineCoord, 0)).xyz;
  float perpindicular = centerlineSample.z + radians(90.0);
  vec2 xy = centerlineSample.xy + sl.yy * vec2(cos(perpindicular), sin(perpindicular));

  vec2 xyTexCoords = (xy - xyCenterPoint) / vec2(textureSize(xyObstacleGrid, 0)) / vec2(xyGridCellSize) + 0.5;
  return texture(xyObstacleGrid, xyTexCoords);
}

`;

// Convert XY-space obstacle grid to SL-space obstacle grid
export default function(config, slObstacleWidth, slObstacleHeight, slCenterPoint, xyCenterPoint) {
  return {
    kernel: SL_OBSTACLE_KERNEL,
    width: slObstacleWidth,
    height: slObstacleHeight,
    output: { name: 'slObstacleGrid' },
    globals: {
      xyObstacleGrid: { type: 'outputTexture' },
      slGridCellSize: config.slGridCellSize,
      xyGridCellSize: config.xyGridCellSize,
      slCenterPoint: [slCenterPoint.x, slCenterPoint.y],
      xyCenterPoint: [xyCenterPoint.x, xyCenterPoint.y],
      stationInterval: config.stationInterval,
      centerline: { type: 'sharedTexture' }
    }
  }
}
