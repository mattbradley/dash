// part of https://github.com/rc-dukes/dash
import Physics from "./physics/Physics.js";
import Path from "./autonomy/Path.js";
import CubicPath from "./autonomy/path-planning/CubicPath.js";
import AutonomousController from "./autonomy/control/AutonomousController.js";
import FollowController from "./autonomy/control/FollowController.js";
import ManualController from "./autonomy/control/ManualController.js";
import MapObject from "./objects/MapObject.js";
import CarObject from "./objects/CarObject.js";
import StaticObstacleObject from "./objects/StaticObstacleObject.js";
import DynamicObstacleObject from "./objects/DynamicObstacleObject.js";
import Editor from "./simulator/Editor.js";
import Camera from "./simulator/Camera.js";
import Cameras from "./simulator/Camera.js";
import Mode from "./simulator/Mode.js";
import Modes from "./simulator/Mode.js";
import TopDownCameraControls from "./simulator/TopDownCameraControls.js";
import Dashboard from "./simulator/Dashboard.js";
import GPGPU from "./GPGPU.js";
import RoadLattice from "./autonomy/path-planning/RoadLattice.js";
import PathPlanner from "./autonomy/path-planning/PathPlanner.js";
import StaticObstacle from "./autonomy/StaticObstacle.js";
import DynamicObstacle from "./autonomy/DynamicObstacle.js";
import MovingAverage from "./autonomy/MovingAverage.js";
import PathPlannerConfigEditor from "./simulator/PathPlannerConfigEditor.js";
import SimulatorVerticle from "./remote/SimulatorVerticle"

const FRAME_TIMESTEP = 1 / 60;
const WELCOME_MODAL_KEY = 'dash_WelcomeModal';

/**
 * Car Simulator
 */
export default class Simulator {
  constructor(domElement) {
    this.pathPlannerWorker = new Worker(URL.createObjectURL(new Blob([`(${dash_initPathPlannerWorker.toString()})()`], { type: 'text/javascript' })));
    this.pathPlannerWorker.onmessage = this.receivePlannedPath.bind(this);
    this.pathPlannerConfigEditor = new PathPlannerConfigEditor();

    this.physics = new Physics();
    // the car to be used
    this.car = this.physics.createCar();

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
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
    this.sceneFog = null;//new THREE.FogExp2(0x111111, 0.0025);
    this.scene.fog = this.sceneFog;
    this.scene.background = new THREE.Color(0x111111);

    this.editor = new Editor(this.renderer.domElement, this.editorCamera.pcam, this.scene);

    const geolocation = null;//[33.523900, -111.908756];
    const map = new MapObject(geolocation);
    this.scene.add(map);

    this.carObject = new CarObject(this.car);
    this.scene.add(this.carObject);

    this.scene.add(new THREE.AmbientLight(0x666666));
    const light = new THREE.DirectionalLight(0xffffff, 0.75);
    light.position.set(1, 1, 1).normalize();
    this.scene.add(light);

    this.manualCarController = new ManualController();
    this.autonomousCarController = null;
    // see onEnableRemoteControl for activation
    this.remoteController=null;

    this.dashboard = new Dashboard(this.car);

    this.plannerReady = false;
    this.plannerRunning = false;
    this.plannerReset = false;
    this.carStation = null;
    this.plannedPathGroup = new THREE.Group();
    this.scene.add(this.plannedPathGroup);

    this.staticObstaclesGroup = new THREE.Group();
    this.scene.add(this.staticObstaclesGroup);
    this.dynamicObstaclesGroup = new THREE.Group();
    this.scene.add(this.dynamicObstaclesGroup);

    this.paused = false;
    this.prevTimestamp = null;
    this.frameCounter = 0;
    this.fpsTime = 0;
    this.fps = 1 / FRAME_TIMESTEP;
    this.simulatedTime = 0;
    this.lastPlanTime = null;
    this.averagePlanTime = new MovingAverage(20);

    window.addEventListener('resize', e => {
      this.cameras.updateAspects(domElement.clientWidth / domElement.clientHeight);
      this.renderer.setSize(domElement.clientWidth, domElement.clientHeight);
    });

    window.addEventListener('hashchange', e => {
      if (window.location.hash.startsWith('#/s/'))
        window.location.reload();
    });

    // setup the different control modes
    this.modes=new Modes();
    this.manualMode=this.modes.add('manual');
    this.autonomousMode=this.modes.add('autonomous');
    this.remoteMode=this.modes.add('remote',this,this.onEnableRemoteControl);
    this.modes.addButtonClickHandler()

    document.getElementById('editor-enable').addEventListener('click', this.enableEditor.bind(this));
    document.getElementById('editor-finalize').addEventListener('click', this.finalizeEditor.bind(this));
    document.getElementById('simulator-load').addEventListener('click', this.loadScenario.bind(this));

    this.scenarioPlayButton = document.getElementById('scenario-play');
    this.scenarioPlayButton.addEventListener('click', this.playScenario.bind(this));
    this.scenarioPauseButton = document.getElementById('scenario-pause');
    this.scenarioPauseButton.addEventListener('click', this.pauseScenario.bind(this));
    this.scenarioRestartButton = document.getElementById('scenario-restart');
    this.scenarioRestartButton.addEventListener('click', this.restartScenario.bind(this));

    this.welcomeModal = document.getElementById('welcome-modal');
    document.getElementById('show-welcome-modal').addEventListener('click', e => this.welcomeModal.classList.add('is-active'));
    if (window.localStorage.getItem(WELCOME_MODAL_KEY) !== 'hide') {
      this.welcomeModal.classList.add('is-active');
    }

    document.getElementById('welcome-modal-background').addEventListener('click', this.hideWelcomeModal.bind(this));
    document.getElementById('welcome-modal-close').addEventListener('click', this.hideWelcomeModal.bind(this));

    document.getElementById('welcome-modal-examples').addEventListener('click', e => {
      this.welcomeModal.classList.remove('is-active');
      this.loadScenario();
      this.editor.scenarioManager.switchTab(this.editor.scenarioManager.examplesTab);
    });

    document.getElementById('welcome-modal-create').addEventListener('click', e => {
      this.welcomeModal.classList.remove('is-active');
      this.enableEditor();
    });

    this.simModeBoxes = Array.prototype.slice.call(document.getElementsByClassName('sim-mode-box'), 0);
    this.editModeBoxes = Array.prototype.slice.call(document.getElementsByClassName('edit-mode-box'), 0);

    this.fpsBox = document.getElementById('fps');

    this.modes.changeMode(this.manualMode);
    // default camera mode
    this.cameras.changeCamera(this.driverCamera);

    this.aroundAnchorIndex = null;
    this.staticObstacles = [];
    this.dynamicObstacles = [];

    this._checkHashScenario();

    requestAnimationFrame(this.step.bind(this));
  }

