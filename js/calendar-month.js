import {
  addDays,
  dayOfMonth,
  dayOfWeek,
  endOfMonth,
  formatDayHeading,
  formatMonthDayYear,
  formatMonthYear,
  monthKeyOf,
  nextMonthKey,
  parseIsoDate,
  startOfMonth,
  todayIso,
} from "./dates.js";
import {escapeHtml} from "./lap-record-shared.js";
import {
  calendarHeatByDay,
  activeCalendarRange,
  selectableDateBounds,
  dateRangeButtonLabel,
  eventRowHtml,
  fitCalendarTitles,
} from "./calendar.js";

// Scrollable multi-month calendar with hidden scrollbar.
// ≤700px (stacked layout): transform month carousel. Wider: vertical list scroller.
let calendarScrollTop = 0;
let calendarActiveMonth = null;
let calendarDragSelecting = false;
// Day tap/range-select finishes on pointerup before touchend; block that touchend from swiping months.
let calendarSuppressMonthSwipe = false;
let monthCtx = null;

export function initCalendarMonth(context) {
  monthCtx = context;
}

export function resetCalendarMonth() {
  calendarActiveMonth = null;
  calendarScrollTop = 0;
}

function suppressNextMonthSwipe() {
  calendarSuppressMonthSwipe = true;
  setTimeout(() => { calendarSuppressMonthSwipe = false; }, 0);
}

const calendarWeekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
  .map((day) => `<span class="cal-weekday">${day}</span>`)
  .join("");

const calendarMonthsMq = window.matchMedia("(max-width: 700px)");

function calendarMonthsHorizontal() {
  return calendarMonthsMq.matches;
}

// Portrait <-> landscape often crosses the stacked/side-by-side breakpoint. Carrying an
// arbitrary active month across axes was flaky — reset to the current month instead.
function onCalendarMonthsLayoutChange() {
  let root = document.getElementById("calendar");
  if (!root?.querySelector(".cal-month") || !monthCtx) return;
  resetCalendarMonth();
  // Let the max-width layout CSS apply before measuring / binding scroll.
  requestAnimationFrame(() => monthCtx.updateCalendar());
}

if (typeof calendarMonthsMq.addEventListener === "function") {
  calendarMonthsMq.addEventListener("change", onCalendarMonthsLayoutChange);
} else if (typeof calendarMonthsMq.addListener === "function") {
  calendarMonthsMq.addListener(onCalendarMonthsLayoutChange);
}

function syncMonthCarousel(scroll) {
  if (!calendarMonthsHorizontal()) {
    scroll.style.transform = "";
    return;
  }
  let sections = [...scroll.querySelectorAll("[data-cal-month]")];
  let index = sections.findIndex((section) => section.dataset.calMonth === calendarActiveMonth);
  if (index < 0) index = 0;
  scroll.style.transform = `translate3d(${-index * 100}%, 0, 0)`;
}

function stepMonthCarousel(root, byDay, scroll, dir) {
  let sections = [...scroll.querySelectorAll("[data-cal-month]")];
  let index = sections.findIndex((section) => section.dataset.calMonth === calendarActiveMonth);
  if (index < 0) index = 0;
  index = Math.max(0, Math.min(sections.length - 1, index + dir));
  let nextKey = sections[index].dataset.calMonth;
  if (nextKey === calendarActiveMonth) return;
  calendarActiveMonth = nextKey;
  syncMonthCarousel(scroll);
  paintMonthFocus(root, byDay, activeCalendarRange());
}

