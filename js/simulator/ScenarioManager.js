import { formatDate } from "../Helpers.js";
import EXAMPLES from "./examples.js";

const LOCAL_STORAGE_KEY = 'dash_Scenarios';

export default class ScenarioManager {
  constructor(editor) {
    this.editor = editor;
    this.modal = document.getElementById('scenarios-modal');

    document.getElementById('scenarios-modal-background').addEventListener('click', this._closeModal.bind(this));
    document.getElementById('scenarios-modal-close').addEventListener('click', this._closeModal.bind(this));

    this.examplesTab = document.getElementById('scenarios-modal-examples-tab');
    this.savedTab = document.getElementById('scenarios-modal-saved-tab');
    this.importTab = document.getElementById('scenarios-modal-import-tab');

    this.examplesTabButton = document.getElementById('scenarios-modal-examples-tab-button');
    this.savedTabButton = document.getElementById('scenarios-modal-saved-tab-button');
    this.importTabButton = document.getElementById('scenarios-modal-import-tab-button');
    this.examplesTabButton.addEventListener('click', e => this.switchTab(this.examplesTab));
    this.savedTabButton.addEventListener('click', e => this.switchTab(this.savedTab));
    this.importTabButton.addEventListener('click', e => this.switchTab(this.importTab));

    this.itemsContainer = document.getElementById('scenarios-modal-items');

    this.sortName = document.getElementById('scenarios-sort-name');
    this.sortName.addEventListener('click', e => this._buildScenarioItems('name'));
    this.sortSavedAt = document.getElementById('scenarios-sort-saved-at');
    this.sortSavedAt.addEventListener('click', e => this._buildScenarioItems('savedAt'));

    this.importBox = document.getElementById('scenario-import-box');
    this.importInfo = document.getElementById('scenario-import-info');

    this.importBox.addEventListener('input', this._importBoxChanged.bind(this));

    for (let i = 0; i < EXAMPLES.length; i++)
      document.getElementById(`example-${i}`).addEventListener('click', e => this._loadScenario(EXAMPLES[i]));
  }

  switchTab(tab) {
    this.examplesTab.classList.add('is-hidden')
    this.savedTab.classList.add('is-hidden')
    this.importTab.classList.add('is-hidden')
    this.examplesTabButton.classList.remove('is-active');
    this.savedTabButton.classList.remove('is-active');
    this.importTabButton.classList.remove('is-active');

    let button = this.savedTabButton;
    if (tab == this.examplesTab)
      button = this.examplesTabButton;
    else if (tab == this.importTab)
      button = this.importTabButton;

    tab.classList.remove('is-hidden');
    button.classList.add('is-active');

    if (tab == this.importTab)
      this.importBox.focus();
  }

  saveScenario(name, data, force = false) {
    const scenarios = this.fetchScenarios();
    let scenario = scenarios[name];
    const now = new Date();

    if (scenario) {
      if (!force) return [false, scenario.savedAt];

      scenario.data = data;
      scenario.savedAt = now;
    } else {
       scenario = {
        name: name,
        data: data,
        savedAt: now
      };
      
      scenarios[name] = scenario;
    }

    const json = JSON.stringify(scenarios);
    window.localStorage.setItem(LOCAL_STORAGE_KEY, json);

    return [true, scenario.savedAt];
  }

  fetchScenarios() {
    const scenarios = JSON.parse(window.localStorage.getItem(LOCAL_STORAGE_KEY)) || {};

    for (const k in scenarios)
      scenarios[k].savedAt = new Date(scenarios[k].savedAt);

    return scenarios;
  }

  showModal(onLoadScenario = null) {
    this.onLoadScenario = onLoadScenario;

    this.modal.classList.add('is-active');
    this.switchTab(this.savedTab);

    this._buildScenarioItems();
    this.itemsContainer.scrollTop = 0;
    
    this.importBox.value = '';
    this.importBox.dispatchEvent(new Event('input'));
  }

  _closeModal() {
    this.onLoadScenario = null;
    this.modal.classList.remove('is-active');
  }

