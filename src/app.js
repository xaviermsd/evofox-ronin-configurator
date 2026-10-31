import { 
  DEVICE_CONFIG, 
  COLOR_PALETTE, 
  BACKLIGHT_MODES, 
  BOXLIGHT_MODES, 
  SLEEP_LEVELS, 
  RESPONSE_LEVELS, 
  GRADIENT_PALETTE,
  FN_LAYER_MODES,
  FN_LAYER_RESERVED_CODES,
  KEYBOARD_LAYOUT, 
  AVAILABLE_REMAP_KEYS,
  KEYBOARD_SHORTCUTS
} from './config.js';

import { EvoFoxRoninHID } from './protocol.js';
import { KeyboardLightingVisualizer } from './lighting_visualizer.js';
import { icon, spot, MODE_ICON } from './icons.js';
import { createToaster } from './toast.js';
import { initDialogs, initIcons, initClickables, delayedFlag, registerUndo, initUndoShortcut } from './ui.js';
import { spinner, busyButton, busySection, hideSplash } from './feedback.js';
import { enhanceAllSelects } from './select.js';

// Safety net: never leave the first-load splash up if start-up throws.
setTimeout(hideSplash, 5000);

// ==========================================================================
// Application State
// ==========================================================================
const state = {
  driver: null,
  visualizerBacklight: null,
  visualizerDashboard: null,
  visualizerConnect: null,
  systemEnv: null,
  liveSync: true,
  activeTab: 'tab-dashboard',
  autoDemoActive: false,
  verifiedHwLightMode: 1, // Hardware committed mode tracker
  backlight: {
    mode: 1,
    brightness: 5,
    speed: 3,
    direction: 0,
    colorIndex: 7
  },
  boxlight: {
    mode: 1,
    brightness: 5,
    speed: 3
  },
  settings: {
    sleepLevel: 1,      // official default: 2 min light / 30 min deep sleep
    responseLevel: 1,   // official default: level 1 (fastest)
    fnLayerMode: 0      // 0 = hold Fn, 1 = press once
  },
  remap: {
    layer: 0,
    activeKey: null,
    overrides: {} // layer_idx -> { name, code }
  },
  customRgb: {
    brushColor: '#FF0000', // official default brush: red (keys start off = #000000)
    keyColors: {}, // keyIndex -> hexColor
    history: []    // Undo stack
  },
  profiles: {
    current: 'default',
    list: {
      default: { name: 'Default Profile' },
      gaming: { name: 'Gaming FPS' },
      night: { name: 'Nocturnal Coding' }
    }
  }
};

// ==========================================================================
// Session memory: the last settings you applied are kept in this browser
// (localStorage only, never sent anywhere) and restored on reload, so the
// controls match what the keyboard is already showing.
// ==========================================================================
const SESSION_KEY = 'evofox_last_session';

// Layout v1 (app builds before this fix) used wrong key indices from the Tab
// row down. v2 uses the official table. Saved per-key colours and remaps are
// keyed by index, so v1 data is moved to the new indices exactly once.
const LAYOUT_VERSION = 2;
const V1_TO_V2_INDEX = {"30":45,"31":46,"32":47,"33":48,"34":49,"35":50,"36":51,"37":52,"38":53,"39":54,"40":55,"41":56,"42":57,"45":58,"46":59,"47":60,"48":61,"49":62,"50":63,"51":64,"52":65,"53":66,"54":67,"55":68,"56":69,"57":70,"58":32,"59":41,"60":79,"61":80,"62":81,"63":82,"64":83,"65":84,"66":85,"67":86,"68":87,"69":88,"70":89,"71":90,"72":78,"73":91,"74":92,"75":93,"76":94,"77":95,"78":97,"80":100,"81":99};
const migrateIndex = (i) => (V1_TO_V2_INDEX[i] ?? Number(i));
function migrateKeyColors(colors = {}) {
  const out = {};
  for (const [i, c] of Object.entries(colors)) out[migrateIndex(i)] = c;
  return out;
}
function migrateRemaps(remaps = {}) {
  const out = {};
  for (const [k, v] of Object.entries(remaps)) {
    const [layer, i] = k.split('_');
    out[`${layer}_${migrateIndex(i)}`] = v;
  }
  return out;
}
function migrateProfile(p) {
  if (!p) return p;
  return { ...p, customRgb: migrateKeyColors(p.customRgb), remaps: migrateRemaps(p.remaps) };
}
let sessionTimer = null;

function saveSession() {
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(writeSession, 200);
}

function writeSession() {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      v: LAYOUT_VERSION,
      backlight: state.backlight,
      boxlight: state.boxlight,
      settings: state.settings,
      remaps: state.remap.overrides,
      customRgb: state.customRgb.keyColors,
      liveSync: state.liveSync,
      profile: state.profiles.current,
      verifiedHwLightMode: state.verifiedHwLightMode,
      lastPid: state.lastPid ?? null
    }));
  } catch (e) { /* storage blocked (private window): nothing to keep */ }
}

function restoreSession() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { saved = null; }
  if (!saved || (saved.v !== 1 && saved.v !== LAYOUT_VERSION)) return false;
  if (saved.v === 1) {
    saved.customRgb = migrateKeyColors(saved.customRgb);
    saved.remaps = migrateRemaps(saved.remaps);
  }
  const num = (v, lo, hi, d) => (Number.isInteger(v) && v >= lo && v <= hi ? v : d);
  const b = saved.backlight || {};
  state.backlight = {
    mode: BACKLIGHT_MODES.some(m => m.id === b.mode) ? b.mode : state.backlight.mode,
    brightness: num(b.brightness, 1, 5, state.backlight.brightness),
    speed: num(b.speed, 1, 5, state.backlight.speed),
    direction: 0,   // no Ronin effect takes a direction from software
    colorIndex: num(b.colorIndex, 0, 7, state.backlight.colorIndex)
  };
  const x = saved.boxlight || {};
  state.boxlight = {
    mode: num(x.mode, 1, BOXLIGHT_MODES.length, state.boxlight.mode),
    brightness: num(x.brightness, 1, 5, state.boxlight.brightness),
    speed: num(x.speed, 1, 5, state.boxlight.speed)
  };
  const st = saved.settings || {};
  state.settings = {
    sleepLevel: num(st.sleepLevel, 1, 4, state.settings.sleepLevel),
    responseLevel: num(st.responseLevel, 1, 3, state.settings.responseLevel),
    fnLayerMode: num(st.fnLayerMode, 0, 1, state.settings.fnLayerMode)
  };
  if (saved.remaps && typeof saved.remaps === 'object') state.remap.overrides = saved.remaps;
  if (saved.customRgb && typeof saved.customRgb === 'object') state.customRgb.keyColors = saved.customRgb;
  if (typeof saved.liveSync === 'boolean') state.liveSync = saved.liveSync;
  if (typeof saved.profile === 'string') state.profiles.current = saved.profile;
  state.verifiedHwLightMode = Number.isInteger(saved.verifiedHwLightMode) ? saved.verifiedHwLightMode : state.backlight.mode;
  if (saved.lastPid === 0xA157 || saved.lastPid === 0x8FF0) state.lastPid = saved.lastPid;
  return true;
}

let updateModeGuideRef = null;   // set by initControls

// Push the values in `state` back into every control (after restore or profile load).
function syncControlsFromState() {
  const set = (el, v) => { if (el) el.value = String(v); };
  set(els.lightModeSelect, state.backlight.mode);
  updateModeGuideRef?.(state.backlight.mode);
  set(els.sliderBrightness, state.backlight.brightness);
  if (els.valBrightness) els.valBrightness.textContent = state.backlight.brightness;
  set(els.sliderSpeed, state.backlight.speed);
  if (els.valSpeed) els.valSpeed.textContent = state.backlight.speed;
  renderPalette();
  applyModeCapabilities(state.backlight.mode);

  set(els.boxlightModeSelect, state.boxlight.mode);
  const box = BOXLIGHT_MODES.find(m => m.id === state.boxlight.mode);
  if (els.boxlightModeDesc) els.boxlightModeDesc.textContent = box ? box.desc : '';
  if (els.pillEffectName) els.pillEffectName.textContent = box ? box.name : 'Custom';
  set(els.sliderBoxBrightness, state.boxlight.brightness);
  if (els.valBoxBrightness) els.valBoxBrightness.textContent = state.boxlight.brightness;
  if (els.pillBrightness) els.pillBrightness.textContent = `${state.boxlight.brightness} / 5`;
  set(els.sliderBoxSpeed, state.boxlight.speed);
  if (els.valBoxSpeed) els.valBoxSpeed.textContent = state.boxlight.speed;
  if (els.pillSpeed) els.pillSpeed.textContent = `${state.boxlight.speed} / 5`;

  set(els.selectSleepLevel, state.settings.sleepLevel);
  set(els.selectResponseLevel, state.settings.responseLevel);
  set(els.selectFnLayerMode, state.settings.fnLayerMode);
  if (els.checkLiveSync) els.checkLiveSync.checked = state.liveSync;
  if (els.selectProfileList && state.profiles.list[state.profiles.current]) els.selectProfileList.value = state.profiles.current;
  updateLightingStateBar();
  paintRanges();
  updateLiveSyncHint();
}

// ==========================================================================
// UI Elements Mapping
// ==========================================================================
const els = {
  // Navigation & Shell
  sidebarNav: document.getElementById('sidebarNav'),
  viewHeading: document.getElementById('viewHeading'),
  viewSubheading: document.getElementById('viewSubheading'),
  navButtons: document.querySelectorAll('.nav-item'),
  tabPanes: document.querySelectorAll('.tab-pane'),
  toastContainer: document.getElementById('toastContainer'),

  // Header Telemetry
  btnConnect: document.getElementById('btnConnect'),
  statusBadge: document.getElementById('statusBadge'),
  statusText: document.getElementById('statusText'),
  batteryPill: document.getElementById('batteryPill'),
  batteryFill: document.getElementById('batteryFill'),
  batteryText: document.getElementById('batteryText'),
  chargeIcon: document.getElementById('chargeIcon'),
  fwBadge: document.getElementById('fwBadge'),
  fwVersion: document.getElementById('fwVersion'),
  logConsole: document.getElementById('logConsole'),
  btnClearLogs: document.getElementById('btnClearLogs'),

  // Dashboard Overview Views
  dashDisconnectedView: document.getElementById('dashDisconnectedView'),
  dashConnectedView: document.getElementById('dashConnectedView'),
  dashConnectedMode: document.getElementById('dashConnectedMode'),
  dashConnectedBattery: document.getElementById('dashConnectedBattery'),
  dashConnectedFw: document.getElementById('dashConnectedFw'),
  btnDashDisconnect: document.getElementById('btnDashDisconnect'),
  btnWelcomeConnect: document.getElementById('btnWelcomeConnect'),
  btnWelcomeGuide: document.getElementById('btnWelcomeGuide'),
  keyboardStageDashboard: document.getElementById('keyboardStageDashboard'),

  // Guided Connection Screen Elements
  envCompatibilityWrap: document.getElementById('envCompatibilityWrap'),
  connectStageHero: document.getElementById('connectStageHero'),
  roninScene: document.getElementById('roninScene'),
  connectHeroStatus: document.getElementById('connectHeroStatus'),
  connectHeroStatusDot: document.getElementById('connectHeroStatusDot'),
  connectHeroStatusText: document.getElementById('connectHeroStatusText'),
  btnHeroConnect: document.getElementById('btnHeroConnect'),
  btnToggleConnectHelp: document.getElementById('btnToggleConnectHelp'),
  troubleshootToggleArrow: document.getElementById('troubleshootToggleArrow'),
  troubleshootDrawerContent: document.getElementById('troubleshootDrawerContent'),

  incompatibleModal: document.getElementById('incompatibleModal'),
  btnCloseIncompatibleModal: document.getElementById('btnCloseIncompatibleModal'),
  btnAcknowledgeIncompatible: document.getElementById('btnAcknowledgeIncompatible'),

  // Quick Navigation Status Tags
  quickLightStatus: document.getElementById('quickLightStatus'),
  quickUnderglowStatus: document.getElementById('quickUnderglowStatus'),
  quickRemapStatus: document.getElementById('quickRemapStatus'),
  quickProfileStatus: document.getElementById('quickProfileStatus'),
  quickSettingsStatus: document.getElementById('quickSettingsStatus'),

  // Connection Required Banners on Hardware Tabs
  connReqBacklight: document.getElementById('connReqBacklight'),
  connReqUnderglow: document.getElementById('connReqUnderglow'),
  connReqKeymap: document.getElementById('connReqKeymap'),
  connReqCustomRgb: document.getElementById('connReqCustomRgb'),
  connReqSettings: document.getElementById('connReqSettings'),

  // Control Grids (dimmed when disconnected)
  backlightControlGrid: document.getElementById('backlightControlGrid'),
  sidestripControlGrid: document.getElementById('sidestripControlGrid'),
  keymapControlGrid: document.getElementById('keymapControlGrid'),
  customRgbControlGrid: document.getElementById('customRgbControlGrid'),
  settingsControlGrid: document.getElementById('settingsControlGrid'),

  // Backlight Controls
  checkLiveSync: document.getElementById('checkLiveSync'),
  modePickerGrid: document.getElementById('modePickerGrid'),
  lightModeSelect: document.getElementById('lightModeSelect'),
  lightModeDesc: document.getElementById('lightModeDesc'),
  reactiveGuideBar: document.getElementById('reactiveGuideBar'),
  reactiveGuideText: document.getElementById('reactiveGuideText'),
  btnToggleAutoDemo: document.getElementById('btnToggleAutoDemo'),
  sliderBrightness: document.getElementById('sliderBrightness'),
  valBrightness: document.getElementById('valBrightness'),
  sliderSpeed: document.getElementById('sliderSpeed'),
  valSpeed: document.getElementById('valSpeed'),
  fieldPalette: document.getElementById('fieldPalette'),
  paletteLabel: document.getElementById('paletteLabel'),
  fieldBrightness: document.getElementById('fieldBrightness'),
  fieldSpeed: document.getElementById('fieldSpeed'),
  modeCapsHint: document.getElementById('modeCapsHint'),
  selectFnLayerMode: document.getElementById('selectFnLayerMode'),
  colorPaletteContainer: document.getElementById('colorPaletteContainer'),
  btnApplyLight: document.getElementById('btnApplyLight'),
  keyboardStageBacklight: document.getElementById('keyboardStageBacklight'),

  // Quick Presets
  presetRainbowWave: document.getElementById('presetRainbowWave'),
  presetCyberpunk: document.getElementById('presetCyberpunk'),
  presetBreathing: document.getElementById('presetBreathing'),
  presetStealth: document.getElementById('presetStealth'),

  // Underglow (Side Strip)
  boxlightModeSelect: document.getElementById('boxlightModeSelect'),
  boxlightModeDesc: document.getElementById('boxlightModeDesc'),
  sliderBoxBrightness: document.getElementById('sliderBoxBrightness'),
  valBoxBrightness: document.getElementById('valBoxBrightness'),
  sliderBoxSpeed: document.getElementById('sliderBoxSpeed'),
  valBoxSpeed: document.getElementById('valBoxSpeed'),
  btnApplyBoxlight: document.getElementById('btnApplyBoxlight'),
  pillEffectName: document.getElementById('pillEffectName'),
  pillBrightness: document.getElementById('pillBrightness'),
  pillSpeed: document.getElementById('pillSpeed'),

  // Key Remapping
  selectRemapLayer: document.getElementById('selectRemapLayer'),
  btnResetRemaps: document.getElementById('btnResetRemaps'),
  keyboardStageRemap: document.getElementById('keyboardStageRemap'),
  remapModal: document.getElementById('remapModal'),
  btnCloseModal: document.getElementById('btnCloseModal'),
  modalKeyTitle: document.getElementById('modalKeyTitle'),
  modalKeyInfo: document.getElementById('modalKeyInfo'),
  remapGroupsContainer: document.getElementById('remapGroupsContainer'),
  inspectorKeyIndex: document.getElementById('inspectorKeyIndex'),
  inspectorKeyName: document.getElementById('inspectorKeyName'),
  inspectorCurrentBinding: document.getElementById('inspectorCurrentBinding'),
  btnOpenRemapPicker: document.getElementById('btnOpenRemapPicker'),

  // Custom RGB Designer
  pickerCustomRgb: document.getElementById('pickerCustomRgb'),
  brushColorHex: document.getElementById('brushColorHex'),
  customRgbSwatches: document.getElementById('customRgbSwatches'),
  btnUndoCustomRgb: document.getElementById('btnUndoCustomRgb'),
  btnSetAllKeys: document.getElementById('btnSetAllKeys'),
  btnUploadCustomRgb: document.getElementById('btnUploadCustomRgb'),
  keyboardStageCustomRgb: document.getElementById('keyboardStageCustomRgb'),

  // Profiles & Backup
  selectProfileList: document.getElementById('selectProfileList'),
  inputNewProfileName: document.getElementById('inputNewProfileName'),
  btnCreateProfile: document.getElementById('btnCreateProfile'),
  btnDeleteProfile: document.getElementById('btnDeleteProfile'),
  btnExportProfileJson: document.getElementById('btnExportProfileJson'),
  btnImportProfileJson: document.getElementById('btnImportProfileJson'),
  fileProfileInput: document.getElementById('fileProfileInput'),

  // Device Settings
  selectSleepLevel: document.getElementById('selectSleepLevel'),
  selectResponseLevel: document.getElementById('selectResponseLevel'),
  btnApplySettings: document.getElementById('btnApplySettings'),
  btnFactoryReset: document.getElementById('btnFactoryReset'),

  // Modals & Overlay
  btnOpenTroubleshoot: document.getElementById('btnOpenTroubleshoot'),
  troubleshootModal: document.getElementById('troubleshootModal'),
  btnCloseTroubleshoot: document.getElementById('btnCloseTroubleshoot'),
  btnCloseTroubleshootFooter: document.getElementById('btnCloseTroubleshootFooter'),
  btnTroubleshootConnect: document.getElementById('btnTroubleshootConnect'),
  btnDashOpenGuide: document.getElementById('btnDashOpenGuide'),
  guideSearchInput: document.getElementById('guideSearchInput'),
  guideCatNav: document.getElementById('guideCatNav'),
  guideShortcutsContainer: document.getElementById('guideShortcutsContainer'),
  pageGuideSearchInput: document.getElementById('pageGuideSearchInput'),
  pageGuideCatNav: document.getElementById('pageGuideCatNav'),
  pageGuideShortcutsContainer: document.getElementById('pageGuideShortcutsContainer'),
  pageSlotsRow: document.getElementById('pageSlotsRow'),
  pageModeDrawer: document.getElementById('pageModeDrawer'),
  pageModeContent: document.getElementById('pageModeContent'),

  // Hardware Mode Centre & Lighting State Elements
  dashVerifiedPipeVal: document.getElementById('dashVerifiedPipeVal'),
  dashVerifiedPipeIcon: document.getElementById('dashVerifiedPipeIcon'),
  dashVerifiedPipeTitle: document.getElementById('dashVerifiedPipeTitle'),
  dashVerifiedPipeDesc: document.getElementById('dashVerifiedPipeDesc'),
  dashVerifiedPipeBadge: document.getElementById('dashVerifiedPipeBadge'),
  dashSlotsRow: document.getElementById('dashSlotsRow'),
  dashModeDrawer: document.getElementById('dashModeDrawer'),
  dashModeContent: document.getElementById('dashModeContent'),
  welcomeSlotsRow: document.getElementById('welcomeSlotsRow'),
  welcomeModeDrawer: document.getElementById('welcomeModeDrawer'),
  welcomeModeContent: document.getElementById('welcomeModeContent'),
  badgeHwLightMode: document.getElementById('badgeHwLightMode'),
  lblSelectedLightMode: document.getElementById('lblSelectedLightMode'),
  badgePendingLight: document.getElementById('badgePendingLight'),

  resetConfirmModal: document.getElementById('resetConfirmModal'),
  btnCloseResetModal: document.getElementById('btnCloseResetModal'),
  btnCancelReset: document.getElementById('btnCancelReset'),
  btnConfirmReset: document.getElementById('btnConfirmReset'),

  loadingOverlay: document.getElementById('loadingOverlay'),
  loadingTitle: document.getElementById('loadingTitle'),
  loadingDesc: document.getElementById('loadingDesc'),
  loadingProgressWrap: document.getElementById('loadingProgressWrap'),
  loadingProgressBar: document.getElementById('loadingProgressBar'),
  loadingReassure: document.getElementById('loadingReassure'),
  saveState: document.getElementById('saveState'),
  connectErrorCard: document.getElementById('connectErrorCard'),
  dropVeil: document.getElementById('dropVeil')
};

