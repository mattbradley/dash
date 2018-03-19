import LanePath from "../autonomy/LanePath.js";

const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0));
const NORMAL_POINT_COLOR = 0x0080ff;
const HOVER_POINT_COLOR = 0x30c0ff;

export default class Editor {
  constructor(canvas, camera, scene) {
    this.canvas = canvas;
    this.camera = camera;

    this.enabled = false;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.dragOffset = new THREE.Vector3();
    this.draggingPoint = null;
    this.pointIndex = 0;
    this.centerlineGeometry = new THREE.Geometry();
    this.leftBoundaryGeometry = new THREE.Geometry();
    this.rightBoundaryGeometry = new THREE.Geometry();
    this.draggingObstaclePreview = null;

    this.pointObjects = [];
    this.obstacleObjects = [];

    this.group = new THREE.Group();
    this.pointObjectsGroup = new THREE.Group();
    this.obstaclesGroup = new THREE.Group();
    this.group.add(this.obstaclesGroup);
    this.group.add(this.pointObjectsGroup);
    scene.add(this.group);

    this.lanePath = new LanePath();

    this.editorPathButton = document.getElementById('editor-path');
    this.editorPathButton.addEventListener('click', e => this.changeEditMode('path'));
    this.editorObstaclesButton = document.getElementById('editor-obstacles');
    this.editorObstaclesButton.addEventListener('click', e => this.changeEditMode('obstacles'));

    this.changeEditMode('path');

    canvas.addEventListener('mousedown', this.mouseDown.bind(this));
    canvas.addEventListener('mousemove', this.mouseMove.bind(this));
    canvas.addEventListener('mouseup', this.mouseUp.bind(this));
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

  update() {
    if (!this.enabled) return;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    if (this.draggingPoint) {
      const intersection = this.raycaster.ray.intersectPlane(GROUND_PLANE);
      if (intersection != null) {
        this.updatePoint(this.draggingPoint, intersection.add(this.dragOffset));
        this.redraw();
      }
    } else if (this.draggingObstacle) {
      if (this.draggingObstacle === true) {
        const intersection = this.raycaster.ray.intersectPlane(GROUND_PLANE);
        if (intersection != null) {
          const center = this.dragOffset.clone().add(intersection).divideScalar(2);
          const width = Math.max(0.5, Math.abs(this.dragOffset.x - intersection.x));
          const height = Math.max(0.5, Math.abs(this.dragOffset.z - intersection.z));

          if (this.draggingObstaclePreview) this.group.remove(this.draggingObstaclePreview);

          this.draggingObstaclePreview = new THREE.Mesh(
            new THREE.PlaneGeometry(width, height),
            new THREE.MeshBasicMaterial({ color: NORMAL_POINT_COLOR, depthTest: false, transparent: true, opacity: 0.4 })
          );
          this.draggingObstaclePreview.rotation.x = -Math.PI / 2;
          this.draggingObstaclePreview.position.copy(center);
          this.group.add(this.draggingObstaclePreview);
        }
      }
    } else if (this.pointObjects.length > 0) {
      this.pointObjects.forEach(p => p.material.color.set(NORMAL_POINT_COLOR));
      const picked = this.raycaster.intersectObjects(this.pointObjects)[0];

      if (picked)
        picked.object.material.color.set(HOVER_POINT_COLOR);
    }
  }

  changeEditMode(mode) {
    if (mode == 'path') {
      this.editMode = 'path';
      this.editorPathButton.classList.remove('is-outlined');
      this.editorPathButton.classList.add('is-selected');
      this.editorObstaclesButton.classList.add('is-outlined');
      this.editorObstaclesButton.classList.remove('is-selected');
    } else {
      this.editMode = 'obstacles';
      this.editorPathButton.classList.add('is-outlined');
      this.editorPathButton.classList.remove('is-selected');
      this.editorObstaclesButton.classList.remove('is-outlined');
      this.editorObstaclesButton.classList.add('is-selected');
    }
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
    const point = new THREE.Mesh(new THREE.CircleGeometry(0.6, 32), new THREE.MeshBasicMaterial({ color: NORMAL_POINT_COLOR, depthTest: false, transparent: true, opacity: 0.7 }));
    point.rotation.x = -Math.PI / 2;
    point.position.set(pos.x, 0, pos.y);
    point.userData = { index: this.pointIndex++ };

    this.pointObjectsGroup.add(point);
    this.pointObjects.push(point);
    this.lanePath.addAnchor(pos);

    return point;
  }

  updatePoint(object, pos) {
    object.position.copy(pos);
    this.lanePath.updateAnchor(object.userData.index, new THREE.Vector2(pos.x, pos.z));
  }

  clearPoints() {
    this.centerlineObject.geometry = new THREE.Geometry();

    this.group.remove(this.pointObjectsGroup);
    this.pointObjectsGroup = new THREE.Group();
    this.pointObjects = [];
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

    if (this.editMode == 'path') {
      const picked = this.raycaster.intersectObjects(this.pointObjects)[0];

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
    } else {
      const picked = this.raycaster.intersectObjects(this.obstacleObjects)[0];

      if (picked) {
        this.draggingObstacle = picked.object;
        this.dragOffset.copy(picked.object.position).sub(picked.point);
        event.stopImmediatePropagation();
      } else {
        const intersection = this.raycaster.ray.intersectPlane(GROUND_PLANE);
        if (intersection != null) {
          this.draggingObstacle = true;
          this.dragOffset.copy(intersection);
        }
      }
    }
  }

  mouseMove(event) {
    this.mouse.x = (event.offsetX / this.canvas.clientWidth) * 2 - 1;
    this.mouse.y = -(event.offsetY / this.canvas.clientHeight) * 2 + 1;
  }

  mouseUp(event) {
    if (!this.enabled || event.button != 0) return;

    if (this.draggingObstacle === true) {
      this.draggingObstacle = null;
      this.group.remove(this.draggingObstaclePreview);
      this.draggingObstaclePreview = null;

      this.mouse.x = (event.offsetX / this.canvas.clientWidth) * 2 - 1;
      this.mouse.y = -(event.offsetY / this.canvas.clientHeight) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);

      const intersection = this.raycaster.ray.intersectPlane(GROUND_PLANE);
      if (intersection != null) {
        console.log(this.dragOffset);
        console.log(intersection);
      }
    }

    this.draggingPoint = null;
  }
}
