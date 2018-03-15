import Car from "../../physics/Car.js"

export default class FollowController {
  constructor(path, car) {
    this.path = path;
    this.car = car;
    this.nextIndex = 1;
    this.prevVelocity = 0;
  }

  reset() {
    this.prevVelocity = 0;
  }

  replacePath(path) {
    this.path = path;
    this.nextIndex = 1;
  }

  predictPoseAfterTime(currentPose, predictionTime) {
    return currentPose;
  }

  control(pose, wheelAngle, velocity, dt) {
    const pathPoses = this.path.poses;
    const [nextIndex, progress, projection] = this.findNextIndex(pose.pos);
    this.nextIndex = nextIndex;

    const prevPose = pathPoses[nextIndex - 1];
    const nextPose = pathPoses[nextIndex];

    let gas = 0;
    let brake = 0;
    let steer = 0;

    if (nextIndex >= pathPoses.length - 1 && progress >= 1) {
      brake = 1;
    } else {
      const kp_a = 4;
      const kd_a = 0.5;
      const kff_a = 0.5;

      const currentAccel = (velocity - this.prevVelocity) / dt;
      const prevNextDist = nextPose.pos.distanceTo(prevPose.pos);
      const targetVelocity = Math.sqrt(2 * nextPose.acceleration * prevNextDist * Math.clamp(progress, 0, 1) + prevPose.velocity * prevPose.velocity);
      const diffVelocity = targetVelocity - velocity;
      const diffAccel = nextPose.acceleration - currentAccel;
      const targetAccel = kp_a * diffVelocity + kd_a * diffAccel + kff_a * nextPose.acceleration;

      if (targetAccel > 0)
        gas = Math.min(targetAccel / Car.MAX_GAS_ACCEL, 1);
      else
        brake = Math.min(-targetAccel / Car.MAX_BRAKE_DECEL, 1);

      this.prevVelocity = velocity;

      const curvature = prevPose.curv + (nextPose.curv - prevPose.curv) * progress;
      const desiredWheelAngle = Math.atan(curvature * Car.WHEEL_BASE);
      const wheelAngleError = desiredWheelAngle - wheelAngle;
      steer = Math.clamp(wheelAngleError / dt / Car.MAX_STEER_SPEED, -1, 1);

      this.car.rotation = prevPose.rot + (nextPose.rot - prevPose.rot) * progress;
      this.car.position.set(projection.x - Car.REAR_AXLE_POS * Math.cos(this.car.rotation), projection.y - Car.REAR_AXLE_POS * Math.sin(this.car.rotation));
    }

    return { gas, brake, steer };
  }

  findNextIndex(pos) {
    const pathPoses = this.path.poses;

    // Constrain the search to just a few points surrounding the current nextIndex
    // for performance and to avoid problems with a path that crosses itself
    const start = Math.max(0, this.nextIndex - 20);
    const end = Math.min(pathPoses.length - 1, this.nextIndex + 20);
    let closestDistSqr = pos.distanceToSquared(pathPoses[start].pos);
    let closestIndex = start;

    for (let i = start + 1; i < end; i++) {
      const distSqr = pos.distanceToSquared(pathPoses[i].pos);
      if (distSqr < closestDistSqr) {
        closestDistSqr = distSqr;
        closestIndex = i;
      }
    }

    if (closestIndex == pathPoses.length - 1) {
      const [projection, progress] = projectPointOnSegment(pos, pathPoses[closestIndex - 1].pos, pathPoses[closestIndex].pos);
      return [closestIndex, progress, projection];
    } else if (closestIndex == 0) {
      const [projection, progress] = projectPointOnSegment(pos, pathPoses[closestIndex].pos, pathPoses[closestIndex + 1].pos);
      return [closestIndex + 1, progress, projection];
    } else {
      // The nextPoint is either (closestPoint) or (closestPoint + 1). Project the pos to both
      // of those two line segments (the segment preceding closestPoint and the segment succeeding closestPoint)
      // to determine which segment it's closest to.
      const [precedingProjection, precedingProgress] = projectPointOnSegment(pos, pathPoses[closestIndex - 1].pos, pathPoses[closestIndex].pos);
      const [succeedingProjection, succeedingProgress] = projectPointOnSegment(pos, pathPoses[closestIndex].pos, pathPoses[closestIndex + 1].pos);

      if (pos.distanceToSquared(precedingProjection) < pos.distanceToSquared(succeedingProjection)) {
        return [closestIndex, precedingProgress, precedingProjection];
      } else {
        return [closestIndex + 1, succeedingProgress, succeedingProjection];
      }
    }
  }
}

// Returns [pointOnSegment, progressAlongSegment {0 - 1}]
function projectPointOnSegment(point, start, end) {
  const distSqr = start.distanceToSquared(end);
  const progress = point.clone().sub(start).dot(end.clone().sub(start)) / distSqr;
  return [end.clone().sub(start).multiplyScalar(progress).add(start), progress];
}
