// Config:
// num stations
// num latitudes
// station connectivity
// latitude connectivity
//
// Shared:
// lattice

const OPTIMIZE_CUBIC_SHARED = `

const int NEWTON_ITERATIONS = 16;
const int RELAXATION_ITERATIONS = 16;
const float CONVERGENCE_ERROR = 0.01;

// These two consts must stay in sync.
const int SIMPSONS_INTERVALS = 8;
//const float SIMPSONS_COEFFS[SIMPSONS_INTERVALS + 1] = float[](1.0, 4.0, 2.0, 4.0, 2.0, 4.0, 2.0, 4.0, 2.0, 4.0, 2.0, 4.0, 2.0, 4.0, 2.0, 4.0, 1.0);
const float SIMPSONS_COEFFS[SIMPSONS_INTERVALS + 1] = float[](1.0, 4.0, 2.0, 4.0, 2.0, 4.0, 2.0, 4.0, 1.0);

const float PI = 3.1415926535897932384626433832795;
const float TWO_PI = PI + PI;

const float RELAXATION_ITERATIONS_F = float(RELAXATION_ITERATIONS);
const float SIMPSONS_INTERVALS_F = float(SIMPSONS_INTERVALS);

float wrapAngle(float angle) {
  angle = mod(angle, TWO_PI);
  if (angle <= -PI) return angle + TWO_PI;
  else if (angle > PI) return angle - TWO_PI;
  return angle;
}

vec4 iterate(vec4 goal, float p0, float p1, float p2, float p3, float sG) {
  float ds = sG / SIMPSONS_INTERVALS_F;
  float sG_2 = sG * sG;
  float sG_3 = sG_2 * sG;

  vec3 dX_p = vec3(0.0);
  vec3 dY_p = vec3(0.0);
  vec2 guess = vec2(0.0);
  float s = 0.0;

  float theta, cosTheta, sinTheta;
  vec3 dT_p;

  for (int i = 0; i <= SIMPSONS_INTERVALS; i++) {
    float coeff = SIMPSONS_COEFFS[i];

    float a = p0;
    float b = (-5.5 * p0 + 9.0 * p1 - 4.5 * p2 + p3) / sG;
    float c = (9.0 * p0 - 22.5 * p1 + 18.0 * p2 - 4.5 * p3) / sG_2;
    float d = (-4.5 * (p0 - 3.0 * p1 + 3.0 * p2 - p3)) / sG_3;

    theta = (((d * s / 4.0 + c / 3.0) * s + b / 2.0) * s + a) * s;
    cosTheta = cos(theta);
    sinTheta = sin(theta);

    float s_sG = s / sG;

    dT_p = vec3(
      // p1
      ((3.375 * s_sG - 7.5) * s_sG + 4.5) * s_sG * s,

      // p2
      ((-3.375 * s_sG + 6.0) * s_sG - 2.25) * s_sG * s,

      // sG
      ((3.375 * (p0 - 3.0 * p1 + 3.0 * p2 - p3) * s_sG - 3.0 * (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3)) * s_sG + 0.25 * (11.0 * p0 - 18.0 * p1 + 9.0 * p2 - 2.0 * p3)) * s_sG * s_sG
    );

    dX_p -= coeff * sinTheta * dT_p;
    dY_p += coeff * cosTheta * dT_p;

    guess += coeff * vec2(cosTheta, sinTheta);

    s += ds;
  }

  float hOver3 = sG / SIMPSONS_INTERVALS_F / 3.0;

  vec3 delta;
  delta.xy = goal.xy - guess * hOver3;
  delta.z = wrapAngle(goal.z - theta);

  if (abs(delta.x) + abs(delta.y) + abs(delta.z) < CONVERGENCE_ERROR)
    return vec4(p1, p2, sG, 1.0);

  dX_p.xyz *= hOver3;
  dY_p.xyz *= hOver3;
  dX_p.z += cosTheta;
  dY_p.z += sinTheta;

  mat3 invJacobian = inverse(transpose(mat3(dX_p, dY_p, dT_p)));

  vec3 deltaP = invJacobian * delta;
  vec4 params = vec4(p1, p2, sG, 0.0);
  params.xyz += deltaP;

  return params;
}

/* Input:
 *   start: (vec4)
 *     x: x position,
 *     y: y position,
 *     z: theta rotation,
 *     w: k curvature
 *   end: (vec4)
 *     x: x position,
 *     y: y position,
 *     z: theta rotation,
 *     w: k curvature
 *
 * Output: (vec4)
 *   x: p1,
 *   y: p2,
 *   z: sG,
 *   w: 1 if converged, 0 if not
 */

vec4 optimize(vec4 start, vec4 end) {
  // Translate and rotate start and end so that start is at the origin
  float sinRot = sin(start.z);
  float cosRot = cos(start.z);

  vec4 diff = end - start;
  vec4 goal;
  goal.xy = mat2(cosRot, -sinRot, sinRot, cosRot) * diff.xy;
  goal.z = wrapAngle(diff.z);
  goal.w = end.w;

  vec4 originalGoal = goal;
  vec4 dGoal;
  dGoal.x = 0.0;
  dGoal.yzw = goal.yzw / RELAXATION_ITERATIONS_F;
  float dK0 = start.w / RELAXATION_ITERATIONS_F;

  // Relax the goal to (x, 0, 0, 0)
  goal.yzw = vec3(0, 0, 0);

  // Relax the params to (0, 0, 0, 0, goal.x)
  float p0 = 0.0;
  float p1 = 0.0;
  float p2 = 0.0;
  float p3 = 0.0;
  float sG = goal.x;

  if (sG < 0.1) return vec4(0.0);

  for (int i = 0; i < RELAXATION_ITERATIONS; i++) {
    p0 += dK0;
    p3 += dGoal.w;
    goal += dGoal;
    
    vec4 result = iterate(goal, p0, p1, p2, p3, sG);
    p1 = result.x;
    p2 = result.y;
    sG = result.z;
  }

  goal = originalGoal;

  for (int i = 0; i < NEWTON_ITERATIONS; i++) {
    vec4 result = iterate(goal, p0, p1, p2, p3, sG);
    if (result.w == 1.0) {
      result.w = step(0.0, result.z);
      return result;
    }

    p1 = result.x;
    p2 = result.y;
    sG = result.z;
  }

  return vec4(p1, p2, sG, 0.0);
}

`;

