import DynamicObstacle from "../autonomy/DynamicObstacle.js";
import PathPlannerConfigEditor from "./PathPlannerConfigEditor.js";

export default class DynamicObstacleEditor {
  constructor() {
    this.editorDom = document.getElementById('editor-dynamic-obstacles-box');
    this.formsContainer = document.getElementById('editor-dynamic-obstacle-forms');
    this.statsDynamicObstacles = document.getElementById('editor-stats-dynamic-obstacles');

    document.getElementById('editor-add-dynamic-obstacle').addEventListener('click', this.addDynamicObstacle.bind(this));
  }

  enable() {
    this.editorDom.classList.remove('is-hidden');
  }

  disable() {
    this.editorDom.classList.add('is-hidden');
  }

  toJSON() {
    const forms = this.formsContainer.getElementsByTagName('form');
    const obstacles = [];

    for (let i = 0; i < forms.length; i++) {
      const formData = new FormData(forms[i]);
      const params = { parallel: false };

      for (const [k, v] of formData.entries())
        params[k] = v;

      let type = 0;
      if (params.type == 'cyclist')
        type = 1;
      else if (params.type == 'pedestrian')
        type = 2;

      obstacles.push({
        p: [params.sPos, params.lPos],
        v: [params.sVel, params.lVel],
        l: !!params.parallel ? 1 : 0,
        t: type
      });
    }

    return obstacles;
  }

  loadJSON(json) {
    this.clearDynamicObstacles();

    json.forEach(o => {
      const form = this.addDynamicObstacle();

      form['sPos'].value = o.p[0];
      form['lPos'].value = o.p[1];
      form['sVel'].value = o.v[0];
      form['lVel'].value = o.v[1];
      form['parallel'].checked = !!o.l;
      form['type'].selectedIndex = o.t;
    });
  }

  collectDynamicObstacles() {
    const forms = this.formsContainer.getElementsByTagName('form');
    const obstacles = [];

    for (let i = 0; i < forms.length; i++) {
      const formData = new FormData(forms[i]);
      const params = { parallel: false };

      for (const [k, v] of formData.entries())
        params[k] = v;

      const pos = new THREE.Vector2(Number(params.sPos) || 0, (Number(params.lPos) || 0) * PathPlannerConfigEditor.internalConfig.roadWidth / 2);
      const vel = new THREE.Vector2(Number(params.sVel) || 0, Number(params.lVel) || 0);
      const parallel = !!params.parallel;

      obstacles.push(new DynamicObstacle(params.type, pos, vel, parallel));
    }

    return obstacles;
  }

  addDynamicObstacle() {
    const index = this.formsContainer.getElementsByTagName('form').length + 1;
    const form = this.buildForm(index);

    this.formsContainer.appendChild(form);
    this.statsDynamicObstacles.textContent = this.formsContainer.getElementsByTagName('form').length;

    return form;
  }

  removeDynamicObstacle(form) {
    this.formsContainer.removeChild(form);
    this.reindexForms();
    this.statsDynamicObstacles.textContent = this.formsContainer.getElementsByTagName('form').length;
  }

  clearDynamicObstacles() {
    this.formsContainer.innerHTML = '';
    this.statsDynamicObstacles.textContent = 0;
  }

  reindexForms() {
    const forms = this.formsContainer.getElementsByTagName('form');

    for (let i = 0; i < forms.length; i++) {
      forms[i].getElementsByClassName('dynamic-obstacle-index')[0].textContent = i + 1;
    }
  }

  buildForm(index) {
    const html =
      `<form class="editor-dynamic-obstacle-form">
          <div class="columns is-gapless">
              <div class="column is-1">
                  <div class="field">
                      <div class="field-label is-normal is-size-7 has-text-grey-lighter has-text-weight-bold dynamic-obstacle-index">${index}</div>
                  </div>
              </div>
              <div class="column is-3">
                  <div class="field">
                      <div class="control">
                          <div class="select is-small">
                              <select name="type">
                                  <option value="vehicle">Vehicle</option>
                                  <option value="cyclist">Cyclist</option>
                                  <option value="pedestrian">Pedestrian</option>
                              </select>
                          </div>
                      </div>
                  </div>
              </div>
              <div class="column is-1">
                  <div class="field">
                      <div class="control has-text-centered">
                          <label class="checkbox">
                              <input type="checkbox" name="parallel" checked />&nbsp;
                          </label>
                      </div>
                  </div>
              </div>
              <div class="column is-3">
                  <div class="field has-addons editor-field-center">
                      <div class="control">
                          <input class="input is-small" type="text" name="sPos" style="width: 50px;" value="0" />
                      </div>
                      <div class="control">
                          <input class="input is-small" type="text" name="lPos" style="width: 50px;" value="0" />
                      </div>
                  </div>
              </div>
              <div class="column is-3">
                  <div class="field has-addons editor-field-center">
                      <div class="control">
                          <input class="input is-small" type="text" name="sVel" style="width: 50px;" value="0" />
                      </div>
                      <div class="control">
                          <input class="input is-small" type="text" name="lVel" style="width: 50px;" value="0" />
                      </div>
                  </div>
              </div>
              <div class="column is-1">
                  <div class="field has-text-right">
                      <div class="button is-small is-danger editor-remove-dynamic-obstacle" title="Remove Dynamic Obstacle">
                          <span class="icon is-small">
                              <i class="fas fa-lg fa-trash-alt"></i>
                          </span>
                      </div>
                  </div>
              </div>
          </div>
      </form>`;

    const template = document.createElement('template');
    template.innerHTML = html;
    const form = template.content.firstChild;

    form.getElementsByClassName('editor-remove-dynamic-obstacle')[0].addEventListener('click', e => this.removeDynamicObstacle(form));

    return form;
  }
}
