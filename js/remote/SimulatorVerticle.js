// part of https://github.com/rc-dukes/dash fork of https://github.com/mattbradley/dash

const CALLSIGN_FLASH = "Velvet ears"; // Watchdog
const CALLSIGN_BO = "Lost sheep Bo";  // Car
var simulatorVerticle = null;

/**
 * SimulatorVerticle to be used as remoteController
 */
export default class SimulatorVerticle {

  /**
   * construct me
   * @param busUrl
   * @param self
   * @param onHeartBeat
   */
  constructor(busUrl,self=null,onHeartBeat=null) {
    this.busUrl=busUrl;
    this.self=self;
    this.onHeartBeat=onHeartBeat;
    this.heartBeatCount=0;
    this.debugHeartBeat=true;
    simulatorVerticle=this;
  }

  start() {
    this.eb = new EventBus(this.busUrl);
    this.eb.onopen = function() {
      simulatorVerticle.eb.registerHandler(CALLSIGN_FLASH,simulatorVerticle.heartBeatHandler);
      simulatorVerticle.eb.registerHandler(CALLSIGN_BO,simulatorVerticle.carMessageHandler)
    };
  }

  stop() {

  }

  carMessageHandler(err,msg) {
    var jo=msg.body;
    console.log(JSON.stringify(jo));
  }

  /**
   * handle a heart beat message
   * @param err - potential errors
   * @param msg - the vert.x message
   */
  heartBeatHandler(err,msg) {
    var jo=msg.body;
    var sv=simulatorVerticle;
    if (sv.debugHeartBeat)
       console.log(JSON.stringify(jo));
    sv.heartBeatCount++;
    if (sv.onHeartBeat && sv.self) {
      sv.onHeartBeat(sv.self,sv.heartBeatCount);
    }
  }

  stateColor() {
    var stateColor = "white";
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
