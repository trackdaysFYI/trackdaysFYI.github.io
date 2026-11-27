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
import {getEventKey, hiddenEventNote, setCalendarRange, state} from "./filters.js";
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
let calendarActiveMonth = null;
let calendarDragSelecting = false;
// Day tap/range-select finishes on pointerup before touchend; block that touchend from swiping months.
let calendarSuppressMonthSwipe = false;
let pendingScrollReset = false;
let monthCtx = null;
let mounted = null;

export function initCalendarMonth(context) {
  monthCtx = context;
}

export function resetCalendarMonth() {
  calendarActiveMonth = null;
  pendingScrollReset = true;
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

function syncMonthCarousel(view) {
  if (!view.horizontal) {
    view.scroll.style.transform = "";
    return;
  }
  let index = view.sections.findIndex((section) => section.dataset.calMonth === calendarActiveMonth);
  if (index < 0) index = 0;
  view.scroll.style.transform = `translate3d(${-index * 100}%, 0, 0)`;
}

function stepMonthCarousel(view, dir) {
  let index = view.sections.findIndex((section) => section.dataset.calMonth === calendarActiveMonth);
  if (index < 0) index = 0;
  index = Math.max(0, Math.min(view.sections.length - 1, index + dir));
  let nextKey = view.sections[index].dataset.calMonth;
  if (nextKey === calendarActiveMonth) return;
  calendarActiveMonth = nextKey;
  syncMonthCarousel(view);
  paintMonthFocus(view, activeCalendarRange());
}

function mountCalendarGrid(root, bounds, horizontal) {
  if (mounted?.destroy) mounted.destroy();
  root.innerHTML = `<div class="cal cal-month"><div class="cal-month-layout"><div class="cal-month-board"><div class="cal-month-grid"><div class="cal-month-weekdays" aria-hidden="true">${calendarWeekdays}</div><div class="cal-month-scroll">${calendarMonthsSkeletonHtml(bounds)}</div></div></div><div class="cal-month-detail"></div></div></div>`;
  let grid = root.querySelector(".cal-month-grid");
  let scroll = root.querySelector(".cal-month-scroll");
  let detail = root.querySelector(".cal-month-detail");
  let dayButtons = new Map();
  let dayDateLabels = new Map();
  grid.querySelectorAll("[data-cal-day]").forEach((btn) => {
    let key = btn.dataset.calDay;
    dayButtons.set(key, btn);
    dayDateLabels.set(key, formatMonthDayYear(key, {longMonth: true}));
  });
  let sections = [...scroll.querySelectorAll("[data-cal-month]")];
  let view = {
    root,
    grid,
    scroll,
    detail,
    horizontal,
    boundsKey: `${bounds.min}|${bounds.max}`,
    dayButtons,
    dayDateLabels,
    sections,
    byDay: new Map(),
    destroy: null,
  };
  bindMonthGrid(view);
  return view;
}

function patchDayCells(view, byDay, maxCount) {
  for (let [key, btn] of view.dayButtons) {
    let items = byDay.get(key) || [];
    let hasEvents = items.length > 0;
    let isSaved = hasEvents && items.some((td) => state.savedEventsSet.has(getEventKey(td)));
    btn.classList.toggle("has-events", hasEvents);
    btn.classList.toggle("is-saved", isSaved);
    if (hasEvents) btn.style.setProperty("--heat", (items.length / maxCount).toFixed(3));
    else btn.style.removeProperty("--heat");
    let countLabel = hasEvents ? `, ${items.length} ${items.length === 1 ? "event" : "events"}` : ", no events";
    btn.setAttribute("aria-label", view.dayDateLabels.get(key) + countLabel);
  }
}

function alignScrollToActiveMonth(view, range) {
  if (view.horizontal) {
    syncMonthCarousel(view);
    return;
  }
  view.scroll.style.transform = "";
  let todayMonth = monthKeyOf(todayIso());
  let section = (!range && view.scroll.querySelector(`[data-cal-month="${todayMonth}"]`))
    || view.scroll.querySelector(`[data-cal-month="${calendarActiveMonth}"]`);
  // Scroll only inside .cal-month-scroll - scrollIntoView also moves the page.
  scrollChildToStart(view.scroll, section);
  if (!range) {
    let active = monthNearestScroll(view);
    if (active) calendarActiveMonth = active;
  }
}

export function renderCalendarView() {
  let root = document.getElementById("calendar");
  let bounds = selectableDateBounds();
  let range = activeCalendarRange();
  let horizontal = calendarMonthsHorizontal();
  let boundsKey = `${bounds.min}|${bounds.max}`;
  if (!calendarActiveMonth) calendarActiveMonth = monthKeyOf(todayIso());

  let needsMount = !mounted
    || mounted.root !== root
    || !root.contains(mounted.grid)
    || mounted.horizontal !== horizontal
    || mounted.boundsKey !== boundsKey;

  if (needsMount) {
    mounted = mountCalendarGrid(root, bounds, horizontal);
  }

  let byDay = calendarHeatByDay(bounds);
  let maxCount = 1;
  byDay.forEach((items) => {
    if (items.length > maxCount) maxCount = items.length;
  });
  mounted.byDay = byDay;
  patchDayCells(mounted, byDay, maxCount);

  if (needsMount || pendingScrollReset) {
    pendingScrollReset = false;
    alignScrollToActiveMonth(mounted, range);
  } else if (mounted.horizontal) {
    syncMonthCarousel(mounted);
  }

  paintMonthFocus(mounted, range);
}

function scrollChildToStart(scroll, el) {
  if (!el || !scroll.contains(el)) return;
  scroll.scrollTop += el.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
}

// Active month = last section whose label has crossed a probe below the scroll top.
// Weekdays sit outside the scroller. Probe/band are sized for coarse mouse-wheel steps.
function monthNearestScroll(view) {
  let {scroll, sections} = view;
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

function calendarMonthsSkeletonHtml(bounds) {
  let months = [];
  let maxMonth = monthKeyOf(bounds.max);
  let today = todayIso();
  for (let month = monthKeyOf(bounds.min); month <= maxMonth; month = nextMonthKey(month)) {
    months.push(`<section class="cal-month-section" data-cal-month="${month}">
      <h3 class="cal-month-label"><button type="button" class="cal-month-nav" data-cal-month-dir="-1" aria-label="Previous month"></button><span>${escapeHtml(formatMonthYear(month))}</span><button type="button" class="cal-month-nav" data-cal-month-dir="1" aria-label="Next month"></button></h3>
      ${monthDaySkeletonHtml(month, bounds, today)}
    </section>`);
  }
  return months.join("");
}

function monthDaySkeletonHtml(month, bounds, today) {
  let monthStart = startOfMonth(month);
  let monthEnd = endOfMonth(month);
  let first = monthStart < bounds.min ? bounds.min : monthStart;
  let last = monthEnd > bounds.max ? bounds.max : monthEnd;
  if (first > last) return `<div class="cal-grid"></div>`;
  let cells = [];
  for (let i = 0; i < dayOfWeek(first); i++) cells.push(`<span class="cal-day is-outside" aria-hidden="true"></span>`);
  for (let key = first; key <= last; key = addDays(key, 1)) {
    let todayClass = key === today ? " is-today" : "";
    cells.push(`<button type="button" class="cal-day${todayClass}" data-cal-day="${key}" aria-pressed="false"><span class="cal-day-num">${dayOfMonth(key)}</span></button>`);
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
  let copy = state.selectedCalendarStart === state.selectedCalendarEnd
    ? "No matching events on selected date"
    : "No matching events in selected date range";
  return `<div class="cal-list"><p class="cal-month-empty">${copy}</p></div>`;
}

function rangeHeaderHtml(keys) {
  if (!keys || !keys.length) return "";
  return `<div class="cal-range-header"><span class="cal-range-header-text">${escapeHtml(dateRangeButtonLabel("MMMM"))}</span>${calendarClearDatesHtml()}</div>`;
}

function filteredNoteHtml(startKey, endKey) {
  let hidden = state.trackdays.filter((td) => !td.visibilityMap && td.dateKey >= startKey && td.dateKey <= endKey);
  if (!hidden.length) return "";
  return `<p class="cal-month-note">${escapeHtml(hiddenEventNote(hidden))}</p>`;
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
  if (range) setCalendarRange(range.start, range.end);
  else setCalendarRange(null, null);
  if (!state.trackdays) {
    monthCtx.updateCalendar();
    return;
  }
  monthCtx.refresh({trackVisibility: true, popup: true, calendar: true});
}

function toggleDaySelection(key) {
  let same = state.selectedCalendarStart === key && state.selectedCalendarEnd === key;
  commitCalendarSelection(same ? null : {start: key, end: key});
}

function paintDaySelection(view, range) {
  let dim = !!range;
  for (let [key, day] of view.dayButtons) {
    let on = dim && key >= range.start && key <= range.end;
    day.classList.toggle("is-selected", on);
    day.classList.toggle("is-range-start", !!(on && key === range.start));
    day.classList.toggle("is-range-end", !!(on && key === range.end));
    day.classList.toggle("is-outside-range", dim && !on);
    day.setAttribute("aria-pressed", on ? "true" : "false");
  }
  // No range: fade other months so the active month (detail list) reads clearly.
  for (let section of view.sections) {
    section.classList.toggle("is-inactive", !range && !!calendarActiveMonth && section.dataset.calMonth !== calendarActiveMonth);
  }
}

function paintMonthFocus(view, range) {
  paintDaySelection(view, range);
  view.detail.innerHTML = eventsPanelHtml(view.byDay, calendarActiveMonth, keysForRange(range));
  fitCalendarTitles();
}

function bindActiveMonth(view) {
  if (view.horizontal) return;
  view.scroll.addEventListener("scroll", () => {
    if (calendarDragSelecting || activeCalendarRange()) return;
    let next = monthNearestScroll(view);
    if (!next || calendarActiveMonth === next) return;
    calendarActiveMonth = next;
    paintMonthFocus(view, null);
  }, {passive: true});
}

// Snap to next/prev month after a horizontal swipe or nav click. No touchmove preventDefault (keeps page scroll).
function bindMobileCarousel(view) {
  let {grid} = view;
  let startX = 0;
  let startY = 0;
  grid.addEventListener("click", (event) => {
    let nav = event.target instanceof Element ? event.target.closest("[data-cal-month-dir]") : null;
    if (!nav || !grid.contains(nav) || !view.horizontal) return;
    stepMonthCarousel(view, Number(nav.dataset.calMonthDir));
  });
  grid.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1 || calendarDragSelecting) return;
    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
  }, {passive: true});
  grid.addEventListener("touchend", (event) => {
    if (!view.horizontal || calendarDragSelecting || calendarSuppressMonthSwipe) return;
    let touch = event.changedTouches[0];
    if (!touch) return;
    let dx = touch.clientX - startX;
    let dy = touch.clientY - startY;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
    stepMonthCarousel(view, dx < 0 ? 1 : -1);
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

function paintDragDay(view, drag, x, y) {
  let el = document.elementFromPoint(x, y);
  let day = el instanceof Element ? el.closest("[data-cal-day]") : null;
  if (!day || !view.grid.contains(day) || day.disabled) return;
  let key = day.dataset.calDay;
  if (!key || key === drag.current) return;
  drag.current = key;
  drag.moved = true;
  paintDaySelection(view, selectionRange(drag.anchor, key));
}

function beginDragSelect(view, drag) {
  if (!drag || drag.selecting || drag.cancelled) return;
  drag.selecting = true;
  calendarDragSelecting = true;
  view.grid.classList.add("is-dragging");
  try {view.grid.setPointerCapture(drag.pointerId);} catch (e) {}
  paintDaySelection(view, selectionRange(drag.anchor, drag.current));
  // Mobile carousel: no edge auto-scroll (within-month select only).
  if (view.horizontal) return;
  let {scroll} = view;
  let step = () => {
    drag.scrollRaf = null;
    if (!drag.selecting || drag.cancelled) return;
    let box = scroll.getBoundingClientRect();
    let edge = 36;
    let dir = drag.pointerY < box.top + edge ? -1 : drag.pointerY > box.bottom - edge ? 1 : 0;
    if (dir) {
      scroll.scrollTop = Math.max(0, Math.min(scroll.scrollHeight - scroll.clientHeight, scroll.scrollTop + dir * 3));
      paintDragDay(view, drag, drag.pointerX, drag.pointerY);
    }
    drag.scrollRaf = requestAnimationFrame(step);
  };
  drag.scrollRaf = requestAnimationFrame(step);
}

function bindMonthGrid(view) {
  let {grid} = view;
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

  view.destroy = () => {
    stopDragExtras(drag);
    drag = null;
    unbindTouchGuards();
  };

  function finishDrag(event, cancelledByBrowser) {
    if (!drag || (event && event.pointerId !== drag.pointerId)) return;
    let gesture = drag;
    drag = null;
    stopDragExtras(gesture);
    unbindTouchGuards();
    grid.classList.remove("is-dragging");
    if (cancelledByBrowser || gesture.cancelled) {
      // Cancelled move (e.g. month swipe from a day) must not suppress the carousel touchend.
      paintMonthFocus(view, activeCalendarRange());
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
    else paintMonthFocus(view, activeCalendarRange());
  }

  bindActiveMonth(view);
  if (view.horizontal) bindMobileCarousel(view);
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
          if (!view.horizontal && touchEvent.cancelable) touchEvent.preventDefault();
          return;
        }
        if (touchEvent.cancelable) touchEvent.preventDefault();
        paintDragDay(view, drag, touch.clientX, touch.clientY);
      };
      grid.addEventListener("touchmove", onTouchMove, {passive: false});
      onDocPointerMove = (moveEvent) => {
        if (!drag || moveEvent.pointerId !== drag.pointerId || drag.cancelled || !drag.selecting) return;
        drag.pointerX = moveEvent.clientX;
        drag.pointerY = moveEvent.clientY;
        paintDragDay(view, drag, moveEvent.clientX, moveEvent.clientY);
      };
      onDocPointerUp = (upEvent) => finishDrag(upEvent, upEvent.type === "pointercancel" && !drag?.selecting);
      document.addEventListener("pointermove", onDocPointerMove);
      document.addEventListener("pointerup", onDocPointerUp);
      document.addEventListener("pointercancel", onDocPointerUp);
      drag.timer = setTimeout(() => beginDragSelect(view, drag), 350);
      return;
    }
    event.preventDefault();
    beginDragSelect(view, drag);
  });
  grid.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId || drag.cancelled) return;
    drag.pointerX = event.clientX;
    drag.pointerY = event.clientY;
    if (drag.pointerType === "touch" && !drag.selecting) return;
    if (!drag.selecting) return;
    paintDragDay(view, drag, event.clientX, event.clientY);
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
