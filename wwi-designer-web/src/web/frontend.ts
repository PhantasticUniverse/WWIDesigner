/**
 * WWIDesigner Web Frontend
 *
 * Main application logic for the web interface.
 */

import type { Instrument, BorePoint, Hole } from "../models/instrument.ts";
import type { Tuning, Fingering } from "../models/tuning.ts";
import { parseInstrument, parseTuning } from "../utils/xml-converter.ts";

// Application State
interface AppState {
  activeTab: string;
  instruments: Map<string, Instrument>;
  tunings: Map<string, Tuning>;
  selectedInstrument: string | null;
  selectedTuning: string | null;
  preferences: {
    temperature: number;
    humidity: number;
    studyType: string;
    lengthUnit: "MM" | "IN";
  };
}

const state: AppState = {
  activeTab: "welcome",
  instruments: new Map(),
  tunings: new Map(),
  selectedInstrument: null,
  selectedTuning: null,
  preferences: {
    temperature: 20,
    humidity: 45,
    studyType: "whistle",
    lengthUnit: "MM",
  },
};

// DOM Helpers
const $ = <T extends HTMLElement>(selector: string): T | null =>
  document.querySelector(selector);
const $$ = <T extends HTMLElement>(selector: string): NodeListOf<T> =>
  document.querySelectorAll(selector);

// Logging
function log(message: string, level: "info" | "success" | "warning" | "error" = "info") {
  const console = $("#console-content");
  if (!console) return;

  const entry = document.createElement("div");
  entry.className = `log-entry ${level}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  console.appendChild(entry);
  console.scrollTop = console.scrollHeight;
}

// Tab Management
let tabCounter = 0;

function createTab(id: string, title: string, closable = true): string {
  const tabsBar = $("#tabs-bar");
  const tabPanels = $("#tab-panels");
  if (!tabsBar || !tabPanels) return id;

  // Check if tab already exists
  if ($(`[data-tab="${id}"]`)) {
    activateTab(id);
    return id;
  }

  // Create tab button
  const tab = document.createElement("div");
  tab.className = "tab";
  tab.dataset.tab = id;
  tab.innerHTML = `
    <span>${title}</span>
    ${closable ? '<span class="close-btn" data-close-tab>&times;</span>' : ""}
  `;
  tabsBar.appendChild(tab);

  // Create panel
  const panel = document.createElement("div");
  panel.className = "tab-panel";
  panel.id = `panel-${id}`;
  tabPanels.appendChild(panel);

  // Event listeners
  tab.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).dataset.closeTab !== undefined) {
      closeTab(id);
    } else {
      activateTab(id);
    }
  });

  activateTab(id);
  return id;
}

function activateTab(id: string) {
  $$(".tab").forEach((t) => t.classList.remove("active"));
  $$(".tab-panel").forEach((p) => p.classList.remove("active"));

  $(`[data-tab="${id}"]`)?.classList.add("active");
  $(`#panel-${id}`)?.classList.add("active");
  state.activeTab = id;
}

function closeTab(id: string) {
  const tab = $(`[data-tab="${id}"]`);
  const panel = $(`#panel-${id}`);
  tab?.remove();
  panel?.remove();

  // Activate another tab
  const remainingTab = $(".tab");
  if (remainingTab) {
    activateTab(remainingTab.dataset.tab || "welcome");
  }
}

