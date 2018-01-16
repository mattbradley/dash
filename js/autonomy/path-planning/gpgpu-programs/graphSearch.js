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
 *         d1: time
 *         d2: velocity
 *         d3: acceleration
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

vec4 kernel() {
  ivec2 indexes = ivec2(kernelPosition * vec2(kernelSize));

  // TODO: check and rewrite this, I don't think it's right
  int latitudeIndex = indexes.y;
  int numPerAcceleration = numTimes * numVelocities;
  int accelerationIndex = indexes.x / numPerAcceleration;
  indexes.y -= accelerationIndex * numPerAcceleration;
  int velocityIndex = indexes.x / numTimes;
  int timeIndex = mod(indexes.x, numTimes);

  
}

`;

export default function() {
}
