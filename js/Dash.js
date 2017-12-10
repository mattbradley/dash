import { Simulator } from "./Simulator.js";

const geolocation = [36.037351, -86.786561];
window.simulation = new Simulator(geolocation, document.getElementById('container'));