// Instrument Editor
function createInstrumentEditor(instrument: Instrument, id: string): string {
  const tabId = createTab(id, instrument.name || "New Instrument");
  const panel = $(`#panel-${tabId}`);
  if (!panel) return tabId;

  panel.innerHTML = `
    <div class="editor-container">
      <div class="editor-header">
        <h2>Instrument Editor</h2>
        <div class="editor-actions">
          <button class="btn" data-action="save-instrument">Save</button>
          <button class="btn primary" data-action="calculate-tuning">Calculate Tuning</button>
        </div>
      </div>

      <!-- General Info -->
      <div class="editor-section">
        <h3>General</h3>
        <div class="form-row">
          <div class="form-group">
            <label>Name</label>
            <input type="text" id="inst-name-${tabId}" value="${instrument.name || ""}" />
          </div>
          <div class="form-group">
            <label>Length Unit</label>
            <select id="inst-unit-${tabId}">
              <option value="MM" ${instrument.lengthType === "MM" ? "selected" : ""}>Millimeters (mm)</option>
              <option value="IN" ${instrument.lengthType === "IN" ? "selected" : ""}>Inches (in)</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Mouthpiece -->
      <div class="editor-section">
        <h3>Mouthpiece</h3>
        ${renderMouthpieceEditor(instrument, tabId)}
      </div>

      <!-- Bore Profile -->
      <div class="editor-section">
        <h3>Bore Points</h3>
        <div class="bore-table-container">
          <table class="data-table bore-table" id="bore-table-${tabId}">
            <thead>
              <tr>
                <th>Name</th>
                <th>Position</th>
                <th>Diameter</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${(instrument.borePoint || [])
                .map(
                  (bp, i) => `
                <tr data-index="${i}">
                  <td><input type="text" value="${bp.name || ""}" data-field="name" style="width:60px" placeholder="optional" /></td>
                  <td><input type="number" step="0.01" value="${bp.borePosition}" data-field="borePosition" /></td>
                  <td><input type="number" step="0.01" value="${bp.boreDiameter}" data-field="boreDiameter" /></td>
                  <td><button class="btn-icon" data-remove-bore="${i}">&times;</button></td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
          <button class="btn-small add-row-btn" data-add-bore>+ Add Bore Point</button>
        </div>
      </div>

      <!-- Holes -->
      <div class="editor-section">
        <h3>Tone Holes</h3>
        <div class="hole-table-container">
          <table class="data-table hole-table" id="hole-table-${tabId}">
            <thead>
              <tr>
                <th>Name</th>
                <th>Position</th>
                <th>Spacing</th>
                <th>Diameter</th>
                <th>Height</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${(instrument.hole || [])
                .map((h, i, arr) => {
                  const prevPos = i > 0 ? arr[i - 1]?.position || 0 : 0;
                  const spacing = i > 0 ? (h.position - prevPos).toFixed(2) : "";
                  const holeName = h.name || `Hole ${arr.length - i}`;
                  return `
                <tr data-index="${i}">
                  <td><input type="text" value="${holeName}" data-field="name" style="width:70px" /></td>
                  <td><input type="number" step="0.01" value="${h.position}" data-field="position" /></td>
                  <td class="spacing-cell">${spacing}</td>
                  <td><input type="number" step="0.01" value="${h.diameter}" data-field="diameter" /></td>
                  <td><input type="number" step="0.01" value="${h.height || 3}" data-field="height" /></td>
                  <td><button class="btn-icon" data-remove-hole="${i}">&times;</button></td>
                </tr>
              `;
                })
                .join("")}
            </tbody>
          </table>
          <button class="btn-small add-row-btn" data-add-hole>+ Add Hole</button>
        </div>
      </div>

      <!-- Termination -->
      <div class="editor-section">
        <h3>Termination</h3>
        <div class="form-row">
          <div class="form-group">
            <label>Flange Diameter (0 = unflanged)</label>
            <input type="number" step="0.1" id="term-flange-${tabId}"
              value="${instrument.termination?.flangeDiameter || 0}" />
          </div>
        </div>
      </div>
    </div>
  `;

  // Bind editor events
  bindInstrumentEditorEvents(tabId, id);

  return tabId;
}

function renderMouthpieceEditor(instrument: Instrument, tabId: string): string {
  const mp = instrument.mouthpiece || {};
  const hasFipple = mp.fipple !== undefined;
  const hasEmbouchure = mp.embouchureHole !== undefined;
  // Determine which type is selected - default to fipple if neither is set
  const mpType = hasFipple ? "fipple" : hasEmbouchure ? "embouchure" : "fipple";

  return `
    <div class="form-row">
      <div class="form-group">
        <label>Splitting-edge Position</label>
        <input type="number" step="0.01" id="mp-position-${tabId}" value="${mp.position || 0}" />
      </div>
    </div>
    <div class="form-row mouthpiece-type-row">
      <label class="radio-label">
        <input type="radio" name="mp-type-${tabId}" value="fipple" ${mpType === "fipple" ? "checked" : ""} />
        Fipple Mouthpiece
      </label>
      <label class="radio-label">
        <input type="radio" name="mp-type-${tabId}" value="embouchure" ${mpType === "embouchure" ? "checked" : ""} />
        Embouchure Hole
      </label>
    </div>
    <div id="fipple-config-${tabId}" style="${mpType === "fipple" ? "" : "display:none"}">
      <div class="form-row">
        <div class="form-group">
          <label>TSH Length</label>
          <input type="number" step="0.01" id="fipple-length-${tabId}" value="${mp.fipple?.windowLength || ""}" />
        </div>
        <div class="form-group">
          <label>TSH Width</label>
          <input type="number" step="0.01" id="fipple-width-${tabId}" value="${mp.fipple?.windowWidth || ""}" />
        </div>
        <div class="form-group">
          <label>Window Height</label>
          <input type="number" step="0.01" id="fipple-height-${tabId}" value="${mp.fipple?.windowHeight || ""}" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Windway Length</label>
          <input type="number" step="0.01" id="windway-length-${tabId}" value="${mp.fipple?.windwayLength || ""}" />
        </div>
        <div class="form-group">
          <label>Flue Depth</label>
          <input type="number" step="0.001" id="windway-height-${tabId}" value="${mp.fipple?.windwayHeight || ""}" />
        </div>
        <div class="form-group">
          <label>Fipple Factor</label>
          <input type="number" step="0.00001" id="fipple-factor-${tabId}" value="${mp.fipple?.fippleFactor ?? ""}" />
        </div>
      </div>
    </div>
    <div id="embouchure-config-${tabId}" style="${mpType === "embouchure" ? "" : "display:none"}">
      <div class="form-row">
        <div class="form-group">
          <label>Length</label>
          <input type="number" step="0.1" id="emb-length-${tabId}" value="${mp.embouchureHole?.length || ""}" />
        </div>
        <div class="form-group">
          <label>Width</label>
          <input type="number" step="0.1" id="emb-width-${tabId}" value="${mp.embouchureHole?.width || ""}" />
        </div>
        <div class="form-group">
          <label>Height</label>
          <input type="number" step="0.1" id="emb-height-${tabId}" value="${mp.embouchureHole?.height || ""}" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Airstream Length</label>
          <input type="number" step="0.1" id="airstream-length-${tabId}" value="${mp.embouchureHole?.airstreamLength || ""}" />
        </div>
        <div class="form-group">
          <label>Flue Depth</label>
          <input type="number" step="0.001" id="emb-windway-height-${tabId}" value="${mp.embouchureHole?.windwayHeight || ""}" />
        </div>
      </div>
    </div>
  `;
}

function bindInstrumentEditorEvents(tabId: string, instrumentId: string) {
  const panel = $(`#panel-${tabId}`);
  if (!panel) return;

  // Add bore point
  panel.querySelector("[data-add-bore]")?.addEventListener("click", () => {
    const inst = state.instruments.get(instrumentId);
    if (!inst) return;
    const lastPos = inst.borePoint?.[inst.borePoint.length - 1]?.borePosition || 0;
    const lastDia = inst.borePoint?.[inst.borePoint.length - 1]?.boreDiameter || 16;
    inst.borePoint = inst.borePoint || [];
    inst.borePoint.push({ borePosition: lastPos + 50, boreDiameter: lastDia });
    createInstrumentEditor(inst, instrumentId);
  });

  // Remove bore point
  panel.querySelectorAll("[data-remove-bore]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt((btn as HTMLElement).dataset.removeBore || "0");
      const inst = state.instruments.get(instrumentId);
      if (!inst || !inst.borePoint) return;
      inst.borePoint.splice(idx, 1);
      createInstrumentEditor(inst, instrumentId);
    });
  });

  // Add hole
  panel.querySelector("[data-add-hole]")?.addEventListener("click", () => {
    const inst = state.instruments.get(instrumentId);
    if (!inst) return;
    const lastPos = inst.hole?.[inst.hole.length - 1]?.position || 200;
    inst.hole = inst.hole || [];
    inst.hole.push({ position: lastPos + 20, diameter: 8, height: 4 });
    createInstrumentEditor(inst, instrumentId);
  });

  // Remove hole
  panel.querySelectorAll("[data-remove-hole]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt((btn as HTMLElement).dataset.removeHole || "0");
      const inst = state.instruments.get(instrumentId);
      if (!inst || !inst.hole) return;
      inst.hole.splice(idx, 1);
      createInstrumentEditor(inst, instrumentId);
    });
  });

  // Mouthpiece type change - toggle config visibility
  const mpTypeRadios = panel.querySelectorAll<HTMLInputElement>(`input[name="mp-type-${tabId}"]`);
  mpTypeRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      const fippleConfig = $(`#fipple-config-${tabId}`);
      const embouchureConfig = $(`#embouchure-config-${tabId}`);

      if (radio.value === "fipple" && radio.checked) {
        if (fippleConfig) fippleConfig.style.display = "";
        if (embouchureConfig) embouchureConfig.style.display = "none";
      } else if (radio.value === "embouchure" && radio.checked) {
        if (fippleConfig) fippleConfig.style.display = "none";
        if (embouchureConfig) embouchureConfig.style.display = "";
      }
      updateInstrumentFromEditor(tabId, instrumentId);
    });
  });

  // Mouthpiece input changes
  panel.querySelectorAll('[id^="mp-"], [id^="fipple-"], [id^="windway-"], [id^="emb-"], [id^="airstream-"]').forEach((input) => {
    input.addEventListener("change", () => {
      updateInstrumentFromEditor(tabId, instrumentId);
    });
  });

  // Bore input changes
  panel.querySelectorAll(".bore-table input").forEach((input) => {
    input.addEventListener("change", () => {
      updateInstrumentFromEditor(tabId, instrumentId);
    });
  });

  // Hole input changes
  panel.querySelectorAll(".hole-table input").forEach((input) => {
    input.addEventListener("change", () => {
      updateInstrumentFromEditor(tabId, instrumentId);
    });
  });

  // Length unit change
  const lengthUnitSelect = $<HTMLSelectElement>(`#length-unit-${tabId}`);
  lengthUnitSelect?.addEventListener("change", () => {
    updateInstrumentFromEditor(tabId, instrumentId);
  });

  // Termination changes
  const flangeInput = $<HTMLInputElement>(`#flange-diameter-${tabId}`);
  flangeInput?.addEventListener("change", () => {
    updateInstrumentFromEditor(tabId, instrumentId);
  });

  // Action buttons
  panel.querySelector("[data-action='calculate-tuning']")?.addEventListener("click", () => {
    if (state.selectedTuning) {
      calculateTuning(instrumentId, state.selectedTuning);
    } else {
      log("Please select a tuning first", "warning");
    }
  });

  panel.querySelector("[data-action='save-instrument']")?.addEventListener("click", () => {
    updateInstrumentFromEditor(tabId, instrumentId);
    log(`Saved instrument: ${state.instruments.get(instrumentId)?.name}`, "success");
  });
}

