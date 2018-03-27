import Simulator from "./Simulator.js";

document.addEventListener('DOMContentLoaded', e => {
  window.simulator = new Simulator(document.getElementById('container'));
});