export function renderCalendarView() {
  let root = document.getElementById("calendar");
  let bounds = selectableDateBounds();
  let range = activeCalendarRange();
  if (!calendarActiveMonth) calendarActiveMonth = monthKeyOf(todayIso());
  let byDay = calendarHeatByDay(bounds);
  let maxCount = 1;
  byDay.forEach((items) => {
    if (items.length > maxCount) maxCount = items.length;
  });
  root.innerHTML = `<div class="cal cal-month"><div class="cal-month-layout"><div class="cal-month-board"><div class="cal-month-grid"><div class="cal-month-weekdays" aria-hidden="true">${calendarWeekdays}</div><div class="cal-month-scroll">${calendarMonthsHtml(bounds, byDay, maxCount, range)}</div></div></div><div class="cal-month-detail"></div></div></div>`;
  let scroll = root.querySelector(".cal-month-scroll");
  if (calendarMonthsHorizontal()) {
    syncMonthCarousel(scroll);
  } else {
    scroll.style.transform = "";
    scroll.scrollTop = calendarScrollTop;
    if (!calendarScrollTop) {
      // Prefer today's month when idle; otherwise keep the active month on screen
      // (e.g. after rotating across the stacked breakpoint).
      let todayMonth = monthKeyOf(todayIso());
      let section = (!range && scroll.querySelector(`[data-cal-month="${todayMonth}"]`))
        || scroll.querySelector(`[data-cal-month="${calendarActiveMonth}"]`);
      // Scroll only inside .cal-month-scroll - scrollIntoView also moves the page.
      scrollChildToStart(scroll, section);
      calendarScrollTop = scroll.scrollTop;
    }
    if (!range) {
      let active = monthNearestScroll(scroll);
      if (active) calendarActiveMonth = active;
    }
  }
  bindMonthGrid(root, byDay, range);
}

function scrollChildToStart(scroll, el) {
  if (!el || !scroll.contains(el)) return;
  scroll.scrollTop += el.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
}

// Active month = last section whose label has crossed a probe below the scroll top.
// Weekdays sit outside the scroller. Probe/band are sized for coarse mouse-wheel steps.
function monthNearestScroll(scroll) {
  let sections = [...scroll.querySelectorAll("[data-cal-month]")];
  if (!sections.length) return null;
  let viewTop = scroll.getBoundingClientRect().top;
  let curIdx = calendarActiveMonth
    ? sections.findIndex((section) => section.dataset.calMonth === calendarActiveMonth)
    : -1;

  // Buffer into the viewport so a single wheel notch near a boundary does not flip months.
  let buffer = Math.min(72, Math.round(scroll.clientHeight * 0.2));
  let probe = viewTop + buffer;
  let index = 0;
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].getBoundingClientRect().top <= probe) index = i;
    else break;
  }

  // Extra stickiness past the probe so scroll bounce / partial notches settle cleanly.
  if (curIdx >= 0 && index !== curIdx) {
    let band = buffer;
    if (index > curIdx) {
      if (sections[curIdx].getBoundingClientRect().top > viewTop - band) index = curIdx;
    } else if (sections[curIdx].getBoundingClientRect().top < viewTop + band) {
      index = curIdx;
    }
  }

  return sections[index].dataset.calMonth;
}

export function calendarClearDatesHtml() {
  return `<button type="button" class="cal-clear-dates" data-cal-clear-range aria-label="Clear dates" title="Clear dates"><span aria-hidden="true">×</span></button>`;
}

function calendarMonthsHtml(bounds, byDay, maxCount, range) {
  let months = [];
  let maxMonth = monthKeyOf(bounds.max);
  for (let month = monthKeyOf(bounds.min); month <= maxMonth; month = nextMonthKey(month)) {
    months.push(`<section class="cal-month-section" data-cal-month="${month}">
      <h3 class="cal-month-label"><button type="button" class="cal-month-nav" data-cal-month-dir="-1" aria-label="Previous month"></button><span>${escapeHtml(formatMonthYear(month))}</span><button type="button" class="cal-month-nav" data-cal-month-dir="1" aria-label="Next month"></button></h3>
      ${monthDayButtons(month, byDay, maxCount, bounds, range)}
    </section>`);
  }
  return months.join("");
}

