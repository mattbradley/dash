import Physics from "./physics/Physics.js";
import Car from "./physics/Car.js";
import Path from "./autonomy/Path.js";
import CubicPath from "./autonomy/path-planning/CubicPath.js";
import AutonomousController from "./autonomy/control/AutonomousController.js";
import ManualController from "./autonomy/control/ManualController.js";
import MapObject from "./objects/MapObject.js";
import CarObject from "./objects/CarObject.js";
import Editor from "./simulator/Editor.js";
import OrbitControls from "./simulator/OrbitControls.js";
import TopDownCameraControls from "./simulator/TopDownCameraControls.js";
import Dashboard from "./simulator/Dashboard.js";
import GPGPU from "./GPGPU.js";
import RoadLattice from "./autonomy/path-planning/RoadLattice.js";
import PathPlanner from "./autonomy/path-planning/PathPlanner.js";
import StaticObstacle from "./autonomy/path-planning/StaticObstacle.js";
import MovingAverage from "./autonomy/MovingAverage.js";

const FRAME_TIMESTEP = 1 / 60;

export default class Simulator {
  constructor(geolocation, domElement) {
    this.geolocation = geolocation;

    this.pathPlannerWorker = new Worker('workers/dist/PathPlannerWorker.js');
    this.pathPlannerWorker.onmessage = this.receivePlannedPath.bind(this);

    this.physics = new Physics();
    this.car = this.physics.createCar();

    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(domElement.clientWidth, domElement.clientHeight);
    this.renderer.shadowMap.enabled = true;
    domElement.appendChild(this.renderer.domElement);

    this._setUpCameras(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.sceneFog = new THREE.FogExp2(0x111111, 0.0025);
    this.scene.fog = this.sceneFog;
    this.scene.background = new THREE.Color(0x111111);

    this.editor = new Editor(this.renderer.domElement, this.editorCamera, this.scene);

    const map = new MapObject(this.geolocation);
    this.scene.add(map);

    const carObject = new CarObject(this.car);
    this.scene.add(carObject);

    this.manualCarController = new ManualController();
    this.autonomousCarController = null;

    this.dashboard = new Dashboard(this.car);

    this.plannerReady = false;
    this.plannedPathGroup = new THREE.Group();
    this.scene.add(this.plannedPathGroup);

    this.paused = false;
    this.prevTimestamp = null;
    this.frameCounter = 0;
    this.fpsTime = 0;
    this.fps = 1 / FRAME_TIMESTEP;
    this.simulatedTime = 0;
    this.lastPlanTime = null;
    this.averagePlanTime = new MovingAverage(20);

    window.addEventListener('resize', () => {
      this._updateCameraAspects(domElement.clientWidth / domElement.clientHeight);
      this.renderer.setSize(domElement.clientWidth, domElement.clientHeight);
    });

    this.manualModeButton = document.getElementById('mode-manual');
    this.manualModeButton.addEventListener('click', this.enableManualMode.bind(this));
    this.autonomousModeButton = document.getElementById('mode-autonomous');
    this.autonomousModeButton.addEventListener('click', this.enableAutonomousMode.bind(this));

    document.getElementById('editor-enable').addEventListener('click', this.enableEditor.bind(this));
    document.getElementById('editor-save').addEventListener('click', this.finalizeEditor.bind(this));

    this.simModeBoxes = Array.prototype.slice.call(document.getElementsByClassName('sim-mode-box'), 0);
    this.editModeBoxes = Array.prototype.slice.call(document.getElementsByClassName('edit-mode-box'), 0);

    this.fpsBox = document.getElementById('fps');

    this.enableManualMode();
    this.changeCamera('chase');

    this.aroundAnchorIndex = null;

    requestAnimationFrame(step.bind(this));
  }

  _setUpCameras(domElement) {
    this.chaseCamera = new THREE.PerspectiveCamera(45, domElement.clientWidth / domElement.clientHeight, 1, 10000);
    this.chaseCameraControls = new OrbitControls(this.chaseCamera, domElement);
    this.chaseCameraControls.maxPolarAngle = Math.PI / 2.02;
    this.chaseCameraControls.enablePan = false;
    this.chaseCameraControls.enabled = false;
    this._resetChaseCamera();

    this.freeCamera = new THREE.PerspectiveCamera(45, domElement.clientWidth / domElement.clientHeight, 1, 10000);
    this.freeCameraControls = new OrbitControls(this.freeCamera, domElement);
    this.freeCameraControls.maxPolarAngle = Math.PI / 2.02;
    this.freeCameraControls.enabled = true;
    this._resetFreeCamera();

    this.topDownCamera = new THREE.PerspectiveCamera(45, domElement.clientWidth / domElement.clientHeight, 1, 10000);
    this.topDownCamera.position.set(0, 50, 0);
    this.topDownCamera.lookAt(0, 0, 0);
    this.topDownControls = new TopDownCameraControls(domElement, this.topDownCamera);
    this.topDownControls.enabled = false;

    this.editorCamera = new THREE.PerspectiveCamera(45, domElement.clientWidth / domElement.clientHeight, 1, 10000);
    this.editorCamera.position.set(0, 50, 0);
    this.editorCamera.lookAt(0, 0, 0);
    this.editorCameraControls = new TopDownCameraControls(domElement, this.editorCamera);
    this.editorCameraControls.enabled = false;
    this.editorCameraControls.enablePanning = true;

    this.cameraButtons = {};

    ['free', 'chase', 'topDown'].forEach(c => {
      const cameraButton = document.getElementById(`camera-${c}`);
      cameraButton.addEventListener('click', () => this.changeCamera(c));
      this.cameraButtons[c] = cameraButton;
    });
  }

  _resetFreeCamera() {
    this.freeCameraControls.position0.copy(this.chaseCamera.position);
    const carPosition = this.car.position;
    this.freeCameraControls.target0.set(carPosition.x, 0, carPosition.y);
    this.freeCameraControls.reset();
  }

  _resetChaseCamera() {
    const pos = this.car.position;
    const dirVector = THREE.Vector2.fromAngle(this.car.rotation).multiplyScalar(-20);
    this.chaseCamera.position.set(pos.x + dirVector.x, 10, pos.y + dirVector.y);
    this.chaseCamera.lookAt(pos.x, 0, pos.y);
  }

  _resetTopDownCamera() {
    this.topDownCamera.position.setY(50);
  }

  _updateCameraAspects(aspect) {
    this.freeCamera.aspect = aspect;
    this.freeCamera.updateProjectionMatrix();
    this.chaseCamera.aspect = aspect;
    this.chaseCamera.updateProjectionMatrix();
  }

  enableEditor() {
    this.editor.enabled = true;
    this.previousCamera = this.camera;
    this.camera = this.editorCamera;
    this.editorCameraControls.enabled = true;
    this.chaseCameraControls.enabled = false;
    this.topDownControls.enabled = false;
    this.freeCameraControls.enabled = false;

    this.scene.fog = null;

    this.simModeBoxes.forEach(el => el.classList.add('is-hidden'));
    this.editModeBoxes.forEach(el => el.classList.remove('is-hidden'));
  }

  finalizeEditor() {
    this.editor.enabled = false;
    this.editorCameraControls.enabled = false;

    this.scene.fog = this.sceneFog;
    this.camera = this.previousCamera;

    if (this.previousCamera == this.chaseCamera)
      this.chaseCameraControls.enabled = true;
    else if (this.previousCamera == this.topDownCamera)
      this.topDownControls.enabled = true;
    else if (this.previousCamera == this.freeCamera)
      this.freeCameraControls.enabled = true;
    else
      this.changeCamera('chase');

    this.simModeBoxes.forEach(el => el.classList.remove('is-hidden'));
    this.editModeBoxes.forEach(el => el.classList.add('is-hidden'));

    const centerline = this.editor.lanePath.centerline;
    const pos = centerline[0].clone().sub(centerline[1]).normalize().multiplyScalar(10).add(centerline[0])
    const dir = centerline[1].clone().sub(centerline[0]);
    const rot = Math.atan2(dir.y, dir.x);
    this.car.setPose(pos.x, pos.y, rot);

    this._resetFreeCamera();
    this._resetChaseCamera();
    this._resetTopDownCamera();

    this.plannerReady = true;
  }

  enableManualMode() {
    this.manualModeButton.classList.remove('is-outlined');
    this.manualModeButton.classList.add('is-selected');
    this.autonomousModeButton.classList.add('is-outlined');
    this.autonomousModeButton.classList.remove('is-selected');

    this.carControllerMode = 'manual';
  }

  enableAutonomousMode() {
    this.autonomousModeButton.classList.remove('is-outlined');
    this.autonomousModeButton.classList.add('is-selected');
    this.manualModeButton.classList.add('is-outlined');
    this.manualModeButton.classList.remove('is-selected');

    this.carControllerMode = 'autonomous';
  }

  changeCamera(mode) {
    if (this.editor.enabled) return;

    switch (mode) {
      case "free":
        this.chaseCameraControls.enabled = false;
        this.topDownControls.enabled = false;
        this.freeCameraControls.enabled = true;

        if (this.camera == this.freeCamera)
          this._resetFreeCamera();
        else
          this.camera = this.freeCamera;

        break;
      case "chase":
        this.freeCameraControls.enabled = false;
        this.topDownControls.enabled = false;
        this.chaseCameraControls.enabled = true;

        if (this.camera == this.chaseCamera)
          this._resetChaseCamera();
        else
          this.camera = this.chaseCamera;

        break;
      case "topDown":
        this.freeCameraControls.enabled = false;
        this.chaseCameraControls.enabled = false;
        this.topDownControls.enabled = true;

        if (this.camera == this.topDownCamera)
          this._resetTopDownCamera();
        else
          this.camera = this.topDownCamera;

        break;
      default:
        console.log(`Unknown camera mode: ${mode}`);
        return;
    }

    for (const c in this.cameraButtons) {
      const classes = this.cameraButtons[c].classList;
      if (c == mode) {
        classes.remove('is-outlined');
        classes.add('is-selected');
      } else {
        classes.add('is-outlined');
        classes.remove('is-selected');
      }
    }
  }

  startPlanner(pose, station) {
    this.plannerReady = false;
    this.lastPlanTime = performance.now();

    // In order to create a stable trajectory between successive planning
    // cycles, we must compensate for the latency between when a planning cycle
    // starts and when it ends. The average planning time is used to forward
    // simulate the vehicle to the pose it is expected to have when the
    // planning actually finishes.

    let predictedPose;

    if (false && this.autonomousCarController && this.carControllerMode == 'autonomous') {
      predictedPose = this.autonomousCarController.predictPoseAfterTime(pose, this.averagePlanTime.average * this.fps * FRAME_TIMESTEP);
    } else {
      predictedPose = pose;
    }

    this.pathPlannerWorker.postMessage({
      vehiclePose: predictedPose,
      vehicleStation: station,
      lanePath: this.editor.lanePath,
      obstacles: []
    });
  }

  receivePlannedPath(event) {
    const { path, vehiclePose, vehicleStation, latticeStartStation } = event.data;

    this.averagePlanTime.addSample((performance.now() - this.lastPlanTime) / 1000);
    this.plannerReady = true;

    if (path === null) return;

    path.forEach(p => Object.setPrototypeOf(p.pos, THREE.Vector2.prototype));

    this.scene.remove(this.plannedPathGroup);
    this.plannedPathGroup = new THREE.Group();
    this.scene.add(this.plannedPathGroup);

    const circleGeom = new THREE.CircleGeometry(0.15, 32);
    const circleMat = new THREE.MeshBasicMaterial({ color: 0x00ff80, depthTest: false, transparent: true, opacity: 0.7 });

    const lattice = new RoadLattice(this.editor.lanePath, latticeStartStation);
    lattice.lattice.forEach(cells => {
      cells.forEach(c => {
        const circle = new THREE.Mesh(circleGeom, circleMat);
        circle.position.set(c.pos.x, 0, c.pos.y);
        circle.rotation.x = -Math.PI / 2;
        this.plannedPathGroup.add(circle);
      });
    });

    const pathGeometry = new THREE.Geometry();
    pathGeometry.setFromPoints(path.map(p => new THREE.Vector3(p.pos.x, 0, p.pos.y)));
    const pathLine = new MeshLine();
    pathLine.setGeometry(pathGeometry);

    const pathObject = new THREE.Mesh(pathLine.geometry, new MeshLineMaterial({ color: new THREE.Color(0xff40ff), lineWidth: 0.15, depthTest: false, transparent: true, opacity: 0.5, resolution: new THREE.Vector2(this.renderer.domElement.clientWidth, this.renderer.domElement.clientHeight) }));
    pathObject.renderOrder = 1;
    this.plannedPathGroup.add(pathObject);

    const followPath = new Path(path);

    this.autonomousCarController = new AutonomousController(followPath);

    const frontMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, depthTest: false });
    const frontGeometry = new THREE.Geometry();
    frontGeometry.vertices.push(...followPath.poses.map(p => new THREE.Vector3(p.frontPos.x, 0, p.frontPos.y)));
    this.plannedPathGroup.add(new THREE.Line(frontGeometry, frontMaterial));
  }

  go() {
    this.editor.enabled = false;
    this.changeCamera('chase');

    const circleGeom = new THREE.CircleGeometry(0.15, 32);
    const circleMat = new THREE.MeshBasicMaterial({ color: 0x00ff80, depthTest: false, transparent: true, opacity: 0.7 });

    const lattice = new RoadLattice(this.editor.lanePath);
    lattice.lattice.forEach(cells => {
      cells.forEach(c => {
        const circle = new THREE.Mesh(circleGeom, circleMat);
        circle.position.set(c.pos.x, 0, c.pos.y);
        circle.rotation.x = -Math.PI / 2;
        this.scene.add(circle);
      });
    });

    const obstacle = new StaticObstacle({ x: 0, y: 0 }, Math.PI, 32, 1);
    const obsGeom = new THREE.PlaneGeometry(obstacle.width, obstacle.height);
    const obsMat = new THREE.MeshBasicMaterial({ color: 0x0000ff, depthTest: false, transparent: true, opacity: 0.5 });
    const obsObj = new THREE.Mesh(obsGeom, obsMat);
    obsObj.rotation.x = -Math.PI / 2;
    obsObj.rotation.z = -obstacle.rot;
    obsObj.position.set(obstacle.pos.x, 0, obstacle.pos.y);
    this.scene.add(obsObj);

    //this.pathPlannerWorker.postMessage({ lanePath: this.editor.lanePath, obstacles: [obstacle] });
    const planner = new PathPlanner();

    let start = performance.now();
    const sd = +new Date;
    console.log(new Date);
    const { xysl, xyObstacle, width, height, center, rot, path, vehiclePose } = planner.plan(this.editor.lanePath, [obstacle]);
    console.log(`Planner run time (performance.now()): ${(performance.now() - start) / 1000}s`);
    console.log(`Planner run time (Date): ${((+new Date) - sd) / 1000}s`);
    console.log(new Date);
    console.log(`Grid size: ${width}x${height}`);

    const xyslTex = new THREE.DataTexture(xyObstacle, width, height, THREE.RGBAFormat, THREE.FloatType);
    xyslTex.flipY = true;
    //xyslTex.magFilter = THREE.LinearFilter;
    xyslTex.needsUpdate = true;

    const xyslGeom = new THREE.PlaneGeometry(width * PathPlanner.config.xyGridCellSize, height * PathPlanner.config.xyGridCellSize);
    const xyslMat = new THREE.MeshBasicMaterial({ map: xyslTex, depthTest: false, transparent: true, opacity: 0.5 });
    const xyslObj = new THREE.Mesh(xyslGeom, xyslMat);
    xyslObj.rotation.x = -Math.PI / 2;
    xyslObj.rotation.z = -rot;
    xyslObj.position.set(center.x, 0, center.y);

    this.scene.add(xyslObj);

    const pathGeometry = new THREE.Geometry();
    pathGeometry.setFromPoints(path.map(p => new THREE.Vector3(p.pos.x, 0, p.pos.y)));
    const pathLine = new MeshLine();
    pathLine.setGeometry(pathGeometry);

    const pathObject = new THREE.Mesh(pathLine.geometry, new MeshLineMaterial({ color: new THREE.Color(0xff40ff), lineWidth: 0.15, depthTest: false, transparent: true, opacity: 0.5, resolution: new THREE.Vector2(this.renderer.domElement.clientWidth, this.renderer.domElement.clientHeight) }));
    pathObject.renderOrder = 1;
    this.scene.add(pathObject);

    const followPath = new Path(path);

    this.autonomousCarController = new AutonomousController(followPath);
    this.enableAutonomousMode();
    this.car.setPose(vehiclePose.pos.x, vehiclePose.pos.y, vehiclePose.rot);

    const frontMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, depthTest: false });
    const frontGeometry = new THREE.Geometry();
    frontGeometry.vertices.push(...followPath.poses.map(p => new THREE.Vector3(p.frontPos.x, 0, p.frontPos.y)));
    this.scene.add(new THREE.Line(frontGeometry, frontMaterial));
  }
}

