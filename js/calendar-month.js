// Month grid beside the day's events. A custom date range replaces the month with those dates.
let calendarSelection = null;
let calendarSpanKey = null;

const calendarWeekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
  .map((day) => `<span class="cal-weekday">${day}</span>`)
  .join("");

function calendarSpan() {
  let range = activeCalendarRange();
  if (range) {
    return {
      start: dayjs(range.start, "YYYY-MM-DD", true).startOf("day"),
      end: dayjs(range.end, "YYYY-MM-DD", true).startOf("day"),
      ranged: true,
      key: `${range.start}|${range.end}`,
    };
  }
  let month = dayjs(selectedMonth).startOf("month");
  return {
    start: month,
    end: month.endOf("month").startOf("day"),
    ranged: false,
    key: month.format("YYYY-MM"),
  };
}

function renderCalendarView() {
  let root = document.getElementById("calendar");
  let span = calendarSpan();
  if (calendarSpanKey !== span.key) {
    calendarSpanKey = span.key;
    calendarSelection = null;
    if (span.ranged) selectedMonth = span.start.startOf("month").toDate();
  }
  let byDay = eventsByDay((td) => !td.date.isBefore(span.start, "day") && !td.date.isAfter(span.end, "day"));
  let ranged = span.ranged ? " is-range" : "";
  root.innerHTML = `<div class="cal cal-month${ranged}"><div class="cal-month-layout"><div class="cal-month-board">${calendarHeaderHtml(span)}<div class="cal-month-grid"><div class="cal-month-weekdays" aria-hidden="true">${calendarWeekdays}</div>${spanDayButtons(span, byDay)}</div></div><div class="cal-month-detail"></div></div></div>`;
  bindMonthGrid(root, byDay, span);
}

function calendarHeaderHtml(span) {
  if (!span.ranged) return monthNavHtml(span.start);
  let clear = `<button type="button" class="cal-nav-btn" data-cal-show-month aria-label="Clear range" title="Clear range"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>`;
  return `<div class="cal-nav is-range"><span class="cal-nav-spacer" aria-hidden="true"></span><span class="cal-nav-title">${escapeHtml(selectionLabel(activeCalendarRange()))}</span>${clear}</div>`;
}

function spanDayButtons(span, byDay) {
  let cursor = span.start.subtract(span.start.day(), "day");
  let last = span.end.add(6 - span.end.day(), "day");
  let today = dayjs().startOf("day");
  let maxCount = 1;
  byDay.forEach((items) => {
    if (items.length > maxCount) maxCount = items.length;
  });
  let cells = [];
  for (; !cursor.isAfter(last, "day"); cursor = cursor.add(1, "day")) {
    let inSpan = !cursor.isBefore(span.start, "day") && !cursor.isAfter(span.end, "day");
    let key = cursor.format("YYYY-MM-DD");
    let items = inSpan ? (byDay.get(key) || []) : [];
    let classes = ["cal-day"];
    if (!inSpan) classes.push("is-outside");
    if (cursor.isSame(today, "day")) classes.push("is-today");
    if (items.length) classes.push("has-events");
    if (items.some((td) => savedEventsSet.has(getEventKey(td)))) classes.push("is-saved");
    if (!inSpan) {
      cells.push(`<span class="${classes.join(" ")}" aria-hidden="true"><span class="cal-day-num">${cursor.date()}</span></span>`);
      continue;
    }
    let heat = items.length ? ` style="--heat:${(items.length / maxCount).toFixed(3)}"` : "";
    let countLabel = items.length ? `, ${items.length} ${items.length === 1 ? "event" : "events"}` : ", no events";
    cells.push(`<button type="button" class="${classes.join(" ")}" data-cal-day="${key}" aria-pressed="false" aria-label="${escapeHtml(cursor.format("MMMM D, YYYY"))}${countLabel}"${heat}><span class="cal-day-num">${cursor.date()}</span></button>`);
  }
  return `<div class="cal-grid">${cells.join("")}</div>`;
}

function dayInSpan(key, span) {
  if (!key) return false;
  let day = dayjs(key, "YYYY-MM-DD", true);
  return day.isValid() && !day.isBefore(span.start, "day") && !day.isAfter(span.end, "day");
}

function selectionRange(a, b) {
  return a <= b ? {start: a, end: b} : {start: b, end: a};
}

function keysForRange(span, range) {
  if (!range || !dayInSpan(range.start, span) || !dayInSpan(range.end, span)) return null;
  let keys = [];
  let cursor = dayjs(range.start, "YYYY-MM-DD", true);
  let last = dayjs(range.end, "YYYY-MM-DD", true);
  for (; !cursor.isAfter(last, "day"); cursor = cursor.add(1, "day")) keys.push(cursor.format("YYYY-MM-DD"));
  return keys;
}

function selectedKeys(span) {
  return keysForRange(span, calendarSelection);
}

