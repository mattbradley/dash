// part of https://github.com/rc-dukes/dash fork of https://github.com/mattbradley/dash
/**
 * List / Manager of all simulation control modes
 */
export default class Modes {
  /**
   * construct me
   */
  constructor() {
    this.modes = {};
    this.currentMode=null;
  }

  /**
   * add a mode
   * @param name - the name of the mode
   * @param self - this of the callback
   * @param onChange - the function to call when the mode enabling is changed (if any)
   */
  add(name,self=null,onChange=null) {
    var mode = new Mode(this, name,self,onChange);
    this.modes[name] = mode;
    return mode;
  }

  /**
   * add a button click handler to all modes
   */
  addButtonClickHandler() {
    // add cameraButton to each Camera
    // for each Mode
    Object.entries(this.modes).forEach(([name, mode]) => {
      mode.modeButton = document.getElementById(`mode-${mode.name}`);
      mode.modeButton.addEventListener('click', () => this.changeMode(mode));
    });
  }

  /**
   * change the current / active mode to the given mode
   * @param newMode - the mode to activate
   */
  changeMode(newMode) {
    Object.entries(this.modes).forEach(([name, mode]) => {
      mode.enable(mode == newMode);
    });
    this.currentMode = newMode;
  }
}

/**
 * a named control mode for steering the simulated car e.g. manual, remote, autonmous
 */
export class Mode {
  /**
   * construct me
   * @param modes  - the list of modes i belong to
   * @param name - my name
   * @param onChange - the function to be called when the mode enabling is changed
   */
  constructor(modes,name,self,onChange) {
    this.mods=modes
    this.name=name;
    this.self=self;
    this.onChange=onChange;
  }

  enable(enabled) {
    const classes = this.modeButton.classList;
    if (enabled) {
      classes.remove('is-outlined');
      classes.add('is-selected');
    } else {
      classes.add('is-outlined');
      classes.remove('is-selected');
    }
    if (this.onChange && this.self)
      this.onChange(this.self,enabled)
  }

}
