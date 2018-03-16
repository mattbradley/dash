import Simulator from "./Simulator.js";

document.addEventListener('DOMContentLoaded', e => {
  //const geolocation = [36.037351, -86.786561];
  const geolocation = [33.523900, -111.908756];

  window.simulator = new Simulator(geolocation, document.getElementById('container'));
});