  toss() {
    const pose = this.car.pose;
    const rotVec = THREE.Vector2.fromAngle(pose.rot);
    const pos = rotVec.clone().multiplyScalar(50).add(new THREE.Vector2(rotVec.y, rotVec.x)).add(pose.pos);
    const obstacle = new StaticObstacle(pos, 0, 1.0, 1.0);

    const obsGeom = new THREE.PlaneGeometry(obstacle.width, obstacle.height);
    const obsMat = new THREE.MeshBasicMaterial({ color: 0x0000ff, depthTest: false, transparent: true, opacity: 0.5 });
    const obsObj = new THREE.Mesh(obsGeom, obsMat);
    obsObj.rotation.x = -Math.PI / 2;
    obsObj.rotation.z = -obstacle.rot;
    obsObj.position.set(obstacle.pos.x, 0, obstacle.pos.y);
    this.scene.add(obsObj);

    this.staticObstacles.push(obstacle);
  }

  _checkHashScenario() {
    if (!window.location.hash.startsWith('#/s/')) return;

    const [_hash, _s, code] = window.location.hash.split('/');

    try {
      const json = JSON.parse(atob(decodeURIComponent(code)));
      this.editor.loadJSON(json);
      this.finalizeEditor();
      this.welcomeModal.classList.remove('is-active');
      window.location.hash = '';
    } catch (e) {
      console.log('Error importing scenario code:');
      console.log(code);
      console.log(e);
    }
  }

