// Scrollable multi-month calendar with hidden scrollbar.
let calendarScrollTop = 0;
let calendarActiveMonth = null;
let calendarMonthObserver = null;
let calendarDragSelecting = false;

const calendarWeekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
  .map((day) => `<span class="cal-weekday">${day}</span>`)
  .join("");

function renderCalendarView() {
  let root = document.getElementById("calendar");
  let bounds = selectableDateBounds();
  let range = activeCalendarRange();
  if (!calendarActiveMonth) calendarActiveMonth = dayjs(selectedMonth || undefined).startOf("month");
  let byDay = calendarHeatByDay(bounds);
  let maxCount = 1;
  byDay.forEach((items) => {
    if (items.length > maxCount) maxCount = items.length;
  });
  root.innerHTML = `<div class="cal cal-month"><div class="cal-month-layout"><div class="cal-month-board"><div class="cal-month-grid"><div class="cal-month-weekdays" aria-hidden="true">${calendarWeekdays}</div><div class="cal-month-scroll">${calendarMonthsHtml(bounds, byDay, maxCount, range)}</div></div></div><div class="cal-month-detail"></div></div></div>`;
  let scroll = root.querySelector(".cal-month-scroll");
  scroll.scrollTop = calendarScrollTop;
  if (!range && !calendarScrollTop) {
    let today = dayjs().format("YYYY-MM-DD");
    let todayEl = scroll.querySelector(`[data-cal-day="${today}"]`);
    let section = scroll.querySelector(`[data-cal-month="${calendarActiveMonth.format("YYYY-MM")}"]`);
    // Scroll only inside .cal-month-scroll - scrollIntoView also moves the page.
    scrollChildToStart(scroll, todayEl || section);
    calendarScrollTop = scroll.scrollTop;
  }
  if (!range) {
    let active = monthNearestScroll(scroll);
    if (active) {
      calendarActiveMonth = active;
      selectedMonth = active.toDate();
    }
  }
  bindMonthGrid(root, byDay, range);
}

function scrollChildToStart(scroll, el) {
  if (!el || !scroll.contains(el)) return;
  scroll.scrollTop += el.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
}

function monthNearestScroll(scroll) {
  let sections = [...scroll.querySelectorAll("[data-cal-month]")];
  if (!sections.length) return null;
  let top = scroll.getBoundingClientRect().top + 24;
  let best = sections[0];
  let bestDist = Infinity;
  sections.forEach((section) => {
    let box = section.getBoundingClientRect();
    let dist = Math.abs(box.top - top);
    if (box.bottom > top && dist < bestDist) {
      best = section;
      bestDist = dist;
    }
  });
  return dayjs(`${best.dataset.calMonth}-01`, "YYYY-MM-DD", true).startOf("month");
}

function calendarClearDatesHtml() {
  return `<button type="button" class="cal-clear-dates" data-cal-clear-range aria-label="Clear dates" title="Clear dates"><span aria-hidden="true">×</span></button>`;
}

function calendarMonthsHtml(bounds, byDay, maxCount, range) {
  let months = [];
  for (let month = bounds.min.startOf("month"); !month.isAfter(bounds.max, "month"); month = month.add(1, "month")) {
    months.push(`<section class="cal-month-section" data-cal-month="${month.format("YYYY-MM")}">
      <h3 class="cal-month-label">${escapeHtml(month.format("MMMM YYYY"))}</h3>
      ${monthDayButtons(month, byDay, maxCount, bounds, range)}
    </section>`);
  }
  return months.join("");
}