// ==========================================================================
// Reusable Toast Notification System (4 States, Inline SVGs, Auto-Dismiss)
// ==========================================================================
const toaster = els.toastContainer ? createToaster(els.toastContainer) : null;

/**
 * Show a toast. Kinds: success | error | warning | info | busy.
 * duration: ms (omit for the kind default: 3.5s / 6s / 8s, busy = sticky).
 * opts: { action: { label, onClick }, id, progress }
 */
function showToast(title, message, type = 'info', duration, opts = {}) {
  if (!toaster) return null;
  return toaster.show({ kind: type, title, message, duration, ...opts });
}

// ==========================================================================
// Branded Fullscreen Loading Screen Overlay
// ==========================================================================
let loadingReassureTimer = null;
const loadingFlag = delayedFlag(
  () => els.loadingOverlay?.classList.add('active'),
  () => els.loadingOverlay?.classList.remove('active', 'is-done')
);

// Progress values are ignored: none of these steps report real progress,
// so the bar stays indeterminate (guide principle 9: never fake progress).
function showLoading(title = 'Connecting to EvoFox Ronin...', desc = 'Negotiating WebHID pipe and reading MCU state...') {
  if (!els.loadingOverlay) return;
  els.loadingTitle.textContent = title;
  els.loadingDesc.textContent = desc;
  els.loadingOverlay.classList.remove('is-done');
  if (els.loadingReassure) els.loadingReassure.hidden = true;
  clearTimeout(loadingReassureTimer);
  loadingReassureTimer = setTimeout(() => {
    if (els.loadingReassure) {
      els.loadingReassure.textContent = 'Still working. Keep the keyboard awake and connected.';
      els.loadingReassure.hidden = false;
    }
  }, 10000);
  loadingFlag.start();
}

function updateLoading(title, desc, progress = null) {
  if (title && els.loadingTitle) els.loadingTitle.textContent = title;
  if (desc && els.loadingDesc) els.loadingDesc.textContent = desc;
  if (progress === 100) els.loadingOverlay?.classList.add('is-done');
}

function hideLoading() {
  clearTimeout(loadingReassureTimer);
  loadingFlag.stop();
}

// ==========================================================================
// Save state (autosave pattern): Saving… → Saved ✓ → Couldn't save + Retry
// ==========================================================================
let saveStateTimer = null;
function setSaveState(kind, retry) {
  const el = els.saveState;
  if (!el) return;
  clearTimeout(saveStateTimer);
  el.className = 'save-state';
  if (kind === 'saving') {
    el.classList.add('is-saving');
    el.innerHTML = `${spinner(12)}<span>Saving…</span>`;
  } else if (kind === 'saved') {
    el.classList.add('is-saved');
    el.innerHTML = `${icon('check', 15)}<span>Saved</span>`;
    saveStateTimer = setTimeout(() => {
      el.classList.add('is-fading');
      saveStateTimer = setTimeout(() => { el.className = 'save-state is-idle'; el.innerHTML = ''; }, 220);
    }, 2000);
  } else if (kind === 'error') {
    el.classList.add('is-error');
    el.innerHTML = `${icon('alert', 15)}<span>Couldn't save</span><button type="button" class="retry">Retry</button>`;
    el.querySelector('.retry')?.addEventListener('click', () => retry?.());
  } else {
    el.className = 'save-state is-idle';
    el.innerHTML = '';
  }
}

/**
 * Run a hardware write with the shared feedback system: busy button (spinner +
 * label, double-submit guard), optional card overlay, save indicator, and a
 * toast only once the write has really succeeded or failed (with Retry).
 */
async function runHardwareWrite(btn, fn, { success, errorTitle = "Couldn't save", busyLabel = 'Saving…', section = null, sectionLabel } = {}) {
  const restore = btn ? busyButton(btn, busyLabel) : () => {};
  if (restore === null) return false;                 // already running: ignore the extra click
  const done = section ? busySection(section, sectionLabel || busyLabel) : () => {};
  setSaveState('saving');
  try {
    await fn();
    setSaveState('saved');
    if (success) showToast(success[0], success[1], 'success');
    return true;
  } catch (err) {
    const retry = () => runHardwareWrite(btn, fn, { success, errorTitle, busyLabel, section, sectionLabel });
    setSaveState('error', retry);
    showToast(errorTitle, err?.message || 'The keyboard did not answer.', 'error', undefined, { action: { label: 'Retry', onClick: retry } });
    return false;
  } finally {
    restore();
    done();
  }
}

