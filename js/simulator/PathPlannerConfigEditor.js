import Car from "../physics/Car.js";

const defaultConfig = {
  spatialHorizon: 100, // meters
  centerlineStationInterval: 0.5, // meters

  lattice: {
    numStations: 10,
    numLatitudes: 11,
    stationConnectivity: 3,
    latitudeConnectivity: 5
  },

  xyGridCellSize: 0.1, // meters
  slGridCellSize: 0.05, // meters
  gridMargin: 10, // meters
  pathSamplingStep: 0.5, // meters

  cubicPathPenalty: 0.1,

  lethalDilationS: Car.HALF_CAR_LENGTH + 1, // meters
  hazardDilationS: 2, // meters
  lethalDilationL: Car.HALF_CAR_WIDTH + 0.25, //meters
  hazardDilationL: 0.5, // meters

  obstacleHazardCost: 1,

  laneWidth: 3.7, // meters
  laneShoulderCost: 2,
  laneShoulderLatitude: 3.7 / 2 - Car.HALF_CAR_WIDTH,
  laneCostSlope: 3, // cost / meter

  stationReachDiscount: 10,
  extraTimePenalty: 16,

  hysteresisDiscount: 1,

  speedLimit: 20, // m/s
  speedLimitPenalty: 2,

  hardAccelerationPenalty: 1,
  hardDecelerationPenalty: 2,

  lateralAccelerationLimit: 3, // m/s^2
  softLateralAccelerationPenalty: 1,
  linearLateralAccelerationPenalty: 0.1,

  accelerationChangePenalty: 0.5,

  dCurvatureMax: Car.MAX_STEER_SPEED / Car.WHEEL_BASE,

  rearAxleToCenter: -Car.REAR_AXLE_POS
};

const ignoreKeys = ['rearAxleToCenter', 'dCurvatureMax', 'lattice'];

export default class PathPlannerConfigEditor {
  constructor() {
    this.config = defaultConfig;

    this.showConfigBox = document.getElementById('show-config-box');
    this.configBox = document.getElementById('config-box-content');
    this.configForm = document.getElementById('config-form');

    this._setUpButtons();

    const keys = Object.keys(this.config).filter(k => !ignoreKeys.includes(k)).sort();
    
    for (const key of keys)
      this.configForm.appendChild(this._createConfigField(key, this.config[key]));
  }

  _setUpButtons() {
    document.getElementById('show-config-button').addEventListener('click', e => {
      this.showConfigBox.classList.add('is-hidden');
      this.configBox.classList.remove('is-hidden');
    });

    document.getElementById('hide-config-button').addEventListener('click', e => {
      this.showConfigBox.classList.remove('is-hidden');
      this.configBox.classList.add('is-hidden');
    });

    document.getElementById('save-config-button').addEventListener('click', this._saveConfigFields.bind(this));
  }

  _createConfigField(key, value) {
    const html =
      `<div class="field is-horizontal">
          <div class="field-label is-small" style="flex-grow: 100;">
              <label class="label has-text-grey-light" for="config-field-${key}">${key}</label>
          </div>
          <div class="field-body">
              <div class="field">
                  <div class="control" style="margin-right: 16px;">
                      <input id="config-field-${key}" name="${key}" class="input is-small" type="text" style="width: 60px" value="${value}" />
                  </div>
              </div>
          </div>
      </div>`;

    const template = document.createElement('template');
    template.innerHTML = html;
    return template.content.firstChild;
  }

  _saveConfigFields() {
    const formData = new FormData(this.configForm);

    for (const [k, v] of formData.entries())
      this.config[k] = Number.parseFloat(v);
  }
}