function monthDayButtons(month, byDay, maxCount, bounds, range) {
  let monthStart = month.startOf("month");
  let monthEnd = month.endOf("month");
  let first = monthStart.isBefore(bounds.min, "day") ? bounds.min : monthStart;
  let last = monthEnd.isAfter(bounds.max, "day") ? bounds.max : monthEnd;
  if (first.isAfter(last, "day")) return `<div class="cal-grid"></div>`;
  let today = dayjs().startOf("day");
  let cells = [];
  for (let i = 0; i < first.day(); i++) cells.push(`<span class="cal-day is-outside" aria-hidden="true"></span>`);
  for (let cursor = first; !cursor.isAfter(last, "day"); cursor = cursor.add(1, "day")) {
    let key = cursor.format("YYYY-MM-DD");
    let items = byDay.get(key) || [];
    let classes = ["cal-day"];
    if (cursor.isSame(today, "day")) classes.push("is-today");
    let selected = range && key >= range.start && key <= range.end;
    if (selected) classes.push("is-selected");
    if (selected && key === range.start) classes.push("is-range-start");
    if (selected && key === range.end) classes.push("is-range-end");
    if (range && !selected) classes.push("is-outside-range");
    if (items.length) classes.push("has-events");
    if (items.some((td) => savedEventsSet.has(getEventKey(td)))) classes.push("is-saved");
    let heat = items.length ? ` style="--heat:${(items.length / maxCount).toFixed(3)}"` : "";
    let countLabel = items.length ? `, ${items.length} ${items.length === 1 ? "event" : "events"}` : ", no events";
    cells.push(`<button type="button" class="${classes.join(" ")}" data-cal-day="${key}" aria-pressed="${selected ? "true" : "false"}" aria-label="${escapeHtml(cursor.format("MMMM D, YYYY"))}${countLabel}"${heat}><span class="cal-day-num">${cursor.date()}</span></button>`);
  }
  return `<div class="cal-grid">${cells.join("")}</div>`;
}

function selectionRange(a, b) {
  return a <= b ? {start: a, end: b} : {start: b, end: a};
}

function keysForRange(range) {
  if (!range) return null;
  let keys = [];
  let cursor = dayjs(range.start, "YYYY-MM-DD", true);
  let last = dayjs(range.end, "YYYY-MM-DD", true);
  if (!cursor.isValid() || !last.isValid()) return null;
  for (; !cursor.isAfter(last, "day"); cursor = cursor.add(1, "day")) keys.push(cursor.format("YYYY-MM-DD"));
  return keys;
}

function emptyMonthMessage(month) {
  return `No matching events in ${month.format("MMMM YYYY")}`;
}

function rangeEmptyHtml() {
  let copy = selectedCalendarStart === selectedCalendarEnd
    ? "No matching events on selected date"
    : "No matching events in selected date range";
  return `<div class="cal-list"><p class="cal-month-empty">${copy}</p></div>`;
}

function rangeHeaderHtml(keys) {
  if (!keys || !keys.length) return "";
  return `<div class="cal-range-header"><span class="cal-range-header-text">${escapeHtml(dateRangeButtonLabel())}</span>${calendarClearDatesHtml()}</div>`;
}

function filteredNoteHtml(start, end) {
  let hidden = trackdays.filter((td) => !td.visibilityMap && !td.date.isBefore(start, "day") && !td.date.isAfter(end, "day"));
  if (!hidden.length) return "";
  return `<p class="cal-month-note">${escapeHtml(hiddenEventNote(hidden))}</p>`;
}

function eventsPanelHtml(byDay, month, keys) {
  let noteStart = keys ? dayjs(keys[0], "YYYY-MM-DD", true) : month.startOf("month");
  let noteEnd = keys ? dayjs(keys[keys.length - 1], "YYYY-MM-DD", true) : month.endOf("month");
  let note = filteredNoteHtml(noteStart, noteEnd);
  let header = rangeHeaderHtml(keys);
  if (keys && keys.length === 1) {
    let items = byDay.get(keys[0]) || [];
    if (!items.length) return header + rangeEmptyHtml() + note;
    return header + dayPanelHtml(keys[0], byDay) + note;
  }
  let shown;
  if (keys) shown = keys.filter((key) => byDay.has(key));
  else {
    let start = month.format("YYYY-MM");
    shown = [...byDay.keys()].filter((key) => key.startsWith(start)).sort();
  }
  let body = shown.length
    ? `<div class="cal-month-groups">${shown.map((dayKey) => `<section class="cal-month-group">${dayPanelHtml(dayKey, byDay)}</section>`).join("")}</div>`
    : keys
      ? rangeEmptyHtml()
      : `<div class="cal-list"><p class="cal-month-empty">${escapeHtml(emptyMonthMessage(month))}</p></div>`;
  return header + body + note;
}

