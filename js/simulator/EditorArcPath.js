import ArcPath from "../autonomy/path-planning/ArcPath.js";

const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0));
const mouse = new THREE.Vector2();
const dragOffset = new THREE.Vector3();
let draggingPoint = null;
let mouseMoved = false;
const pathGeometry = new THREE.Geometry();

export default class Editor {
  constructor(canvas, camera, scene) {
    this.canvas = canvas;
    this.camera = camera;

    this.points = [];
    this.enabled = false;

    this.group = new THREE.Group();
    this.pointsGroup = new THREE.Group();
    this.group.add(this.pointsGroup);
    scene.add(this.group);

    this.pathObject = null;

    this.mouseDown = this.mouseDown.bind(this);
    this.mouseMove = this.mouseMove.bind(this);
    this.mouseUp = this.mouseUp.bind(this);

    canvas.addEventListener('mousedown', this.mouseDown);
    canvas.addEventListener('mousemove', this.mouseMove);
    canvas.addEventListener('mouseup', this.mouseUp);
    canvas.addEventListener('contextmenu', e => this.enabled && e.preventDefault());
  }

  redrawPath() {
    if (this.pathObject != null) this.group.remove(this.pathObject);

    const arcPath = new ArcPath(0, this.points.map(p => new THREE.Vector2(p.position.x, p.position.z)));
    pathGeometry.setFromPoints(arcPath.getPoints(100));

    const path = new MeshLine();
    path.setGeometry(pathGeometry);

    this.pathObject = new THREE.Mesh(path.geometry, new MeshLineMaterial({ color: new THREE.Color(0x004080), lineWidth: 0.1, depthTest: false, transparent: true, opacity: 0.7, resolution: new THREE.Vector2(this.canvas.clientWidth, this.canvas.clientHeight) }));
    this.pathObject.rotation.x = Math.PI / 2;
    this.pathObject.renderOrder = 1;
    this.group.add(this.pathObject);
  }

  addPoint(pos) {
    const point = new THREE.Mesh(new THREE.CircleGeometry(0.25, 32), new THREE.MeshBasicMaterial({ color: 0x0080ff, depthTest: false, transparent: true, opacity: 0.7 }));
    point.rotation.x = -Math.PI / 2;
    point.position.set(pos.x, 0, pos.y);

    this.pointsGroup.add(point);
    this.points.push(point);

    this.redrawPath();
  }

  clearPoints() {
    if (this.pathObject != null) this.group.remove(this.pathObject);
    this.pathObject = null;

    this.group.remove(this.pointsGroup);
    this.pointsGroup = new THREE.Group();
    this.points = [];
  }

  mouseDown(event) {
    if (!this.enabled) return;
    if (event.button != 0) return;

    mouse.x = (event.offsetX / this.canvas.clientWidth) * 2 - 1;
    mouse.y = -(event.offsetY / this.canvas.clientHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, this.camera);

    const picked = raycaster.intersectObjects(this.points)[0];

    if (picked) {
      draggingPoint = picked.object;
      dragOffset.copy(picked.object.position).sub(picked.point);
      event.stopImmediatePropagation();
    } else {
      mouseMoved = false;
    }
  }

  mouseMove(event) {
    if (!this.enabled) return;

    mouseMoved = true;
    if (draggingPoint == null) return;

    mouse.x = (event.offsetX / this.canvas.clientWidth) * 2 - 1;
    mouse.y = -(event.offsetY / this.canvas.clientHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, this.camera);

    const intersection = raycaster.ray.intersectPlane(groundPlane);
    if (intersection != null) {
      draggingPoint.position.copy(intersection).add(dragOffset);
      this.redrawPath();
    }
  }

  mouseUp(event) {
    if (!this.enabled) return;
    if (event.button != 0) return;

    draggingPoint = null;

    if (!mouseMoved) {
      const intersection = raycaster.ray.intersectPlane(groundPlane);
      if (intersection != null) {
        this.addPoint(new THREE.Vector2(intersection.x, intersection.z));
      }
    }
  }
}
