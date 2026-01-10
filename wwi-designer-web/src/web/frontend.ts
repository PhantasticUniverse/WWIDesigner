/**
 * WWIDesigner Web Frontend
 *
 * Main application logic for the web interface.
 */

import type { Instrument, BorePoint, Hole } from "../models/instrument.ts";
import type { Tuning, Fingering } from "../models/tuning.ts";
import { parseInstrument, parseTuning, parseConstraints, constraintsToXml, constraintsToJson } from "../utils/xml-converter.ts";
import type { Constraint } from "../core/optimization/constraints.ts";
import { ConstraintType } from "../core/optimization/constraints.ts";
import type { LengthType } from "../core/constants.ts";
import { getMultiplierToMetres, getMultiplierFromMetres } from "../core/constants.ts";

// Constraints data structure (matches API response)
interface ConstraintsData {
  constraintsName: string;
  objectiveDisplayName: string;
  objectiveFunctionName: string;
  numberOfHoles: number;
  lengthType: string;
  constraints: Constraint[];
  lowerBounds: number[];
  upperBounds: number[];
  holeGroups?: number[][];
  dimensions?: number;
}

// Preset info from API
interface PresetInfo {
  name: string;
  filename: string;
  path: string;
}

// Constraint group (organized by objective function type)
interface ConstraintGroup {
  objectiveFunction: string;
  displayName: string;
  presets: PresetInfo[];
}

// Application State
interface AppState {
  activeTab: string;
  instruments: Map<string, Instrument>;
  tunings: Map<string, Tuning>;
  constraints: Map<string, ConstraintsData>;
  selectedInstrument: string | null;
  selectedTuning: string | null;
  selectedConstraints: string | null;
  selectedOptimizer: string;
  selectedMultistart: string;
  // Preset browser state
  presetInstruments: PresetInfo[];
  presetTunings: PresetInfo[];
  presetConstraintGroups: ConstraintGroup[];
  presetsLoaded: boolean;
  presetsExpanded: { instruments: boolean; tunings: boolean; constraints: boolean };
  constraintGroupsExpanded: Record<string, boolean>;
  preferences: {
    temperature: number;
    humidity: number;
    studyType: string;
    lengthUnit: "MM" | "IN";
    // General Study Options
    useDirectOptimizer: boolean;
    maxNoteSpectrumMultiplier: number;
    // NAF Study Options
    numberOfStarts: number;
    // Whistle/Flute Study Options
    blowingLevel: number;
    pressure: number; // kPa
    co2Ppm: number;
  };
}

const state: AppState = {
  activeTab: "welcome",
  instruments: new Map(),
  tunings: new Map(),
  constraints: new Map(),
  selectedInstrument: null,
  selectedTuning: null,
  selectedConstraints: null,
  selectedOptimizer: "HolePositionObjectiveFunction",
  selectedMultistart: "none",
  // Preset browser state
  presetInstruments: [],
  presetTunings: [],
  presetConstraintGroups: [],
  presetsLoaded: false,
  presetsExpanded: { instruments: false, tunings: false, constraints: false },
  constraintGroupsExpanded: {},
  preferences: {
    temperature: 20,
    humidity: 45,
    studyType: "naf",
    lengthUnit: "MM",
    // General Study Options
    useDirectOptimizer: true,
    maxNoteSpectrumMultiplier: 3.17,
    // NAF Study Options
    numberOfStarts: 30,
    // Whistle/Flute Study Options
    blowingLevel: 5,
    pressure: 101.325,
    co2Ppm: 390,
  },
};

/**
 * Convert all dimensional values in an instrument by a conversion factor.
 * This is used when changing length units (e.g., MM to IN).
 */
function convertInstrumentDimensions(instrument: Instrument, factor: number): void {
  // Convert mouthpiece position
  instrument.mouthpiece.position *= factor;

  // Convert bore diameter at mouthpiece if present
  if (instrument.mouthpiece.boreDiameter) {
    instrument.mouthpiece.boreDiameter *= factor;
  }

  // Convert fipple dimensions
  if (instrument.mouthpiece.fipple) {
    const f = instrument.mouthpiece.fipple;
    if (f.windowWidth !== undefined) f.windowWidth *= factor;
    if (f.windowLength !== undefined) f.windowLength *= factor;
    if (f.windowHeight !== undefined) f.windowHeight *= factor;
    if (f.windwayLength !== undefined) f.windwayLength *= factor;
    if (f.windwayHeight !== undefined) f.windwayHeight *= factor;
  }

  // Convert embouchure hole dimensions
  if (instrument.mouthpiece.embouchureHole) {
    const e = instrument.mouthpiece.embouchureHole;
    if (e.length !== undefined) e.length *= factor;
    if (e.width !== undefined) e.width *= factor;
    if (e.height !== undefined) e.height *= factor;
    if (e.airstreamLength !== undefined) e.airstreamLength *= factor;
    if (e.airstreamHeight !== undefined) e.airstreamHeight *= factor;
  }

  // Convert bore points
  for (const bp of instrument.borePoint) {
    bp.borePosition *= factor;
    bp.boreDiameter *= factor;
  }

  // Convert holes
  for (const hole of instrument.hole) {
    hole.position *= factor;
    hole.diameter *= factor;
    hole.height *= factor;
    if (hole.boreDiameter !== undefined) hole.boreDiameter *= factor;
    if (hole.innerCurvatureRadius !== undefined) hole.innerCurvatureRadius *= factor;
  }

  // Convert termination
  if (instrument.termination) {
    instrument.termination.flangeDiameter *= factor;
    if (instrument.termination.borePosition !== undefined) {
      instrument.termination.borePosition *= factor;
    }
    if (instrument.termination.boreDiameter !== undefined) {
      instrument.termination.boreDiameter *= factor;
    }
  }
}

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

// Loading overlay
function showLoading(message: string = "Processing...") {
  const overlay = $("#loading-overlay");
  const msgEl = $("#loading-message");
  if (overlay && msgEl) {
    msgEl.textContent = message;
    overlay.classList.add("active");
  }
}

function hideLoading() {
  $("#loading-overlay")?.classList.remove("active");
}

// Toast notifications
function showToast(message: string, type: "info" | "success" | "warning" | "error" = "info", duration = 5000) {
  const container = $("#toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  const text = document.createElement("span");
  text.textContent = message;
  toast.appendChild(text);

  const closeBtn = document.createElement("button");
  closeBtn.className = "toast-close";
  closeBtn.textContent = "\u00D7";
  closeBtn.addEventListener("click", () => toast.remove());
  toast.appendChild(closeBtn);

  container.appendChild(toast);

  // Auto-remove after duration
  setTimeout(() => {
    toast.remove();
  }, duration);
}

// Keyboard shortcuts
function initKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    // Escape = Close modal
    if (e.key === "Escape") {
      $("#modal-overlay")?.classList.remove("open");
      $("#about-modal")?.classList.remove("open");
    }

    // Ctrl/Cmd + S = Save (prevent default)
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      log("Save shortcut pressed", "info");
      // TODO: Implement save
    }

    // Ctrl/Cmd + O = Open
    if ((e.ctrlKey || e.metaKey) && e.key === "o") {
      e.preventDefault();
      // Trigger file import
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".xml";
      fileInput.addEventListener("change", (ev) => {
        const target = ev.target as HTMLInputElement;
        if (target.files && target.files.length > 0) {
          const file = target.files[0]!;
          handleFileImport(file);
        }
      });
      fileInput.click();
    }

    // Ctrl/Cmd + Shift + C = Calculate tuning
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "C") {
      e.preventDefault();
      if (state.selectedInstrument && state.selectedTuning) {
        calculateTuning(state.selectedInstrument, state.selectedTuning);
      } else {
        showToast("Please select an instrument and tuning first", "warning");
      }
    }
  });
}

