import Car from "../../physics/Car.js"

export default class AutonomousController {
  constructor(path) {
    this.path = path;
    this.nextIndex = 1;
    this.state = 'stopped';
    this.closestFrontPathPos = null;
    this.prevPhiError = 0;
    this.targetSpeed = 5;
  }

  control(pose, wheelAngle, speed, dt) {
    const pathPoses = this.path.poses;
    const frontAxlePos = Car.getFrontAxlePosition(pose.pos, pose.rot);
    const [nextIndex, progress] = this.findNextIndex(frontAxlePos);
    this.nextIndex = nextIndex;

    this.closestFrontPathPos = projectPointOnSegment(frontAxlePos, this.path.poses[this.nextIndex - 1].frontPos, this.path.poses[this.nextIndex].frontPos)[0];

    // Determine the desired heading at the specific point on the front path by lerping between prevHeading and nextHeading using progress as the weight
    const prevHeading = this.nextIndex > 1 ? pathPoses[nextIndex].frontPos.clone().sub(pathPoses[nextIndex - 2].frontPos).angle() : pathPoses[0].rot;
    const nextHeading = this.nextIndex < pathPoses.length - 1 ? pathPoses[nextIndex + 1].frontPos.clone().sub(pathPoses[nextIndex - 1].frontPos).angle() : pathPoses[pathPoses.length - 1].rot;
    const desiredHeading = prevHeading + (nextHeading - prevHeading) * progress;

    // Determine if the front axle is to the left or right of the front path
    const pathVec = pathPoses[nextIndex].frontPos.clone().sub(pathPoses[nextIndex - 1].frontPos).normalize();
    const zero = new THREE.Vector2(0, 0);
    const left = pathVec.clone().rotateAround(zero, Math.PI / 2).add(this.closestFrontPathPos);
    const right = pathVec.clone().rotateAround(zero, -Math.PI / 2).add(this.closestFrontPathPos);
    const dir = frontAxlePos.distanceToSquared(left) < frontAxlePos.distanceToSquared(right) ? -1 : 1;

    const k = 4;
    const gain = 0.1;
    const crossTrackError = frontAxlePos.distanceTo(this.closestFrontPathPos);
    const headingError = Math.wrapAngle(pose.rot - desiredHeading);

    // phi is the desired wheel deflection
    const phi = -headingError + gain * Math.atan(k * dir * crossTrackError / speed);
    const phiError = phi - wheelAngle;
    /*
    const dPhiError = (phiError - this.prevPhiError) / dt;
    this.prevPhiError = phiError;
    
    const steer = Math.clamp(12 * phiError + 0.8 * dPhiError, -1, 1);
    */

    const steer = Math.clamp(phiError / dt / Car.MAX_STEER_SPEED, -1, 1);
    let gas = 0;
    let brake = 0;

    const speedError = 0.5 * (this.targetSpeed - speed);
    if (speedError > 0) gas = speedError;
    else if (speedError < 0) brake = -speedError;

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
  const progress = Math.clamp(point.clone().sub(start).dot(end.clone().sub(start)) / distSqr, 0, 1);
  return [end.clone().sub(start).multiplyScalar(progress).add(start), progress];
}
