const SIMPSONS_INTERVALS = 16;
const NEWTON_ITERATIONS = 16;
const CONVERGENCE_ERROR = 0.01;
const RELAXATION_ITERATIONS = 32;

const jacobian = new THREE.Matrix3();
const invJacobian = new THREE.Matrix3();

// Alternate reference implementation: https://github.com/ApolloAuto/apollo/blob/master/modules/planning/math/spiral_curve/cubic_spiral_curve.cc
export default class CubicPathOptimizer {
  constructor(start, end) {
    this.start = start;
    this.end = end;

    const diffX = end.x - start.x;
    const diffY = end.y - start.y;
    const sinRot = Math.sin(start.rot);
    const cosRot = Math.cos(start.rot);

    this.goal = {
      x: cosRot * diffX + sinRot * diffY,
      y: -sinRot * diffX + cosRot * diffY,
      rot: Math.wrapAngle(end.rot - start.rot),
      curv: end.curv
    };

    this.guessInitialParams();
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
      this.iterate();

      if (Math.abs(this.delta.x) + Math.abs(this.delta.y) + Math.abs(this.delta.rot) < CONVERGENCE_ERROR)
        return true;
    }

    return false;
  }

  optimize2() {
    for (let i = 0; i < NEWTON_ITERATIONS; i++) {
      if (this.iterate2()) {
        return true;
      }
    }

    return false;
  }

  iterate2() {
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

  iterate() {
    const jacobian = this.jacobian();
    const guess = this.calculateGoal();
    const delta = {
      x: this.goal.x - guess.x,
      y: this.goal.y - guess.y,
      rot: Math.wrapAngle(this.goal.rot - guess.rot),
      curv: this.goal.curv - guess.curv
    };

    this.delta = delta;

    const [m11, m21, m31, m12, m22, m32, m13, m23, m33] = (new THREE.Matrix3()).getInverse(jacobian).elements;

    const [delta_p1, delta_p2, delta_sG] = [
      m11 * delta.x + m12 * delta.y + m13 * delta.rot,
      m21 * delta.x + m22 * delta.y + m23 * delta.rot,
      m31 * delta.x + m32 * delta.y + m33 * delta.rot
    ];

    this.params.p1 += delta_p1;
    this.params.p2 += delta_p2;
    this.params.sG += delta_sG;
  }

  buildPath(num) {
    const { p0, p1, p2, p3, sG } = this.params;

    const path = [{ pos: new THREE.Vector2(this.start.x, this.start.y), rot: this.start.rot }];
    const ds = sG / (num - 1);
    let s = ds;
    let dx = 0;
    let dy = 0;

    for (let i = 1; i < num - 1; i++) {
      const rot = theta(p0, p1, p2, p3, sG, s) + path[0].rot;
      dx = dx * (i - 1) / i + (Math.cos(rot) + Math.cos(path[i - 1].rot)) / (2 * i);
      dy = dy * (i - 1) / i + (Math.sin(rot) + Math.sin(path[i - 1].rot)) / (2 * i);
      path[i] = { pos: new THREE.Vector2(s * dx + this.start.x, s * dy + this.start.y), rot: rot };
      s += ds;
    }

    path.push({ pos: new THREE.Vector2(this.end.x, this.end.y), rot: this.end.rot });

    return path;
  }

  calculateGoal() {
    const { p0, p1, p2, p3, sG } = this.params;

    const rot = theta(p0, p1, p2, p3, sG, sG);
    const [x, y] = position(p0, p1, p2, p3, sG, sG);

    return { x, y, rot };
  }

  jacobian() {
    const { p0, p1, p2, p3, sG } = this.params;

    const sG_squared = sG * sG;
    const sG_cubed = sG_squared * sG;
    const sG_fourth = sG_cubed * sG;

    const [dX_p1, dY_p1] = simpsons_dPosition(dTheta_p1);
    const [dX_p2, dY_p2] = simpsons_dPosition(dTheta_p2);
    const [dX_sG, dY_sG] = simpsons_dPosition(dTheta_sG);
    const dT_p1 = dTheta_p1(sG);
    const dT_p2 = dTheta_p2(sG);
    const dT_sG = dTheta_sG(sG);

    const theta_sG = theta(p0, p1, p2, p3, sG, sG);

    return (new THREE.Matrix3()).set(
      dX_p1, dX_p2, Math.cos(theta_sG) + dX_sG,
      dY_p1, dY_p2, Math.sin(theta_sG) + dY_sG,
      dT_p1, dT_p2, dT_sG
    );

    function simpsons_dPosition(dTheta_p) {
      let sumX = 0;
      let sumY = 0;

      for (let i = 0; i <= SIMPSONS_INTERVALS; i++) {
        const coeff = i == 0 || i == SIMPSONS_INTERVALS ? 1 : i % 2 == 0 ? 2 : 4;
        const s = sG * i / SIMPSONS_INTERVALS;
        const t = theta(p0, p1, p2, p3, sG, s);
        sumX += coeff * -Math.sin(t) * dTheta_p(s);
        sumY += coeff * Math.cos(t) * dTheta_p(s);
      }

      const hOver3 = sG / SIMPSONS_INTERVALS / 3;
      return [sumX * hOver3, sumY * hOver3];
    }

    function dTheta_p1(s) {
      const s_squared = s * s;
      const s_cubed = s_squared * s;
      const s_fourth = s_cubed * s;

      const bTerm = (9 / sG) * (s_squared / 2);
      const cTerm = (-45 / (2 * sG_squared)) * (s_cubed / 3);
      const dTerm = (27 / (2 * sG_cubed)) * (s_fourth / 4);

      return bTerm + cTerm + dTerm;
    }

    function dTheta_p2(s) {
      const s_squared = s * s;
      const s_cubed = s_squared * s;
      const s_fourth = s_cubed * s;

      const bTerm = (-9 / (2 * sG)) * (s_squared / 2);
      const cTerm = (18 / sG_squared) * (s_cubed / 3);
      const dTerm = (-27 / (2 * sG_cubed)) * (s_fourth / 4);

      return bTerm + cTerm + dTerm;
    }

    function dTheta_sG(s) {
      const s_squared = s * s;
      const s_cubed = s_squared * s;
      const s_fourth = s_cubed * s;

      const bTerm = ((11 * p0 - 18 * p1 + 9 * p2 - 2 * p3) / (2 * sG_squared)) * (s_squared / 2);
      const cTerm = ((-9 * (2 * p0 - 5 * p1 + 4 * p2 - p3)) / sG_cubed) * (s_cubed / 3);
      const dTerm = ((27 * (p0 - 3 * p1 + 3 * p2 - p3)) / (2 * sG_fourth)) * (s_fourth / 4);

      return bTerm + cTerm + dTerm;
    }
  }
}

