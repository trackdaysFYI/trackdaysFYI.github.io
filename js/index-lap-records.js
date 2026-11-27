import {LAP_RECORDS_URL, fetchJson, vehicleFullLabel} from "./config.js";
import {
  escapeHtml,
  safeHttpUrl,
  timeToMs,
  formatLapTime,
  suggestedClasses,
  raceTag,
  fillTrackSelectOptions,
  createLapRecordDialog,
} from "./lap-record-shared.js";

let lapRecords = {tracks: {}};
let recordLoads = {};
export let recordsUi = {open: false, submitting: false, submitId: 0};
// Toggle: true = fetch all tracks' lap records with getTrackdays (current).
// false = per-track fetch in loadTrackRecords on popup/form open (use when volume grows).
// Also stop awaiting loadAllLapRecords() from visualizeData when flipping to false.
const PRELOAD_ALL_LAP_RECORDS = true;
let lapRecordsPreloadOk = false;
let ctx = null;
let recordDialogCtrl = null;

function trackRecords(trackKey) {
  let entry = lapRecords.tracks && lapRecords.tracks[trackKey];
  return entry && entry.records ? entry.records : [];
}

function recordClassName(record) {
  return record.vehicleClass || "";
}

export async function loadAllLapRecords() {
  lapRecordsPreloadOk = false;
  if (!PRELOAD_ALL_LAP_RECORDS) return;
  try {
    let records = await fetchJson(LAP_RECORDS_URL + "?maxPerClass=3");
    if (!Array.isArray(records)) throw new Error("Unable to load lap records.");
    let byTrack = {};
    records.forEach((record) => {
      let key = String(record.track || "").toUpperCase();
      if (!key) return;
      if (!byTrack[key]) byTrack[key] = [];
      byTrack[key].push(record);
    });
    Object.keys(byTrack).forEach((key) => {
      lapRecords.tracks[key] = {records: byTrack[key], loading: false, loaded: true, error: ""};
    });
    lapRecordsPreloadOk = true;
  } catch (err) {
    // Leave cache empty so loadTrackRecords can still fetch per track on open.
  }
}

export function finishLapRecordsPreload() {
  let tracks = ctx?.getTracks();
  if (!PRELOAD_ALL_LAP_RECORDS || !lapRecordsPreloadOk || !tracks) return;
  Object.keys(tracks).forEach((key) => {
    if (lapRecords.tracks[key]) return;
    lapRecords.tracks[key] = {records: [], loading: false, loaded: true, error: ""};
  });
}

export async function loadTrackRecords(trackKey) {
  if (!trackKey) {
    ctx.updateTrackPopup();
    return;
  }
  let entry = lapRecords.tracks[trackKey];
  if (entry && (entry.loaded || entry.loading)) {
    ctx.updateTrackPopup();
    return;
  }
  // Per-track path (also fallback if PRELOAD_ALL_LAP_RECORDS failed or is false).
  let token = {};
  recordLoads[trackKey] = token;
  lapRecords.tracks[trackKey] = {records: [], loading: true, loaded: false, error: ""};
  if (ctx.getLastOpenedTrack() === trackKey) ctx.updateTrackPopup();
  try {
    let records = await fetchJson(LAP_RECORDS_URL + "?track=" + encodeURIComponent(trackKey) + "&maxPerClass=3");
    if (recordLoads[trackKey] !== token) return;
    if (!Array.isArray(records)) throw new Error("Unable to load lap records.");
    lapRecords.tracks[trackKey] = {records, loading: false, loaded: true, error: ""};
  } catch (err) {
    if (recordLoads[trackKey] !== token) return;
    lapRecords.tracks[trackKey] = {
      records: [],
      loading: false,
      loaded: false,
      error: err && err.status ? "HTTP " + err.status : "Unable to load lap records.",
    };
  }
  if (ctx.getLastOpenedTrack() === trackKey && recordsUi.open) ctx.updateTrackPopup();
  if (recordDialogCtrl && recordDialogCtrl.currentTrack() === trackKey) recordDialogCtrl.sync();
}

function preferredRecordType() {
  let types = ["C", "M"].filter(code => suggestedClasses(code).length);
  let selectedVehicleTypes = ctx.getSelectedVehicleTypes();
  let preferred = ["C", "M", "S"].find(code => selectedVehicleTypes.has(code) && types.includes(code));
  return preferred || types[0] || "C";
}

export function setRecordsOpen(open) {
  recordsUi.open = open;
  if (open) {
    loadTrackRecords(ctx.getLastOpenedTrack());
  } else {
    ctx.updateTrackPopup();
  }
}

function trackOptionLabel(track, key) {
  let name = (track && (track.name || track.nickname)) || key;
  if (track && track.showNickname && track.nickname && track.nickname !== track.name) name += ` (${track.nickname})`;
  return name;
}

function trackEntries() {
  let tracks = ctx?.getTracks();
  if (!tracks) return [];
  return Object.keys(tracks).map(key => ({key, label: trackOptionLabel(tracks[key], key)}));
}

export function fillTrackSelect(select, selectedKey, placeholder) {
  fillTrackSelectOptions(select, trackEntries(), selectedKey, placeholder);
}