const OPTIMIZE_CUBIC_KERNEL = OPTIMIZE_CUBIC_SHARED + `

// width: station * latitude index
// height: station_conn * lattice_conn
//
// lattice:
// width: latitudes
// height: stations

vec4 kernel() {
  ivec2 indexes = ivec2(kernelPosition * vec2(kernelSize));

  int endStation = indexes.x / numLatitudes;
  int endLatitude = int(mod(float(indexes.x), float(numLatitudes)));

  int startStation = endStation - stationConnectivity + indexes.y / latitudeConnectivity;
  int startLatitude = endLatitude - latitudeConnectivity / 2 + int(mod(float(indexes.y), float(latitudeConnectivity)));

  if (startStation < 0 || startStation >= numStations || startLatitude < 0 || startLatitude >= numLatitudes)
    return vec4(0.0);

  vec4 start = texelFetch(lattice, ivec2(startLatitude, startStation), 0);
  vec4 end = texelFetch(lattice, ivec2(endLatitude, endStation), 0);

  return optimize(start, end);
}

`;

const OPTIMIZE_CUBIC_FROM_VEHICLE_KERNEL = OPTIMIZE_CUBIC_SHARED + `

vec4 kernel() {
  ivec2 indexes = ivec2(kernelPosition * vec2(kernelSize));

  vec4 start = vec4(0, 0, 0, curvVehicle);
  vec4 end = texelFetch(lattice, indexes, 0);

  return optimize(start, end);
}

`;

export default {
  setUp() {
    return [
      { // Cubic paths between lattice nodes
        kernel: OPTIMIZE_CUBIC_KERNEL,
        output: { name: 'cubicPaths', read: true },
        uniforms: {
          lattice: { type: 'sharedTexture' },
          numStations: { type: 'int' },
          numLatitudes: { type: 'int' },
          stationConnectivity: { type: 'int' },
          latitudeConnectivity: { type: 'int' }
        }
      },
      { // Cubic paths from vehicle to lattice nodes
        kernel: OPTIMIZE_CUBIC_FROM_VEHICLE_KERNEL,
        output: { name: 'cubicPathsFromVehicle', read: true },
        uniforms: {
          lattice: { type: 'sharedTexture' },
          curvVehicle: { type: 'float' }
        }
      }
    ]
  },

  update(config, pose) {
    return [
      { // Cubic paths between lattice nodes
        width: config.lattice.numStations * config.lattice.numLatitudes,
        height: config.lattice.stationConnectivity * config.lattice.latitudeConnectivity,
        uniforms: {
          numStations: config.lattice.numStations,
          numLatitudes: config.lattice.numLatitudes,
          stationConnectivity: config.lattice.stationConnectivity,
          latitudeConnectivity: config.lattice.latitudeConnectivity,
        }
      },
      { // Cubic paths from vehicle to lattice nodes
        width: config.lattice.numLatitudes,
        height: config.lattice.stationConnectivity,
        uniforms: {
          curvVehicle: pose.curv
        }
      }
    ];
  }
}
