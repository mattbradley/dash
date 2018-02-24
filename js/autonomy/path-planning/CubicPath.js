const SIMPSONS_INTERVALS = 8;
const NEWTON_ITERATIONS = 16;
const RELAXATION_ITERATIONS = 32;
const CONVERGENCE_ERROR = 0.01;

const jacobian = new THREE.Matrix3();
const invJacobian = new THREE.Matrix3();

// Alternate reference implementation: https://github.com/ApolloAuto/apollo/blob/master/modules/planning/math/spiral_curve/cubic_spiral_curve.cc
export default class CubicPath {
  constructor(start, end, params = null) {
    this.start = Object.assign({}, start);
    this.end = Object.assign({}, end);

    if (start.pos) {
      this.start.x = start.pos.x;
      this.start.y = start.pos.y
    }

    if (end.pos) {
      this.end.x = end.pos.x;
      this.end.y = end.pos.y
    }

    const diffX = this.end.x - this.start.x;
    const diffY = this.end.y - this.start.y;
    const sinRot = Math.sin(this.start.rot);
    const cosRot = Math.cos(this.start.rot);

    this.goal = {
      x: cosRot * diffX + sinRot * diffY,
      y: -sinRot * diffX + cosRot * diffY,
      rot: Math.wrapAngle(this.end.rot - this.start.rot),
      curv: this.end.curv
    };

    if (params)
      this.params = Object.assign({}, params, { p0: this.start.curv, p3: this.end.curv });
    else
      this.guessInitialParams();

    this.converged = false;
  }

  guessInitialParams() {
    const originalGoal = this.goal;
    const dStartCurv = this.start.curv / RELAXATION_ITERATIONS;
    const dGoalY = originalGoal.y / RELAXATION_ITERATIONS;
    const dGoalRot = originalGoal.rot / RELAXATION_ITERATIONS;
    const dGoalCurv = originalGoal.curv / RELAXATION_ITERATIONS;

    this.goal = {
      x: originalGoal.x,
      y: 0,
      rot: 0,
      curv: 0
    };

    this.params = {
      p0: 0,
      p1: 0,
      p2: 0,
      p3: 0,
      sG: originalGoal.x
    };

    for (let i = 0; i < RELAXATION_ITERATIONS; i++) {
      this.params.p0 += dStartCurv;
      this.params.p3 += dGoalCurv;
      this.goal.y += dGoalY;
      this.goal.rot += dGoalRot;
      this.goal.curv += dGoalCurv;

      this.iterate();
    }

    this.goal = originalGoal;
  }

  optimize() {
    for (let i = 0; i < NEWTON_ITERATIONS; i++) {
      if (this.iterate()) {
        this.converged = true;
        return true;
      }
    }

    this.converged = false;
    return false;
  }