// ==========================================================================
// Terminal Diagnostics Logging
// ==========================================================================
function appendLog(msg, type = 'info') {
  const time = new Date().toLocaleTimeString();
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${time}] ${msg}`;
  if (els.logConsole) {
    els.logConsole.appendChild(entry);
    els.logConsole.scrollTop = els.logConsole.scrollHeight;
  }
}

// ==========================================================================
// Driver Instance & Debounced Hardware Sync
// ==========================================================================
state.driver = new EvoFoxRoninHID((msg, type) => appendLog(msg, type));
state.driver.onStatusChange = () => {
  updateUI();
};

let syncTimeout = null;
function triggerHardwareSync({ write = true } = {}) {
  saveSession();
  const params = {
    mode: state.backlight.mode,
    brightness: state.backlight.brightness,
    speed: state.backlight.speed,
    direction: state.backlight.direction,
    colorIndex: state.backlight.colorIndex,
    customColors: state.customRgb.keyColors,
    boxlightMode: state.boxlight.mode,
    boxBrightness: state.boxlight.brightness,
    boxSpeed: state.boxlight.speed
  };

  // Update visualizer parameters
  if (state.visualizerBacklight) state.visualizerBacklight.updateParams(params);
  if (state.visualizerDashboard) state.visualizerDashboard.updateParams(params);

  // Transmit to hardware only if device is connected, online, and Live Sync is enabled
  if (write && state.driver && state.driver.isConnected && state.driver.isOnline && state.liveSync) {
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(async () => {
      // Optimistic: the preview already shows the change; write in the background.
      setSaveState('saving');
      try {
        await state.driver.setLightMode(state.backlight);
        state.verifiedHwLightMode = state.backlight.mode;
        updateLightingStateBar();
        setSaveState('saved');
      } catch (e) {
        console.warn('Sync failed:', e.message);
        // Roll back the "applied" claim: the pending badge stays until a write succeeds.
        updateLightingStateBar();
        setSaveState('error', triggerHardwareSync);
        showToast("Couldn't sync lighting", e.message, 'error', undefined, { id: 'sync-error', action: { label: 'Retry', onClick: triggerHardwareSync } });
      }
    }, 75);
  }
}

// ==========================================================================
// View Routing & Animation Lifecycle Management
// ==========================================================================
const VIEW_METADATA = {
  'tab-dashboard': { section: 'Overview',  title: 'Dashboard',          sub: 'Your keyboard at a glance' },
  'tab-backlight': { section: 'Customise', title: 'RGB Lighting',       sub: 'Pick an effect, tune it and watch it live' },
  'tab-customrgb': { section: 'Customise', title: 'Custom RGB',         sub: 'Paint each key and save it to the keyboard' },
  'tab-keymap':    { section: 'Customise', title: 'Key Remapping',      sub: 'Change what any key does, on both layers' },
  'tab-profiles':  { section: 'Manage',    title: 'Profiles & Backup',  sub: 'Save, switch and share your setups' },
  'tab-settings':  { section: 'Manage',    title: 'Device Settings',    sub: 'Sleep timer, key response, Fn layer and reset' },
  'tab-guide':     { section: 'Help',      title: 'Shortcuts & Guide',  sub: 'Every Fn shortcut and how to connect' }
};

// ==========================================================================
// Comprehensive Device & Browser Compatibility Detection
// ==========================================================================
function checkSystemEnvironment() {
  const ua = (navigator.userAgent || navigator.vendor || window.opera || '').toLowerCase();
  
  // 1. Mobile OS regex (Android, iOS, iPadOS, Windows Phone, etc.)
  const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|silk|fennec|windows phone/i.test(ua);
  
  // 2. iPad on iOS 13+ detection (reports MacIntel, but has multi-touch)
  const isIPadOS = (navigator.platform === 'MacIntel' || ua.includes('macintosh')) && (navigator.maxTouchPoints > 1);
  
  // 3. Small screen viewport (supports mobile phones, tablets, Chrome DevTools device mode)
  const isSmallScreen = window.innerWidth <= 860;

  // Comprehensive mobile evaluation:
  const isMobile = isMobileUA || isIPadOS || isSmallScreen;

  // WebHID Standard Support Detection
  const hasWebHID = typeof navigator !== 'undefined' && 'hid' in navigator && typeof navigator.hid.requestDevice === 'function';

  // Browser Identification for tailored guidance
  let browserName = 'Current Browser';
  if (ua.includes('edg/')) browserName = 'Microsoft Edge';
  else if (ua.includes('opr/') || ua.includes('opera')) browserName = 'Opera';
  else if (ua.includes('brave') || (navigator.brave && typeof navigator.brave.isBrave === 'function')) browserName = 'Brave';
  else if (ua.includes('chrome')) browserName = 'Google Chrome';
  else if (ua.includes('firefox')) browserName = 'Mozilla Firefox';
  else if (ua.includes('safari') && !ua.includes('chrome')) browserName = 'Apple Safari';

  let status = 'DESKTOP_READY';
  if (isMobile) {
    status = 'MOBILE';
  } else if (!hasWebHID) {
    status = 'UNSUPPORTED_BROWSER';
  } else {
    status = 'DESKTOP_READY';
  }

  return {
    isMobile,
    isSmallScreen,
    hasWebHID,
    browserName,
    status
  };
}

function renderEnvironmentStatus(env) {
  if (!els.envCompatibilityWrap) return;
  
  if (env.status === 'MOBILE') {
    document.body.classList.add('is-mobile');
    els.envCompatibilityWrap.innerHTML = `
      <div class="env-compatibility-banner mobile-env">
        <div class="env-banner-icon">${icon('phone', 26)}</div>
        <div class="env-banner-body">
          <div class="env-banner-badge mobile-badge">Phone or tablet</div>
          <h3 class="env-banner-title">Setting up the keyboard needs a computer</h3>
          <p class="env-banner-desc">
            Browsers on phones and tablets can't talk to a keyboard directly (no WebHID on iOS or Android). Open this page in Chrome, Edge, Brave or Opera on a computer to change lighting, keys and settings.
          </p>
          <div class="env-banner-note">
            ${icon('bulb', 15)} <span><strong>The shortcuts guide works here.</strong> Look up any Fn shortcut, pairing step or battery check while you play.</span>
          </div>
          <div class="env-banner-actions">
            <button class="btn-action-primary" id="btnCopyDesktopLink">
              ${icon('copy')}<span>Copy link for your computer</span>
            </button>
            <button class="btn-action-secondary" id="btnMobileOpenGuide">
              ${icon('book')}<span>Open the shortcuts guide</span>
            </button>
          </div>
        </div>
      </div>
    `;

    // Adjust connect buttons for mobile
    if (els.btnHeroConnect) {
      els.btnHeroConnect.innerHTML = icon('phone') + '<span>Use a Desktop Browser</span>';
      els.btnHeroConnect.title = 'WebHID hardware communication requires a desktop browser';
    }
    if (els.btnConnect) {
      els.btnConnect.innerHTML = icon('phone') + '<span>Desktop Required</span>';
      els.btnConnect.title = 'WebHID requires Google Chrome, Edge, or Brave on desktop';
    }

    // Bind mobile copy button
    const copyBtn = document.getElementById('btnCopyDesktopLink');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          showToast('Link copied', 'App URL copied to clipboard. Open it on your PC to configure hardware.', 'success');
        } catch {
          showToast('Link', window.location.href, 'info', 6000);
        }
      });
    }

    const mobileGuideBtn = document.getElementById('btnMobileOpenGuide');
    if (mobileGuideBtn) {
      mobileGuideBtn.addEventListener('click', () => switchTab('tab-guide'));
    }

  } else {
    document.body.classList.remove('is-mobile');
    if (env.status === 'UNSUPPORTED_BROWSER') {
      els.envCompatibilityWrap.innerHTML = `
        <div class="env-compatibility-banner unsupported-browser">
          <div class="env-banner-icon">${icon('globe', 26)}</div>
          <div class="env-banner-body">
            <div class="env-banner-badge browser-badge">Browser Unsupported</div>
            <h3 class="env-banner-title">WebHID is Not Supported in ${env.browserName}</h3>
            <p class="env-banner-desc">
              Your current browser does not support the <strong>WebHID standard</strong> required to communicate with the EvoFox Ronin 75% MCU. To customize RGB effects, underglow, and key remapping, please open this app in a WebHID-compatible browser:
            </p>
            <div class="browser-recommend-grid">
              <a href="https://www.google.com/chrome/" target="_blank" rel="noopener noreferrer" class="browser-chip">
                <span class="browser-chip-icon">${icon('globe', 20)}</span>
                <div class="browser-info">
                  <span class="browser-name">Google Chrome</span>
                  <span class="browser-status recommended">Recommended • Supported</span>
                </div>
                <span class="browser-arrow">${icon('external', 16)}</span>
              </a>
              <a href="https://www.microsoft.com/edge" target="_blank" rel="noopener noreferrer" class="browser-chip">
                <span class="browser-chip-icon">${icon('globe', 20)}</span>
                <div class="browser-info">
                  <span class="browser-name">Microsoft Edge</span>
                  <span class="browser-status">Windows Default • Supported</span>
                </div>
                <span class="browser-arrow">${icon('external', 16)}</span>
              </a>
              <a href="https://brave.com/" target="_blank" rel="noopener noreferrer" class="browser-chip">
                <span class="browser-chip-icon">${icon('globe', 20)}</span>
                <div class="browser-info">
                  <span class="browser-name">Brave Browser</span>
                  <span class="browser-status">Privacy-Focused • Supported</span>
                </div>
                <span class="browser-arrow">${icon('external', 16)}</span>
              </a>
              <a href="https://www.opera.com/" target="_blank" rel="noopener noreferrer" class="browser-chip">
                <span class="browser-chip-icon">${icon('globe', 20)}</span>
                <div class="browser-info">
                  <span class="browser-name">Opera / Opera GX</span>
                  <span class="browser-status">Gaming Browser • Supported</span>
                </div>
                <span class="browser-arrow">${icon('external', 16)}</span>
              </a>
            </div>
            <div class="env-banner-actions">
              <button class="btn-action-secondary" id="btnUnsupportedOpenGuide">
                ${icon('book')}<span>View Shortcuts Guide (Supported)</span>
              </button>
            </div>
          </div>
        </div>
      `;

      if (els.btnHeroConnect) {
        els.btnHeroConnect.innerHTML = icon('alert') + '<span>WebHID Unsupported</span>';
        els.btnHeroConnect.title = 'Please use Google Chrome, Microsoft Edge, or Brave';
      }
      if (els.btnConnect) {
        els.btnConnect.innerHTML = icon('alert') + '<span>Unsupported</span>';
        els.btnConnect.title = 'Please use Google Chrome, Microsoft Edge, or Brave';
      }

      const unsuppGuideBtn = document.getElementById('btnUnsupportedOpenGuide');
      if (unsuppGuideBtn) {
        unsuppGuideBtn.addEventListener('click', () => switchTab('tab-guide'));
      }

    } else {
      // DESKTOP_READY: nothing to warn about, so no banner (notices only appear when they matter)
      els.envCompatibilityWrap.innerHTML = '';
    }
  }
}

function initSidebar() {
  els.navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      switchTab(tabId);
    });
  });

  // Dashboard Quick Access Navigation Cards
  document.querySelectorAll('.quick-nav-card').forEach(card => {
    card.addEventListener('click', () => {
      const tabId = card.getAttribute('data-jump');
      if (tabId) switchTab(tabId);
    });
  });
}

function switchTab(tabId) {
  const isConn = state.driver && state.driver.isConnected && state.driver.isOnline;
  const isConfigTab = tabId !== 'tab-dashboard' && tabId !== 'tab-guide';

  // Navigation Guard: Block hardware configurator tabs if device is not connected or environment is unsupported
  if (isConfigTab && !isConn) {
    if (state.systemEnv && state.systemEnv.isMobile) {
      showToast('Needs a computer', 'Hardware configuration requires Google Chrome, Edge, or Brave on a desktop computer.', 'warning');
    } else if (state.systemEnv && !state.systemEnv.hasWebHID) {
      showToast('Browser not supported', 'Your browser does not support WebHID. Please use Google Chrome, Microsoft Edge, or Brave.', 'warning');
    } else {
      showToast('Connect your keyboard first', `${VIEW_METADATA[tabId]?.title || 'This page'} needs your Ronin connected over 2.4 GHz or Type-C.`, 'info', undefined, { action: { label: 'Connect', onClick: handleConnect } });
    }
    return;
  }

  state.activeTab = tabId;

  els.navButtons.forEach(b => {
    if (b.getAttribute('data-tab') === tabId) b.classList.add('active');
    else b.classList.remove('active');
  });

  els.tabPanes.forEach(p => {
    const on = p.id === tabId;
    p.classList.toggle('active', on);
    if (on) {
      // replay the page entrance
      p.classList.remove('is-entering');
      void p.offsetWidth;
      p.classList.add('is-entering');
    }
  });
  els.navButtons.forEach(b => b.setAttribute('aria-current', b.dataset.tab === tabId ? 'page' : 'false'));
  document.querySelector('.view-container')?.scrollTo({ top: 0 });

  if (VIEW_METADATA[tabId]) {
    els.viewHeading.textContent = VIEW_METADATA[tabId].title;
    els.viewSubheading.textContent = VIEW_METADATA[tabId].sub;
    const eb = document.getElementById('viewEyebrow');
    if (eb) eb.textContent = VIEW_METADATA[tabId].section;
  }

  // Animation Lifecycle Management: Only run visualizer for the visible tab
  if (tabId === 'tab-dashboard') {
    if (isConn) {
      state.visualizerDashboard?.start();
      state.visualizerConnect?.stop();
    } else {
      state.visualizerConnect?.start();
      state.visualizerDashboard?.stop();
    }
    state.visualizerBacklight?.stop();
  } else if (tabId === 'tab-backlight') {
    state.visualizerBacklight?.start();
    state.visualizerDashboard?.stop();
    state.visualizerConnect?.stop();
  } else {
    state.visualizerDashboard?.stop();
    state.visualizerBacklight?.stop();
    state.visualizerConnect?.stop();
  }

  // Auto Demo reset when switching away from lighting
  if (tabId !== 'tab-backlight' && state.autoDemoActive) {
    state.autoDemoActive = false;
    state.visualizerBacklight?.setAutoDemo(false);
    if (els.btnToggleAutoDemo) els.btnToggleAutoDemo.innerHTML = icon('play', 15) + '<span>Auto demo</span>';
  }
}

// Pause animation loop when browser tab is inactive to preserve battery & CPU
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    state.visualizerDashboard?.stop();
    state.visualizerBacklight?.stop();
    state.visualizerConnect?.stop();
  } else {
    const isConn = state.driver && state.driver.isConnected && state.driver.isOnline;
    if (state.activeTab === 'tab-dashboard') {
      if (isConn) state.visualizerDashboard?.start();
      else state.visualizerConnect?.start();
    }
    if (state.activeTab === 'tab-backlight') state.visualizerBacklight?.start();
  }
});

// ==========================================================================
// Standardized 79-Key Matrix Visualizer Stage Renderer
// ==========================================================================
function renderKeyboardStage(stageEl, mode = 'preview') {
  if (!stageEl) return;
  // Same realistic Ronin as the welcome hero, scaled to the card (src/hero.css).
  stageEl.innerHTML = '';
  stageEl.classList.add('is-ronin');
  const scene = document.createElement('div');
  scene.className = `ronin-scene is-live is-${mode}`;
  const box = document.createElement('div');
  box.className = 'ronin-case';
  box.innerHTML = '<div class="ronin-plate"></div>';
  scene.appendChild(box);
  stageEl.appendChild(scene);

  const legendFor = (k) => {
    const o = state.remap.overrides[`${state.remap.layer}_${k.index}`];
    return mode === 'remap' && o ? o.name : undefined;
  };

  buildRoninBoard(box, { legendFor }).forEach(({ key, el: keyEl }) => {
    keyEl.classList.add('key-cap');
    keyEl.dataset.index = key.index;
    keyEl.dataset.code = key.code;
    const overrideKey = `${state.remap.layer}_${key.index}`;
    const displayName = state.remap.overrides[overrideKey] ? state.remap.overrides[overrideKey].name : key.name;
    keyEl.title = mode === 'remap' ? `${key.name} (#${key.index})` : key.name;

    // Preview Mode Key Clicks (affects simulated visualizer only, never writes to hardware)
    if (mode === 'preview') {
      keyEl.addEventListener('pointerdown', () => {
        const activeVis = state.activeTab === 'tab-dashboard' ? state.visualizerDashboard : state.visualizerBacklight;
        if (activeVis) activeVis.triggerKeyPress(key.index, key.x, key.y);
      });

      keyEl.addEventListener('pointerup', () => {
        const activeVis = state.activeTab === 'tab-dashboard' ? state.visualizerDashboard : state.visualizerBacklight;
        if (activeVis) activeVis.triggerKeyRelease(key.index);
      });
    }

    // Custom RGB Designer Mode
    if (mode === 'customrgb') {
      // Official behaviour: unpainted keys are off; clicking a key that already has
      // the brush colour turns it off again.
      const paint = (hex) => {
        const off = !hex || hex.toUpperCase() === '#000000';
        keyEl.style.setProperty('--glow', off ? 'transparent' : hex);
        keyEl.style.setProperty('--lit', off ? '0' : '1');
        keyEl.classList.toggle('is-off', off);
      };
      paint(state.customRgb.keyColors[key.index]);

      keyEl.addEventListener('click', () => {
        state.customRgb.history.push({ ...state.customRgb.keyColors });
        const cur = (state.customRgb.keyColors[key.index] || '#000000').toUpperCase();
        const next = cur === state.customRgb.brushColor.toUpperCase() ? '#000000' : state.customRgb.brushColor;
        if (next === '#000000') delete state.customRgb.keyColors[key.index];
        else state.customRgb.keyColors[key.index] = next;
        paint(next);
      });
    }

    // Remap Mode Key Selection
    if (mode === 'remap') {
      const lockReason = isRemapLocked(key);
      if (lockReason) { keyEl.classList.add('key-locked'); keyEl.title = lockReason; }
      keyEl.addEventListener('click', () => {
        stageEl.querySelectorAll('.key-cap').forEach(k => k.classList.remove('key-selected'));
        keyEl.classList.add('key-selected');
        state.remap.activeKey = key;

        if (els.inspectorKeyName) els.inspectorKeyName.textContent = key.name;
        if (els.inspectorKeyIndex) els.inspectorKeyIndex.textContent = `Key #${key.index} · code 0x${key.code.toString(16).toUpperCase()}`;
        if (els.inspectorCurrentBinding) els.inspectorCurrentBinding.textContent = `Does: ${displayName}`;
      });
    }

  });
}

// Colour presets for the selected effect: the 8 colours, or the 8 gradients
// for Float. Both go into the same byte, so switching keeps the index.
function renderPalette() {
  const box = els.colorPaletteContainer;
  if (!box) return;
  const mode = BACKLIGHT_MODES.find(m => m.id === state.backlight.mode);
  const list = mode?.hasGradient ? GRADIENT_PALETTE : COLOR_PALETTE;
  if (els.paletteLabel) els.paletteLabel.textContent = mode?.hasGradient ? 'Gradient' : 'Colour';
  box.innerHTML = '';
  box.classList.toggle('is-gradient', !!mode?.hasGradient);
  list.forEach(c => {
    const dot = document.createElement('div');
    dot.className = `swatch-circle ${c.index === state.backlight.colorIndex ? 'selected' : ''}`;
    dot.style.background = c.hex;
    dot.title = c.name;
    dot.setAttribute('aria-label', c.name);
    dot.setAttribute('aria-pressed', String(c.index === state.backlight.colorIndex));
    dot.addEventListener('click', () => {
      state.backlight.colorIndex = c.index;
      box.querySelectorAll('.swatch-circle').forEach(d => { d.classList.remove('selected'); d.setAttribute('aria-pressed', 'false'); });
      dot.classList.add('selected');
      dot.setAttribute('aria-pressed', 'true');
      triggerHardwareSync();
    });
    box.appendChild(dot);
  });
}

// Show only the controls the selected effect really accepts (official flags).
function applyModeCapabilities(modeId) {
  const m = BACKLIGHT_MODES.find(x => x.id === modeId);
  if (!m) return;
  const show = (el, on) => { if (el) el.hidden = !on; };
  show(els.fieldPalette, m.hasColor || m.hasGradient);
  show(els.fieldBrightness, m.hasBrightness);
  show(els.fieldSpeed, m.hasSpeed);
  const notes = [];
  if (m.id === 23) notes.push('Paint the colours in the Custom RGB tab.');
  else if (m.id === 21) notes.push('The backlight is off. Pick any effect to turn it back on.');
  else {
    if (!m.hasColor && !m.hasGradient) notes.push('This effect uses its own colours.');
    if (!m.hasSpeed) notes.push('This effect has no speed setting.');
  }
  if (els.modeCapsHint) els.modeCapsHint.textContent = notes.join(' ');
  renderPalette();
}

// ==========================================================================
// Welcome hero + live previews: the real Ronin (src/hero.css)
// ==========================================================================
// Legends exactly as printed on the Ronin (live top-down photo).
const HERO_LEGEND = {
  ESC: 'Esc', '~': '`~', 1: '1!', 2: '2@', 3: '3#', 4: '4$', 5: '5%', 6: '6^', 7: '7&', 8: '8*', 9: '9(', 0: '0)',
  '-': '-_', '+': '=+', Backspace: '←', '[': '[{', ']': ']}', '\\': '\\|', ';': ';:', "'": '\'"',
  '<': ',<', '>': '.>', '?': '/?', Caps: 'Caps', 'R-Shift': 'Shift', 'R-Alt': 'Alt'
};
// Grey keycaps: number row and letter block. Everything else is black.
const HERO_GREY = new Set(['~', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '+', 'Backspace',
  'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']', '\\',
  'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'",
  'Z', 'X', 'C', 'V', 'B', 'N', 'M', '<', '>', '?']);
// Small secondary legends (Fn functions, OS modifiers).
const S = (d) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const SUN = '<circle cx="8" cy="8" r="2.4"/><path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1"/>';
const SPK = '<path d="M2.5 6h2.2L8 3.5v9L4.7 10H2.5z"/>';
const HERO_SUB = {
  F1: S('<circle cx="8" cy="8" r="2.4"/><path d="M8 3v1M8 12v1M3 8h1M12 8h1"/>'),
  F2: S(SUN),
  F3: S('<circle cx="7" cy="7" r="3.6"/><path d="M9.8 9.8 13 13"/>'),
  F7: S('<path d="M4 4v8M12 4 6.5 8 12 12z"/>'),
  F8: S('<path d="M3 4l5 4-5 4zM10.5 4v8M13 4v8"/>'),
  F9: S('<path d="M2.5 4l4.5 4-4.5 4zM7.5 4l4.5 4-4.5 4zM13.5 4v8"/>'),
  F10: S('<circle cx="8" cy="8" r="5.5"/><path d="M4.2 4.2l7.6 7.6"/>'),
  F11: S(SPK + '<path d="M10.5 8h3.5"/>'),
  F12: S(SPK + '<path d="M10.5 8h3.5M12.25 6.25v3.5"/>'),
  Del: S(SUN + '<path d="M2.5 13.5l11-11"/>'),
  '\\': S(SUN), '↑': S(SUN), '↓': S(SUN), '←': S(SUN), '→': S(SUN),
  Ctrl: '^', Win: '⌥', Alt: '⌘', 'R-Alt': '⌘', PgUp: 'Home', PgDn: 'End'
};
let heroState = 'idle';
let heroTimer = null;

// Static rainbow per key (diagonal, like the keyboard's default effect).
// Hardware RGB colour = user content, so it is computed here, not themed.
function heroGlow(x, y) {
  const hue = Math.round((x * 23 + y * 38) % 360);
  return `hsl(${hue} 95% 60%)`;
}

