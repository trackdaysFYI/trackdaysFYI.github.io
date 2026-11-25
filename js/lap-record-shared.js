const LAP_RECORD_SUBMIT_URL = "https://8fu4ilcse5.execute-api.us-east-1.amazonaws.com/submitLapRecord";
const LAP_TIME_RE = /^(?:\d{1,3}:[0-5]\d|[0-5]?\d)\.\d{1,3}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CUSTOM_CLASS_VALUE = "__custom__";
const SUGGESTED_CLASSES = {
  C: ["Open"],
  M: ["Open", "600cc", "Twins", "Lightweight", "Motard"],
};
const TIMING_DEVICES = [
  "Official Result",
  "Transponder",
  "Data Logger (AiM/RaceBox)",
  "Phone GPS",
  "Video",
  "Other/My Imagination",
];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

function safeHttpUrl(value) {
  try {
    let url = new URL(String(value));
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.href;
  } catch (e) {
    return "";
  }
}

function timeToMs(time) {
  let text = String(time).trim();
  if (!LAP_TIME_RE.test(text)) return Number.MAX_SAFE_INTEGER;
  let colon = text.indexOf(":");
  let minutes = 0;
  let seconds = text;
  if (colon !== -1) {
    minutes = Number(text.slice(0, colon));
    seconds = text.slice(colon + 1);
  }
  return minutes * 60000 + Number(seconds) * 1000;
}

function formatLapTime(time) {
  let text = String(time || "").trim();
  let dot = text.lastIndexOf(".");
  if (dot === -1) return text;
  return text.slice(0, dot + 1) + text.slice(dot + 1).padEnd(3, "0");
}

function fillSelectOptions(select, options, selectedValue) {
  if (!select) return "";
  select.replaceChildren();
  options.forEach(name => {
    let option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  });
  if (selectedValue != null && options.includes(selectedValue)) {
    select.value = selectedValue;
    return selectedValue;
  }
  if (options.length) {
    select.value = options[0];
    return options[0];
  }
  select.value = "";
  return "";
}

function fillSelectWithOther(select, options, selectedValue, otherValue) {
  if (!select) return "";
  fillSelectOptions(select, options, options.includes(selectedValue) ? selectedValue : null);
  let other = document.createElement("option");
  other.value = otherValue;
  other.textContent = "Other";
  select.appendChild(other);
  let choice = options[0] || otherValue;
  if (selectedValue === otherValue) choice = otherValue;
  else if (options.includes(selectedValue)) choice = selectedValue;
  select.value = choice;
  return choice;
}

function rankFormClasses(suggested, bestMs) {
  let suggestedIndex = new Map(suggested.map((name, index) => [name, index]));
  let names = [...new Set([...suggested, ...bestMs.keys()])];
  let noTime = Number.MAX_SAFE_INTEGER;
  names.sort((a, b) => {
    let aMs = bestMs.has(a) ? bestMs.get(a) : noTime;
    let bMs = bestMs.has(b) ? bestMs.get(b) : noTime;
    if (aMs !== bMs) return aMs - bMs;
    if (aMs === noTime) {
      let aIndex = suggestedIndex.has(a) ? suggestedIndex.get(a) : suggested.length;
      let bIndex = suggestedIndex.has(b) ? suggestedIndex.get(b) : suggested.length;
      if (aIndex !== bIndex) return aIndex - bIndex;
    }
    return a.localeCompare(b);
  });
  return names;
}

function showRecordCustomClass(form, show) {
  let el = form.querySelector(".rec-custom-class");
  if (el) el.hidden = !show;
}

function suggestedClasses(code) {
  return SUGGESTED_CLASSES[code] || [];
}

