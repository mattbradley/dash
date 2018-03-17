const OPTIMIZE_KERNEL = `

const int NEWTON_ITERATIONS = 32;
const int RELAXATION_ITERATIONS = 32;
const float CONVERGENCE_ERROR = 0.01;

// These two consts must stay in sync.
const int SIMPSONS_INTERVALS = 8;
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

vec4 iterate(vec4 goal, float p0, float p1, float p2, float p3, float p4, float p5, float sG) {
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
    float b = p1;
    float c = p2 / 2.0;
    float d = (-71.875 * p0 + 81.0 * p3 - 10.125 * p4 + p5 - 21.25 * p1 * sG - 2.75 * p2 * sG_2) / sG_3;
    float e = (166.5 * p0 - 202.5 * p3 + 40.5 * p4 - 4.5 * p5 + 45.0 * p1 * sG + 4.5 * p2 * sG_2) / (sG_2 * sG_2);
    float f = (-95.625 * p0 + 121.5 * p3 - 30.375 * p4 + 4.5 * p5 - 24.75 * p1 * sG - 2.25 * p2 * sG_2) / (sG_2 * sG_3);

    theta = (((((f * s / 6.0 + e / 5.0) * s + d / 4.0) * s + c / 3.0) * s + b / 2.0) * s + a) * s;
    cosTheta = cos(theta);
    sinTheta = sin(theta);

    float s_2 = s * s;
    float s_sG = s / sG;
    float s_sG_2 = s_sG * s_sG;
    float s_sG_3 = s_sG_2 * s_sG;
    float s_sG_4 = s_sG_3 * s_sG;
    float s_sG_5 = s_sG_4 * s_sG;

    dT_p = vec3(
      // p3
      ((20.25 * s_sG - 40.5) * s_sG + 20.25) * s_sG_3 * s,

      // p4
      ((-5.0625 * s_sG + 8.1) * s_sG - 2.53125) * s_sG_3 * s,

      // sG
      (53.90625 * p0 - 60.75 * p3 + 7.59375 * p4 - 0.75 * p5) * s_sG_4 + 10.625 * p1 * s * s_sG_3 + 0.6875 * p2 * s_2 * s_sG_2 + (-133.2 * p0 + 162.0 * p3 - 32.4 * p4 + 3.6 * p5) * s_sG_5 + (-27.0) * p1 * s * s_sG_4 - 1.8 * p2 * s_2 * s_sG_3 + (79.6875 * p0 - 101.25 * p3 + 25.3125 * p4 - 3.75 * p5) * s_sG_5 * s_sG + 16.5 * p1 * s * s_sG_5 + 1.125 * p2 * s_2 * s_sG_4
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
    return vec4(p3, p4, sG, 1.0);

  dX_p.xyz *= hOver3;
  dY_p.xyz *= hOver3;
  dX_p.z += cosTheta;
  dY_p.z += sinTheta;

  mat3 invJacobian = inverse(transpose(mat3(dX_p, dY_p, dT_p)));

  vec3 deltaP = invJacobian * delta;
  vec4 params = vec4(p3, p4, sG, 0.0);
  params.xyz += deltaP;

  return params;
}

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
  float d_K0 = start.w / RELAXATION_ITERATIONS_F;
  float d_dK0 = dCurvVehicle / RELAXATION_ITERATIONS_F;
  float d_ddK0 = ddCurvVehicle / RELAXATION_ITERATIONS_F;

  // Relax the goal to (x, 0, 0, 0)
  goal.yzw = vec3(0, 0, 0);

  // Relax the params to (0, 0, 0, 0, goal.x)
  float p0 = 0.0;
  float p1 = 0.0;
  float p2 = 0.0;
  float p3 = 0.0;
  float p4 = 0.0;
  float p5 = 0.0;
  float sG = goal.x;

  if (sG < 0.1) return vec4(0.0);

  for (int i = 0; i < RELAXATION_ITERATIONS; i++) {
    p0 += d_K0;
    p1 += d_dK0;
    p2 += d_ddK0;
    p5 += dGoal.w;
    goal += dGoal;
    
    vec4 result = iterate(goal, p0, p1, p2, p3, p4, p5, sG);
    p3 = result.x;
    p4 = result.y;
    sG = result.z;
  }

  goal = originalGoal;

  for (int i = 0; i < NEWTON_ITERATIONS; i++) {
    vec4 result = iterate(goal, p0, p1, p2, p3, p4, p5, sG);
    if (result.w == 1.0) {
      result.w = step(0.0, result.z);
      return result;
    }

    p3 = result.x;
    p4 = result.y;
    sG = result.z;
  }

  return vec4(p3, p4, sG, 0.0);
}

vec4 kernel() {
  ivec2 latticeIndexes = ivec2(kernelPosition * vec2(kernelSize));

  vec4 start = vec4(0, 0, 0, curvVehicle);
  vec4 end = texelFetch(lattice, latticeIndexes, 0);

  return optimize(start, end);
}

`;

// Quintic spiral path optimizer
//   * Start of paths is the vehicle pose
//     * x-pos, y-pos, and rotation aren't needed, since the lattice origin is the vehicle pose
//     * So assume position and rotation are 0
//   * Ends of paths are all latitudes within the first (stationConnectivity) stations
export default {
  setUp() {
    return {
      kernel: OPTIMIZE_KERNEL,
      output: { name: 'quinticPathsFromVehicle', read: true },
      uniforms: {
        lattice: { type: 'sharedTexture' },
        curvVehicle: { type: 'float' },
        dCurvVehicle: { type: 'float' },
        ddCurvVehicle: { type: 'float' }
      }
    };
  },

  update(config, pose) {
    return {
      width: config.lattice.numLatitudes,
      height: config.lattice.stationConnectivity,
      uniforms: {
        curvVehicle: pose.curv,
        dCurvVehicle: pose.dCurv,
        ddCurvVehicle: pose.ddCurv
      }
    };
  }
}
