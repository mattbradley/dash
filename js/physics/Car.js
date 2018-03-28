export default class Car {
  constructor(x = 0, y = 0, rotation = 0) {
    this.setPose(x, y, rotation);
  }

  static getFrontAxlePosition(pos, rot) {
    return THREE.Vector2.fromAngle(rot).multiplyScalar(Car.WHEEL_BASE).add(pos);
  }

  static getFakeAxlePosition(pos, rot) {
    return Car.frontToRearAxlePosition(pos, rot);
  }

  static centerToRearAxlePosition(pos, rot) {
    return THREE.Vector2.fromAngle(rot).multiplyScalar(Car.REAR_AXLE_POS).add(pos);
  }

  static frontToRearAxlePosition(pos, rot) {
    return THREE.Vector2.fromAngle(rot).multiplyScalar(-Car.WHEEL_BASE).add(pos);
  }

  get pose() {
    return { pos: this.rearAxlePosition.clone(), rot: this.rotation, velocity: this.velocity, curv: this.curvature, dCurv: this.dCurv, ddCurv: this.ddCurv };
  }

  get curvature() {
    return Math.tan(this.wheelAngle) / Car.WHEEL_BASE;
  }

  get rearAxlePosition() {
    const { x, y } = this.position;
    const rot = this.rotation;
    return new THREE.Vector2(x + Math.cos(rot) * Car.REAR_AXLE_POS, y + Math.sin(rot) * Car.REAR_AXLE_POS);
  }

  get frontAxlePosition() {
    const { x, y } = this.position;
    const rot = this.rotation;
    return new THREE.Vector2(x + Math.cos(rot) * Car.FRONT_AXLE_POS, y + Math.sin(rot) * Car.FRONT_AXLE_POS);
  }

  setPose(x, y, rotation) {
    // Translate so that x and y become the center of the vehicle (instead of the center of the rear axle)
    x -= Car.REAR_AXLE_POS * Math.cos(rotation);
    y -= Car.REAR_AXLE_POS * Math.sin(rotation);

    this.position = new THREE.Vector2(x, y);
    this.rotation = Math.wrapAngle(rotation);
    this.velocity = 0;
    this.acceleration = 0;
    this.wheelAngle = 0;
    this.wheelAngularVelocity = 0;
    this.dCurv = 0; // derivative with respect to arc length
    this.ddCurv = 0; // derivative with respect to arc length
  }

  step(dt) {
    const curvPrev = this.curvature;
    const dCurvPrev = this.dCurv;

    const drag = (0.5 * Car.DRAG_COEFF * Car.FRONTAL_AREA * Car.DENSITY_OF_AIR * Math.abs(this.velocity) + Car.ROLL_RESIST) * -this.velocity;
    this.velocity += (this.acceleration + drag / Car.MASS) * dt;

    const velocitySq = this.velocity * this.velocity;
    const maxWheelAngle = Math.clamp(Math.atan(Car.MAX_LATERAL_ACCEL * Car.WHEEL_BASE / velocitySq), 0.07, Car.MAX_WHEEL_ANGLE);
    this.wheelAngle = Math.clamp(Math.wrapAngle(this.wheelAngle + this.wheelAngularVelocity * dt), -maxWheelAngle, maxWheelAngle);

    const angularVelocity = this.velocity * this.curvature;
    this.rotation = Math.wrapAngle(this.rotation + angularVelocity * dt);

    const dist = this.velocity * dt;
    this.position = THREE.Vector2.fromAngle(this.rotation).multiplyScalar(dist).add(this.position);

    this.dCurv = dist > 0.1 ? (this.curvature - curvPrev) / dist : 0;
    this.ddCurv = dist > 0.1 ? (this.dCurv - dCurvPrev) / dist : 0;
  }

  update(controls, dt) {
    const gas = Math.clamp(controls.gas, -1, +1);
    const brake = Math.clamp(controls.brake, 0, 1);
    const steer = Math.clamp(controls.steer, -1, +1);

    if (brake > 0) {
      this.acceleration = -Math.sign(this.velocity) * Car.MAX_BRAKE_DECEL * brake;
      const newVelocity = this.velocity + this.acceleration * dt;

      // If applying the braking deceleration at the next step would cause the velocity
      // to change directions, then just set the car as stopped.
      if (Math.sign(newVelocity) != Math.sign(this.velocity)) {
        this.velocity = 0;
        this.acceleration = 0;
      }
    } else {
      this.acceleration = Car.MAX_GAS_ACCEL * gas;
    }

    if (steer != 0) {
      this.wheelAngularVelocity = steer * Car.MAX_STEER_SPEED;
    } else {
      this.wheelAngularVelocity = Math.clamp(-this.wheelAngle / Car.MAX_WHEEL_ANGLE * this.velocity * this.velocity * dt, -Car.MAX_STEER_SPEED, Car.MAX_STEER_SPEED);
    }
  }
}

Car.HALF_CAR_LENGTH = 2.5; // meters
Car.HALF_CAR_WIDTH = 1; // meters
Car.HALF_WHEEL_LENGTH = 0.38; // meters
Car.HALF_WHEEL_WIDTH = 0.12; // meters
Car.MAX_WHEEL_ANGLE = 32 / 180 * Math.PI; // radians
Car.MASS = 1600; // kg
Car.DRAG_COEFF = 0.7;
Car.DENSITY_OF_AIR = 1.8580608; // (kg/m^3)
Car.FRONTAL_AREA = 1.85; // m^2
Car.ROLL_RESIST = 0;
Car.MAX_STEER_SPEED = 0.8;//1.2; // Radians per second
Car.MAX_GAS_ACCEL = 3.5; // m / s^2
Car.MAX_BRAKE_DECEL = 6.5; // m / s^2
Car.WHEEL_LATERAL_POS = 0.843; // meters
Car.FRONT_AXLE_POS = 1.6; // meters
Car.REAR_AXLE_POS = -1.43; // meters
Car.WHEEL_BASE = Car.FRONT_AXLE_POS - Car.REAR_AXLE_POS; // meters
Car.MAX_LATERAL_ACCEL = 9.81; // m / s^2
