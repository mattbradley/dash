import Simulator from "./Simulator.js";

const geolocation = [36.037351, -86.786561];
window.simulation = new Simulator(geolocation, document.getElementById('container'));

import GPGPU from "./GPGPU.js";
import CubicPathOptimizerGPU from "./autonomy/path_finding/CubicPathOptimizerGPU.js";
import CubicPathOptimizer from "./autonomy/path_finding/CubicPathOptimizer.js";

const start = { x: 0, y: 0, rot: 0, curv: 0 };
const end = { x: 10, y: -50, rot: 0, curv: -0.19 };

const optimizer = new CubicPathOptimizer(start, end);
optimizer.optimize();
console.log(optimizer.params);

console.log(CubicPathOptimizerGPU.optimizePath(start, end));
