export default class {
  constructor(startRotation, anchors) {
    this.startRotation = startRotation;
    this.anchors = anchors;
  }

  getPoints(numPerAnchor) {
    if (this.anchors.length <= 1) return [];

    const points = [];

    let rot = this.startRotation;

    for (let a = 0; a < this.anchors.length - 1; a++) {
      const start = this.anchors[a];
      const end = this.anchors[a + 1];

      const rotVec = THREE.Vector2.fromAngle(rot);
      const chord = end.clone().sub(start);
      const theta = 2 * (Math.atan2(chord.y, chord.x) - Math.atan2(rotVec.y, rotVec.x)); // Subtended angle of the arc
      const radius = Math.abs(0.5 * chord.length() / Math.sin(theta / 2));
      //const arcLength = theta * radius;
      const radiusRotation = rot - Math.sign(theta) * Math.PI / 2; // Rotation relative to x-axis of the radius line
      const center = THREE.Vector2.fromAngle(radiusRotation + Math.PI).multiplyScalar(radius).add(start);

      for (let n = 0; n < numPerAnchor; n++) {
        points.push(THREE.Vector2.fromAngle(radiusRotation + theta * n / numPerAnchor).multiplyScalar(radius).add(center));
      }

      rot = Math.wrapAngle(rot + theta);
    }

    points.push(this.anchors[this.anchors.length - 1]);

    return points;
  }
}
