const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0));
const mouse = new THREE.Vector2();
const dragOffset = new THREE.Vector3();
let draggingPoint = null;
let mouseMoved = false;
const splineGeometry = new THREE.Geometry();
const tangentGeometry = new THREE.Geometry();
const boundaryGeometry = new THREE.Geometry();

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

    this.mouseDown = this.mouseDown.bind(this);
    this.mouseMove = this.mouseMove.bind(this);
    this.mouseUp = this.mouseUp.bind(this);

    canvas.addEventListener('mousedown', this.mouseDown);
    canvas.addEventListener('mousemove', this.mouseMove);
    canvas.addEventListener('mouseup', this.mouseUp);
    canvas.addEventListener('contextmenu', e => this.enabled && e.preventDefault());

    this.halfway = new THREE.Mesh(new THREE.CircleGeometry(0.15, 32), new THREE.MeshBasicMaterial({ color: 0xff8000, depthTest: false, transparent: true, opacity: 0.7 }));
    this.halfway.rotation.x = -Math.PI / 2;
    this.halfway.visible = false;
    this.group.add(this.halfway);

    this.center = new THREE.Mesh(new THREE.CircleGeometry(0.15, 32), new THREE.MeshBasicMaterial({ color: 0xff00ff, depthTest: false, transparent: true, opacity: 0.7 }));
    this.center.rotation.x = -Math.PI / 2;
    this.center.visible = false;
    this.group.add(this.center);

    this.splineObject = new THREE.Mesh(new THREE.Geometry(), new MeshLineMaterial({ color: new THREE.Color(0x004080), lineWidth: 0.1, depthTest: false, transparent: true, opacity: 0.7, resolution: new THREE.Vector2(this.canvas.clientWidth, this.canvas.clientHeight) }));
    this.splineObject.rotation.x = Math.PI / 2;
    this.splineObject.renderOrder = 1;
    this.group.add(this.splineObject);

    this.tangentObject = new THREE.Mesh(new THREE.Geometry(), new MeshLineMaterial({ color: new THREE.Color(0xff8000), lineWidth: 0.05, depthTest: false, transparent: true, opacity: 0.7, resolution: new THREE.Vector2(this.canvas.clientWidth, this.canvas.clientHeight) }));
    this.tangentObject.rotation.x = Math.PI / 2;
    this.tangentObject.renderOrder = 1;
    this.group.add(this.tangentObject);

    this.boundaryObject = new THREE.Mesh(new THREE.Geometry(), new MeshLineMaterial({ color: new THREE.Color(0xff8000), lineWidth: 0.05, depthTest: false, transparent: true, opacity: 0.7, resolution: new THREE.Vector2(this.canvas.clientWidth, this.canvas.clientHeight) }));
    this.boundaryObject.rotation.x = Math.PI / 2;
    this.boundaryObject.renderOrder = 1;
    this.group.add(this.boundaryObject);
  }

  redrawSpline() {
    const numPoints = 10 * this.points.length;
    const curve = new THREE.SplineCurve(this.points.map(p => new THREE.Vector2(p.position.x, p.position.z)));
    const curvePoints = curve.getSpacedPoints(numPoints);
    splineGeometry.setFromPoints(curvePoints);

    const spline = new MeshLine();
    spline.setGeometry(splineGeometry);
    this.splineObject.geometry = spline.geometry;

    const normals = Array(numPoints + 1).fill().map((_, i) => {
      const tangent = curve.getTangentAt(i / numPoints);
      return new THREE.Vector2(-tangent.y, tangent.x);
    });

    const laneWidth = 3.7 / 2;
    const boundaryPoints = [];
    for (let i = 0; i < normals.length; i++) {
      boundaryPoints.push(normals[i].clone().multiplyScalar(laneWidth).add(curvePoints[i]));
    }
    for (let i = normals.length - 1; i >= 0; i--) {
      boundaryPoints.push(normals[i].clone().multiplyScalar(-laneWidth).add(curvePoints[i]));
    }
    boundaryPoints.push(boundaryPoints[0]);

    boundaryGeometry.setFromPoints(boundaryPoints);
    const boundaryLine = new MeshLine();
    boundaryLine.setGeometry(boundaryGeometry);
    this.boundaryObject.geometry = boundaryLine.geometry

    if (this.points.length > 1) {
      const p = curve.getPointAt(0.5);
      this.halfway.visible = true;
      this.halfway.position.set(p.x, 0, p.y);

      const tangent = curve.getTangentAt(0.5);
      tangentGeometry.setFromPoints([tangent.clone().multiplyScalar(-5).add(p), tangent.clone().multiplyScalar(5).add(p)]);
      const tangentLine = new MeshLine();
      tangentLine.setGeometry(tangentGeometry);
      this.tangentObject.geometry = tangentLine.geometry;

      const curvature = curve.getCurvatureAt(0.5);
      const centerPos = (new THREE.Vector2(-tangent.y, tangent.x)).multiplyScalar(1 / curvature).add(p);
      this.center.position.set(centerPos.x, 0, centerPos.y);
      this.center.visible = true;
    } else {
      this.halfway.visible = false;
      this.center.visible = false;
    }
  }

  addPoint(pos) {
    const point = new THREE.Mesh(new THREE.CircleGeometry(0.25, 32), new THREE.MeshBasicMaterial({ color: 0x0080ff, depthTest: false, transparent: true, opacity: 0.7 }));
    point.rotation.x = -Math.PI / 2;
    point.position.set(pos.x, 0, pos.y);

    this.pointsGroup.add(point);
    this.points.push(point);

    this.redrawSpline();
  }

  clearPoints() {
    this.splineObject.geometry = new THREE.Geometry();

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
      this.redrawSpline();
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
