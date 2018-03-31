/* State Lattice Cost Map
 * 
 * 5-dimensional node: station, latitude, acceleration profile, velocity, time
 *
 * A draw call per station s
 *   * Input to kernel: latitude l, acceleration profile a, velocity range v, time range t
 *   * Find all SL vertices that can connect to this node
 *   * For each of those vertices, check if any terminate in this specific velocity and time range
 *     * Based on initial velocity, initial time, and acceleration
 *     * Each connected SL vertex should have a * v * t nodes that could possibly terminate at this node
 *   * For all valid edges, find the one with the lowest cost
 *
 * Input:
 *   * 2D texture array cost map
 *     * Height: num of latitudes (~20)
 *     * Width: num of acceleration profiles * num of time ranges * num of velocity ranges (8 * 2 * 4 = ~64)
 *       * A flattened 3D array:
 *         d1: acceleration
 *         d2: velocity
 *         d3: time
 *     * Layer: num of stations (~10)
 *   
 * Output:
 *   * 2D texture slice of the next station in the input 2D texture array cost map
 *
 * Cost Map Elements:
 *   * Traversal cost so far
 *   * Ending velocity
 *   * Ending time
 *   * Index of parent node
 *
 * Since one cubic path can be shared between multiple trajectories, they need to be pre-optimized.
 *
 * Quintic Paths:
 *   Stations 0 through (numStations - 1) correspond to the stations on the lattice; however,
 *   a new station (station -1) will be used to signifiy the single vehicle pose node. Either
 *   a cubic path or quintic path can be used to connect this single node to the lattice
 *   (depending on vehicle velocity). At station -1, latitude 0 will correspond to a cubic path,
 *   and latitude 1 will correspond to a quintic path. All other latitudes will be skipped.
 */

import { SHARED_SHADER, SAMPLE_CUBIC_PATH_FN, SAMPLE_QUINTIC_PATH_FN, NUM_ACCELERATION_PROFILES, NUM_VELOCITY_RANGES, NUM_TIME_RANGES, SHARED_UNIFORMS, buildUniformValues } from "./graphSearchShared.js";

const SOLVE_STATION_KERNEL =
  SHARED_SHADER +
  SAMPLE_CUBIC_PATH_FN +
  SAMPLE_QUINTIC_PATH_FN +

