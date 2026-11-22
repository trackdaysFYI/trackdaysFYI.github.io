// Scrollable multi-month calendar with hidden scrollbar and month rail.
let calendarScrollTop = 0;
let calendarActiveMonth = null;
let calendarMonthObserver = null;

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
  root.innerHTML = `<div class="cal cal-month"><div class="cal-month-layout"><div class="cal-month-board">${calendarHeaderHtml(range)}<div class="cal-month-body"><div class="cal-month-grid"><div class="cal-month-weekdays" aria-hidden="true">${calendarWeekdays}</div><div class="cal-month-scroll">${calendarMonthsHtml(bounds, byDay, maxCount, range)}</div></div><div class="cal-month-rail" aria-label="Months">${calendarRailHtml(bounds)}</div></div></div><div class="cal-month-detail"></div></div></div>`;
  let scroll = root.querySelector(".cal-month-scroll");
  scroll.scrollTop = calendarScrollTop;
  if (!range && !calendarScrollTop) {
    let today = dayjs().format("YYYY-MM-DD");
    let todayEl = scroll.querySelector(`[data-cal-day="${today}"]`);
    let section = scroll.querySelector(`[data-cal-month="${calendarActiveMonth.format("YYYY-MM")}"]`);
    if (todayEl) todayEl.scrollIntoView({block: "center"});
    else if (section) section.scrollIntoView({block: "start"});
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

function calendarRailHtml(bounds) {
  let buttons = [];
  for (let month = bounds.min.startOf("month"); !month.isAfter(bounds.max, "month"); month = month.add(1, "month")) {
    let key = month.format("YYYY-MM");
    let active = calendarActiveMonth.format("YYYY-MM") === key ? " is-active" : "";
    buttons.push(`<button type="button" class="cal-month-rail-btn${active}" data-cal-rail-month="${key}">${escapeHtml(month.format("MMM"))}</button>`);
  }
  return buttons.join("");
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

function calendarHeaderHtml(range) {
  let title = range ? dateRangeButtonLabel() : calendarActiveMonth.format("MMMM YYYY");
  let clear = range
    ? `<button type="button" class="cal-nav-btn" data-cal-clear-range aria-label="Clear range" title="Clear range"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>`
    : `<span class="cal-nav-spacer" aria-hidden="true"></span>`;
  return `<div class="cal-nav is-range"><span class="cal-nav-spacer" aria-hidden="true"></span><span class="cal-nav-title">${escapeHtml(title)}</span>${clear}</div>`;
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

function filteredNoteHtml(month) {
  let start = month.startOf("month");
  let end = month.endOf("month");
  let hidden = trackdays.filter((td) => !td.visibilityMap && !td.date.isBefore(start, "day") && !td.date.isAfter(end, "day"));
  if (!hidden.length) return "";
  return `<p class="cal-month-note">${escapeHtml(hiddenEventNote(hidden))}</p>`;
}

function eventsPanelHtml(byDay, month, keys) {
  if (keys && keys.length === 1) return dayPanelHtml(keys[0], byDay);
  let shown;
  if (keys) shown = keys.filter((key) => byDay.has(key));
  else {
    let start = month.format("YYYY-MM");
    shown = [...byDay.keys()].filter((key) => key.startsWith(start)).sort();
  }
  let body = shown.length
    ? `<div class="cal-month-groups">${shown.map((dayKey) => `<section class="cal-month-group">${dayPanelHtml(dayKey, byDay)}</section>`).join("")}</div>`
    : `<p class="cal-month-empty">${keys ? "No events" : escapeHtml(emptyMonthMessage(month))}</p>`;
  if (keys) return body;
  return body + filteredNoteHtml(month);
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
  root.querySelectorAll("[data-cal-day]").forEach((day) => {
    let on = keys.has(day.dataset.calDay);
    day.classList.toggle("is-selected", on);
    day.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function paintMonthFocus(root, byDay, range) {
  paintDaySelection(root, range);
  let title = root.querySelector(".cal-nav-title");
  if (title) title.textContent = range ? dateRangeButtonLabel() : calendarActiveMonth.format("MMMM YYYY");
  let activeKey = calendarActiveMonth.format("YYYY-MM");
  root.querySelectorAll("[data-cal-rail-month]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.calRailMonth === activeKey);
  });
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
    if (activeCalendarRange()) return;
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

function clearCalendarDragTimer(drag) {
  if (drag?.timer) {
    clearTimeout(drag.timer);
    drag.timer = null;
  }
}

function beginCalendarDragSelect(root, grid, drag) {
  if (!drag || drag.selecting || drag.cancelled) return;
  drag.selecting = true;
  grid.classList.add("is-dragging");
  try {grid.setPointerCapture(drag.pointerId);} catch (e) {}
  paintDaySelection(root, selectionRange(drag.anchor, drag.current));
}

function bindMonthGrid(root, byDay, range) {
  let grid = root.querySelector(".cal-month-grid");
  let scroll = root.querySelector(".cal-month-scroll");
  let drag = null;
  const touchSlop = 10;
  const longPressMs = 350;
  bindActiveMonth(root, byDay, scroll);
  paintMonthFocus(root, byDay, range);
  root.querySelectorAll("[data-cal-rail-month]").forEach((btn) => {
    btn.addEventListener("click", () => {
      let section = scroll.querySelector(`[data-cal-month="${btn.dataset.calRailMonth}"]`);
      if (!section) return;
      scroll.scrollTop += section.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
      calendarScrollTop = scroll.scrollTop;
      calendarActiveMonth = dayjs(`${btn.dataset.calRailMonth}-01`, "YYYY-MM-DD", true).startOf("month");
      selectedMonth = calendarActiveMonth.toDate();
      if (!activeCalendarRange()) paintMonthFocus(root, byDay, null);
    });
  });
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
      selecting: event.pointerType !== "touch",
      cancelled: false,
      originX: event.clientX,
      originY: event.clientY,
      timer: null,
    };
    if (event.pointerType === "touch") {
      drag.timer = setTimeout(() => beginCalendarDragSelect(root, grid, drag), longPressMs);
      return;
    }
    grid.classList.add("is-dragging");
    try {grid.setPointerCapture(event.pointerId);} catch (e) {}
    event.preventDefault();
  });
  grid.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId || drag.cancelled) return;
    let dist = Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY);
    if (drag.pointerType === "touch" && !drag.selecting) {
      if (dist > touchSlop) {
        clearCalendarDragTimer(drag);
        drag.cancelled = true;
      }
      return;
    }
    let key = monthDayAt(grid, event);
    if (!key || key === drag.current) return;
    drag.current = key;
    drag.moved = drag.moved || key !== drag.anchor;
    if (!drag.moved) return;
    paintDaySelection(root, selectionRange(drag.anchor, key));
  });
  grid.addEventListener("pointerup", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    let gesture = drag;
    drag = null;
    clearCalendarDragTimer(gesture);
    grid.classList.remove("is-dragging");
    if (gesture.cancelled) {
      paintMonthFocus(root, byDay, activeCalendarRange());
      return;
    }
    if (gesture.selecting && gesture.moved) {
      commitCalendarSelection(selectionRange(gesture.anchor, gesture.current));
      return;
    }
    let tapped = gesture.pointerType === "touch"
      ? Math.hypot(event.clientX - gesture.originX, event.clientY - gesture.originY) <= touchSlop
      : !gesture.moved;
    if (tapped || (gesture.selecting && !gesture.moved)) toggleDaySelection(gesture.anchor);
    else paintMonthFocus(root, byDay, activeCalendarRange());
  });
  grid.addEventListener("pointercancel", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    clearCalendarDragTimer(drag);
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
