import Car from "../physics/Car.js";

const MPS_TO_MPH = 2.23694;
const METERS_TO_FEET = 3.28084;

export default class Dashboard {
  constructor(car) {
    this.car = car;
    this.units = 'metric';

    if (document.readyState == 'complete') {
      this.fetchDomElements.call(this);
    } else {
      document.addEventListener('readystatechange', event => {
        if (event.target.readyState == 'complete')
          this.fetchDomElements.call(this);
      });
    }
  }

  fetchDomElements() {
    this.wheelDom = document.getElementById('wheel');
    this.wheelPieDom = document.getElementById('wheel-pie');
    this.wheelPieLeftDom = document.getElementById('wheel-pie-left');
    this.wheelPieRightDom = document.getElementById('wheel-pie-right');
    this.gearDom = document.getElementById('gear');
    this.gasDom = document.getElementById('gas');
    this.brakeDom = document.getElementById('brake');
    this.speedDom = document.getElementById('speed');
    this.stationDom = document.getElementById('station');
    this.latitudeDom = document.getElementById('latitude');
    this.planTimeDom = document.getElementById('plan-time');
    this.elapsedTimeDom = document.getElementById('elapsed-time');

    this.speedUnitsDom = document.getElementById('speed-units');
    this.stationUnitsDom = document.getElementById('station-units');
    this.latitudeUnitsDom = document.getElementById('latitude-units');

    [this.speedUnitsDom, this.stationUnitsDom, this.latitudeUnitsDom].forEach(el => {
      el.addEventListener('click', event => {
        this.toggleUnits();
      });
    });
  }

  toggleUnits() {
    let speedUnits;
    let distanceUnits;

    if (this.units == 'metric') {
      this.units = 'imperial';
      speedUnits = 'mph';
      distanceUnits = 'feet';
    } else {
      this.units = 'metric';
      speedUnits = 'm/s';
      distanceUnits = 'meters';
    }

    this.speedUnitsDom.textContent = speedUnits;
    this.stationUnitsDom.textContent = distanceUnits;
    this.latitudeUnitsDom.textContent = distanceUnits;
  }

  updatePlanTime(planTime) {
    if (!this.wheelDom) return;

    this.planTimeDom.textContent = planTime !== null ? (planTime * 1000).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—';
  }

  update(controls, speed, station, latitude, elapsedTime, planTime) {
    if (!this.wheelDom) return;

    const wheelTurn = Math.clamp(this.car.wheelAngle / Car.MAX_WHEEL_ANGLE * 0.95, -1, +1);

    this.wheelDom.style.transform = `rotate(${wheelTurn}turn)`;

    if (wheelTurn >= 0) {
      this.wheelPieRightDom.style.transform = `rotate(${wheelTurn}turn)`;

      if (wheelTurn <= 0.5) {
        this.wheelPieDom.style.clipPath = "inset(0 0 0 50%)";
        this.wheelPieLeftDom.style.transform = "rotate(0)";
      } else {
        this.wheelPieDom.style.clipPath = "inset(0 0 0 0)";
        this.wheelPieLeftDom.style.transform = "rotate(0.5turn)";
      }
    } else {
      this.wheelPieRightDom.style.transform = `rotate(${0.5 + wheelTurn}turn)`;

      if (wheelTurn >= -0.5) {
        this.wheelPieDom.style.clipPath = "inset(0 50% 0 0)";
        this.wheelPieLeftDom.style.transform = "rotate(0.5turn)";
      } else {
        this.wheelPieDom.style.clipPath = "inset(0 0 0 0)";
        this.wheelPieLeftDom.style.transform = "rotate(0)";
      }
    }

    this.gearDom.innerText = controls.gas < 0 ? 'R' : 'D';
    this.brakeDom.style.clipPath = `inset(50% 50% 0 ${50 - controls.brake * 25}%)`;
    this.gasDom.style.clipPath = `inset(50% ${50 - Math.abs(controls.gas) * 25}% 0 50%)`;

    if (this.units == 'imperial') {
      speed *= MPS_TO_MPH;
      station = station !== null ? station * METERS_TO_FEET : null;
      latitude = latitude !== null ? latitude * METERS_TO_FEET : null;
    }

    let latitudeText = latitude !== null ? latitude.toFixed(2) : '—';
    if (latitudeText == '-0.00') latitudeText = '0.00';

    this.speedDom.textContent = speed.toFixed(1);
    this.stationDom.textContent = station !== null ? station.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—';
    this.latitudeDom.textContent = latitudeText;
    this.updatePlanTime(planTime);

    let mins = Math.floor(elapsedTime / 60);
    let seconds = elapsedTime % 60;

    if (mins == 0) {
      this.elapsedTimeDom.textContent = seconds.toFixed(1);
    } else {
      if (seconds < 10)
        seconds = '0' + seconds.toFixed(1);
      else
        seconds = seconds.toFixed(1);

      this.elapsedTimeDom.textContent = `${mins}:${seconds}`;
    }
  }
}
