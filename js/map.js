import { Physics } from "./physics/physics.js";
import { Car } from "./physics/car.js";
import { Path } from "./autonomy/path.js";
import { CarController } from "./autonomy/car_controller.js";

function tileSizeInMeters(zoom) {
  const earthRadius = 6378137;
  const nashvilleLatitude = 36;
  return 2 * Math.PI * earthRadius * Math.cos(nashvilleLatitude * Math.PI / 180) / Math.pow(2, zoom);
}

function geoToWorld(latlng) {
  const x = (latlng[1] + 180) / 360 * 256;
  const y = ((1 - Math.log(Math.tan(latlng[0] * Math.PI / 180) + 1 / Math.cos(latlng[0] * Math.PI / 180)) / Math.PI) / 2) * 256;
  return [x, y];
}

function worldToTile(worldCoordinates) {
  return [Math.floor(worldCoordinates[0] * scale / 256), Math.floor(worldCoordinates[1] * scale / 256)];
}

const geolocation = [36.037351, -86.786561];//[36.040031, -86.743506]
const zoom = 20;
const scale = 1 << zoom;
const originTile = worldToTile(geoToWorld(geolocation));
const numTiles = 20;

const tileSize = tileSizeInMeters(zoom);

const renderer = new THREE.WebGLRenderer();
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 2000);
camera.position.set(0, 20, 20);
camera.lookAt(new THREE.Vector3(0, 0, 0));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

for (let x = -numTiles; x < numTiles; x++) {
  for (let y = -numTiles; y < numTiles; y++) {
    const tileTexture = new THREE.TextureLoader().load(`https://khms0.google.com/kh/v=748?x=${originTile[0] + x}&y=${originTile[1] + y}&z=${zoom}`);
    tileTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const tileGeometry = new THREE.PlaneBufferGeometry(tileSize, tileSize);
    const tileMaterial = new THREE.MeshBasicMaterial({ map: tileTexture, color: 0xffffff });
    const tile = new THREE.Mesh(tileGeometry, tileMaterial);
    tile.rotation.x = -Math.PI / 2;
    tile.position.x = x * tileSize;
    tile.position.z = y * tileSize;
    scene.add(tile);
  }
}

const controls = new THREE.OrbitControls(camera);

const physics = new Physics();
const car = physics.createCar();
const carMesh = new THREE.Mesh(new THREE.PlaneGeometry(Car.HALF_CAR_LENGTH * 2, Car.HALF_CAR_WIDTH * 2), new THREE.MeshBasicMaterial({ color: 0x0080ff, depthTest: false, transparent: true, opacity: 0.5 }));
carMesh.rotation.x = -Math.PI / 2;
scene.add(carMesh);

const wheelMeshes = [0, 1, 2, 3].map(() => {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(Car.HALF_WHEEL_LENGTH * 2, Car.HALF_WHEEL_WIDTH * 2), new THREE.MeshBasicMaterial({ color: 0xff8000, depthTest: false, transparent: true, opacity: 0.7 }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 1;
  scene.add(mesh);
  return mesh;
});

const rearAxlePosMarker = new THREE.Mesh(new THREE.CircleGeometry(0.2, 32), new THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: false, transparent: true, opacity: 0.5 }));
rearAxlePosMarker.rotation.x = -Math.PI / 2;
scene.add(rearAxlePosMarker);

const frontAxlePosMarker = new THREE.Mesh(new THREE.CircleGeometry(0.2, 32), new THREE.MeshBasicMaterial({ color: 0x00ff00, depthTest: false, transparent: true, opacity: 0.5 }));
frontAxlePosMarker.rotation.x = -Math.PI / 2;
scene.add(frontAxlePosMarker);

const frontPathPosMarker = new THREE.Mesh(new THREE.CircleGeometry(0.1, 32), new THREE.MeshBasicMaterial({ color: 0x00ff00, depthTest: false, transparent: true, opacity: 1 }));
frontPathPosMarker.rotation.x = -Math.PI / 2;
frontPathPosMarker.renderOrder = 1;
scene.add(frontPathPosMarker);

let prevTimestamp = null;
let steerControl = 0;

