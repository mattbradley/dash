const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0));
let panning = false;

export default class TopDownCameraControls {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.camera = camera;
  }

  enable() {
    const lookAt = new THREE.Vector3(0, 0, -1);
    lookAt.applyQuaternion(this.camera.quaternion);

    const ray = new THREE.Ray(this.camera.position, lookAt);
    const intersection = ray.intersectPlane(groundPlane);

    if (intersection) {
      this.camera.position.set(intersection.x, 50, intersection.z);
    } else {
      this.camera.position.y = 50;
    }

    this.camera.rotation.set(-Math.PI / 2, 0, 0);

    this.mouseDown = this.mouseDown.bind(this);
    this.mouseMove = this.mouseMove.bind(this);
    this.mouseUp = this.mouseUp.bind(this);
    this.wheel = this.wheel.bind(this);

    this.canvas.addEventListener('mousedown', this.mouseDown);
    this.canvas.addEventListener('mousemove', this.mouseMove);
    this.canvas.addEventListener('mouseup', this.mouseUp);
    this.canvas.addEventListener('wheel', this.wheel);
  }

  disable() {
    this.canvas.removeEventListener('mousedown', this.mouseDown);
    this.canvas.removeEventListener('mousemove', this.mouseMove);
    this.canvas.removeEventListener('mouseup', this.mouseUp);
    this.canvas.removeEventListener('wheel', this.wheel);
  }

  mouseDown(event) {
    if (event.button != 0) return;
    panning = true;
  }

  mouseMove(event) {
    if (panning) {
      const distance = 2 * this.camera.position.y * Math.tan((this.camera.fov / 2) * Math.PI / 180) / this.canvas.clientHeight;
      this.camera.position.x -= distance * event.movementX;
      this.camera.position.z -= distance * event.movementY;
    }
  }

  mouseUp(event) {
    if (event.button != 0) return;
    panning = false;
  }

  wheel(event) {
    event.preventDefault();

    this.camera.position.y *= Math.pow(0.995, -event.deltaY);
  }
}
