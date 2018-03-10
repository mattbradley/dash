export default class MovingAverage {
  constructor(maxSamples) {
    this.samples = new Array(maxSamples);
    this.numSamples = 0;
    this.nextIndex = 0;
    this.average = null;
  }

  addSample(sample) {
    this.samples[this.nextIndex++] = sample;
    this.nextIndex = this.nextIndex % this.samples.length;
    this.numSamples = Math.min(this.numSamples + 1, this.samples.length);

    const k = 2 / (this.numSamples + 1);
    let curr = this.nextIndex % this.numSamples;
    let newAverage = this.samples[curr];

    for (let i = 1; i < this.numSamples; i++) {
      curr = (curr + 1) % this.numSamples;
      newAverage = this.samples[curr] * k + newAverage * (1 - k);
    }

    this.average = newAverage;
  }
}
