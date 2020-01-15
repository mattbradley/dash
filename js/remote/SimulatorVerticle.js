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
    this.remoteControl=new RemoteControl();
    simulatorVerticle=this;
    this.enabled=false;
  }

  /**
   * start the verticle and register the handlers
   */
  start() {
    if (!this.eb) {
      this.eb = new EventBus(this.busUrl);
      this.eb.onopen = function() {
        simulatorVerticle.eb.registerHandler(CALLSIGN_FLASH,simulatorVerticle.heartBeatHandler);
        simulatorVerticle.eb.registerHandler(CALLSIGN_BO,simulatorVerticle.carMessageHandler)
      };
    };
    this.enabled=true;
  }

  stop() {
    if (this.eb)
      this.eb.close();
    this.eb=null;
    this.enabled=false;
  }

  /**
   * handle a car message
   * @param err - potential errors
   * @param msg - the vert.x message
   */
  carMessageHandler(err,msg) {
    var carjo=msg.body;
    console.log(JSON.stringify(carjo));
    var sv=simulatorVerticle;
    if (carjo.position) {
      // the position can be between -100 and 100
      var pos=parseFloat(carjo.position);
      // we need a value between -1 and +1
      sv.remoteControl.steer=pos/100;
    }
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

export class RemoteControl {
  /**
   * @param gas
   * @param brake
   * @param steer
   */
  constructor(gas=0,brake=0,steer=0) {
    this.gas=0;
    this.brake=0;
    this.steer=0;
  }

}