function todayIso() {
  let now = new Date();
  let y = now.getFullYear();
  let m = String(now.getMonth() + 1).padStart(2, "0");
  let d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseOptionalYear(text) {
  let raw = String(text || "").trim();
  if (!raw) return {ok: true, error: "", value: null};
  let year = Number(raw);
  let maxYear = new Date().getFullYear() + 1;
  if (!Number.isInteger(year) || year < 1885 || year > maxYear) {
    return {ok: false, error: "Enter a vehicle year.", value: null};
  }
  return {ok: true, error: "", value: year};
}

function validateVehicleMake(text) {
  if (!text || text.length > 40) return "Enter a vehicle make.";
  return "";
}

function validateVehicleModel(text) {
  if (!text || text.length > 60) return "Enter a vehicle model.";
  return "";
}

function validateLapTime(text) {
  if (!LAP_TIME_RE.test(text)) return "Enter a time like 1:23.456 or 54.32.";
  return "";
}

function validateLapDate(text) {
  if (!DATE_RE.test(text) || text > todayIso()) return "Enter the date of the lap.";
  return "";
}

function validateEvidence(text) {
  if (text && (!safeHttpUrl(text) || text.length > 300)) return "Evidence link must be an http(s) URL.";
  return "";
}

function validateNote(text, required) {
  if (required && !text) return "Enter a note.";
  if (text.length > 300) return "Note is too long.";
  return "";
}

function validateSharedEditFields(draft) {
  let year = parseOptionalYear(draft.vehicleYear);
  if (!year.ok) return year.error;
  return (
    validateVehicleMake(draft.vehicleMake) ||
    validateVehicleModel(draft.vehicleModel) ||
    validateLapTime(draft.time) ||
    validateLapDate(draft.date) ||
    validateEvidence(draft.evidence) ||
    validateNote(draft.note, false) ||
    ""
  );
}

function readCreateDraft(form) {
  let data = new FormData(form);
  let selectedClass = String(data.get("vehicleClass") || "");
  let classIsCustom = selectedClass === CUSTOM_CLASS_VALUE;
  return {
    track: form.elements.track ? form.elements.track.value : "",
    vehicleType: String(data.get("vehicleType") || ""),
    vehicleClass: classIsCustom ? String(data.get("customClass") || "").trim() : selectedClass,
    classIsCustom,
    vehicleYear: String(data.get("vehicleYear") || "").trim(),
    vehicleMake: String(data.get("vehicleMake") || "").trim(),
    vehicleModel: String(data.get("vehicleModel") || "").trim(),
    subtrack: String(data.get("subtrack") || "").trim(),
    time: String(data.get("time") || "").trim(),
    holder: String(data.get("holder") || "").trim(),
    date: String(data.get("date") || "").trim(),
    timingDevice: String(data.get("timingDevice") || "").trim(),
    raceNumber: String(data.get("raceNumber") || "").trim(),
    evidence: String(data.get("evidence") || "").trim(),
    note: String(data.get("note") || "").trim(),
  };
}

function validateRaceNumber(value) {
  if (!value) return "";
  if (!/^[A-Za-z0-9]{1,4}$/.test(value)) return "Race number must be up to 4 letters or numbers.";
  return "";
}

function raceTag(record) {
  let number = String(record && record.raceNumber || "").trim();
  return number ? "#" + number : "";
}

function formatHolder(record) {
  let name = String(record && record.holder || "").trim();
  let tag = raceTag(record);
  if (name && tag) return `${name} ${tag}`;
  return name || tag;
}

function createLapRecordPayload(draft) {
  let payload = {
    action: "create",
    track: draft.track,
    vehicleType: draft.vehicleType,
    vehicleClass: draft.vehicleClass,
    vehicleMake: draft.vehicleMake,
    vehicleModel: draft.vehicleModel,
    subtrack: draft.subtrack,
    time: formatLapTime(draft.time),
    holder: draft.holder,
    date: draft.date,
    timingDevice: draft.timingDevice,
  };
  let year = parseOptionalYear(draft.vehicleYear).value;
  if (year != null) payload.vehicleYear = year;
  if (draft.raceNumber) payload.raceNumber = draft.raceNumber;
  if (draft.evidence) payload.evidence = draft.evidence;
  if (draft.note) payload.note = draft.note;
  return payload;
}

// opts: { allowedClasses, knownSubtracks }
function validateCreateDraft(draft, opts) {
  opts = opts || {};
  let allowedClasses = opts.allowedClasses || [];
  let knownSubtracks = opts.knownSubtracks || [];
  if (!draft.track || draft.track.length > 40) return "Choose a track.";
  if (!suggestedClasses(draft.vehicleType).length) return "Choose a vehicle type.";
  if (draft.classIsCustom) {
    if (!draft.vehicleClass || draft.vehicleClass.length > 40) return "Enter a class.";
  } else if (!allowedClasses.includes(draft.vehicleClass)) {
    return "Choose a class.";
  }
  let shared = validateSharedEditFields(draft);
  if (shared) return shared;
  if (!TIMING_DEVICES.includes(draft.timingDevice)) return "Choose a timing device.";
  if (knownSubtracks.length && !knownSubtracks.includes(draft.subtrack)) return "Choose a subtrack.";
  if (draft.subtrack.length > 40) return "Subtrack is too long.";
  if (!draft.holder || draft.holder.length > 80) return "Enter the record holder.";
  return validateRaceNumber(draft.raceNumber);
}

function fillRecordClassOptions(form, classes, selectedValue) {
  let choice = fillSelectWithOther(form.elements.vehicleClass, classes, selectedValue, CUSTOM_CLASS_VALUE);
  showRecordCustomClass(form, choice === CUSTOM_CLASS_VALUE);
  return choice;
}

// missingClass: "reset" drops an unknown class, "named" keeps Other only when the typed name is a class, "refresh" keeps the current selection
function refillRecordClasses(form, type, missingClass, getClasses) {
  let trackKey = form.elements.track ? form.elements.track.value : "";
  let classes = getClasses(type, trackKey);
  let selected = form.elements.vehicleClass.value;
  let customText = form.elements.customClass.value;
  let next;
  let clearCustom = false;
  if (selected === CUSTOM_CLASS_VALUE && (missingClass !== "named" || classes.includes(customText))) {
    next = CUSTOM_CLASS_VALUE;
  } else if (selected !== CUSTOM_CLASS_VALUE && (classes.includes(selected) || missingClass === "refresh")) {
    next = selected;
  } else {
    next = classes[0] || "";
    clearCustom = true;
  }
  fillRecordClassOptions(form, classes, next);
  if (next === CUSTOM_CLASS_VALUE) form.elements.customClass.value = customText;
  else if (clearCustom) form.elements.customClass.value = "";
}

function fillRecordSubtracks(form, trackKey, getSubtracks) {
  let select = form.elements.subtrack;
  if (!select) return;
  let field = select.closest(".rec-field");
  let options = getSubtracks(trackKey) || [];
  let prev = select.value;
  fillSelectOptions(select, options, prev);
  if (field) field.hidden = !options.length;
}

// formClasses ranks names for this page. fillTracks and subtracks supply that page's tracks.
function prepareRecordForm(form, trackKey, type, formClasses, fillTracks, subtracks) {
  form.reset();
  if (form.elements.vehicleType) form.elements.vehicleType.value = type;
  form.elements.customClass.value = "";
  fillTracks(form, trackKey);
  let classes = formClasses(type, trackKey);
  fillRecordClassOptions(form, classes, classes[0] || "");
  fillRecordSubtracks(form, trackKey, subtracks);
  let date = form.elements.date;
  if (date) date.max = todayIso();
}

function setFormMessage(el, message) {
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    el.className = "rec-form-msg";
    return;
  }
  el.hidden = false;
  el.textContent = message.text;
  el.className = "rec-form-msg " + message.kind;
}