  // set up the different cameras
  _setUpCameras(domElement) {
    // create the list of cameras
    this.cameras=new Cameras(this.car, domElement);
    this.chaseCamera=this.cameras.add('chase',55);
    this.chaseCamera.addControls(4,5000);
    this.chaseCamera.controls.enablePan = false;
    this.chaseCamera.controls.enabled = false;

    this.driverCamera=this.cameras.add('driver',55);
    this.driverCamera.addControls(4,5000);
    this.driverCamera.controls.enablePan = false;
    this.driverCamera.controls.enabled = false;

    this.freeCamera=this.cameras.add('free',55);
    this.freeCamera.addControls(5,5000);
    this.freeCamera.controls.enabled = true;

    this.topDownCamera=this.cameras.add('topDown',55);

    this.topDownCamera.pcam.position.set(0, 50, 0);
    this.topDownCamera.pcam.lookAt(0, 0, 0);

    this.topDownCamera.controls = new TopDownCameraControls(domElement, this.topDownCamera.pcam);
    this.topDownCamera.controls.enabled = false;
    this.topDownCamera.controls.minAltitude = 5;
    this.topDownCamera.controls.maxAltitude = 10000;

    this.editorCamera=this.cameras.add('editor',45,true);
    this.editorCamera.pcam.layers.enable(2);
    this.editorCamera.pcam.position.set(0, 200, 0);
    this.editorCamera.pcam.lookAt(0, 0, 0);

    this.editorCamera.controls = new TopDownCameraControls(domElement, this.editorCamera.pcam);
    this.editorCamera.controls.enabled = false;
    this.editorCamera.controls.enablePanning = true;
    this.editorCamera.controls.minAltitude = 10;
    this.editorCamera.controls.maxAltitude = 10000;

    this.cameras.addButtonClickHandler();
    // update all cameras
    this.cameras.updateAll();

    this.switchTo2DButton = document.getElementById('camera-2D');
    this.switchTo2DButton.addEventListener('click', this.switchTo2D.bind(this));
    this.switchTo3DButton = document.getElementById('camera-3D');
    this.switchTo3DButton.addEventListener('click', this.switchTo3D.bind(this));

    this.switchTo3D();
  }

  enableEditor() {
    this.editor.enabled = true;
    this.plannerRunning = false;

    this.previousCamera = this.cameras.current;
    this.cameras.changeCamera(this.editorCamera);
    this.scene.fog = null;
    this.carObject.visible = false;
    if (this.plannedPathGroup) this.plannedPathGroup.visible = false;
    this.staticObstaclesGroup.visible = false;
    this.dynamicObstaclesGroup.visible = false;

    this.simModeBoxes.forEach(el => el.classList.add('is-hidden'));
    this.editModeBoxes.forEach(el => el.classList.remove('is-hidden'));
  }

  finalizeEditor(replaceCamera = true) {
    this.editor.enabled = false;
    this.editorCamera.controls.enabled = false;

    this.scene.fog = this.sceneFog;
    this.carObject.visible = true;

    this.simModeBoxes.forEach(el => el.classList.remove('is-hidden'));
    this.editModeBoxes.forEach(el => el.classList.add('is-hidden'));

    if (this.editor.lanePath.anchors.length > 1) {
      const centerline = this.editor.lanePath.centerline;
      const pos = centerline[0].clone();
      const dir = centerline[1].clone().sub(centerline[0]);
      const rot = Math.atan2(dir.y, dir.x);
      const perpindicular = rot + Math.PI / 2 * (Math.sign(this.editor.lanePreference) || 0);
      const latitude = this.pathPlannerConfigEditor.config.roadWidth / 4;

      this.car.setPose(pos.x + Math.cos(perpindicular) * latitude, pos.y + Math.sin(perpindicular) * latitude, rot);
      this.car.velocity = this.editor.initialSpeed;

      this.dynamicObstacles = this.editor.dynamicObstacles;

      // The `false` value means the controller is waiting to be created after the first planning cycle.
      // This signals the simulator to use neutral controls instead of the hard brake used for the `null` value.
      this.autonomousCarController = false;
      this.modes.changeMode(this.autonomousMode);

      if (!this.plannerRunning) {
        this.plannerReady = true;
        this.plannerRunning = true;
      }
      this.plannerReset = true;
      this.simulatedTime = 0;
      this.carStation = 0;
      this.aroundAnchorIndex = null;

      this.pauseScenario();
      this.autonomousModeButton.classList.add('is-loading');
      this.waitingForFirstPlan = true;
    } else {
      this.dynamicObstacles = [];
    }

    this.staticObstacles = this.editor.staticObstacles;
    this.recreateStaticObstacleObjects();
    this.recreateDynamicObstacleObjects();

    this.dashboard.update({ steer: 0, brake: 0, gas: 0 }, this.car.velocity, null, null, 0, this.averagePlanTime.average);

    if (replaceCamera) {
      if (this.previousCamera)
        this.cameras.changeCamera(this.previousCamera);
      else
        this.cameras.changeCamera(this.driverCamera);
    }
  }

