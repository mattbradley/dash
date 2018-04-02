const COLOR = 0xdd0000;
const HEIGHT = 5;

export default class StaticObstacleObject extends THREE.Object3D {
  constructor(staticObstacle) {
    super();

    const mesh2D = new THREE.Mesh(
      new THREE.PlaneGeometry(staticObstacle.width, staticObstacle.height),
      new THREE.MeshBasicMaterial({ color: COLOR, depthTest: false, transparent: true, opacity: 0.5 })
    );
    mesh2D.rotation.x = -Math.PI / 2;
    mesh2D.layers.set(2);
    this.add(mesh2D);

    const mesh3D = new THREE.Mesh(
      new THREE.BoxBufferGeometry(staticObstacle.width, HEIGHT, staticObstacle.height),
      new THREE.MeshToonMaterial({ color: COLOR, transparent: true, opacity: 0.5 })
    );
    mesh3D.position.setY(HEIGHT / 2);
    mesh3D.layers.set(3);
    this.add(mesh3D);

    this.rotation.y = -staticObstacle.rot;
    this.position.set(staticObstacle.pos.x, 0, staticObstacle.pos.y);
  }
}
