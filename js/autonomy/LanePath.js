const pointsPerSegment = 20;
const halfLaneWidth = 3.5 / 2;

const centerlineGeometry = new THREE.Geometry();
const leftBoundaryGeometry = new THREE.Geometry();
const rightBoundaryGeometry = new THREE.Geometry();

export default class {
  constructor() {
    this.anchors = [];
    this.centerlines = [];
    this.arcLengths = [];
    this.rotations = [];
    this.leftBoundaries = [];
    this.rightBoundaries = [];
  }

  get centerline() {
    return [].concat(...this.centerlines);
  }

  // TODO: this probably isn't needed (along with this.rotations)
  get centerlineRotations() {
    return [].concat(...this.rotations);
  }

  get centerlineLengths() {
    return [].concat(...this.arclengths);
  }

  get leftBoundary() {
    return [].concat(...this.leftBoundaries);
  }

  get rightBoundary() {
    return [].concat(...this.rightBoundaries);
  }

  sampleStations(startStation, num, interval) {
    const samples = [];
    let index = 0;
    let segmentIndex = 0;
    let totalLength = 0;
    let nextStation = startStation;
    let [p0, p1, p2, p3] = this.anchorsForSplineIndex(index);

    for (let i = 0; i < num; i++) {
      let length = this.arcLengths[index][segmentIndex];
      while (totalLength + length < nextStation) {
        totalLength += length;

        if (++segmentIndex >= this.arcLengths[index].length) {
          segmentIndex = 0;

          if (++index >= this.arcLengths.length)
            throw new Error(`Exhausted lane path before reaching ${num} centerline samples at ${interval}m intervals.`);

          [p0, p1, p2, p3] = this.anchorsForSplineIndex(index);
        }

        length = this.arcLengths[index][segmentIndex];
      }

      const weight = (segmentIndex + (nextStation - totalLength) / length) / this.arcLengths[index].length;
      const pos = catmullRomVec(weight, p0, p1, p2, p3);
      const tangent = tangentAt(weight, p0, p1, p2, p3);
      const rot = Math.atan2(tangent.y, tangent.x);
      const curv = curvatureAt(weight, p0, p1, p2, p3);

      samples.push({ pos, rot, curv });
      nextStation += interval;
    }

    return samples;
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

    const [p0, p1, p2, p3] = this.anchorsForSplineIndex(index);
    const points = [];
    const lengths = [];
    const pointRotations = [];
    const leftBoundary = [];
    const rightBoundary = [];
    let prevPoint = null;

    const numPoints = index == this.anchors.length - 2 ? pointsPerSegment + 1 : pointsPerSegment;

    for (let i = 0; i < numPoints; i++) {
      const t = i / pointsPerSegment;
      const point = catmullRomVec(t, p0, p1, p2, p3);
      points.push(point);

      if (prevPoint != null)
        lengths.push(prevPoint.distanceTo(point));
      prevPoint = point;

      const tangent = tangentAt(t, p0, p1, p2, p3);
      pointRotations.push(Math.atan2(tangent.y, tangent.x));

      const normal = new THREE.Vector2(-tangent.y, tangent.x);

      leftBoundary.push(normal.clone().multiplyScalar(-halfLaneWidth).add(point));
      rightBoundary.push(normal.clone().multiplyScalar(halfLaneWidth).add(point));
    }

    lengths.push(prevPoint.distanceTo(p2));

    this.centerlines[index] = points;
    this.arcLengths[index] = lengths;
    this.rotations[index] = pointRotations;
    this.leftBoundaries[index] = leftBoundary;
    this.rightBoundaries[index] = rightBoundary;
  }

  anchorsForSplineIndex(index) {
    let p;
    if (index == 0)
      p = [this.anchors[0]].concat(this.anchors.slice(0, 3));
    else
      p = this.anchors.slice(index - 1, index + 3);

    if (p[3] === undefined)
      p[3] = p[2];

    return p;
  }
}

function catmullRom(t, p0, p1, p2, p3) {
  const v0 = (p2 - p0) * 0.5;
  const v1 = (p3 - p1) * 0.5;
  const t2 = t * t;
  const t3 = t * t2;
  return (2 * p1 - 2 * p2 + v0 + v1) * t3 + (-3 * p1 + 3 * p2 - 2 * v0 - v1) * t2 + v0 * t + p1;
}

function catmullRomVec(t, p0, p1, p2, p3) {
  return new THREE.Vector2(catmullRom(t, p0.x, p1.x, p2.x, p3.x), catmullRom(t, p0.y, p1.y, p2.y, p3.y));
}

function tangentAt(t, p0, p1, p2, p3) {
  const delta = 0.0001;
  let t1 = t - delta;
  let t2 = t + delta;

  if (t1 < 0) t1 = 0;
  if (t2 > 1) t2 = 1;

  const prev = catmullRomVec(t1, p0, p1, p2, p3);
  const next = catmullRomVec(t2, p0, p1, p2, p3);

  return next.sub(prev).normalize();
}

function curvatureAt(t2, p0, p1, p2, p3) {
  const delta = 0.0001;

  // If we're estimating curvature at one of the endpoints of the spline,
  // slightly shift it inwards to avoid infinite curvature.
  if (t2 == 0) t2 = delta;
  if (t2 == 1) t2 = 1 - delta;

  let t1 = t2 - delta;
  let t3 = t2 + delta;

  if (t1 < 0) t1 = 0;
  if (t3 > 1) t3 = 1;

  const pt1 = catmullRomVec(t1, p0, p1, p2, p3);
  const pt2 = catmullRomVec(t2, p0, p1, p2, p3);
  const pt3 = catmullRomVec(t3, p0, p1, p2, p3);

  return (Math.atan2(pt3.y - pt2.y, pt3.x - pt2.x) - Math.atan2(pt2.y - pt1.y, pt2.x - pt1.x)) / pt2.distanceTo(pt1);
}
