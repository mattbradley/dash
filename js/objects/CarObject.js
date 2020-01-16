// part of https://github.com/rc-dukes/dash fork of https://github.com/mattbradley/dash
import Car from "../physics/Car.js";
import TDSLoader from "./TDSLoader.js";
import TDSModel from "../../models/suv.js";

/**
 * the visual representation of the car
 */
export default class CarObject extends THREE.Object3D {
  /**
   * construct me
   * @param car - the physical car to assign me to
   */
  constructor(car) {
    super();

    this.car = car;
    // the default model to use
    this.model = new TDSModel();
    this.buildCar2D();
    // build the car with special wheel handling
    this.buildCar3D(this.model.base64data,this.model);
  }

  buildCar2D() {
    const carMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(Car.HALF_CAR_LENGTH * 2, Car.HALF_CAR_WIDTH * 2),
      new THREE.MeshBasicMaterial({
        color: this.model.carColor,
        depthTest: false,
        transparent: true,
        opacity: 0.7
      })
    );
    carMesh.rotation.x = -Math.PI / 2;
    carMesh.layers.set(2);
    this.add(carMesh);

    const wheelGeometry = new THREE.PlaneGeometry(Car.HALF_WHEEL_LENGTH * 2, Car.HALF_WHEEL_WIDTH * 2);
    const wheelMaterial = new THREE.MeshBasicMaterial({
      color: this.model.wheelColor,
      depthTest: false,
      transparent: true,
      opacity: 0.7
    })

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

  buildCar3D(base64data,skinner=null) {
    const loader = new TDSLoader();
    loader.skipMaps = true;

    loader.load(base64data, object => {
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
      const name="DashSimulatorCarObject";
      var oldCarObject=this.getObjectByName(name);
      if (oldCarObject) {
         this.remove(oldCarObject);
      }
      object.name=name;
      object.userData.name=name;
      this.add(object);
      if (skinner)
        skinner.skin(object);
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
