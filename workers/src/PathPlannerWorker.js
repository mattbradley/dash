import THREE from "../../js/vendor/three.js";
import Utils from "../../js/Utils.js";
import PathPlanner from "../../js/autonomy/path-planning/PathPlanner.js";
import LanePath from "../../js/autonomy/LanePath.js";
import StaticObstacle from "../../js/autonomy/path-planning/StaticObstacle.js";

const pathPlanner = new PathPlanner();

onmessage = function(e) {
  console.log("Message:");

  const { lanePath, obstacles } = e.data;

  Object.setPrototypeOf(lanePath, LanePath.prototype);
  obstacles.forEach(o => Object.setPrototypeOf(o, StaticObstacle.prototype));

  console.log(lanePath);
  console.log(obstacles);

  let count = 0;
  while (count++ < 100) {
    let start = performance.now();
    const sd = +new Date;
    console.log(new Date);
    const { xysl, width, height, center, rot, path, vehiclePose } = pathPlanner.plan(lanePath, obstacles);
    console.log(`Planner run time (performance.now()): ${(performance.now() - start) / 1000}s`);
    console.log(`Planner run time (Date): ${((+new Date) - sd) / 1000}s`);
    console.log(new Date);
    console.log(`Grid size: ${width}x${height}`);
  }
};