function monthDayButtons(month, byDay, maxCount, bounds, range) {
  let monthStart = startOfMonth(month);
  let monthEnd = endOfMonth(month);
  let first = monthStart < bounds.min ? bounds.min : monthStart;
  let last = monthEnd > bounds.max ? bounds.max : monthEnd;
  if (first > last) return `<div class="cal-grid"></div>`;
  let today = todayIso();
  let savedEventsSet = monthCtx.getSavedEventsSet();
  let cells = [];
  for (let i = 0; i < dayOfWeek(first); i++) cells.push(`<span class="cal-day is-outside" aria-hidden="true"></span>`);
  for (let key = first; key <= last; key = addDays(key, 1)) {
    let items = byDay.get(key) || [];
    let classes = ["cal-day"];
    if (key === today) classes.push("is-today");
    let selected = range && key >= range.start && key <= range.end;
    if (selected) classes.push("is-selected");
    if (selected && key === range.start) classes.push("is-range-start");
    if (selected && key === range.end) classes.push("is-range-end");
    if (range && !selected) classes.push("is-outside-range");
    if (items.length) classes.push("has-events");
    if (items.some((td) => savedEventsSet.has(monthCtx.getEventKey(td)))) classes.push("is-saved");
    let heat = items.length ? ` style="--heat:${(items.length / maxCount).toFixed(3)}"` : "";
    let countLabel = items.length ? `, ${items.length} ${items.length === 1 ? "event" : "events"}` : ", no events";
    cells.push(`<button type="button" class="${classes.join(" ")}" data-cal-day="${key}" aria-pressed="${selected ? "true" : "false"}" aria-label="${escapeHtml(formatMonthDayYear(key, {longMonth: true}))}${countLabel}"${heat}><span class="cal-day-num">${dayOfMonth(key)}</span></button>`);
  }
  return `<div class="cal-grid">${cells.join("")}</div>`;
}

function selectionRange(a, b) {
  return a <= b ? {start: a, end: b} : {start: b, end: a};
}

function keysForRange(range) {
  if (!range || !parseIsoDate(range.start) || !parseIsoDate(range.end)) return null;
  let keys = [];
  for (let key = range.start; key <= range.end; key = addDays(key, 1)) keys.push(key);
  return keys;
}

function emptyMonthMessage(month) {
  return `No matching events in ${formatMonthYear(month)}`;
}

function rangeEmptyHtml() {
  let {start, end} = monthCtx.getSelectedCalendarRange();
  let copy = start === end
    ? "No matching events on selected date"
    : "No matching events in selected date range";
  return `<div class="cal-list"><p class="cal-month-empty">${copy}</p></div>`;
}

function rangeHeaderHtml(keys) {
  if (!keys || !keys.length) return "";
  return `<div class="cal-range-header"><span class="cal-range-header-text">${escapeHtml(dateRangeButtonLabel("MMMM"))}</span>${calendarClearDatesHtml()}</div>`;
}

function filteredNoteHtml(startKey, endKey) {
  let trackdays = monthCtx.getTrackdays();
  let hidden = trackdays.filter((td) => !td.visibilityMap && td.dateKey >= startKey && td.dateKey <= endKey);
  if (!hidden.length) return "";
  return `<p class="cal-month-note">${escapeHtml(monthCtx.hiddenEventNote(hidden))}</p>`;
}

function eventsPanelHtml(byDay, month, keys) {
  let noteStart = keys ? keys[0] : startOfMonth(month);
  let noteEnd = keys ? keys[keys.length - 1] : endOfMonth(month);
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
    shown = [...byDay.keys()].filter((key) => key.startsWith(month)).sort();
  }
  let body = shown.length
    ? `<div class="cal-month-groups">${shown.map((dayKey) => `<section class="cal-month-group">${dayPanelHtml(dayKey, byDay)}</section>`).join("")}</div>`
    : keys
      ? rangeEmptyHtml()
      : `<div class="cal-list"><p class="cal-month-empty">${escapeHtml(emptyMonthMessage(month))}</p></div>`;
  return header + body + note;
}

