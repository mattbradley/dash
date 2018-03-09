import GPGPU from "../../GPGPU.js";

const SPATIAL_HORIZON = 100; // meters
const LANE_WIDTH = 3.7; // meters
const NUM_STATIONS = 10;
const NUM_LATITUDES = 19;
const STATION_CONNECTIVITY = 3;
const LATITUDE_CONNECTIVITY = 9;

if (NUM_LATITUDES % 2 != 1)
  throw new Error(`Expected NUM_LATITUDES to be odd but it is ${NUM_LATITUDES}.`);

if (LATITUDE_CONNECTIVITY % 2 != 1)
  throw new Error(`Expected LATITUDE_CONNECTIVITY to be odd but it is ${LATITUDE_CONNECTIVITY}.`);

if (LATITUDE_CONNECTIVITY > NUM_LATITUDES)
  throw new Error("LATITUDE_CONNECTIVITY cannot be larger than NUM_LATITUDES.");

export default class {
  constructor(lanePath, latticeStartStation) {
    const stationInterval = SPATIAL_HORIZON / NUM_STATIONS;
    // TODO: try transforming points into vehicle space
    const centerline = lanePath.sampleStations(latticeStartStation, NUM_STATIONS, stationInterval);
    const lattice = new Array(NUM_STATIONS);
    const offset = Math.floor(NUM_LATITUDES / 2);

    for (let s = 0; s < NUM_STATIONS; s++) {
      const sample = centerline[s];
      const latitudes = lattice[s] = new Array(NUM_LATITUDES);

      for (let l = 0; l < NUM_LATITUDES; l++) {
        const latitude = (l - offset) / offset * LANE_WIDTH / 2;
        const rot = sample.rot;
        const pos = THREE.Vector2.fromAngle(rot + Math.PI / 2).multiplyScalar(latitude).add(sample.pos);
        const curv = sample.curv == 0 ? 0 : 1 / (1 / sample.curv - latitude);

        latitudes[l] = { pos, rot, curv };
      }
    }

    this.lattice = lattice;
  }
}
