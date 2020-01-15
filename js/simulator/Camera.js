// part of https://github.com/rc-dukes/dash fork of https://github.com/mattbradley/dash
// handles the different Tree.js Cameras and the corresponding OrbitControls
import OrbitControls from "./OrbitControls.js";

/**
 * List / Manager of all cameras
 */
export default class Cameras {
  /**
   * we need to know the car and the domElement to work
   */
  constructor(car, domElement) {
    this.car = car;
    this.aspect = domElement.clientWidth / domElement.clientHeight;
    this.domElement = domElement;
    this.cameras = {};
    this.currentCamera = null;
  }

  /**
   * add a camera with the given name, fov for the perspective Camera, and editor status
   * @param name - the name of this camera
   * @fov - field of view for Three.js
   * @isEditor - if this is the editor the camera will be static
   */
  add(name, fov, isEditor = false) {
    var perspectiveCamera = new THREE.PerspectiveCamera(fov, this.aspect, 1, 10000);
    var camera = new Camera(this, name, perspectiveCamera, isEditor);
    this.cameras[name] = camera;
    return camera;
  }

  /**
   * add a button click handler to the given camera
   * by convention each non-editor camera has a button with id camera-<camera.name> that
   * will activate the camera on click
   */
  addButtonClickHandler() {
    // add cameraButton to each Camera
    Object.entries(this.cameras).forEach(([name, camera]) => {
      if (!camera.isEditor) {
        camera.cameraButton = document.getElementById(`camera-${camera.name}`);
        camera.cameraButton.addEventListener('click', () => this.changeCamera(camera));
      };
    });
  }

  /**
   * switch Layers e.g. from 2D to 3D or vice versa
   * @param fromLayer - the layer to leave (e.g. for 2D = 2)
   * @param toLayer - the layer to activate (e.g. for 3D = 3)
   */
  switchToLayer(fromLayer, toLayer) {
    Object.entries(this.cameras).forEach(([name, camera]) => {
      camera.pcam.layers.enable(toLayer);
      camera.pcam.layers.disable(fromLayer);
    });
  }

  /**
   * update the camera aspect ratio for all cameras
   * @param aspect - the new aspect ratio
   */
  updateAspects(aspect) {
    Object.entries(this.cameras).forEach(([name, camera]) => camera.updateAspect(aspect));
  }

  /**
   * change the current / active camera to the given camera
   * @param newCurrentCamera - the camera to activate
   */
  changeCamera(newCurrentCamera) {
    Object.entries(this.cameras).forEach(([name, camera]) => {
      camera.enable(camera == newCurrentCamera);
      if (camera !== newCurrentCamera || newCurrentCamera !== this.currentCamera)
        camera.update();
    });
    this.currentCamera = newCurrentCamera;
  }

  /**
   * update the position and controls for all cameras
   */
  updateAll() {
    Object.entries(this.cameras).forEach(([name, camera]) => camera.update());
  }
}

/**
 * a wrapper for single named Three.Js perspective camera
 */
export class Camera {

  /**
   * construct me
   * @param cameras - the list/set of cameras i belong to
   * @param name - my name
   * @param perspectiveCamera - the three JS perspective Camera to wrap
   * @param isEditor - true if i am the camera for the editor
   */
  constructor(cameras, name, perspectiveCamera, isEditor = false) {
    this.cameras = cameras;
    this.car = this.cameras.car;
    this.name = name;
    // the THREE.js perspective Camera to use
    this.pcam = perspectiveCamera;
    // is this the camera for the editor?
    this.isEditor = isEditor;
    // prepare controls
    this.controls = null;
  }

  /**
   * update the aspect ratio of this camera
   * @param aspect - the aspect ratio to apply
   */
  updateAspect(aspect) {
    this.pcam.aspect = aspect;
    this.pcam.updateProjectionMatrix();
  }

  /**
   * add OrbitControls to the camera
   * @param minDistance - frustum minimum maxDistance
   * @param maxDistance - frustum maxium Distance
   */
  addControls(minDistance, maxDistance) {
    this.controls = new OrbitControls(this.pcam, this.cameras.domElement);
    this.controls.minDistance = minDistance;
    this.controls.maxDistance = maxDistance;
    this.controls.maxPolarAngle = Math.PI / 2.02;
    return this.controls;
  }

  /**
    * enable me -  make my enablement visible by changing the appearance of my button
    * @param enabled - true if i should be activated
    */
  enable(enabled) {
    this.controls.enabled = enabled;
    if (!this.isEditor) {
      const classes = this.cameraButton.classList;
      if (enabled) {
        classes.remove('is-outlined');
        classes.add('is-selected');
      } else {
        classes.add('is-outlined');
        classes.remove('is-selected');
      }
    }
  }

  /**
   * update my camera position
   * the behavior is dependent / specialized on my name
   */
  update() {
    const pos = this.car.position;
    switch (this.name) {
      case 'free':
        this.controls.position0.copy(this.cameras.cameras['chase'].pcam.position);
        this.controls.target0.set(pos.x, 0, pos.y);
        // this.controls.reset();
        break;
      case 'chase':
        const cv = this.car.vector(-20);
        this.pcam.position.set(pos.x + cv.x, 8, pos.y + cv.y);
        this.pcam.lookAt(pos.x, 0, pos.y);
        this.controls.update();
        break;
      case 'driver':
        const front=this.car.frontAxlePosition;
        const v=this.car.vector(10);
        this.pcam.position.set(front.x, 1, front.y);
        this.controls.target.set(front.x+v.x, 1, front.y+v.y);
        this.controls.update();
        break;
      case 'editor':
        // don't do anything - editor is static
        break;
      case 'topDown':
        this.pcam.position.set(pos.x, 50, pos.y);
        this.pcam.rotation.z = -this.car.rotation - Math.PI / 2
        break;
    }
    this.pcam.updateProjectionMatrix();
  }
}
