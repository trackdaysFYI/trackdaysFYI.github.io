import {SUGGESTION_URL} from "./config.js";
import {
  safeHttpUrl,
  setFormMessage,
  setFormSubmitting,
  closeReviewDialog,
  wireReviewDialog,
  focusReviewField,
  postJson,
  submitReview,
} from "./lap-record-shared.js";
import {fillTrackSelect} from "./index-lap-records.js";

let suggestUi = {kind: "track", submitting: false, submitId: 0, eventType: "T"};
let ctx = null;

function optionalField(value, maxLen, tooLongMsg) {
  let text = String(value || "").trim();
  if (text.length > maxLen) return {ok: false, error: tooLongMsg, value: text};
  return {ok: true, error: "", value: text};
}

function assignOptional(payload, key, value) {
  if (value) payload[key] = value;
}

function suggestEventDateBounds() {
  let today = dayjs.utc().startOf("day");
  return {min: today.subtract(1, "day"), max: today.add(18, "month")};
}

function missingEventDateError(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Enter the event date";
  let parsed = dayjs.utc(value, "YYYY-MM-DD", true);
  if (!parsed.isValid() || parsed.format("YYYY-MM-DD") !== value) return "Enter the event date";
  let bounds = suggestEventDateBounds();
  if (parsed.isBefore(bounds.min) || parsed.isAfter(bounds.max)) return "Enter the event date";
  return "";
}

function suggestVehicleTypes() {
  let selected = new Set();
  document.querySelectorAll("#suggestDialog [data-vehicle].on").forEach((btn) => selected.add(btn.dataset.vehicle));
  return ["C", "M", "S"].filter((code) => selected.has(code)).join("");
}

function suggestHosts(input) {
  suggestField(input, ctx?.getOrgs() || null, "org");
}

function suggestField(input, items, key) {
  let box = input.parentElement.querySelector(".suggest-matches");
  if (!box) return;
  let query = input.value.trim().toLowerCase();
  let names = [];
  if (query && items) {
    let seen = new Set();
    Object.values(items).forEach(item => {
      let name = item && item[key];
      if (!name || seen.has(name) || !String(name).toLowerCase().includes(query)) return;
      seen.add(name);
      names.push(name);
    });
  }
  names.sort((a, b) => a.localeCompare(b));
  names = names.slice(0, 6);
  box.replaceChildren();
  names.forEach(name => {
    let button = document.createElement("button");
    button.type = "button";
    button.textContent = name;
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      input.value = name;
      box.hidden = true;
    });
    box.append(button);
  });
  box.classList.remove("overlay");
  box.style.maxHeight = "";
  box.hidden = true;
  if (!names.length) return;
  let dialog = document.getElementById("suggestDialog");
  let room = Math.floor(window.innerHeight - dialog.getBoundingClientRect().bottom) - 10;
  if (room < 28) {
    box.classList.add("overlay");
    box.style.maxHeight = "7.5rem";
  } else {
    box.style.maxHeight = Math.min(120, room) + "px";
  }
  box.hidden = false;
}

function setSuggestKind(kind) {
  if (kind !== "track" && kind !== "missing_event") return;
  suggestUi.kind = kind;
  let dialog = document.getElementById("suggestDialog");
  setFormMessage(dialog.querySelector(".rec-form-msg"), null);
  dialog.querySelectorAll("[data-kind]").forEach((btn) => btn.classList.toggle("on", btn.dataset.kind === kind));
  dialog.querySelectorAll("[data-suggest]").forEach((el) => {el.hidden = !el.dataset.suggest.split(" ").includes(kind);});
  let titles = {track: "Report a missing track", missing_event: "Report a missing event"};
  let urlLabels = {track: "Website (optional)", missing_event: "Event link (optional)"};
  document.getElementById("suggestTitle").textContent = titles[kind];
  document.getElementById("suggestUrlLabel").textContent = urlLabels[kind];
  if (kind === "missing_event") {
    let date = dialog.querySelector("input[name=eventDate]");
    if (date) {
      let bounds = suggestEventDateBounds();
      date.min = bounds.min.format("YYYY-MM-DD");
      date.max = bounds.max.format("YYYY-MM-DD");
    }
  }
}

function setSuggestEventType(code) {
  if (!["T", "S", "R"].includes(code)) return;
  suggestUi.eventType = code;
  document.querySelectorAll("#suggestDialog [data-event]").forEach((btn) => btn.classList.toggle("on", btn.dataset.event === code));
}

function toggleSuggestVehicle(button) {
  button.classList.toggle("on");
}

function suggestTrackLabel(trackKey) {
  if (!trackKey) return "";
  let tracks = ctx?.getTracks();
  if (!tracks || !tracks[trackKey]) return trackKey;
  return tracks[trackKey].name || tracks[trackKey].nickname || trackKey;
}

function resetSuggestForm(form, options) {
  options = options || {};
  if (!form) return;
  form.reset();
  form.querySelectorAll("[data-vehicle]").forEach((btn) => btn.classList.remove("on"));
  form.querySelectorAll(".suggest-matches").forEach((box) => { box.hidden = true; });
  setSuggestEventType("T");
  fillTrackSelect(form.elements.track, options.trackKey || "", "Choose a track");
  setSuggestKind(options.kind || "track");
}

function pinSuggestDialog(dialog) {
  let top = Math.max(8, dialog.getBoundingClientRect().top);
  dialog.style.top = top + "px";
  dialog.style.bottom = "auto";
  dialog.style.marginTop = "0";
  dialog.style.maxHeight = (window.innerHeight - top - 8) + "px";
  dialog.style.overflowY = "auto";
}

function unpinSuggestDialog(dialog) {
  dialog.style.top = "";
  dialog.style.bottom = "";
  dialog.style.marginTop = "";
  dialog.style.maxHeight = "";
  dialog.style.overflowY = "";
}