  recreateStaticObstacleObjects() {
    this.scene.remove(this.staticObstaclesGroup);
    this.staticObstaclesGroup = new THREE.Group();
    this.scene.add(this.staticObstaclesGroup);

    this.staticObstacles.forEach(o => {
      const obstacleObject = new StaticObstacleObject(o);
      this.staticObstaclesGroup.add(obstacleObject);
    });
  }

  recreateDynamicObstacleObjects() {
    this.scene.remove(this.dynamicObstaclesGroup);
    this.dynamicObstaclesGroup = new THREE.Group();
    this.scene.add(this.dynamicObstaclesGroup);

    this.dynamicObstacles.forEach(o => {
      const obstacleObject = new DynamicObstacleObject(o, this.editor.lanePath);
      this.dynamicObstaclesGroup.add(obstacleObject);
    });

    this.updateDynamicObjects(this.simulatedTime);
  }

  updateDynamicObjects(time) {
    this.dynamicObstaclesGroup.children.forEach(o => o.update(time));
  }

  playScenario() {
    this.paused = false;
    this.scenarioPlayButton.classList.add('is-hidden');
    this.scenarioPauseButton.classList.remove('is-hidden');
  }

  pauseScenario() {
    this.paused = true;
    this.scenarioPlayButton.classList.remove('is-hidden');
    this.scenarioPauseButton.classList.add('is-hidden');
  }

  /**
   * call back when a vert.x heartbeat is received
   * @param self - the true this pointer
   * @param heartBeatCount - the number of heart beats received so far
   */
  onHeartBeat(self,heartBeatCount) {
    var color=heartBeatCount/3%2==0?"white":"purple";
    self.setColorAndTitle("heartbeat-icon",color,heartBeatCount.toString());
  }

  /**
   * enable remote Control via vert.x
   * call back - this pointer is not within class as
   * @param self - the true this pointer
   * @param enable - true if to be switched on
   */
  onEnableRemoteControl(self,enabled) {
    if (enabled) {
      if (self.remoteController===null) {
        // @TODO - make configurable
        self.remoteController=new SimulatorVerticle("http://localhost:8080/eventbus",self,self.onHeartBeat);
      }
      if (self.remoteController.enabled) {
        self.remoteController.stop();
      } else {
        self.remoteController.start()
      }
    } else {
      if (self.remoteController)
        self.remoteController.stop();
    }
  }

  restartScenario() {
    if (this.editor.enabled) return;

    if (this.plannedPathGroup)
      this.scene.remove(this.plannedPathGroup);

    this.finalizeEditor(false);
  }

  loadScenario() {
    if (this.editor.enabled) return;

    this.editor.scenarioManager.showModal(this.finalizeEditor.bind(this));
  }

  switchTo2D() {
    this.switchTo2DButton.classList.remove('is-outlined');
    this.switchTo2DButton.classList.add('is-selected');
    this.switchTo3DButton.classList.add('is-outlined');
    this.switchTo3DButton.classList.remove('is-selected');
    this.cameras.switchToLayer(3,2);
  }

  switchTo3D() {
    this.switchTo3DButton.classList.remove('is-outlined');
    this.switchTo3DButton.classList.add('is-selected');
    this.switchTo2DButton.classList.add('is-outlined');
    this.switchTo2DButton.classList.remove('is-selected');
    this.cameras.switchToLayer(2,3);
  }

  hideWelcomeModal() {
    this.welcomeModal.classList.remove('is-active');
    window.localStorage.setItem(WELCOME_MODAL_KEY, 'hide');
  }

  /**
   * set the color of the element with the given id
   *
   * @param id
   * @param color
   */
  setColor(id,color) {
     this.setColorAndTitle(id,color);
  }

  /**
   * set the color and title of the element with the given id
   *
   * @param id
   * @param color
   * @param title
   */
  setColorAndTitle(id, color,title=null) {
  	var el=document.getElementById(id);
    el.style.color = color;
    if (title)
      el.title=title;
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
    let predictedStation = station;
    let startTime = this.simulatedTime;

    if (!this.plannerReset && !this.paused && this.autonomousCarController && this.carControllerMode() == 'autonomous') {
      const latency = this.averagePlanTime.average * this.fps * FRAME_TIMESTEP;
      predictedPose = this.autonomousCarController.predictPoseAfterTime(pose, latency);
      let [predictedStation] = this.editor.lanePath.stationLatitudeFromPosition(predictedPose.pos, this.aroundAnchorIndex);
      startTime += latency;
    }

    const reset = this.plannerReset;
    this.plannerReset = false;

    this.lastPlanParams =  {
      config: Object.assign({}, this.pathPlannerConfigEditor.config, { speedLimit: this.editor.speedLimit, lanePreference: this.editor.lanePreference }),
      vehiclePose: predictedPose,
      vehicleStation: predictedStation,
      lanePath: this.editor.lanePath,
      startTime: startTime,
      staticObstacles: this.staticObstacles,
      dynamicObstacles: this.dynamicObstacles.filter(o => o.positionAtTime(startTime).x >= 0),
      reset: reset
    };

    this.pathPlannerWorker.postMessage(this.lastPlanParams);
  }

