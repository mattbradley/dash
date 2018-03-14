import Car from "../../physics/Car.js"

export default class AutonomousController {
  constructor(path) {
    this.path = path;
    this.nextIndex = 1;
    this.prevPhiError = 0;
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
    const pathPoses = this.path.poses;
    const frontAxlePos = Car.getFrontAxlePosition(currentPose.pos, currentPose.rot);
    let [nextIndex, progress] = this.findNextIndex(frontAxlePos);
    let currentVelocity = currentPose.velocity;

    if (currentVelocity <= 0.01) return currentPose;

    while (predictionTime > 0) {
      const prevPose = pathPoses[nextIndex - 1];
      const nextPose = pathPoses[nextIndex];

      const segmentDist = nextPose.pos.distanceTo(prevPose.pos);
      const distLeft = segmentDist * (1 - progress);
      const sumV = currentVelocity + nextPose.velocity;
      const timeToNextIndex = 2 * distLeft / (sumV == 0 ? 0.01 : sumV);
      //const timeToNextIndex = distLeft / currentVelocity;

      if (timeToNextIndex >= predictionTime || nextIndex + 1 >= pathPoses.length) {
        const dist = sumV / 2 * predictionTime;
        const newProgress = progress + dist / segmentDist;

        return {
          pos: nextPose.pos.clone().sub(prevPose.pos).multiplyScalar(newProgress).add(nextPose.pos),
          rot: prevPose.rot + (nextPose.rot - prevPose.rot) * newProgress,
          curv: prevPose.curv + (nextPose.curv - prevPose.curv) * newProgress,
          dCurv: 0,
          ddCurv: 0,
          velocity: nextPose.velocity
        }
      }

      //currentVelocity = nextPose.velocity;
      predictionTime -= timeToNextIndex;
      progress = 0;
      nextIndex++;
    }
  }

  control(pose, wheelAngle, velocity, dt) {
    const pathPoses = this.path.poses;
    const frontAxlePos = Car.getFrontAxlePosition(pose.pos, pose.rot);
    const [nextIndex, progress] = this.findNextIndex(frontAxlePos);
    this.nextIndex = nextIndex;

    let gas = 0;
    let brake = 0;
    let phi = 0; // the desired wheel deflection

    if (nextIndex >= pathPoses.length - 1 && progress >= 1) {
      gas = 0;
      brake = 1;
      phi = 0;
    } else {
      const kp_a = 4;
      const kd_a = 0.5;
      const kff_a = 0.5;

      const currentAccel = (velocity - this.prevVelocity) / dt;
      const prevNextDist = pathPoses[this.nextIndex].pos.distanceTo(pathPoses[this.nextIndex - 1].pos);
      const targetVelocity = Math.sqrt(2 * pathPoses[nextIndex].acceleration * prevNextDist * Math.clamp(progress, 0, 1) + pathPoses[this.nextIndex - 1].velocity * pathPoses[this.nextIndex - 1].velocity);
      const diffVelocity = targetVelocity - velocity;
      const diffAccel = pathPoses[this.nextIndex].acceleration - currentAccel;
      const targetAccel = kp_a * diffVelocity + kd_a * diffAccel + kff_a * pathPoses[this.nextIndex].acceleration;

      if (targetAccel > 0)
        gas = Math.min(targetAccel / Car.MAX_GAS_ACCEL, 1);
      else
        brake = Math.min(-targetAccel / Car.MAX_BRAKE_DECEL, 1);

      this.prevVelocity = velocity;

      const closestFrontPathPos = projectPointOnSegment(frontAxlePos, pathPoses[this.nextIndex - 1].frontPos, pathPoses[this.nextIndex].frontPos)[0];

      // Determine the desired heading at the specific point on the front path by lerping between prevHeading and nextHeading using progress as the weight
      const prevHeading = this.nextIndex > 1 ? pathPoses[nextIndex].frontPos.clone().sub(pathPoses[nextIndex - 2].frontPos).angle() : pathPoses[0].rot;
      const nextHeading = this.nextIndex < pathPoses.length - 1 ? pathPoses[nextIndex + 1].frontPos.clone().sub(pathPoses[nextIndex - 1].frontPos).angle() : pathPoses[pathPoses.length - 1].rot;
      const desiredHeading = prevHeading + (nextHeading - prevHeading) * progress;

      // Determine if the front axle is to the left or right of the front path
      const pathVec = pathPoses[nextIndex].frontPos.clone().sub(pathPoses[nextIndex - 1].frontPos).normalize();
      const zero = new THREE.Vector2(0, 0);
      const left = pathVec.clone().rotateAround(zero, Math.PI / 2).add(closestFrontPathPos);
      const right = pathVec.clone().rotateAround(zero, -Math.PI / 2).add(closestFrontPathPos);
      const dir = frontAxlePos.distanceToSquared(left) < frontAxlePos.distanceToSquared(right) ? -1 : 1;

      const k = 4;
      const gain = 0.8;
      const crossTrackError = frontAxlePos.distanceTo(closestFrontPathPos);
      const headingError = Math.wrapAngle(pose.rot - desiredHeading);

      //phi = -headingError + gain * Math.atan(k * dir * crossTrackError / velocity);

      const curv = pathPoses[nextIndex - 1].curv + (pathPoses[nextIndex].curv - pathPoses[nextIndex - 1].curv) * progress;

      phi = Math.atan(curv * Car.WHEEL_BASE) + gain * Math.atan(k * dir * crossTrackError / Math.max(velocity, 0.01));

      const checkSteer = Math.clamp((phi - wheelAngle) / dt / Car.MAX_STEER_SPEED, -1, 1);
    }

    const phiError = phi - wheelAngle;
    /*
    const dPhiError = (phiError - this.prevPhiError) / dt;
    this.prevPhiError = phiError;
    
    const steer = Math.clamp(12 * phiError + 0.8 * dPhiError, -1, 1);
    */

    const steer = Math.clamp(phiError / dt / Car.MAX_STEER_SPEED, -1, 1);

    return { gas, brake, steer };
  }

