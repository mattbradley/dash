import THREE from "../../js/vendor/three.js";
import Utils from "../../js/Utils.js";
import PathPlanner from "../../js/autonomy/path-planning/PathPlanner.js";
import LanePath from "../../js/autonomy/LanePath.js";
import StaticObstacle from "../../js/autonomy/path-planning/StaticObstacle.js";

const pathPlanner = new PathPlanner();

onmessage = function(event) {
  const { config, vehiclePose, vehicleStation, lanePath, obstacles, reset } = event.data;

  Object.setPrototypeOf(lanePath, LanePath.prototype);
  obstacles.forEach(o => Object.setPrototypeOf(o, StaticObstacle.prototype));

  if (reset) pathPlanner.reset();

  pathPlanner.config = config;

  try {
    const { path, fromVehicleSegment, fromVehicleParams, latticeStartStation } = pathPlanner.plan(vehiclePose, vehicleStation, lanePath, obstacles);

    self.postMessage({ path, fromVehicleSegment, fromVehicleParams, vehiclePose, vehicleStation, latticeStartStation });
  } catch (error) {
    console.log('PathPlannerWorker error');
    console.log(error);
  }
};
