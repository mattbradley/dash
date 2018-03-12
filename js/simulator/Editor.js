import LanePath from "../autonomy/LanePath.js";

const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0));

export default class Editor {
  constructor(canvas, camera, scene) {
    this.canvas = canvas;
    this.camera = camera;

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.dragOffset = new THREE.Vector3();
    this.draggingPoint = null;
    this.pointIndex = 0;
    this.centerlineGeometry = new THREE.Geometry();
    this.leftBoundaryGeometry = new THREE.Geometry();
    this.rightBoundaryGeometry = new THREE.Geometry();

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

    const editorClearOptions = document.getElementById('editor-clear-options');
    document.getElementById('editor-clear').addEventListener('click', event => {
      event.stopPropagation();
      editorClearOptions.classList.toggle('is-hidden');
    });
    document.addEventListener('click', () => editorClearOptions.classList.add('is-hidden'));

    this.centerlineObject = new THREE.Mesh(new THREE.Geometry(), new MeshLineMaterial({ color: new THREE.Color(0x004080), lineWidth: 0.2, depthTest: false, transparent: true, opacity: 0.7, resolution: new THREE.Vector2(this.canvas.clientWidth, this.canvas.clientHeight) }));
    this.centerlineObject.rotation.x = Math.PI / 2;
    this.centerlineObject.renderOrder = 1;
    this.group.add(this.centerlineObject);

    this.leftBoundaryObject = new THREE.Mesh(new THREE.Geometry(), new MeshLineMaterial({ color: new THREE.Color(0xff8000), lineWidth: 0.15, depthTest: false, transparent: true, opacity: 0.7, resolution: new THREE.Vector2(this.canvas.clientWidth, this.canvas.clientHeight) }));
    this.leftBoundaryObject.rotation.x = Math.PI / 2;
    this.leftBoundaryObject.renderOrder = 1;
    this.group.add(this.leftBoundaryObject);

    this.rightBoundaryObject = new THREE.Mesh(new THREE.Geometry(), new MeshLineMaterial({ color: new THREE.Color(0xff8000), lineWidth: 0.15, depthTest: false, transparent: true, opacity: 0.7, resolution: new THREE.Vector2(this.canvas.clientWidth, this.canvas.clientHeight) }));
    this.rightBoundaryObject.rotation.x = Math.PI / 2;
    this.rightBoundaryObject.renderOrder = 1;
    this.group.add(this.rightBoundaryObject);
  }

  redraw() {
    this.centerlineGeometry.setFromPoints(this.lanePath.centerline);
    const centerline = new MeshLine();
    centerline.setGeometry(this.centerlineGeometry);
    this.centerlineObject.geometry = centerline.geometry;

    this.leftBoundaryGeometry.setFromPoints(this.lanePath.leftBoundary);
    const leftBoundary = new MeshLine();
    leftBoundary.setGeometry(this.leftBoundaryGeometry);
    this.leftBoundaryObject.geometry = leftBoundary.geometry;

    this.rightBoundaryGeometry.setFromPoints(this.lanePath.rightBoundary);
    const rightBoundary = new MeshLine();
    rightBoundary.setGeometry(this.rightBoundaryGeometry);
    this.rightBoundaryObject.geometry = rightBoundary.geometry;
  }

  addPoint(pos) {
    const point = new THREE.Mesh(new THREE.CircleGeometry(0.4, 32), new THREE.MeshBasicMaterial({ color: 0x0080ff, depthTest: false, transparent: true, opacity: 0.7 }));
    point.rotation.x = -Math.PI / 2;
    point.position.set(pos.x, 0, pos.y);
    point.userData = { index: this.pointIndex++ };

    this.pointsGroup.add(point);
    this.points.push(point);
    this.lanePath.addAnchor(pos);

    return point;
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
    this.pointIndex = 0;

    this.lanePath = new LanePath();
  }

  loadPoints(points) {
    this.clearPoints();

    points.forEach(p => this.addPoint(new THREE.Vector2(p.x, p.y)));
    this.redraw();
  }

  mouseDown(event) {
    if (!this.enabled || event.button != 0) return;

    this.mouse.x = (event.offsetX / this.canvas.clientWidth) * 2 - 1;
    this.mouse.y = -(event.offsetY / this.canvas.clientHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const picked = this.raycaster.intersectObjects(this.points)[0];

    if (picked) {
      this.draggingPoint = picked.object;
      this.dragOffset.copy(picked.object.position).sub(picked.point);
      event.stopImmediatePropagation();
    } else {
      const intersection = this.raycaster.ray.intersectPlane(GROUND_PLANE);
      if (intersection != null) {
        this.addPoint(new THREE.Vector2(intersection.x, intersection.z));
        this.redraw();
      }
    }
  }

  mouseMove(event) {
    if (!this.enabled || this.draggingPoint == null) return;

    this.mouse.x = (event.offsetX / this.canvas.clientWidth) * 2 - 1;
    this.mouse.y = -(event.offsetY / this.canvas.clientHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const intersection = this.raycaster.ray.intersectPlane(GROUND_PLANE);
    if (intersection != null) {
      this.updatePoint(this.draggingPoint, intersection.add(this.dragOffset));
      this.redraw();
    }
  }

  mouseUp(event) {
    if (!this.enabled || event.button != 0) return;

    this.draggingPoint = null;
  }
}
