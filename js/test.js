const renderer = new THREE.WebGLRenderer();
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 500);
camera.position.set(0, 20, 20);
camera.lookAt(new THREE.Vector3(0, 0, 0));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const geometry = new THREE.BoxGeometry(6, 3, 2);
const material = new THREE.MeshLambertMaterial({color: 0x00ff00, transparent: true, opacity: 1});
const cube = new THREE.Mesh(geometry, material);
cube.position.y = 5;
cube.castShadow = true;
scene.add(cube);

const groundTexture = new THREE.TextureLoader().load('https://khms1.google.com/kh/v=748?x=543256&y=823233&z=21');
//const groundTexture = new THREE.TextureLoader().load('https://khms3.google.com/kh/v=748?x=271627&y=411616&z=20');
const groundGeometry = new THREE.PlaneBufferGeometry(50, 50);
const groundMaterial = new THREE.MeshBasicMaterial({map: groundTexture});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

scene.add(new THREE.AmbientLight(0x555555));

const light = new THREE.DirectionalLight();
light.position.set(0, 100, 0);
light.castShadow = true;
light.shadow.camera.near = 0.1;
light.shadow.camera.far = 20;
light.shadow.camera.left = -20;
light.shadow.camera.right = 20;
light.shadow.camera.top = 20;
light.shadow.camera.bottom = -20;
scene.add(light);

const lineGeometry = new THREE.Geometry();
for (let j = 0; j < 2 * Math.PI; j += 2 * Math.PI / 100) {
  lineGeometry.vertices.push(new THREE.Vector3(10 * Math.cos(j), 0, 10 * Math.sin(j)));
}
const line = new MeshLine();
line.setGeometry(lineGeometry);
const lineMaterial = new MeshLineMaterial({
  color: new THREE.Color(0xffffff),
  lineWidth: 0.4,
  resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
  depthTest: false
});
const lineMesh = new THREE.Mesh(line.geometry, lineMaterial);
scene.add(lineMesh);

const lineGeometry2 = new THREE.Geometry();
for (let j = 0; j < 2 * Math.PI; j += 2 * Math.PI / 100) {
  lineGeometry2.vertices.push(new THREE.Vector3(10 * Math.cos(j), 0, 10 * Math.sin(j)));
}
const line2 = new MeshLine();
line2.setGeometry(lineGeometry2);
const lineMaterial2 = new MeshLineMaterial({
  color: new THREE.Color(0x0000ff),
  lineWidth: 0.2,
  resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
  depthTest: false
});
const lineMesh2 = new THREE.Mesh(line2.geometry, lineMaterial2);
scene.add(lineMesh2);

const marker = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({color: 0xff0000}));
marker.visible = false;
marker.material.depthTest = false;
marker.material.transparent = true;
marker.material.opacity = 0.5;
marker.rotation.x = -Math.PI / 2;
scene.add(marker);

const controls = new THREE.OrbitControls(camera);

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function onMouseMove(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersection = raycaster.ray.intersectPlane(groundPlane);
  if (intersection != null) {
    marker.position.copy(intersection);
    marker.visible = true;
  } else {
    marker.visible = false;
  }
}

window.addEventListener('mousemove', onMouseMove, false);

const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0));
let prevTimestamp = performance.now();

function render(timestamp) {
  requestAnimationFrame(render);
  controls.update();

  const delta = (timestamp - prevTimestamp) / 1000;
  prevTimestamp = timestamp;

  cube.rotation.x += Math.PI * delta * 0.7;
  cube.rotation.y += Math.PI * delta * 0.9;
  cube.rotation.z += Math.PI * delta * 0.3;

  renderer.render(scene, camera);
}

requestAnimationFrame(render);
