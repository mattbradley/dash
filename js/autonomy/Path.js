import Car from "../physics/Car.js"

// input pose: { pos: Vector2, dir: 1 | -1 (forward | reverse) }
// pose: { pos: Vector2, dir: 1 | -1 (forward | reverse), frontPos: Vector2, fakePos: Vector2, rot: radian }
export default class Path {
  constructor(poses, startRotation, goalRotation) {
    this.poses = poses;

    for (let i = 0; i < poses.length; i++) {
      const pose = poses[i];
      let rot;

      if (i == 0) {
        rot = startRotation;
      } else if (i == poses.length - 1) {
        rot = goalRotation;
      } else {
        const prev = poses[i - 1].pos;
        const next = poses[i + 1].pos;
        rot = Math.atan2(next.y - prev.y, next.x - prev.x);
      }

      pose.rot = rot;
      pose.frontPos = Car.getFrontAxlePosition(pose.pos, rot);
      pose.fakePos = Car.getFakeAxlePosition(pose.pos, rot);
    }
  }
}
