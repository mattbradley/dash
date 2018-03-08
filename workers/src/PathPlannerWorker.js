import THREE from "../../js/vendor/three.js";
import Utils from "../../js/Utils.js";
import PathPlanner from "../../js/autonomy/path-planning/PathPlanner.js";
import LanePath from "../../js/autonomy/LanePath.js";
import StaticObstacle from "../../js/autonomy/path-planning/StaticObstacle.js";

const pathPlanner = new PathPlanner();

onmessage = function(event) {
  const { vehiclePose, vehicleStation, lanePath, obstacles } = event.data;

  Object.setPrototypeOf(lanePath, LanePath.prototype);
  obstacles.forEach(o => Object.setPrototypeOf(o, StaticObstacle.prototype));

  let start = performance.now();
  const sd = +new Date;
  console.log(new Date);
  const { path, width, height } = pathPlanner.plan(vehiclePose, vehicleStation, lanePath, obstacles);
  console.log(`Planner run time (performance.now()): ${(performance.now() - start) / 1000}s`);
  console.log(`Planner run time (Date): ${((+new Date) - sd) / 1000}s`);
  console.log(`Grid size: ${width}x${height}`);

  self.postMessage({ path });
};
