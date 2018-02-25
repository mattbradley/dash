import { SHARED, SAMPLE_CUBIC_PATH_FN } from "./graphSearchShared.js";

const CUBIC_PATH_COSTS_KERNEL =
  SHARED +
  SAMPLE_CUBIC_PATH_FN +

`

/* Calculate cost of cubic path from vehicle to (stationConnectivity * numLatitudes * numAccelerations) nodes
 *   width: numLatitudes
 *   height: station * numAccelerations
 */
vec4 kernel() {
  ivec2 indexes = ivec2(kernelPosition * vec2(kernelSize));

  int latitude = indexes.x;
  int station = indexes.y / numAccelerations;
  int accelerationIndex = int(mod(float(indexes.y), float(numAccelerations)));

  vec4 pathStart = vec4(0, 0, 0, curvVehicle);
  vec4 pathEnd = texelFetch(lattice, ivec2(latitude, station), 0);

  vec4 cubicPathParams = texelFetch(cubicPathsFromVehicle, ivec2(latitude, station), 0);

  // If the path didn't converge
  if (cubicPathParams.w == 0.0) return vec4(-1);

  vec4 pathSamples[128];
  float pathSampleCurvRates[128];

  numSamples = sampleCubicPath(pathStart, pathEnd, cubicPathParams, pathSamples, pathSampleCurvRates);
  pathLength = cubicPathParams.z;

  float staticCostSum = 0.0;

  for (int i = 0; i < numSamples; i++) {
    float cost = staticCost(pathSamples[i]);

    if (cost < 0.0) {
      staticCostSum = cost;
      break;
    }

    staticCostSum += cost;
  }

  if (staticCostSum < 0.0) return vec4(-1);

  float initialVelocity = velocityVehicle;
  float initialVelocitySq = initialVelocity * initialVelocity;
  float acceleration = calculateAcceleration(accelerationIndex, initialVelocitySq, pathLength);
}

`;

export default {
  setup() {
    return {
      kernel: CUBIC_PATH_COSTS_KERNEL,
      output: { name: 'cubicPathFromVehicleCosts' },
      uniforms: {
        lattice: { type: 'sharedTexture' },
        xyslMap: { type: 'outputTexture' },
        cubicPathsFromVehicle: { type: 'outputTexture' },
        slObstacleGrid: { type: 'outputTexture', name: 'slObstacleGridDilated' },
        velocityVehicle: { type: 'float' },
        curvVehicle: { type: 'float' },
        dCurvVehicle: { type: 'float' },
        ddCurvVehicle: { type: 'float' },
        xyCenterPoint: { type: 'vec2' },
        xyGridCellSize: { type: 'float' },
        slCenterPoint: { type: 'vec2' },
        slGridCellSize: { type: 'float'}
      }
    };
  }

  update(config) {
  }
}
