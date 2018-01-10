import GPGPU from "./../../GPGPU2.js";
import Car from "../../physics/Car.js";

const GRID_CELL_SIZE = 0.3; // meters
const GRID_MARGIN = 10; // meters
const SL_OBSTACLE_GRID_CELL_SIZE = GRID_CELL_SIZE / 2; // meters
const STATION_INTERVAL = 0.5; // meters
const SPATIAL_HORIZON = 100; // meters
const LETHAL_S_DILATION = Car.HALF_CAR_LENGTH; // meters
const COSTLY_S_DILATION = 1; // meters
const LETHAL_L_DILATION = Car.HALF_CAR_WIDTH; //meters
const COSTLY_L_DILATION = 1; // meters

const XYSL_MAP_KERNEL = `

const float GRID_CELL_SIZE = ${GRID_CELL_SIZE};
const float STATION_INTERVAL = ${STATION_INTERVAL};

int closestSample(vec2 pos) {
  int closest = 0;
  float closestDist = distance(pos, texelFetch(centerline, ivec2(0, 0), 0).xy);
  for (int i = 1; i < numSamples; i++) {
    float dist = distance(pos, texelFetch(centerline, ivec2(i, 0), 0).xy);
    if (dist < closestDist) {
      closestDist = dist;
      closest = i;
    }
  }

  return closest;
}

vec4 kernel() {
  vec2 worldPos = (kernelPosition - 0.5) * vec2(kernelSize) * vec2(GRID_CELL_SIZE) + centerPoint;
  int closest = closestSample(worldPos);
  vec2 closestPos = texelFetch(centerline, ivec2(closest, 0), 0).xy;
  vec2 prev, next;
  int prevIndex, nextIndex;

  if (closest == 0) {
    prevIndex = 0;
    nextIndex = 1;
    prev = closestPos;
    next = texelFetch(centerline, ivec2(1, 0), 0).xy;
  } else if (closest == numSamples - 1) {
    prevIndex = closest - 1;
    nextIndex = closest;
    prev = texelFetch(centerline, ivec2(prevIndex, 0), 0).xy;
    next = closestPos;
  } else {
    vec2 before = texelFetch(centerline, ivec2(closest - 1, 0), 0).xy;
    vec2 after = texelFetch(centerline, ivec2(closest + 1, 0), 0).xy;

    if (distance(before, worldPos) < distance(after, worldPos)) {
      prevIndex = closest - 1;
      nextIndex = closest;
      prev = before;
      next = closestPos;
    } else {
      prevIndex = closest;
      nextIndex = closest + 1;
      prev = closestPos;
      next = after;
    }
  }

  float dist = distance(prev, next);
  float progress = clamp(dot(worldPos - prev, next - prev) / dist / dist, 0.0, 1.0);
  //vec2 projectedPos = mix(prev, next, progress);
  vec2 projectedPos = (next - prev) * vec2(progress) + prev;

  float station = (float(prevIndex) + progress) * STATION_INTERVAL;
  float latitude = sign(determinant(mat2(next - prev, worldPos - prev))) * distance(worldPos, projectedPos);

  //return vec4(station, latitude, 0, 1);
  return clamp(vec4(station / 100.0, 1.0 - abs(latitude / (3.7 / 2.0)), 0, 1), 0.0, 1.0);
}

`;

const OBSTACLE_VERTEX_SHADER = `#version 300 es
uniform mat3 xform;
in vec2 position;

void main(void) {
  gl_Position = vec4((xform * vec3(position, 1)).xy, 0, 1);
}
`;

const SL_OBSTACLE_KERNEL = `

const float SL_GRID_CELL_SIZE = ${SL_OBSTACLE_GRID_CELL_SIZE};
const float XY_GRID_CELL_SIZE = ${GRID_CELL_SIZE};
const float STATION_INTERVAL = ${STATION_INTERVAL};

vec4 kernel() {
  vec2 sl = (kernelPosition - 0.5) * vec2(kernelSize) * vec2(SL_GRID_CELL_SIZE) + slCenterPoint;
  float centerlineCoord = sl.x / STATION_INTERVAL / float(numSamples);
  if (centerlineCoord < 0.0 || centerlineCoord > 1.0) return vec4(0);

  vec3 centerlineSample = texture(centerline, vec2(centerlineCoord, 0)).xyz;
  float perpindicular = centerlineSample.z + radians(90.0);
  vec2 xy = centerlineSample.xy + sl.yy * vec2(cos(perpindicular), sin(perpindicular));

  vec2 xyNormalized = (xy - xyCenterPoint) / vec2(textureSize(xyObstacleGrid, 0)) / vec2(XY_GRID_CELL_SIZE) + 0.5;
  return texture(xyObstacleGrid, xyNormalized);
}

`;