  iterate() {
    const { p0, p1, p2, p3, sG } = this.params;

    const ds = sG / SIMPSONS_INTERVALS;
    const sG_2 = sG * sG;
    const sG_3 = sG_2 * sG;

    let dX_p1 = 0;
    let dX_p2 = 0;
    let dX_sG = 0;
    let dY_p1 = 0;
    let dY_p2 = 0;
    let dY_sG = 0;
    let guessX = 0;
    let guessY = 0;

    let theta, cosTheta, sinTheta, dT_p1, dT_p2, dT_sG;

    for (let i = 0, s = 0; i <= SIMPSONS_INTERVALS; i++, s += ds) {
      const coeff = i == 0 || i == SIMPSONS_INTERVALS ? 1 : i % 2 == 0 ? 2 : 4;

      const a = p0;
      const b = (-5.5 * p0 + 9 * p1 - 4.5 * p2 + p3) / sG;
      const c = (9 * p0 - 22.5 * p1 + 18 * p2 - 4.5 * p3) / sG_2;
      const d = (-4.5 * (p0 - 3 * p1 + 3 * p2 - p3)) / sG_3;

      theta = (((d * s / 4 + c / 3) * s + b / 2) * s + a) * s;
      cosTheta = Math.cos(theta);
      sinTheta = Math.sin(theta);

      const s_sG = s / sG;
      dT_p1 = ((3.375 * s_sG - 7.5) * s_sG + 4.5) * s_sG * s;
      dT_p2 = ((-3.375 * s_sG + 6) * s_sG - 2.25) * s_sG * s;
      dT_sG = ((3.375 * (p0 - 3 * p1 + 3 * p2 - p3) * s_sG - 3 * (2 * p0 - 5 * p1 + 4 * p2 - p3)) * s_sG + 0.25 * (11 * p0 - 18 * p1 + 9 * p2 - 2 * p3)) * s_sG * s_sG;

      dX_p1 -= coeff * sinTheta * dT_p1;
      dX_p2 -= coeff * sinTheta * dT_p2;
      dX_sG -= coeff * sinTheta * dT_sG;

      dY_p1 += coeff * cosTheta * dT_p1;
      dY_p2 += coeff * cosTheta * dT_p2;
      dY_sG += coeff * cosTheta * dT_sG;

      guessX += coeff * cosTheta;
      guessY += coeff * sinTheta;
    }

    // After the Simpson's integration loop, `theta`, `cosTheta`, `sinTheta`,
    // `dT_p1`, `dT_p2`, and `dT_sG` hold the appropriate values for `sG`.

    const hOver3 = sG / SIMPSONS_INTERVALS / 3;

    const deltaX = this.goal.x - guessX * hOver3;
    const deltaY = this.goal.y - guessY * hOver3;
    const deltaRot = Math.wrapAngle(this.goal.rot - theta);

    if (Math.abs(deltaX) + Math.abs(deltaY) + Math.abs(deltaRot) < CONVERGENCE_ERROR)
      return true;

    jacobian.set(
      dX_p1 * hOver3, dX_p2 * hOver3, cosTheta + dX_sG * hOver3,
      dY_p1 * hOver3, dY_p2 * hOver3, sinTheta + dY_sG * hOver3,
      dT_p1, dT_p2, dT_sG
    );

    const [m11, m21, m31, m12, m22, m32, m13, m23, m33] = invJacobian.getInverse(jacobian).elements;

    this.params.p1 += m11 * deltaX + m12 * deltaY + m13 * deltaRot;
    this.params.p2 += m21 * deltaX + m22 * deltaY + m23 * deltaRot;
    this.params.sG += m31 * deltaX + m32 * deltaY + m33 * deltaRot;

    return false;
  }

  buildPath(num) {
    const { p0, p1, p2, p3, sG } = this.params;

    const sG_2 = sG * sG;
    const sG_3 = sG_2 * sG;

    const a = p0;
    const b = (-5.5 * p0 + 9 * p1 - 4.5 * p2 + p3) / sG;
    const c = (9 * p0 - 22.5 * p1 + 18 * p2 - 4.5 * p3) / sG_2;
    const d = (-4.5 * (p0 - 3 * p1 + 3 * p2 - p3)) / sG_3;

    const path = [{ pos: new THREE.Vector2(this.start.x, this.start.y), rot: this.start.rot, curv: this.start.curv }];
    const ds = sG / (num - 1);
    let s = ds;
    let dx = 0;
    let dy = 0;
    let prevCosRot = Math.cos(path[0].rot);
    let prevSinRot = Math.sin(path[0].rot);

    for (let i = 1; i < num - 1; i++) {
      const rot = (((d * s / 4 + c / 3) * s + b / 2) * s + a) * s + this.start.rot;
      const curv = ((d * s + c) * s + b) * s + a;
      const cosRot = Math.cos(rot);
      const sinRot = Math.sin(rot);

      dx = dx * (i - 1) / i + (cosRot + prevCosRot) / (2 * i);
      dy = dy * (i - 1) / i + (sinRot + prevSinRot) / (2 * i);

      path.push({ pos: new THREE.Vector2(s * dx + this.start.x, s * dy + this.start.y), rot: rot, curv: curv });

      s += ds;
      prevCosRot = cosRot;
      prevSinRot = sinRot;
    }

    path.push({ pos: new THREE.Vector2(this.end.x, this.end.y), rot: this.end.rot, curv: this.end.curv });

    return path;
  }
}
