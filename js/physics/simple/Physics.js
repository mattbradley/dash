import Car from "./Car.js";

export default class Physics {
  constructor() {
    this.cars = [];
  }

  step(dt) {
    this.cars.forEach(c => c.step(dt));
  }

  createCar() {
    const newCar = new Car();
    this.cars.push(newCar);

    return newCar;
  }
};