  // Finds the next point the vehicle is approaching and the progress between the prev point and the next point
  // Returns [nextPointIndex, progress from (nextPointIndex - 1) to nextPointIndex, {0 - 1}]
  findNextIndex(frontAxlePos) {
    const pathPoses = this.path.poses;

    // Constrain the search to just a few points surrounding the current nextIndex
    // for performance and to avoid problems with a path that crosses itself
    const start = Math.max(0, this.nextIndex - 20);
    const end = Math.min(pathPoses.length - 1, this.nextIndex + 20);
    let closestDistSqr = frontAxlePos.distanceToSquared(pathPoses[start].frontPos);
    let closestIndex = start;

    for (let i = start + 1; i < end; i++) {
      const distSqr = frontAxlePos.distanceToSquared(pathPoses[i].frontPos);
      if (distSqr < closestDistSqr) {
        closestDistSqr = distSqr;
        closestIndex = i;
      }
    }

    if (closestIndex == pathPoses.length - 1) {
      const [_, progress] = projectPointOnSegment(frontAxlePos, pathPoses[closestIndex - 1].frontPos, pathPoses[closestIndex].frontPos);
      return [closestIndex, progress];
    } else if (closestIndex == 0) {
      const [_, progress] = projectPointOnSegment(frontAxlePos, pathPoses[closestIndex].frontPos, pathPoses[closestIndex + 1].frontPos);
      return [closestIndex + 1, progress];
    } else {
      // The nextPoint is either (closestPoint) or (closestPoint + 1). Project the frontAxlePos to both
      // of those two line segments (the segment preceding closestPoint and the segment succeeding closestPoint)
      // to determine which segment it's closest to.
      const [precedingProjection, precedingProgress] = projectPointOnSegment(frontAxlePos, pathPoses[closestIndex - 1].frontPos, pathPoses[closestIndex].frontPos);
      const [succeedingProjection, succeedingProgress] = projectPointOnSegment(frontAxlePos, pathPoses[closestIndex].frontPos, pathPoses[closestIndex + 1].frontPos);

      if (frontAxlePos.distanceToSquared(precedingProjection) < frontAxlePos.distanceToSquared(succeedingProjection)) {
        return [closestIndex, precedingProgress];
      } else {
        return [closestIndex + 1, succeedingProgress];
      }
    }
  }
}

// Returns [pointOnSegment, progressAlongSegment {0 - 1}]
function projectPointOnSegment(point, start, end) {
  const distSqr = start.distanceToSquared(end);
  //const progress = Math.clamp(point.clone().sub(start).dot(end.clone().sub(start)) / distSqr, 0, 1);
  const progress = point.clone().sub(start).dot(end.clone().sub(start)) / distSqr;
  return [end.clone().sub(start).multiplyScalar(progress).add(start), progress];
}
