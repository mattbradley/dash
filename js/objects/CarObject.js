import Car from "../physics/Car.js";
import TDSLoader from "./TDSLoader.js";
import suvModel from "../../models/suv.js";

const CAR_COLOR = 0x0088ff;
const WHEEL_COLOR = 0xff8800;

export default class CarObject extends THREE.Object3D {
  constructor(car) {
    super();

    this.car = car;

    this.buildCar2D();
    this.buildCar3D();
  }

  buildCar2D() {
    const carMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(Car.HALF_CAR_LENGTH * 2, Car.HALF_CAR_WIDTH * 2),
      new THREE.MeshBasicMaterial({ color: CAR_COLOR, depthTest: false, transparent: true, opacity: 0.7 })
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

  buildCar3D() {
    const loader = new TDSLoader();
    loader.skipMaps = true;

    loader.load(suvModel, object => {
      object.layers.set(3);
      object.rotation.z = Math.PI / 2;
      object.rotation.x = -Math.PI / 2;

      const box = (new THREE.Box3()).setFromObject(object);
      const scaleLength = Car.HALF_CAR_LENGTH * 2 / (box.max.x - box.min.x);
      const scaleWidth = Car.HALF_CAR_WIDTH * 2 / (box.max.z - box.min.z);
      object.scale.set(scaleWidth, scaleLength, (scaleWidth + scaleLength) / 2);

      box.setFromObject(object);
      object.position.setX(-(box.max.x + box.min.x) / 2);
      object.position.setY(-box.min.y);

      this.add(object);

      const carMaterial = new THREE.MeshToonMaterial({ color: 0x0088ff });
      const wheelMaterial = new THREE.MeshToonMaterial({ color: 0xff8800 });

      object.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.layers.set(3);
          child.material = ['Toyota_RA7', 'Toyota_RA8', 'Toyota_RA9', 'Toyota_R10'].includes(child.name) ? wheelMaterial : carMaterial;

          if (child.name == 'Toyota_RA7')
            this.lfWheel3D = child;
          else if (child.name == 'Toyota_RA8')
            this.rfWheel3D = child;
        }
      });

      [this.lfWheel3D, this.rfWheel3D].forEach(wheel => {
        wheel.geometry.computeBoundingBox();
        wheel.geometry.center();
        wheel.position.setY(wheel.position.y - 36);
        wheel.position.setZ(wheel.position.z + 36);
      });
    });
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

    // Adding the wheels to the car object can trigger this function in some browsers
    // before the other wheels are added, so check them first.
    if (this.lfWheel2D) this.lfWheel2D.rotation.z = -wheelAngle;
    if (this.rfWheel2D) this.rfWheel2D.rotation.z = -wheelAngle;
    if (this.lfWheel3D) this.lfWheel3D.rotation.y = wheelAngle;
    if (this.rfWheel3D) this.rfWheel3D.rotation.y = wheelAngle;
  }
}