`

vec4 kernel() {
  ivec2 indexes = ivec2(kernelPosition * vec2(kernelSize));

  int latitude = indexes.y;

  int numPerTime = numAccelerations * numVelocities;
  int timeIndex = indexes.x / numPerTime;
  indexes.x -= timeIndex * numPerTime;
  int velocityIndex = indexes.x / numAccelerations;
  int accelerationIndex = int(mod(float(indexes.x), float(numAccelerations)));

  int minLatitude = max(latitude - latitudeConnectivity / 2, 0);
  int maxLatitude = min(latitude + latitudeConnectivity / 2, numLatitudes - 1);

  int slIndex = station * numLatitudes + latitude;

  vec4 pathEnd = texelFetch(lattice, ivec2(latitude, station), 0);

  float minVelocity = velocityRanges[velocityIndex];
  float maxVelocity = velocityRanges[velocityIndex + 1];

  float minTime = timeRanges[timeIndex];
  float maxTime = timeRanges[timeIndex + 1];

  vec4 bestTrajectory = vec4(-1); // -1 means infinite cost
  float bestTerminalCost = 1.0 / 0.0;

  float hysteresisAdjustment = (slIndex == firstLatticePoint || slIndex == secondLatticePoint) ?  0.0 : hysteresisDiscount;

  for (int prevStation = max(station - stationConnectivity, 0); prevStation < station; prevStation++) {
    int stationConnectivityIndex = prevStation - station + stationConnectivity;

    for (int prevLatitude = minLatitude; prevLatitude <= maxLatitude; prevLatitude++) {
      int latitudeConnectivityIndex = prevLatitude - latitude + latitudeConnectivity / 2;
      int connectivityIndex = stationConnectivityIndex * latitudeConnectivity + latitudeConnectivityIndex;

      vec4 pathStart = texelFetch(lattice, ivec2(prevLatitude, prevStation), 0);
      vec4 cubicPathParams = texelFetch(cubicPaths, ivec2(slIndex, connectivityIndex), 0);

      // If the path didn't converge
      if (cubicPathParams.w == 0.0) continue;

      int numSamples = sampleCubicPath(pathStart, pathEnd, cubicPathParams);
      float pathLength = cubicPathParams.z;

      if (numSamples < 2) continue;

      float averageStaticCost = calculateAverageStaticCost(numSamples);
      if (averageStaticCost < 0.0) continue;

      averageStaticCost += hysteresisAdjustment;

      if (averageStaticCost * pathLength >= bestTerminalCost) continue;

      for (int prevVelocity = 0; prevVelocity < numVelocities; prevVelocity++) {
        for (int prevTime = 0; prevTime < numTimes; prevTime++) {
          for (int prevAccel = 0; prevAccel < numAccelerations; prevAccel++) {
            int avtIndex = prevTime * numPerTime + prevVelocity * numAccelerations + prevAccel;

            // Cost table entry:
            //   x: cost so far
            //   y: end velocity
            //   z: end time
            //   w: parent index
            vec4 costTableEntry = texelFetch(costTable, ivec3(avtIndex, prevLatitude, prevStation), 0);

            // If cost entry is infinity
            if (costTableEntry.x < 0.0 || averageStaticCost * pathLength + costTableEntry.x >= bestTerminalCost) continue;

            vec3 avt = calculateAVT(accelerationIndex, costTableEntry.y, costTableEntry.z, pathLength);
            float acceleration = avt.x;
            float finalVelocity = avt.y;
            float finalTime = avt.z;

            if (averageStaticCost * pathLength + costTableEntry.x + extraTimePenalty * finalTime >= bestTerminalCost) continue;

            // If the calculated final velocity does not match this fragment's velocity range, then skip this trajectory
            if (finalVelocity < minVelocity || finalVelocity >= maxVelocity) continue;

            // If the calculated final time does not match this fragment's time range, then skip this trajectory
            if (finalTime < minTime || finalTime >= maxTime) continue;

            float abandonThreshold = (bestTerminalCost - extraTimePenalty * finalTime - costTableEntry.x) / pathLength - averageStaticCost;
            float averageDynamicCost = calculateAverageDynamicCost(numSamples, pathLength, costTableEntry.z, costTableEntry.y, acceleration, abandonThreshold);
            if (averageDynamicCost < 0.0) continue;

            if (accelerationIndex != prevAccel)
              averageDynamicCost += accelerationChangePenalty;

            // The cost of a trajectory is the average sample cost scaled by the path length
            float totalCost = (averageStaticCost + averageDynamicCost) * pathLength + costTableEntry.x;

            float terminalCost = totalCost + extraTimePenalty * finalTime;
            if (terminalCost >= bestTerminalCost) continue;
            bestTerminalCost = terminalCost;

            int incomingIndex = avtIndex + numPerTime * numTimes * (prevLatitude + numLatitudes * prevStation);
            bestTrajectory = vec4(totalCost, finalVelocity, finalTime, incomingIndex);
          }
        }
      }
    }
  }

  if (station < stationConnectivity) {
    ivec2 slaIndex = ivec2(latitude, station * numAccelerations + accelerationIndex);

    vec4 costTableEntry = texelFetch(cubicPathFromVehicleCosts, slaIndex, 0);
    float terminalCost;

    if (costTableEntry.x >= 0.0) {
      terminalCost = costTableEntry.x + extraTimePenalty * costTableEntry.z;

      if (terminalCost < bestTerminalCost) {
        bestTerminalCost = terminalCost;
        bestTrajectory = costTableEntry;
      }
    }

    costTableEntry = texelFetch(quinticPathFromVehicleCosts, slaIndex, 0);

    if (costTableEntry.x >= 0.0) {
      terminalCost = costTableEntry.x + extraTimePenalty * costTableEntry.z;

      if (terminalCost < bestTerminalCost) {
        bestTerminalCost = terminalCost;
        bestTrajectory = costTableEntry;
      }
    }
  }

  return bestTrajectory;
}

`;

