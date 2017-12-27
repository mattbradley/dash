import LanePath from "../autonomy/LanePath.js";

const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0));
const mouse = new THREE.Vector2();
const dragOffset = new THREE.Vector3();
let draggingPoint = null;
let mouseMoved = false;
let pointIndex = 0;
const centerlineGeometry = new THREE.Geometry();
const leftBoundaryGeometry = new THREE.Geometry();
const rightBoundaryGeometry = new THREE.Geometry();

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

    this.lanePath = new LanePath();

    this.mouseDown = this.mouseDown.bind(this);
    this.mouseMove = this.mouseMove.bind(this);
    this.mouseUp = this.mouseUp.bind(this);

    canvas.addEventListener('mousedown', this.mouseDown);
    canvas.addEventListener('mousemove', this.mouseMove);
    canvas.addEventListener('mouseup', this.mouseUp);
    canvas.addEventListener('contextmenu', e => this.enabled && e.preventDefault());

    this.centerlineObject = new THREE.Mesh(new THREE.Geometry(), new MeshLineMaterial({ color: new THREE.Color(0x004080), lineWidth: 0.1, depthTest: false, transparent: true, opacity: 0.7, resolution: new THREE.Vector2(this.canvas.clientWidth, this.canvas.clientHeight) }));
    this.centerlineObject.rotation.x = Math.PI / 2;
    this.centerlineObject.renderOrder = 1;
    this.group.add(this.centerlineObject);

    this.leftBoundaryObject = new THREE.Mesh(new THREE.Geometry(), new MeshLineMaterial({ color: new THREE.Color(0xff8000), lineWidth: 0.05, depthTest: false, transparent: true, opacity: 0.7, resolution: new THREE.Vector2(this.canvas.clientWidth, this.canvas.clientHeight) }));
    this.leftBoundaryObject.rotation.x = Math.PI / 2;
    this.leftBoundaryObject.renderOrder = 1;
    this.group.add(this.leftBoundaryObject);

    this.rightBoundaryObject = new THREE.Mesh(new THREE.Geometry(), new MeshLineMaterial({ color: new THREE.Color(0xff8000), lineWidth: 0.05, depthTest: false, transparent: true, opacity: 0.7, resolution: new THREE.Vector2(this.canvas.clientWidth, this.canvas.clientHeight) }));
    this.rightBoundaryObject.rotation.x = Math.PI / 2;
    this.rightBoundaryObject.renderOrder = 1;
    this.group.add(this.rightBoundaryObject);
  }

  redraw() {
    centerlineGeometry.setFromPoints(this.lanePath.centerline);
    const centerline = new MeshLine();
    centerline.setGeometry(centerlineGeometry);
    this.centerlineObject.geometry = centerline.geometry;

    leftBoundaryGeometry.setFromPoints(this.lanePath.leftBoundary);
    const leftBoundary = new MeshLine();
    leftBoundary.setGeometry(leftBoundaryGeometry);
    this.leftBoundaryObject.geometry = leftBoundary.geometry;

    rightBoundaryGeometry.setFromPoints(this.lanePath.rightBoundary);
    const rightBoundary = new MeshLine();
    rightBoundary.setGeometry(rightBoundaryGeometry);
    this.rightBoundaryObject.geometry = rightBoundary.geometry;
  }

  addPoint(pos) {
    const point = new THREE.Mesh(new THREE.CircleGeometry(0.25, 32), new THREE.MeshBasicMaterial({ color: 0x0080ff, depthTest: false, transparent: true, opacity: 0.7 }));
    point.rotation.x = -Math.PI / 2;
    point.position.set(pos.x, 0, pos.y);
    point.userData = { index: pointIndex++ };

    this.pointsGroup.add(point);
    this.points.push(point);
    this.lanePath.addAnchor(pos);
  }

  updatePoint(object, pos) {
    object.position.copy(pos);
    this.lanePath.updateAnchor(object.userData.index, new THREE.Vector2(pos.x, pos.z));
  }

  clearPoints() {
    this.centerlineObject.geometry = new THREE.Geometry();

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
      this.updatePoint(draggingPoint, intersection.add(dragOffset));
      this.redraw();
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
        this.redraw();
      }
    }
  }
}
