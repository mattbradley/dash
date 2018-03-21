export default class StaticObstacle {
  constructor(pos, rot, width, height) {
    this.pos = pos;
    this.rot = rot;
    this.width = width;
    this.height = height;

    this.updateVertices();
  }

  updateVertices() {
    this.vertices = [];

    const cosRot = Math.cos(this.rot);
    const sinRot = Math.sin(this.rot);
    const halfWidth = this.width / 2;
    const halfHeight = this.height / 2;

    const hWcR = halfWidth * cosRot;
    const hWsR = halfWidth * sinRot;
    const hHcR = halfHeight * cosRot;
    const hHsR = halfHeight * sinRot;

    const v1 = [-hWcR - hHsR + this.pos.x, -hWsR + hHcR + this.pos.y];
    const v2 = [-hWcR + hHsR + this.pos.x, -hWsR - hHcR + this.pos.y];
    const v3 = [hWcR + hHsR + this.pos.x, hWsR - hHcR + this.pos.y];
    const v4 = [hWcR - hHsR + this.pos.x, hWsR + hHcR + this.pos.y];

    this.vertices = [
      v1[0], v1[1],
      v2[0], v2[1],
      v3[0], v3[1],
      v3[0], v3[1],
      v4[0], v4[1],
      v1[0], v1[1]
    ];
  }
}