function updateInstrumentFromEditor(tabId: string, instrumentId: string) {
  const inst = state.instruments.get(instrumentId);
  if (!inst) return;

  // Update name
  const nameInput = $<HTMLInputElement>(`#inst-name-${tabId}`);
  if (nameInput) inst.name = nameInput.value;

  // Update length unit
  const lengthUnitSelect = $<HTMLSelectElement>(`#length-unit-${tabId}`);
  if (lengthUnitSelect) inst.lengthType = lengthUnitSelect.value as "MM" | "IN";

  // Update mouthpiece
  const mpPositionInput = $<HTMLInputElement>(`#mp-position-${tabId}`);
  if (mpPositionInput) inst.mouthpiece.position = parseFloat(mpPositionInput.value) || 0;

  // Get selected mouthpiece type from radio buttons
  const mpTypeRadio = $<HTMLInputElement>(`input[name="mp-type-${tabId}"]:checked`);
  const mpType = mpTypeRadio?.value || "fipple";

  if (mpType === "fipple") {
    // Read all fipple values
    const windowLengthVal = $<HTMLInputElement>(`#fipple-length-${tabId}`)?.value;
    const windowWidthVal = $<HTMLInputElement>(`#fipple-width-${tabId}`)?.value;
    const windowHeightVal = $<HTMLInputElement>(`#fipple-height-${tabId}`)?.value;
    const windwayLengthVal = $<HTMLInputElement>(`#windway-length-${tabId}`)?.value;
    const windwayHeightVal = $<HTMLInputElement>(`#windway-height-${tabId}`)?.value;
    const fippleFactorVal = $<HTMLInputElement>(`#fipple-factor-${tabId}`)?.value;

    inst.mouthpiece.fipple = {
      windowLength: windowLengthVal ? parseFloat(windowLengthVal) : undefined,
      windowWidth: windowWidthVal ? parseFloat(windowWidthVal) : undefined,
      windowHeight: windowHeightVal ? parseFloat(windowHeightVal) : undefined,
      windwayLength: windwayLengthVal ? parseFloat(windwayLengthVal) : undefined,
      windwayHeight: windwayHeightVal ? parseFloat(windwayHeightVal) : undefined,
      fippleFactor: fippleFactorVal ? parseFloat(fippleFactorVal) : undefined,
    };

    delete inst.mouthpiece.embouchureHole;
  } else if (mpType === "embouchure") {
    const lengthVal = $<HTMLInputElement>(`#emb-length-${tabId}`)?.value;
    const widthVal = $<HTMLInputElement>(`#emb-width-${tabId}`)?.value;
    const heightVal = $<HTMLInputElement>(`#emb-height-${tabId}`)?.value;
    const airstreamLengthVal = $<HTMLInputElement>(`#airstream-length-${tabId}`)?.value;
    const embWindwayHeightVal = $<HTMLInputElement>(`#emb-windway-height-${tabId}`)?.value;

    inst.mouthpiece.embouchureHole = {
      length: lengthVal ? parseFloat(lengthVal) : undefined,
      width: widthVal ? parseFloat(widthVal) : undefined,
      height: heightVal ? parseFloat(heightVal) : undefined,
      airstreamLength: airstreamLengthVal ? parseFloat(airstreamLengthVal) : undefined,
      windwayHeight: embWindwayHeightVal ? parseFloat(embWindwayHeightVal) : undefined,
    };

    delete inst.mouthpiece.fipple;
  }

  // Update bore points
  const boreTable = $(`#bore-table-${tabId}`);
  if (boreTable) {
    inst.borePoint = [];
    boreTable.querySelectorAll("tbody tr").forEach((row) => {
      const nameInput = row.querySelector<HTMLInputElement>('[data-field="name"]');
      const posInput = row.querySelector<HTMLInputElement>('[data-field="borePosition"]');
      const diaInput = row.querySelector<HTMLInputElement>('[data-field="boreDiameter"]');
      if (posInput && diaInput) {
        inst.borePoint!.push({
          name: nameInput?.value || undefined,
          borePosition: parseFloat(posInput.value),
          boreDiameter: parseFloat(diaInput.value),
        });
      }
    });
  }

  // Update holes
  const holeTable = $(`#hole-table-${tabId}`);
  if (holeTable) {
    inst.hole = [];
    holeTable.querySelectorAll("tbody tr").forEach((row) => {
      const nameInput = row.querySelector<HTMLInputElement>('[data-field="name"]');
      const posInput = row.querySelector<HTMLInputElement>('[data-field="position"]');
      const diaInput = row.querySelector<HTMLInputElement>('[data-field="diameter"]');
      const heightInput = row.querySelector<HTMLInputElement>('[data-field="height"]');
      if (posInput && diaInput && heightInput) {
        inst.hole!.push({
          name: nameInput?.value || undefined,
          position: parseFloat(posInput.value),
          diameter: parseFloat(diaInput.value),
          height: parseFloat(heightInput.value),
        });
      }
    });
  }

  // Update termination
  const flangeInput = $<HTMLInputElement>(`#flange-diameter-${tabId}`);
  if (flangeInput) inst.termination.flangeDiameter = parseFloat(flangeInput.value) || 0;
}

