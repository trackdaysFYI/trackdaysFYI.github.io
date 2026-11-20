let lapRecords = {
  vehicleTypes: {
    C: {label: "Car"},
    M: {label: "Motorcycle"},
  },
  tracks: {},
};
let recordLoads = {};
let recordsUi = {open: false, submitting: false, submitId: 0};
const LAP_RECORDS_URL = "https://8fu4ilcse5.execute-api.us-east-1.amazonaws.com/getLapRecords";

function trackRecords(trackKey) {
  let entry = lapRecords.tracks && lapRecords.tracks[trackKey];
  return entry && entry.records ? entry.records : [];
}

function recordClassName(record) {
  return record.vehicleClass || "";
}

async function loadTrackRecords(trackKey) {
  if (!trackKey) {
    updateTrackPopup();
    return;
  }
  let entry = lapRecords.tracks[trackKey];
  if (entry && (entry.loaded || entry.loading)) {
    updateTrackPopup();
    return;
  }
  let token = {};
  recordLoads[trackKey] = token;
  lapRecords.tracks[trackKey] = {records: [], loading: true, loaded: false, error: ""};
  if (lastOpenedTrack === trackKey) updateTrackPopup();
  try {
    let res = await fetch(LAP_RECORDS_URL + "?track=" + encodeURIComponent(trackKey) + "&maxPerClass=3");
    if (recordLoads[trackKey] !== token) return;
    if (!res.ok) {
      let failure = new Error("HTTP " + res.status);
      failure.status = res.status;
      throw failure;
    }
    let records = await res.json();
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
  if (lastOpenedTrack === trackKey && recordsUi.open) updateTrackPopup();
  let recordFormEl = recordForm();
  if (recordFormEl && recordTrackKey(recordFormEl) === trackKey) syncRecordDialog();
}

function recordTypeLabel(code) {
  let info = lapRecords.vehicleTypes && lapRecords.vehicleTypes[code];
  if (info) return info.label;
  if (code === "S") return "Supermoto";
  return code;
}

function preferredRecordType(types) {
  let preferred = ["C", "M", "S"].find(code => selectedVehicleTypes.has(code) && (!types || types.includes(code)));
  return preferred || (types && types[0]) || "C";
}

function setRecordsOpen(open) {
  recordsUi.open = open;
  if (open) {
    loadTrackRecords(lastOpenedTrack);
  } else {
    updateTrackPopup();
  }
}

// hardcoded suggestions stay available - classes already on this track are ordered by their fastest lap; suggestions with no time yet follow in their original order
function formClasses(code, trackKey) {
  let bestMs = new Map();
  trackRecords(trackKey).forEach(record => {
    if (record.vehicleType !== code) return;
    let name = recordClassName(record);
    if (!name) return;
    let ms = timeToMs(record.time);
    if (!bestMs.has(name) || ms < bestMs.get(name)) bestMs.set(name, ms);
  });
  return rankFormClasses(suggestedClasses(code), bestMs);
}

function recordDialog() {
  return document.getElementById("recordDialog");
}

function recordForm() {
  return document.getElementById("lap-record-form");
}

function recordTrackKey(form) {
  let selected = form && form.elements.track && form.elements.track.value;
  return selected || lastOpenedTrack || "";
}

function trackOptionLabel(track, key) {
  let name = (track && (track.name || track.nickname)) || key;
  if (track && track.showNickname && track.nickname && track.nickname !== track.name) name += ` (${track.nickname})`;
  return name;
}

function fillTrackSelect(select, selectedKey, placeholder) {
  if (!select) return;
  let entries = [];
  if (typeof tracks !== "undefined" && tracks) {
    Object.keys(tracks).forEach(key => entries.push({key, label: trackOptionLabel(tracks[key], key)}));
  }
  if (selectedKey && !entries.some(entry => entry.key === selectedKey)) entries.push({key: selectedKey, label: selectedKey});
  entries.sort((a, b) => a.label.localeCompare(b.label));
  select.replaceChildren();
  if (placeholder) {
    let blank = document.createElement("option");
    blank.value = "";
    blank.textContent = placeholder;
    select.appendChild(blank);
  }
  entries.forEach(entry => {
    let option = document.createElement("option");
    option.value = entry.key;
    option.textContent = entry.label;
    select.appendChild(option);
  });
  if (selectedKey && [...select.options].some(option => option.value === selectedKey)) select.value = selectedKey;
  else if (placeholder) select.value = "";
  else if (select.options.length) select.selectedIndex = 0;
}

function fillRecordTracks(form, selectedKey) {
  fillTrackSelect(form.elements.track, selectedKey);
}

function trackSubtracks(trackKey) {
  let track = typeof tracks !== "undefined" && tracks ? tracks[trackKey] : null;
  if (!track || !Array.isArray(track.subtracks)) return [];
  return track.subtracks.map(name => String(name).trim()).filter(Boolean);
}

function applyRecordType(form, code) {
  if (form.elements.vehicleType) form.elements.vehicleType.value = code;
}

function syncRecordDialog() {
  let dialog = recordDialog();
  let form = recordForm();
  if (!dialog || !dialog.open || !form) return;
  refillRecordClasses(form, form.elements.vehicleType.value, "refresh", formClasses);
  fillRecordSubtracks(form, recordTrackKey(form), trackSubtracks);
}

function resetRecordForm() {
  recordsUi.submitting = false;
  recordsUi.submitId += 1;
  let dialog = recordDialog();
  if (dialog && dialog.open) dialog.close();
}

function prepareRecordForm(form, trackKey, type) {
  form.reset();
  applyRecordType(form, type);
  form.elements.customClass.value = "";
  fillRecordTracks(form, trackKey);
  let classes = formClasses(type, trackKey);
  fillRecordClassOptions(form, classes, classes[0] || "");
  fillRecordSubtracks(form, trackKey, trackSubtracks);
  let date = form.elements.date;
  if (date) date.max = todayIso();
}

function openRecordForm() {
  let dialog = recordDialog();
  let form = recordForm();
  if (!dialog || !form) return;
  let types = ["C", "M"].filter(code => suggestedClasses(code).length);
  let type = preferredRecordType(types);
  recordsUi.submitting = false;
  prepareRecordForm(form, lastOpenedTrack, type);
  setFormSubmitting(recordsUi, form, false);
  setFormMessage(form.querySelector(".rec-form-msg"), null);
  if (!dialog.open) dialog.showModal();
  focusReviewField(form);
}

function closeRecordForm() {
  closeReviewDialog(recordsUi, "recordDialog");
}

async function submitLapRecord(event) {
  let form = event.target;
  let draft = readCreateDraft(form);
  let trackKey = draft.track;
  let type = draft.vehicleType;
  await submitReview(event, {
    state: recordsUi,
    messageEl: form.querySelector(".rec-form-msg"),
    setSubmitting: (submitting) => setFormSubmitting(recordsUi, form, submitting),
    validate: () => validateCreateDraft(draft, {
      allowedClasses: formClasses(draft.vehicleType, draft.track),
      knownSubtracks: trackSubtracks(draft.track),
    }),
    payload: () => createLapRecordPayload(draft),
    onSuccess() {
      prepareRecordForm(form, trackKey, type);
    },
  });
}

function recordsListHtml(trackKey) {
  let add = `<button type="button" class="rec-add" data-popup-action="add-record">Add a Lap Record</button>`;
  let entry = lapRecords.tracks && lapRecords.tracks[trackKey];
  let records = trackRecords(trackKey);
  let allRecords = records.length ? `<a class="rec-all" href="records.html?track=${encodeURIComponent(trackKey)}" target="_blank" rel="noopener">All records</a>` : "";
  let footer = `<div class="rec-footer">${allRecords}${add}</div>`;
  if (entry && entry.loading && !records.length) return `<div class="empty">Loading lap records...</div>${footer}`;
  if (entry && entry.error && !records.length) return `<div class="empty">${escapeHtml(entry.error)}</div>${footer}`;
  let shown = records.filter(r => selectedVehicleTypes.has(r.vehicleType));
  let emptyMessage = records.length ? "No lap records for the selected vehicles" : "No Lap Records";
  if (!shown.length) return `<div class="empty">${emptyMessage}</div>${footer}`;
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
        let vehicleModel = [r.vehicleYear, r.vehicleMake, r.vehicleModel].filter(v => v != null && v !== "").join(" ");
        if (vehicleClass !== lastClass) {
          lastClass = vehicleClass;
          rank = 1;
        } else {
          rank += 1;
        }
        let evidenceUrl = safeHttpUrl(r.evidence);
        let evidence = evidenceUrl ? `<a class="rec-evidence" href="${escapeHtml(evidenceUrl)}" target="_blank" title="Evidence">▶</a>` : `<span></span>`;
        let meta = [r.holder, vehicleModel].filter(Boolean).map(escapeHtml).join(" · ");
        let classLabel = rank === 1 ? escapeHtml(vehicleClass) : "";
        let follow = rank > 1 ? " rec-follow" : "";
        return `<div class="rec-row${follow}"><span class="rec-class">${classLabel}</span><span class="rec-rank">${rank}</span><span class="rec-meta">${meta}</span><span class="rec-time">${escapeHtml(formatLapTime(r.time))}</span>${evidence}</div>`;
      }).join("");
      return heading + body;
    }).join("");
  }
  let typeSections = ["C", "M", "S"].filter(code => shown.some(r => r.vehicleType === code));
  let groups = typeSections.map((code, index) => {
    let heading = typeSections.length > 1 ? `<div class="rec-typehead${index ? "" : " first"}">${escapeHtml(recordTypeLabel(code))}</div>` : "";
    return heading + groupsHtml(shown.filter(r => r.vehicleType === code));
  }).join("");
  return `<div class="rec-panel">${groups}${footer}</div>`;
}

{
  let form = recordForm();
  form.addEventListener("submit", submitLapRecord);
  form.elements.track.addEventListener("change", () => {
    let trackKey = form.elements.track.value;
    if (form.elements.subtrack) form.elements.subtrack.value = "";
    fillRecordSubtracks(form, trackKey, trackSubtracks);
    refillRecordClasses(form, form.elements.vehicleType.value, "reset", formClasses);
    if (trackKey) loadTrackRecords(trackKey);
  });
  form.elements.vehicleType.addEventListener("change", () => {
    let code = form.elements.vehicleType.value;
    if (!suggestedClasses(code).length) return;
    refillRecordClasses(form, code, "named", formClasses);
    setFormMessage(form.querySelector(".rec-form-msg"), null);
  });
  form.elements.vehicleClass.addEventListener("change", () => {
    let show = form.elements.vehicleClass.value === CUSTOM_CLASS_VALUE;
    showRecordCustomClass(form, show);
    if (show && form.elements.customClass) form.elements.customClass.focus();
  });
  wireReviewDialog(document.getElementById("recordDialog"), {
    state: recordsUi,
    form,
    messageEl: document.getElementById("recordMessage"),
    close: closeRecordForm,
  });
}
