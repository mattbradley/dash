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
 */

const SOLVE_STATION_KERNEL = `

const float vSqEpsilon = -0.0001;
const float smallV = 0.01;

float calculateAcceleration(index, initialVelocitySq, distance) {
  if (index <= 4) {
    // [aMaxHard, aMinHard, aMaxSoft, aMinSoft, 0]
    return accelerationProfiles[index];
  } else {
    float finalVelocity = finalVelocityProfiles[index - 5];
    return clamp((finalVelocity * finalVelocity - initialVelocitySq) / (2 * distance), accelerationProfiles[1], accelerationProfiles[0]);
  }
}

int samplePath(vec4 start, vec4 end, vec4 cubicPathParams, inout vec2 samples[128], inout vec4 coefficients) {
  float p0 = start.w;
  float p1 = cubicPathParams.x;
  float p2 = cubicPathParams.y;
  float p3 = end.w;
  float sG = cubicPathParams.z;

  int numSamples = ceil(sG / pathSamplingStep) + 1;

  float sG_2 = sG * sG;
  float sG_3 = sG_2 * sG;

  float a = p0;
  float b = (-5.5 * p0 + 9 * p1 - 4.5 * p2 + p3) / sG;
  float c = (9 * p0 - 22.5 * p1 + 18 * p2 - 4.5 * p3) / sG_2;
  float d = (-4.5 * (p0 - 3 * p1 + 3 * p2 - p3)) / sG_3;
  coefficients = vec4(a, b, c, d);

  samples[0] = start;

  float ds = sG / (numSamples - 1);
  float s = ds;
  vec2 dxy = vec2(0);
  vec2 prevCosSin = vec2(cos(start.z), sin(start.z));

  for (int i = 1; i < numSamples; i++) {
    float rot = (((d * s / 4 + c / 3) * s + b / 2) * s + a) * s + start.z;
    float curv = ((d * s + c) * s + b) * s + a;

    float cosSin = vec2(cos(rot), sin(rot));
    dxy = dxy * vec2(float(i - 1) / i) + (cosSin + prevCosSin) / vec2(2 * i);

    samples[i] = vec4(dxy * vec2(s) + start.xy, rot, curv);

    s += ds;
    prevCosSin = cosSin
  }

  return numSamples;
}

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

  float minCost = -1.0; // -1 means infinite cost

  for (int prevStation = max(station - stationConnectivity, 0); prevStation < station; prevStation++) {
    int stationConnectivityIndex = prevStation - station + stationConnectivity;

    for (int prevLatitude = minLatitude; prevLatitude <= maxLatitude; prevLatitude++) {
      int latitudeConnectivityIndex = prevLatitude - latitude + latitudeConnectivity / 2;
      int connectivityIndex = stationConnectivityIndex * latitudeConnectivity + latitudeConnectivityIndex;

      vec4 pathStart = texelFetch(lattice, ivec2(prevLatitude, prevStation), 0);
      vec4 cubicPathParams = texelFetch(cubicPaths, ivec2(slIndex, connectivityIndex), 0);

      // If cubic path didn't converge
      if (cubicPathParams.w == 0.0) continue;

      vec2 pathSamples[128];
      vec4 coefficients;
      int numSamples = samplePath(pathStart, pathEnd, cubicPathParams, pathSamples, coefficients);

      for (int prevVelocity = 0; prevVelocity < numVelocities; prevVelocity++) {
        for (int prevTime = 0; prevTime < numTimes; prevTime++) {
          for (int prevAccel = 0; prevAccel < numAccelerations; prevAccel++) {
            int avtIndex = prevTime * numPerTime + prevVelocity * numAccelerations + prevAccel;

            // Cost map entry:
            //   x: cost so far
            //   y: end speed
            //   z: end time
            //   w: parent index
            vec4 costMapEntry = texelFetch(costMap, ivec3(avtIndex, prevLatitude, prevStation), 0);

            // If cost entry is infinity
            if (costMapEntry.x == -1.0) continue;

            float initialVelocity = costMapEntry.y;
            float initialVelocitySq = initialVelocity * initialVelocity;
            float acceleration = calculateAcceleration(accelerationIndex, initialVelocitySq, cubicPathParams.z);

            float finalVelocitySq = 2 * acceleration * cubicPathParams.z + initialVelocitySq;
            float finalVelocity = smallV;
            float finalTime;

            if (finalVelocitySq >= vSqEpsilon)
              finalVelocity = sqrt(max(0, finalVelocitySq));

            // If the calculated final velocity does not match this fragment's velocity range, then skip this trajectory
            if (finalVelocity < minVelocity || finalVelocity >= maxVelocity) continue;

            // Calculate final time if the vehicle stops before the end of the trajectory
            if (finalVelocitySq < vSqEpsilon) {
              float distanceLeft = cubicPathParams.z - (smallV * smallV - initialVelocitySq) / (2 * acceleration);
              finalTime = (smallV - initialVelocity) / acceleration + distanceLeft / smallV;
            } else {
              finalTime = (finalVelocity - initialVelocity) / acceleration;
            }

            // If the calculated final time does not match this fragment's time range, then skip this trajectory
            if (finalTime < minTime || finalTime >= maxTime) continue;

            float s = 0;
            float ds = cubicPathParams.z / numSamples;

            for (int i = 0; i < numSamples; i++) {
              float velocitySq = 2 * acceleration * s + initialVelocitySq;
              float velocity;

              if (velocitySq >= vSqEpsilon) {
                velocity = sqrt(max(0, velocitySq));
              } else {
                velocity = smallV;
              }

              float time = 2 * s / (initialVelocity + velocity);
              float dCurv = velocity * (coefficients.y + s * (2 * coefficients.z + 3 * coefficients.w * s);
            }
          }
        }
      }
    }
  }
}

`;

export default function() {
}
