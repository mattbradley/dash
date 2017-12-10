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
  }

  update() {
    if (this.wheelDom) {
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
    }
  }
}