function dayPanelHtml(key, byDay) {
  let day = dayjs(key, "YYYY-MM-DD", true);
  let items = byDay.get(key) || [];
  let heading = `<div class="cal-month-heading">${escapeHtml(day.format("ddd, MMMM D"))}</div>`;
  if (!items.length) return heading + `<div class="cal-list"><p class="cal-month-empty">No events</p></div>`;
  return heading + `<div class="cal-list">${items.map((td) => eventRowHtml(td)).join("")}</div>`;
}

function monthDayAt(grid, event) {
  let day = event.target instanceof Element ? event.target.closest("[data-cal-day]") : null;
  if (!day || !grid.contains(day) || day.disabled) {
    let el = document.elementFromPoint(event.clientX, event.clientY);
    day = el instanceof Element ? el.closest("[data-cal-day]") : null;
  }
  if (!day || !grid.contains(day) || day.disabled) return null;
  return day.dataset.calDay;
}

function commitCalendarSelection(range) {
  if (range) setCalendarRange(range.start, range.end);
  else setCalendarRange(null, null);
  if (typeof trackdays === "undefined") {
    updateCalendar();
    return;
  }
  refresh({trackVisibility: true, popup: true, calendar: true});
}

function toggleDaySelection(key) {
  let same = selectedCalendarStart === key && selectedCalendarEnd === key;
  commitCalendarSelection(same ? null : {start: key, end: key});
}

function paintDaySelection(root, range) {
  let keys = new Set(keysForRange(range) || []);
  let dim = !!range;
  root.querySelectorAll("[data-cal-day]").forEach((day) => {
    let key = day.dataset.calDay;
    let on = keys.has(key);
    day.classList.toggle("is-selected", on);
    day.classList.toggle("is-range-start", !!(on && range && key === range.start));
    day.classList.toggle("is-range-end", !!(on && range && key === range.end));
    day.classList.toggle("is-outside-range", dim && !on);
    day.setAttribute("aria-pressed", on ? "true" : "false");
  });
  // No range: fade other months so the active month (detail list) reads clearly.
  let activeKey = calendarActiveMonth ? calendarActiveMonth.format("YYYY-MM") : null;
  root.querySelectorAll("[data-cal-month]").forEach((section) => {
    section.classList.toggle("is-inactive", !range && !!activeKey && section.dataset.calMonth !== activeKey);
  });
}

function paintMonthFocus(root, byDay, range) {
  paintDaySelection(root, range);
  let detail = root.querySelector(".cal-month-detail");
  detail.innerHTML = eventsPanelHtml(byDay, calendarActiveMonth, keysForRange(range));
  fitCalendarTitles();
}

function bindActiveMonth(root, byDay, scroll) {
  if (calendarMonthObserver) {
    calendarMonthObserver.disconnect();
    calendarMonthObserver = null;
  }
  let syncActive = () => {
    if (calendarDragSelecting || activeCalendarRange()) return;
    let next = monthNearestScroll(scroll);
    if (!next || calendarActiveMonth.format("YYYY-MM") === next.format("YYYY-MM")) return;
    calendarActiveMonth = next;
    selectedMonth = next.toDate();
    paintMonthFocus(root, byDay, null);
  };
  let sections = [...scroll.querySelectorAll("[data-cal-month]")];
  scroll.addEventListener("scroll", () => {
    calendarScrollTop = scroll.scrollTop;
    if (!activeCalendarRange()) syncActive();
  }, {passive: true});
  if (typeof IntersectionObserver !== "undefined") {
    calendarMonthObserver = new IntersectionObserver(() => {
      if (!activeCalendarRange()) syncActive();
    }, {root: scroll, threshold: [0.2, 0.5, 0.8]});
    sections.forEach((section) => calendarMonthObserver.observe(section));
  }
}

function stopDragExtras(drag) {
  if (drag?.timer) clearTimeout(drag.timer);
  if (drag?.scrollRaf) cancelAnimationFrame(drag.scrollRaf);
  if (drag) {
    drag.timer = null;
    drag.scrollRaf = null;
  }
  calendarDragSelecting = false;
}

