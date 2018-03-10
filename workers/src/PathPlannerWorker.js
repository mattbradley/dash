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

  const { path, width, height, latticeStartStation } = pathPlanner.plan(vehiclePose, vehicleStation, lanePath, obstacles);

  self.postMessage({ path, vehiclePose, vehicleStation, latticeStartStation });
};
