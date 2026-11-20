const LAP_RECORD_SUBMIT_URL = "https://8fu4ilcse5.execute-api.us-east-1.amazonaws.com/submitLapRecord";
const LAP_TIME_RE = /^(?:\d{1,3}:[0-5]\d|[0-5]?\d)\.\d{1,3}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CUSTOM_CLASS_VALUE = "__custom__";
const SUGGESTED_CLASSES = {
  C: ["Open"],
  M: ["Open", "600cc", "Twins", "Lightweight", "Motard"],
};

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
