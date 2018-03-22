export default class DynamicObstacleObject extends THREE.Object3D {
  constructor(dynamicObstacle, lanePath) {
    super();

    this.dynamicObstacle = dynamicObstacle;
    this.lanePath = lanePath;

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(dynamicObstacle.halfWidth * 2, dynamicObstacle.halfHeight * 2), new THREE.MeshBasicMaterial({ color: 0xff8800, depthTest: false, transparent: true, opacity: 0.7 }));
    mesh.rotation.x = -Math.PI / 2;
    this.add(mesh);
  }

  update(time) {
    const slPos = this.dynamicObstacle.positionAtTime(time);

    // Sample just the station this dynamic obstacle is at
    const [sample] = this.lanePath.sampleStations(slPos.x, 1, 0);

    const rot = sample.rot;
    const pos = THREE.Vector2.fromAngle(rot + Math.PI / 2).multiplyScalar(slPos.y).add(sample.pos);

    this.position.set(pos.x, 0, pos.y);
    this.rotation.y = -rot;

    super.updateMatrix();
  }
}
