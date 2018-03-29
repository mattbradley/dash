// Half width and half height
const VEHICLE_SIZE = { w: 2.5, h: 1 };
const CYCLIST_SIZE = { w: 1.2, h: 0.6 };
const PEDESTRIAN_SIZE = { w: 0.6, h: 0.6 };

export default class DynamicObstacle {
  static hydrate(obj) {
    Object.setPrototypeOf(obj, DynamicObstacle.prototype);
    Object.setPrototypeOf(obj.startPos, THREE.Vector2.prototype);
    Object.setPrototypeOf(obj.velocity, THREE.Vector2.prototype);
  }

  constructor(type, startPos, velocity, parallel) {
    this.type = type;
    this.startPos = startPos;
    this.velocity = velocity;
    this.parallel = parallel;

    switch (type) {
        case 'cyclist':
          this.size = Object.assign({}, CYCLIST_SIZE);
          break;

        case 'pedestrian':
          this.size = Object.assign({}, PEDESTRIAN_SIZE);
          break;

        default:
          this.size = Object.assign({}, VEHICLE_SIZE);
    }

    if (!parallel)
      [this.size.w, this.size.h] = [this.size.h, this.size.w];
  }

  positionAtTime(time) {
    return this.velocity.clone().multiplyScalar(time).add(this.startPos);
  }

  positionsInTimeRange(startTime, endTime, numFrames) {
    const dt = (endTime - startTime) / numFrames;
    const positions = [];
    let time = startTime;

    for (let i = 0; i <= numFrames; i++) {
      positions.push(this.positionAtTime(time));
      time += dt;
    }

    return positions;
  }

  verticesInTimeRange(startTime, endTime, config) {
    const positions = this.positionsInTimeRange(startTime, endTime, config.numDynamicSubframes);
    const vertices = [];

    // Hazard dilation (drawn behind, z = 0.75)
    const hazardHalfWidth = this.size.w + config.dynamicHazardDilationS + config.collisionDilationS;
    const hazardHalfHeight = this.size.h + config.dynamicHazardDilationL + config.collisionDilationL;

    positions.forEach(p => {
      const v1 = [-hazardHalfWidth + p.x, hazardHalfHeight + p.y];
      const v2 = [hazardHalfWidth + p.x, hazardHalfHeight + p.y];
      const v3 = [hazardHalfWidth + p.x, -hazardHalfHeight + p.y];
      const v4 = [-hazardHalfWidth + p.x, -hazardHalfHeight + p.y];

      vertices.push(
        v1[0], v1[1], 0.75,
        v2[0], v2[1], 0.75,
        v3[0], v3[1], 0.75,
        v3[0], v3[1], 0.75,
        v4[0], v4[1], 0.75,
        v1[0], v1[1], 0.75
      );
    });
    
    // Collision dilation (drawn in front, z = 0.25)
    const collisionHalfWidth = this.size.w + config.collisionDilationS;
    const collisionHalfHeight = this.size.h + config.collisionDilationL;

    positions.forEach(p => {
      const v1 = [-collisionHalfWidth + p.x, collisionHalfHeight + p.y];
      const v2 = [collisionHalfWidth + p.x, collisionHalfHeight + p.y];
      const v3 = [collisionHalfWidth + p.x, -collisionHalfHeight + p.y];
      const v4 = [-collisionHalfWidth + p.x, -collisionHalfHeight + p.y];

      vertices.push(
        v1[0], v1[1], 0.25,
        v2[0], v2[1], 0.25,
        v3[0], v3[1], 0.25,
        v3[0], v3[1], 0.25,
        v4[0], v4[1], 0.25,
        v1[0], v1[1], 0.25
      );
    });

    return vertices;
  }
}
