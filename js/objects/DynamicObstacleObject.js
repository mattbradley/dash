export default class DynamicObstacleObject extends THREE.Object3D {
  constructor(dynamicObstacle, lanePath) {
    super();

    this.dynamicObstacle = dynamicObstacle;
    this.lanePath = lanePath;

    const colors = {
      vehicle: 0xff8800,
      cyclist: 0x00ccff,
      pedestrian: 0xffdd00
    };

    const heights = {
      vehicle: 2.0,
      cyclist: 1.8,
      pedestrian: 1.8
    };

    const mesh2D = new THREE.Mesh(
      new THREE.PlaneGeometry(dynamicObstacle.size.w * 2, dynamicObstacle.size.h * 2),
      new THREE.MeshBasicMaterial({ color: colors[dynamicObstacle.type] || 0xff8800, depthTest: false, transparent: true, opacity: 0.7 })
    );
    mesh2D.rotation.x = -Math.PI / 2;
    mesh2D.layers.set(2);
    this.add(mesh2D);

    const mesh3D = new THREE.Mesh(
      new THREE.BoxBufferGeometry(dynamicObstacle.size.w * 2, heights[dynamicObstacle.type] || 1.5, dynamicObstacle.size.h * 2),
      new THREE.MeshToonMaterial({ color: colors[dynamicObstacle.type] || 0xff8800, transparent: true, opacity: 0.7 })
    );
    mesh3D.position.setY((heights[dynamicObstacle.type] || 1.5) / 2);
    mesh3D.layers.set(3);
    this.add(mesh3D);
  }

  update(time) {
    const slPos = this.dynamicObstacle.positionAtTime(time);

    // Sample just the station this dynamic obstacle is at
    const [sample] = this.lanePath.sampleStations(slPos.x, 1, 0);

    if (sample === undefined) {
      this.visible = false;
      return;
    }

    const rot = sample.rot;
    const pos = THREE.Vector2.fromAngle(rot + Math.PI / 2).multiplyScalar(slPos.y).add(sample.pos);

    this.position.set(pos.x, 0, pos.y);
    this.rotation.y = -rot;

    super.updateMatrix();

    this.visible = slPos.x >= 0;
  }
}
