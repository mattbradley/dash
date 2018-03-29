import Simulator from "./Simulator.js";
import StaticObstacle from "./autonomy/StaticObstacle.js";

document.addEventListener('DOMContentLoaded', e => {
  window.simulator = new Simulator(document.getElementById('container'));

  const o = new StaticObstacle(new THREE.Vector2(23.54444156, -483.1434938), 0.243123451, 100, 10);
  console.log(o);
  const j = JSON.stringify(o.toJSON());
  console.log(j);
  const o2 = StaticObstacle.fromJSON(JSON.parse(j));
  console.log(o2);
});
