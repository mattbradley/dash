import { Physics } from "./physics/physics.js";
import { Car } from "./physics/car.js";
import { Path } from "./autonomy/path.js";
import { AutonomousController } from "./autonomy/control/autonomous_controller.js";
import { ManualController } from "./autonomy/control/manual_controller.js";
import { MapObject } from "./objects/map_object.js";
import { CarObject } from "./objects/car_object.js";

export class Simulation {
  constructor(geolocation, domElement) {
    this.geolocation = geolocation;

    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(domElement.clientWidth, domElement.clientHeight);
    this.renderer.shadowMap.enabled = true;
    domElement.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(45, domElement.clientWidth / domElement.clientHeight, 1, 2000);
    this.camera.position.set(0, 20, 20);
    this.camera.lookAt(new THREE.Vector3(0, 0, 0));

    const orbitControls = new THREE.OrbitControls(this.camera);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x111111);

    const map = new MapObject(this.geolocation);
    this.scene.add(map);

    this.physics = new Physics();
    this.car = this.physics.createCar();

    const carObject = new CarObject(this.car);
    this.scene.add(carObject);

    this.carController = new ManualController();

    this.prevTimestamp = null;
    this.simulatedTime = 0;

    window.addEventListener('resize', () => {
      this.camera.aspect = domElement.clientWidth / domElement.clientHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(domElement.clientWidth, domElement.clientHeight);
    });

    requestAnimationFrame(render.bind(this));
  }
}

function render(timestamp) {
  requestAnimationFrame(render.bind(this));

  if (this.prevTimestamp == null) {
    this.prevTimestamp = timestamp;
    return;
  }

  const dt = Math.min((timestamp - this.prevTimestamp) / 1000, 1 / 30);
  this.simulatedTime += dt;
  this.prevTimestamp = timestamp;

  const controls = this.carController.control(this.car.pose, this.car.wheelAngle, dt);
  this.car.update(controls, dt);
  this.physics.step(dt);
  //console.log(car.speed * 2.23694);

  const carPosition = this.car.position;
  const carRotation = this.car.rotation;
  this.camera.position.set(carPosition[0] - 20 * Math.cos(carRotation), 8, carPosition[1] - 20 * Math.sin(carRotation));
  this.camera.lookAt(carPosition[0], 0, carPosition[1]);
  
  //orbitControls.update();
  this.renderer.render(this.scene, this.camera);
}
