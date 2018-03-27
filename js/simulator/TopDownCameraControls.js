const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0));
let panning = false;

export default class TopDownCameraControls {
  constructor(domElement, camera) {
    this.domElement = domElement;
    this.camera = camera;
    this.enablePanning = false;
    this.enabled = true;

    this.minAltitude = Number.NEGATIVE_INFINITY;
    this.maxAltitude = Number.POSITIVE_INFINITY;

    this.mouseDown = this.mouseDown.bind(this);
    this.mouseMove = this.mouseMove.bind(this);
    this.mouseUp = this.mouseUp.bind(this);
    this.wheel = this.wheel.bind(this);

    this.domElement.addEventListener('mousedown', this.mouseDown);
    this.domElement.addEventListener('mousemove', this.mouseMove);
    this.domElement.addEventListener('mouseup', this.mouseUp);
    this.domElement.addEventListener('wheel', this.wheel);
  }

  reset(prevCamera) {
    const lookAt = new THREE.Vector3(0, 0, -1);
    lookAt.applyQuaternion(prevCamera.quaternion);

    const ray = new THREE.Ray(prevCamera.position, lookAt);
    const intersection = ray.intersectPlane(groundPlane);

    if (intersection) {
      this.camera.position.set(intersection.x, 50, intersection.z);
    } else {
      this.camera.position.y = 50;
    }

    this.camera.rotation.set(-Math.PI / 2, 0, 0);
  }

  mouseDown(event) {
    if (!this.enabled || !this.enablePanning || event.button != 2) return;
    panning = true;
  }

  mouseMove(event) {
    if (panning) {
      const distance = 2 * this.camera.position.y * Math.tan((this.camera.fov / 2) * Math.PI / 180) / this.domElement.clientHeight;
      this.camera.position.x -= distance * event.movementX;
      this.camera.position.z -= distance * event.movementY;
    }
  }

  mouseUp(event) {
    if (event.button != 2) return;
    panning = false;
  }

  wheel(event) {
    if (!this.enabled) return;

    event.preventDefault();

    this.camera.position.y = Math.max(this.minAltitude, Math.min(this.maxAltitude, this.camera.position.y * Math.pow(0.995, -event.deltaY)));
  }
}
