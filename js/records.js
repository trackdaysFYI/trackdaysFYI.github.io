const RECORDS_URL = "https://8fu4ilcse5.execute-api.us-east-1.amazonaws.com/getLapRecords";
const TRACKS_URL = "https://atqtpmna66.execute-api.us-east-1.amazonaws.com/getTrackdays?include=tracks";
const VEHICLE_LABELS = {C: "Car", M: "Bike"};

let records = [];
let allRecordsCache = null;
let recordsLoadId = 0;
let recordsAbort = null;
let trackFilterTimer = null;
let recordsLoading = false;
let loadedTrack = "";
let pageLoading = false;
let trackNames = {};
let trackSubtracks = {};
let viewMode = "class";
let paramsApplied = false;
let headerParamsApplied = false;
let referenceKey = null;
let changeUi = {submitting: false, submitId: 0, action: "edit", record: null};
let recordsUi = {submitting: false, submitId: 0};
const trackSelect = document.getElementById("track");
const nameInput = document.getElementById("name");
const vehicleSelect = document.getElementById("vehicle");
const classSelect = document.getElementById("class");
const subtrackSelect = document.getElementById("subtrack");
const subtrackFilter = document.getElementById("subtrack-filter");
const trackCol = document.getElementById("track-col");
const subtrackCol = document.getElementById("subtrack-col");
const classCol = document.getElementById("class-col");
const viewClassButton = document.getElementById("view-class");
const viewTimeButton = document.getElementById("view-time");
const exportCsvButton = document.getElementById("export-csv");
const printButton = document.getElementById("print-records");
const printFiltersEl = document.getElementById("print-filters");
const statusEl = document.getElementById("status");
const retryButton = document.getElementById("retry-load");
const rowsEl = document.getElementById("rows");
const changeDialog = document.getElementById("changeDialog");
const changeForm = document.getElementById("change-form");
const changeMeta = document.getElementById("change-meta");
const changeNoteLabel = document.getElementById("change-note-label");
const changeMessage = document.getElementById("changeMessage");
const recordDialog = document.getElementById("recordDialog");
const recordForm = document.getElementById("lap-record-form");
const recordMessage = document.getElementById("recordMessage");
const addRecordButton = document.getElementById("add-record");

function trackKey() {
  return trackSelect.value;
}

function trackLabel(key) {
  return trackNames[key] || key;
}

function vehicleLabel(record) {
  return [record.vehicleYear, record.vehicleMake, record.vehicleModel]
    .filter(value => value != null && value !== "")
    .join(" ");
}

function scopedRecords() {
  let vehicle = vehicleSelect.value;
  let track = trackKey();
  return records.filter(record => {
    if (track && String(record.track).toUpperCase() !== track) return false;
    if (vehicle && record.vehicleType !== vehicle) return false;
    return true;
  });
}

function trackHasSubtracks(key) {
  if (key) {
    if (Object.prototype.hasOwnProperty.call(trackSubtracks, key)) return trackSubtracks[key].length > 0;
    return records.some(record => String(record.track).toUpperCase() === key && record.subtrack);
  }
  if (Object.keys(trackSubtracks).some(name => trackSubtracks[name].length)) return true;
  return records.some(record => record.subtrack);
}

function showSubtracks() {
  return trackHasSubtracks(trackKey());
}

function syncSubtrackVisibility() {
  let show = showSubtracks();
  subtrackFilter.hidden = !show;
  if (!show) subtrackSelect.value = "";
  return show;
}

function syncTrackVisibility() {
  let show = !trackKey();
  trackCol.hidden = !show;
  return show;
}

function fillSelect(select, values, allLabel) {
  let current = select.value;
  let options = values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  select.innerHTML = `<option value="">${escapeHtml(allLabel)}</option>${options}`;
  select.value = values.includes(current) ? current : "";
}

function fillTrackSelect() {
  let current = trackKey() || (new URLSearchParams(location.search).get("track") || "").trim().toUpperCase();
  let keys = [...new Set([
    ...Object.keys(trackNames),
    ...records.map(record => String(record.track).toUpperCase()),
  ])];
  if (current && !keys.includes(current)) keys.push(current);
  keys.sort((a, b) => trackLabel(a).localeCompare(trackLabel(b)) || a.localeCompare(b));
  let options = keys.map(key => `<option value="${escapeHtml(key)}">${escapeHtml(trackLabel(key))}</option>`).join("");
  trackSelect.innerHTML = `<option value="">All tracks</option>${options}`;
  trackSelect.value = keys.includes(current) ? current : "";
}