const SL_OBSTACLE_DILATION_KERNEL = `
// TODO: test performance of returning early if non-zero pixel found
vec4 kernel() {
  float val = 0.0;

  for (int d = 0; d <= lethalDilation; d++) {
    val = max(val, texture(slObstacleGrid, kernelPosition + delta * vec2(d)).r);
    val = max(val, texture(slObstacleGrid, kernelPosition + delta * vec2(-d)).r);
  }

  for (int d = lethalDilation + 1; d <= lethalDilation + costlyDilation; d++) {
    val = max(val, texture(slObstacleGrid, kernelPosition + delta * vec2(d)).r * 0.5);
    val = max(val, texture(slObstacleGrid, kernelPosition + delta * vec2(-d)).r * 0.5);
  }
  
  val = max(val, step(0.1, val) * 0.5);
  float obs = texture(slObstacleGrid, kernelPosition).g;

  return vec4(val, obs, 0, 1);
}

`;

/* Obstacle Grid Plan:
 *
 * 1. Rasterize triangles from polygonal obstacles into XY-space occupancy grid
 * 2. Convert occupancy grid to SL-space
 *    * Width is spatial horizon of the state lattice
 *    * Height is lane width
 *    * Resolution should be higher than XY-grid
 *    * Get XY position from centerline texture
 *    * Lookup XY in XY occupancy grid (nearest)
 * 3. Dilate SL-space grid using two passes (along station, then along latitude)
 *    * lethal area: half car size + 0.3m
 *    * high cost area: 1 meter
 * 4. Convert back to XY-space using XYSL map
 */

export default class PathPlanner {
  constructor() {
  }