function paintDragDay(root, grid, drag, x, y) {
  let el = document.elementFromPoint(x, y);
  let day = el instanceof Element ? el.closest("[data-cal-day]") : null;
  if (!day || !grid.contains(day) || day.disabled) return;
  let key = day.dataset.calDay;
  if (!key || key === drag.current) return;
  drag.current = key;
  drag.moved = true;
  paintDaySelection(root, selectionRange(drag.anchor, key));
}

function beginDragSelect(root, grid, scroll, drag) {
  if (!drag || drag.selecting || drag.cancelled) return;
  drag.selecting = true;
  calendarDragSelecting = true;
  grid.classList.add("is-dragging");
  try {grid.setPointerCapture(drag.pointerId);} catch (e) {}
  paintDaySelection(root, selectionRange(drag.anchor, drag.current));
  let step = () => {
    drag.scrollRaf = null;
    if (!drag.selecting || drag.cancelled) return;
    let box = scroll.getBoundingClientRect();
    let edge = 36;
    let dir = drag.pointerY < box.top + edge ? -1 : drag.pointerY > box.bottom - edge ? 1 : 0;
    if (dir) {
      scroll.scrollTop = Math.max(0, Math.min(scroll.scrollHeight - scroll.clientHeight, scroll.scrollTop + dir * 3));
      calendarScrollTop = scroll.scrollTop;
      paintDragDay(root, grid, drag, drag.pointerX, drag.pointerY);
    }
    drag.scrollRaf = requestAnimationFrame(step);
  };
  drag.scrollRaf = requestAnimationFrame(step);
}

function bindMonthGrid(root, byDay, range) {
  let grid = root.querySelector(".cal-month-grid");
  let scroll = root.querySelector(".cal-month-scroll");
  let drag = null;
  const touchSlop = 10;
  bindActiveMonth(root, byDay, scroll);
  paintMonthFocus(root, byDay, range);
  grid.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    let key = monthDayAt(grid, event);
    if (!key) return;
    drag = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      anchor: key,
      current: key,
      moved: false,
      selecting: false,
      cancelled: false,
      originX: event.clientX,
      originY: event.clientY,
      pointerX: event.clientX,
      pointerY: event.clientY,
      timer: null,
      scrollRaf: null,
    };
    if (event.pointerType === "touch") {
      drag.timer = setTimeout(() => beginDragSelect(root, grid, scroll, drag), 350);
      return;
    }
    event.preventDefault();
    beginDragSelect(root, grid, scroll, drag);
  });
  grid.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId || drag.cancelled) return;
    drag.pointerX = event.clientX;
    drag.pointerY = event.clientY;
    if (drag.pointerType === "touch" && !drag.selecting) {
      if (Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY) > touchSlop) {
        stopDragExtras(drag);
        drag.cancelled = true;
      }
      return;
    }
    if (!drag.selecting) return;
    paintDragDay(root, grid, drag, event.clientX, event.clientY);
  });
  grid.addEventListener("pointerup", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    let gesture = drag;
    drag = null;
    stopDragExtras(gesture);
    grid.classList.remove("is-dragging");
    if (gesture.cancelled) {
      paintMonthFocus(root, byDay, activeCalendarRange());
      return;
    }
    if (gesture.selecting && gesture.moved) {
      commitCalendarSelection(selectionRange(gesture.anchor, gesture.current));
      return;
    }
    let tapped = Math.hypot(event.clientX - gesture.originX, event.clientY - gesture.originY) <= touchSlop;
    if (tapped || (gesture.selecting && !gesture.moved)) toggleDaySelection(gesture.anchor);
    else paintMonthFocus(root, byDay, activeCalendarRange());
  });
  grid.addEventListener("pointercancel", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    stopDragExtras(drag);
    drag = null;
    grid.classList.remove("is-dragging");
    paintMonthFocus(root, byDay, activeCalendarRange());
  });
  grid.addEventListener("click", (event) => {
    if (event.detail !== 0) return;
    let key = monthDayAt(grid, event);
    if (!key) return;
    toggleDaySelection(key);
  });
}