// Build the real Ronin into a .ronin-case: keycaps (black + grey, legends and
// sub-legends as printed), volume knob, EVOFOX plate, lock LEDs, OS switch.
// Returns [{ key, el }] so callers can wire clicks (stages) or leave it static (hero).
function buildRoninBoard(box, { legendFor } = {}) {
  const frag = document.createDocumentFragment();
  const out = [];
  KEYBOARD_LAYOUT.forEach((k) => {
    const el = document.createElement('span');
    el.className = 'rk'
      + (HERO_GREY.has(k.name) ? ' is-grey' : '')
      + (k.w >= 1.5 ? ' is-wide' : '')
      + (k.name === 'Space' ? ' is-space' : '')
      + (['↑', '↓', '←', '→', 'Backspace'].includes(k.name) ? ' is-arrow' : '');
    el.style.cssText = `--x:${k.x};--y:${k.y};--w:${k.w};--h:${k.h || 1};--glow:${heroGlow(k.x + k.w / 2, k.y)}`;
    const main = document.createElement('b');
    const custom = legendFor?.(k);
    main.textContent = custom ?? (k.name === 'Space' ? '' : (HERO_LEGEND[k.name] ?? k.name));
    el.appendChild(main);
    const sub = custom ? null : HERO_SUB[k.name];
    if (sub) {
      const i = document.createElement('i');
      const isSvg = sub.startsWith('<svg');
      i.className = isSvg ? 'rk-sub is-icon' : 'rk-sub';
      if (isSvg) i.innerHTML = sub; else i.textContent = sub;
      el.appendChild(i);
    }
    frag.appendChild(el);
    out.push({ key: k, el });
  });
  const knob = document.createElement('span');
  knob.className = 'rk-knob';
  knob.title = 'Volume knob: turn for volume, press to mute';
  const logo = document.createElement('span');
  logo.className = 'rk-logo';
  logo.innerHTML = '<i class="rk-fox"></i><span>EVOFOX</span>';
  const lock = S('<rect x="4" y="7.5" width="8" height="6" rx="1.2"/><path d="M5.8 7.5V5.6a2.2 2.2 0 0 1 4.4 0v1.9"/>');
  const leds = document.createElement('span');
  leds.className = 'rk-leds';
  leds.title = 'Caps Lock and Win Lock lights';
  leds.innerHTML = `<span class="dot"></span>${lock}${lock}<span class="dot"></span>`;
  const os = document.createElement('span');
  os.className = 'rk-os';
  os.title = 'Windows / macOS switch';
  os.innerHTML = '<i class="rk-win"></i><span class="rk-toggle"></span><i class="rk-mac">⌘</i>';
  frag.append(knob, logo, leds, os);
  box.appendChild(frag);
  return out;
}

function renderRoninHero() {
  const box = document.getElementById('roninCase');
  if (!box || box.dataset.ready) return;
  box.dataset.ready = '1';
  buildRoninBoard(box);
}

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// idle | waiting | connected | unplugged | error.  link: 'usb' | 'rf'
function setHeroState(next, { link, fromSeated = false } = {}) {
  const scene = els.roninScene;
  if (!scene) return;
  clearTimeout(heroTimer);
  if (link) scene.dataset.link = link;
  if (fromSeated && !prefersReducedMotion()) {
    // Start from "plugged in" without animating, then play the change.
    scene.classList.add('no-anim');
    scene.dataset.state = 'connected';
    void scene.offsetWidth;
    scene.classList.remove('no-anim');
    requestAnimationFrame(() => requestAnimationFrame(() => { scene.dataset.state = next; }));
  } else {
    scene.dataset.state = next;
  }
  heroState = next;
  if (next === 'error') heroTimer = setTimeout(() => { if (heroState === 'error') setHeroState('idle'); }, 1800);
}

function renderKeyboards() {
  renderKeyboardStage(els.keyboardStageDashboard, 'preview');
  renderKeyboardStage(els.keyboardStageBacklight, 'preview');
  renderKeyboardStage(els.keyboardStageRemap, 'remap');
  renderKeyboardStage(els.keyboardStageCustomRgb, 'customrgb');
  
  if (!state.visualizerBacklight) {
    state.visualizerBacklight = new KeyboardLightingVisualizer(els.keyboardStageBacklight, KEYBOARD_LAYOUT);
  } else {
    state.visualizerBacklight.refreshKeyElements();
  }

  if (!state.visualizerDashboard) {
    state.visualizerDashboard = new KeyboardLightingVisualizer(els.keyboardStageDashboard, KEYBOARD_LAYOUT);
    if (state.driver && state.driver.isConnected) {
      state.visualizerDashboard.start();
    }
  } else {
    state.visualizerDashboard.refreshKeyElements();
  }

  triggerHardwareSync({ write: false });   // render only; never write just because we redrew
}

// ==========================================================================
// Physical Keystroke Feedback Listener (Preview testing only)
// ==========================================================================
function initInteractiveKeystrokes() {
  const codeMap = {
    Escape: 41, F1: 58, F2: 59, F3: 60, F4: 61, F5: 62, F6: 63, F7: 64, F8: 65, F9: 66, F10: 67, F11: 68, F12: 69, Delete: 76,
    Backquote: 53, Digit1: 30, Digit2: 31, Digit3: 32, Digit4: 33, Digit5: 34, Digit6: 35, Digit7: 36, Digit8: 37, Digit9: 38, Digit0: 39, Minus: 45, Equal: 46, Backspace: 42,
    Tab: 43, KeyQ: 20, KeyW: 26, KeyE: 8, KeyR: 21, KeyT: 23, KeyY: 28, KeyU: 24, KeyI: 12, KeyO: 18, KeyP: 19, BracketLeft: 47, BracketRight: 48, Backslash: 49,
    CapsLock: 57, KeyA: 4, KeyS: 22, KeyD: 7, KeyF: 9, KeyG: 10, KeyH: 11, KeyJ: 13, KeyK: 14, KeyL: 15, Semicolon: 51, Quote: 52, Enter: 40, PageUp: 75,
    ShiftLeft: 225, KeyZ: 29, KeyX: 27, KeyC: 6, KeyV: 25, KeyB: 5, KeyN: 17, KeyM: 16, Comma: 54, Period: 55, Slash: 56, ShiftRight: 229, ArrowUp: 82, PageDown: 78,
    ControlLeft: 224, MetaLeft: 227, AltLeft: 226, Space: 44, AltRight: 230, ArrowLeft: 80, ArrowDown: 81, ArrowRight: 79
  };

  window.addEventListener('keydown', (e) => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    const hidCode = codeMap[e.code];
    if (hidCode) {
      const keyObj = KEYBOARD_LAYOUT.find(k => k.code === hidCode);
      if (keyObj) {
        if (state.activeTab === 'tab-backlight' && state.visualizerBacklight) {
          state.visualizerBacklight.triggerKeyPress(keyObj.index, keyObj.x, keyObj.y);
        } else if (state.activeTab === 'tab-dashboard' && state.visualizerDashboard) {
          state.visualizerDashboard.triggerKeyPress(keyObj.index, keyObj.x, keyObj.y);
        }
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    const hidCode = codeMap[e.code];
    if (hidCode) {
      const keyObj = KEYBOARD_LAYOUT.find(k => k.code === hidCode);
      if (keyObj) {
        if (state.activeTab === 'tab-backlight' && state.visualizerBacklight) {
          state.visualizerBacklight.triggerKeyRelease(keyObj.index);
        } else if (state.activeTab === 'tab-dashboard' && state.visualizerDashboard) {
          state.visualizerDashboard.triggerKeyRelease(keyObj.index);
        }
      }
    }
  });
}

// ==========================================================================
// Control Listeners (RGB, Underglow, Presets, Settings)
// ==========================================================================
function updateLiveSyncHint() {
  const h = document.getElementById('liveSyncHint');
  if (h) h.textContent = state.liveSync ? 'Your keyboard follows every change' : 'Preview only. Press Apply to send';
}

// Level sliders show their filled part (CSS reads --pct).
function paintRanges(root = document) {
  root.querySelectorAll('input[type="range"]').forEach(r => {
    const min = +r.min || 0, max = +r.max || 100;
    r.style.setProperty('--pct', `${((+r.value - min) / (max - min)) * 100}%`);
  });
}
document.addEventListener('input', (e) => { if (e.target.matches?.('input[type="range"]')) paintRanges(e.target.parentElement); });

function initControls() {
  // Live Sync Toggle
  if (els.checkLiveSync) {
    els.checkLiveSync.addEventListener('change', () => {
      state.liveSync = els.checkLiveSync.checked;
      saveSession();
      updateLiveSyncHint();
      showToast(state.liveSync ? 'Live Sync on' : 'Live Sync off', state.liveSync ? 'Your keyboard follows every change.' : 'Changes stay in the preview until you press Apply.', 'info', 2500);
      if (state.liveSync) triggerHardwareSync();
    });
  }

  // Populate Categorized Backlight Modes (Grouped with optgroup)
  const modeGroups = [
    {
      label: 'Continuous Waves & Streams',
      modes: BACKLIGHT_MODES.filter(m => !m.isReactive && m.id !== 7 && m.id !== 8 && m.id !== 21 && m.id !== 23)
    },
    {
      label: 'Key-Reactive (Click or Type to Trigger)',
      modes: BACKLIGHT_MODES.filter(m => m.isReactive)
    },
    {
      label: 'Solid, Pulsing & Ambient',
      modes: BACKLIGHT_MODES.filter(m => !m.isReactive && (m.id === 7 || m.id === 8 || m.id === 21 || m.id === 23))
    }
  ];

  // Mode tiles use the 8 lighting-mode icon families from icons.js (MODE_ICON).

  els.lightModeSelect.innerHTML = '';
  modeGroups.forEach(g => {
    const optGroup = document.createElement('optgroup');
    optGroup.label = g.label;
    g.modes.forEach(mode => {
      const opt = document.createElement('option');
      opt.value = mode.id;
      opt.textContent = `${mode.id}: ${mode.name}`;
      optGroup.appendChild(opt);
    });
    els.lightModeSelect.appendChild(optGroup);
  });

  // Render the visual effect picker (all of the Ronin's effects)
  if (els.modePickerGrid) {
    els.modePickerGrid.innerHTML = '';
    const catOf = (m) => m.isReactive ? 'reactive' : ([7, 8, 21, 23].includes(m.id) ? 'ambient' : 'waves');
    BACKLIGHT_MODES.forEach(m => {
      const tile = document.createElement('div');
      tile.className = `mode-tile ${m.id === state.backlight.mode ? 'active' : ''}`;
      tile.setAttribute('data-mode-id', m.id);
      tile.dataset.cat = catOf(m);
      tile.setAttribute('role', 'option');
      tile.setAttribute('aria-selected', String(m.id === state.backlight.mode));
      tile.innerHTML = `
        <span class="mode-tile-icon">${icon(MODE_ICON[m.id] || 'bulb', 18)}</span>
        <span class="mode-tile-name">${m.name}</span>
        ${m.isReactive ? '<span class="mode-tile-tag">Reactive</span>' : ''}
      `;
      tile.title = `${m.name}: ${m.desc}`;
      tile.addEventListener('click', () => {
        state.backlight.mode = m.id;
        if (els.lightModeSelect) els.lightModeSelect.value = m.id;
        updateModeGuide(m.id);
        triggerHardwareSync();
      });
      els.modePickerGrid.appendChild(tile);
    });
  }

  function updateModeGuide(modeId) {
    const modeObj = BACKLIGHT_MODES.find(m => m.id === modeId);
    if (!modeObj) return;
    els.lightModeDesc.textContent = modeObj.desc;
    applyModeCapabilities(modeId);

    // Highlight active tile in modePickerGrid
    if (els.modePickerGrid) {
      els.modePickerGrid.querySelectorAll('.mode-tile').forEach(tile => {
        const on = parseInt(tile.getAttribute('data-mode-id'), 10) === modeId;
        tile.classList.toggle('active', on);
        tile.setAttribute('aria-selected', String(on));
      });
    }
    const nowIcon = document.getElementById('rgbNowIcon');
    if (nowIcon) {
      nowIcon.innerHTML = icon(MODE_ICON[modeId] || 'bulb', 22);
      nowIcon.classList.remove('is-bumped'); void nowIcon.offsetWidth; nowIcon.classList.add('is-bumped');
    }

    // Reactive notice & auto demo button
    if (modeObj.isReactive) {
      if (els.reactiveGuideBar) els.reactiveGuideBar.style.display = 'flex';
      if (els.reactiveGuideText) els.reactiveGuideText.textContent = `${modeObj.name} reacts to typing. Press keys on your keyboard, or click keys in the preview.`;
    } else {
      if (els.reactiveGuideBar) els.reactiveGuideBar.style.display = 'none';
      if (state.autoDemoActive) {
        state.autoDemoActive = false;
        state.visualizerBacklight?.setAutoDemo(false);
        if (els.btnToggleAutoDemo) els.btnToggleAutoDemo.innerHTML = icon('play', 15) + '<span>Auto demo</span>';
      }
    }
  }

  updateModeGuideRef = updateModeGuide;

  // Effect filters (All / Waves / Reactive / Solid & more)
  document.querySelectorAll('#effectFilters .effect-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.cat;
      document.querySelectorAll('#effectFilters .effect-filter').forEach(b => {
        const on = b === btn; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on));
      });
      els.modePickerGrid?.querySelectorAll('.mode-tile').forEach(t => { t.hidden = cat !== 'all' && t.dataset.cat !== cat; });
    });
  });

  els.lightModeSelect.addEventListener('change', () => {
    state.backlight.mode = parseInt(els.lightModeSelect.value, 10);
    updateModeGuide(state.backlight.mode);
    triggerHardwareSync();
  });
  updateModeGuide(state.backlight.mode);

  // Auto Demo Toggle Button
  if (els.btnToggleAutoDemo) {
    els.btnToggleAutoDemo.addEventListener('click', () => {
      state.autoDemoActive = !state.autoDemoActive;
      state.visualizerBacklight?.setAutoDemo(state.autoDemoActive);
      els.btnToggleAutoDemo.innerHTML = state.autoDemoActive ? icon('pause', 15) + '<span>Pause demo</span>' : icon('play', 15) + '<span>Auto demo</span>';
      showToast('Auto demo', state.autoDemoActive ? 'Simulated keypress demo active.' : 'Auto Demo paused.', 'info', 2000);
    });
  }

  // Sliders
  els.sliderBrightness.addEventListener('input', () => {
    state.backlight.brightness = parseInt(els.sliderBrightness.value, 10);
    els.valBrightness.textContent = state.backlight.brightness;
    triggerHardwareSync();
  });

  els.sliderSpeed.addEventListener('input', () => {
    state.backlight.speed = parseInt(els.sliderSpeed.value, 10);
    els.valSpeed.textContent = state.backlight.speed;
    triggerHardwareSync();
  });

  // Colour / gradient swatches are drawn by renderPalette() (mode-aware).
  renderPalette();

  // Manual Apply Backlight Effect
  els.btnApplyLight.addEventListener('click', async () => {
    if (!state.driver.isConnected) {
      showToast('Connect your keyboard first', 'Plug in the cable or receiver, then click Connect.', 'warning');
      return;
    }
    if (!state.driver.isOnline) {
      showToast('Keyboard is on Bluetooth', 'The receiver is plugged in, but the keyboard is on Bluetooth. Press Fn + 4 to switch to 2.4 GHz.', 'warning', 7000);
      return;
    }
    await runHardwareWrite(els.btnApplyLight, async () => {
      await state.driver.setLightMode(state.backlight);
      state.verifiedHwLightMode = state.backlight.mode;
      updateLightingStateBar();
    }, { success: ['Lighting applied', 'Your keyboard now shows the selected effect.'], errorTitle: "Couldn't apply lighting", busyLabel: 'Applying…' });
  });

  // Underglow (side strip): the Ronin 75% has no side light strip (spec:
  // "Per Key RGB with 21 Effects"), so its tab was removed. Kept guarded so
  // the controls come back if the markup is ever restored for another board.
  if (els.boxlightModeSelect) {
    // Underglow (Side Strip) Mode Selector
    BOXLIGHT_MODES.forEach(mode => {
      const opt = document.createElement('option');
      opt.value = mode.id;
      opt.textContent = `${mode.id}: ${mode.name}`;
      els.boxlightModeSelect.appendChild(opt);
    });

    els.boxlightModeSelect.addEventListener('change', () => {
      state.boxlight.mode = parseInt(els.boxlightModeSelect.value, 10);
      const obj = BOXLIGHT_MODES.find(m => m.id === state.boxlight.mode);
      els.boxlightModeDesc.textContent = obj ? obj.desc : '';
      if (els.pillEffectName) els.pillEffectName.textContent = obj ? obj.name : 'Custom';
      triggerHardwareSync();
    });
    els.boxlightModeDesc.textContent = BOXLIGHT_MODES[0].desc;

    els.sliderBoxBrightness.addEventListener('input', () => {
      state.boxlight.brightness = parseInt(els.sliderBoxBrightness.value, 10);
      els.valBoxBrightness.textContent = state.boxlight.brightness;
      if (els.pillBrightness) els.pillBrightness.textContent = `${state.boxlight.brightness} / 5`;
      triggerHardwareSync();
    });

    els.sliderBoxSpeed.addEventListener('input', () => {
      state.boxlight.speed = parseInt(els.sliderBoxSpeed.value, 10);
      els.valBoxSpeed.textContent = state.boxlight.speed;
      if (els.pillSpeed) els.pillSpeed.textContent = `${state.boxlight.speed} / 5`;
      triggerHardwareSync();
    });

    els.btnApplyBoxlight.addEventListener('click', async () => {
      if (!state.driver.isConnected) {
        showToast('Connect your keyboard first', 'Please connect your keyboard first.', 'warning');
        return;
      }
      if (!state.driver.isOnline) {
        showToast('Keyboard is on Bluetooth', 'The receiver is plugged in, but the keyboard is on Bluetooth. Press Fn + 4 to switch to 2.4 GHz.', 'warning', 7000);
        return;
      }
      await runHardwareWrite(els.btnApplyBoxlight, () => state.driver.setLightBoxMode(state.boxlight),
        { success: ['Underglow Applied', 'Side strip lighting updated.'], errorTitle: 'Error' });
    });
}

  // Quick Presets
  els.presetRainbowWave?.addEventListener('click', () => {
    state.backlight.mode = 1;
    state.backlight.speed = 3;
    state.backlight.brightness = 5;
    state.backlight.colorIndex = 7;
    els.lightModeSelect.value = "1";
    syncControlsFromState();
    triggerHardwareSync();
    showToast('Preset applied', 'Rainbow Wave activated.', 'success');
  });

  els.presetCyberpunk?.addEventListener('click', () => {
    state.backlight.mode = 9; // Cross Flow
    state.backlight.speed = 4;
    state.backlight.brightness = 5;
    state.backlight.colorIndex = 4; // Magenta
    els.lightModeSelect.value = "9";
    syncControlsFromState();
    triggerHardwareSync();
    showToast('Preset applied', 'Cyber Neon activated.', 'success');
  });

  els.presetBreathing?.addEventListener('click', () => {
    state.backlight.mode = 8; // Breathing
    state.backlight.speed = 2;
    state.backlight.brightness = 4;
    state.backlight.colorIndex = 5; // Cyan
    els.lightModeSelect.value = "8";
    syncControlsFromState();
    triggerHardwareSync();
    showToast('Preset applied', 'Cyan Pulse activated.', 'success');
  });

  els.presetStealth?.addEventListener('click', () => {
    state.backlight.mode = 21; // Lights off
    els.lightModeSelect.value = "21";
    syncControlsFromState();
    triggerHardwareSync();
    showToast('Preset applied', 'Stealth Mode (Lights Off) activated.', 'info');
  });

  // Settings: Sleep and Response Levels
  SLEEP_LEVELS.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.level;
    opt.textContent = s.label;
    els.selectSleepLevel.appendChild(opt);
  });

  RESPONSE_LEVELS.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.level;
    opt.textContent = r.label;
    els.selectResponseLevel.appendChild(opt);
  });

  FN_LAYER_MODES.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.value;
    opt.textContent = f.label;
    els.selectFnLayerMode?.appendChild(opt);
  });

  els.btnApplySettings?.addEventListener('click', async () => {
    if (!state.driver.isConnected) {
      showToast('Heads up', 'Connect keyboard to commit settings.', 'warning');
      return;
    }
    const sleepLevel = parseInt(els.selectSleepLevel.value, 10);
    const respLevel = parseInt(els.selectResponseLevel.value, 10);
    const fnMode = parseInt(els.selectFnLayerMode?.value ?? '0', 10);
    await runHardwareWrite(els.btnApplySettings, async () => {
      await state.driver.setSleepLevel(sleepLevel);
      await state.driver.setResponseLevel(respLevel);
      await state.driver.setFnLayerMode(fnMode);
      state.settings.sleepLevel = sleepLevel;
      state.settings.responseLevel = respLevel;
      state.settings.fnLayerMode = fnMode;
      saveSession();
      updateUI();
    }, { success: ['Settings saved', 'Sleep timer, key response and Fn layer are stored on the keyboard.'], errorTitle: "Couldn't save settings", busyLabel: 'Saving…' });
  });

  // Factory Reset Confirmation Modal Handlers
  els.btnFactoryReset?.addEventListener('click', () => {
    if (!state.driver.isConnected) {
      showToast('Heads up', 'Connect keyboard to execute factory reset.', 'warning');
      return;
    }
    els.resetConfirmModal?.classList.add('open');
  });

  els.btnCloseResetModal?.addEventListener('click', () => els.resetConfirmModal?.classList.remove('open'));
  els.btnCancelReset?.addEventListener('click', () => els.resetConfirmModal?.classList.remove('open'));

  els.btnConfirmReset?.addEventListener('click', async () => {
    els.resetConfirmModal?.classList.remove('open');
    showLoading('Resetting your keyboard…', 'Restoring factory settings. This takes a moment.');
    try {
      await state.driver.restoreFactoryDefaults();
      state.remap.overrides = {};
      state.customRgb.keyColors = {};
      state.backlight.mode = 1;
      state.backlight.brightness = 5;
      state.backlight.speed = 3;
      renderKeyboards();
      hideLoading();
      showToast('Factory reset done', 'All settings and keybindings restored to defaults.', 'success');
    } catch (err) {
      hideLoading();
      showToast("Couldn't reset", err.message, 'error');
    }
  });

  // Clear Terminal Diagnostics Log
  els.btnClearLogs?.addEventListener('click', () => {
    if (els.logConsole) els.logConsole.innerHTML = '';
  });
}