function fillDependentSelects() {
  let scoped = scopedRecords();
  let classes = [...new Set(scoped.map(record => record.vehicleClass || "").filter(Boolean))].sort((a, b) => a.localeCompare(b));
  let subtracks = [...new Set(scoped.map(record => record.subtrack || "").filter(Boolean))].sort((a, b) => a.localeCompare(b));
  fillSelect(classSelect, classes, "All classes");
  fillSelect(subtrackSelect, subtracks, "All subtracks");
  syncSubtrackVisibility();
}

function filteredRecords() {
  let terms = nameInput.value.toLowerCase().split(",").map(term => term.trim()).filter(Boolean);
  let vehicleClass = classSelect.value;
  let subtrack = subtrackSelect.value;
  return scopedRecords().filter(record => {
    if (vehicleClass && (record.vehicleClass || "") !== vehicleClass) return false;
    if (subtrack && (record.subtrack || "") !== subtrack) return false;
    if (!terms.length) return true;
    let name = [record.holder, record.raceNumber, raceTag(record), vehicleLabel(record)].join(" ").toLowerCase();
    return terms.some(term => name.includes(term));
  });
}

function syncParams() {
  let url = new URL(location.href);
  let set = (key, value) => {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  };
  set("track", trackSelect.value);
  set("vehicle", vehicleSelect.value);
  set("class", classSelect.value);
  set("subtrack", subtrackSelect.value);
  set("q", nameInput.value.trim());
  set("view", viewMode === "time" ? "time" : "class");
  history.replaceState(null, "", url);
}

function applyParams() {
  let params = new URLSearchParams(location.search);
  let vehicle = params.get("vehicle") || "";
  if ([...vehicleSelect.options].some(option => option.value === vehicle)) vehicleSelect.value = vehicle;
  nameInput.value = params.get("q") || "";
  viewMode = params.get("view") === "time" ? "time" : "class";
  viewClassButton.classList.toggle("on", viewMode === "class");
  viewTimeButton.classList.toggle("on", viewMode === "time");
}

function applyDependentParams() {
  let params = new URLSearchParams(location.search);
  let vehicleClass = params.get("class") || "";
  let subtrack = params.get("subtrack") || "";
  if ([...classSelect.options].some(option => option.value === vehicleClass)) classSelect.value = vehicleClass;
  if ([...subtrackSelect.options].some(option => option.value === subtrack)) subtrackSelect.value = subtrack;
}

function compareRecords(a, b) {
  let byTime = timeToMs(a.time) - timeToMs(b.time);
  if (byTime !== 0) return byTime;
  return trackLabel(a.track).localeCompare(trackLabel(b.track)) || String(a.vehicleClass).localeCompare(String(b.vehicleClass));
}

function formatGap(ms) {
  ms = Math.round(ms);
  let sign = ms > 0 ? "+" : ms < 0 ? "\u2212" : "";
  ms = Math.abs(ms);
  let minutes = Math.floor(ms / 60000);
  let seconds = ((ms % 60000) / 1000).toFixed(3);
  if (!minutes) return `${sign}${seconds}`;
  let [whole, frac] = seconds.split(".");
  return `${sign}${minutes}:${whole.padStart(2, "0")}.${frac}`;
}

function recordKey(record) {
  if (record.recordId) return "id:" + record.recordId;
  return [
    record.time || "",
    String(record.track || "").toUpperCase(),
    record.subtrack || "",
    record.holder || "",
    record.raceNumber || "",
    record.vehicleType || "",
    record.vehicleClass || "",
    record.vehicleYear || "",
    record.vehicleMake || "",
    record.vehicleModel || "",
    record.date || "",
    record.evidence || "",
  ].join("\u001f");
}

function findRecordByKey(key) {
  return records.find(record => recordKey(record) === key) || null;
}

function gapFromReference(record, refMs) {
  if (refMs == null) return null;
  let ms = timeToMs(record.time);
  if (ms === Number.MAX_SAFE_INTEGER || refMs === Number.MAX_SAFE_INTEGER) return null;
  if (recordKey(record) === referenceKey) return null;
  return ms - refMs;
}