// Tuning Editor
function createTuningEditor(tuning: Tuning, id: string): string {
  const tabId = createTab(id, tuning.name || "New Tuning");
  const panel = $(`#panel-${tabId}`);
  if (!panel) return tabId;

  const numHoles = tuning.numberOfHoles || 6;

  panel.innerHTML = `
    <div class="editor-container">
      <div class="editor-header">
        <h2>Tuning Editor</h2>
        <div class="editor-actions">
          <button class="btn" data-action="save-tuning">Save</button>
        </div>
      </div>

      <!-- General Info -->
      <div class="editor-section">
        <div class="form-row">
          <div class="form-group" style="flex:2">
            <label>Name</label>
            <input type="text" id="tuning-name-${tabId}" value="${tuning.name || ""}" />
          </div>
          <div class="form-group">
            <label>Number of Holes</label>
            <input type="number" id="tuning-holes-${tabId}" value="${numHoles}" min="1" max="20" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group" style="flex:1">
            <label>Description</label>
            <textarea id="tuning-comment-${tabId}" rows="2" style="width:100%;resize:vertical">${tuning.comment || ""}</textarea>
          </div>
        </div>
      </div>

      <!-- Fingerings -->
      <div class="editor-section">
        <h3>Fingering List</h3>
        <div class="fingering-table-container">
          <table class="data-table fingering-table" id="fingering-table-${tabId}">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Frequency</th>
                <th>Fingering</th>
                <th>Weight</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${(tuning.fingering || [])
                .map(
                  (f, i) => `
                <tr data-index="${i}">
                  <td><input type="text" value="${f.note?.name || ""}" data-field="noteName" style="width:80px" /></td>
                  <td><input type="number" step="0.0001" value="${f.note?.frequency || ""}" data-field="frequency" style="width:90px" /></td>
                  <td>
                    <div class="fingering-pattern" data-fingering="${i}">
                      ${renderFingeringPattern(f.openHole, numHoles, i)}
                    </div>
                  </td>
                  <td><input type="number" step="0.1" value="${f.optimizationWeight ?? 1}" data-field="weight" style="width:50px" /></td>
                  <td><button class="btn-icon" data-remove-fingering="${i}">&times;</button></td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
          <button class="btn-small add-row-btn" data-add-fingering>+ Add Fingering</button>
        </div>
      </div>
    </div>
  `;

  // Bind events
  bindTuningEditorEvents(tabId, id, numHoles);

  return tabId;
}

function renderFingeringPattern(openHole: boolean[] | undefined, numHoles: number, fingeringIdx: number): string {
  const holes = openHole || new Array(numHoles).fill(false);
  return holes
    .map(
      (open, i) =>
        `<div class="fingering-hole ${open ? "open" : "closed"}"
          data-hole="${i}" data-fingering-idx="${fingeringIdx}"
          title="Hole ${i + 1}: ${open ? "Open" : "Closed"}"></div>`
    )
    .join("");
}

function bindTuningEditorEvents(tabId: string, tuningId: string, numHoles: number) {
  const panel = $(`#panel-${tabId}`);
  if (!panel) return;

  // Fingering hole clicks
  panel.querySelectorAll(".fingering-hole").forEach((hole) => {
    hole.addEventListener("click", () => {
      const el = hole as HTMLElement;
      const fingeringIdx = parseInt(el.dataset.fingeringIdx || "0");
      const holeIdx = parseInt(el.dataset.hole || "0");
      const tuning = state.tunings.get(tuningId);
      if (!tuning || !tuning.fingering) return;

      const fingering = tuning.fingering[fingeringIdx];
      if (fingering && fingering.openHole) {
        fingering.openHole[holeIdx] = !fingering.openHole[holeIdx];
        el.classList.toggle("open");
        el.classList.toggle("closed");
        el.title = `Hole ${holeIdx + 1}: ${fingering.openHole[holeIdx] ? "Open" : "Closed"}`;
      }
    });
  });

  // Add fingering
  panel.querySelector("[data-add-fingering]")?.addEventListener("click", () => {
    const tuning = state.tunings.get(tuningId);
    if (!tuning) return;
    tuning.fingering = tuning.fingering || [];
    tuning.fingering.push({
      note: { name: "", frequency: undefined },
      openHole: new Array(numHoles).fill(false),
      optimizationWeight: 1,
    });
    createTuningEditor(tuning, tuningId);
  });

  // Remove fingering
  panel.querySelectorAll("[data-remove-fingering]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt((btn as HTMLElement).dataset.removeFingering || "0");
      const tuning = state.tunings.get(tuningId);
      if (!tuning || !tuning.fingering) return;
      tuning.fingering.splice(idx, 1);
      createTuningEditor(tuning, tuningId);
    });
  });

  // Input changes
  panel.querySelectorAll(".fingering-table input").forEach((input) => {
    input.addEventListener("change", () => {
      updateTuningFromEditor(tabId, tuningId);
    });
  });

  panel.querySelector("[data-action='save-tuning']")?.addEventListener("click", () => {
    updateTuningFromEditor(tabId, tuningId);
    log(`Saved tuning: ${state.tunings.get(tuningId)?.name}`, "success");
  });
}

function updateTuningFromEditor(tabId: string, tuningId: string) {
  const tuning = state.tunings.get(tuningId);
  if (!tuning) return;

  const nameInput = $<HTMLInputElement>(`#tuning-name-${tabId}`);
  if (nameInput) tuning.name = nameInput.value;

  const holesInput = $<HTMLInputElement>(`#tuning-holes-${tabId}`);
  if (holesInput) tuning.numberOfHoles = parseInt(holesInput.value);

  const commentInput = $<HTMLTextAreaElement>(`#tuning-comment-${tabId}`);
  if (commentInput) tuning.comment = commentInput.value;

  const fingeringTable = $(`#fingering-table-${tabId}`);
  if (fingeringTable) {
    fingeringTable.querySelectorAll("tbody tr").forEach((row, i) => {
      if (!tuning.fingering || !tuning.fingering[i]) return;
      const fingering = tuning.fingering[i];
      // Ensure note exists
      if (!fingering.note) {
        fingering.note = { name: "", frequency: undefined };
      }
      const nameInput = row.querySelector<HTMLInputElement>('[data-field="noteName"]');
      const freqInput = row.querySelector<HTMLInputElement>('[data-field="frequency"]');
      const weightInput = row.querySelector<HTMLInputElement>('[data-field="weight"]');
      if (nameInput) fingering.note.name = nameInput.value;
      if (freqInput) fingering.note.frequency = parseFloat(freqInput.value) || undefined;
      if (weightInput) fingering.optimizationWeight = parseFloat(weightInput.value) || 1;
    });
  }
}

// Tuning Results
function showTuningResults(results: any[], instrumentName: string, tuningName: string) {
  const tabId = createTab(`results-${Date.now()}`, "Tuning Results");
  const panel = $(`#panel-${tabId}`);
  if (!panel) return;

  const totalDeviation = results.reduce((sum, r) => sum + Math.abs(r.deviationCents || 0), 0);
  const avgDeviation = totalDeviation / results.length;

  panel.innerHTML = `
    <div class="results-container">
      <h2>Tuning Analysis</h2>
      <p><strong>Instrument:</strong> ${instrumentName} | <strong>Tuning:</strong> ${tuningName}</p>
      <p><strong>Average Deviation:</strong> ${avgDeviation.toFixed(1)} cents</p>

      <table class="data-table results-table">
        <thead>
          <tr>
            <th>Note</th>
            <th>Target (Hz)</th>
            <th>Predicted (Hz)</th>
            <th>Deviation (cents)</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${results
            .map((r) => {
              const dev = r.deviationCents || 0;
              const devClass =
                Math.abs(dev) < 5
                  ? "deviation-good"
                  : dev > 0
                    ? "deviation-positive"
                    : "deviation-negative";
              const status = Math.abs(dev) < 5 ? "Good" : Math.abs(dev) < 15 ? "Fair" : "Poor";
              return `
              <tr>
                <td>${r.note}</td>
                <td>${r.targetFrequency?.toFixed(1) || "-"}</td>
                <td>${r.predictedFrequency?.toFixed(1) || "-"}</td>
                <td class="${devClass}">${dev.toFixed(1)}</td>
                <td>${status}</td>
              </tr>
            `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

// Instrument Sketch
function showInstrumentSketch(instrument: Instrument) {
  const tabId = createTab(`sketch-${Date.now()}`, "Instrument Sketch");
  const panel = $(`#panel-${tabId}`);
  if (!panel) return;

  panel.innerHTML = `
    <div class="sketch-container">
      <h2>Instrument Sketch: ${instrument.name || "Untitled"}</h2>
      <canvas id="sketch-canvas-${tabId}" class="sketch-canvas"></canvas>
      <div class="sketch-legend">
        <span>Bore profile with tone holes</span>
      </div>
    </div>
  `;

  // Draw instrument
  requestAnimationFrame(() => drawInstrument(instrument, `sketch-canvas-${tabId}`));
}