// ==========================================================================
// Hardware Mode Centre, Shortcuts Guide & Telemetry Synchronizer
// ==========================================================================
const MODE_EXPLANATIONS = {
  bt1: {
    title: 'Bluetooth slot 1 (Fn + 1)',
    badge: 'Shows up as “EvoFox Ronin TKL #1”',
    desc: 'Long press <strong>Fn + 1</strong> until key 1 blinks fast, then pick “EvoFox Ronin TKL #1” in your device’s Bluetooth settings. Tap <strong>Fn + 1</strong> to switch back later.',
    hardware: icon('bulb', 15) + ' Hold <strong>Fn</strong>: key <strong>1</strong> lights up when this slot is active.',
    webhid: 'This app can’t configure the keyboard over Bluetooth. Switch to <strong>Fn + 4 (2.4 GHz)</strong> or <strong>Fn + 5 (wired)</strong>.'
  },
  bt2: {
    title: 'Bluetooth slot 2 (Fn + 2)',
    badge: 'Shows up as “EvoFox Ronin TKL #2”',
    desc: 'Long press <strong>Fn + 2</strong> to pair a second device. Tap <strong>Fn + 2</strong> to switch to it.',
    hardware: icon('bulb', 15) + ' Hold <strong>Fn</strong>: key <strong>2</strong> lights up when active.',
    webhid: 'Use 2.4 GHz or wired mode to configure the keyboard here.'
  },
  bt3: {
    title: 'Bluetooth slot 3 (Fn + 3)',
    badge: 'Shows up as “EvoFox Ronin TKL #3”',
    desc: 'Long press <strong>Fn + 3</strong> to pair a third device. Tap <strong>Fn + 3</strong> to switch to it.',
    hardware: icon('bulb', 15) + ' Hold <strong>Fn</strong>: key <strong>3</strong> lights up when active.',
    webhid: 'Use 2.4 GHz or wired mode to configure the keyboard here.'
  },
  '24g': {
    title: '2.4 GHz wireless (Fn + 4)',
    badge: 'USB receiver • PID 0x8FF0',
    desc: 'Take the receiver out of its slot on the keyboard, plug it into your computer and press <strong>Fn + 4</strong>. If it isn’t recognised, long press <strong>Fn + 4</strong> until the LED blinks fast.',
    hardware: icon('bulb', 15) + ' Hold <strong>Fn</strong>: key <strong>4</strong> lights up when active.',
    webhid: '✓ Works with this app: lighting, key remapping, settings and battery level.'
  },
  usb: {
    title: 'Wired (Fn + 5)',
    badge: 'Type-C cable • PID 0xA157',
    desc: 'Connect the Type-C cable to the port on the top edge of the keyboard and press <strong>Fn + 5</strong>. The cable also charges the battery.',
    hardware: icon('bulb', 15) + ' Hold <strong>Fn</strong>: key <strong>5</strong> lights up when active.',
    webhid: '✓ Works with this app. Wired mode is also the one to use for firmware updates.'
  }
};

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderGuideShortcuts(filterCat = 'all', searchQuery = '') {
  const query = searchQuery.trim().toLowerCase();

  // 1. Render to Dedicated Full-Page Container (High Contrast, Responsive Grid)
  if (els.pageGuideShortcutsContainer) {
    els.pageGuideShortcutsContainer.innerHTML = '';
    let totalMatches = 0;

    KEYBOARD_SHORTCUTS.forEach(cat => {
      if (filterCat !== 'all' && cat.categoryId !== filterCat) return;

      const matchingItems = cat.items.filter(item => {
        if (!query) return true;
        return item.combo.toLowerCase().includes(query) ||
               item.title.toLowerCase().includes(query) ||
               (item.pairingName && item.pairingName.toLowerCase().includes(query)) ||
               item.description.toLowerCase().includes(query) ||
               (item.note && item.note.toLowerCase().includes(query));
      });

      if (matchingItems.length === 0) return;
      totalMatches += matchingItems.length;

      const sectionWrap = document.createElement('div');
      sectionWrap.className = 'guide-category-section';

      const sectionHeader = document.createElement('div');
      sectionHeader.className = 'guide-section-header';
      sectionHeader.innerHTML = `${icon(cat.icon, 20)} <span>${cat.categoryName} (${matchingItems.length})</span>`;
      sectionWrap.appendChild(sectionHeader);

      const cardsGrid = document.createElement('div');
      cardsGrid.className = 'guide-cards-grid';

      matchingItems.forEach(item => {
        const card = document.createElement('div');
        card.className = 'page-shortcut-card';

        const keycapsHtml = item.keys.map(k => `<span class="fn-cap ${k === 'Fn' ? '' : 'fn-cap-secondary'}">${k}</span>`).join(' <span class="fn-plus">+</span> ');

        card.innerHTML = `
          <div class="guide-card-top">
            <div class="guide-keycap-badge">
              ${keycapsHtml}
            </div>
            <span class="guide-action-pill">${item.actionType}</span>
          </div>
          <div class="card-title">${item.title}</div>
          <p class="card-desc">${item.description}</p>
          ${item.ledBehavior ? `
            <div class="guide-feedback-row">
              <span class="label">${icon('bulb', 15)} LED Feedback:</span>
              <span>${item.ledBehavior}</span>
            </div>
          ` : ''}
          ${item.note ? `
            <div class="guide-note-box">
              <strong>Note:</strong> ${item.note}
            </div>
          ` : ''}
        `;
        cardsGrid.appendChild(card);
      });

      sectionWrap.appendChild(cardsGrid);
      els.pageGuideShortcutsContainer.appendChild(sectionWrap);
    });

    if (totalMatches === 0) {
      els.pageGuideShortcutsContainer.innerHTML = `
        <div class="empty-state">
          ${spot('no-results')}
          <h3>No results for "${escapeHtml(searchQuery)}"</h3>
          <p>No shortcuts match "<strong>${escapeHtml(searchQuery)}</strong>". Try searching for <em>Bluetooth</em>, <em>2.4G</em>, <em>RGB</em>, <em>Mac</em>, <em>Knob</em>, <em>Battery</em>, or <em>Reset</em>.</p>
          <div class="empty-state-actions">
            <button type="button" class="btn-action-primary" data-clear="pageGuideSearchInput">${icon('x', 16)}<span>Clear search</span></button>
          </div>
        </div>
      `;
    }
  }

  // 2. Also keep modal container populated (fallback)
  if (els.guideShortcutsContainer) {
    els.guideShortcutsContainer.innerHTML = '';
    KEYBOARD_SHORTCUTS.forEach(cat => {
      if (filterCat !== 'all' && cat.categoryId !== filterCat) return;

      const matchingItems = cat.items.filter(item => {
        if (!query) return true;
        return item.combo.toLowerCase().includes(query) ||
               item.title.toLowerCase().includes(query) ||
               (item.pairingName && item.pairingName.toLowerCase().includes(query)) ||
               item.description.toLowerCase().includes(query) ||
               (item.note && item.note.toLowerCase().includes(query));
      });

      if (matchingItems.length === 0) return;

      const groupHeader = document.createElement('div');
      groupHeader.className = 'guide-group-header';
      groupHeader.innerHTML = `${icon(cat.icon, 16)} <span>${cat.categoryName}</span>`;
      els.guideShortcutsContainer.appendChild(groupHeader);

      matchingItems.forEach(item => {
        const card = document.createElement('div');
        card.className = 'guide-shortcut-card';

        const keycapsHtml = item.keys.map(k => `<span class="fn-cap ${k === 'Fn' ? '' : 'fn-cap-secondary'}">${k}</span>`).join(' <span class="fn-plus">+</span> ');

        card.innerHTML = `
          <div class="guide-card-top">
            <div class="guide-keycap-badge">
              ${keycapsHtml}
              <span class="guide-shortcut-title">${item.title}</span>
            </div>
            <span class="guide-action-pill">${item.actionType}</span>
          </div>
          <p class="guide-shortcut-desc">${item.description}</p>
          ${item.ledBehavior ? `
            <div class="guide-feedback-row">
              <span class="label">${icon('bulb', 15)} LED Feedback:</span>
              <span>${item.ledBehavior}</span>
            </div>
          ` : ''}
          ${item.note ? `
            <div class="guide-note-box">
              <strong>Note:</strong> ${item.note}
            </div>
          ` : ''}
        `;
        els.guideShortcutsContainer.appendChild(card);
      });
    });

    if (els.guideShortcutsContainer.children.length === 0) {
      els.guideShortcutsContainer.innerHTML = `
        <div class="empty-state">
          ${spot('no-results')}
          <h3>No results for "${escapeHtml(searchQuery)}"</h3>
          <p>No shortcuts match your search: "<strong>${escapeHtml(searchQuery)}</strong>". Try searching for "Bluetooth", "2.4G", "RGB", "Mac", "Knob", or "Reset".</p>
          <div class="empty-state-actions">
            <button type="button" class="btn-action-secondary" data-clear="guideSearchInput">${icon('x', 16)}<span>Clear search</span></button>
          </div>
        </div>
      `;
    }
  }
}

function updateModeDrawer(containerEl, modeKey) {
  if (!containerEl) return;
  const m = MODE_EXPLANATIONS[modeKey] || MODE_EXPLANATIONS['24g'];
  containerEl.innerHTML = `
    <div class="explainer-head">
      <strong class="explainer-title">${m.title}</strong>
      <span class="explainer-badge">${m.badge}</span>
    </div>
    <p class="explainer-desc">${m.desc}</p>
    <div class="explainer-hw">${m.hardware}</div>
    <div class="explainer-webhid ${m.webhid.includes('✓') ? 'is-supported' : 'is-unsupported'}">
      ${m.webhid.replace('✓', icon('check', 15))}
    </div>
  `;
}

function updateLightingStateBar() {
  if (!els.lblSelectedLightMode) return;
  const curMode = BACKLIGHT_MODES.find(m => m.id === state.backlight.mode);
  els.lblSelectedLightMode.textContent = curMode ? curMode.name : `Effect ${state.backlight.mode}`;
  const hwMode = BACKLIGHT_MODES.find(m => m.id === state.verifiedHwLightMode);
  const isPending = !!state.verifiedHwLightMode && state.verifiedHwLightMode !== state.backlight.mode;

  if (els.badgeHwLightMode) {
    if (!state.verifiedHwLightMode) {
      els.badgeHwLightMode.className = 'lighting-state-badge is-idle';
      els.badgeHwLightMode.innerHTML = `<span class="status-dot"></span><span>Not sent yet</span>`;
      els.badgeHwLightMode.style.display = '';
    } else if (!isPending) {
      els.badgeHwLightMode.className = 'lighting-state-badge verified';
      els.badgeHwLightMode.innerHTML = `${icon('check', 14)}<span>On your keyboard</span>`;
      els.badgeHwLightMode.style.display = '';
    } else {
      els.badgeHwLightMode.style.display = 'none';
    }
  }
  if (els.badgePendingLight) {
    els.badgePendingLight.style.display = isPending ? 'inline-flex' : 'none';
    if (isPending) els.badgePendingLight.innerHTML = `${icon('alert', 14)}<span>Not applied yet · keyboard shows ${hwMode ? hwMode.name : 'another effect'}</span>`;
  }
}

