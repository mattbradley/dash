export default class DynamicObstacle {
  constructor(startPos, velocity, parallel) {
    // width 5, heigth 2
    this.startPos = stationLatitude;
    this.velocity = velocity;

    // TODO: replace this with constants
    this.halfWidth = parallel ? 2.5 : 1;
    this.halfHeight = parallel ? 1 : 2.5;
  }

  positionAtTime(time) {
    return this.velocity.clone().multiplyScalar(time).add(this.startPos);
  }

  positionsInTimeRange(timeStart, timeEnd, numFrames) {
    const dt = (timeEnd - timeStart) / numFrames;
    const positions = [];
    let time = timeStart;

    for (let i = 0; i < numFrames; i++) {
      positions.push(this.positionAtTime(time));
      time += dt;
    }

    return positions;
  }

  verticesInTimeRange(timeStart, timeEnd, config) {
    const positions = this.positionsInTimeRange(timeStart, timeEnd, config.numDynamicSubframes);
    const vertices = [];

    // Hazard dilation (drawn behind, z = 0.5)
    const hazardHalfWidth = this.halfWidth + config.hazardDilationS + config.collisionDilationS;
    const hazardHalfHeight = this.halfHeight + config.hazardDilationL + config.collisionDilationL;

    positions.forEach(p => {
      const v1 = [-hazardHalfWidth + p.x, hazardHalfHeight + p.y];
      const v2 = [hazardHalfWidth + p.x, hazardHalfHeight + p.y];
      const v3 = [hazardHalfWidth + p.x, -hazardHalfHeight + p.y];
      const v4 = [-hazardHalfWidth + p.x, -hazardHalfHeight + p.y];

      vertices.push(
        v1[0], v1[1], 0.5,
        v2[0], v2[1], 0.5,
        v3[0], v3[1], 0.5,
        v3[0], v3[1], 0.5,
        v4[0], v4[1], 0.5,
        v1[0], v1[1], 0.5
      );
    });
    
    // Collision dilation (drawn in front, z = -0.5)
    const collisionHalfWidth = this.halfWidth + config.collisionDilationS;
    const collisionHalfHeight = this.halfHeight + config.collisionDilationL;

    positions.forEach(p => {
      const v1 = [-collisionHalfWidth + p.x, collisionHalfHeight + p.y];
      const v2 = [collisionHalfWidth + p.x, collisionHalfHeight + p.y];
      const v3 = [collisionHalfWidth + p.x, -collisionHalfHeight + p.y];
      const v4 = [-collisionHalfWidth + p.x, -collisionHalfHeight + p.y];

      vertices.push(
        v1[0], v1[1], -0.5,
        v2[0], v2[1], -0.5,
        v3[0], v3[1], -0.5,
        v3[0], v3[1], -0.5,
        v4[0], v4[1], -0.5,
        v1[0], v1[1], -0.5
      );
    });

    return vertices;
  }
}