function drawInstrument(instrument: Instrument, canvasId: string) {
  const canvas = $<HTMLCanvasElement>(`#${canvasId}`);
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Set canvas size
  const container = canvas.parentElement;
  canvas.width = container?.clientWidth || 800;
  canvas.height = 400;

  const width = canvas.width;
  const height = canvas.height;
  const padding = 40;

  // Clear
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const borePoints = instrument.borePoint || [];
  const holes = instrument.hole || [];

  if (borePoints.length < 2) {
    ctx.fillStyle = "#666";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Insufficient bore data", width / 2, height / 2);
    return;
  }

  // Find scale
  const minPos = Math.min(...borePoints.map((p) => p.borePosition));
  const maxPos = Math.max(...borePoints.map((p) => p.borePosition));
  const maxDia = Math.max(...borePoints.map((p) => p.boreDiameter));

  const lengthScale = (width - 2 * padding) / (maxPos - minPos || 1);
  const diaScale = (height - 2 * padding) / (maxDia * 2);
  const scale = Math.min(lengthScale, diaScale);

  const centerY = height / 2;

  // Helper to convert position to x coordinate
  const posToX = (pos: number) => padding + (pos - minPos) * scale;
  const diaToY = (dia: number) => (dia / 2) * scale;

  // Draw bore profile (top and bottom)
  ctx.beginPath();
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 2;

  // Top profile
  ctx.moveTo(posToX(borePoints[0].borePosition), centerY - diaToY(borePoints[0].boreDiameter));
  for (const bp of borePoints) {
    ctx.lineTo(posToX(bp.borePosition), centerY - diaToY(bp.boreDiameter));
  }

  // Connect to bottom
  const lastBp = borePoints[borePoints.length - 1];
  ctx.lineTo(posToX(lastBp.borePosition), centerY + diaToY(lastBp.boreDiameter));

  // Bottom profile (reverse)
  for (let i = borePoints.length - 1; i >= 0; i--) {
    const bp = borePoints[i];
    ctx.lineTo(posToX(bp.borePosition), centerY + diaToY(bp.boreDiameter));
  }

  ctx.closePath();
  ctx.fillStyle = "#e8d5b0";
  ctx.fill();
  ctx.stroke();

  // Draw holes
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1.5;

  for (const hole of holes) {
    const x = posToX(hole.position);
    const holeRadius = (hole.diameter / 2) * scale;

    // Draw hole on top
    ctx.beginPath();
    ctx.arc(x, centerY - diaToY(getBoreDiameterAtPosition(borePoints, hole.position)), holeRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Draw position markers
  ctx.fillStyle = "#666";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";

  // Bore point markers
  for (const bp of borePoints) {
    const x = posToX(bp.borePosition);
    ctx.fillText(`${bp.borePosition}`, x, height - 10);
  }

  // Draw mouthpiece
  drawMouthpiece(ctx, instrument, posToX, diaToY, centerY, scale);

  // Title
  ctx.fillStyle = "#333";
  ctx.font = "14px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`Length: ${maxPos - minPos} mm`, padding, 20);
  ctx.fillText(`Holes: ${holes.length}`, padding + 150, 20);
}

function drawMouthpiece(
  ctx: CanvasRenderingContext2D,
  instrument: Instrument,
  posToX: (pos: number) => number,
  diaToY: (dia: number) => number,
  centerY: number,
  scale: number
) {
  const mouthpiece = instrument.mouthpiece;
  if (!mouthpiece) return;

  const mpPos = mouthpiece.position;

  // Draw fipple window as a rectangle
  if (mouthpiece.fipple) {
    const fipple = mouthpiece.fipple;
    const windowLength = fipple.windowLength || 0;
    const windowWidth = fipple.windowWidth || 0;

    if (windowLength > 0 && windowWidth > 0) {
      // Window rectangle (solid)
      const windowLeft = posToX(mpPos - windowLength);
      const windowRight = posToX(mpPos);
      const halfWidth = (windowWidth / 2) * scale;

      ctx.beginPath();
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 2;
      ctx.moveTo(windowRight, centerY - halfWidth);
      ctx.lineTo(windowRight, centerY + halfWidth);
      ctx.lineTo(windowLeft, centerY + halfWidth);
      ctx.lineTo(windowLeft, centerY - halfWidth);
      ctx.closePath();
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.stroke();

      // Windway rectangle (dashed) if present
      if (fipple.windwayLength && fipple.windwayLength > 0) {
        const windwayExit = mpPos - windowLength;
        const windwayLeft = posToX(windwayExit - fipple.windwayLength);
        const windwayRight = posToX(windwayExit);

        ctx.beginPath();
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 2]);
        ctx.moveTo(windwayLeft, centerY - halfWidth);
        ctx.lineTo(windwayRight, centerY - halfWidth);
        ctx.lineTo(windwayRight, centerY + halfWidth);
        ctx.lineTo(windwayLeft, centerY + halfWidth);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  // Draw embouchure hole as an oval
  if (mouthpiece.embouchureHole) {
    const emb = mouthpiece.embouchureHole;
    const embLength = emb.length || 0;
    const embWidth = emb.width || 0;

    if (embLength > 0 && embWidth > 0) {
      const cx = posToX(mpPos);
      const radiusX = (embLength / 2) * scale;
      const radiusY = (embWidth / 2) * scale;

      ctx.beginPath();
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 1.5;
      ctx.ellipse(cx, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.stroke();
    }
  }
}

function getBoreDiameterAtPosition(borePoints: BorePoint[], position: number): number {
  if (borePoints.length === 0) return 16;
  if (borePoints.length === 1) return borePoints[0].boreDiameter;

  // Find surrounding bore points
  let left = borePoints[0];
  let right = borePoints[borePoints.length - 1];

  for (let i = 0; i < borePoints.length - 1; i++) {
    if (borePoints[i].borePosition <= position && borePoints[i + 1].borePosition >= position) {
      left = borePoints[i];
      right = borePoints[i + 1];
      break;
    }
  }

  // Interpolate
  const t = (position - left.borePosition) / (right.borePosition - left.borePosition || 1);
  return left.boreDiameter + t * (right.boreDiameter - left.boreDiameter);
}

// API Functions
async function calculateTuning(instrumentId: string, tuningId: string) {
  const instrument = state.instruments.get(instrumentId);
  const tuning = state.tunings.get(tuningId);

  if (!instrument || !tuning) {
    log("Missing instrument or tuning selection", "error");
    return;
  }

  log(`Calculating tuning for ${instrument.name}...`, "info");

  try {
    const response = await fetch("/api/calculate-tuning", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instrument,
        tuning,
        temperature: state.preferences.temperature,
        humidity: state.preferences.humidity,
      }),
    });

    const data = await response.json();

    if (data.error) {
      log(`Error: ${data.error}`, "error");
      return;
    }

    log(`Tuning calculated successfully`, "success");
    showTuningResults(data.results, instrument.name || "Untitled", tuning.name || "Untitled");
  } catch (error) {
    log(`Failed to calculate tuning: ${error}`, "error");
  }
}

async function optimizeInstrument(instrumentId: string, tuningId: string, type: string = "positions") {
  const instrument = state.instruments.get(instrumentId);
  const tuning = state.tunings.get(tuningId);

  if (!instrument || !tuning) {
    log("Missing instrument or tuning selection", "error");
    return;
  }

  log(`Optimizing instrument (${type})...`, "info");

  try {
    const response = await fetch("/api/optimize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instrument,
        tuning,
        optimizationType: type,
        temperature: state.preferences.temperature,
        humidity: state.preferences.humidity,
      }),
    });

    const data = await response.json();

    if (data.error) {
      log(`Error: ${data.error}`, "error");
      return;
    }

    log(
      `Optimization complete. Error reduced from ${data.initialError.toFixed(2)} to ${data.finalError.toFixed(2)}`,
      "success"
    );

    // Create new instrument with optimized geometry
    const optimizedId = `optimized-${Date.now()}`;
    const optimizedInstrument = {
      ...data.optimizedInstrument,
      name: `${instrument.name} (Optimized)`,
    };
    state.instruments.set(optimizedId, optimizedInstrument);
    updateSidebar();
    createInstrumentEditor(optimizedInstrument, optimizedId);
  } catch (error) {
    log(`Failed to optimize: ${error}`, "error");
  }
}