function setFormSubmitting(state, form, submitting, extraEls) {
  state.submitting = submitting;
  let button = form.querySelector(".rec-submit");
  if (button) {
    button.disabled = submitting;
    button.textContent = submitting ? "Submitting..." : "Submit for Review";
  }
  form.querySelectorAll(".rec-type, .rec-cancel, .suggest-close").forEach(el => {
    el.disabled = submitting;
  });
  (extraEls || []).forEach(el => {
    if (el) el.disabled = submitting;
  });
}

function closeReviewDialog(state, dialog) {
  if (state.submitting) return;
  let el = typeof dialog === "string" ? document.getElementById(dialog) : dialog;
  if (el && el.open) el.close();
}

function wireReviewDialog(dialog, {state, form, messageEl, close}) {
  form.querySelectorAll(".suggest-close, .rec-cancel").forEach(el => {
    el.addEventListener("click", close);
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });
  dialog.addEventListener("cancel", (event) => {
    if (state.submitting) event.preventDefault();
  });
  form.addEventListener("input", () => {
    if (!messageEl.hidden && messageEl.classList.contains("err")) setFormMessage(messageEl, null);
  });
}

function focusReviewField(root) {
  let focus = [...root.querySelectorAll("input, textarea, select")].find((el) => el.type !== "hidden" && !el.closest("[hidden]"));
  if (focus) focus.focus();
}

