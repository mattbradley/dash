import Car from "../physics/Car.js";

const CAR_COLOR = 0x0088ff;
const WHEEL_COLOR = 0xff8800;

export default class CarObject extends THREE.Object3D {
  constructor(car) {
    super();

    this.car = car;

    this.buildMesh2D();
    this.buildMesh3D();
  }

  buildMesh2D() {
    const carMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(Car.HALF_CAR_LENGTH * 2, Car.HALF_CAR_WIDTH * 2),
      new THREE.MeshBasicMaterial({ color: CAR_COLOR, depthTest: false, transparent: true, opacity: 0.5 })
    );
    carMesh.rotation.x = -Math.PI / 2;
    carMesh.layers.set(2);
    this.add(carMesh);

    const wheelGeometry = new THREE.PlaneGeometry(Car.HALF_WHEEL_LENGTH * 2, Car.HALF_WHEEL_WIDTH * 2);
    const wheelMaterial = new THREE.MeshBasicMaterial({ color: WHEEL_COLOR, depthTest: false, transparent: true, opacity: 0.7 })

    this.lfWheel2D = new THREE.Mesh(wheelGeometry, wheelMaterial);
    this.lfWheel2D.renderOrder = 1;
    this.lfWheel2D.position.set(Car.FRONT_AXLE_POS, 0, Car.WHEEL_LATERAL_POS);
    this.lfWheel2D.rotation.x = -Math.PI / 2;
    this.lfWheel2D.layers.set(2);
    this.add(this.lfWheel2D);

    this.rfWheel2D = new THREE.Mesh(wheelGeometry, wheelMaterial);
    this.rfWheel2D.renderOrder = 1;
    this.rfWheel2D.position.set(Car.FRONT_AXLE_POS, 0, -Car.WHEEL_LATERAL_POS);
    this.rfWheel2D.rotation.x = -Math.PI / 2;
    this.rfWheel2D.layers.set(2);
    this.add(this.rfWheel2D);

    const lrWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    lrWheel.renderOrder = 1;
    lrWheel.position.set(Car.REAR_AXLE_POS, 0, Car.WHEEL_LATERAL_POS);
    lrWheel.rotation.x = -Math.PI / 2;
    lrWheel.layers.set(2);
    this.add(lrWheel);

    const rrWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    rrWheel.renderOrder = 1;
    rrWheel.position.set(Car.REAR_AXLE_POS, 0, -Car.WHEEL_LATERAL_POS);
    rrWheel.rotation.x = -Math.PI / 2;
    rrWheel.layers.set(2);
    this.add(rrWheel);
  }

  buildMesh3D() {
    const carMesh = new THREE.Mesh(
      new THREE.BoxBufferGeometry(Car.HALF_CAR_LENGTH * 2, 1.5, Car.HALF_CAR_WIDTH * 2),
      new THREE.MeshToonMaterial({ color: CAR_COLOR, transparent: true, opacity: 0.5 })
    );
    carMesh.position.setY(0.75);
    carMesh.layers.set(3);
    this.add(carMesh);

    const wheelGeometry = new THREE.BoxBufferGeometry(Car.HALF_WHEEL_LENGTH * 2, 0.5, Car.HALF_WHEEL_WIDTH * 2);
    const wheelMaterial = new THREE.MeshToonMaterial({ color: WHEEL_COLOR, depthTest: false, transparent: true, opacity: 0.5 })

    this.lfWheel3D = new THREE.Mesh(wheelGeometry, wheelMaterial);
    this.lfWheel3D.position.set(Car.FRONT_AXLE_POS, 0.25, Car.WHEEL_LATERAL_POS);
    this.lfWheel3D.layers.set(3);
    this.add(this.lfWheel3D);

    this.rfWheel3D = new THREE.Mesh(wheelGeometry, wheelMaterial);
    this.rfWheel3D.position.set(Car.FRONT_AXLE_POS, 0.25, -Car.WHEEL_LATERAL_POS);
    this.rfWheel3D.layers.set(3);
    this.add(this.rfWheel3D);

    const lrWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    lrWheel.position.set(Car.REAR_AXLE_POS, 0.25, Car.WHEEL_LATERAL_POS);
    lrWheel.layers.set(3);
    this.add(lrWheel);

    const rrWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    rrWheel.position.set(Car.REAR_AXLE_POS, 0.25, -Car.WHEEL_LATERAL_POS);
    rrWheel.layers.set(3);
    this.add(rrWheel);
  }

  updateMatrix() {
    this.updateCar();
    super.updateMatrix();
  }

  updateCar() {
    const carPosition = this.car.position;
    this.position.set(carPosition.x, 0, carPosition.y);
    this.rotation.y = -this.car.rotation;

    const wheelAngle = this.car.wheelAngle;
    this.lfWheel2D.rotation.z = -wheelAngle;
    this.rfWheel2D.rotation.z = -wheelAngle;
    this.lfWheel3D.rotation.y = -wheelAngle;
    this.rfWheel3D.rotation.y = -wheelAngle;
  }
}