function initModeCentreAndGuide() {
  let activeGuideCat = 'all';

  const navigateToGuideTab = () => {
    switchTab('tab-guide');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Wire all Guide buttons to seamlessly navigate to the full-width dedicated page
  els.btnOpenTroubleshoot?.addEventListener('click', navigateToGuideTab);
  els.btnWelcomeGuide?.addEventListener('click', navigateToGuideTab);
  els.btnDashOpenGuide?.addEventListener('click', navigateToGuideTab);
  document.querySelectorAll('.btnWelcomeOpenGuide').forEach(b => b.addEventListener('click', navigateToGuideTab));

  // Search: 150ms debounce, clear button, "/" to focus (guide ch. 13)
  const debounce = (fn, ms = 150) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const syncClear = (input) => {
    const btn = document.querySelector(`.guide-search-clear[data-clear="${input.id}"]`);
    if (btn) btn.hidden = !input.value;
  };
  const runSearch = debounce((input) => renderGuideShortcuts(activeGuideCat, input.value));
  [els.pageGuideSearchInput, els.guideSearchInput].forEach((input) => {
    input?.addEventListener('input', () => { syncClear(input); runSearch(input); });
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && input.value) { e.stopPropagation(); input.value = ''; syncClear(input); renderGuideShortcuts(activeGuideCat, ''); }
    });
  });
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-clear]');
    if (!btn) return;
    const input = document.getElementById(btn.dataset.clear);
    if (!input) return;
    input.value = '';
    syncClear(input);
    renderGuideShortcuts(activeGuideCat, '');
    input.focus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const modalOpen = els.troubleshootModal?.classList.contains('open');
    const target = modalOpen ? els.guideSearchInput : (state.activeTab === 'tab-guide' ? els.pageGuideSearchInput : null);
    if (target) { e.preventDefault(); target.focus(); }
  });

  // Dedicated Page Category Buttons
  if (els.pageGuideCatNav) {
    els.pageGuideCatNav.querySelectorAll('.guide-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        els.pageGuideCatNav.querySelectorAll('.guide-cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeGuideCat = btn.dataset.cat || 'all';
        renderGuideShortcuts(activeGuideCat, els.pageGuideSearchInput ? els.pageGuideSearchInput.value : '');
      });
    });
  }

  // Dedicated Page Hardware Slot Selector Pills
  if (els.pageSlotsRow) {
    els.pageSlotsRow.querySelectorAll('.slot-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        els.pageSlotsRow.querySelectorAll('.slot-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        updateModeDrawer(els.pageModeContent, pill.dataset.mode);
      });
    });
    updateModeDrawer(els.pageModeContent, '24g');
  }

  // Fallback modal controls
  const closeTroubleshoot = () => {
    if (els.troubleshootModal) els.troubleshootModal.classList.remove('open');
  };
  els.btnCloseTroubleshoot?.addEventListener('click', closeTroubleshoot);
  els.btnCloseTroubleshootFooter?.addEventListener('click', closeTroubleshoot);
  els.troubleshootModal?.addEventListener('click', (e) => {
    if (e.target === els.troubleshootModal) closeTroubleshoot();
  });
  els.btnTroubleshootConnect?.addEventListener('click', () => {
    closeTroubleshoot();
    handleConnect();
  });


  if (els.guideCatNav) {
    els.guideCatNav.querySelectorAll('.guide-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        els.guideCatNav.querySelectorAll('.guide-cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeGuideCat = btn.dataset.cat || 'all';
        renderGuideShortcuts(activeGuideCat, els.guideSearchInput ? els.guideSearchInput.value : '');
      });
    });
  }

  // Interactive slot selector pills on Welcome Screen
  if (els.welcomeSlotsRow) {
    els.welcomeSlotsRow.querySelectorAll('.slot-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        els.welcomeSlotsRow.querySelectorAll('.slot-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        updateModeDrawer(els.welcomeModeContent, pill.dataset.mode);
      });
    });
    updateModeDrawer(els.welcomeModeContent, '24g');
  }

  // Interactive slot selector pills on Dashboard
  if (els.dashSlotsRow) {
    els.dashSlotsRow.querySelectorAll('.slot-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        els.dashSlotsRow.querySelectorAll('.slot-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        updateModeDrawer(els.dashModeContent, pill.dataset.mode);
      });
    });
    updateModeDrawer(els.dashModeContent, '24g');
  }

  // Initial render
  renderGuideShortcuts('all', '');
  updateLightingStateBar();
}

// ==========================================================================
// Key Remapping Modal & Inspector Logic
// ==========================================================================
function initRemapModal() {
  els.selectRemapLayer.addEventListener('change', () => {
    state.remap.layer = parseInt(els.selectRemapLayer.value, 10);
    renderKeyboardStage(els.keyboardStageRemap, 'remap');
    updateUI();
  });

  els.btnCloseModal.addEventListener('click', () => {
    els.remapModal.classList.remove('open');
  });

  els.btnOpenRemapPicker?.addEventListener('click', () => {
    if (!state.remap.activeKey) {
      showToast('Heads up', 'Please click a keycap on the keyboard matrix first.', 'warning');
      return;
    }
    openRemapModal(state.remap.activeKey);
  });

  els.btnResetRemaps.addEventListener('click', async () => {
    const previous = { ...state.remap.overrides };
    state.remap.overrides = {};
    saveSession();
    renderKeyboardStage(els.keyboardStageRemap, 'remap');
    if (state.driver.isConnected) {
      try {
        // Map every changed key back to its own code (layer by layer).
        for (const k of Object.keys(previous)) {
          const [layer, idx] = k.split('_').map(Number);
          const key = KEYBOARD_LAYOUT.find(x => x.index === idx);
          if (key) await state.driver.setKeyRemap(layer, key.code, key.code);
        }
        showToast('Keys reset', 'Changed keys are back to their normal function.', 'success');
      } catch (e) {
        showToast('Something went wrong', e.message, 'error');
      }
    } else {
      showToast('Keys reset', 'Local overrides cleared. Connect keyboard to sync.', 'info');
    }
    updateUI();
  });
}

// Keys the firmware keeps for itself (official driver): Fn on the normal layer,
// and the hardware shortcut keys on the Fn layer.
function isRemapLocked(key, layer = state.remap.layer) {
  if (key.code === 223) return 'Fn can’t be remapped: the keyboard needs it for its shortcuts.';
  if (layer === 1 && FN_LAYER_RESERVED_CODES.includes(key.code)) {
    return `${key.name} is used by a built-in Fn shortcut, so it can’t be changed on the Fn layer.`;
  }
  return null;
}

function openRemapModal(key) {
  const locked = isRemapLocked(key);
  if (locked) { showToast('Key locked', locked, 'info'); return; }
  state.remap.activeKey = key;
  els.modalKeyTitle.textContent = `Remap Key: ${key.name}`;
  els.modalKeyInfo.textContent = `Choose what ${key.name} should do on the ${state.remap.layer === 1 ? 'Fn' : 'normal'} layer.`;

  els.remapGroupsContainer.innerHTML = '';
  AVAILABLE_REMAP_KEYS.forEach(group => {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'remap-group';
    groupDiv.innerHTML = `<div class="remap-group-title">${group.group}</div>`;

    const grid = document.createElement('div');
    grid.className = 'remap-keys-grid';

    group.keys.forEach(target => {
      const btn = document.createElement('button');
      btn.className = 'remap-key-btn';
      btn.textContent = target.name;
      btn.title = `Code: 0x${target.code.toString(16)}`;

      btn.addEventListener('click', async () => {
        const overrideKey = `${state.remap.layer}_${key.index}`;
        state.remap.overrides[overrideKey] = { name: target.name, code: target.code };
        saveSession();
        els.remapModal.classList.remove('open');
        renderKeyboardStage(els.keyboardStageRemap, 'remap');

        // Update inspector info
        if (els.inspectorCurrentBinding) els.inspectorCurrentBinding.textContent = `Does: ${target.name}`;

        if (state.driver.isConnected) {
          await runHardwareWrite(null, () => state.driver.setKeyRemap(state.remap.layer, key.code, target.code),
            { success: ['Key remapped', `${key.name} now does ${target.name}.`], errorTitle: "Couldn't remap the key", section: els.keyboardStageRemap?.closest('.surface-card'), sectionLabel: `Remapping ${key.name}…` });
        } else {
          showToast('Saved in this browser', `[${key.name}] -> [${target.name}]. Connect keyboard to upload.`, 'info');
        }
        updateUI();
      });
      grid.appendChild(btn);
    });

    groupDiv.appendChild(grid);
    els.remapGroupsContainer.appendChild(groupDiv);
  });

  els.remapModal.classList.add('open');
}

// ==========================================================================
// Custom Per-Key RGB Designer
// ==========================================================================
function initCustomRgb() {
  els.pickerCustomRgb.addEventListener('input', () => {
    state.customRgb.brushColor = els.pickerCustomRgb.value;
    if (els.brushColorHex) els.brushColorHex.textContent = state.customRgb.brushColor.toUpperCase();
  });

  // Brush swatches: the keyboard's solid colours (same as the official software and the
  // RGB Lighting tab). Multicolour is an effect, not a key colour.
  const brushes = COLOR_PALETTE.filter(c => c.hex.startsWith('#'));   // official 7 colours
  const markBrush = () => els.customRgbSwatches?.querySelectorAll('.swatch-circle').forEach(d => {
    const on = d.dataset.color.toUpperCase() === state.customRgb.brushColor.toUpperCase();
    d.classList.toggle('selected', on);
    d.setAttribute('aria-pressed', String(on));
  });
  if (els.customRgbSwatches) {
    els.customRgbSwatches.innerHTML = '';
    brushes.forEach(c => {
      const dot = document.createElement('div');
      dot.className = 'swatch-circle';
      dot.dataset.color = c.hex;
      dot.style.background = c.hex;
      dot.title = c.name;
      dot.setAttribute('aria-label', c.name);
      dot.addEventListener('click', () => {
        state.customRgb.brushColor = c.hex;
        els.pickerCustomRgb.value = c.hex.toLowerCase();
        if (els.brushColorHex) els.brushColorHex.textContent = c.hex.toUpperCase();
        markBrush();
        showToast('Brush colour', c.name, 'info', 1500);
      });
      els.customRgbSwatches.appendChild(dot);
    });
    markBrush();
  }
  els.pickerCustomRgb.addEventListener('input', markBrush);

  els.btnSetAllKeys.addEventListener('click', () => {
    state.customRgb.history.push({ ...state.customRgb.keyColors });
    KEYBOARD_LAYOUT.forEach(k => {
      state.customRgb.keyColors[k.index] = state.customRgb.brushColor;
    });
    renderKeyboardStage(els.keyboardStageCustomRgb, 'customrgb');
    showToast('All keys filled', `All keys painted with ${state.customRgb.brushColor}`, 'info', 6000, {
      action: { label: 'Undo', onClick: undoLastPaint }
    });
    registerUndo(undoLastPaint);
  });

  function undoLastPaint() {
    if (state.customRgb.history.length > 0) {
      state.customRgb.keyColors = state.customRgb.history.pop();
      renderKeyboardStage(els.keyboardStageCustomRgb, 'customrgb');
      showToast('Undo', 'Reverted previous RGB paint action.', 'info', 2000);
    }
  }

  els.btnUndoCustomRgb.addEventListener('click', () => {
    if (state.customRgb.history.length > 0) {
      state.customRgb.keyColors = state.customRgb.history.pop();
      renderKeyboardStage(els.keyboardStageCustomRgb, 'customrgb');
      showToast('Undo', 'Reverted previous RGB paint action.', 'info', 2000);
    } else {
      showToast('Undo', 'No previous paint actions to undo.', 'info', 2000);
    }
  });

  els.btnUploadCustomRgb.addEventListener('click', async () => {
    if (!state.driver.isConnected) {
      showToast('Heads up', 'Connect EvoFox Ronin keyboard first.', 'warning');
      return;
    }
    if (!state.driver.isOnline) {
      showToast('Keyboard is on Bluetooth', 'The receiver is plugged in, but the keyboard is on Bluetooth. Press Fn + 4 to switch to 2.4 GHz.', 'warning', 7000);
      return;
    }
    const colorList = KEYBOARD_LAYOUT.map(k => ({
      index: k.index,
      color: state.customRgb.keyColors[k.index] || '#000000'
    }));

    await runHardwareWrite(els.btnUploadCustomRgb, () => state.driver.setUserLightAllKeys(colorList), {
      success: ['Saved to keyboard', 'Your per-key colours stay on the keyboard, even when unplugged.'],
      errorTitle: "Couldn't save to keyboard",
      busyLabel: 'Saving to keyboard…',
      section: els.keyboardStageCustomRgb?.closest('.surface-card'),
      sectionLabel: 'Saving your colours…'
    });
  });
}

// ==========================================================================
// Profiles & Backup Manager (Offline Supported)
// ==========================================================================
function initProfiles() {
  const saved = localStorage.getItem('evofox_profiles');
  if (!saved) { try { localStorage.setItem('evofox_layout_v', String(LAYOUT_VERSION)); } catch (e) { /* storage blocked */ } }
  if (saved) {
    try {
      state.profiles.list = JSON.parse(saved);
      if (localStorage.getItem('evofox_layout_v') !== String(LAYOUT_VERSION)) {
        for (const k of Object.keys(state.profiles.list)) state.profiles.list[k] = migrateProfile(state.profiles.list[k]);
        localStorage.setItem('evofox_layout_v', String(LAYOUT_VERSION));
        saveProfilesToStorage();
      }
      refreshProfileDropdown();
    } catch (e) {
      console.warn('Failed to load profiles:', e);
    }
  }

  els.btnCreateProfile.addEventListener('click', () => {
    const name = els.inputNewProfileName.value.trim();
    if (!name) {
      showToast('Something went wrong', 'Please enter a valid profile name.', 'error');
      return;
    }
    const key = `prof_${Date.now()}`;
    state.profiles.list[key] = {
      name,
      createdAt: new Date().toISOString(),
      backlight: { ...state.backlight },
      boxlight: { ...state.boxlight },
      remaps: { ...state.remap.overrides },
      customRgb: { ...state.customRgb.keyColors }
    };
    saveProfilesToStorage();
    refreshProfileDropdown();
    els.selectProfileList.value = key;
    els.inputNewProfileName.value = '';
    showToast('Profile created', `Created and saved profile "${name}"`, 'success');
    updateUI();
  });

  els.btnDeleteProfile?.addEventListener('click', () => {
    const key = els.selectProfileList.value;
    if (key === 'default') {
      showToast('Heads up', 'The Default profile cannot be deleted.', 'warning');
      return;
    }
    const removed = state.profiles.list[key];
    delete state.profiles.list[key];
    saveProfilesToStorage();
    refreshProfileDropdown();
    els.selectProfileList.value = 'default';
    const restore = () => {
      state.profiles.list[key] = removed;
      saveProfilesToStorage();
      refreshProfileDropdown();
      els.selectProfileList.value = key;
      showToast('Profile restored', `"${removed.name}" is back.`, 'success');
      updateUI();
    };
    showToast('Profile deleted', 'Profile removed from local storage.', 'info', 6000, { action: { label: 'Undo', onClick: restore } });
    registerUndo(restore);
    updateUI();
  });

  els.selectProfileList.addEventListener('change', () => {
    const key = els.selectProfileList.value;
    const prof = state.profiles.list[key];
    if (prof) {
      state.profiles.current = key;
      if (prof.backlight) state.backlight = { ...prof.backlight };
      if (prof.boxlight) state.boxlight = { ...prof.boxlight };
      if (prof.remaps) state.remap.overrides = { ...prof.remaps };
      if (prof.customRgb) state.customRgb.keyColors = { ...prof.customRgb };

      renderKeyboards();
      syncControlsFromState();
      triggerHardwareSync();
      showToast('Profile loaded', `Switched to profile "${prof.name}"`, 'info');
      updateUI();
    }
  });

  // Export JSON Profile Backup
  els.btnExportProfileJson.addEventListener('click', () => {
    const payload = {
      app: 'EvoFox Ronin WebHID Configurator',
      version: '1.1.0',
      layoutVersion: LAYOUT_VERSION,
      exportedAt: new Date().toISOString(),
      profile: {
        id: state.profiles.current,
        name: state.profiles.list[state.profiles.current]?.name || 'Current Profile',
        backlight: state.backlight,
        boxlight: state.boxlight,
        remapOverrides: state.remap.overrides,
        customKeyColors: state.customRgb.keyColors,
        settings: state.settings
      }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evofox-ronin-${state.profiles.current}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported', 'Configuration JSON downloaded.', 'success');
  });

  // Import JSON Profile Backup
  els.btnImportProfileJson.addEventListener('click', () => els.fileProfileInput.click());
  els.fileProfileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (!data.profile) throw new Error('Invalid schema: Missing profile node.');

        const key = `import_${Date.now()}`;
        state.profiles.list[key] = {
          name: data.profile.name || 'Imported Profile',
          createdAt: new Date().toISOString(),
          backlight: data.profile.backlight || state.backlight,
          boxlight: data.profile.boxlight || state.boxlight,
          remaps: data.profile.remapOverrides || {},
          customRgb: data.profile.customKeyColors || {}
        };
        // Files exported before layout v2 carry the old key indices.
        if ((data.layoutVersion || 1) < LAYOUT_VERSION) state.profiles.list[key] = migrateProfile(state.profiles.list[key]);
        saveProfilesToStorage();
        refreshProfileDropdown();
        els.selectProfileList.value = key;

        // Apply imported settings
        state.backlight = { ...state.profiles.list[key].backlight };
        state.boxlight = { ...state.profiles.list[key].boxlight };
        state.remap.overrides = { ...state.profiles.list[key].remaps };
        state.customRgb.keyColors = { ...state.profiles.list[key].customRgb };

        renderKeyboards();
        triggerHardwareSync();
        showToast('Profiles imported', 'Profile loaded successfully from JSON.', 'success');
        updateUI();
      } catch (err) {
        showToast("Couldn't import", err.message || 'Invalid JSON file.', 'error');
      }
    };
    reader.readAsText(file);
    els.fileProfileInput.value = '';
  });
}

