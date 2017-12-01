export class Car {
  constructor(world, position = [0, 0], rotation = 0) {
    const bd = new Box2D.b2BodyDef();
    bd.set_type(Box2D.b2_dynamicBody);
    bd.set_position(new Box2D.b2Vec2(position[0], position[1]));
    bd.set_angle(rotation);
    this.body = world.CreateBody(bd);
    this.body.SetAngularDamping(Car.ANGULAR_DAMPING);

    const shape = new Box2D.b2PolygonShape();
    shape.SetAsBox(Car.HALF_CAR_LENGTH, Car.HALF_CAR_WIDTH);

    const fd = new Box2D.b2FixtureDef();
    fd.set_shape(shape);
    fd.set_density(Car.CHASSIS_DENSITY);
    fd.set_friction(Car.FRICTION);
    fd.set_restitution(Car.RESTITUTION);
    this.body.CreateFixture(fd);

    this.leftFrontWheel = createFrontWheel.call(this, world, new Box2D.b2Vec2(Car.FRONT_AXLE_POS, Car.WHEEL_LATERAL_POS));
    this.rightFrontWheel = createFrontWheel.call(this, world, new Box2D.b2Vec2(Car.FRONT_AXLE_POS, -Car.WHEEL_LATERAL_POS));
    this.leftRearWheel = createRearWheel.call(this, world, new Box2D.b2Vec2(Car.REAR_AXLE_POS, Car.WHEEL_LATERAL_POS));
    this.rightRearWheel = createRearWheel.call(this, world, new Box2D.b2Vec2(Car.REAR_AXLE_POS, -Car.WHEEL_LATERAL_POS));

    Box2D.destroy(bd);
    Box2D.destroy(shape);
    Box2D.destroy(fd);
  }

  static getFrontAxlePosition(pos, rot) {
    return THREE.Vector2.fromAngle(rot).multiplyScalar(Car.WHEEL_BASE).add(pos);
  }

  static getFakeAxlePosition(pos, rot) {
    return THREE.Vector2.fromAngle(rot).negate().multiplyScalar(Car.WHEEL_BASE).add(pos);
  }

  get pose() {
    const rearAxlePos = this.rearAxlePosition;
    return { pos: new THREE.Vector2(rearAxlePos[0], rearAxlePos[1]), rot: this.rotation };
  }

  get position() {
    const pos = this.body.GetPosition();
    return [pos.get_x(), pos.get_y()];
  }

  get rearAxlePosition() {
    const [x, y] = this.position;
    const rot = this.rotation;
    return [x + Math.cos(rot) * Car.REAR_AXLE_POS, y + Math.sin(rot) * Car.REAR_AXLE_POS];
  }

  get frontAxlePosition() {
    const [x, y] = this.position;
    const rot = this.rotation;
    return [x + Math.cos(rot) * Car.FRONT_AXLE_POS, y + Math.sin(rot) * Car.FRONT_AXLE_POS];
  }

  get rotation() {
    return this.body.GetAngle();
  }

  get speed() {
    return this.body.GetLinearVelocity().Length();
  }

  get wheelAngle() {
    return this.leftFrontWheel.joint.GetJointAngle();
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

    const maxWheelAngle = Math.clamp(Math.atan(Car.MAX_CENTRIPETAL_ACCEL * Car.WHEEL_BASE / this.body.GetLinearVelocity().LengthSquared()), 0.07, Car.MAX_WHEEL_ANGLE);
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

function createWheel(world, position) {
  const bd = new Box2D.b2BodyDef();
  bd.set_type(Box2D.b2_dynamicBody);
  bd.set_position(position);

  const body = world.CreateBody(bd);
  const shape = new Box2D.b2PolygonShape();
  shape.SetAsBox(Car.HALF_WHEEL_LENGTH, Car.HALF_WHEEL_WIDTH);

  const fd = new Box2D.b2FixtureDef();
  fd.set_shape(shape);
  fd.set_density(Car.WHEEL_DENSITY);
  fd.set_friction(Car.FRICTION);
  fd.set_restitution(Car.RESTITUTION);
  body.CreateFixture(fd);

  return body;
}

function createRearWheel(world, position) {
  const body = createWheel(world, position);

  const jd = new Box2D.b2WeldJointDef();
  jd.set_bodyA(this.body);
  jd.set_bodyB(body);
  jd.set_localAnchorA(position);
  jd.set_localAnchorB(new Box2D.b2Vec2(0, 0));

  const joint = Box2D.castObject(world.CreateJoint(jd), Box2D.b2WeldJoint);

  return { body, joint };
}

function createFrontWheel(world, position) {
  const body = createWheel(world, position);

  const jd = new Box2D.b2RevoluteJointDef();
  jd.set_bodyA(this.body);
  jd.set_bodyB(body);
  jd.set_localAnchorA(position);
  jd.set_localAnchorB(new Box2D.b2Vec2(0, 0));
  jd.set_enableMotor(true);
  jd.set_motorSpeed(0);
  jd.set_maxMotorTorque(Car.MAX_WHEEL_MOTOR_TORQUE);
  jd.set_enableLimit(true);
  jd.set_lowerAngle(-Car.MAX_WHEEL_ANGLE);
  jd.set_upperAngle(Car.MAX_WHEEL_ANGLE);

  const joint = Box2D.castObject(world.CreateJoint(jd), Box2D.b2RevoluteJoint);

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
Car.MAX_STEER_SPEED = 1.2; // Radians per second
Car.MAX_GAS_ACCEL = 3.5; // m / s^2
Car.MAX_BRAKE_DECEL = 6.5; // m / s^2
Car.LATERAL_DAMPING = 1000;
Car.WHEEL_LATERAL_POS = 0.843; // meters
Car.FRONT_AXLE_POS = 1.56; // meters
Car.REAR_AXLE_POS = -1.37; // meters
Car.WHEEL_BASE = Car.FRONT_AXLE_POS - Car.REAR_AXLE_POS; // meters
Car.MAX_CENTRIPETAL_ACCEL = 9.81; // m / s^2
