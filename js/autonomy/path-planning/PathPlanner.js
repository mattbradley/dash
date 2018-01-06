import GPGPU from "./../../GPGPU2.js";

const GRID_CELL_SIZE = 0.5; // meters
const STATION_INTERVAL = 0.5; // meters
const SPATIAL_HORIZON = 100; // meters

const XYSL_MAP_KERNEL = `

const float GRID_CELL_SIZE = ${GRID_CELL_SIZE};
const float STATION_INTERVAL = ${STATION_INTERVAL};

int closestSample(vec2 pos) {
  int closest = 0;
  float closestDist = distance(pos, texelFetch(centerline, ivec2(0, 0), 0).xy);
  for (int i = 1; i < numSamples; i++) {
    float dist = distance(pos, texelFetch(centerline, ivec2(i, 0), 0).xy);
    if (dist < closestDist) {
      closestDist = dist;
      closest = i;
    }
  }

  return closest;
}

vec4 kernel() {
  vec2 worldPos = (kernelPosition - 0.5) * vec2(float(kernelSize) * GRID_CELL_SIZE) + origin;
  int closest = closestSample(worldPos);
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

  float station = (float(prevIndex) + progress) * STATION_INTERVAL;
  float latitude = sign(determinant(mat2(next - prev, worldPos - prev))) * distance(worldPos, projectedPos);

  //return vec4(station, latitude, 0, 1);
  return clamp(vec4(station / 100.0, 1.0 - abs(latitude / (3.7 / 2.0)), 0, 1), 0.0, 1.0);
}

`;

export default class {
  constructor() {
  }

  plan(lanePath) {
    const centerline = lanePath.sampleStations(0, Math.ceil(SPATIAL_HORIZON / STATION_INTERVAL), STATION_INTERVAL);
    const centerlineBuffer = GPGPU.alloc(centerline.length, 2);
    const origin = centerline[0].pos;
    let maxAxisAlignedDist = 0;

    for (let i = 0; i < centerline.length; i++) {
      const pos = centerline[i].pos;
      centerlineBuffer[i * 2 + 0] = pos.x;
      centerlineBuffer[i * 2 + 1] = pos.y;

      const xDist = Math.abs(pos.x - origin.x);
      const yDist = Math.abs(pos.y - origin.y);

      if (xDist > maxAxisAlignedDist)
        maxAxisAlignedDist = xDist;

      if (yDist > maxAxisAlignedDist)
        maxAxisAlignedDist = yDist;
    }

    const xlslMapSize = Math.ceil((maxAxisAlignedDist + 10) * 2 / GRID_CELL_SIZE);

    const gpgpuPrograms = [
      {
        kernel: XYSL_MAP_KERNEL,
        size: xlslMapSize,
        globals: {
          origin: [origin.x, origin.y],
          numSamples: { type: 'int', value: centerline.length },
          centerline: {
            type: 'texture',
            height: 1,
            width: centerline.length,
            channels: 2,
            data: centerlineBuffer
          }
        }
      }
    ];

    const gpgpu = new GPGPU(gpgpuPrograms);
    return gpgpu.run();
  }
}
