const XYSL_MAP_KERNEL = `

vec4 kernel() {
  vec2 xy = (kernelPosition - 0.5) * vec2(kernelSize) * vec2(xyGridCellSize) + xyCenterPoint;

  int numSamples = textureSize(centerline, 0).x;
  int closest = 0;
  float closestDist = distance(xy, texelFetch(centerline, ivec2(0, 0), 0).xy);
  for (int i = 1; i < numSamples; i++) {
    float dist = distance(xy, texelFetch(centerline, ivec2(i, 0), 0).xy);
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

    if (distance(before, xy) < distance(after, xy)) {
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
  float progress = clamp(dot(xy - prev, next - prev) / dist / dist, 0.0, 1.0);
  vec2 projectedPos = (next - prev) * vec2(progress) + prev;

  return vec4(
    (float(prevIndex) + progress) * centerlineStationInterval,
    sign(determinant(mat2(next - prev, xy - prev))) * distance(xy, projectedPos),
    0,
    0
  );
}

`;

// Build XY-SL map
export default {
  setUp() {
    return {
      kernel: XYSL_MAP_KERNEL,
      output: { name: 'xyslMap', filter: 'linear' },
      uniforms: {
        centerline: { type: 'sharedTexture' },
        xyCenterPoint: { type: 'vec2' },
        xyGridCellSize: { type: 'float'},
        centerlineStationInterval: { type: 'float'}
      }
    };
  },

  update(config, xyWidth, xyHeight, xyCenterPoint) {
    return {
      width: xyWidth,
      height: xyHeight,
      uniforms: {
        xyCenterPoint: [xyCenterPoint.x, xyCenterPoint.y],
        xyGridCellSize: config.xyGridCellSize,
        centerlineStationInterval: config.centerlineStationInterval
      }
    };
  }
}
