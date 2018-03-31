import Simulator from "./Simulator.js";
import StaticObstacle from "./autonomy/StaticObstacle.js";

document.addEventListener('DOMContentLoaded', e => {
  window.simulator = new Simulator(document.getElementById('container'));
});