// File import handler for keyboard shortcut
async function handleFileImport(file: File) {
  try {
    const content = await file.text();
    const parsed = parseInstrument(content);
    if (parsed) {
      const id = `imported-${Date.now()}`;
      state.instruments.set(id, parsed);
      state.selectedInstrument = id;
      updateSidebar();
      createInstrumentEditor(parsed, id);
      log(`Imported instrument: ${parsed.name || "Untitled"}`, "success");
      showToast(`Imported: ${parsed.name || "Untitled"}`, "success");
    }
  } catch {
    // Try as tuning
    try {
      const content = await file.text();
      const parsed = parseTuning(content);
      if (parsed) {
        const id = `imported-${Date.now()}`;
        state.tunings.set(id, parsed);
        state.selectedTuning = id;
        updateSidebar();
        createTuningEditor(parsed, id);
        log(`Imported tuning: ${parsed.name || "Untitled"}`, "success");
        showToast(`Imported: ${parsed.name || "Untitled"}`, "success");
      }
    } catch (err) {
      log(`Failed to import file: ${err}`, "error");
      showToast("Failed to import file", "error");
    }
  }
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
      </div>
      <div class="form-row">
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
          <label>Airstream Height</label>
          <input type="number" step="0.001" id="emb-airstream-height-${tabId}" value="${mp.embouchureHole?.airstreamHeight || ""}" />
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

  // Length unit change - convert all values when unit changes
  const lengthUnitSelect = $<HTMLSelectElement>(`#length-unit-${tabId}`);
  lengthUnitSelect?.addEventListener("change", () => {
    const inst = state.instruments.get(instrumentId);
    if (!inst) return;

    const oldUnit = inst.lengthType as LengthType;
    const newUnit = lengthUnitSelect.value as LengthType;

    if (oldUnit !== newUnit) {
      // Convert all dimensional values to new unit
      const conversionFactor = getMultiplierFromMetres(newUnit) / getMultiplierFromMetres(oldUnit);
      convertInstrumentDimensions(inst, conversionFactor);
      inst.lengthType = newUnit;

      // Re-render the editor with converted values
      createInstrumentEditor(inst, instrumentId);
      log(`Converted instrument dimensions from ${oldUnit} to ${newUnit}`, "info");
    }
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
    // Read fipple values (matching NafPanel fields)
    const windowLengthVal = $<HTMLInputElement>(`#fipple-length-${tabId}`)?.value;
    const windowWidthVal = $<HTMLInputElement>(`#fipple-width-${tabId}`)?.value;
    const windwayHeightVal = $<HTMLInputElement>(`#windway-height-${tabId}`)?.value;
    const fippleFactorVal = $<HTMLInputElement>(`#fipple-factor-${tabId}`)?.value;

    // Preserve existing values for fields not shown in UI
    const existingFipple = inst.mouthpiece.fipple;
    inst.mouthpiece.fipple = {
      windowLength: windowLengthVal ? parseFloat(windowLengthVal) : existingFipple?.windowLength ?? 0,
      windowWidth: windowWidthVal ? parseFloat(windowWidthVal) : existingFipple?.windowWidth ?? 0,
      windowHeight: existingFipple?.windowHeight,
      windwayLength: existingFipple?.windwayLength,
      windwayHeight: windwayHeightVal ? parseFloat(windwayHeightVal) : undefined,
      fippleFactor: fippleFactorVal ? parseFloat(fippleFactorVal) : undefined,
    };

    delete inst.mouthpiece.embouchureHole;
  } else if (mpType === "embouchure") {
    const lengthVal = $<HTMLInputElement>(`#emb-length-${tabId}`)?.value;
    const widthVal = $<HTMLInputElement>(`#emb-width-${tabId}`)?.value;
    const heightVal = $<HTMLInputElement>(`#emb-height-${tabId}`)?.value;
    const airstreamLengthVal = $<HTMLInputElement>(`#airstream-length-${tabId}`)?.value;
    const airstreamHeightVal = $<HTMLInputElement>(`#emb-airstream-height-${tabId}`)?.value;

    const existingEmb = inst.mouthpiece.embouchureHole;
    inst.mouthpiece.embouchureHole = {
      length: lengthVal ? parseFloat(lengthVal) : existingEmb?.length ?? 0,
      width: widthVal ? parseFloat(widthVal) : existingEmb?.width ?? 0,
      height: heightVal ? parseFloat(heightVal) : existingEmb?.height ?? 0,
      airstreamLength: airstreamLengthVal ? parseFloat(airstreamLengthVal) : existingEmb?.airstreamLength ?? 0,
      airstreamHeight: airstreamHeightVal ? parseFloat(airstreamHeightVal) : existingEmb?.airstreamHeight ?? 0,
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
              const absDev = Math.abs(dev);
              // Color based on how far from 0 (absolute deviation), not positive/negative
              const devClass =
                absDev < 5
                  ? "deviation-good"
                  : absDev < 15
                    ? "deviation-fair"
                    : "deviation-poor";
              const status = absDev < 5 ? "Good" : absDev < 15 ? "Fair" : "Poor";
              const statusClass = absDev < 5 ? "status-good" : absDev < 15 ? "status-fair" : "status-poor";
              const rowClass = absDev < 5 ? "row-good" : absDev < 15 ? "row-fair" : "row-poor";
              return `
              <tr class="${rowClass}">
                <td>${r.note}</td>
                <td>${r.targetFrequency?.toFixed(1) || "-"}</td>
                <td>${r.predictedFrequency?.toFixed(1) || "-"}</td>
                <td class="${devClass}">${dev.toFixed(1)}</td>
                <td class="${statusClass}">${status}</td>
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
  const padding = 50;

  // Clear with warm cream background
  ctx.fillStyle = "#faf6f0";
  ctx.fillRect(0, 0, width, height);

  const borePoints = instrument.borePoint || [];
  const holes = instrument.hole || [];

  if (borePoints.length < 2) {
    ctx.fillStyle = "#6b4423";
    ctx.font = "14px 'Source Sans 3', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Insufficient bore data", width / 2, height / 2);
    return;
  }

  // Find scale
  const minPos = Math.min(...borePoints.map((p) => p.borePosition));
  const maxPos = Math.max(...borePoints.map((p) => p.borePosition));
  const maxDia = Math.max(...borePoints.map((p) => p.boreDiameter));

  const lengthScale = (width - 2 * padding) / (maxPos - minPos || 1);
  const diaScale = (height - 2 * padding - 40) / (maxDia * 2.5);
  const scale = Math.min(lengthScale, diaScale);

  const centerY = height / 2 + 10;

  // Helper to convert position to x coordinate
  const posToX = (pos: number) => padding + (pos - minPos) * scale;
  const diaToY = (dia: number) => (dia / 2) * scale;

  // TOP-DOWN VIEW: Draw bore as elongated shape with rounded ends
  const lastBp = borePoints[borePoints.length - 1]!;
  const firstBp = borePoints[0]!;

  // Create bore path for clipping (top-down view)
  ctx.save();
  ctx.beginPath();

  // Draw top edge following bore profile
  ctx.moveTo(posToX(firstBp.borePosition), centerY - diaToY(firstBp.boreDiameter));
  for (const bp of borePoints) {
    ctx.lineTo(posToX(bp.borePosition), centerY - diaToY(bp.boreDiameter));
  }

  // Rounded end cap on right
  const rightRadius = diaToY(lastBp.boreDiameter);
  ctx.arc(posToX(lastBp.borePosition), centerY, rightRadius, -Math.PI / 2, Math.PI / 2);

  // Draw bottom edge (reverse)
  for (let i = borePoints.length - 1; i >= 0; i--) {
    const bp = borePoints[i]!;
    ctx.lineTo(posToX(bp.borePosition), centerY + diaToY(bp.boreDiameter));
  }

  // Rounded end cap on left (or square for TSH area)
  const leftRadius = diaToY(firstBp.boreDiameter);
  ctx.arc(posToX(firstBp.borePosition), centerY, leftRadius, Math.PI / 2, -Math.PI / 2);

  ctx.closePath();

  // Wood gradient fill (top-down lighting)
  const boreTop = centerY - diaToY(maxDia);
  const boreBottom = centerY + diaToY(maxDia);
  const woodGradient = ctx.createLinearGradient(0, boreTop, 0, boreBottom);
  woodGradient.addColorStop(0, "#c49464");    // Top highlight
  woodGradient.addColorStop(0.2, "#a67c52");  // Light wood
  woodGradient.addColorStop(0.5, "#8b5a2b");  // Main wood color
  woodGradient.addColorStop(0.8, "#a67c52");  // Light wood
  woodGradient.addColorStop(1, "#c49464");    // Bottom highlight

  ctx.fillStyle = woodGradient;
  ctx.fill();

  // Procedural wood grain within bore
  ctx.clip();
  drawWoodGrain(ctx, posToX(minPos) - leftRadius, boreTop, posToX(maxPos) - posToX(minPos) + leftRadius + rightRadius, boreBottom - boreTop);
  ctx.restore();

  // Bore outline with subtle shadow
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.25)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 3;

  ctx.beginPath();
  ctx.moveTo(posToX(firstBp.borePosition), centerY - diaToY(firstBp.boreDiameter));
  for (const bp of borePoints) {
    ctx.lineTo(posToX(bp.borePosition), centerY - diaToY(bp.boreDiameter));
  }
  ctx.arc(posToX(lastBp.borePosition), centerY, rightRadius, -Math.PI / 2, Math.PI / 2);
  for (let i = borePoints.length - 1; i >= 0; i--) {
    const bp = borePoints[i]!;
    ctx.lineTo(posToX(bp.borePosition), centerY + diaToY(bp.boreDiameter));
  }
  ctx.arc(posToX(firstBp.borePosition), centerY, leftRadius, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();

  ctx.strokeStyle = "#5a3d20";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // Draw 3D tone holes (centered on bore - top-down view)
  for (const hole of holes) {
    const x = posToX(hole.position);
    const holeRadius = Math.max((hole.diameter / 2) * scale, 5);
    draw3DToneHole(ctx, x, centerY, holeRadius);
  }

  // Draw TSH (True Sound Hole) on centerline
  drawMouthpiece(ctx, instrument, posToX, diaToY, centerY, scale, borePoints);

  // Draw dimension annotations
  drawDimensions(ctx, instrument, posToX, diaToY, centerY, scale, minPos, maxPos, padding, height);

  // Title with craftsman styling
  ctx.fillStyle = "#4a2f15";
  ctx.font = "600 15px 'Playfair Display', Georgia, serif";
  ctx.textAlign = "left";
  const lengthVal = (maxPos - minPos).toFixed(2);
  ctx.fillText(`Length: ${lengthVal}`, padding, 24);
  ctx.fillText(`Holes: ${holes.length}`, padding + 160, 24);
}

// Procedural wood grain rendering
function drawWoodGrain(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = "#3d2815";
  ctx.lineWidth = 0.6;

  // Draw wavy grain lines
  const grainSpacing = 2.5;
  for (let i = 0; i < height; i += grainSpacing + Math.random() * 1.5) {
    ctx.beginPath();
    ctx.moveTo(x, y + i);
    for (let j = 0; j < width; j += 8) {
      const wave = Math.sin((j + i * 0.3) * 0.015) * 1.2 + Math.sin((j * 0.05) + i * 0.1) * 0.5;
      ctx.lineTo(x + j, y + i + wave);
    }
    ctx.stroke();
  }

  // Add occasional knot patterns
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = "#2d1a0a";
  const knotCount = Math.floor(width / 150);
  for (let k = 0; k < knotCount; k++) {
    const kx = x + 80 + Math.random() * (width - 160);
    const ky = y + height * 0.3 + Math.random() * height * 0.4;
    const kRadius = 3 + Math.random() * 4;
    ctx.beginPath();
    ctx.ellipse(kx, ky, kRadius, kRadius * 0.6, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// 3D tone hole with depth effect (top-down view - circular)
function draw3DToneHole(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  // Outer raised rim (wood edge) - shadow
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = "#6b4423";
  ctx.beginPath();
  ctx.arc(x, y, radius * 1.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Wood rim ring
  ctx.fillStyle = "#8b5a2b";
  ctx.beginPath();
  ctx.arc(x, y, radius * 1.1, 0, Math.PI * 2);
  ctx.fill();

  // Inner hole (dark void with gradient)
  const holeGradient = ctx.createRadialGradient(x - radius * 0.2, y - radius * 0.2, 0, x, y, radius);
  holeGradient.addColorStop(0, "#0a0806");
  holeGradient.addColorStop(0.4, "#1a1410");
  holeGradient.addColorStop(0.7, "#2d2520");
  holeGradient.addColorStop(1, "#1a1410");

  ctx.fillStyle = holeGradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  // Highlight rim on top-left edge
  ctx.strokeStyle = "rgba(212, 165, 116, 0.5)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.95, Math.PI * 1.1, Math.PI * 1.7);
  ctx.stroke();

  // Inner edge highlight
  ctx.strokeStyle = "rgba(212, 165, 116, 0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.7, Math.PI * 1.2, Math.PI * 1.6);
  ctx.stroke();
}

// Dimension annotations like technical drawings
function drawDimensions(
  ctx: CanvasRenderingContext2D,
  instrument: Instrument,
  posToX: (pos: number) => number,
  diaToY: (dia: number) => number,
  centerY: number,
  scale: number,
  minPos: number,
  maxPos: number,
  padding: number,
  height: number
) {
  const borePoints = instrument.borePoint || [];
  const maxDia = Math.max(...borePoints.map((p) => p.boreDiameter));

  // Dimension line color (copper/brass)
  ctx.strokeStyle = "#8b6b4a";
  ctx.fillStyle = "#6b4423";
  ctx.font = "11px 'JetBrains Mono', monospace";

  // Total length dimension line at bottom
  const dimY = centerY + diaToY(maxDia) + 25;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(posToX(minPos), dimY);
  ctx.lineTo(posToX(maxPos), dimY);
  ctx.stroke();

  // Extension lines
  ctx.beginPath();
  ctx.moveTo(posToX(minPos), centerY + diaToY(maxDia) + 5);
  ctx.lineTo(posToX(minPos), dimY + 5);
  ctx.moveTo(posToX(maxPos), centerY + diaToY(maxDia) + 5);
  ctx.lineTo(posToX(maxPos), dimY + 5);
  ctx.stroke();

  // Arrowheads
  const arrowSize = 5;
  ctx.beginPath();
  ctx.moveTo(posToX(minPos), dimY);
  ctx.lineTo(posToX(minPos) + arrowSize, dimY - 3);
  ctx.lineTo(posToX(minPos) + arrowSize, dimY + 3);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(posToX(maxPos), dimY);
  ctx.lineTo(posToX(maxPos) - arrowSize, dimY - 3);
  ctx.lineTo(posToX(maxPos) - arrowSize, dimY + 3);
  ctx.closePath();
  ctx.fill();

  // Bore diameter indicator on right side
  if (borePoints.length > 0) {
    const rightDia = borePoints[borePoints.length - 1]!.boreDiameter;
    const rightX = posToX(maxPos) + 15;
    ctx.beginPath();
    ctx.moveTo(rightX, centerY - diaToY(rightDia));
    ctx.lineTo(rightX, centerY + diaToY(rightDia));
    ctx.stroke();

    // Diameter text
    ctx.textAlign = "left";
    ctx.fillText(`⌀${rightDia.toFixed(2)}`, rightX + 5, centerY + 4);
  }
}

function drawMouthpiece(
  ctx: CanvasRenderingContext2D,
  instrument: Instrument,
  posToX: (pos: number) => number,
  diaToY: (dia: number) => number,
  centerY: number,
  scale: number,
  borePoints: BorePoint[]
) {
  const mouthpiece = instrument.mouthpiece;
  if (!mouthpiece) return;

  const mpPos = mouthpiece.position;
  const boreDia = borePoints.length > 0 ? borePoints[0]!.boreDiameter : 20;
  const boreRadius = diaToY(boreDia);

  // Draw NAF fipple (True Sound Hole) with enhanced styling - centered for top-down view
  if (mouthpiece.fipple) {
    const fipple = mouthpiece.fipple;
    const windowLength = fipple.windowLength || 0;
    const windowWidth = fipple.windowWidth || 0;

    if (windowLength > 0 && windowWidth > 0) {
      const windowLeft = posToX(mpPos - windowLength);
      const windowRight = posToX(mpPos);
      const halfWidth = Math.min((windowWidth / 2) * scale, boreRadius * 0.9);

      // TSH (True Sound Hole) - dark opening with gradient (centered on bore)
      const tshGradient = ctx.createRadialGradient(
        (windowLeft + windowRight) / 2, centerY, 0,
        (windowLeft + windowRight) / 2, centerY, Math.max(windowRight - windowLeft, halfWidth * 2) / 2
      );
      tshGradient.addColorStop(0, "#0a0806");
      tshGradient.addColorStop(0.6, "#1a1410");
      tshGradient.addColorStop(1, "#2d2520");

      ctx.beginPath();
      ctx.moveTo(windowRight, centerY - halfWidth);
      ctx.lineTo(windowRight, centerY + halfWidth);
      ctx.lineTo(windowLeft, centerY + halfWidth);
      ctx.lineTo(windowLeft, centerY - halfWidth);
      ctx.closePath();
      ctx.fillStyle = tshGradient;
      ctx.fill();

      // TSH border with wood color
      ctx.strokeStyle = "#5a3d20";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Highlight on edges
      ctx.strokeStyle = "rgba(212, 165, 116, 0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(windowLeft + 2, centerY - halfWidth + 1);
      ctx.lineTo(windowRight - 2, centerY - halfWidth + 1);
      ctx.stroke();
    }
  }

  // Draw embouchure hole as an oval (for transverse flutes)
  if (mouthpiece.embouchureHole) {
    const emb = mouthpiece.embouchureHole;
    const embLength = emb.length || 0;
    const embWidth = emb.width || 0;

    if (embLength > 0 && embWidth > 0) {
      const cx = posToX(mpPos);
      const radiusX = (embLength / 2) * scale;
      const radiusY = (embWidth / 2) * scale;

      // Embouchure hole with 3D effect
      const embGradient = ctx.createRadialGradient(cx, centerY - radiusY * 0.2, 0, cx, centerY, Math.max(radiusX, radiusY));
      embGradient.addColorStop(0, "#0a0806");
      embGradient.addColorStop(0.7, "#1a1410");
      embGradient.addColorStop(1, "#2d2520");

      ctx.beginPath();
      ctx.ellipse(cx, centerY - boreRadius, radiusX, radiusY * 0.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = embGradient;
      ctx.fill();
      ctx.strokeStyle = "#6b4423";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Highlight rim
      ctx.strokeStyle = "rgba(212, 165, 116, 0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, centerY - boreRadius - 1, radiusX * 0.9, radiusY * 0.45, 0, Math.PI * 1.2, Math.PI * 1.8);
      ctx.stroke();
    }
  }
}

function getBoreDiameterAtPosition(borePoints: BorePoint[], position: number): number {
  if (borePoints.length === 0) return 16;
  if (borePoints.length === 1) return borePoints[0]!.boreDiameter;

  // Find surrounding bore points
  let left = borePoints[0]!;
  let right = borePoints[borePoints.length - 1]!;

  for (let i = 0; i < borePoints.length - 1; i++) {
    if (borePoints[i]!.borePosition <= position && borePoints[i + 1]!.borePosition >= position) {
      left = borePoints[i]!;
      right = borePoints[i + 1]!;
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

async function optimizeInstrument(instrumentId: string, tuningId: string, objectiveFunction: string) {
  const instrument = state.instruments.get(instrumentId);
  const tuning = state.tunings.get(tuningId);

  if (!instrument || !tuning) {
    log("Missing instrument or tuning selection", "error");
    return;
  }

  const nrTargetNotes = tuning.fingering?.length || 0;
  log(`Optimizing with ${objectiveFunction}...`, "info");

  try {
    const response = await fetch("/api/optimize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instrument,
        tuning,
        objectiveFunction,
        temperature: state.preferences.temperature,
        humidity: state.preferences.humidity,
        pressure: state.preferences.pressure,
        co2Ppm: state.preferences.co2Ppm,
        useDirectOptimizer: state.preferences.useDirectOptimizer,
        numberOfStarts: state.preferences.numberOfStarts,
        blowingLevel: state.preferences.blowingLevel,
      }),
    });

    const data = await response.json();

    if (data.error) {
      log(`Error: ${data.error}`, "error");
      return;
    }

    // Log detailed optimization results (matching Java format)
    log(`System has ${data.dimensions} optimization variables and ${data.targetNotes || nrTargetNotes} target notes.`, "info");
    log(`Initial error: ${data.initialError}`, "info");
    log(`After ${data.evaluations} evaluations, optimizer found optimum ${data.finalError}`, "info");
    log(`Final error:  ${data.finalError}`, "info");
    log(`Residual error ratio: ${data.residualRatio?.toFixed(6) || (data.finalError / data.initialError).toFixed(6)}`, "info");
    if (data.tunings) {
      log(`Performed ${data.tunings} tuning calculations in ${data.evaluations} evaluations.`, "info");
    }
    log(`Elapsed time: ${data.elapsedTime?.toFixed(1) || "N/A"} seconds.`, "info");
    log(`Optimization complete!`, "success");

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

// ============================================================================
// Preset Browser
// ============================================================================

/**
 * Load list of presets for a category from the API.
 */
async function loadPresetList(category: "instruments" | "tunings" | "constraints"): Promise<PresetInfo[]> {
  try {
    const response = await fetch(`/api/presets/${category}`);
    const data = await response.json();
    if (data.error) {
      log(`Failed to load ${category} presets: ${data.error}`, "error");
      return [];
    }
    return data.presets || [];
  } catch (error) {
    log(`Failed to load ${category} presets: ${error}`, "error");
    return [];
  }
}

/**
 * Load constraint groups (organized by objective function type).
 */
async function loadConstraintGroups(): Promise<ConstraintGroup[]> {
  try {
    const response = await fetch("/api/presets/constraints");
    const data = await response.json();
    if (data.error) {
      log(`Failed to load constraint groups: ${data.error}`, "error");
      return [];
    }
    return data.groups || [];
  } catch (error) {
    log(`Failed to load constraint groups: ${error}`, "error");
    return [];
  }
}

/**
 * Load all preset lists on startup.
 */
async function loadAllPresets() {
  log("Loading preset libraries...", "info");

  try {
    const [instruments, tunings, constraintGroups] = await Promise.all([
      loadPresetList("instruments"),
      loadPresetList("tunings"),
      loadConstraintGroups(),
    ]);

    state.presetInstruments = instruments;
    state.presetTunings = tunings;
    state.presetConstraintGroups = constraintGroups;
    state.presetsLoaded = true;

    // Count total constraints
    const totalConstraints = constraintGroups.reduce((sum, g) => sum + g.presets.length, 0);

    log(`Loaded ${instruments.length} instruments, ${tunings.length} tunings, ${totalConstraints} constraints presets`, "success");
    updateSidebar();
  } catch (error) {
    log(`Failed to load presets: ${error}`, "error");
  }
}

/**
 * Load a specific preset into the application.
 */
async function loadPreset(category: "instruments" | "tunings" | "constraints", path: string) {
  try {
    log(`Loading preset: ${path}...`, "info");
    const response = await fetch(`/api/presets/${path}`);
    const data = await response.json();

    if (data.error) {
      log(`Failed to load preset: ${data.error}`, "error");
      return;
    }

    const id = `preset-${Date.now()}`;

    if (category === "instruments") {
      state.instruments.set(id, data as Instrument);
      state.selectedInstrument = id;
      updateSidebar();
      createInstrumentEditor(data as Instrument, id);
      log(`Loaded instrument preset: ${data.name}`, "success");
    } else if (category === "tunings") {
      state.tunings.set(id, data as Tuning);
      state.selectedTuning = id;
      updateSidebar();
      createTuningEditor(data as Tuning, id);
      log(`Loaded tuning preset: ${data.name}`, "success");
    } else if (category === "constraints") {
      state.constraints.set(id, data as ConstraintsData);
      state.selectedConstraints = id;
      updateSidebar();
      createConstraintsEditor(data as ConstraintsData, id);
      log(`Loaded constraints preset: ${data.constraintsName}`, "success");
    }
  } catch (error) {
    log(`Failed to load preset: ${error}`, "error");
  }
}

/**
 * Toggle a preset folder's expanded state.
 */
function togglePresetFolder(category: "instruments" | "tunings" | "constraints") {
  state.presetsExpanded[category] = !state.presetsExpanded[category];
  updateSidebar();
}

/**
 * Toggle a constraint group folder's expanded state.
 */
function toggleConstraintGroup(groupName: string) {
  state.constraintGroupsExpanded[groupName] = !state.constraintGroupsExpanded[groupName];
  updateSidebar();
}

// Sidebar
function updateSidebar() {
  const instrumentsList = $("#instruments-list");
  const tuningsList = $("#tunings-list");
  const constraintsList = $("#constraints-list");

  if (instrumentsList) {
    instrumentsList.innerHTML = "";

    // Add preset folder if presets are loaded
    if (state.presetsLoaded && state.presetInstruments.length > 0) {
      const presetFolder = document.createElement("li");
      presetFolder.className = "preset-folder";
      const toggle = document.createElement("span");
      toggle.className = "folder-toggle";
      toggle.textContent = state.presetsExpanded.instruments ? "\u25BC" : "\u25B6";
      const label = document.createElement("span");
      label.className = "folder-label";
      label.textContent = `Presets (${state.presetInstruments.length})`;
      presetFolder.appendChild(toggle);
      presetFolder.appendChild(label);
      presetFolder.addEventListener("click", (e) => {
        e.stopPropagation();
        togglePresetFolder("instruments");
      });
      instrumentsList.appendChild(presetFolder);

      // Add preset list (collapsible)
      if (state.presetsExpanded.instruments) {
        const presetList = document.createElement("ul");
        presetList.className = "preset-list";
        for (const preset of state.presetInstruments) {
          const li = document.createElement("li");
          li.textContent = preset.name;
          li.className = "preset-item";
          li.addEventListener("click", (e) => {
            e.stopPropagation();
            loadPreset("instruments", preset.path);
          });
          presetList.appendChild(li);
        }
        instrumentsList.appendChild(presetList);
      }

      // Separator
      if (state.instruments.size > 0) {
        const separator = document.createElement("li");
        separator.className = "separator";
        separator.textContent = "\u2500 Loaded \u2500";
        instrumentsList.appendChild(separator);
      }
    }

    // List loaded instruments
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

    // Add preset folder if presets are loaded
    if (state.presetsLoaded && state.presetTunings.length > 0) {
      const presetFolder = document.createElement("li");
      presetFolder.className = "preset-folder";
      const toggle = document.createElement("span");
      toggle.className = "folder-toggle";
      toggle.textContent = state.presetsExpanded.tunings ? "\u25BC" : "\u25B6";
      const label = document.createElement("span");
      label.className = "folder-label";
      label.textContent = `Presets (${state.presetTunings.length})`;
      presetFolder.appendChild(toggle);
      presetFolder.appendChild(label);
      presetFolder.addEventListener("click", (e) => {
        e.stopPropagation();
        togglePresetFolder("tunings");
      });
      tuningsList.appendChild(presetFolder);

      // Add preset list (collapsible)
      if (state.presetsExpanded.tunings) {
        const presetList = document.createElement("ul");
        presetList.className = "preset-list";
        for (const preset of state.presetTunings) {
          const li = document.createElement("li");
          li.textContent = preset.name;
          li.className = "preset-item";
          li.addEventListener("click", (e) => {
            e.stopPropagation();
            loadPreset("tunings", preset.path);
          });
          presetList.appendChild(li);
        }
        tuningsList.appendChild(presetList);
      }

      // Separator
      if (state.tunings.size > 0) {
        const separator = document.createElement("li");
        separator.className = "separator";
        separator.textContent = "\u2500 Loaded \u2500";
        tuningsList.appendChild(separator);
      }
    }

    // List loaded tunings
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

  if (constraintsList) {
    constraintsList.innerHTML = "";

    // Add preset groups organized by objective function type
    if (state.presetsLoaded && state.presetConstraintGroups.length > 0) {
      const totalConstraints = state.presetConstraintGroups.reduce((sum, g) => sum + g.presets.length, 0);

      const presetFolder = document.createElement("li");
      presetFolder.className = "preset-folder";
      const toggle = document.createElement("span");
      toggle.className = "folder-toggle";
      toggle.textContent = state.presetsExpanded.constraints ? "\u25BC" : "\u25B6";
      const label = document.createElement("span");
      label.className = "folder-label";
      label.textContent = `Presets (${totalConstraints})`;
      presetFolder.appendChild(toggle);
      presetFolder.appendChild(label);
      presetFolder.addEventListener("click", (e) => {
        e.stopPropagation();
        togglePresetFolder("constraints");
      });
      constraintsList.appendChild(presetFolder);

      // Add nested objective function groups (collapsible)
      if (state.presetsExpanded.constraints) {
        const groupsContainer = document.createElement("ul");
        groupsContainer.className = "preset-list constraint-groups";

        for (const group of state.presetConstraintGroups) {
          const groupItem = document.createElement("li");
          groupItem.className = "constraint-group";

          // Group header
          const groupHeader = document.createElement("div");
          groupHeader.className = "constraint-group-header";
          const groupToggle = document.createElement("span");
          groupToggle.className = "folder-toggle";
          groupToggle.textContent = state.constraintGroupsExpanded[group.objectiveFunction] ? "\u25BC" : "\u25B6";
          const groupLabel = document.createElement("span");
          groupLabel.className = "group-label";
          groupLabel.textContent = `${group.displayName} (${group.presets.length})`;
          groupHeader.appendChild(groupToggle);
          groupHeader.appendChild(groupLabel);
          groupHeader.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleConstraintGroup(group.objectiveFunction);
          });
          groupItem.appendChild(groupHeader);

          // Group presets (if expanded)
          if (state.constraintGroupsExpanded[group.objectiveFunction]) {
            const presetList = document.createElement("ul");
            presetList.className = "preset-list group-presets";
            for (const preset of group.presets) {
              const li = document.createElement("li");
              li.textContent = preset.name;
              li.className = "preset-item";
              li.addEventListener("click", (e) => {
                e.stopPropagation();
                loadPreset("constraints", preset.path);
              });
              presetList.appendChild(li);
            }
            groupItem.appendChild(presetList);
          }

          groupsContainer.appendChild(groupItem);
        }

        constraintsList.appendChild(groupsContainer);
      }
    }

    // Add "Load Default" option
    const loadDefaultLi = document.createElement("li");
    loadDefaultLi.textContent = "+ Load Default Constraints";
    loadDefaultLi.className = "action-item";
    loadDefaultLi.addEventListener("click", () => {
      loadDefaultConstraints();
    });
    constraintsList.appendChild(loadDefaultLi);

    // Add "Open File" option
    const openFileLi = document.createElement("li");
    openFileLi.textContent = "+ Open Constraints File...";
    openFileLi.className = "action-item";
    openFileLi.addEventListener("click", () => {
      importConstraintsFile();
    });
    constraintsList.appendChild(openFileLi);

    // Separator if we have loaded constraints
    if (state.constraints.size > 0) {
      const separator = document.createElement("li");
      separator.className = "separator";
      separator.textContent = "\u2500 Loaded \u2500";
      constraintsList.appendChild(separator);
    }

    // List loaded constraints
    state.constraints.forEach((constraints, id) => {
      const li = document.createElement("li");
      li.textContent = constraints.constraintsName || "Untitled";
      li.dataset.id = id;
      li.className = id === state.selectedConstraints ? "selected" : "";
      li.addEventListener("click", () => {
        state.selectedConstraints = id;
        updateSidebar();
        createConstraintsEditor(constraints, id);
      });
      constraintsList.appendChild(li);
    });
  }

  // Expand sections that have items
  $$(".tree-header").forEach((header) => {
    const category = (header as HTMLElement).dataset.category;
    if (category === "instruments" && state.instruments.size > 0) {
      header.classList.add("expanded");
    }
    if (category === "tunings" && state.tunings.size > 0) {
      header.classList.add("expanded");
    }
    if (category === "constraints" && state.constraints.size > 0) {
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
    renderComparisonTable(instruments[0]![0], instruments[1]![0]);
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

// ============================================================================
// Constraints Handling
// ============================================================================

/**
 * Load default constraints for the current optimizer and instrument/tuning.
 */
async function loadDefaultConstraints() {
  if (!state.selectedInstrument || !state.selectedTuning) {
    log("Please select an instrument and tuning first", "warning");
    return;
  }

  const instrument = state.instruments.get(state.selectedInstrument);
  const tuning = state.tunings.get(state.selectedTuning);

  if (!instrument || !tuning) {
    log("Missing instrument or tuning", "error");
    return;
  }

  log(`Loading default constraints for ${state.selectedOptimizer}...`, "info");

  try {
    const response = await fetch("/api/constraints/get", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instrument,
        tuning,
        objectiveFunction: state.selectedOptimizer,
        intent: "default",
        temperature: state.preferences.temperature,
        humidity: state.preferences.humidity,
      }),
    });

    const data = await response.json();

    if (data.error) {
      log(`Error: ${data.error}`, "error");
      return;
    }

    const id = `constraints-${Date.now()}`;
    state.constraints.set(id, data);
    state.selectedConstraints = id;
    updateSidebar();
    createConstraintsEditor(data, id);
    log(`Loaded default constraints for ${data.objectiveDisplayName}`, "success");
  } catch (error) {
    log(`Failed to load constraints: ${error}`, "error");
  }
}

/**
 * Import constraints from a file.
 */
function importConstraintsFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".xml,.json";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const response = await fetch("/api/constraints/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: text,
          lengthType: state.preferences.lengthUnit,
        }),
      });

      const data = await response.json();

      if (data.error) {
        log(`Error: ${data.error}`, "error");
        return;
      }

      const id = `imported-constraints-${Date.now()}`;
      state.constraints.set(id, data);
      state.selectedConstraints = id;
      updateSidebar();
      createConstraintsEditor(data, id);
      log(`Imported constraints: ${data.constraintsName}`, "success");
    } catch (error) {
      log(`Failed to import constraints: ${error}`, "error");
    }
  };
  input.click();
}

/**
 * Export constraints to a file.
 */
async function exportConstraintsFile(constraintsId: string, format: "xml" | "json" = "xml") {
  const constraintsData = state.constraints.get(constraintsId);
  if (!constraintsData) {
    log("No constraints to export", "warning");
    return;
  }

  try {
    const response = await fetch("/api/constraints/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        constraints: constraintsData,
        format,
      }),
    });

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${constraintsData.constraintsName || "constraints"}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    log(`Exported constraints to ${format.toUpperCase()}`, "success");
  } catch (error) {
    log(`Failed to export constraints: ${error}`, "error");
  }
}

/**
 * Create a constraints editor panel.
 */
function createConstraintsEditor(constraintsData: ConstraintsData, id: string): string {
  const tabId = createTab(id, constraintsData.constraintsName || "Constraints");
  const panel = $(`#panel-${tabId}`);
  if (!panel) return tabId;

  // Group constraints by category
  const byCategory = new Map<string, { constraint: Constraint; index: number }[]>();
  constraintsData.constraints.forEach((c, i) => {
    const cat = c.category || "General";
    if (!byCategory.has(cat)) {
      byCategory.set(cat, []);
    }
    byCategory.get(cat)!.push({ constraint: c, index: i });
  });

  panel.innerHTML = `
    <div class="editor-container">
      <div class="editor-header">
        <h2>Constraints Editor</h2>
        <div class="editor-actions">
          <button class="btn" data-action="export-constraints-xml">Export XML</button>
          <button class="btn" data-action="export-constraints-json">Export JSON</button>
          <button class="btn primary" data-action="apply-constraints">Apply to Optimizer</button>
        </div>
      </div>

      <!-- Constraints Info -->
      <div class="editor-section">
        <h3>Constraints Information</h3>
        <div class="form-row">
          <div class="form-group" style="flex: 2">
            <label>Name</label>
            <input type="text" id="constraints-name-${tabId}" value="${constraintsData.constraintsName || ""}" />
          </div>
          <div class="form-group">
            <label>Dimensions</label>
            <input type="text" readonly value="${constraintsData.dimensions || constraintsData.constraints.length}" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group" style="flex: 1">
            <label>Objective Function</label>
            <input type="text" readonly value="${constraintsData.objectiveDisplayName || constraintsData.objectiveFunctionName}" />
          </div>
        </div>
      </div>

      <!-- Constraint Bounds by Category -->
      ${Array.from(byCategory.entries()).map(([category, items]) => `
        <div class="editor-section">
          <h3>${category}</h3>
          <table class="data-table constraints-table">
            <thead>
              <tr>
                <th>Constraint</th>
                <th>Type</th>
                <th>Lower Bound</th>
                <th>Upper Bound</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(({ constraint, index }) => `
                <tr data-constraint-index="${index}">
                  <td>${constraint.name}</td>
                  <td>${constraint.type === ConstraintType.DIMENSIONAL ? "Length" : constraint.type === ConstraintType.DIMENSIONLESS ? "Ratio" : constraint.type}</td>
                  <td><input type="number" step="any" data-field="lower" data-index="${index}" value="${constraintsData.lowerBounds[index] ?? constraint.lowerBound ?? 0}" /></td>
                  <td><input type="number" step="any" data-field="upper" data-index="${index}" value="${constraintsData.upperBounds[index] ?? constraint.upperBound ?? 1e10}" /></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `).join("")}

      ${constraintsData.holeGroups && constraintsData.holeGroups.length > 0 ? `
        <div class="editor-section">
          <h3>Hole Groups</h3>
          <p>Holes that are optimized together:</p>
          <ul>
            ${constraintsData.holeGroups.map((group, i) => `<li>Group ${i + 1}: Holes ${group.join(", ")}</li>`).join("")}
          </ul>
        </div>
      ` : ""}
    </div>
  `;

  // Bind events
  bindConstraintsEditorEvents(tabId, id);

  return tabId;
}

/**
 * Bind events for the constraints editor.
 */
function bindConstraintsEditorEvents(tabId: string, constraintsId: string) {
  const panel = $(`#panel-${tabId}`);
  if (!panel) return;

  // Name change
  const nameInput = panel.querySelector<HTMLInputElement>(`#constraints-name-${tabId}`);
  nameInput?.addEventListener("change", () => {
    const data = state.constraints.get(constraintsId);
    if (data) {
      data.constraintsName = nameInput.value;
    }
  });

  // Bound changes
  panel.querySelectorAll<HTMLInputElement>(".constraints-table input[data-field]").forEach((input) => {
    input.addEventListener("change", () => {
      const data = state.constraints.get(constraintsId);
      if (!data) return;

      const index = parseInt(input.dataset.index || "0");
      const field = input.dataset.field;
      const value = parseFloat(input.value);

      if (field === "lower") {
        data.lowerBounds[index] = value;
        if (data.constraints[index]) {
          data.constraints[index].lowerBound = value;
        }
      } else if (field === "upper") {
        data.upperBounds[index] = value;
        if (data.constraints[index]) {
          data.constraints[index].upperBound = value;
        }
      }
    });
  });

  // Export buttons
  panel.querySelector("[data-action='export-constraints-xml']")?.addEventListener("click", () => {
    exportConstraintsFile(constraintsId, "xml");
  });

  panel.querySelector("[data-action='export-constraints-json']")?.addEventListener("click", () => {
    exportConstraintsFile(constraintsId, "json");
  });

  // Apply constraints
  panel.querySelector("[data-action='apply-constraints']")?.addEventListener("click", () => {
    const data = state.constraints.get(constraintsId);
    if (data) {
      log(`Applied constraints: ${data.constraintsName}`, "success");
      // Store for use in optimization
      state.selectedConstraints = constraintsId;
      updateSidebar();
    }
  });
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
    <style>
      .pref-tabs { display: flex; border-bottom: 1px solid var(--border); margin-bottom: 16px; }
      .pref-tab { padding: 8px 16px; cursor: pointer; border: 1px solid transparent; border-bottom: none; margin-bottom: -1px; background: var(--bg-secondary); }
      .pref-tab.active { background: var(--bg-primary); border-color: var(--border); border-bottom-color: var(--bg-primary); }
      .pref-panel { display: none; }
      .pref-panel.active { display: block; }
      .pref-checkbox { display: flex; align-items: center; gap: 8px; }
      .pref-checkbox input { width: auto; }
    </style>
    <div class="pref-tabs">
      <div class="pref-tab active" data-panel="general">General Study Options</div>
      <div class="pref-tab" data-panel="naf">NAF Study Options</div>
      <div class="pref-tab" data-panel="whistle">Whistle/Flute Options</div>
    </div>

    <div class="pref-panel active" id="panel-general">
      <div class="form-group">
        <label>Study Type</label>
        <select id="pref-study-type">
          <option value="naf" ${state.preferences.studyType === "naf" ? "selected" : ""}>NAF Study</option>
          <option value="whistle" ${state.preferences.studyType === "whistle" ? "selected" : ""}>Whistle Study</option>
          <option value="flute" ${state.preferences.studyType === "flute" ? "selected" : ""}>Flute Study</option>
          <option value="reed" ${state.preferences.studyType === "reed" ? "selected" : ""}>Reed Study</option>
        </select>
      </div>
      <div class="form-group">
        <label>Length Type</label>
        <select id="pref-length-unit">
          <option value="MM" ${state.preferences.lengthUnit === "MM" ? "selected" : ""}>MM</option>
          <option value="IN" ${state.preferences.lengthUnit === "IN" ? "selected" : ""}>IN</option>
        </select>
      </div>
      <div class="form-group">
        <label>Temperature (°C)</label>
        <input type="number" id="pref-temperature" value="${state.preferences.temperature}" step="0.5" />
      </div>
      <div class="form-group">
        <label>Humidity (%)</label>
        <input type="number" id="pref-humidity" value="${state.preferences.humidity}" step="1" min="0" max="100" />
      </div>
      <div class="form-group pref-checkbox">
        <input type="checkbox" id="pref-use-direct" ${state.preferences.useDirectOptimizer ? "checked" : ""} />
        <label for="pref-use-direct">Use DIRECT optimizer (slow & thorough)</label>
      </div>
      <div class="form-group">
        <label>Max Note Spectrum freq (multiplier)</label>
        <input type="number" id="pref-spectrum-mult" value="${state.preferences.maxNoteSpectrumMultiplier}" step="0.01" />
      </div>
    </div>

    <div class="pref-panel" id="panel-naf">
      <div class="form-group">
        <label>Number of starts for multi-Start optimizations</label>
        <input type="number" id="pref-num-starts" value="${state.preferences.numberOfStarts}" step="1" min="1" />
      </div>
    </div>

    <div class="pref-panel" id="panel-whistle">
      <div class="form-group">
        <label>Blowing Level</label>
        <input type="number" id="pref-blowing-level" value="${state.preferences.blowingLevel}" step="1" min="0" max="10" />
      </div>
      <div class="form-group">
        <label>Pressure (kPa)</label>
        <input type="number" id="pref-pressure" value="${state.preferences.pressure}" step="0.001" />
      </div>
      <div class="form-group">
        <label>CO2 (ppm)</label>
        <input type="number" id="pref-co2" value="${state.preferences.co2Ppm}" step="1" />
      </div>
    </div>
  `;

  footer.innerHTML = `
    <button class="btn" data-action="close-modal">Cancel</button>
    <button class="btn primary" id="save-preferences">Save</button>
  `;

  modal.classList.add("open");

  // Tab switching
  $$(".pref-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      $$(".pref-tab").forEach(t => t.classList.remove("active"));
      $$(".pref-panel").forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      const panelId = tab.getAttribute("data-panel");
      $(`#panel-${panelId}`)?.classList.add("active");
    });
  });

  $("#save-preferences")?.addEventListener("click", () => {
    // Read all values
    const oldPrefs = { ...state.preferences };

    state.preferences.temperature = parseFloat(($<HTMLInputElement>("#pref-temperature"))?.value || "20");
    state.preferences.humidity = parseFloat(($<HTMLInputElement>("#pref-humidity"))?.value || "45");
    state.preferences.lengthUnit = ($<HTMLSelectElement>("#pref-length-unit"))?.value as "MM" | "IN" || "MM";
    state.preferences.studyType = ($<HTMLSelectElement>("#pref-study-type"))?.value || "naf";
    state.preferences.useDirectOptimizer = ($<HTMLInputElement>("#pref-use-direct"))?.checked || false;
    state.preferences.maxNoteSpectrumMultiplier = parseFloat(($<HTMLInputElement>("#pref-spectrum-mult"))?.value || "3.17");
    state.preferences.numberOfStarts = parseInt(($<HTMLInputElement>("#pref-num-starts"))?.value || "30", 10);
    state.preferences.blowingLevel = parseInt(($<HTMLInputElement>("#pref-blowing-level"))?.value || "5", 10);
    state.preferences.pressure = parseFloat(($<HTMLInputElement>("#pref-pressure"))?.value || "101.325");
    state.preferences.co2Ppm = parseInt(($<HTMLInputElement>("#pref-co2"))?.value || "390", 10);

    modal.classList.remove("open");
    log("Preferences saved", "success");

    // Output air properties to console (like Java does)
    logAirProperties();
  });
}

