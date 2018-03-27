export default class RoadLattice {
  constructor(lanePath, latticeStartStation, config) {
    const stationInterval = config.spatialHorizon / config.lattice.numStations;
    const centerline = lanePath.sampleStations(latticeStartStation, config.lattice.numStations, stationInterval);
    const lattice = new Array(centerline.length);
    const offset = Math.floor(config.lattice.numLatitudes / 2);

    for (let s = 0; s < centerline.length; s++) {
      const sample = centerline[s];
      const latitudes = lattice[s] = new Array(config.lattice.numLatitudes);

      for (let l = 0; l < config.lattice.numLatitudes; l++) {
        const latitude = (l - offset) / offset * config.roadWidth / 2;
        const rot = sample.rot;
        const pos = THREE.Vector2.fromAngle(rot + Math.PI / 2).multiplyScalar(latitude).add(sample.pos);
        const curv = sample.curv == 0 ? 0 : 1 / (1 / sample.curv - latitude);

        latitudes[l] = { pos, rot, curv };
      }
    }

    this.lattice = lattice;
  }
}
