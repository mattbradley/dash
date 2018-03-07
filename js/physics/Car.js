export default class Car {
  constructor(world, x = 0, y = 0, rotation = 0) {
    this.world = world;
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
    return { pos: this.rearAxlePosition, rot: this.rotation };
  }

  get position() {
    const pos = this.body.GetPosition();
    return new THREE.Vector2(pos.get_x(), pos.get_y());
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

  get rotation() {
    return this.body.GetAngle();
  }

  get speed() {
    return this.body.GetLinearVelocity().Length();
  }

  get wheelAngle() {
    return Math.wrapAngle(this.leftFrontWheel.joint.GetJointAngle());
  }

  setPose(x, y, rotation) {
    this.destroyBodies();

    // Translate so that x and y become the center of the vehicle (instead of the center of the rear axle)
    x -= Car.REAR_AXLE_POS * Math.cos(rotation);
    y -= Car.REAR_AXLE_POS * Math.sin(rotation);

    const pos = new Box2D.b2Vec2(x, y);
    const bd = new Box2D.b2BodyDef();
    bd.set_type(Box2D.b2_dynamicBody);
    bd.set_position(pos);
    bd.set_angle(rotation);
    this.body = this.world.CreateBody(bd);
    this.body.SetAngularDamping(Car.ANGULAR_DAMPING);

    const shape = new Box2D.b2PolygonShape();
    shape.SetAsBox(Car.HALF_CAR_LENGTH, Car.HALF_CAR_WIDTH);

    const fd = new Box2D.b2FixtureDef();
    fd.set_shape(shape);
    fd.set_density(Car.CHASSIS_DENSITY);
    fd.set_friction(Car.FRICTION);
    fd.set_restitution(Car.RESTITUTION);
    this.body.CreateFixture(fd);

    const lfPos = new Box2D.b2Vec2(Car.FRONT_AXLE_POS, Car.WHEEL_LATERAL_POS);
    const rfPos = new Box2D.b2Vec2(Car.FRONT_AXLE_POS, -Car.WHEEL_LATERAL_POS);
    const lrPos = new Box2D.b2Vec2(Car.REAR_AXLE_POS, Car.WHEEL_LATERAL_POS);
    const rrPos = new Box2D.b2Vec2(Car.REAR_AXLE_POS, -Car.WHEEL_LATERAL_POS);

    this.leftFrontWheel = createFrontWheel.call(this, lfPos, pos, rotation);
    this.rightFrontWheel = createFrontWheel.call(this, rfPos, pos, rotation);
    this.leftRearWheel = createRearWheel.call(this, lrPos, pos, rotation);
    this.rightRearWheel = createRearWheel.call(this, rrPos, pos, rotation);

    Box2D.destroy(pos);
    Box2D.destroy(bd);
    Box2D.destroy(shape);
    Box2D.destroy(fd);
    Box2D.destroy(lfPos);
    Box2D.destroy(rfPos);
    Box2D.destroy(lrPos);
    Box2D.destroy(rrPos);
  }

  destroyBodies() {
    if (this.body) {
      this.world.DestroyBody(this.body);
      this.body = null;

      this.world.DestroyBody(this.leftFrontWheel.body);
      this.leftFrontWheel = null;

      this.world.DestroyBody(this.rightFrontWheel.body);
      this.rightFrontWheel = null;

      this.world.DestroyBody(this.leftRearWheel.body);
      this.leftRearWheel = null;

      this.world.DestroyBody(this.rightRearWheel.body);
      this.rightRearWheel = null;
    }
  }

  update(controls, dt) {
    const gas = Math.clamp(controls.gas, -1, +1);
    const brake = Math.clamp(controls.brake, 0, 1);
    const steer = Math.clamp(controls.steer, -1, +1);

    const mass = this.body.GetMass();
    const velocity = this.body.GetLinearVelocity();
    const rotation = this.body.GetAngle();
    let velocitySqr = velocity.LengthSquared();
    let velocityMag = velocity.Length();
    const drag = 0.5 * Car.DRAG_COEFF * Car.FRONTAL_AREA * Car.DENSITY_OF_AIR * velocityMag;
    let gasForce = new Box2D.b2Vec2(0, 0);
    let brakeForce = new Box2D.b2Vec2(0, 0);

    if (brake > 0) {
      if (velocityMag > 0.1) {
        // brakeForce = MAX_BRAKE_DECEL * mass * brake * velocity / velocityMag
        brakeForce.op_add(velocity);
        brakeForce.op_mul(Car.MAX_BRAKE_DECEL * mass * brake);
        brakeForce.op_mul(1 / velocityMag);
      } else {
        const zero = new Box2D.b2Vec2(0, 0);
        this.body.SetLinearVelocity(zero);
        velocity.Set(0, 0);
        velocitySqr = 0;
        velocityMag = 0;

        Box2D.destroy(zero);
      }
    } else {
      const f = Car.MAX_GAS_ACCEL * mass * gas;
      Box2D.destroy(gasForce);
      gasForce = new Box2D.b2Vec2(f * Math.cos(rotation), f * Math.sin(rotation));
    }

    // totalForce = gasForce - brakeForce - velocity * (drag + Car.ROLL_RESIST)
    const totalForce = new Box2D.b2Vec2(0, 0);
    totalForce.op_sub(velocity);
    totalForce.op_mul(drag + Car.ROLL_RESIST);
    totalForce.op_add(gasForce);
    totalForce.op_sub(brakeForce);

    this.body.ApplyForceToCenter(totalForce);

    const maxWheelAngle = Math.clamp(Math.atan(Car.MAX_LATERAL_ACCEL * Car.WHEEL_BASE / this.body.GetLinearVelocity().LengthSquared()), 0.07, Car.MAX_WHEEL_ANGLE);
    this.leftFrontWheel.joint.SetLimits(-maxWheelAngle, maxWheelAngle);
    this.rightFrontWheel.joint.SetLimits(-maxWheelAngle, maxWheelAngle);

    let motorSpeed;
    const wheelAngle = this.leftFrontWheel.joint.GetJointAngle();
    if (steer != 0) {
      motorSpeed = steer * Car.MAX_STEER_SPEED;
    } else {
      motorSpeed = Math.clamp(-wheelAngle / Car.MAX_WHEEL_ANGLE * velocitySqr * dt, -Car.MAX_STEER_SPEED, Car.MAX_STEER_SPEED);
    }

    this.leftFrontWheel.joint.SetMotorSpeed(motorSpeed);
    this.rightFrontWheel.joint.SetMotorSpeed(motorSpeed);

    ['leftFrontWheel', 'rightFrontWheel', 'leftRearWheel', 'rightRearWheel'].forEach(w => {
      const wheel = this[w].body;
      const v = wheel.GetLinearVelocity();
      const localV = wheel.GetLocalVector(v);
      const localDamping = new Box2D.b2Vec2(0, -Car.LATERAL_DAMPING * localV.get_y());

      // newV = wheel.GetWorldVector(localDamping) * dt + v
      const newV = new Box2D.b2Vec2(0, 0);
      newV.op_add(wheel.GetWorldVector(localDamping));
      newV.op_mul(dt);
      newV.op_add(v);
      wheel.SetLinearVelocity(newV);

      Box2D.destroy(localDamping);
      Box2D.destroy(newV);
    });

    Box2D.destroy(gasForce);
    Box2D.destroy(brakeForce);
    Box2D.destroy(totalForce);
  }
}

function createWheel(offset, carPosition, rotation) {
  const cosRot = Math.cos(rotation);
  const sinRot = Math.sin(rotation);
  const position = new Box2D.b2Vec2(cosRot * offset.get_x() - sinRot * offset.get_y() + carPosition.get_x(), sinRot * offset.get_x() + cosRot * offset.get_y() + carPosition.get_y());

  const bd = new Box2D.b2BodyDef();
  bd.set_type(Box2D.b2_dynamicBody);
  bd.set_position(position);
  bd.set_angle(rotation);

  const body = this.world.CreateBody(bd);
  const shape = new Box2D.b2PolygonShape();
  shape.SetAsBox(Car.HALF_WHEEL_LENGTH, Car.HALF_WHEEL_WIDTH);

  const fd = new Box2D.b2FixtureDef();
  fd.set_shape(shape);
  fd.set_density(Car.WHEEL_DENSITY);
  fd.set_friction(Car.FRICTION);
  fd.set_restitution(Car.RESTITUTION);
  body.CreateFixture(fd);

  Box2D.destroy(position);
  Box2D.destroy(bd);
  Box2D.destroy(shape);
  Box2D.destroy(fd);

  return body;
}

function createRearWheel(offset, carPosition, rotation) {
  const body = createWheel.call(this, offset, carPosition, rotation);
  const zero = new Box2D.b2Vec2(0, 0);

  const jd = new Box2D.b2WeldJointDef();
  jd.set_bodyA(this.body);
  jd.set_bodyB(body);
  jd.set_localAnchorA(offset);
  jd.set_localAnchorB(zero);

  const joint = Box2D.castObject(this.world.CreateJoint(jd), Box2D.b2WeldJoint);

  Box2D.destroy(zero);
  Box2D.destroy(jd);

  return { body, joint };
}

function createFrontWheel(offset, carPosition, rotation) {
  const body = createWheel.call(this, offset, carPosition, rotation);
  const zero = new Box2D.b2Vec2(0, 0);

  const jd = new Box2D.b2RevoluteJointDef();
  jd.set_bodyA(this.body);
  jd.set_bodyB(body);
  jd.set_localAnchorA(offset);
  jd.set_localAnchorB(zero);
  jd.set_enableMotor(true);
  jd.set_motorSpeed(0);
  jd.set_maxMotorTorque(Car.MAX_WHEEL_MOTOR_TORQUE);
  jd.set_enableLimit(true);
  jd.set_lowerAngle(-Car.MAX_WHEEL_ANGLE);
  jd.set_upperAngle(Car.MAX_WHEEL_ANGLE);

  const joint = Box2D.castObject(this.world.CreateJoint(jd), Box2D.b2RevoluteJoint);

  Box2D.destroy(zero);
  Box2D.destroy(jd);

  return { body, joint };
}

Car.HALF_CAR_LENGTH = 2.5; // meters
Car.HALF_CAR_WIDTH = 1; // meters
Car.CHASSIS_DENSITY = 1600 / 9.2; // kg / m^3
Car.HALF_WHEEL_LENGTH = 0.33; // meters
Car.HALF_WHEEL_WIDTH = 0.12; // meters
Car.WHEEL_DENSITY = 250; // kg / m^3
Car.MAX_WHEEL_MOTOR_TORQUE = 1000; // N * m
Car.MAX_WHEEL_ANGLE = 32 / 180 * Math.PI; // radians
Car.ANGULAR_DAMPING = 0.3;
Car.FRICTION = 0.9;
Car.RESTITUTION = 0.1;
Car.DRAG_COEFF = 0.7;
Car.DENSITY_OF_AIR = 1.8580608; // (kg/m^3)
Car.FRONTAL_AREA = 1.85; // m^2
Car.ROLL_RESIST = 30;
Car.MAX_STEER_SPEED = 0.8;//1.2; // Radians per second
Car.MAX_GAS_ACCEL = 3.5; // m / s^2
Car.MAX_BRAKE_DECEL = 6.5; // m / s^2
Car.LATERAL_DAMPING = 1000;
Car.WHEEL_LATERAL_POS = 0.843; // meters
Car.FRONT_AXLE_POS = 1.56; // meters
Car.REAR_AXLE_POS = -1.37; // meters
Car.WHEEL_BASE = Car.FRONT_AXLE_POS - Car.REAR_AXLE_POS; // meters
Car.MAX_LATERAL_ACCEL = 9.81; // m / s^2