// Drag a backup .json anywhere to import it (profiles are available once connected)
function initProfileDrop() {
  const veil = els.dropVeil;
  if (!veil) return;
  let depth = 0;
  const canImport = (e) => [...(e.dataTransfer?.types || [])].includes('Files') &&
    !document.querySelector('.nav-item[data-tab="tab-profiles"]')?.classList.contains('locked-tab');
  window.addEventListener('dragenter', (e) => {
    if (!canImport(e)) return;
    depth++;
    veil.hidden = false;
  });
  window.addEventListener('dragover', (e) => { if (canImport(e)) e.preventDefault(); });
  window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) veil.hidden = true; });
  window.addEventListener('drop', (e) => {
    if (!canImport(e)) return;
    e.preventDefault();
    depth = 0;
    veil.hidden = true;
    const file = [...e.dataTransfer.files].find((f) => f.name.toLowerCase().endsWith('.json'));
    if (!file) { showToast("Couldn't import", 'Drop a .json profile backup exported from this app.', 'error'); return; }
    const dt = new DataTransfer();
    dt.items.add(file);
    els.fileProfileInput.files = dt.files;
    els.fileProfileInput.dispatchEvent(new Event('change'));
    switchTab('tab-profiles');
  });
}

function saveProfilesToStorage() {
  localStorage.setItem('evofox_profiles', JSON.stringify(state.profiles.list));
  localStorage.setItem('evofox_layout_v', String(LAYOUT_VERSION));
}

function refreshProfileDropdown() {
  els.selectProfileList.innerHTML = '';
  for (const [key, prof] of Object.entries(state.profiles.list)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = prof.name;
    els.selectProfileList.appendChild(opt);
  }
}

// ==========================================================================
// Device Connection State & Telemetry Synchronization
// ==========================================================================
// Sidebar device card: live connection, mode and battery.
function updateSidebarDevice() {
  const card = document.getElementById('sidebarDevice');
  if (!card) return;
  const d = state.driver;
  const status = document.getElementById('sidebarDeviceStatus');
  const meter = document.getElementById('sidebarDeviceMeter');
  let st = 'off', text = 'Not connected';
  if (state.systemEnv?.isMobile) { st = 'off'; text = 'Use a desktop browser'; }
  else if (d?.isConnected && d.isOnline) { st = 'on'; text = d.deviceMode === '2.4G' ? 'Connected • 2.4 GHz' : 'Connected • Type-C'; }
  else if (d?.isConnected) { st = 'wait'; text = state.waitingForLink ? 'Waking keyboard…' : 'Receiver only • press Fn + 4'; }
  card.dataset.state = st;
  if (status) status.textContent = text;
  card.setAttribute('aria-label', `Keyboard: ${text}`);
  if (meter) {
    meter.hidden = st !== 'on';
    const pct = Math.max(0, Math.min(100, d?.battery ?? 0));
    const fill = document.getElementById('sidebarBatteryFill');
    if (fill) { fill.style.width = pct + '%'; fill.dataset.level = pct <= 15 ? 'low' : pct <= 35 ? 'mid' : 'ok'; }
    const t = document.getElementById('sidebarBatteryText');
    if (t) t.textContent = `${pct}%${d?.isCharging ? ' • charging' : ''}`;
  }
}

function updateUI() {
  updateSidebarDevice();
  const isConn = state.driver && state.driver.isConnected;
  const isOnline = isConn && state.driver.isOnline;

  // Mobile Environment Safety Guard: If in mobile environment, lock out configurator and show mobile view
  if (state.systemEnv && state.systemEnv.isMobile) {
    if (els.sidebarNav) els.sidebarNav.classList.add('device-disconnected');
    els.navButtons.forEach(b => {
      if (b.dataset.tab !== 'tab-dashboard' && b.dataset.tab !== 'tab-guide') b.classList.add('locked-tab');
    });

    if (state.activeTab !== 'tab-dashboard' && state.activeTab !== 'tab-guide') {
      switchTab('tab-dashboard');
    }

    els.statusBadge.className = 'device-pill';
    els.statusText.textContent = 'Phone: shortcuts guide only';
    els.btnConnect.innerHTML = icon('phone') + '<span>Desktop Required</span>';
    els.btnConnect.classList.remove('connected-state');
    els.batteryPill.style.display = 'none';
    els.fwBadge.style.display = 'none';

    if (els.dashDisconnectedView) els.dashDisconnectedView.style.display = 'flex';
    if (els.dashConnectedView) els.dashConnectedView.style.display = 'none';

    if (els.btnHeroConnect) {
      els.btnHeroConnect.innerHTML = icon('phone') + '<span>Use a Desktop Browser</span>';
    }

    state.visualizerDashboard?.stop();
    if (state.activeTab === 'tab-dashboard') state.visualizerConnect?.start();
    return;
  }

  if (isConn) {
    if (isOnline) {
      // 1. ONLINE & CONNECTED (USB or 2.4G active)
      if (els.sidebarNav) els.sidebarNav.classList.remove('device-disconnected');
      els.navButtons.forEach(b => b.classList.remove('locked-tab'));

      // Hero: plugged in (kept in sync for when the welcome view shows again)
      setHeroState('connected', { link: state.driver.deviceMode === '2.4G' ? 'rf' : 'usb' });

      // Visualizers: Switch from connect stage to dashboard
      state.visualizerConnect?.stop();
      if (state.activeTab === 'tab-dashboard') state.visualizerDashboard?.start();

      // Top Bar Telemetry
      els.statusBadge.className = 'device-pill connected';
      const modeLabel = state.driver.deviceMode === '2.4G' ? 'Connected via 2.4 GHz' : 'Connected via USB';
      els.statusText.textContent = modeLabel;
      els.btnConnect.innerHTML = icon('plug') + '<span>Disconnect</span>';
      els.btnConnect.classList.add('connected-state');

      els.batteryPill.style.display = 'inline-flex';
      els.batteryText.textContent = `${state.driver.battery}%`;
      els.batteryFill.style.width = `${state.driver.battery}%`;
      els.chargeIcon.style.display = state.driver.isCharging ? 'inline' : 'none';

      if (state.driver.firmwareVersion && state.driver.firmwareVersion !== 'Unknown') {
        els.fwBadge.style.display = 'inline-flex';
        els.fwVersion.textContent = state.driver.firmwareVersion;
      }

      // Always show Guide button in header
      if (els.btnOpenTroubleshoot) {
        els.btnOpenTroubleshoot.style.display = 'inline-flex';
        els.btnOpenTroubleshoot.innerHTML = icon('book') + '<span class="btn-guide-label">Guide</span>';
      }

      // Dashboard Overview: Reveal Connected View
      // While the plug-in moment plays on the welcome hero, keep it on screen.
      if (!state.holdWelcome) {
        if (els.dashDisconnectedView) els.dashDisconnectedView.style.display = 'none';
        if (els.dashConnectedView) els.dashConnectedView.style.display = 'flex';
      }
      
      const is24G = state.driver.deviceMode === '2.4G';
      if (els.dashConnectedMode) els.dashConnectedMode.textContent = is24G ? '2.4 GHz wireless' : 'Wired (Type-C)';
      if (els.dashConnectedBattery) els.dashConnectedBattery.innerHTML = `${state.driver.battery}%${state.driver.isCharging ? ` <span class="telemetry-sub">${icon('bolt', 16)} Charging</span>` : ''}`;
      if (els.dashConnectedFw) els.dashConnectedFw.textContent = state.driver.firmwareVersion || 'Shinetek MCU';

      // Update Verified Hardware Pipe Status Box
      if (els.dashVerifiedPipeVal) {
        if (els.dashVerifiedPipeIcon) els.dashVerifiedPipeIcon.innerHTML = icon(is24G ? 'signal' : 'plug', 20);
        if (els.dashVerifiedPipeTitle) els.dashVerifiedPipeTitle.textContent = is24G ? '2.4 GHz wireless' : 'Wired (Type-C)';
        if (els.dashVerifiedPipeDesc) els.dashVerifiedPipeDesc.textContent = is24G ? 
          'Connected through the 2.4 GHz receiver (PID 0x8FF0).' : 
          'Connected with the Type-C cable (PID 0xA157). The keyboard is charging.';
        if (els.dashVerifiedPipeBadge) {
          els.dashVerifiedPipeBadge.className = 'mode-verified-badge';
          els.dashVerifiedPipeBadge.innerHTML = icon('check', 14) + (is24G ? ' Verified Ronin • 2.4 GHz receiver' : ' Verified Ronin • Type-C cable');
        }
      }

      // Highlight verified hardware slot pill on Dashboard
      if (els.dashSlotsRow) {
        const targetMode = is24G ? '24g' : 'usb';
        // every mode row (dashboard, welcome, guide page) follows the real connection
        [els.dashSlotsRow, els.welcomeSlotsRow, els.pageSlotsRow].forEach(row => row?.querySelectorAll('.slot-pill').forEach(pill => {
          const isTarget = pill.dataset.mode === targetMode;
          pill.classList.toggle('active-hardware', isTarget);
          pill.classList.toggle('active', isTarget);
        }));
        updateModeDrawer(els.dashModeContent, targetMode);
      }

      // Hide Connection-Required banners on hardware tabs
      [els.connReqBacklight, els.connReqUnderglow, els.connReqKeymap, els.connReqCustomRgb, els.connReqSettings].forEach(b => {
        if (b) b.classList.add('hidden');
      });

      // Unlock hardware control panels
      [els.backlightControlGrid, els.sidestripControlGrid, els.keymapControlGrid, els.customRgbControlGrid, els.settingsControlGrid].forEach(g => {
        if (g) g.classList.remove('hardware-locked');
      });

    } else {
      // 2. RECEIVER CONNECTED BUT KEYBOARD HARDWARE OFFLINE (Switched to Bluetooth or asleep)
      if (els.sidebarNav) els.sidebarNav.classList.add('device-disconnected');
      els.navButtons.forEach(b => {
        if (b.dataset.tab !== 'tab-dashboard' && b.dataset.tab !== 'tab-guide') b.classList.add('locked-tab');
      });

      if (state.activeTab !== 'tab-dashboard' && state.activeTab !== 'tab-guide') {
        switchTab('tab-dashboard');
      }

      // Top Bar Warning Pill
      els.statusBadge.className = 'device-pill warning';
      els.statusText.textContent = state.waitingForLink
        ? 'Receiver found • waking keyboard… press any key'
        : 'Receiver found • keyboard not on 2.4 GHz (press Fn + 4)';
      els.btnConnect.innerHTML = icon('plug') + '<span>Disconnect</span>';
      els.btnConnect.classList.add('connected-state');

      els.batteryPill.style.display = 'none';
      els.fwBadge.style.display = 'none';
      if (els.btnOpenTroubleshoot) els.btnOpenTroubleshoot.style.display = 'inline-flex';

      // Dashboard Overview: Reveal Disconnected Welcome Screen
      if (els.dashDisconnectedView) els.dashDisconnectedView.style.display = 'flex';
      if (els.dashConnectedView) els.dashConnectedView.style.display = 'none';

      // Hero: receiver found, keyboard not answering (Bluetooth mode or asleep)
      setHeroState('waiting', { link: 'rf' });
      if (els.connectHeroStatus) els.connectHeroStatus.className = 'connect-status-pill ' + (state.waitingForLink ? 'busy' : 'warning');
      if (els.connectHeroStatusText) els.connectHeroStatusText.textContent = state.waitingForLink
        ? 'Receiver found • waking the keyboard (press any key)'
        : 'Receiver found • switch the keyboard to 2.4 GHz with Fn + 4';

      // Show Connection-Required banners on hardware tabs
      [els.connReqBacklight, els.connReqUnderglow, els.connReqKeymap, els.connReqCustomRgb, els.connReqSettings].forEach(b => {
        if (b) b.classList.remove('hidden');
      });

      // Dim hardware control panels
      [els.backlightControlGrid, els.sidestripControlGrid, els.keymapControlGrid, els.customRgbControlGrid, els.settingsControlGrid].forEach(g => {
        if (g) g.classList.add('hardware-locked');
      });
    }

  } else {
    // 3. FULLY DISCONNECTED STATE
    if (els.sidebarNav) els.sidebarNav.classList.add('device-disconnected');
    els.navButtons.forEach(b => {
      if (b.dataset.tab !== 'tab-dashboard' && b.dataset.tab !== 'tab-guide') b.classList.add('locked-tab');
    });

    if (state.activeTab !== 'tab-dashboard' && state.activeTab !== 'tab-guide') {
      switchTab('tab-dashboard');
    }

    // Top Bar Disconnected State
    els.statusBadge.className = 'device-pill';
    els.statusText.textContent = 'Disconnected';
    els.btnConnect.innerHTML = icon('plug') + '<span>Connect</span>';
    els.btnConnect.classList.remove('connected-state');
    els.batteryPill.style.display = 'none';
    els.fwBadge.style.display = 'none';

    // Show Guide button in header when disconnected
    if (els.btnOpenTroubleshoot) els.btnOpenTroubleshoot.style.display = 'inline-flex';

    // Dashboard Overview: Reveal Disconnected Welcome Screen
    if (els.dashDisconnectedView) els.dashDisconnectedView.style.display = 'flex';
    if (els.dashConnectedView) els.dashConnectedView.style.display = 'none';

    // Hero: back to waiting above the port (soft states set elsewhere are kept)
    if (heroState === 'connected' || heroState === 'waiting') setHeroState('idle', { link: 'usb', fromSeated: heroState === 'connected' });

    // Visualizers: Run connection stage visualizer when on dashboard
    state.visualizerDashboard?.stop();
    if (state.activeTab === 'tab-dashboard') state.visualizerConnect?.start();

    // Reset Hero Connect CTA according to environment
    if (els.btnHeroConnect) {
      if (state.systemEnv && state.systemEnv.isMobile) {
        els.btnHeroConnect.innerHTML = icon('phone') + '<span>Use a Desktop Browser</span>';
      } else if (state.systemEnv && !state.systemEnv.hasWebHID) {
        els.btnHeroConnect.innerHTML = icon('alert') + '<span>WebHID Unsupported</span>';
      } else {
        els.btnHeroConnect.innerHTML = icon('plug', 20) + '<span>Connect Keyboard</span>';
      }
    }

    if (els.connectHeroStatusText) {
      els.connectHeroStatusText.textContent = "Your keyboard isn't connected yet";
    }
    if (els.connectHeroStatus) {
      els.connectHeroStatus.className = 'connect-status-pill';
    }

    // Show Connection-Required banners on hardware tabs
    [els.connReqBacklight, els.connReqUnderglow, els.connReqKeymap, els.connReqCustomRgb, els.connReqSettings].forEach(b => {
      if (b) b.classList.remove('hidden');
    });

    // Dim hardware control panels to avoid misleading user
    [els.backlightControlGrid, els.sidestripControlGrid, els.keymapControlGrid, els.customRgbControlGrid, els.settingsControlGrid].forEach(g => {
      if (g) g.classList.add('hardware-locked');
    });

    if (els.dashVerifiedPipeVal) {
      if (els.dashVerifiedPipeIcon) els.dashVerifiedPipeIcon.innerHTML = '<span class="status-dot"></span>';
      if (els.dashVerifiedPipeTitle) els.dashVerifiedPipeTitle.textContent = 'WebHID Disconnected';
      if (els.dashVerifiedPipeDesc) els.dashVerifiedPipeDesc.textContent = 'Connect via braided USB-C cable (Fn+5) or 2.4 GHz wireless receiver (Fn+4) to begin.';
      if (els.dashVerifiedPipeBadge) {
        els.dashVerifiedPipeBadge.className = 'mode-verified-badge is-unverified';
        els.dashVerifiedPipeBadge.innerHTML = '<span class="status-dot"></span> WebHID Offline';
      }
    }
  }

  // Toggle RF Offline Alert on Disconnected screen
  const rfAlert = document.getElementById('rfOfflineAlert');
  if (rfAlert) {
    rfAlert.style.display = (isConn && !isOnline) ? 'flex' : 'none';
  }

  // Update quick access card status readouts
  const curMode = BACKLIGHT_MODES.find(m => m.id === state.backlight.mode);
  if (els.quickLightStatus) els.quickLightStatus.textContent = curMode ? curMode.name : 'Flow';
  const curBox = BOXLIGHT_MODES.find(m => m.id === state.boxlight.mode);
  if (els.quickUnderglowStatus) els.quickUnderglowStatus.textContent = curBox ? curBox.name : 'Ripple Glow';
  if (els.quickRemapStatus) els.quickRemapStatus.textContent = (n => n ? `${n} remapped ${n === 1 ? 'key' : 'keys'}` : 'No remaps yet')(Object.keys(state.remap.overrides).length);
  if (els.quickProfileStatus) els.quickProfileStatus.textContent = state.profiles.list[state.profiles.current]?.name || 'Default';
  if (els.quickSettingsStatus) els.quickSettingsStatus.textContent = `${({1: 'Sleep 2 min', 2: 'Sleep 15 min', 3: 'Sleep 30 min', 4: 'No sleep'})[state.settings.sleepLevel] || 'Sleep 2 min'} · Response L${state.settings.responseLevel || 1}`;

  // Keep lighting state strip in sync
  updateLightingStateBar();
}

