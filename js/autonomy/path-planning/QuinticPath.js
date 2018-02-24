export default class QuinticPath {
  constructor(start, end, params) {
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

    this.params = Object.assign({}, params, { p0: this.start.curv, p1: this.start.dCurv || 0, p2: this.start.ddCurv || 0, p5: this.end.curv });
  }

  buildPath(num) {
    const { p0, p1, p2, p3, p4, p5, sG } = this.params;

    const sG_2 = sG * sG;
    const sG_3 = sG_2 * sG;

    const a = p0;
    const b = p1;
    const c = p2 / 2.0;
    const d = (-71.875 * p0 + 81.0 * p3 - 10.125 * p4 + p5 - 21.25 * p1 * sG - 2.75 * p2 * sG_2) / sG_3;
    const e = (166.5 * p0 - 202.5 * p3 + 40.5 * p4 - 4.5 * p5 + 45.0 * p1 * sG + 4.5 * p2 * sG_2) / (sG_2 * sG_2);
    const f = (-95.625 * p0 + 121.5 * p3 - 30.375 * p4 + 4.5 * p5 - 24.75 * p1 * sG - 2.25 * p2 * sG_2) / (sG_2 * sG_3);

    const path = [{ pos: new THREE.Vector2(this.start.x, this.start.y), rot: this.start.rot, curv: this.start.curv }];
    const ds = sG / (num - 1);
    let s = ds;
    let dx = 0;
    let dy = 0;
    let prevCosRot = Math.cos(path[0].rot);
    let prevSinRot = Math.sin(path[0].rot);

    for (let i = 1; i < num - 1; i++) {
      const rot = (((((f * s / 6.0 + e / 5.0) * s + d / 4.0) * s + c / 3.0) * s + b / 2.0) * s + a) * s + this.start.rot;
      const curv = ((((f * s + e) * s + d) * s + c) * s + b) * s + a;
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