// Log air properties to console (mimics Java behavior)
function logAirProperties() {
  const { temperature, humidity, pressure, co2Ppm } = state.preferences;

  // Calculate speed of sound using simplified formula
  // Full calculation is done server-side, this is just for display
  const tempK = temperature + 273.15;
  const gamma = 1.4;
  const R = 287.05; // J/(kg·K) for dry air
  const speedOfSound = Math.sqrt(gamma * R * tempK);

  // Simplified density calculation
  const density = (pressure * 1000) / (R * tempK);

  // Simplified epsilon factor (this is approximate)
  const epsilon = 1.613e-3;

  log(`Properties of air at ${temperature.toFixed(2)} C, ${pressure.toFixed(3)} kPa, ${humidity}% humidity, ${co2Ppm} ppm CO2:`);
  log(`Speed of sound is ${speedOfSound.toFixed(3)} m/s.`);
  log(`Density is ${density.toFixed(4)} kg/m^3.`);
  log(`Epsilon factor is ${epsilon.toExponential(3)}.`);
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

  // Get display name for selected optimizer
  const optimizerDisplayNames: Record<string, string> = {
    FippleFactorObjectiveFunction: "Fipple factor",
    HolePositionObjectiveFunction: "Hole size & position",
    HoleSizeObjectiveFunction: "Hole size only",
    HoleGroupPositionObjectiveFunction: "Grouped-hole position & size",
    SingleTaperHoleGroupObjectiveFunction: "Single taper, grouped hole",
    SingleTaperHemiHeadGroupedHoleObjectiveFunction: "Single taper, hemi-head, grouped hole",
    SingleTaperHemiHeadNoHoleGroupingObjectiveFunction: "Single taper, hemi-head, no hole grouping",
    SingleTaperNoHoleGroupingObjectiveFunction: "Single taper, no hole grouping",
  };
  const optimizerName = optimizerDisplayNames[state.selectedOptimizer] || state.selectedOptimizer;

  title.textContent = "Optimize Instrument";
  content.innerHTML = `
    <div class="form-group">
      <label>Optimizer (selected in sidebar)</label>
      <input type="text" readonly value="${optimizerName}" />
    </div>
    <div class="form-group">
      <label>Selected Instrument</label>
      <input type="text" readonly value="${state.instruments.get(state.selectedInstrument!)?.name || ""}" />
    </div>
    <div class="form-group">
      <label>Selected Tuning</label>
      <input type="text" readonly value="${state.tunings.get(state.selectedTuning!)?.name || ""}" />
    </div>
    <p style="margin-top: 12px; color: var(--text-secondary); font-size: 12px;">
      Change optimizer selection in the sidebar before clicking Optimize.
    </p>
  `;

  footer.innerHTML = `
    <button class="btn" data-action="close-modal">Cancel</button>
    <button class="btn primary" id="run-optimize">Optimize</button>
  `;

  modal.classList.add("open");

  $("#run-optimize")?.addEventListener("click", () => {
    modal.classList.remove("open");
    optimizeInstrument(state.selectedInstrument!, state.selectedTuning!, state.selectedOptimizer);
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

  // Optimizer selection
  $$("#optimizer-list li").forEach((li) => {
    li.addEventListener("click", () => {
      $$("#optimizer-list li").forEach((item) => item.classList.remove("selected"));
      li.classList.add("selected");
      state.selectedOptimizer = (li as HTMLElement).dataset.value || "HolePositionObjectiveFunction";
      log(`Selected optimizer: ${li.textContent}`, "info");
    });
  });

  // Multi-start optimization selection
  $$("#multistart-list li").forEach((li) => {
    li.addEventListener("click", () => {
      $$("#multistart-list li").forEach((item) => item.classList.remove("selected"));
      li.classList.add("selected");
      state.selectedMultistart = (li as HTMLElement).dataset.value || "none";
      log(`Multi-start: ${li.textContent}`, "info");
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
      case "open-constraints":
        importConstraintsFile();
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

  // Initialize keyboard shortcuts
  initKeyboardShortcuts();

  log("WWIDesigner Web ready", "success");

  // Load presets on startup
  loadAllPresets();
}

// Start
document.addEventListener("DOMContentLoaded", init);
