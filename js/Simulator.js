import Physics from "./physics/simple/Physics.js";
import Path from "./autonomy/Path.js";
import CubicPath from "./autonomy/path-planning/CubicPath.js";
import AutonomousController from "./autonomy/control/AutonomousController.js";
import FollowController from "./autonomy/control/FollowController.js";
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
import PathPlannerConfigEditor from "./simulator/PathPlannerConfigEditor.js";

const FRAME_TIMESTEP = 1 / 60;

export default class Simulator {
  constructor(geolocation, domElement) {
    this.geolocation = geolocation;

    this.pathPlannerWorker = new Worker('workers/dist/PathPlannerWorker.js');
    this.pathPlannerWorker.onmessage = this.receivePlannedPath.bind(this);
    this.pathPlannerConfigEditor = new PathPlannerConfigEditor();

    this.physics = new Physics();
    this.car = this.physics.createCar();

    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(domElement.clientWidth, domElement.clientHeight);
    this.renderer.shadowMap.enabled = true;
    domElement.appendChild(this.renderer.domElement);

    this.lastPlanParams = null;
    this.renderer.context.canvas.addEventListener('webglcontextlost', event => {
      console.log('Simulator: webgl context lost');
      console.log(event);
      console.log(this.lastPlanParams);
    });

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
    this.plannerReset = false;
    this.plannerEnabled = false;
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
    document.getElementById('scenario-restart').addEventListener('click', this.restartScenario.bind(this));

    this.simModeBoxes = Array.prototype.slice.call(document.getElementsByClassName('sim-mode-box'), 0);
    this.editModeBoxes = Array.prototype.slice.call(document.getElementsByClassName('edit-mode-box'), 0);

    this.fpsBox = document.getElementById('fps');

    this.enableManualMode();
    this.changeCamera('chase');

    this.aroundAnchorIndex = null;
    this.obstacles = [];

    requestAnimationFrame(step.bind(this));
  }

  toss() {
    const pose = this.car.pose;
    const rotVec = THREE.Vector2.fromAngle(pose.rot);
    const pos = rotVec.clone().multiplyScalar(50).add(new THREE.Vector2(rotVec.y, rotVec.x)).add(pose.pos);
    const obstacle = new StaticObstacle(pos, 0, 0.5, 0.5);

    const obsGeom = new THREE.PlaneGeometry(obstacle.width, obstacle.height);
    const obsMat = new THREE.MeshBasicMaterial({ color: 0x0000ff, depthTest: false, transparent: true, opacity: 0.5 });
    const obsObj = new THREE.Mesh(obsGeom, obsMat);
    obsObj.rotation.x = -Math.PI / 2;
    obsObj.rotation.z = -obstacle.rot;
    obsObj.position.set(obstacle.pos.x, 0, obstacle.pos.y);
    this.scene.add(obsObj);

    this.obstacles.push(obstacle);
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
    if (this.plannedPathGroup) this.plannedPathGroup.visible = false;

    this.simModeBoxes.forEach(el => el.classList.add('is-hidden'));
    this.editModeBoxes.forEach(el => el.classList.remove('is-hidden'));
  }

  finalizeEditor(replaceCamera = true) {
    this.editor.enabled = false;
    this.editorCameraControls.enabled = false;

    this.scene.fog = this.sceneFog;

    this.simModeBoxes.forEach(el => el.classList.remove('is-hidden'));
    this.editModeBoxes.forEach(el => el.classList.add('is-hidden'));

    const centerline = this.editor.lanePath.centerline;
    const pos = centerline[0].clone();
    const dir = centerline[1].clone().sub(centerline[0]);
    const rot = Math.atan2(dir.y, dir.x);
    this.car.setPose(pos.x, pos.y, rot);

    this.autonomousCarController = null;

    if (!this.plannerRunning) {
      this.plannerReady = true;
      this.plannerRunning = true;
    }
    this.plannerReset = true;
    this.simulatedTime = 0;

    if (replaceCamera) {
      this.camera = this.previousCamera;

      if (this.previousCamera == this.chaseCamera)
        this.chaseCameraControls.enabled = true;
      else if (this.previousCamera == this.topDownCamera)
        this.topDownControls.enabled = true;
      else if (this.previousCamera == this.freeCamera)
        this.freeCameraControls.enabled = true;
      else
        this.changeCamera('chase');
    }

    this._resetFreeCamera();
    this._resetChaseCamera();
    this._resetTopDownCamera();
  }

  restartScenario() {
    if (this.editor.enabled) return;
    this.finalizeEditor(false);
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

    let predictedPose = pose;

    if (!this.plannerReset && this.autonomousCarController && this.carControllerMode == 'autonomous') {
      predictedPose = this.autonomousCarController.predictPoseAfterTime(pose, this.averagePlanTime.average * this.fps * FRAME_TIMESTEP);
    }

    const reset = this.plannerReset;
    this.plannerReset = false;

    this.lastPlanParams =  {
      config: this.pathPlannerConfigEditor.config,
      vehiclePose: predictedPose,
      vehicleStation: station,
      lanePath: this.editor.lanePath,
      obstacles: this.obstacles,
      reset: reset
    };

    this.pathPlannerWorker.postMessage(this.lastPlanParams);
  }

  receivePlannedPath(event) {
    if (this.editor.enabled) return;

    const { fromVehicleSegment, fromVehicleParams, vehiclePose, vehicleStation, latticeStartStation } = event.data;
    let { path } = event.data;

    this.averagePlanTime.addSample((performance.now() - this.lastPlanTime) / 1000);
    this.plannerReady = true;

    if (path === null || this.plannerReset) return;

    path = fromVehicleSegment.concat(path);

    path.forEach(p => Object.setPrototypeOf(p.pos, THREE.Vector2.prototype));
    const followPath = new Path(path);

    if (this.autonomousCarController)
      this.autonomousCarController.replacePath(followPath);
    else
      this.autonomousCarController = new FollowController(followPath, this.car);

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

    const frontMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, depthTest: false });
    const frontGeometry = new THREE.Geometry();
    frontGeometry.vertices.push(...followPath.poses.map(p => new THREE.Vector3(p.frontPos.x, 0, p.frontPos.y)));
    this.plannedPathGroup.add(new THREE.Line(frontGeometry, frontMaterial));
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

    const autonomousControls = this.autonomousCarController ? this.autonomousCarController.control(this.car.pose, this.car.wheelAngle, this.car.velocity, dt, this.carControllerMode == 'autonomous') : { steer: 0, brake: 1, gas: 0 };
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