// Sample Data
function loadSampleData() {
  // Sample whistle
  const sampleWhistle: Instrument = {
    name: "Sample D Whistle",
    lengthType: "MM",
    mouthpiece: {
      position: 0,
      fipple: {
        windowWidth: 10,
        windowLength: 8,
        windowHeight: 3,
      },
    },
    borePoint: [
      { borePosition: 0, boreDiameter: 14 },
      { borePosition: 300, boreDiameter: 14 },
    ],
    hole: [
      { position: 148, diameter: 6, height: 3.5 },
      { position: 168, diameter: 6, height: 3.5 },
      { position: 188, diameter: 6, height: 3.5 },
      { position: 218, diameter: 6, height: 3.5 },
      { position: 238, diameter: 5.5, height: 3.5 },
      { position: 258, diameter: 5, height: 3.5 },
    ],
    termination: { flangeDiameter: 0 },
  };

  // Sample tuning (D major scale)
  const sampleTuning: Tuning = {
    name: "D Major Scale",
    numberOfHoles: 6,
    fingering: [
      { note: { name: "D5", frequency: 587.33 }, openHole: [false, false, false, false, false, false] },
      { note: { name: "E5", frequency: 659.25 }, openHole: [false, false, false, false, false, true] },
      { note: { name: "F#5", frequency: 739.99 }, openHole: [false, false, false, false, true, true] },
      { note: { name: "G5", frequency: 783.99 }, openHole: [false, false, false, true, true, true] },
      { note: { name: "A5", frequency: 880.0 }, openHole: [false, false, true, true, true, true] },
      { note: { name: "B5", frequency: 987.77 }, openHole: [false, true, true, true, true, true] },
      { note: { name: "C#6", frequency: 1108.73 }, openHole: [true, true, true, true, true, true] },
    ],
  };

  state.instruments.set("sample-whistle", sampleWhistle);
  state.tunings.set("sample-tuning", sampleTuning);
  state.selectedInstrument = "sample-whistle";
  state.selectedTuning = "sample-tuning";

  updateSidebar();
  createInstrumentEditor(sampleWhistle, "sample-whistle");
  log("Loaded sample D whistle and tuning", "success");
}

function createNewInstrument() {
  const id = `instrument-${Date.now()}`;
  const instrument: Instrument = {
    name: "New Instrument",
    lengthType: "MM",
    mouthpiece: {
      position: 0,
      fipple: {
        windowWidth: 10,
        windowLength: 8,
        windowHeight: 3,
      },
    },
    borePoint: [
      { borePosition: 0, boreDiameter: 16 },
      { borePosition: 300, boreDiameter: 16 },
    ],
    hole: [],
    termination: { flangeDiameter: 0 },
  };

  state.instruments.set(id, instrument);
  state.selectedInstrument = id;
  updateSidebar();
  createInstrumentEditor(instrument, id);
  log("Created new instrument", "info");
}

function createNewTuning() {
  const id = `tuning-${Date.now()}`;
  const tuning: Tuning = {
    name: "New Tuning",
    numberOfHoles: 6,
    fingering: [],
  };

  state.tunings.set(id, tuning);
  state.selectedTuning = id;
  updateSidebar();
  createTuningEditor(tuning, id);
  log("Created new tuning", "info");
}

// Sidebar
function updateSidebar() {
  const instrumentsList = $("#instruments-list");
  const tuningsList = $("#tunings-list");

  if (instrumentsList) {
    instrumentsList.innerHTML = "";
    state.instruments.forEach((inst, id) => {
      const li = document.createElement("li");
      li.textContent = inst.name || "Untitled";
      li.dataset.id = id;
      li.className = id === state.selectedInstrument ? "selected" : "";
      li.addEventListener("click", () => {
        state.selectedInstrument = id;
        updateSidebar();
        createInstrumentEditor(inst, id);
      });
      instrumentsList.appendChild(li);
    });
  }

  if (tuningsList) {
    tuningsList.innerHTML = "";
    state.tunings.forEach((tuning, id) => {
      const li = document.createElement("li");
      li.textContent = tuning.name || "Untitled";
      li.dataset.id = id;
      li.className = id === state.selectedTuning ? "selected" : "";
      li.addEventListener("click", () => {
        state.selectedTuning = id;
        updateSidebar();
        createTuningEditor(tuning, id);
      });
      tuningsList.appendChild(li);
    });
  }

  // Expand sections that have items
  $$(".tree-header").forEach((header) => {
    const category = (header as HTMLElement).dataset.category;
    const hasItems =
      (category === "instruments" && state.instruments.size > 0) ||
      (category === "tunings" && state.tunings.size > 0);
    if (hasItems) {
      header.classList.add("expanded");
    }
  });
}

// Instrument Comparison
function showInstrumentComparison() {
  if (state.instruments.size < 2) {
    log("Need at least 2 instruments to compare", "warning");
    return;
  }

  const tabId = createTab(`compare-${Date.now()}`, "Compare Instruments");
  const panel = $(`#panel-${tabId}`);
  if (!panel) return;

  const instruments = Array.from(state.instruments.entries());

  panel.innerHTML = `
    <div class="comparison-container">
      <h2>Instrument Comparison</h2>
      <div class="form-row" style="margin-bottom: 20px;">
        <div class="form-group">
          <label>First Instrument</label>
          <select id="compare-inst-1">
            ${instruments.map(([id, inst]) => `<option value="${id}">${inst.name || "Untitled"}</option>`).join("")}
          </select>
        </div>
        <div class="form-group">
          <label>Second Instrument</label>
          <select id="compare-inst-2">
            ${instruments.map(([id, inst], i) => `<option value="${id}" ${i === 1 ? "selected" : ""}>${inst.name || "Untitled"}</option>`).join("")}
          </select>
        </div>
        <div class="form-group" style="align-self: flex-end;">
          <button class="btn primary" id="run-comparison">Compare</button>
        </div>
      </div>
      <div id="comparison-results"></div>
    </div>
  `;

  $("#run-comparison")?.addEventListener("click", () => {
    const id1 = ($<HTMLSelectElement>("#compare-inst-1"))?.value;
    const id2 = ($<HTMLSelectElement>("#compare-inst-2"))?.value;
    if (id1 && id2) {
      renderComparisonTable(id1, id2);
    }
  });

  // Initial comparison
  if (instruments.length >= 2) {
    renderComparisonTable(instruments[0][0], instruments[1][0]);
  }
}