  /**
   * retrieve the current car Controller Mode
   */
  carControllerMode() {
    var modeName=this.modes.currentMode.name;
    return modeName;
  }

  receivePlannedPath(event) {
    if (event.data.error) {
      document.getElementById('planner-error').classList.remove('is-hidden');
      return;
    }

    if (this.waitingForFirstPlan && !this.plannerReset) {
      this.waitingForFirstPlan = false;
      this.autonomousModeButton.classList.remove('is-loading');
      this.playScenario();
    }

    if (this.editor.enabled) return;

    const { fromVehicleParams, vehiclePose, vehicleStation, latticeStartStation, config, dynamicObstacleGrid } = event.data;
    let { path, fromVehicleSegment } = event.data;

    this.averagePlanTime.addSample((performance.now() - this.lastPlanTime) / 1000);
    this.plannerReady = true;

    if (this.plannerReset) return;

    if (this.plannedPathGroup)
      this.scene.remove(this.plannedPathGroup);
    this.plannedPathGroup = new THREE.Group();
    this.scene.add(this.plannedPathGroup);

    const circleGeom = new THREE.CircleGeometry(0.1, 32);
    const circleMat = new THREE.MeshBasicMaterial({ color: 0x00ff80, transparent: true, opacity: 0.7 });

    const lattice = new RoadLattice(this.editor.lanePath, latticeStartStation, config);
    lattice.lattice.forEach(cells => {
      cells.forEach(c => {
        const circle = new THREE.Mesh(circleGeom, circleMat);
        circle.position.set(c.pos.x, 0, c.pos.y);
        circle.rotation.x = -Math.PI / 2;
        this.plannedPathGroup.add(circle);
      });
    });

    // TODO: clear this up or just remove it
    if (false && dynamicObstacleGrid) {
      const dynamicGridTex = new THREE.DataTexture(dynamicObstacleGrid.data, dynamicObstacleGrid.width, dynamicObstacleGrid.height, THREE.RGBAFormat, THREE.FloatType);
      dynamicGridTex.flipY = true;
      dynamicGridTex.needsUpdate = true;

      const [gridStart] = this.editor.lanePath.sampleStations(vehicleStation, 1, 0);
      if (gridStart) {
        const dynamicGridGeom = new THREE.PlaneGeometry(dynamicObstacleGrid.width * config.slGridCellSize, dynamicObstacleGrid.height * config.slGridCellSize);
        const dynamicGridMat = new THREE.MeshBasicMaterial({ map: dynamicGridTex, depthTest: false, transparent: true, opacity: 0.5 });
        const dynamicGridObj = new THREE.Mesh(dynamicGridGeom, dynamicGridMat);
        dynamicGridObj.rotation.x = -Math.PI / 2;
        dynamicGridObj.rotation.z = -gridStart.rot;
        const offset = THREE.Vector2.fromAngle(gridStart.rot).multiplyScalar(dynamicObstacleGrid.width * config.slGridCellSize / 2 - config.spatialHorizon / config.lattice.numStations);
        dynamicGridObj.position.set(gridStart.pos.x + offset.x, 0, gridStart.pos.y + offset.y);

        this.plannedPathGroup.add(dynamicGridObj);
      }
    }

    if (path === null) {
      this.autonomousCarController = null;
      return;
    }

    if (fromVehicleParams.type == 'cubic') {
      const start = this.car.pose;
      const end = fromVehicleSegment[fromVehicleSegment.length - 1];

      const pathBuilder = new CubicPath(start, end, fromVehicleParams.params);

      if (pathBuilder.optimize()) {
        fromVehicleSegment = pathBuilder.buildPath(Math.ceil(pathBuilder.params.sG / 0.25));

        const prevVelocitySq = this.car.velocity * this.car.velocity;
        const accel = (end.velocity * end.velocity - prevVelocitySq) / 2 / pathBuilder.params.sG;
        const ds = pathBuilder.params.sG / (fromVehicleSegment.length - 1);
        let s = 0;

        for (let p = 0; p < fromVehicleSegment.length; p++) {
          fromVehicleSegment[p].velocity = Math.sqrt(2 * accel * s + prevVelocitySq);
          fromVehicleSegment[p].acceleration = accel;
          s += ds;
        }
      }
    }

    path = fromVehicleSegment.concat(path);

    path.forEach(p => Object.setPrototypeOf(p.pos, THREE.Vector2.prototype));
    const followPath = new Path(path);

    if (this.autonomousCarController)
      this.autonomousCarController.replacePath(followPath);
    else
      this.autonomousCarController = new FollowController(followPath, this.car);

    const pathGeometry = new THREE.Geometry();
    pathGeometry.setFromPoints(path.map(p => new THREE.Vector3(p.pos.x, 0, p.pos.y)));
    const pathLine = new MeshLine();
    pathLine.setGeometry(pathGeometry);

    const color = fromVehicleParams.type == 'cubic' ? new THREE.Color(0xff8800) : new THREE.Color(0xffff40);
    const pathObject = new THREE.Mesh(
      pathLine.geometry,
      new MeshLineMaterial({
        color: color,
        lineWidth: 0.15,
        resolution: new THREE.Vector2(this.renderer.domElement.clientWidth, this.renderer.domElement.clientHeight)
      })
    );
    pathObject.renderOrder = 1;
    this.plannedPathGroup.add(pathObject);
  }

