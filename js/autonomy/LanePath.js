const pointsPerSegment = 20;
const laneWidth = 3.5 / 2;

const centerlineGeometry = new THREE.Geometry();
const leftBoundaryGeometry = new THREE.Geometry();
const rightBoundaryGeometry = new THREE.Geometry();

export default class {
  constructor() {
    this.anchors = [];
    this.centerlines = [];
    this.rotations = [];
    this.leftBoundaries = [];
    this.rightBoundaries = [];
  }

  get centerline() {
    return [].concat(...this.centerlines);
  }

  get centerlineRotations() {
    return [].concat(...this.rotations);
  }

  get leftBoundary() {
    return [].concat(...this.leftBoundaries);
  }

  get rightBoundary() {
    return [].concat(...this.rightBoundaries);
  }

  addAnchor(position) {
    const index = this.anchors.push(position) - 1;

    for (let i = index - 2; i < index; i++)
      this.resample(i);
  }

  updateAnchor(index, position) {
    this.anchors[index] = position;

    for (let i = index - 2; i <= index + 1; i++)
      this.resample(i);
  }

  resample(index) {
    if (index < 0 || index > this.anchors.length - 2) return;

    let p;
    if (index == 0)
      p = [this.anchors[0]].concat(this.anchors.slice(0, 3));
    else
      p = this.anchors.slice(index - 1, index + 3);

    if (p[3] === undefined)
      p[3] = p[2];

    const [p0, p1, p2, p3] = p;
    const points = [];
    const pointRotations = [];
    const leftBoundary = [];
    const rightBoundary = [];

    const numPoints = index == this.anchors.length - 2 ? pointsPerSegment + 1 : pointsPerSegment;

    for (let i = 0; i < numPoints; i++) {
      const t = i / pointsPerSegment;
      const point = new THREE.Vector2(catmullRom(t, p0.x, p1.x, p2.x, p3.x), catmullRom(t, p0.y, p1.y, p2.y, p3.y)); 
      points.push(point);

      const tangent = tangentAt(t, p0, p1, p2, p3);
      pointRotations.push(Math.atan2(tangent.y, tangent.x));

      const normal = new THREE.Vector2(-tangent.y, tangent.x);

      leftBoundary.push(normal.clone().multiplyScalar(-laneWidth).add(point));
      rightBoundary.push(normal.clone().multiplyScalar(laneWidth).add(point));
    }

    this.centerlines[index] = points;
    this.rotations[index] = pointRotations;
    this.leftBoundaries[index] = leftBoundary;
    this.rightBoundaries[index] = rightBoundary;
  }
}

function catmullRom(t, p0, p1, p2, p3) {
  const v0 = (p2 - p0) * 0.5;
  const v1 = (p3 - p1) * 0.5;
  const t2 = t * t;
  const t3 = t * t2;
  return (2 * p1 - 2 * p2 + v0 + v1) * t3 + (-3 * p1 + 3 * p2 - 2 * v0 - v1) * t2 + v0 * t + p1;
}

function tangentAt(t, p0, p1, p2, p3) {
  const delta = 0.0001;
  let t1 = t - delta;
  let t2 = t + delta;

  if (t1 < 0) t1 = 0;
  if (t2 > 1) t2 = 1;

  const prev = new THREE.Vector2(catmullRom(t1, p0.x, p1.x, p2.x, p3.x), catmullRom(t1, p0.y, p1.y, p2.y, p3.y));
  const next = new THREE.Vector2(catmullRom(t2, p0.x, p1.x, p2.x, p3.x), catmullRom(t2, p0.y, p1.y, p2.y, p3.y));

  return next.sub(prev).normalize();
}

function curvatureAt(t2, p0, p1, p2, p3) {
  const delta = 0.0001;
  let t1 = t2 - delta;
  let t3 = t2 + delta;

  if (t1 < 0) t1 = 0;
  if (t3 > 1) t3 = 1;

  const p1 = new THREE.Vector2(catmullRom(t1, p0.x, p1.x, p2.x, p3.x), catmullRom(t1, p0.y, p1.y, p2.y, p3.y));
  const p2 = new THREE.Vector2(catmullRom(t2, p0.x, p1.x, p2.x, p3.x), catmullRom(t2, p0.y, p1.y, p2.y, p3.y));
  const p3 = new THREE.Vector2(catmullRom(t3, p0.x, p1.x, p2.x, p3.x), catmullRom(t3, p0.y, p1.y, p2.y, p3.y));

  return (Math.atan2(p3.y - p2.y, p3.x - p2.x) - Math.atan2(p2.y - p1.y, p2.x - p1.x)) / p2.distanceTo(p1);
}
