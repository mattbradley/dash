import Car from "../physics/Car.js"

// input pose: { pos: Vector2 [, rot: radians] }
// pose: { pos: Vector2, frontPos: Vector2, fakePos: Vector2, rot: radians }
export default class Path {
  constructor(poses, startRotation = 0, goalRotation = 0) {
    this.poses = poses;

    for (let i = 0; i < poses.length; i++) {
      const pose = poses[i];

      if (pose.rot === undefined) {
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
      }

      pose.frontPos = Car.getFrontAxlePosition(pose.pos, pose.rot);
      pose.fakePos = Car.getFakeAxlePosition(pose.pos, pose.rot);
    }
  }
}
