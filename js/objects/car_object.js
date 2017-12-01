import { Car } from "../physics/car.js";

export class CarObject extends THREE.Object3D {
  constructor(car) {
    super();

    this.car = car;

    const carMesh = new THREE.Mesh(new THREE.PlaneGeometry(Car.HALF_CAR_LENGTH * 2, Car.HALF_CAR_WIDTH * 2), new THREE.MeshBasicMaterial({ color: 0x0080ff, depthTest: false, transparent: true, opacity: 0.5 }));
    carMesh.rotation.x = -Math.PI / 2;
    this.add(carMesh);

    const wheelGeometry = new THREE.PlaneGeometry(Car.HALF_WHEEL_LENGTH * 2, Car.HALF_WHEEL_WIDTH * 2);
    const wheelMaterial = new THREE.MeshBasicMaterial({ color: 0xff8000, depthTest: false, transparent: true, opacity: 0.7 })

    this.lfWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    this.lfWheel.renderOrder = 1;
    this.lfWheel.position.set(Car.FRONT_AXLE_POS, 0, Car.WHEEL_LATERAL_POS);
    this.lfWheel.rotation.x = -Math.PI / 2;
    this.add(this.lfWheel);

    this.rfWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    this.rfWheel.renderOrder = 1;
    this.rfWheel.position.set(Car.FRONT_AXLE_POS, 0, -Car.WHEEL_LATERAL_POS);
    this.rfWheel.rotation.x = -Math.PI / 2;
    this.add(this.rfWheel);

    const lrWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    lrWheel.renderOrder = 1;
    lrWheel.position.set(Car.REAR_AXLE_POS, 0, Car.WHEEL_LATERAL_POS);
    lrWheel.rotation.x = -Math.PI / 2;
    this.add(lrWheel);

    const rrWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    rrWheel.renderOrder = 1;
    rrWheel.position.set(Car.REAR_AXLE_POS, 0, -Car.WHEEL_LATERAL_POS);
    rrWheel.rotation.x = -Math.PI / 2;
    this.add(rrWheel);
  }

  updateMatrix() {
    this.updateCar();
    super.updateMatrix();
  }

  updateCar() {
    const carPosition = this.car.position;
    this.position.set(carPosition[0], 0, carPosition[1]);
    this.rotation.y = -this.car.rotation;

    const wheelAngle = this.car.wheelAngle;
    this.lfWheel.rotation.z = -wheelAngle;
    this.rfWheel.rotation.z = -wheelAngle;
  }
}