function dayPanelHtml(key, byDay) {
  let items = byDay.get(key) || [];
  let heading = `<div class="cal-month-heading">${escapeHtml(formatDayHeading(key))}</div>`;
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
  if (range) monthCtx.setCalendarRange(range.start, range.end);
  else monthCtx.setCalendarRange(null, null);
  if (!monthCtx.getTrackdays()) {
    monthCtx.updateCalendar();
    return;
  }
  monthCtx.refresh({trackVisibility: true, popup: true, calendar: true});
}

function toggleDaySelection(key) {
  let {start, end} = monthCtx.getSelectedCalendarRange();
  let same = start === key && end === key;
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
  root.querySelectorAll("[data-cal-month]").forEach((section) => {
    section.classList.toggle("is-inactive", !range && !!calendarActiveMonth && section.dataset.calMonth !== calendarActiveMonth);
  });
}

function paintMonthFocus(root, byDay, range) {
  paintDaySelection(root, range);
  let detail = root.querySelector(".cal-month-detail");
  detail.innerHTML = eventsPanelHtml(byDay, calendarActiveMonth, keysForRange(range));
  fitCalendarTitles();
}

function bindActiveMonth(root, byDay, scroll) {
  if (calendarMonthsHorizontal()) return;
  scroll.addEventListener("scroll", () => {
    calendarScrollTop = scroll.scrollTop;
    if (calendarDragSelecting || activeCalendarRange()) return;
    let next = monthNearestScroll(scroll);
    if (!next || calendarActiveMonth === next) return;
    calendarActiveMonth = next;
    paintMonthFocus(root, byDay, null);
  }, {passive: true});
}

