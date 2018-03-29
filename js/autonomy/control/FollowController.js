import Car from "../../physics/Car.js"

export default class FollowController {
  constructor(path, car) {
    this.path = path;
    this.car = car;
    this.nextIndex = 1;
    this.prevVelocity = 0;
    this.prevAccel = 0;
  }

  reset() {
    this.prevVelocity = 0;
    this.prevAccel = 0;
  }

  replacePath(path) {
    this.path = path;
    this.nextIndex = 1;
  }

  predictPoseAfterTime(currentPose, predictionTime) {
    const pathPoses = this.path.poses;
    let [nextIndex, progress] = this.findNextIndex(currentPose.pos);
    let currentVelocity = currentPose.velocity;

    if (currentVelocity <= 0.01) return currentPose;

    while (predictionTime > 0) {
      const prevPose = pathPoses[nextIndex - 1];
      const nextPose = pathPoses[nextIndex];

      const segmentDist = nextPose.pos.distanceTo(prevPose.pos);
      const distLeft = segmentDist * (1 - progress);
      const sumV = (currentVelocity + nextPose.velocity) / 2;
      const timeToNextIndex = 2 * distLeft / (sumV == 0 ? 0.01 : sumV);

      if (timeToNextIndex >= predictionTime || nextIndex + 1 >= pathPoses.length) {
        const dist = sumV / 2 * predictionTime;
        const newProgress = progress + dist / segmentDist;
        const newRotation = Math.wrapAngle(prevPose.rot + Math.wrapAngle(nextPose.rot - prevPose.rot) * newProgress);

        const pprevPose = nextIndex - 2 >= 0 ? pathPoses[nextIndex - 2] : prevPose;
        const nnextPose = nextIndex + 1 < pathPoses.length ? pathPoses[nextIndex + 1] : nextPose;

        const dCurv = (nextPose.curv - prevPose.curv) / segmentDist;
        const dCurvPrev = ((prevPose.curv - pprevPose.curv) / pprevPose.pos.distanceTo(prevPose.pos) + dCurv) / 2;
        const dCurvNext = (dCurv + (nnextPose.curv - nextPose.curv) / nextPose.pos.distanceTo(nnextPose.pos)) / 2;

        const ddCurv = (dCurvNext - dCurvPrev) / segmentDist;

        return {
          pos: nextPose.pos.clone().sub(prevPose.pos).multiplyScalar(newProgress).add(nextPose.pos),
          rot: newRotation,
          curv: prevPose.curv + (nextPose.curv - prevPose.curv) * newProgress,
          dCurv: dCurv,
          ddCurv: ddCurv,
          velocity: nextPose.velocity
        }
      }

      currentVelocity = nextPose.velocity;
      predictionTime -= timeToNextIndex;
      progress = 0;
      nextIndex++;
    }
  }

  control(pose, wheelAngle, velocity, dt, lockPath = false) {
    const pathPoses = this.path.poses;
    const [nextIndex, progress, projection] = this.findNextIndex(pose.pos);
    this.nextIndex = nextIndex;

    const prevPose = pathPoses[nextIndex - 1];
    const nextPose = pathPoses[nextIndex];

    let gas = 0;
    let brake = 0;
    let steer = 0;

    if (nextIndex >= pathPoses.length - 2 && progress >= 1) {
      brake = 1;
    } else {
      /*
      const kp_a = 4;
      const kd_a = 0.5;
      const kff_a = 0.5;

      const currentAccel = (velocity - this.prevVelocity) / dt;
      const prevNextDist = nextPose.pos.distanceTo(prevPose.pos);
      const targetVelocity = Math.sqrt(2 * nextPose.acceleration * prevNextDist * Math.clamp(progress, 0, 1) + prevPose.velocity * prevPose.velocity);
      const diffVelocity = targetVelocity - velocity;
      const diffAccel = nextPose.acceleration - currentAccel;
      const targetAccel = kp_a * diffVelocity + kd_a * diffAccel + kff_a * nextPose.acceleration;
      */
      const accelDamping = 0.1;
      const targetAccel = nextPose.acceleration;
      const dampedAccel = this.prevAccel * (1 - accelDamping) + targetAccel * accelDamping;

      if (dampedAccel > 0)
        gas = Math.min(dampedAccel / Car.MAX_GAS_ACCEL, 1);
      else
        brake = Math.min(-dampedAccel / Car.MAX_BRAKE_DECEL, 1);

      this.prevVelocity = velocity;
      this.prevAccel = dampedAccel;

      const curvature = prevPose.curv + (nextPose.curv - prevPose.curv) * progress;
      const desiredWheelAngle = Math.atan(curvature * Car.WHEEL_BASE);
      const wheelAngleError = desiredWheelAngle - wheelAngle;
      steer = Math.clamp(wheelAngleError / dt / Car.MAX_STEER_SPEED, -1, 1);

      if (lockPath) {
        const damping = 0.1;
        const newRotation = Math.wrapAngle(prevPose.rot + Math.wrapAngle(nextPose.rot - prevPose.rot) * progress);
        const newPosition = new THREE.Vector2(projection.x - Car.REAR_AXLE_POS * Math.cos(newRotation), projection.y - Car.REAR_AXLE_POS * Math.sin(newRotation));

        if (Math.abs(Math.wrapAngle(newRotation - this.car.rotation)) > 0.5) {
          console.log('wut');
        }

        this.car.rotation += damping * Math.wrapAngle(newRotation - this.car.rotation);
        this.car.position = this.car.position.clone().multiplyScalar(1 - damping).add(newPosition.multiplyScalar(damping));
      }
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
