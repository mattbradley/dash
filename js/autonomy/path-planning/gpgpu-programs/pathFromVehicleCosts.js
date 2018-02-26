import { SHARED_SHADER, SAMPLE_CUBIC_PATH_FN, SAMPLE_QUINTIC_PATH_FN, NUM_ACCELERATION_PROFILES, SHARED_UNIFORMS, buildUniformValues } from "./graphSearchShared.js";

function fromVehiclePathCostsKernel(pathType) {
  return SHARED_SHADER + (pathType == 'cubic' ? SAMPLE_CUBIC_PATH_FN : SAMPLE_QUINTIC_PATH_FN) +

`

/* Calculate cost of a {cubic|quintic} path from vehicle to (stationConnectivity * numLatitudes * numAccelerations) nodes
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

  vec4 pathParams = texelFetch(pathsFromVehicle, ivec2(latitude, station), 0);

  // If the path didn't converge
  if (pathParams.w == 0.0) return vec4(-1);

  int numSamples = ${pathType == 'cubic' ? 'sampleCubicPath' : 'sampleQuinticPath'}(pathStart, pathEnd, pathParams);
  float pathLength = pathParams.z;

  float staticCostSum = calculateStaticCostSum(numSamples);
  if (staticCostSum < 0.0) return vec4(-1);

  vec3 avt = calculateAVT(accelerationIndex, velocityVehicle, 0.0, pathLength);
  float acceleration = avt.x;
  float finalVelocity = avt.y;
  float finalTime = avt.z;

  float dynamicCostSum = calculateDynamicCostSum(numSamples, pathLength, velocityVehicle, acceleration);
  if (dynamicCostSum < 0.0) return vec4(-1);

  // The cost of a trajectory is the average sample cost scaled by the path length
  float totalCost = (dynamicCostSum + staticCostSum) / float(numSamples) * pathLength;

  return vec4(totalCost, finalVelocity, finalTime, ${pathType == 'cubic' ? '-2' : '-1'});
}

`;
}

export default {
  setUp() {
    return [
      {
        kernel: fromVehiclePathCostsKernel('cubic'),
        output: { name: 'cubicPathFromVehicleCosts' },
        uniforms: {
          ...SHARED_UNIFORMS,
          lattice: { type: 'sharedTexture' },
          pathsFromVehicle: { type: 'outputTexture', name: 'cubicPathsFromVehicle' },
          velocityVehicle: { type: 'float' },
          curvVehicle: { type: 'float' },
          numAccelerations: { type: 'int' }
        }
      },
      {
        kernel: fromVehiclePathCostsKernel('quintic'),
        output: { name: 'quinticPathFromVehicleCosts' },
        uniforms: {
          ...SHARED_UNIFORMS,
          lattice: { type: 'sharedTexture' },
          pathsFromVehicle: { type: 'outputTexture', name: 'quinticPathsFromVehicle' },
          velocityVehicle: { type: 'float' },
          curvVehicle: { type: 'float' },
          dCurvVehicle: { type: 'float' },
          ddCurvVehicle: { type: 'float' },
          numAccelerations: { type: 'int' }
        }
      }
    ];
  },

  update(config, pose, xyCenterPoint, slCenterPoint) {
    return [
      {
        width: config.lattice.numLatitudes,
        height: config.lattice.stationConnectivity * NUM_ACCELERATION_PROFILES,
        uniforms: {
          ...buildUniformValues(config, xyCenterPoint, slCenterPoint),
          velocityVehicle: pose.speed,
          curvVehicle: pose.curv,
          numAccelerations: NUM_ACCELERATION_PROFILES
        }
      },
      {
        width: config.lattice.numLatitudes,
        height: config.lattice.stationConnectivity * NUM_ACCELERATION_PROFILES,
        uniforms: {
          ...buildUniformValues(config, xyCenterPoint, slCenterPoint),
          velocityVehicle: pose.speed,
          curvVehicle: pose.curv,
          dCurvVehicle: pose.dCurv,
          ddCurvVehicle: pose.ddCurv,
          numAccelerations: NUM_ACCELERATION_PROFILES
        }
      }
    ];
  }
}