// Snap to next/prev month after a horizontal swipe or nav click. No touchmove preventDefault (keeps page scroll).
function bindMobileCarousel(root, byDay, scroll) {
  let grid = root.querySelector(".cal-month-grid");
  let startX = 0;
  let startY = 0;
  grid.addEventListener("click", (event) => {
    let nav = event.target instanceof Element ? event.target.closest("[data-cal-month-dir]") : null;
    if (!nav || !grid.contains(nav) || !calendarMonthsHorizontal()) return;
    stepMonthCarousel(root, byDay, scroll, Number(nav.dataset.calMonthDir));
  });
  grid.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1 || calendarDragSelecting) return;
    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
  }, {passive: true});
  grid.addEventListener("touchend", (event) => {
    if (!calendarMonthsHorizontal() || calendarDragSelecting || calendarSuppressMonthSwipe) return;
    let touch = event.changedTouches[0];
    if (!touch) return;
    let dx = touch.clientX - startX;
    let dy = touch.clientY - startY;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
    stepMonthCarousel(root, byDay, scroll, dx < 0 ? 1 : -1);
  }, {passive: true});
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
  // Mobile carousel: no edge auto-scroll (within-month select only).
  if (calendarMonthsHorizontal()) return;
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
  const touchSlop = 14;
  let onTouchMove = null;
  let onDocPointerMove = null;
  let onDocPointerUp = null;

  function unbindTouchGuards() {
    if (onTouchMove) {
      grid.removeEventListener("touchmove", onTouchMove);
      onTouchMove = null;
    }
    if (onDocPointerMove) {
      document.removeEventListener("pointermove", onDocPointerMove);
      onDocPointerMove = null;
    }
    if (onDocPointerUp) {
      document.removeEventListener("pointerup", onDocPointerUp);
      document.removeEventListener("pointercancel", onDocPointerUp);
      onDocPointerUp = null;
    }
  }

  function finishDrag(event, cancelledByBrowser) {
    if (!drag || (event && event.pointerId !== drag.pointerId)) return;
    let gesture = drag;
    drag = null;
    stopDragExtras(gesture);
    unbindTouchGuards();
    grid.classList.remove("is-dragging");
    if (cancelledByBrowser || gesture.cancelled) {
      // Cancelled move (e.g. month swipe from a day) must not suppress the carousel touchend.
      paintMonthFocus(root, byDay, activeCalendarRange());
      return;
    }
    // Completed tap or range select — don't let horizontal motion also change months.
    suppressNextMonthSwipe();
    if (gesture.selecting && gesture.moved) {
      commitCalendarSelection(selectionRange(gesture.anchor, gesture.current));
      return;
    }
    let tapped = Math.hypot(event.clientX - gesture.originX, event.clientY - gesture.originY) <= touchSlop;
    if (tapped || (gesture.selecting && !gesture.moved)) toggleDaySelection(gesture.anchor);
    else paintMonthFocus(root, byDay, activeCalendarRange());
  }

  bindActiveMonth(root, byDay, scroll);
  if (calendarMonthsHorizontal()) bindMobileCarousel(root, byDay, scroll);
  paintMonthFocus(root, byDay, range);
  grid.addEventListener("contextmenu", (event) => {
    if (event.target instanceof Element && event.target.closest("[data-cal-day]")) event.preventDefault();
  });
  grid.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    let key = monthDayAt(grid, event);
    if (!key) return;
    unbindTouchGuards();
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
      // Arm long-press carefully: preventDefault on touchmove cancels page scroll for the whole gesture.
      onTouchMove = (touchEvent) => {
        if (!drag || drag.cancelled) return;
        let touch = touchEvent.touches[0] || touchEvent.changedTouches[0];
        if (!touch) return;
        drag.pointerX = touch.clientX;
        drag.pointerY = touch.clientY;
        let dist = Math.hypot(touch.clientX - drag.originX, touch.clientY - drag.originY);
        if (!drag.selecting) {
          if (dist > touchSlop) {
            stopDragExtras(drag);
            drag.cancelled = true;
            unbindTouchGuards();
            return;
          }
          // Desktop: claim tiny moves so nested scroll doesn't kill long-press.
          // Mobile: skip preventDefault so the page can still scroll vertically.
          // Only cancel when allowed — browser may already be scrolling (cancelable=false).
          if (!calendarMonthsHorizontal() && touchEvent.cancelable) touchEvent.preventDefault();
          return;
        }
        if (touchEvent.cancelable) touchEvent.preventDefault();
        paintDragDay(root, grid, drag, touch.clientX, touch.clientY);
      };
      grid.addEventListener("touchmove", onTouchMove, {passive: false});
      onDocPointerMove = (moveEvent) => {
        if (!drag || moveEvent.pointerId !== drag.pointerId || drag.cancelled || !drag.selecting) return;
        drag.pointerX = moveEvent.clientX;
        drag.pointerY = moveEvent.clientY;
        paintDragDay(root, grid, drag, moveEvent.clientX, moveEvent.clientY);
      };
      onDocPointerUp = (upEvent) => finishDrag(upEvent, upEvent.type === "pointercancel" && !drag?.selecting);
      document.addEventListener("pointermove", onDocPointerMove);
      document.addEventListener("pointerup", onDocPointerUp);
      document.addEventListener("pointercancel", onDocPointerUp);
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
    if (drag.pointerType === "touch" && !drag.selecting) return;
    if (!drag.selecting) return;
    paintDragDay(root, grid, drag, event.clientX, event.clientY);
  });
  grid.addEventListener("pointerup", (event) => finishDrag(event, false));
  grid.addEventListener("pointercancel", (event) => {
    // After long-press starts we keep the gesture; early cancel means the browser took over scrolling.
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (drag.selecting) {
      finishDrag(event, false);
      return;
    }
    finishDrag(event, true);
  });
  grid.addEventListener("click", (event) => {
    if (event.detail !== 0) return;
    let key = monthDayAt(grid, event);
    if (!key) return;
    toggleDaySelection(key);
  });
}