function csvEscape(value) {
  let text = String(value == null ? "" : value);
  // a leading formula character would run when the file is opened in a spreadsheet
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function exportCsv() {
  let shown = filteredRecords().slice().sort(compareRecords);
  if (!shown.length) return;
  let headers = ["Time", "Track", "Subtrack", "Holder", "Race #", "Vehicle", "Type", "Class", "Date", "Evidence"];
  let lines = [headers.map(csvEscape).join(",")];
  shown.forEach(record => {
    lines.push([
      record.time || "",
      trackLabel(record.track),
      record.subtrack || "",
      record.holder || "",
      record.raceNumber || "",
      vehicleLabel(record),
      VEHICLE_LABELS[record.vehicleType] || record.vehicleType || "",
      record.vehicleClass || "",
      record.date || "",
      record.evidence || "",
    ].map(csvEscape).join(","));
  });
  let blob = new Blob(["\uFEFF" + lines.join("\r\n")], {type: "text/csv;charset=utf-8"});
  downloadBlob(blob, "lap-records.csv");
}

function downloadBlob(blob, fileName) {
  let url = URL.createObjectURL(blob);
  let link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function activeFilterSummary() {
  let parts = [];
  let track = trackKey();
  if (track) parts.push(`Track: ${trackLabel(track)}`);
  if (vehicleSelect.value) {
    parts.push(`Vehicle: ${VEHICLE_LABELS[vehicleSelect.value] || vehicleSelect.value}`);
  }
  if (classSelect.value) parts.push(`Class: ${classSelect.value}`);
  if (subtrackSelect.value && !subtrackFilter.hidden) parts.push(`Subtrack: ${subtrackSelect.value}`);
  let query = nameInput.value.trim();
  if (query) parts.push(`Search: ${query}`);
  let view = `View: ${viewMode === "time" ? "Time" : "Class"}`;
  return parts.length ? `${parts.join(" · ")} · ${view}` : `Filters: none · ${view}`;
}

function printRecords() {
  if (!filteredRecords().length) return;
  window.print();
}

function recordRow(record, includeClass, includeTrack, includeSubtrack, includeType, gapMs) {
  let key = recordKey(record);
  let isRef = key === referenceKey;
  let type = includeType ? (VEHICLE_LABELS[record.vehicleType] || record.vehicleType || "") : "";
  let classLabel = [type, record.vehicleClass || ""].filter(Boolean).join(" · ");
  let evidence = safeHttpUrl(record.evidence);
  let evidenceCell = evidence ? `<a href="${escapeHtml(evidence)}" target="_blank" rel="noopener">View</a>` : "";
  let classCell = includeClass ? `<td>${escapeHtml(classLabel)}</td>` : "";
  let trackCell = includeTrack ? `<td>${escapeHtml(trackLabel(record.track))}</td>` : "";
  let subCell = includeSubtrack ? `<td>${escapeHtml(record.subtrack || "")}</td>` : "";
  let gap = isRef
    ? ` <span class="gap ref-mark" title="Reference">ref</span>`
    : gapMs == null
      ? ""
      : ` <span class="gap ${gapMs < 0 ? "faster" : gapMs > 0 ? "slower" : ""}">${formatGap(gapMs)}</span>`;
  let canChange = !!record.recordId;
  let actionIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
  let actionCell = canChange
    ? `<td class="actions"><button type="button" class="rec-change" data-key="${escapeHtml(key)}" title="Update or delete/protest" aria-label="Update or delete/protest">${actionIcon}</button></td>`
    : `<td class="actions"></td>`;
  return `<tr class="${isRef ? "ref" : ""}" data-key="${escapeHtml(key)}">
    <td class="time">${escapeHtml(record.time || "")}${gap}</td>
    ${trackCell}
    ${subCell}
    <td>${escapeHtml(record.holder || "")}${raceTag(record) ? ` <span class="race-no">${escapeHtml(raceTag(record))}</span>` : ""}</td>
    <td class="vehicle">${escapeHtml(vehicleLabel(record))}</td>
    ${classCell}
    <td>${escapeHtml(record.date || "")}</td>
    <td class="evidence">${evidenceCell}</td>
    ${actionCell}
  </tr>`;
}

function groupRows(shown, keyFor) {
  let groups = new Map();
  shown.forEach(record => {
    let key = keyFor(record);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });
  return [...groups.entries()].sort((a, b) => {
    let best = rows => Math.min(...rows.map(record => timeToMs(record.time)));
    let byTime = best(a[1]) - best(b[1]);
    if (byTime !== 0) return byTime;
    return a[0].localeCompare(b[0]);
  });
}

function classGroups(shown) {
  return groupRows(shown, record => [
    String(record.track || "").toUpperCase(),
    record.subtrack || "",
    record.vehicleType || "",
    record.vehicleClass || "",
  ].join("\0"));
}

function subtrackGroups(shown) {
  return groupRows(shown, record => [
    String(record.track || "").toUpperCase(),
    record.subtrack || "",
  ].join("\0"));
}

function groupLabel(key, flags) {
  let [track, subtrack, typeCode, className] = key.split("\0");
  let type = VEHICLE_LABELS[typeCode] || typeCode || "";
  let parts = [];
  if (flags.subtrack && subtrack) parts.push(subtrack);
  if (flags.track) parts.push(trackLabel(track));
  if (flags.includeType && type) parts.push(type);
  if (className) parts.push(className);
  return parts.filter(Boolean).join(" · ");
}

function subtrackDividerLabel(key, flags) {
  let [track, subtrack] = key.split("\0");
  let parts = [];
  if (subtrack) parts.push(subtrack);
  if (flags.track) parts.push(trackLabel(track));
  return parts.join(" · ");
}

function groupHead(label, colspan) {
  if (!label) return "";
  return `<tr class="group"><td colspan="${colspan}">${escapeHtml(label)}</td></tr>`;
}

function visibleColumnCount({ byClass, includeTrack, includeSubtrack }) {
  // Always: Time, Holder, Vehicle, Date, Evidence, Actions
  let count = 6;
  if (includeTrack) count += 1;
  if (includeSubtrack) count += 1;
  if (!byClass) count += 1; // Class
  return count;
}

function renderRows() {
  if (recordsLoading) return;
  let shown = filteredRecords();
  if (referenceKey && !shown.some(record => recordKey(record) === referenceKey)) referenceKey = null;
  let byClass = viewMode === "class";
  let includeTrack = syncTrackVisibility();
  syncSubtrackVisibility();
  // Subtrack is shown in group dividers, so the column is never needed.
  let includeSubtrack = false;
  subtrackCol.hidden = true;
  let includeType = !vehicleSelect.value;
  let refRecord = referenceKey && shown.find(record => recordKey(record) === referenceKey);
  let refMs = refRecord ? timeToMs(refRecord.time) : null;
  classCol.hidden = byClass;
  let colspan = visibleColumnCount({ byClass, includeTrack, includeSubtrack });
  statusEl.hidden = false;
  statusEl.className = "status";
  statusEl.textContent = `${shown.length} record${shown.length === 1 ? "" : "s"}`;
  exportCsvButton.disabled = !shown.length;
  printButton.disabled = !shown.length;
  if (typeof renderRecordCharts === "function") renderRecordCharts(shown, refRecord || null);
  if (!shown.length) {
    rowsEl.innerHTML = `<tr><td class="empty" colspan="${colspan}">No records match</td></tr>`;
    return;
  }
  let multipleTracks = includeTrack && new Set(shown.map(record => String(record.track || "").toUpperCase())).size > 1;
  if (!byClass) {
    let row = record => recordRow(record, true, includeTrack, includeSubtrack, includeType, gapFromReference(record, refMs));
    let withSubtrack = shown.filter(record => record.subtrack);
    if (!withSubtrack.length) {
      rowsEl.innerHTML = shown.sort(compareRecords).map(row).join("");
      return;
    }
    let sections = [];
    let plain = shown.filter(record => !record.subtrack);
    if (plain.length) sections.push(["", plain.sort(compareRecords)]);
    subtrackGroups(withSubtrack).forEach(([key, rows]) => {
      rows.sort(compareRecords);
      sections.push([key, rows]);
    });
    sections.sort((a, b) => timeToMs(a[1][0].time) - timeToMs(b[1][0].time) || a[0].localeCompare(b[0]));
    rowsEl.innerHTML = sections.map(([key, rows]) => {
      let head = key ? groupHead(subtrackDividerLabel(key, {track: multipleTracks}), colspan) : "";
      return head + rows.map(row).join("");
    }).join("");
    return;
  }
  let flags = {
    track: multipleTracks,
    includeType,
    subtrack: true,
  };
  rowsEl.innerHTML = classGroups(shown).map(([key, rows]) => {
    rows.sort(compareRecords);
    let best = timeToMs(rows[0].time);
    return groupHead(groupLabel(key, flags), colspan) + rows.map((record, index) => {
      let gap = refMs != null
        ? gapFromReference(record, refMs)
        : (index === 0 || timeToMs(record.time) === Number.MAX_SAFE_INTEGER || best === Number.MAX_SAFE_INTEGER
          ? null
          : timeToMs(record.time) - best);
      return recordRow(record, false, includeTrack, false, includeType, gap);
    }).join("");
  }).join("");
}

function render() {
  // header filters can change while the first list is still loading, so apply them only once
  if (!headerParamsApplied) {
    applyParams();
    headerParamsApplied = true;
  }
  fillTrackSelect();
  fillDependentSelects();
  if (!paramsApplied) {
    applyDependentParams();
    paramsApplied = true;
  }
  renderRows();
}

function onFilterChange({ refillDependents } = {}) {
  if (refillDependents) fillDependentSelects();
  syncParams();
  renderRows();
}

async function fetchLapRecords(track, signal) {
  let url = track
    ? RECORDS_URL + "?track=" + encodeURIComponent(track)
    : RECORDS_URL;
  let res = await fetch(url, signal ? {signal} : undefined);
  if (!res.ok) throw new Error("HTTP " + res.status);
  let data = await res.json();
  if (!Array.isArray(data)) throw new Error("Unable to load lap records.");
  return data;
}

function recordsErrorMessage(err) {
  return err && err.message && err.message.startsWith("HTTP ")
    ? err.message
    : "Unable to load lap records.";
}

async function loadRecordsForSelection(track) {
  let loadId = ++recordsLoadId;
  if (recordsAbort) {
    recordsAbort.abort();
    recordsAbort = null;
  }
  if (allRecordsCache) {
    records = track
      ? allRecordsCache.filter(record => String(record.track).toUpperCase() === track)
      : allRecordsCache;
    return {stale: false, fetched: false};
  }
  let abort = new AbortController();
  recordsAbort = abort;
  try {
    let data = await fetchLapRecords(track || "", abort.signal);
    if (loadId !== recordsLoadId) return {stale: true, fetched: false};
    if (!track) allRecordsCache = data;
    records = data;
    return {stale: false, fetched: true};
  } catch (err) {
    if (err && err.name === "AbortError") return {stale: true, fetched: false};
    if (loadId !== recordsLoadId) return {stale: true, fetched: false};
    throw err;
  } finally {
    if (recordsAbort === abort) recordsAbort = null;
  }
}

async function onTrackFilterChange() {
  let requested = trackKey();
  // replace the previous table while a different track is fetched; a cached list is instant
  if (!allRecordsCache) showRecordsLoading();
  try {
    let result = await loadRecordsForSelection(requested);
    if (result.stale) return;
    showResults();
    if (!paramsApplied) render();
    else onFilterChange({ refillDependents: true });
    syncParams();
    loadedTrack = requested;
  } catch (err) {
    if (trackSelect.value === requested) trackSelect.value = loadedTrack;
    showRefetchError(recordsErrorMessage(err));
  }
}

// Debounce track changes so arrowing through the select does not flood getLapRecords.
trackSelect.addEventListener("change", () => {
  clearTimeout(trackFilterTimer);
  if (!allRecordsCache) showRecordsLoading();
  trackFilterTimer = setTimeout(() => { onTrackFilterChange(); }, 100);
});
vehicleSelect.addEventListener("change", () => onFilterChange({ refillDependents: true }));
classSelect.addEventListener("change", () => onFilterChange());
subtrackSelect.addEventListener("change", () => onFilterChange());
nameInput.addEventListener("input", () => onFilterChange());
function setView(mode) {
  viewMode = mode;
  viewClassButton.classList.toggle("on", mode === "class");
  viewTimeButton.classList.toggle("on", mode === "time");
  onFilterChange();
}
viewClassButton.addEventListener("click", () => setView("class"));
viewTimeButton.addEventListener("click", () => setView("time"));
exportCsvButton.addEventListener("click", exportCsv);
printButton.addEventListener("click", printRecords);
retryButton.addEventListener("click", () => { loadPage(); });
window.addEventListener("beforeprint", () => {
  printFiltersEl.textContent = activeFilterSummary();
});
rowsEl.addEventListener("click", (event) => {
  let changeBtn = event.target.closest("button.rec-change");
  if (changeBtn) {
    event.stopPropagation();
    openChangeDialog(changeBtn.getAttribute("data-key"));
    return;
  }
  if (event.target.closest("a")) return;
  let row = event.target.closest("tr[data-key]");
  if (!row) return;
  let key = row.getAttribute("data-key");
  referenceKey = referenceKey === key ? null : key;
  renderRows();
});

function setChangeSubmitting(submitting) {
  setFormSubmitting(changeUi, changeForm, submitting);
}

function setChangeAction(action) {
  changeUi.action = action === "delete" ? "delete" : "edit";
  changeForm.querySelectorAll(".rec-type[data-action]").forEach(btn => {
    btn.classList.toggle("on", btn.getAttribute("data-action") === changeUi.action);
  });
  let editOnly = changeForm.querySelector(".rec-edit-only");
  editOnly.hidden = changeUi.action !== "edit";
  changeNoteLabel.textContent = changeUi.action === "edit" ? "Note to reviewer (optional)" : "Note to reviewer (required)";
  changeForm.elements.note.rows = changeUi.action === "edit" ? 2 : 8;
  document.getElementById("changeTitle").textContent =
    changeUi.action === "edit" ? "Update Record" : "Delete/Protest Record";
  setFormMessage(changeMessage, null);
}

function fillChangeForm(record) {
  changeUi.record = record;
  changeForm.reset();
  let type = VEHICLE_LABELS[record.vehicleType] || record.vehicleType || "";
  let parts = [
    `<strong>${escapeHtml(trackLabel(record.track))}</strong>`,
    record.subtrack ? escapeHtml(record.subtrack) : "",
    escapeHtml(formatHolder(record)),
    [type, record.vehicleClass].filter(Boolean).map(escapeHtml).join(" · "),
  ].filter(Boolean);
  changeMeta.innerHTML = parts.join(" · ");
  changeForm.elements.vehicleYear.value = record.vehicleYear != null ? String(record.vehicleYear) : "";
  changeForm.elements.vehicleMake.value = record.vehicleMake || "";
  changeForm.elements.vehicleModel.value = record.vehicleModel || "";
  changeForm.elements.time.value = record.time || "";
  changeForm.elements.date.value = record.date || "";
  changeForm.elements.date.max = todayIso();
  fillSelectOptions(changeForm.elements.timingDevice, TIMING_DEVICES, record.timingDevice || "", {defaultFirst: false});
  changeForm.elements.evidence.value = record.evidence || "";
  changeForm.elements.note.value = "";
  setChangeAction("edit");
  setChangeSubmitting(false);
  setFormMessage(changeMessage, null);
}

function openChangeDialog(key) {
  let record = findRecordByKey(key);
  if (!record || !record.recordId) return;
  fillChangeForm(record);
  if (!changeDialog.open) changeDialog.showModal();
  let first = changeForm.querySelector(".rec-edit-only input, .rec-edit-only select");
  if (first) first.focus();
}

function closeChangeDialog() {
  closeReviewDialog(changeUi, changeDialog);
}

function readChangeDraft() {
  return {
    vehicleYear: String(changeForm.elements.vehicleYear.value || "").trim(),
    vehicleMake: String(changeForm.elements.vehicleMake.value || "").trim(),
    vehicleModel: String(changeForm.elements.vehicleModel.value || "").trim(),
    time: String(changeForm.elements.time.value || "").trim(),
    date: String(changeForm.elements.date.value || "").trim(),
    timingDevice: String(changeForm.elements.timingDevice.value || "").trim(),
    evidence: String(changeForm.elements.evidence.value || "").trim(),
    note: String(changeForm.elements.note.value || "").trim(),
  };
}

function sameLapTime(a, b) {
  return formatLapTime(a) === formatLapTime(b);
}

function validateChangeDraft(draft) {
  let record = changeUi.record;
  if (!record || !record.recordId) return "Choose a lap record.";
  if (changeUi.action === "delete") return validateNote(draft.note, true);
  let shared = validateSharedEditFields(draft);
  if (shared) return shared;
  if (!TIMING_DEVICES.includes(draft.timingDevice)) return "Choose a timing device.";
  let year = parseOptionalYear(draft.vehicleYear).value;
  let currentYear = record.vehicleYear != null && record.vehicleYear !== ""
    ? Number(record.vehicleYear)
    : null;
  let changed =
    year !== currentYear ||
    draft.vehicleMake !== (record.vehicleMake || "") ||
    draft.vehicleModel !== (record.vehicleModel || "") ||
    !sameLapTime(draft.time, record.time) ||
    draft.date !== (record.date || "") ||
    draft.timingDevice !== (record.timingDevice || "") ||
    draft.evidence !== (record.evidence || "");
  if (!changed) return "Change at least one field.";
  return "";
}

function changePayload(draft) {
  let record = changeUi.record;
  let payload = {
    action: changeUi.action,
    recordId: record.recordId,
    track: record.track,
  };
  if (draft.note) payload.note = draft.note;
  if (changeUi.action === "delete") return payload;
  payload.time = formatLapTime(draft.time);
  payload.date = draft.date;
  payload.timingDevice = draft.timingDevice;
  payload.vehicleYear = parseOptionalYear(draft.vehicleYear).value;
  payload.vehicleMake = draft.vehicleMake;
  payload.vehicleModel = draft.vehicleModel;
  payload.evidence = draft.evidence;
  return payload;
}

async function submitChangeForm(event) {
  let draft = readChangeDraft();
  await submitReview(event, {
    state: changeUi,
    messageEl: changeMessage,
    setSubmitting: setChangeSubmitting,
    validate: () => validateChangeDraft(draft),
    payload: () => changePayload(draft),
    onSuccess() {
      let action = changeUi.action;
      fillChangeForm(changeUi.record);
      setChangeAction(action);
    },
  });
}

changeForm.addEventListener("submit", submitChangeForm);
changeForm.querySelectorAll(".rec-type[data-action]").forEach(btn => {
  btn.addEventListener("click", () => {
    if (changeUi.submitting) return;
    setChangeAction(btn.getAttribute("data-action"));
  });
});
wireReviewDialog(changeDialog, {
  state: changeUi,
  form: changeForm,
  messageEl: changeMessage,
  close: closeChangeDialog,
});

function formClasses(code, trackKey) {
  let bestMs = new Map();
  records.forEach(record => {
    if (String(record.track || "").toUpperCase() !== String(trackKey || "").toUpperCase()) return;
    if (record.vehicleType !== code) return;
    let name = record.vehicleClass || "";
    if (!name) return;
    let ms = timeToMs(record.time);
    if (!bestMs.has(name) || ms < bestMs.get(name)) bestMs.set(name, ms);
  });
  return rankFormClasses(suggestedClasses(code), bestMs);
}

function fillRecordTracks(form, selectedKey) {
  let select = form.elements.track;
  let keys = [...new Set([
    ...Object.keys(trackNames),
    ...records.map(record => String(record.track).toUpperCase()),
  ])];
  if (selectedKey && !keys.includes(selectedKey)) keys.push(selectedKey);
  keys.sort((a, b) => trackLabel(a).localeCompare(trackLabel(b)) || a.localeCompare(b));
  select.replaceChildren();
  let blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "Select a track";
  select.appendChild(blank);
  keys.forEach(key => {
    let option = document.createElement("option");
    option.value = key;
    option.textContent = trackLabel(key);
    select.appendChild(option);
  });
  select.value = keys.includes(selectedKey) ? selectedKey : "";
}

function refreshOpenRecordTracks() {
  if (!recordDialog.open) return;
  let selected = recordForm.elements.track.value || trackKey();
  fillRecordTracks(recordForm, selected);
  fillRecordSubtracks(recordForm, recordForm.elements.track.value, subtracksForTrack);
  refillRecordClasses(recordForm, recordForm.elements.vehicleType.value, "refresh", formClasses);
  if (recordForm.elements.track.options.length >= 2) setFormMessage(recordMessage, null);
}

function subtracksForTrack(trackKey) {
  let key = String(trackKey || "").toUpperCase();
  let known = trackSubtracks[key] || trackSubtracks[trackKey] || [];
  let fromRecords = records
    .filter(record => String(record.track || "").toUpperCase() === key)
    .map(record => record.subtrack || "")
    .filter(Boolean);
  return [...new Set([...known, ...fromRecords])].sort((a, b) => a.localeCompare(b));
}

function setRecordSubmitting(submitting) {
  setFormSubmitting(recordsUi, recordForm, submitting, [
    recordForm.elements.track,
    recordForm.elements.vehicleType,
    recordForm.elements.vehicleClass,
  ]);
}

function openRecordForm() {
  let preferredTrack = trackKey();
  let preferredType = vehicleSelect.value === "M" ? "M" : "C";
  if (!suggestedClasses(preferredType).length) preferredType = "C";
  recordsUi.submitting = false;
  prepareRecordForm(recordForm, preferredTrack, preferredType, formClasses, fillRecordTracks, subtracksForTrack);
  setRecordSubmitting(false);
  setFormMessage(recordMessage, recordForm.elements.track.options.length < 2
    ? {text: "Track list is unavailable. Retry loading the page, then open this form again.", kind: "err"}
    : null);
  if (!recordDialog.open) recordDialog.showModal();
  focusReviewField(recordForm);
}

function closeRecordForm() {
  closeReviewDialog(recordsUi, recordDialog);
}

async function submitCreateForm(event) {
  let draft = readCreateDraft(recordForm);
  await submitReview(event, {
    state: recordsUi,
    messageEl: recordMessage,
    setSubmitting: setRecordSubmitting,
    validate: () => validateCreateDraft(draft, {
      allowedClasses: formClasses(draft.vehicleType, draft.track),
      knownSubtracks: subtracksForTrack(draft.track),
    }),
    payload: () => createLapRecordPayload(draft),
    onSuccess() {
      prepareRecordForm(recordForm, draft.track, draft.vehicleType, formClasses, fillRecordTracks, subtracksForTrack);
    },
  });
}

addRecordButton.addEventListener("click", openRecordForm);
recordForm.addEventListener("submit", submitCreateForm);
recordForm.elements.track.addEventListener("change", () => {
  recordForm.elements.subtrack.value = "";
  fillRecordSubtracks(recordForm, recordForm.elements.track.value, subtracksForTrack);
  refillRecordClasses(recordForm, recordForm.elements.vehicleType.value, "reset", formClasses);
});
recordForm.elements.vehicleType.addEventListener("change", () => {
  refillRecordClasses(recordForm, recordForm.elements.vehicleType.value, "named", formClasses);
  setFormMessage(recordMessage, null);
});
recordForm.elements.vehicleClass.addEventListener("change", () => {
  let show = recordForm.elements.vehicleClass.value === CUSTOM_CLASS_VALUE;
  showRecordCustomClass(recordForm, show);
  if (show) recordForm.elements.customClass.focus();
});
wireReviewDialog(recordDialog, {
  state: recordsUi,
  form: recordForm,
  messageEl: recordMessage,
  close: closeRecordForm,
});

// Table/export loading only. Add-record readiness depends on the track list, not this fetch.
function showRecordsLoading() {
  recordsLoading = true;
  retryButton.hidden = true;
  statusEl.hidden = true;
  exportCsvButton.disabled = true;
  printButton.disabled = true;
  if (typeof clearRecordCharts === "function") clearRecordCharts();
  rowsEl.innerHTML = `<tr><td class="loading-cell" colspan="9"><div class="loading" role="status" aria-live="polite"><span class="loading-bar"></span><p>Loading lap records...</p></div></td></tr>`;
}

function setAddRecordReady(ready) {
  addRecordButton.disabled = !ready;
}

function showResults() {
  recordsLoading = false;
  retryButton.hidden = true;
}

function showRefetchError(message) {
  recordsLoading = false;
  renderRows();
  statusEl.hidden = false;
  statusEl.className = "status err";
  statusEl.textContent = message;
}

function showFirstLoadError(message) {
  recordsLoading = false;
  if (typeof clearRecordCharts === "function") clearRecordCharts();
  rowsEl.innerHTML = "";
  statusEl.hidden = false;
  statusEl.className = "status err";
  statusEl.textContent = message;
  retryButton.hidden = false;
}

async function loadPage() {
  if (pageLoading) return;
  pageLoading = true;
  showRecordsLoading();
  try {
    try {
      let tracksResult = await fetch(TRACKS_URL);
      if (tracksResult.ok) {
        let data = await tracksResult.json();
        (data.tracks || []).forEach(track => {
          if (!track.nickname) return;
          let key = String(track.nickname).toUpperCase();
          trackNames[key] = track.name || track.nickname;
          trackSubtracks[key] = Array.isArray(track.subtracks)
            ? track.subtracks.map(name => String(name || "").trim()).filter(Boolean)
            : [];
        });
      }
    } catch (err) {
      // Keep any track list already loaded. A failed refresh must not empty the form.
    }
    setAddRecordReady(Object.keys(trackNames).length > 0);
    refreshOpenRecordTracks();

    if (!headerParamsApplied) {
      applyParams();
      headerParamsApplied = true;
    }
    fillTrackSelect();
    let initialTrack = trackKey();
    try {
      let result = await loadRecordsForSelection(initialTrack);
      if (result.stale) return;
    } catch (err) {
      records = [];
      showFirstLoadError(recordsErrorMessage(err));
      return;
    }
    showResults();
    render();
    loadedTrack = trackKey();
  } finally {
    pageLoading = false;
  }
}

loadPage();
