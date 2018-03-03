import Simulator from "./Simulator.js";

Box2D().then(Box2D => {
  window.Box2D = Box2D;

  //const geolocation = [36.037351, -86.786561];
  const geolocation = [33.523900, -111.908756];

  window.simulator = new Simulator(geolocation, document.getElementById('container'));
});