export default {
  setUp() {
    return {
      kernel: SOLVE_STATION_KERNEL,
      output: { name: 'graphSearch' },
      uniforms: Object.assign({}, SHARED_UNIFORMS, {
        lattice: { type: 'sharedTexture' },
        costTable: { type: 'sharedTexture', textureType: '2DArray' },
        cubicPaths: { type: 'outputTexture' },
        cubicPathFromVehicleCosts: { type: 'outputTexture' },
        quinticPathFromVehicleCosts: { type: 'outputTexture' },
        firstLatticePoint: { type: 'int' },
        secondLatticePoint: { type: 'int' },
        velocityVehicle: { type: 'float' },
        curvVehicle: { type: 'float' },
        dCurvVehicle: { type: 'float' },
        ddCurvVehicle: { type: 'float' },
        extraTimePenalty: { type: 'float' },
        hysteresisDiscount: { type: 'float' },
        accelerationChangePenalty: { type: 'float' },
        numStations: { type: 'int' },
        numLatitudes: { type: 'int' },
        numAccelerations: { type: 'int' },
        numVelocities: { type: 'int' },
        numTimes: { type: 'int' },
        stationConnectivity: { type: 'int' },
        latitudeConnectivity: { type: 'int' },
        velocityRanges: { type: 'float', length: NUM_VELOCITY_RANGES + 1 },
        timeRanges: { type: 'float', length: NUM_TIME_RANGES + 1 },
        station: { type: 'int' } // Updated in `drawProxy`
      }),
      drawProxy: (gpgpu, program, draw) => {
        const width = NUM_ACCELERATION_PROFILES * NUM_VELOCITY_RANGES * NUM_TIME_RANGES;
        const height = program.meta.lattice.numLatitudes;
        const costTable = new Float32Array(width * height * program.meta.lattice.numStations * 4);

        for (let s = 0; s < program.meta.lattice.numStations; s++) {
          gpgpu.updateProgramUniforms(program, { station: s });
          draw();

          gpgpu.gl.readPixels(0, 0, width, height, gpgpu.gl.RGBA, gpgpu.gl.FLOAT, costTable, s * width * height * 4);

          gpgpu.gl.bindTexture(gpgpu.gl.TEXTURE_2D_ARRAY, gpgpu.sharedTextures.costTable);
          gpgpu.gl.copyTexSubImage3D(gpgpu.gl.TEXTURE_2D_ARRAY, 0, 0, 0, s, 0, 0, width, height);
        }

        gpgpu._graphSearchCostTable = costTable;
      }
    };
  },

  update(config, pose, xyCenterPoint, slCenterPoint, firstLatticePoint, secondLatticePoint, dynamicFrameTime) {
    return {
      width: NUM_ACCELERATION_PROFILES * NUM_VELOCITY_RANGES * NUM_TIME_RANGES,
      height: config.lattice.numLatitudes,
      meta: {
        lattice: config.lattice
      },
      uniforms: Object.assign({}, buildUniformValues(config, xyCenterPoint, slCenterPoint, dynamicFrameTime), {
        firstLatticePoint: firstLatticePoint,
        secondLatticePoint: secondLatticePoint,
        velocityVehicle: pose.velocity,
        curvVehicle: pose.curv,
        dCurvVehicle: pose.dCurv,
        ddCurvVehicle: pose.ddCurv,
        extraTimePenalty: config.extraTimePenalty,
        hysteresisDiscount: config.hysteresisDiscount,
        accelerationChangePenalty: config.accelerationChangePenalty,
        numStations: config.lattice.numStations,
        numLatitudes: config.lattice.numLatitudes,
        numAccelerations: NUM_ACCELERATION_PROFILES,
        numVelocities: NUM_VELOCITY_RANGES,
        numTimes: NUM_TIME_RANGES,
        stationConnectivity: config.lattice.stationConnectivity,
        latitudeConnectivity: config.lattice.latitudeConnectivity,
        velocityRanges: [0, config.speedLimit / 3, config.speedLimit * 2 / 3, config.speedLimit, 1000000],
        timeRanges: [0, 10, 1000000]
      })
    };
  }
}
