import GPGPU from "../../GPGPU.js";
import CubicPathOptimizer from "./CubicPathOptimizerGPU.js";

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
  constructor(lanePath) {
    const stationInterval = SPATIAL_HORIZON / NUM_STATIONS;
    const centerline = lanePath.sampleStations(stationInterval, NUM_STATIONS, stationInterval);
    const lattice = new Array(NUM_STATIONS);
    const offset = Math.floor(NUM_LATITUDES / 2);

    for (let s = 0; s < NUM_STATIONS; s++) {
      const sample = centerline[s];
      const latitudes = lattice[s] = new Array(NUM_LATITUDES);

      for (let l = 0; l < NUM_LATITUDES; l++) {
        const latitude = (l - offset) / offset * LANE_WIDTH;
        const rot = sample.rot;
        const pos = THREE.Vector2.fromAngle(rot + Math.PI / 2).multiplyScalar(latitude).add(sample.pos);
        const curv = sample.curv == 0 ? 0 : 1 / (1 / sample.curv - latitude);

        latitudes[l] = { pos, rot, curv };
      }
    }

    this.lattice = lattice;
  }

  optimizePaths() {
    const start = performance.now();
    const halfLatitudeConnectivity = Math.floor(LATITUDE_CONNECTIVITY / 2);
    const latitudeConnections = NUM_LATITUDES * LATITUDE_CONNECTIVITY - halfLatitudeConnectivity * (halfLatitudeConnectivity + 1);
    const stationConnections = NUM_STATIONS * STATION_CONNECTIVITY - STATION_CONNECTIVITY * (STATION_CONNECTIVITY + 1) / 2;
    const numPaths = latitudeConnections * stationConnections;

    const pathStarts = GPGPU.alloc(numPaths, 4);
    const pathEnds = GPGPU.alloc(numPaths, 4);
    let index = 0;

    for (let s1 = 0; s1 < NUM_STATIONS; s1++) {
      for (let l1 = 0; l1 < NUM_LATITUDES; l1++) {
        for (let s2 = s1 + 1; s2 <= s1 + STATION_CONNECTIVITY && s2 < NUM_STATIONS; s2++) {
          const start = this.lattice[s1][l1];

          for (let l2 = Math.max(l1 - halfLatitudeConnectivity, 0); l2 <= l1 + halfLatitudeConnectivity && l2 < NUM_LATITUDES; l2++) {
            const end = this.lattice[s2][l2];

            pathStarts[index] = start.pos.x;
            pathEnds[index++] = end.pos.x;

            pathStarts[index] = start.pos.y;
            pathEnds[index++] = end.pos.y;

            pathStarts[index] = start.rot;
            pathEnds[index++] = end.rot;

            pathStarts[index] = start.curv;
            pathEnds[index++] = end.curv;
          }
        }
      }
    }

    const paths = CubicPathOptimizer.optimizePaths(pathStarts, pathEnds);
    console.log(`Optimized ${numPaths} paths in ${(performance.now() - start) / 1000} seconds`);

    let converged = 0;
    for (let i = 0; i < numPaths; i++)
      if (paths[i * 4 + 3] != 0) converged++;

    console.log(`${converged} out of ${numPaths} converged`);
  }
}
