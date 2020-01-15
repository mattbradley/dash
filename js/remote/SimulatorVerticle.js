// part of https://github.com/rc-dukes/dash fork of https://github.com/mattbradley/dash

const CALLSIGN_FLASH = "Velvet ears";
var simulatorVerticle = null;

/**
 * SimulatorVerticle to be used as remoteController
 */
export default class SimulatorVerticle {

  /**
   * construct me
   * @param busUrl
   */
  constructor(busUrl) {
    this.busUrl=busUrl;
    simulatorVerticle=this;
  }

  start() {
    this.eb = new EventBus(this.busUrl);
    this.eb.onopen = function() {
      simulatorVerticle.eb.registerHandler(CALLSIGN_FLASH,simulatorVerticle.messageHandler);
    };
  }

  stop() {

  }

  messageHandler(err,msg) {

  }

  stateColor() {
    var stateColor = "black";
    if (this.eb) {
      switch (this.eb.state) {
      case EventBus.CONNECTING:
        stateColor = "orange";
        break;
      case EventBus.OPEN:
        stateColor = "green";
        break;
      case EventBus.CLOSING:
        stateColor = "orange";
        break;
      case EventBus.CLOSED:
        stateColor = "red";
        break;
      }
    } else {
      stateColor = "violet";
    }
    return stateColor;
  }
}
