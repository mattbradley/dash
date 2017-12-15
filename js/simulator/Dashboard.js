import Car from "../physics/Car.js";

export default class Dashboard {
  constructor(car) {
    this.car = car;

    document.addEventListener('DOMContentLoaded', this.fetchDomElements.bind(this));
  }

  fetchDomElements() {
    this.wheelDom = document.getElementById('wheel');
    this.wheelPieDom = document.getElementById('wheel-pie');
    this.wheelPieLeftDom = document.getElementById('wheel-pie-left');
    this.wheelPieRightDom = document.getElementById('wheel-pie-right');
    this.gearDom = document.getElementById('gear');
    this.gasDom = document.getElementById('gas');
    this.brakeDom = document.getElementById('brake');
  }

  update(controls) {
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
  }
}
