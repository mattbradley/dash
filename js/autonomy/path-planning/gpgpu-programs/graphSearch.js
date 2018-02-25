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
 *   * Ending speed
 *   * Ending time
 *   * Index of parent node
 *
 * Since one cubic path can be shared between multiple trajectories, they need to be pre-optimized.
 *
 * Quintic Paths:
 *   Stations 0 through (numStations - 1) correspond to the stations on the lattice; however,
 *   a new station (station -1) will be used to signifiy the single vehicle pose node. Either
 *   a cubic path or quintic path can be used to connect this single node to the lattice
 *   (depending on vehicle speed). At station -1, latitude 0 will correspond to a cubic path,
 *   and latitude 1 will correspond to a quintic path. All other latitudes will be skipped.
 */

import { SHARED, SAMPLE_CUBIC_PATH_FN, SAMPLE_QUINTIC_PATH_FN } from "./graphSearchShared.js";

const SOLVE_STATION_KERNEL =
  SHARED +
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
  float bestCost = 1000000000.0;

  for (int prevStation = max(station - stationConnectivity, -1); prevStation < station; prevStation++) {
    int stationConnectivityIndex = prevStation - station + stationConnectivity;

    int latitudeStart, latitudeEnd;
    if (prevStation >= 0) {
      latitudeStart = minLatitude;
      latitudeEnd = maxLatitude;
    } else {
      latitudeStart = 0;
      latitudeEnd = 1;
    }

    for (int prevLatitude = latitudeStart; prevLatitude <= latitudeEnd; prevLatitude++) {
      int numSamples;
      float pathLength;

      if (prevStation >= 0) {
        int latitudeConnectivityIndex = prevLatitude - latitude + latitudeConnectivity / 2;
        int connectivityIndex = stationConnectivityIndex * latitudeConnectivity + latitudeConnectivityIndex;

        vec4 pathStart = texelFetch(lattice, ivec2(prevLatitude, prevStation), 0);
        vec4 cubicPathParams = texelFetch(cubicPaths, ivec2(slIndex, connectivityIndex), 0);

        // If the path didn't converge
        if (cubicPathParams.w == 0.0) continue;

        numSamples = sampleCubicPath(pathStart, pathEnd, cubicPathParams);
        pathLength = cubicPathParams.z;
      } else if (prevLatitude == 0) {
        vec4 pathStart = vec4(0, 0, 0, curvVehicle);
        vec4 cubicPathParams = texelFetch(cubicPathsFromVehicle, ivec2(latitude, station), 0);

        // If the path didn't converge
        if (cubicPathParams.w == 0.0) continue;

        numSamples = sampleCubicPath(pathStart, pathEnd, cubicPathParams);
        pathLength = cubicPathParams.z;
      } else {
        vec4 pathStart = vec4(0, 0, 0, curvVehicle);
        vec4 quinticPathParams = texelFetch(quinticPathsFromVehicle, ivec2(latitude, station), 0);

        // If the path didn't converge
        if (quinticPathParams.w == 0.0) continue;

        numSamples = sampleQuinticPath(pathStart, pathEnd, quinticPathParams);
        pathLength = quinticPathParams.z;
      }

      float staticCostSum = calculateStaticCostSum(numSamples);
      if (staticCostSum < 0.0) continue;

      for (int prevVelocity = 0; prevVelocity < numVelocities; prevVelocity++) {
        for (int prevTime = 0; prevTime < numTimes; prevTime++) {
          for (int prevAccel = 0; prevAccel < numAccelerations; prevAccel++) {
            int avtIndex = prevTime * numPerTime + prevVelocity * numAccelerations + prevAccel;

            // Cost map entry:
            //   x: cost so far
            //   y: end speed
            //   z: end time
            //   w: parent index
            vec4 costTableEntry =
              prevStation >= 0 ?
                texelFetch(costTable, ivec3(avtIndex, prevLatitude, prevStation), 0) :
                vec4(cubicPathPenalty * velocityVehicle * velocityVehicle * float(1 - prevLatitude), velocityVehicle, 0, 0);

            // If cost entry is infinity
            if (costTableEntry.x == -1.0) continue;

            float initialVelocity = costTableEntry.y;
            float initialVelocitySq = initialVelocity * initialVelocity;
            float acceleration = calculateAcceleration(accelerationIndex, initialVelocitySq, pathLength);

            float finalVelocitySq = 2.0 * acceleration * pathLength + initialVelocitySq;
            float finalVelocity = max(smallV, sqrt(max(0.0, finalVelocitySq)));

            // If the calculated final velocity does not match this fragment's velocity range, then skip this trajectory
            if (finalVelocity < minVelocity || finalVelocity >= maxVelocity) continue;

            float finalTime = costTableEntry.z;

            if (acceleration == 0.0) {
              finalTime += pathLength / finalVelocity;
            } else if (finalVelocitySq <= 0.0) { // Calculate final time if the vehicle stops before the end of the trajectory
              float distanceLeft = pathLength - (smallV * smallV - initialVelocitySq) / (2.0 * acceleration);
              finalTime += (finalVelocity - initialVelocity) / acceleration + distanceLeft / smallV;
            } else {
              finalTime += 2.0 * pathLength / (finalVelocity + initialVelocity);
            }

            // If the calculated final time does not match this fragment's time range, then skip this trajectory
            if (finalTime < minTime || finalTime >= maxTime) continue;

            float dynamicCostSum = calculateDynamicCostSum(numSamples, pathLength, initialVelocity, acceleration);
            if (dynamicCostSum < 0.0) continue;

            // The cost of a trajectory is the average sample cost scaled by the path length
            float totalCost = (dynamicCostSum + staticCostSum) / float(numSamples) * pathLength + costTableEntry.x;

            float terminalCost = totalCost + extraTimePenalty * finalTime;
            if (terminalCost >= bestCost) continue;
            bestCost = terminalCost;

            int incomingIndex =
              prevStation >= 0 ?
                avtIndex + numPerTime * numTimes * (prevLatitude + numLatitudes * prevStation) :
                prevLatitude - 2; // -2 for cubic path, -1 for quintic path

            bestTrajectory = vec4(totalCost, finalVelocity, finalTime, incomingIndex);
          }
        }
      }
    }
  }

  return bestTrajectory;
}