function openSuggestDialog(kind, trackKey) {
  let dialog = document.getElementById("suggestDialog");
  let form = dialog.querySelector("form");
  resetSuggestForm(form, {kind: kind || "track", trackKey: trackKey || ""});
  if (dialog.open) {
    focusReviewField(dialog);
    return;
  }
  dialog.showModal();
  pinSuggestDialog(dialog);
  focusReviewField(dialog);
}

export function reportMissingEvent() {
  let tracks = ctx?.getTracks();
  let lastOpenedTrack = ctx?.getLastOpenedTrack();
  if (!tracks || !tracks[lastOpenedTrack]) return;
  openSuggestDialog("missing_event", lastOpenedTrack);
}

function closeSuggestDialog() {
  closeReviewDialog(suggestUi, "suggestDialog");
}

function validateSuggestForm(form) {
  let note = optionalField(form.elements.note.value, 300, "Note is too long");
  if (!note.ok) return note.error;
  if (suggestUi.kind === "missing_event") {
    let trackKey = form.elements.track.value;
    if (!trackKey) return "Choose a track";
    let trackName = suggestTrackLabel(trackKey);
    if (!trackName || trackName.length > 80) return "Choose a track";
    let org = optionalField(form.elements.org.value, 80, "Host is too long");
    if (!org.value) return "Enter the host";
    if (!org.ok) return org.error;
    let date = form.elements.eventDate.value.trim();
    let multipleDates = form.elements.multipleDates.checked;
    if (!date && !multipleDates) return "Enter a date or choose multiple dates";
    if (date) {
      let dateError = missingEventDateError(date);
      if (dateError) return dateError;
    }
    if (!["T", "S", "R"].includes(suggestUi.eventType)) return "Choose an event type";
    let eventUrl = optionalField(form.elements.url.value, 300, "Link must be an http(s) URL");
    if (!eventUrl.ok || (eventUrl.value && !safeHttpUrl(eventUrl.value))) return "Link must be an http(s) URL";
    return "";
  }
  let name = optionalField(form.elements.name.value, 80, "Name is too long");
  if (!name.value) return "Enter a name";
  if (!name.ok) return name.error;
  let url = optionalField(form.elements.url.value, 300, "Link must be an http(s) URL");
  if (!url.ok || (url.value && !safeHttpUrl(url.value))) return "Link must be an http(s) URL";
  return "";
}

function suggestFormPayload(form) {
  let note = form.elements.note.value.trim();
  if (suggestUi.kind === "missing_event") {
    let trackKey = form.elements.track.value;
    let payload = {
      kind: "missing_event",
      trackName: suggestTrackLabel(trackKey),
      org: form.elements.org.value.trim(),
      eventType: suggestUi.eventType,
    };
    assignOptional(payload, "date", form.elements.eventDate.value.trim());
    if (form.elements.multipleDates.checked) payload.multipleDates = true;
    if (trackKey && trackKey.length <= 40) payload.track = trackKey;
    assignOptional(payload, "url", form.elements.url.value.trim());
    assignOptional(payload, "note", note);
    return payload;
  }
  let payload = {
    kind: suggestUi.kind,
    name: form.elements.name.value.trim(),
  };
  assignOptional(payload, "url", form.elements.url.value.trim());
  assignOptional(payload, "note", note);
  if (suggestUi.kind === "track") {
    let vehicleTypes = suggestVehicleTypes();
    if (vehicleTypes) payload.vehicleTypes = vehicleTypes;
  }
  return payload;
}

async function submitSuggestForm(event) {
  let form = event.target;
  let kind = suggestUi.kind;
  await submitReview(event, {
    state: suggestUi,
    messageEl: form.querySelector(".rec-form-msg"),
    setSubmitting: (submitting) => setFormSubmitting(suggestUi, form, submitting),
    validate: () => validateSuggestForm(form),
    post: () => postJson(SUGGESTION_URL, suggestFormPayload(form)),
    onSuccess() {
      resetSuggestForm(form, {kind});
    },
  });
}

export function initIndexSuggest(context) {
  ctx = context;
  let dialog = document.getElementById("suggestDialog");
  let form = dialog.querySelector("form");
  wireReviewDialog(dialog, {
    state: suggestUi,
    form,
    messageEl: dialog.querySelector(".rec-form-msg"),
    close: closeSuggestDialog,
  });
  dialog.addEventListener("close", () => {
    unpinSuggestDialog(dialog);
    dialog.querySelectorAll(".suggest-matches").forEach(box => { box.hidden = true; });
  });
  window.addEventListener("resize", () => {
    if (!dialog.open) return;
    unpinSuggestDialog(dialog);
    pinSuggestDialog(dialog);
  });
  form.addEventListener("submit", submitSuggestForm);
  dialog.querySelectorAll("[data-kind]").forEach((btn) => {
    btn.addEventListener("click", () => setSuggestKind(btn.dataset.kind));
  });
  dialog.querySelectorAll("[data-event]").forEach((btn) => {
    btn.addEventListener("click", () => setSuggestEventType(btn.dataset.event));
  });
  dialog.querySelectorAll("[data-vehicle]").forEach((btn) => {
    btn.addEventListener("click", () => toggleSuggestVehicle(btn));
  });
  let orgInput = form.elements.org;
  if (orgInput) {
    orgInput.addEventListener("input", () => suggestHosts(orgInput));
    orgInput.addEventListener("blur", () => {
      let box = orgInput.parentElement.querySelector(".suggest-matches");
      if (box) box.hidden = true;
    });
  }
  document.querySelectorAll("[data-suggest-open]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      openSuggestDialog(link.dataset.suggestOpen || "track");
    });
  });
}
