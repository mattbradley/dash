export default class ManualController {
  constructor() {
    this.carKeys = { forward: false, backward: false, left: false, right: false, brake: false };

    document.addEventListener('keydown', event => {
      // ignore Command key ⌘
	  	if (event.metaKey)
		  	return;
      switch (event.key) {
        case 'w': case 'W': case 'ArrowUp': this.carKeys.forward = true; break;
        case 's': case 'S': case 'ArrowDown': this.carKeys.backward = true; break;
        case 'a': case 'A': case 'ArrowLeft': this.carKeys.left = true; break;
        case 'd': case 'D': case 'ArrowRight': this.carKeys.right = true; break;
        case ' ': this.carKeys.brake = true; break;
      }
    });

    document.addEventListener('keyup', event => {
      switch (event.key) {
        case 'w': case 'W': case 'ArrowUp': this.carKeys.forward = false; break;
        case 's': case 'S': case 'ArrowDown': this.carKeys.backward = false; break;
        case 'a': case 'A': case 'ArrowLeft': this.carKeys.left = false; break;
        case 'd': case 'D': case 'ArrowRight': this.carKeys.right = false; break;
        case ' ': this.carKeys.brake = false; break;
      }
    });
  }

  control() {
    let gas = 0;
    let brake = 0;
    let steer = 0;

    if (this.carKeys.forward) gas += 1;
    if (this.carKeys.backward) gas -= 1;
    if (this.carKeys.left) steer -= 1;
    if (this.carKeys.right) steer += 1;
    if (this.carKeys.brake) brake += 1;

    return { gas, brake, steer };
  }
}