// ==========================================================================
// 6-Step Guided Connection Flow
// ==========================================================================
async function handleConnect() {
  if (state.systemEnv && state.systemEnv.isMobile) {
    showToast('Needs a computer', 'WebHID hardware communication requires a desktop computer (Windows, macOS, Linux, ChromeOS).', 'warning');
    return;
  }

  if (state.systemEnv && !state.systemEnv.hasWebHID) {
    showToast('Browser not supported', 'WebHID is not supported in this browser. Please open this app in Google Chrome, Microsoft Edge, or Brave.', 'warning');
    return;
  }

  if (state.driver.isConnected) {
    // DISCONNECT ACTION
    await state.driver.disconnect();
    setHeroState('idle', { link: 'usb', fromSeated: true });
    updateUI();
    showToast('Disconnected', 'EvoFox Ronin keyboard disconnected.', 'info');
  } else {
    // 1. STEP 1 & 2: Welcome & Ready Prompt
    if (els.connectHeroStatusText) els.connectHeroStatusText.textContent = 'Waiting for device selection in browser dialog...';
    if (els.connectHeroStatus) els.connectHeroStatus.className = 'connect-status-pill';
    if (els.btnHeroConnect) els.btnHeroConnect.innerHTML = spinner(18) + '<span>Connecting…</span>';
    if (els.connectHeroStatus) els.connectHeroStatus.className = 'connect-status-pill busy';
    if (els.statusBadge) els.statusBadge.className = 'device-pill busy';
    if (els.statusText) els.statusText.textContent = 'Connecting…';
    hideConnectError();
    state.holdWelcome = true;   // keep the hero visible until the plug-in moment has played
    setHeroState('waiting', { link: 'usb' });

    try {
      // 2. STEP 3: Request WebHID Device Chooser
      showLoading('Connecting…', 'Choose your Ronin in the browser prompt.', 25);
      const connectedDevice = await state.driver.requestConnection();

      // 3. STEP 4: Connecting & Verifying MCU
      updateLoading('Connected', 'Reading battery and firmware…', 90);

      hideLoading();

      // 5. Plug seats into the port, keys light up in one sweep
      setHeroState('connected', { link: state.driver.deviceMode === '2.4G' ? 'rf' : 'usb' });

      if (els.connectHeroStatus) els.connectHeroStatus.className = 'connect-status-pill connected';
      if (els.connectHeroStatusText) els.connectHeroStatusText.textContent = 'EvoFox Ronin 75% Verified & Ready!';
      if (els.btnHeroConnect) els.btnHeroConnect.innerHTML = icon('check', 20) + '<span>Connected</span>';
      hideConnectError();

      // 6. STEP 6: Smooth Transition to Dashboard
      setTimeout(() => {
        state.holdWelcome = false;
        state.lastPid = state.driver.device?.productId ?? state.lastPid;
        saveSession();
        updateUI();
        if (state.driver.isOnline) {
          // The keyboard keeps its own lighting in memory: connecting never overwrites it.
          triggerHardwareSync({ write: false });
          showToast('Connected', `Your Ronin is connected over ${state.driver.deviceMode === '2.4G' ? '2.4 GHz wireless' : 'the Type-C cable'}.`, 'success');
        } else {
          showToast('Receiver connected', 'The receiver is plugged in, but the keyboard is asleep or on Bluetooth. Press any key, or Fn + 4.', 'warning', 6000);
          waitForKeyboardLink();
        }
      }, prefersReducedMotion() ? 300 : 1500);   // let the plug-in moment play once

    } catch (err) {
      state.holdWelcome = false;
      hideLoading();
      const cancelled = err.name === 'NotFoundError' || (err.message && err.message.includes('No device'));
      setHeroState(cancelled ? 'idle' : 'error', { link: 'usb' });

      if (err.message === 'INCOMPATIBLE_DEVICE') {
        if (els.connectHeroStatus) els.connectHeroStatus.className = 'connect-status-pill error';
        if (els.connectHeroStatusText) els.connectHeroStatusText.textContent = 'Incompatible Hardware Detected';
        if (els.btnHeroConnect) els.btnHeroConnect.innerHTML = icon('plug', 20) + '<span>Connect Keyboard</span>';
        if (els.incompatibleModal) els.incompatibleModal.classList.add('active');
        showToast('Not a Ronin', 'The selected device is not an EvoFox Ronin 75% keyboard.', 'error');
        updateUI();
      } else if (err.name === 'NotFoundError' || (err.message && err.message.includes('No device selected'))) {
        if (els.connectHeroStatus) els.connectHeroStatus.className = 'connect-status-pill';
        if (els.connectHeroStatusText) els.connectHeroStatusText.textContent = 'Connection Cancelled • No device was selected';
        if (els.btnHeroConnect) els.btnHeroConnect.innerHTML = icon('refresh', 20) + '<span>Retry Connection</span>';
        showToast('Connection cancelled', 'No keyboard was selected in the browser prompt.', 'warning');
        updateUI();
      } else {
        if (els.connectHeroStatus) els.connectHeroStatus.className = 'connect-status-pill error';
        if (els.connectHeroStatusText) els.connectHeroStatusText.textContent = 'Connection Failed • Check cable or 2.4G receiver';
        if (els.btnHeroConnect) els.btnHeroConnect.innerHTML = icon('refresh', 20) + '<span>Retry Connection</span>';
        showToast("Couldn't connect", err.message || 'Could not communicate with device.', 'error', undefined, { action: { label: 'Retry', onClick: handleConnect } });
        showConnectError(err.message || 'Could not communicate with device.');
        if (els.statusBadge) els.statusBadge.className = 'device-pill error';
        if (els.statusText) els.statusText.textContent = 'Connection failed';
        // Expand troubleshooting drawer on error to assist user
        if (els.troubleshootDrawerContent) els.troubleshootDrawerContent.style.display = 'block';
        if (els.troubleshootToggleArrow) els.troubleshootToggleArrow.innerHTML = icon('chevronUp');
      }
    }
  }
}

// Four states: inline error card under the hero status
function showConnectError(message) {
  const card = els.connectErrorCard;
  if (!card) return;
  card.innerHTML = `
    ${spot('error')}
    <div>
      <h4>Couldn't connect</h4>
      <p>${escapeHtml(message)}</p>
      <button type="button" class="btn-action-secondary btn-sm" id="btnErrorTroubleshoot">${icon('help', 16)}<span>Show quick fixes</span></button>
    </div>`;
  card.hidden = false;
  card.querySelector('#btnErrorTroubleshoot')?.addEventListener('click', () => {
    if (els.troubleshootDrawerContent) els.troubleshootDrawerContent.style.display = 'block';
    if (els.troubleshootToggleArrow) els.troubleshootToggleArrow.innerHTML = icon('chevronUp');
    document.getElementById('connectTroubleshootDrawer')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function hideConnectError() {
  if (els.connectErrorCard) { els.connectErrorCard.hidden = true; els.connectErrorCard.innerHTML = ''; }
}

// Sync / connection status badge doubles as the help link
els.statusBadge?.addEventListener('click', () => switchTab('tab-guide'));
document.getElementById('sidebarDevice')?.addEventListener('click', () => {
  if (state.driver?.isConnected) switchTab('tab-dashboard'); else handleConnect();
});

// Attach connection triggers
els.btnConnect.addEventListener('click', handleConnect);
els.btnHeroConnect?.addEventListener('click', handleConnect);
els.btnWelcomeConnect?.addEventListener('click', handleConnect);
els.btnDashDisconnect?.addEventListener('click', async () => {
  if (state.driver.isConnected) {
    await state.driver.disconnect();
    updateUI();
    showToast('Disconnected', 'Keyboard disconnected.', 'info');
  }
});

// All ".btn-connect-trigger" buttons inside connection-required banners
document.querySelectorAll('.btn-connect-trigger').forEach(btn => {
  btn.addEventListener('click', handleConnect);
});

// Incompatible Device Modal Listeners
els.btnCloseIncompatibleModal?.addEventListener('click', () => {
  els.incompatibleModal?.classList.remove('active');
});
els.btnAcknowledgeIncompatible?.addEventListener('click', () => {
  els.incompatibleModal?.classList.remove('active');
});

// Expandable Troubleshooting Drawer Listener
els.btnToggleConnectHelp?.addEventListener('click', () => {
  if (!els.troubleshootDrawerContent) return;
  const isHidden = els.troubleshootDrawerContent.style.display === 'none';
  els.troubleshootDrawerContent.style.display = isHidden ? 'block' : 'none';
  if (els.troubleshootToggleArrow) els.troubleshootToggleArrow.innerHTML = icon(isHidden ? 'chevronUp' : 'chevronDown');
});

// Periodic Battery Sync
setInterval(async () => {
  if (state.driver && state.driver.isConnected) {
    await state.driver.refreshDeviceStatus();
    updateUI();
  }
}, 15000);

// Auto-detect previously authorized devices.
// Chrome remembers the permission you gave, so a reload reconnects on its own.
// It does NOT write anything: the keyboard already holds your lighting.
let autoDetectBusy = false;

function showConnectedVisuals() {
  setHeroState('connected', { link: state.driver.deviceMode === '2.4G' ? 'rf' : 'usb' });
  if (els.connectHeroStatus) els.connectHeroStatus.className = 'connect-status-pill connected';
  if (els.connectHeroStatusText) els.connectHeroStatusText.textContent = 'EvoFox Ronin 75% Verified & Ready!';
  hideConnectError();
}

async function autoDetect({ attempts = 3, quiet = false } = {}) {
  // Mobile Safety Guard: NEVER auto-connect in mobile environment
  if (state.systemEnv && state.systemEnv.isMobile) {
    appendLog("Auto-connect bypassed: Mobile environment active.", "info");
    return;
  }
  if (!state.driver.isSupported() || state.driver.isConnected || autoDetectBusy) return;
  autoDetectBusy = true;
  try {
    let devices = [];
    const manual = () => state.driver.isConnected || state.holdWelcome;   // a manual connect took over
    for (let i = 0; i < attempts && devices.length === 0; i++) {
      if (manual()) return;
      devices = await state.driver.getAuthorizedDevices();
      // The receiver/cable can take a moment to enumerate after a reload or replug.
      if (devices.length === 0 && i < attempts - 1) await new Promise(r => setTimeout(r, 700));
    }
    if (devices.length === 0) {
      appendLog("No remembered keyboard found. If you closed the browser, Chrome asks for permission again.", 'info');
      return;
    }
    // Chrome remembers every device you approved (cable AND dongle). Try the one
    // you used last first, then the other; take the first one the keyboard answers on.
    devices.sort((a, b) => (b.productId === state.lastPid) - (a.productId === state.lastPid));
    let fallback = null;
    for (const dev of devices) {
      if (manual()) return;
      try {
        await state.driver.connect(dev);
      } catch (e) {
        appendLog(`Auto-connect to ${dev.productName} failed: ${e.message}`, 'info');
        continue;
      }
      if (state.driver.isOnline) {
        onAutoConnected(dev, quiet);
        return;
      }
      // Dongle found but the keyboard isn't on 2.4 GHz (or is asleep): try the next device.
      fallback = fallback || dev;
      try { await state.driver.disconnect(); } catch (e) { /* ignore */ }
    }
    // Nothing answered yet: stay on the preferred receiver and keep listening for the keyboard.
    if (fallback) {
      await state.driver.connect(fallback);
      updateUI();
      waitForKeyboardLink();
    }
  } finally {
    autoDetectBusy = false;
  }
}

function onAutoConnected(dev, quiet) {
  state.lastPid = dev.productId;
  saveSession();
  showConnectedVisuals();
  updateUI();
  triggerHardwareSync({ write: false });
  if (!quiet) showToast('Reconnected', `Back on ${state.driver.deviceMode === '2.4G' ? '2.4 GHz wireless' : 'the Type-C cable'}. Your settings are as you left them.`, 'success');
}

// Receiver is plugged in but the keyboard isn't talking over 2.4 GHz yet (asleep, or in
// Bluetooth / wired mode). Ask every 1.5 s for 30 s, then fall back to the normal 15 s poll.
let linkWaitTimer = null;
function waitForKeyboardLink(tries = 20) {
  clearTimeout(linkWaitTimer);
  state.waitingForLink = true;
  updateUI();
  const tick = async (left) => {
    if (!state.driver.isConnected || state.driver.isOnline) {
      state.waitingForLink = false;
      if (state.driver.isOnline) {
        state.lastPid = state.driver.device?.productId ?? state.lastPid;
        saveSession();
        showConnectedVisuals();
        updateUI();
        showToast('Keyboard linked', 'Connected over 2.4 GHz wireless.', 'success');
      }
      return;
    }
    if (left <= 0) { state.waitingForLink = false; updateUI(); return; }
    try { await state.driver.refreshDeviceStatus(); } catch (e) { /* keep waiting */ }
    linkWaitTimer = setTimeout(() => tick(left - 1), 1500);
  };
  linkWaitTimer = setTimeout(() => tick(tries), 600);
}

// Plug / unplug of the dongle or cable while the page is open.
function initHidHotplug() {
  if (!state.driver.isSupported()) return;
  navigator.hid.addEventListener('connect', ({ device }) => {
    if (device.vendorId !== DEVICE_CONFIG.vendorId) return;
    appendLog(`Device plugged in: ${device.productName || 'EvoFox Ronin'}`, 'info');
    autoDetect({ attempts: 3 });
  });
  navigator.hid.addEventListener('disconnect', async ({ device }) => {
    if (!state.driver.isConnected || state.driver.device !== device) return;
    try { await state.driver.disconnect(); } catch (e) { /* already gone */ }
    state.driver.isConnected = false;
    state.driver.isOnline = false;
    setHeroState('unplugged', { fromSeated: true });
    updateUI();
    if (els.connectHeroStatus) els.connectHeroStatus.className = 'connect-status-pill warning';
    if (els.connectHeroStatusText) els.connectHeroStatusText.textContent = 'Keyboard unplugged • plug it back in to reconnect';
    showToast('Keyboard unplugged', 'Plug the dongle or cable back in and it reconnects on its own.', 'warning');
  });
}

// ==========================================================================
// Application Bootstrap
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  initIcons();
  // Locked tabs: friendly illustration instead of a bare plug icon
  document.querySelectorAll('.connection-required-card .req-icon').forEach(el => { el.innerHTML = spot('no-keyboard'); });
  initDialogs();
  enhanceAllSelects();   // branded dropdowns; native <select> stays the source of truth
  initClickables();
  initUndoShortcut();
  initProfileDrop();

  // Quick-access cards are focusable: Enter / Space open them
  document.querySelectorAll('.quick-nav-card[tabindex]').forEach((card) => {
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
    });
  });

  // Detect Environment & Browser Compatibility
  state.systemEnv = checkSystemEnvironment();
  renderEnvironmentStatus(state.systemEnv);

  restoreSession();
  initSidebar();
  initControls();
  initRemapModal();
  initCustomRgb();
  initProfiles();
  initModeCentreAndGuide();
  renderRoninHero();
  renderKeyboards();
  syncControlsFromState();
  initInteractiveKeystrokes();
  updateUI();
  initHidHotplug();
  autoDetect();
  window.addEventListener('pagehide', writeSession);

  // First-load splash: shown for at least 1 s from launch (intentional brand
  // moment), and until fonts are ready. Only here; actions are never delayed.
  const minSplash = new Promise(r => setTimeout(r, Math.max(0, 1000 - performance.now())));
  Promise.all([minSplash, document.fonts?.ready?.catch(() => {})]).then(hideSplash);
  appendLog("EvoFox Ronin WebHID Controller initialized successfully.");

  // Window Resize & Orientation Change Listener for immediate responsive updates
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const prevMobile = state.systemEnv?.isMobile;
      state.systemEnv = checkSystemEnvironment();
      if (prevMobile !== state.systemEnv.isMobile) {
        renderEnvironmentStatus(state.systemEnv);
        updateUI();
      }
    }, 150);
  });
});