  plan(lanePath, obstacles) {
    const centerlineRaw = lanePath.sampleStations(0, Math.ceil(SPATIAL_HORIZON / STATION_INTERVAL), STATION_INTERVAL);

    // Transform all centerline points into vehicle frame
    const vehicleXform = vehicleTransform(centerlineRaw[0]);
    const rot = centerlineRaw[0].rot;
    const centerline = centerlineRaw.map(c => { return { pos: c.pos.clone().applyMatrix3(vehicleXform), rot: c.rot - rot, curv: c.curv } });

    const centerlineBuffer = GPGPU.alloc(centerline.length, 3);
    const maxPoint = new THREE.Vector2(0, 0);
    const minPoint = new THREE.Vector2(0, 0);

    for (let i = 0; i < centerline.length; i++) {
      const sample = centerline[i];
      const pos = sample.pos;
      centerlineBuffer[i * 3 + 0] = pos.x;
      centerlineBuffer[i * 3 + 1] = pos.y;
      centerlineBuffer[i * 3 + 2] = sample.rot;

      maxPoint.max(pos);
      minPoint.min(pos);
    }

    const diff = maxPoint.clone().sub(minPoint);
    const centerPoint = minPoint.clone().add(maxPoint).divideScalar(2);
    const xyslMapWidth = Math.ceil((diff.x + GRID_MARGIN * 2) / GRID_CELL_SIZE);
    const xyslMapHeight = Math.ceil((diff.y + GRID_MARGIN * 2) / GRID_CELL_SIZE);

    const obstacleVertices = new Float32Array(Array.prototype.concat.apply([], obstacles.map(o => o.vertices)));
    const obstacleXform = obstacleTransform(vehicleXform, centerPoint, xyslMapWidth * GRID_CELL_SIZE, xyslMapHeight * GRID_CELL_SIZE);
    const slObstacleWidth = Math.ceil(SPATIAL_HORIZON / SL_OBSTACLE_GRID_CELL_SIZE);
    const slObstacleHeight = Math.ceil(24 / SL_OBSTACLE_GRID_CELL_SIZE);

    const gpgpuPrograms = [
      { // Obstacle triangles to XY-space obstacle grid
        kernel: `vec4 kernel() { return vec4(1, 1, 0, 1); }`,
        vertexShader: OBSTACLE_VERTEX_SHADER,
        width: xyslMapWidth,
        height: xyslMapHeight,
        output: { name: 'xyObstacleGrid' },
        draw: (gl, program) => {
          gl.clearColor(0, 0, 0, 1.0);
          gl.clear(gl.COLOR_BUFFER_BIT);

          gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
          gl.bufferData(gl.ARRAY_BUFFER, obstacleVertices, gl.STATIC_DRAW);
          gl.enableVertexAttribArray(program.positionLocation);
          gl.vertexAttribPointer(program.positionLocation, 2, gl.FLOAT, false, 0, 0);

          const xformLocation = gl.getUniformLocation(program.glProgram, 'xform');
          gl.uniformMatrix3fv(xformLocation, false, obstacleXform.elements);

          gl.drawArrays(gl.TRIANGLES, 0, obstacleVertices.length / 2);
        }
      },
      { // XY-space obstacle grid to SL-space obstacle grid
        kernel: SL_OBSTACLE_KERNEL,
        width: slObstacleWidth,
        height: slObstacleHeight,
        output: { name: 'slObstacleGrid' },
        globals: {
          xyObstacleGrid: { type: 'output' },
          slCenterPoint: [SPATIAL_HORIZON / 2, 0],
          xyCenterPoint: [centerPoint.x, centerPoint.y],
          numSamples: { type: 'int', value: centerline.length },
          centerline: {
            type: 'texture',
            height: 1,
            width: centerline.length,
            channels: 3,
            data: centerlineBuffer
          }
        }
      },
      { // XY-space obstacle grid S dilation
        kernel: SL_OBSTACLE_DILATION_KERNEL,
        width: slObstacleWidth,
        height: slObstacleHeight,
        output: { name: 'slObstacleGrid_sDilated' },
        globals: {
          slObstacleGrid: { type: 'output' },
          delta: [1 / slObstacleWidth, 0],
          lethalDilation: { type: 'int', value: Math.ceil(LETHAL_S_DILATION / SL_OBSTACLE_GRID_CELL_SIZE) },
          costlyDilation: { type: 'int', value: Math.ceil(COSTLY_S_DILATION / SL_OBSTACLE_GRID_CELL_SIZE) }
        }
      },
      { // XY-space obstacle grid L dilation
        kernel: SL_OBSTACLE_DILATION_KERNEL,
        width: slObstacleWidth,
        height: slObstacleHeight,
        globals: {
          slObstacleGrid: { type: 'output', name: 'slObstacleGrid_sDilated' },
          delta: [0, 1 / slObstacleHeight],
          lethalDilation: { type: 'int', value: Math.ceil(LETHAL_L_DILATION / SL_OBSTACLE_GRID_CELL_SIZE) },
          costlyDilation: { type: 'int', value: Math.ceil(COSTLY_L_DILATION / SL_OBSTACLE_GRID_CELL_SIZE) }
        }
      },
      { // XY-SL map
        kernel: XYSL_MAP_KERNEL,
        width: xyslMapWidth,
        height: xyslMapHeight,
        globals: {
          centerPoint: [centerPoint.x, centerPoint.y],
          numSamples: { type: 'int', value: centerline.length },
          centerline: {
            type: 'texture',
            height: 1,
            width: centerline.length,
            channels: 3,
            data: centerlineBuffer
          }
        }
      }
    ];

    const gpgpu = new GPGPU(gpgpuPrograms);
    return { xysl: gpgpu.run()[3], width: slObstacleWidth || xyslMapWidth, height: slObstacleHeight || xyslMapHeight, center: centerPoint.applyMatrix3((new THREE.Matrix3()).getInverse(vehicleXform)), rot: centerlineRaw[0].rot };
  }
}

PathPlanner.GRID_CELL_SIZE = GRID_CELL_SIZE;
PathPlanner.SL_OBSTACLE_GRID_CELL_SIZE = SL_OBSTACLE_GRID_CELL_SIZE;

function vehicleTransform({ pos, rot }) {
  const translate = new THREE.Matrix3();
  translate.set(
    1, 0, -pos.x,
    0, 1, -pos.y,
    0, 0, 1
  );

  const cosRot = Math.cos(rot);
  const sinRot = Math.sin(rot);

  const rotate = new THREE.Matrix3();
  rotate.set(
    cosRot, sinRot, 0,
    -sinRot, cosRot, 0,
    0, 0, 1
  );

  return rotate.multiply(translate);
}

function obstacleTransform(vehicleXform, centerPoint, width, height) {
  const translate = new THREE.Matrix3();
  translate.set(
    1, 0, -centerPoint.x,
    0, 1, -centerPoint.y,
    0, 0, 1
  );

  const scale = new THREE.Matrix3();
  scale.set(
    2 / width, 0, 0,
    0, 2 / height, 0,
    0, 0, 1
  );

  return scale.multiply(translate).multiply(vehicleXform);
}