  _buildScenarioItems(sort = 'savedAt') {
    this.itemsContainer.innerHTML = '';

    this.sortName.classList.remove('is-underlined');
    this.sortSavedAt.classList.remove('is-underlined');
    if (sort == 'name')
      this.sortName.classList.add('is-underlined');
    else if (sort == 'savedAt')
      this.sortSavedAt.classList.add('is-underlined');

    const scenarios = Object.values(this.fetchScenarios());

    if (scenarios.length == 0) {
      this._showEmptyMessage();
    } else {
      scenarios.sort((a, b) => {
        if (sort == 'savedAt') {
          if (a.savedAt < b.savedAt) return +1;
          else if (b.savedAt < a.savedAt) return -1;
        }

        const nameA = a.name.toLowerCase();
        const nameB = b.name.toLowerCase();

        if (nameA < nameB) return -1;
        if (nameB < nameA) return +1;
        return 0;
      });

      scenarios.forEach(s => this._addScenarioItem(s));
    }
  }

  _showEmptyMessage() {
    this.itemsContainer.innerHTML = "<i>You don't have any saved scenarios.</i>";
  }

  _addScenarioItem(scenario) {
    const html =
      `<div class="columns">
          <div class="column is-7 scenario-item-name scenario-item-load" title=""></div>
          <div class="column is-4 scenario-item-saved-at"></div>
          <div class="column is-1">
              <div class="field is-grouped is-pulled-right">
                  <p class="control" style="margin-right: 8px;">
                      <span class="button is-small is-danger scenario-item-delete" title="Delete">
                          <span class="icon is-small">
                              <i class="fas fa-lg fa-trash-alt"></i>
                          </span>
                      </span>
                  </p>
              </div>
          </div>
      </div>`;

    const template = document.createElement('template');
    template.innerHTML = html;
    const item = template.content.firstChild;

    const nameDom = item.getElementsByClassName('scenario-item-name')[0];
    nameDom.textContent = scenario.name;
    nameDom.title = scenario.name;

    item.getElementsByClassName('scenario-item-saved-at')[0].textContent = formatDate(scenario.savedAt);

    item.getElementsByClassName('scenario-item-load')[0].addEventListener('click', e => this._loadScenario(scenario));

    item.getElementsByClassName('scenario-item-delete')[0].addEventListener('click', e => {
      if (window.confirm(`Are you sure you want to delete the scenario "${scenario.name}"?`)) {
        this._deleteScenario(scenario);
        this.itemsContainer.removeChild(item);

        if (this.itemsContainer.children.length == 0)
          this._showEmptyMessage();
      }
    });

    this.itemsContainer.appendChild(item);
  }

  _loadScenario(scenario) {
    this.editor.loadJSON(scenario.data);
    this.editor.updateSavedInfo(scenario.name, formatDate(scenario.savedAt));

    if (this.onLoadScenario) this.onLoadScenario();

    this._closeModal();
  }

  _deleteScenario(scenario) {
    const scenarios = this.fetchScenarios();
    delete scenarios[scenario.name];

    const json = JSON.stringify(scenarios);
    window.localStorage.setItem(LOCAL_STORAGE_KEY, json);
  }

  _importBoxChanged() {
    this.importBox.classList.remove('is-danger');
    this.importInfo.classList.add('is-hidden');

    const encoded = this.importBox.value;

    if (encoded != '') {
      try {
        const json = JSON.parse(atob(this.importBox.value));

        if (json.s === undefined || json.d === undefined || json.p === undefined || json.p.length % 2 != 0)
          throw new Error();

        this.importInfo.innerHTML = `
          <div class="button is-small is-static has-text-grey-light is-paddingless" style="background: transparent; border: none;">
              Road Length:&nbsp;<b>${json.l.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</b>m
          </div>
          &nbsp;
          <div class="button is-small is-static has-text-grey-light is-paddingless" style="background: transparent; border: none;">
              Static Obstacles:&nbsp;<b>${json.s.length}</b>
          </div>
          &nbsp;
          <div class="button is-small is-static has-text-grey-light is-paddingless" style="background: transparent; border: none;">
              Dynamic Obstacles:&nbsp;<b>${json.d.length}</b>
          </div>
          <div class="button is-small is-success is-pulled-right scenario-import-button">
            <span class="icon">
              <i class="fas fa-check"></i>
            </span>
            <span>Import</span>
          </div>
        `;

        this.importInfo.getElementsByClassName('scenario-import-button')[0].addEventListener('click', e => this._loadScenario({ data: json }));
        this.importInfo.classList.remove('is-hidden');
      } catch (e) {
        this.importBox.classList.add('is-danger');
      }
    }
  }
}