async function postJson(url, payload) {
  let res = await fetch(url, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw Object.assign(new Error("HTTP " + res.status), {status: res.status});
  return res;
}

async function postLapRecord(payload) {
  return postJson(LAP_RECORD_SUBMIT_URL, payload);
}

async function submitReview(event, opts) {
  event.preventDefault();
  if (opts.state.submitting) return;
  let error = opts.validate();
  if (error) {
    setFormMessage(opts.messageEl, {kind: "err", text: error});
    return;
  }
  let started = ++opts.state.submitId;
  opts.setSubmitting(true);
  setFormMessage(opts.messageEl, null);
  try {
    await (opts.post ? opts.post() : postLapRecord(opts.payload()));
    if (opts.state.submitId !== started) return;
    if (opts.onSuccess) opts.onSuccess();
    setFormMessage(opts.messageEl, {kind: "ok", text: "Submitted for review."});
  } catch (err) {
    if (opts.state.submitId !== started) return;
    let text = err && err.status ? "Unable to submit (" + err.status + ")." : "Unable to submit. Try again.";
    setFormMessage(opts.messageEl, {kind: "err", text});
  }
  if (opts.state.submitId === started) opts.setSubmitting(false);
}

const LAP_RECORD_FORM_HTML = `
<form id="lap-record-form" class="rec-form" autocomplete="off" novalidate>
  <div class="suggest-head">
    <b id="recordTitle">Add a Lap Record</b>
    <button type="button" class="suggest-close" id="record-close" aria-label="Close">×</button>
  </div>
  <p class="rec-meta" id="record-add-tip">Already have a record for the same or a similar vehicle?<br><a href="records.html" target="_blank" rel="noopener">Update it on the Records page</a> instead of creating a new one.</p>
  <label class="rec-field"><span>Track</span><select name="track"></select></label>
  <label class="rec-field"><span>Subtrack</span><select name="subtrack"></select></label>
  <div class="rec-type-class">
    <label class="rec-field"><span>Vehicle type</span>
      <select name="vehicleType">
        <option value="C">Car</option>
        <option value="M">Bike</option>
      </select>
    </label>
    <label class="rec-field"><span>Class</span><select name="vehicleClass"></select></label>
  </div>
  <label class="rec-field rec-custom-class" hidden><span>Other class</span><input name="customClass" maxlength="40"></label>
  <div class="rec-ymm">
    <label class="rec-field rec-year"><span>Year</span><input name="vehicleYear" inputmode="numeric" maxlength="4" size="4"></label>
    <label class="rec-field"><span>Make</span><input name="vehicleMake" maxlength="40"></label>
    <label class="rec-field"><span>Model</span><input name="vehicleModel" maxlength="60"></label>
  </div>
  <div class="rec-form-grid">
    <label class="rec-field"><span>Time</span><input name="time" placeholder="1:23.456" inputmode="decimal"></label>
    <label class="rec-field"><span>Lap date</span><input name="date" type="date"></label>
  </div>
  <label class="rec-field"><span>Timing device</span><select name="timingDevice"><option value="">Choose</option>${TIMING_DEVICES.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}</select></label>
  <div class="rec-holder-row">
    <label class="rec-field"><span>Holder name</span><input name="holder" maxlength="80"></label>
    <label class="rec-field rec-race-number"><span>Race # (optional)</span><input name="raceNumber" maxlength="4" autocomplete="off" spellcheck="false"></label>
  </div>
  <label class="rec-field"><span>Evidence (optional)</span><input name="evidence" type="url" placeholder="https://" maxlength="300"></label>
  <label class="rec-field"><span>Note (optional)</span><textarea name="note" maxlength="300" rows="1"></textarea></label>
  <div class="rec-form-actions">
    <button type="button" class="rec-cancel" id="record-cancel">Cancel</button>
    <button type="submit" class="rec-submit">Submit for Review</button>
  </div>
  <div id="recordMessage" class="rec-form-msg" hidden></div>
</form>`;

function mountLapRecordForm(dialog) {
  if (!dialog || dialog.querySelector("#lap-record-form")) return;
  dialog.innerHTML = LAP_RECORD_FORM_HTML;
  let tip = dialog.querySelector("#record-add-tip");
  if (tip && /(^|\/)records\.html$/i.test(location.pathname)) {
    tip.innerHTML = "Already have a record for the same or a similar vehicle?<br>Update it instead of creating a new one.";
  }
}

mountLapRecordForm(document.getElementById("recordDialog"));
