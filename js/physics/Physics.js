import Car from "./Car.js";

export default class Physics {
  constructor() {
    this.world = new Box2D.b2World(new Box2D.b2Vec2(0, 0));
  }

  step(dt) {
    this.world.Step(dt, 2, 2);
  }

  createCar() {
    return new Car(this.world);
  }
};