`;

const NUM_ACCELERATION_PROFILES = 8;
const NUM_VELOCITY_RANGES = 4;
const NUM_TIME_RANGES = 2;

export default {
  setUp() {
    return {
      kernel: SOLVE_STATION_KERNEL,
      output: { name: 'graphSearch' },
      uniforms: {
        lattice: { type: 'sharedTexture' },
        costTable: { type: 'sharedTexture', textureType: '2DArray' },
        xyslMap: { type: 'outputTexture' },
        cubicPaths: { type: 'outputTexture' },
        cubicPathsFromVehicle: { type: 'outputTexture' },
        quinticPathsFromVehicle: { type: 'outputTexture' },
        slObstacleGrid: { type: 'outputTexture', name: 'slObstacleGridDilated' },
        velocityVehicle: { type: 'float' },
        curvVehicle: { type: 'float' },
        dCurvVehicle: { type: 'float' },
        ddCurvVehicle: { type: 'float' },
        xyCenterPoint: { type: 'vec2' },
        xyGridCellSize: { type: 'float' },
        slCenterPoint: { type: 'vec2' },
        slGridCellSize: { type: 'float'},
        cubicPathPenalty: { type: 'float' },
        laneCostSlope: { type: 'float'},
        laneShoulderCost: { type: 'float'},
        laneShoulderLatitude: { type: 'float'},
        obstacleHazardCost: { type: 'float' },
        extraTimePenalty: { type: 'float' },
        speedLimit: { type: 'float' },
        speedLimitPenalty: { type: 'float' },
        hardAccelerationPenalty: { type: 'float' },
        hardDecelerationPenalty: { type: 'float' },
        lateralAccelerationLimit: { type: 'float' },
        softLateralAccelerationPenalty: { type: 'float' },
        linearLateralAccelerationPenalty: { type: 'float' },
        dCurvatureMax: { type: 'float' },
        numStations: { type: 'int' },
        numLatitudes: { type: 'int' },
        numAccelerations: { type: 'int' },
        numVelocities: { type: 'int' },
        numTimes: { type: 'int' },
        accelerationProfiles: { type: 'float', length: 5 },
        finalVelocityProfiles: { type: 'float', length: 3 },
        pathSamplingStep: { type: 'float' },
        stationConnectivity: { type: 'int' },
        latitudeConnectivity: { type: 'int' },
        station: { type: 'int' },
        velocityRanges: { type: 'float', length: NUM_VELOCITY_RANGES + 1 },
        timeRanges: { type: 'float', length: NUM_TIME_RANGES + 1 }
      },
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

  update(config, pose, xyCenterPoint, slCenterPoint) {
    return {
      width: NUM_ACCELERATION_PROFILES * NUM_VELOCITY_RANGES * NUM_TIME_RANGES,
      height: config.lattice.numLatitudes,
      meta: {
        lattice: config.lattice
      },
      uniforms: {
        velocityVehicle: pose.speed,
        curvVehicle: pose.curv,
        dCurvVehicle: pose.dCurv,
        ddCurvVehicle: pose.ddCurv,
        xyCenterPoint: [xyCenterPoint.x, xyCenterPoint.y],
        xyGridCellSize: config.xyGridCellSize,
        slCenterPoint: [slCenterPoint.x, slCenterPoint.y],
        slGridCellSize: config.slGridCellSize,
        cubicPathPenalty: config.cubicPathPenalty,
        laneCostSlope: config.laneCostSlope,
        laneShoulderCost: config.laneShoulderCost,
        laneShoulderLatitude: config.laneShoulderLatitude,
        obstacleHazardCost: config.obstacleHazardCost,
        extraTimePenalty: config.extraTimePenalty,
        speedLimit: config.speedLimit,
        speedLimitPenalty: config.speedLimitPenalty,
        hardAccelerationPenalty: config.hardAccelerationPenalty,
        hardDecelerationPenalty: config.hardDecelerationPenalty,
        lateralAccelerationLimit: config.lateralAccelerationLimit,
        softLateralAccelerationPenalty: config.softLateralAccelerationPenalty,
        linearLateralAccelerationPenalty: config.linearLateralAccelerationPenalty,
        dCurvatureMax: config.dCurvatureMax,
        numStations: config.lattice.numStations,
        numLatitudes: config.lattice.numLatitudes,
        numAccelerations: NUM_ACCELERATION_PROFILES,
        numVelocities: NUM_VELOCITY_RANGES,
        numTimes: NUM_TIME_RANGES,
        accelerationProfiles: [3.5, -6.5, 2.0, -3.0, 0],
        finalVelocityProfiles: [0.99 * config.speedLimit, 1.0, 0.01],
        pathSamplingStep: config.pathSamplingStep,
        stationConnectivity: config.lattice.stationConnectivity,
        latitudeConnectivity: config.lattice.latitudeConnectivity,
        velocityRanges: [0, config.speedLimit / 3, config.speedLimit * 2 / 3, config.speedLimit, 1000000],
        timeRanges: [0, 10, 1000000]
      }
    };
  }
}