function emptySpanMessage(span) {
  if (!span.ranged) return `No matching events in ${span.start.format("MMMM YYYY")}`;
  if (span.start.isSame(span.end, "day")) return "No events this day";
  return "No events in this date range";
}

function filteredNoteHtml(span) {
  let hidden = trackdays.filter((td) => !td.visibilityMap && !td.date.isBefore(span.start, "day") && !td.date.isAfter(span.end, "day"));
  if (!hidden.length) return "";
  return `<p class="cal-month-note">${escapeHtml(hiddenEventNote(hidden))}</p>`;
}

function eventsPanelHtml(byDay, span, keys) {
  if (keys && keys.length === 1) return dayPanelHtml(keys[0], byDay);
  let shown = keys ? keys.filter((key) => byDay.has(key)) : [...byDay.keys()].sort();
  let body = shown.length
    ? `<div class="cal-month-groups">${shown.map((dayKey) => `<section class="cal-month-group">${dayPanelHtml(dayKey, byDay)}</section>`).join("")}</div>`
    : `<p class="cal-month-empty">${keys ? "No events" : escapeHtml(emptySpanMessage(span))}</p>`;
  if (keys) return body;
  return body + filteredNoteHtml(span);
}

function dayPanelHtml(key, byDay) {
  let day = dayjs(key, "YYYY-MM-DD", true);
  let items = byDay.get(key) || [];
  let heading = `<div class="cal-month-heading">${escapeHtml(day.format("dddd, MMMM D"))}</div>`;
  if (!items.length) return heading + `<p class="cal-month-empty">No events</p>`;
  return heading + `<div class="cal-list">${items.map((td) => eventRowHtml(td)).join("")}</div>`;
}

function monthDayAt(grid, event) {
  let day = event.target instanceof Element ? event.target.closest("[data-cal-day]") : null;
  if (!day || !grid.contains(day)) {
    let el = document.elementFromPoint(event.clientX, event.clientY);
    day = el instanceof Element ? el.closest("[data-cal-day]") : null;
  }
  if (!day || !grid.contains(day)) return null;
  return day.dataset.calDay;
}

function bindMonthGrid(root, byDay, span) {
  let grid = root.querySelector(".cal-month-grid");
  let drag = null;
  let finishDrag = () => {
    drag = null;
    grid.classList.remove("is-dragging");
    paintMonthFocus(root, byDay, span);
  };
  grid.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    let key = monthDayAt(grid, event);
    if (!key) return;
    drag = {pointerId: event.pointerId, pointerType: event.pointerType, anchor: key, current: key, moved: false, originX: event.clientX, originY: event.clientY};
    if (event.pointerType === "touch") return;
    grid.classList.add("is-dragging");
    try {grid.setPointerCapture(event.pointerId);} catch (e) {}
    event.preventDefault();
  });
  grid.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId || drag.pointerType === "touch") return;
    let key = monthDayAt(grid, event);
    if (!key || key === drag.current) return;
    drag.current = key;
    drag.moved = drag.moved || key !== drag.anchor;
    if (!drag.moved) return;
    paintDaySelection(root, span, selectionRange(drag.anchor, key));
  });
  grid.addEventListener("pointerup", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    let gesture = drag;
    let tapped = gesture.pointerType === "touch"
      ? Math.hypot(event.clientX - gesture.originX, event.clientY - gesture.originY) <= 10
      : !gesture.moved;
    if (gesture.pointerType !== "touch" && gesture.moved) calendarSelection = selectionRange(gesture.anchor, gesture.current);
    else if (tapped) calendarSelection = calendarSelection && calendarSelection.start === gesture.anchor && calendarSelection.end === gesture.anchor ? null : {start: gesture.anchor, end: gesture.anchor};
    finishDrag();
  });
  grid.addEventListener("pointercancel", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    finishDrag();
  });
  grid.addEventListener("click", (event) => {
    if (event.detail !== 0) return;
    let key = monthDayAt(grid, event);
    if (!key) return;
    calendarSelection = calendarSelection && calendarSelection.start === key && calendarSelection.end === key ? null : {start: key, end: key};
    paintMonthFocus(root, byDay, span);
  });
  paintMonthFocus(root, byDay, span);
}

function paintDaySelection(root, span, range) {
  let keys = range ? keysForRange(span, range) : selectedKeys(span);
  let selected = new Set(keys || []);
  root.querySelectorAll("[data-cal-day]").forEach((day) => {
    let on = selected.has(day.dataset.calDay);
    day.classList.toggle("is-selected", on);
    day.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function paintMonthFocus(root, byDay, span) {
  paintDaySelection(root, span);
  let detail = root.querySelector(".cal-month-detail");
  detail.innerHTML = eventsPanelHtml(byDay, span, selectedKeys(span));
  fitCalendarTitles();
}
