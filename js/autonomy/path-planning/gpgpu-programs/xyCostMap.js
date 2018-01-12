const XYSL_MAP_KERNEL = `

vec4 kernel() {
  vec2 worldPos = (kernelPosition - 0.5) * vec2(kernelSize) * vec2(xyGridCellSize) + xyCenterPoint;

  int numSamples = textureSize(centerline, 0).x;
  int closest = 0;
  float closestDist = distance(worldPos, texelFetch(centerline, ivec2(0, 0), 0).xy);
  for (int i = 1; i < numSamples; i++) {
    float dist = distance(worldPos, texelFetch(centerline, ivec2(i, 0), 0).xy);
    if (dist < closestDist) {
      closestDist = dist;
      closest = i;
    }
  }

  vec2 closestPos = texelFetch(centerline, ivec2(closest, 0), 0).xy;
  vec2 prev, next;
  int prevIndex, nextIndex;

  if (closest == 0) {
    prevIndex = 0;
    nextIndex = 1;
    prev = closestPos;
    next = texelFetch(centerline, ivec2(1, 0), 0).xy;
  } else if (closest == numSamples - 1) {
    prevIndex = closest - 1;
    nextIndex = closest;
    prev = texelFetch(centerline, ivec2(prevIndex, 0), 0).xy;
    next = closestPos;
  } else {
    vec2 before = texelFetch(centerline, ivec2(closest - 1, 0), 0).xy;
    vec2 after = texelFetch(centerline, ivec2(closest + 1, 0), 0).xy;

    if (distance(before, worldPos) < distance(after, worldPos)) {
      prevIndex = closest - 1;
      nextIndex = closest;
      prev = before;
      next = closestPos;
    } else {
      prevIndex = closest;
      nextIndex = closest + 1;
      prev = closestPos;
      next = after;
    }
  }

  float dist = distance(prev, next);
  float progress = clamp(dot(worldPos - prev, next - prev) / dist / dist, 0.0, 1.0);
  vec2 projectedPos = (next - prev) * vec2(progress) + prev;

  vec2 sl = vec2(
    (float(prevIndex) + progress) * stationInterval,
    sign(determinant(mat2(next - prev, worldPos - prev))) * distance(worldPos, projectedPos)
  );

  vec2 slTexCoords = (sl - slCenterPoint) / vec2(textureSize(slObstacleGrid, 0)) / vec2(slGridCellSize) + 0.5;
  float obstacleCost = texture(slObstacleGrid, slTexCoords).r;

  float absLatitude = abs(sl.y);
  float laneCost = max(absLatitude * laneCostSlope, step(laneShoulderLatitude, absLatitude) * laneShoulderCost);

  //return vec4(sl, cost, 1);
  //return clamp(vec4(sl.x / 100.0, 1.0 - abs(sl.y / (3.7 / 2.0)), cost, 1), 0.0, 1.0);
  return vec4(clamp(vec2(obstacleCost, laneCost), 0.0, 1.0), 0, 1);
}

`;

// Build combined XY-SL map and cost map
export default function(config, xyWidth, xyHeight, xyCenterPoint, slCenterPoint) {
  return {
    kernel: XYSL_MAP_KERNEL,
    width: xyWidth,
    height: xyHeight,
    globals: {
      slObstacleGrid: { type: 'outputTexture', name: 'slObstacleGridDilated' },
      xyCenterPoint: [xyCenterPoint.x, xyCenterPoint.y],
      slCenterPoint: [slCenterPoint.x, slCenterPoint.y],
      centerline: { type: 'sharedTexture' },
      xyGridCellSize: config.xyGridCellSize,
      slGridCellSize: config.slGridCellSize,
      stationInterval: config.stationInterval,
      laneCostSlope: config.laneCostSlope,
      laneShoulderCost: config.laneShoulderCost,
      laneShoulderLatitude: config.laneShoulderLatitude
    }
  };
}