function render(timestamp) {
  requestAnimationFrame(render);

  if (prevTimestamp == null) {
    prevTimestamp = timestamp;
    return;
  }

  const dt = (timestamp - prevTimestamp) / 1000;
  prevTimestamp = timestamp;

  car.update(carControls(), dt);
  physics.step(dt);
  //console.log(car.speed * 2.23694);

  const carPosition = car.position;
  carMesh.position.set(carPosition[0], 0, carPosition[1]);
  carMesh.rotation.z = -car.rotation;

  const wheels = car.wheels;
  for (let i = 0; i < 4; i++) {
    wheelMeshes[i].position.set(wheels[i].position[0], 0, wheels[i].position[1]);
    wheelMeshes[i].rotation.z = -wheels[i].rotation;
  }

  const rearAxlePos = car.rearAxlePosition;
  const frontAxlePos = car.frontAxlePosition;
  steerControl = carController.drive({ pos: new THREE.Vector2(rearAxlePos[0], rearAxlePos[1]), rot: car.rotation }, car.wheelAngle, dt);

  rearAxlePosMarker.position.set(rearAxlePos[0], 0, rearAxlePos[1]);
  frontAxlePosMarker.position.set(frontAxlePos[0], 0, frontAxlePos[1]);
  frontPathPosMarker.position.set(carController.closestFrontPathPos.x, 0, carController.closestFrontPathPos.y);

  //camera.position.set(carPosition[0] - 1 * Math.cos(car.rotation), 20, carPosition[1] - 1 * Math.sin(car.rotation));
  //camera.lookAt(carPosition[0], 0, carPosition[1]);

  controls.update();
  renderer.render(scene, camera);
}

requestAnimationFrame(render);

const carKeys = { forward: false, backward: false, left: false, right: false, brake: false };
document.addEventListener('keydown', event => {
  switch (event.key) {
    case 'w': carKeys.forward = true; break;
    case 's': carKeys.backward = true; break;
    case 'a': carKeys.left = true; break;
    case 'd': carKeys.right = true; break;
    case ' ': carKeys.brake = true; break;
  }
});

document.addEventListener('keyup', event => {
  switch (event.key) {
    case 'w': carKeys.forward = false; break;
    case 's': carKeys.backward = false; break;
    case 'a': carKeys.left = false; break;
    case 'd': carKeys.right = false; break;
    case ' ': carKeys.brake = false; break;
  }
});

function carControls() {
  let gas = 0;
  let brake = 0;
  let steer = 0;

  if (carKeys.forward) gas += 1;
  if (carKeys.backward) gas -= 1;
  if (carKeys.left) steer -= 1;
  if (carKeys.right) steer += 1;
  if (carKeys.brake) brake += 1;

  return { gas, brake, steer: steerControl };
}

const c1 = 20;
const c2 = 30;
let r = 0;
let x = Car.REAR_AXLE_POS;
let y = 0;

let poses = [[x, y, r]];

for (let i = 0; i < 200; i++) {
  x += Math.cos(r) * c1 / 200;
  y += Math.sin(r) * c1 / 200;
  r += 3 / 8 * Math.PI / 200;
  poses.push([x, y, r]);
}

for (let i = 0; i < 100; i++) {
  const f = i / 99;
  x += Math.cos(r) * ((1 - f) * c1 + f * c2) / 100;
  y += Math.sin(r) * ((1 - f) * c1 + f * c2) / 100;
  r += ((1 - f) * 3 / 8 * Math.PI + f * -6 / 8 * Math.PI) / 100;
  poses.push([x, y, r]);
}

for (let i = 0; i < 600; i++) {
  x += Math.cos(r) * c2 / 600;
  y += Math.sin(r) * c2 / 600;
  r -= 6 / 8 * Math.PI / 600;
  poses.push([x, y, r]);
}

poses = poses.map(([x, y, r]) => { return { pos: new THREE.Vector2(x, y), dir: 1 } });

const path = new Path(poses, 0, r);
const carController = new CarController(path);

const pathMaterial = new THREE.LineBasicMaterial({ color: 0xff0000, depthTest: false });
const pathGeometry = new THREE.Geometry();
pathGeometry.vertices.push(...path.poses.map(p => new THREE.Vector3(p.pos.x, 0, p.pos.y)));
scene.add(new THREE.Line(pathGeometry, pathMaterial));

const frontMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, depthTest: false });
const frontGeometry = new THREE.Geometry();
frontGeometry.vertices.push(...path.poses.map(p => new THREE.Vector3(p.frontPos.x, 0, p.frontPos.y)));
scene.add(new THREE.Line(frontGeometry, frontMaterial));

var curve = new THREE.SplineCurve( [
    new THREE.Vector2( -10, 0 ),
    new THREE.Vector2( -5, 5 ),
    new THREE.Vector2( 0, 0 ),
    new THREE.Vector2( 5, -5 ),
    new THREE.Vector2( 10, 0 )
] );

var points = curve.getPoints( 50 );
points = points.map(p => new THREE.Vector3(p.x, 0, p.y));
var geometry = new THREE.BufferGeometry().setFromPoints( points );

var material = new THREE.LineBasicMaterial( { color : 0xffffff, depthTest: false } );

// Create the final object to add to the scene
var splineObject = new THREE.Line( geometry, material );
scene.add(splineObject);