  // periodically called step
  step(timestamp) {
    if (this.prevTimestamp == null) {
      this.prevTimestamp = timestamp;
      requestAnimationFrame(this.step.bind(this));
      return;
    }

    this.editor.update();

    if (!this.editor.enabled && !this.paused) {
      const dt = FRAME_TIMESTEP;
      this.simulatedTime += dt;

      const manualControls = this.manualCarController.control(this.car.pose, this.car.wheelAngle, this.car.velocity, dt);
      if (manualControls.steer != 0 || manualControls.brake != 0 || manualControls.gas != 0)
        this.modes.changeMode(this.manualMode);

      let autonomousControls = { steer: 0, brake: 0, gas: 0};
      if (this.autonomousCarController)
        autonomousControls = this.autonomousCarController.control(this.car.pose, this.car.wheelAngle, this.car.velocity, dt, this.carControllerMode() == 'autonomous') ;
      else if (this.autonomousCarController === null)
        autonomousControls = { steer: 0, brake: 1, gas: 0 };

      var controls = this.carControllerMode() == 'autonomous' ? autonomousControls : manualControls;
      if (this.remoteController!=null) {
        this.setColor(this.remoteMode.modeButton.id,this.remoteController.stateColor());
        if (this.remoteController.enabled) {
          controls=this.remoteController.remoteControl;
        }
      }

      // update the car with the given controls
      this.car.update(controls, dt);
      this.physics.step(dt);

      this.updateDynamicObjects(this.simulatedTime);

      const carPosition = this.car.position;
      const carRotation = this.car.rotation;
      const carRearAxle = this.car.rearAxlePosition;
      const carVelocity = this.car.velocity;

      // update camera positions
      this.cameras.currentCamera.update()

      let latitude = null;

      if (this.editor.lanePath.anchors.length > 1) {
        const [s, l, aroundAnchorIndex] = this.editor.lanePath.stationLatitudeFromPosition(carRearAxle, this.aroundAnchorIndex);
        this.aroundAnchorIndex = aroundAnchorIndex;

        this.carStation = s;
        latitude = l;
      }

      this.dashboard.update(controls, carVelocity, this.carStation, latitude, this.simulatedTime, this.averagePlanTime.average);
    }

    if (!this.editor.enabled && this.plannerReady) {
      this.startPlanner(this.car.pose, this.carStation || 0);
      this.dashboard.updatePlanTime(this.averagePlanTime.average);
    }

    this.frameCounter++;
    this.fpsTime += timestamp - this.prevTimestamp;
    if (this.fpsTime >= 1000) {
      this.fps = this.frameCounter / (this.fpsTime / 1000);
      this.frameCounter = 0;
      this.fpsTime = 0;
      this.fpsBox.textContent = this.fps.toFixed(1);
    }
    if (this.cameras.currentCamera)
      this.renderer.render(this.scene, this.cameras.currentCamera.pcam);
    this.prevTimestamp = timestamp;
    requestAnimationFrame(this.step.bind(this));
  }
}