function step(timestamp) {
  if (this.prevTimestamp == null) {
    this.prevTimestamp = timestamp;
    requestAnimationFrame(step.bind(this));
    return;
  }

  if (!this.editor.enabled || this.paused) {
    //const dt = Math.min((timestamp - this.prevTimestamp) / 1000, 1 / 30);
    const dt = FRAME_TIMESTEP;
    this.simulatedTime += dt;

    const prevCarPosition = this.car.position;
    const prevCarRotation = this.car.rotation;

    const autonomousControls = this.autonomousCarController ? this.autonomousCarController.control(this.car.pose, this.car.wheelAngle, this.car.velocity, dt) : { steer: 0, brake: 1, gas: 0 };
    const manualControls = this.manualCarController.control(this.car.pose, this.car.wheelAngle, this.car.velocity, dt);

    const controls = this.carControllerMode == 'autonomous' ? autonomousControls : manualControls;

    this.car.update(controls, dt);
    this.physics.step(dt);

    const carPosition = this.car.position;
    const carRotation = this.car.rotation;
    const carRearAxle = this.car.rearAxlePosition;
    const carVelocity = this.car.velocity;

    const positionOffset = { x: carPosition.x - prevCarPosition.x, y: 0, z: carPosition.y - prevCarPosition.y };
    this.chaseCamera.position.add(positionOffset);
    this.chaseCameraControls.target.set(carPosition.x, 0, carPosition.y);
    this.chaseCameraControls.rotateLeft(carRotation - prevCarRotation);
    this.chaseCameraControls.update();

    this.topDownCamera.position.setX(carPosition.x);
    this.topDownCamera.position.setZ(carPosition.y);
    this.topDownCamera.rotation.z = -carRotation - Math.PI / 2

    let station = null;
    let latitude = null;

    if (this.editor.lanePath.anchors.length > 1) {
      const [s, l, aroundAnchorIndex] = this.editor.lanePath.stationLatitudeFromPosition(carRearAxle, this.aroundAnchorIndex);
      this.aroundAnchorIndex = aroundAnchorIndex;

      station = s;
      latitude = l;
    }

    if (this.plannerReady)
      this.startPlanner(this.car.pose, station);

    this.dashboard.update(controls, carVelocity, station, latitude, this.simulatedTime, this.averagePlanTime.average);
  }

  this.frameCounter++;
  this.fpsTime += timestamp - this.prevTimestamp;
  if (this.fpsTime >= 1000) {
    this.fps = this.frameCounter / (this.fpsTime / 1000);
    this.frameCounter = 0;
    this.fpsTime = 0;
    this.fpsBox.innerHTML = this.fps.toFixed(1);
  }

  this.renderer.render(this.scene, this.camera);

  this.prevTimestamp = timestamp;

  requestAnimationFrame(step.bind(this));
}
