import THREE from "script-loader!../js/vendor/three.js";
import Utils from "script-loader!../js/Utils.js";
import PathPlanner from "../js/autonomy/path-planning/PathPlanner.js";
import LanePath from "../js/autonomy/LanePath.js";
import StaticObstacle from "../js/autonomy/StaticObstacle.js";
import DynamicObstacle from "../js/autonomy/DynamicObstacle.js";

const pathPlanner = new PathPlanner();

onmessage = function(event) {
  const { config, vehiclePose, vehicleStation, lanePath, startTime, staticObstacles, dynamicObstacles, reset } = event.data;

  Object.setPrototypeOf(lanePath, LanePath.prototype);
  staticObstacles.forEach(o => Object.setPrototypeOf(o, StaticObstacle.prototype));
  dynamicObstacles.forEach(o => Object.setPrototypeOf(o, DynamicObstacle.prototype));

  if (reset) pathPlanner.reset();

  pathPlanner.config = config;

  try {
    const { path, fromVehicleSegment, fromVehicleParams, latticeStartStation } = pathPlanner.plan(vehiclePose, vehicleStation, lanePath, startTime, staticObstacles, dynamicObstacles);

    self.postMessage({ path, fromVehicleSegment, fromVehicleParams, vehiclePose, vehicleStation, latticeStartStation });
  } catch (error) {
    console.log('PathPlannerWorker error');
    console.log(error);
  }
};