function trackSubtracks(trackKey) {
  let tracks = ctx?.getTracks();
  let track = tracks ? tracks[trackKey] : null;
  if (!track || !Array.isArray(track.subtracks)) return [];
  return track.subtracks.map(name => String(name).trim()).filter(Boolean);
}

export function resetRecordForm() {
  recordDialogCtrl?.reset();
}

export function openRecordForm() {
  recordDialogCtrl?.open();
}

export function recordsListHtml(trackKey) {
  let selectedVehicleTypes = ctx.getSelectedVehicleTypes();
  let add = `<button type="button" class="rec-add" data-popup-action="add-record">Add a Lap Record</button>`;
  let entry = lapRecords.tracks && lapRecords.tracks[trackKey];
  let records = trackRecords(trackKey);
  let allRecords = records.length ? `<a class="rec-all" href="records.html?track=${encodeURIComponent(trackKey)}" target="_blank" rel="noopener">All records</a>` : "";
  let footer = `<div class="rec-footer">${allRecords}${add}</div>`;
  let body = (inner) => ctx.popupList(inner, footer);
  if (entry && entry.loading && !records.length) return body(`<div class="empty">Loading lap records...</div>`);
  if (entry && entry.error && !records.length) return body(`<div class="empty">${escapeHtml(entry.error)}</div>`);
  let shown = records.filter(r => selectedVehicleTypes.has(r.vehicleType));
  let emptyMessage = records.length ? "No lap records for the selected vehicles" : "No Lap Records";
  if (!shown.length) return body(`<div class="empty">${emptyMessage}</div>`);
  function groupsHtml(typeRows) {
    let bySub = new Map();
    typeRows.forEach(r => {
      let sub = r.subtrack || "";
      if (!bySub.has(sub)) bySub.set(sub, []);
      bySub.get(sub).push(r);
    });
    return [...bySub.entries()].map(([sub, rows]) => {
      let bestByClass = new Map();
      rows.forEach(r => {
        let vehicleClass = recordClassName(r);
        let ms = timeToMs(r.time);
        if (!bestByClass.has(vehicleClass) || ms < bestByClass.get(vehicleClass)) bestByClass.set(vehicleClass, ms);
      });
      rows.sort((a, b) => {
        let classA = recordClassName(a);
        let classB = recordClassName(b);
        if (classA !== classB) {
          let d = bestByClass.get(classA) - bestByClass.get(classB);
          if (d !== 0) return d;
          return classA.localeCompare(classB);
        }
        return timeToMs(a.time) - timeToMs(b.time);
      });
      let heading = sub ? `<div class="rec-subhead">${escapeHtml(sub)}</div>` : "";
      let lastClass = null;
      let rank = 0;
      let body = rows.map(r => {
        let vehicleClass = recordClassName(r);
        let vehicleModel = [r.vehicleMake, r.vehicleModel].filter(v => v != null && v !== "").join(" ");
        if (vehicleClass !== lastClass) {
          lastClass = vehicleClass;
          rank = 1;
        } else {
          rank += 1;
        }
        let evidenceUrl = safeHttpUrl(r.evidence);
        let evidence = evidenceUrl ? `<a class="rec-evidence" href="${escapeHtml(evidenceUrl)}" target="_blank" rel="noopener" title="Evidence">▶</a>` : `<span class="rec-evidence"></span>`;
        let holder = r.holder ? `<span class="rec-holder">${escapeHtml(r.holder)}</span>` : `<span class="rec-holder"></span>`;
        let number = raceTag(r) ? `<span class="rec-number">${escapeHtml(raceTag(r))}</span>` : "";
        let vehicle = vehicleModel ? `<span class="rec-vehicle">${escapeHtml(vehicleModel)}</span>` : `<span class="rec-vehicle"></span>`;
        let classLabel = rank === 1 ? escapeHtml(vehicleClass) : "";
        let follow = rank > 1 ? " rec-follow" : "";
        return `<div class="rec-row${follow}"><span class="rec-class">${classLabel}</span><span class="rec-copy"><span class="rec-rank">${rank}</span>${holder}${number}${vehicle}<span class="rec-time">${escapeHtml(formatLapTime(r.time))}</span>${evidence}</span></div>`;
      }).join("");
      return heading + body;
    }).join("");
  }
  let typeSections = ["C", "M", "S"].filter(code => shown.some(r => r.vehicleType === code));
  let groups = typeSections.map((code, index) => {
    let heading = typeSections.length > 1 ? `<div class="rec-typehead${index ? "" : " first"}">${escapeHtml(vehicleFullLabel(code))}</div>` : "";
    return heading + groupsHtml(shown.filter(r => r.vehicleType === code));
  }).join("");
  return body(groups);
}

export function initIndexLapRecords(context) {
  ctx = context;
  recordDialogCtrl = createLapRecordDialog({
    dialog: document.getElementById("recordDialog"),
    state: recordsUi,
    getTrackEntries: trackEntries,
    getSubtracks: trackSubtracks,
    getRecordsForTrack: trackRecords,
    getDefaultTrack: () => ctx.getLastOpenedTrack(),
    getDefaultVehicleType: preferredRecordType,
    onTrackChange: (trackKey) => { if (trackKey) loadTrackRecords(trackKey); },
  });
}