function dTheta_p1(s, s_sG) {
  return ((3.375 * s_sG - 7.5) * s_sG + 4.5) * s_sG * s;
}

function dTheta_p2(s, s_sG) {
  return ((-3.375 * s_sG + 6) * s_sG - 2.25) * s_sG * s;
}

function dTheta_sG(p0, p1, p2, p3, s, s_sG) {
  return ((3.375 * (p0 - 3 * p1 + 3 * p2 - p3) * s_sG - 3 * (2 * p0 - 5 * p1 + 4 * p2 - p3)) * s_sG + 0.25 * (11 * p0 - 18 * p1 + 9 * p2 - 2 * p3)) * s_sG * s_sG;
}

function position(p0, p1, p2, p3, sG, s) {
  let sumX = 0;
  let sumY = 0;

  for (let i = 0; i <= SIMPSONS_INTERVALS; i++) {
    const coeff = i == 0 || i == SIMPSONS_INTERVALS ? 1 : i % 2 == 0 ? 2 : 4;
    const sInterval = s * i / SIMPSONS_INTERVALS;
    const t = theta(p0, p1, p2, p3, sG, sInterval);
    sumX += coeff * Math.cos(t);
    sumY += coeff * Math.sin(t);
  }

 const hOver3 = s / SIMPSONS_INTERVALS / 3;
  return [sumX * hOver3, sumY * hOver3];
}

function theta(p0, p1, p2, p3, sG, s) {
  const sG_2 = sG * sG;
  const sG_3 = sG_2 * sG;

  const a = p0;
  const b = (-5.5 * p0 + 9 * p1 - 4.5 * p2 + p3) / sG;
  const c = (9 * p0 - 22.5 * p1 + 18 * p2 - 4.5 * p3) / sG_2;
  const d = (-4.5 * (p0 - 3 * p1 + 3 * p2 - p3)) / sG_3;

  return (((d * s / 4 + c / 3) * s + b / 2) * s + a) * s;
}