function renderComparisonTable(id1: string, id2: string) {
  const inst1 = state.instruments.get(id1);
  const inst2 = state.instruments.get(id2);
  const resultsDiv = $("#comparison-results");

  if (!inst1 || !inst2 || !resultsDiv) return;

  const boreLength1 = Math.max(...(inst1.borePoint?.map(p => p.borePosition) || [0]));
  const boreLength2 = Math.max(...(inst2.borePoint?.map(p => p.borePosition) || [0]));

  resultsDiv.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Property</th>
          <th>${inst1.name || "Instrument 1"}</th>
          <th>${inst2.name || "Instrument 2"}</th>
          <th>Difference</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Bore Length</td>
          <td>${boreLength1} mm</td>
          <td>${boreLength2} mm</td>
          <td>${(boreLength2 - boreLength1).toFixed(1)} mm</td>
        </tr>
        <tr>
          <td>Number of Holes</td>
          <td>${inst1.hole?.length || 0}</td>
          <td>${inst2.hole?.length || 0}</td>
          <td>${(inst2.hole?.length || 0) - (inst1.hole?.length || 0)}</td>
        </tr>
        <tr>
          <td>Starting Bore Diameter</td>
          <td>${inst1.borePoint?.[0]?.boreDiameter || "-"} mm</td>
          <td>${inst2.borePoint?.[0]?.boreDiameter || "-"} mm</td>
          <td>${((inst2.borePoint?.[0]?.boreDiameter || 0) - (inst1.borePoint?.[0]?.boreDiameter || 0)).toFixed(1)} mm</td>
        </tr>
      </tbody>
    </table>

    <h3 style="margin-top: 20px;">Hole Comparison</h3>
    <table class="data-table">
      <thead>
        <tr>
          <th>Hole #</th>
          <th colspan="2">${inst1.name || "Instrument 1"}</th>
          <th colspan="2">${inst2.name || "Instrument 2"}</th>
          <th colspan="2">Difference</th>
        </tr>
        <tr>
          <th></th>
          <th>Position</th>
          <th>Diameter</th>
          <th>Position</th>
          <th>Diameter</th>
          <th>Position</th>
          <th>Diameter</th>
        </tr>
      </thead>
      <tbody>
        ${Array.from({ length: Math.max(inst1.hole?.length || 0, inst2.hole?.length || 0) }, (_, i) => {
          const h1 = inst1.hole?.[i];
          const h2 = inst2.hole?.[i];
          return `
            <tr>
              <td>${i + 1}</td>
              <td>${h1?.position ?? "-"}</td>
              <td>${h1?.diameter ?? "-"}</td>
              <td>${h2?.position ?? "-"}</td>
              <td>${h2?.diameter ?? "-"}</td>
              <td>${h1 && h2 ? (h2.position - h1.position).toFixed(1) : "-"}</td>
              <td>${h1 && h2 ? (h2.diameter - h1.diameter).toFixed(1) : "-"}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

// XML Export/Import
function exportInstrumentXML(instrumentId: string) {
  const instrument = state.instruments.get(instrumentId);
  if (!instrument) {
    log("No instrument selected", "warning");
    return;
  }

  const xml = instrumentToXML(instrument);
  downloadFile(`${instrument.name || "instrument"}.xml`, xml, "application/xml");
  log(`Exported ${instrument.name} to XML`, "success");
}

function instrumentToXML(instrument: Instrument): string {
  const indent = (level: number) => "  ".repeat(level);

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<instrument>\n';
  xml += `${indent(1)}<name>${escapeXML(instrument.name || "")}</name>\n`;
  xml += `${indent(1)}<lengthType>${instrument.lengthType || "MM"}</lengthType>\n`;

  // Mouthpiece
  xml += `${indent(1)}<mouthpiece>\n`;
  xml += `${indent(2)}<position>${instrument.mouthpiece?.position || 0}</position>\n`;
  if (instrument.mouthpiece?.fipple) {
    xml += `${indent(2)}<fipple>\n`;
    xml += `${indent(3)}<windowWidth>${instrument.mouthpiece.fipple.windowWidth}</windowWidth>\n`;
    xml += `${indent(3)}<windowLength>${instrument.mouthpiece.fipple.windowLength}</windowLength>\n`;
    xml += `${indent(3)}<windowHeight>${instrument.mouthpiece.fipple.windowHeight}</windowHeight>\n`;
    xml += `${indent(2)}</fipple>\n`;
  }
  if (instrument.mouthpiece?.embouchureHole) {
    xml += `${indent(2)}<embouchureHole>\n`;
    xml += `${indent(3)}<length>${instrument.mouthpiece.embouchureHole.length}</length>\n`;
    xml += `${indent(3)}<width>${instrument.mouthpiece.embouchureHole.width}</width>\n`;
    xml += `${indent(3)}<height>${instrument.mouthpiece.embouchureHole.height}</height>\n`;
    xml += `${indent(2)}</embouchureHole>\n`;
  }
  xml += `${indent(1)}</mouthpiece>\n`;

  // Bore points
  xml += `${indent(1)}<boreProfile>\n`;
  for (const bp of instrument.borePoint || []) {
    xml += `${indent(2)}<borePoint>\n`;
    xml += `${indent(3)}<borePosition>${bp.borePosition}</borePosition>\n`;
    xml += `${indent(3)}<boreDiameter>${bp.boreDiameter}</boreDiameter>\n`;
    xml += `${indent(2)}</borePoint>\n`;
  }
  xml += `${indent(1)}</boreProfile>\n`;

  // Holes
  xml += `${indent(1)}<holes>\n`;
  for (const hole of instrument.hole || []) {
    xml += `${indent(2)}<hole>\n`;
    xml += `${indent(3)}<position>${hole.position}</position>\n`;
    xml += `${indent(3)}<diameter>${hole.diameter}</diameter>\n`;
    xml += `${indent(3)}<height>${hole.height || 3}</height>\n`;
    xml += `${indent(2)}</hole>\n`;
  }
  xml += `${indent(1)}</holes>\n`;

  // Termination
  xml += `${indent(1)}<termination>\n`;
  xml += `${indent(2)}<flangeDiameter>${instrument.termination?.flangeDiameter || 0}</flangeDiameter>\n`;
  xml += `${indent(1)}</termination>\n`;

  xml += '</instrument>\n';
  return xml;
}

function escapeXML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function importInstrumentFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".xml,.json";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const instrument = parseInstrument(text);
      const id = `imported-${Date.now()}`;
      state.instruments.set(id, instrument);
      state.selectedInstrument = id;
      updateSidebar();
      createInstrumentEditor(instrument, id);
      log(`Imported ${instrument.name || "instrument"} (${instrument.hole?.length || 0} holes)`, "success");
    } catch (error) {
      log(`Failed to import instrument: ${error}`, "error");
    }
  };
  input.click();
}

function importTuningFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".xml,.json";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const tuning = parseTuning(text);
      const id = `imported-tuning-${Date.now()}`;
      state.tunings.set(id, tuning);
      state.selectedTuning = id;
      updateSidebar();
      createTuningEditor(tuning, id);
      log(`Imported ${tuning.name || "tuning"} (${tuning.fingering?.length || 0} fingerings)`, "success");
    } catch (error) {
      log(`Failed to import tuning: ${error}`, "error");
    }
  };
  input.click();
}


// Preferences Modal
function showPreferencesModal() {
  const modal = $("#modal-overlay");
  const title = $("#modal-title");
  const content = $("#modal-content");
  const footer = $("#modal-footer");

  if (!modal || !title || !content || !footer) return;

  title.textContent = "Preferences";
  content.innerHTML = `
    <div class="form-group">
      <label>Temperature (°C)</label>
      <input type="number" id="pref-temperature" value="${state.preferences.temperature}" step="0.5" />
    </div>
    <div class="form-group">
      <label>Humidity (%)</label>
      <input type="number" id="pref-humidity" value="${state.preferences.humidity}" step="1" min="0" max="100" />
    </div>
    <div class="form-group">
      <label>Default Length Unit</label>
      <select id="pref-length-unit">
        <option value="MM" ${state.preferences.lengthUnit === "MM" ? "selected" : ""}>Millimeters (mm)</option>
        <option value="IN" ${state.preferences.lengthUnit === "IN" ? "selected" : ""}>Inches (in)</option>
      </select>
    </div>
    <div class="form-group">
      <label>Default Study Type</label>
      <select id="pref-study-type">
        <option value="whistle" ${state.preferences.studyType === "whistle" ? "selected" : ""}>Whistle</option>
        <option value="flute" ${state.preferences.studyType === "flute" ? "selected" : ""}>Flute</option>
        <option value="naf" ${state.preferences.studyType === "naf" ? "selected" : ""}>Native American Flute</option>
        <option value="reed" ${state.preferences.studyType === "reed" ? "selected" : ""}>Reed Instrument</option>
      </select>
    </div>
  `;

  footer.innerHTML = `
    <button class="btn" data-action="close-modal">Cancel</button>
    <button class="btn primary" id="save-preferences">Save</button>
  `;

  modal.classList.add("open");

  $("#save-preferences")?.addEventListener("click", () => {
    state.preferences.temperature = parseFloat(($<HTMLInputElement>("#pref-temperature"))?.value || "20");
    state.preferences.humidity = parseFloat(($<HTMLInputElement>("#pref-humidity"))?.value || "45");
    state.preferences.lengthUnit = ($<HTMLSelectElement>("#pref-length-unit"))?.value as "MM" | "IN" || "MM";
    state.preferences.studyType = ($<HTMLSelectElement>("#pref-study-type"))?.value || "whistle";
    modal.classList.remove("open");
    log("Preferences saved", "success");
  });
}

// Optimization Modal
function showOptimizeModal() {
  if (!state.selectedInstrument || !state.selectedTuning) {
    log("Please select an instrument and tuning first", "warning");
    return;
  }

  const modal = $("#modal-overlay");
  const title = $("#modal-title");
  const content = $("#modal-content");
  const footer = $("#modal-footer");

  if (!modal || !title || !content || !footer) return;

  title.textContent = "Optimize Instrument";
  content.innerHTML = `
    <div class="form-group">
      <label>Optimization Type</label>
      <select id="opt-type">
        <option value="positions">Hole Positions</option>
        <option value="sizes">Hole Sizes</option>
        <option value="both">Positions and Sizes</option>
      </select>
    </div>
    <div class="form-group">
      <label>Selected Instrument</label>
      <input type="text" readonly value="${state.instruments.get(state.selectedInstrument!)?.name || ""}" />
    </div>
    <div class="form-group">
      <label>Selected Tuning</label>
      <input type="text" readonly value="${state.tunings.get(state.selectedTuning!)?.name || ""}" />
    </div>
  `;

  footer.innerHTML = `
    <button class="btn" data-action="close-modal">Cancel</button>
    <button class="btn primary" id="run-optimize">Optimize</button>
  `;

  modal.classList.add("open");

  $("#run-optimize")?.addEventListener("click", () => {
    const typeSelect = $<HTMLSelectElement>("#opt-type");
    const type = typeSelect?.value || "positions";
    modal.classList.remove("open");
    optimizeInstrument(state.selectedInstrument!, state.selectedTuning!, type);
  });
}

// Initialize
function init() {
  // Menu dropdowns
  $$(".menu-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const menuId = (btn as HTMLElement).dataset.menu;
      const dropdown = $(`#menu-${menuId}`);
      $$(".dropdown").forEach((d) => d.classList.remove("open"));
      dropdown?.classList.toggle("open");
    });
  });

  // Close dropdowns on outside click
  document.addEventListener("click", () => {
    $$(".dropdown").forEach((d) => d.classList.remove("open"));
  });

  // Tree headers
  $$(".tree-header").forEach((header) => {
    header.addEventListener("click", () => {
      header.classList.toggle("expanded");
    });
  });

  // Action buttons (toolbar and menu items)
  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const action = target.dataset.action || target.closest("[data-action]")?.getAttribute("data-action");

    if (!action) return;

    switch (action) {
      case "new-instrument":
        createNewInstrument();
        break;
      case "new-tuning":
        createNewTuning();
        break;
      case "load-sample":
        loadSampleData();
        break;
      case "calculate-tuning":
        if (state.selectedInstrument && state.selectedTuning) {
          calculateTuning(state.selectedInstrument, state.selectedTuning);
        } else {
          log("Please select an instrument and tuning", "warning");
        }
        break;
      case "optimize":
        showOptimizeModal();
        break;
      case "sketch":
        if (state.selectedInstrument) {
          const inst = state.instruments.get(state.selectedInstrument);
          if (inst) showInstrumentSketch(inst);
        } else {
          log("Please select an instrument", "warning");
        }
        break;
      case "toggle-sidebar":
        $("#sidebar")?.classList.toggle("collapsed");
        break;
      case "toggle-console":
        $("#console-panel")?.classList.toggle("collapsed");
        break;
      case "clear-console":
        const consoleContent = $("#console-content");
        if (consoleContent) consoleContent.innerHTML = "";
        break;
      case "close-modal":
        $("#modal-overlay")?.classList.remove("open");
        break;
      case "about":
        $("#about-modal")?.classList.add("open");
        break;
      case "close-about":
        $("#about-modal")?.classList.remove("open");
        break;
      case "compare":
        showInstrumentComparison();
        break;
      case "export-xml":
        if (state.selectedInstrument) {
          exportInstrumentXML(state.selectedInstrument);
        } else {
          log("Please select an instrument to export", "warning");
        }
        break;
      case "open":
      case "open-instrument":
        importInstrumentFile();
        break;
      case "open-tuning":
        importTuningFile();
        break;
      case "preferences":
        showPreferencesModal();
        break;
    }
  });

  // Console resize
  let isResizing = false;
  const resizeHandle = $("#console-resize");
  const consolePanel = $("#console-panel");

  resizeHandle?.addEventListener("mousedown", () => {
    isResizing = true;
  });

  document.addEventListener("mousemove", (e) => {
    if (!isResizing || !consolePanel) return;
    const newHeight = window.innerHeight - e.clientY - 48; // Account for header
    consolePanel.style.height = `${Math.max(50, Math.min(400, newHeight))}px`;
  });

  document.addEventListener("mouseup", () => {
    isResizing = false;
  });

  log("WWIDesigner Web ready", "success");
}

// Start
document.addEventListener("DOMContentLoaded", init);
