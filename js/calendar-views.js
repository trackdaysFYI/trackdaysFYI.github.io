function eventsByDay(include) {
  let byDay = new Map();
  trackdays.forEach((td) => {
    if (!td.visibilityCalendar || (include && !include(td))) return;
    let key = td.date.format("YYYY-MM-DD");
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(td);
  });
  return byDay;
}

let pendingCalendarDay = null;

function renderCalendarView() {
  let root = document.getElementById("calendar");
  let range = activeCalendarRange();
  if (range) {
    let byDay = eventsByDay((td) => {
      let key = td.date.format("YYYY-MM-DD");
      return key >= range.start && key <= range.end;
    });
    let keys = [...byDay.keys()].sort();
    let empty = range.start === range.end ? "No events this day" : "No events these days";
    let list = keys.length ? `<div class="cal-list">${agendaHtml(byDay, keys)}</div>` : `<div class="cal-empty">${empty}</div>`;
    root.innerHTML = `<div class="cal"><div class="cal-nav is-range"><span class="cal-nav-title">${escapeHtml(selectionLabel(range))}</span><button type="button" class="cal-show-month" data-cal-show-month>Clear Range</button></div>${list}</div>`;
  } else {
    let month = dayjs(selectedMonth).startOf("month");
    let byDay = eventsByDay((td) => td.date.isSame(month, "month"));
    let list = byDay.size === 0 ? `<div class="cal-empty">No events this month</div>` : `<div class="cal-list">${agendaHtml(byDay)}</div>`;
    root.innerHTML = `<div class="cal">${monthNavHtml(month)}${list}</div>`;
  }
  fitCalendarTitles();
}

function activeCalendarRange() {
  if (!selectedCalendarStart || !selectedCalendarEnd) return null;
  return {start: selectedCalendarStart, end: selectedCalendarEnd};
}

function monthNavHtml(month) {
  let label = escapeHtml(month.format("MMMM YYYY"));
  return `<div class="cal-nav">
    <button type="button" class="cal-nav-btn" data-month-delta="-1" aria-label="Previous month"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    <span class="cal-nav-title">${label}</span>
    <button type="button" class="cal-nav-btn" data-month-delta="1" aria-label="Next month"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
  </div>`;
}

function selectableDateBounds() {
  return {
    min: dayjs().startOf("day").subtract(1, "day"),
    max: dayjs().startOf("day").add(1, "year"),
  };
}

function dateDotEvents() {
  let byDay = new Map();
  if (typeof trackdays === "undefined" || typeof tracks === "undefined") return byDay;
  let selectedDays = selectedWeekdays();
  trackdays.forEach((td) => {
    let saved = savedEventsSet.has(getEventKey(td));
    let passes = passesFilters(td, {radius: true, day: true, org: true, vehicle: true, event: true, selectedDays});
    if (!saved && !passes) return;
    let key = td.date.format("YYYY-MM-DD");
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(td);
  });
  return byDay;
}

function popoverSelection() {
  if (pendingCalendarDay) return {start: pendingCalendarDay, end: pendingCalendarDay};
  return activeCalendarRange();
}

function renderDateRangePopover() {
  let scroller = document.getElementById("dateRangeScroll");
  if (!scroller) return;
  let scrollTop = scroller.scrollTop;
  let activeKey = document.activeElement && scroller.contains(document.activeElement) ? document.activeElement.dataset.calDay : null;
  scroller.innerHTML = dateRangeMonthsHtml();
  scroller.scrollTop = scrollTop;
  let days = [...scroller.querySelectorAll("[data-cal-day]")];
  let preferred = (activeKey && scroller.querySelector(`[data-cal-day="${activeKey}"]`)) || days[0];
  days.forEach((day) => {day.tabIndex = day === preferred ? 0 : -1;});
  if (activeKey && preferred) preferred.focus({preventScroll: true});
}

function dateRangeMonthsHtml() {
  let bounds = selectableDateBounds();
  let byDay = dateDotEvents();
  let selection = popoverSelection();
  let months = [];
  for (let month = bounds.min.startOf("month"); !month.isAfter(bounds.max, "month"); month = month.add(1, "month")) {
    months.push(`<section class="date-range-month" data-cal-month="${month.format("YYYY-MM")}">
      <h3 class="date-range-month-label">${escapeHtml(month.format("MMMM YYYY"))}</h3>
      ${monthCellsHtml(month, byDay, bounds, selection)}
    </section>`);
  }
  return months.join("");
}

function monthCellsHtml(month, byDay, bounds, selection) {
  let start = month.startOf("month");
  let end = month.endOf("month");
  let cursor = start.subtract(start.day(), "day");
  let last = end.add(6 - end.day(), "day");
  let today = dayjs().startOf("day");
  let minKey = bounds.min.format("YYYY-MM-DD");
  let maxKey = bounds.max.format("YYYY-MM-DD");
  let cells = [];
  for (; !cursor.isAfter(last, "day"); cursor = cursor.add(1, "day")) {
    if (!cursor.isSame(month, "month")) {
      cells.push(`<span class="cal-day is-outside" aria-hidden="true"></span>`);
      continue;
    }
    let key = cursor.format("YYYY-MM-DD");
    let items = byDay.get(key) || [];
    let classes = ["cal-day"];
    if (cursor.isSame(today, "day")) classes.push("is-today");
    let selected = selection && key >= selection.start && key <= selection.end;
    if (selected) classes.push("is-selected");
    if (items.length) classes.push("has-events");
    if (items.some(td => savedEventsSet.has(getEventKey(td)))) classes.push("is-saved");
    if (key < minKey || key > maxKey) {
      cells.push(`<button type="button" class="${classes.join(" ")} is-disabled" disabled><span class="cal-day-num">${cursor.date()}</span></button>`);
      continue;
    }
    let countLabel = items.length ? `, ${items.length} ${items.length === 1 ? "event" : "events"}` : "";
    cells.push(`<button type="button" class="${classes.join(" ")}" data-cal-day="${key}" aria-pressed="${selected ? "true" : "false"}" aria-label="${escapeHtml(cursor.format("MMMM D, YYYY"))}${countLabel}"><span class="cal-day-num">${cursor.date()}</span></button>`);
  }
  return `<div class="cal-grid">${cells.join("")}</div>`;
}

function dateRangeButtonLabel() {
  if (!selectedCalendarStart || !selectedCalendarEnd) return "Today onward";
  let start = dayjs(selectedCalendarStart, "YYYY-MM-DD", true);
  let end = dayjs(selectedCalendarEnd, "YYYY-MM-DD", true);
  if (selectedCalendarStart === selectedCalendarEnd) return start.format("MMM D");
  if (!start.isSame(end, "year")) return `${start.format("MMM D, YYYY")} – ${end.format("MMM D, YYYY")}`;
  if (start.isSame(end, "month")) return `${start.format("MMM D")} – ${end.format("D")}`;
  return `${start.format("MMM D")} – ${end.format("MMM D")}`;
}

function agendaHtml(byDay, keys) {
  let list = keys || [...byDay.keys()].sort();
  let todayKey = dayjs().format("YYYY-MM-DD");
  return list.map((key) => {
    let items = byDay.get(key);
    let day = dayjs(key, "YYYY-MM-DD", true);
    let today = key === todayKey ? " is-today" : "";
    return `<div class="cal-gutter-day${today}"><div class="cal-gutter"><span class="cal-gutter-dow">${escapeHtml(day.format("ddd"))}</span><span class="cal-gutter-num">${day.date()}</span></div><div class="cal-gutter-events">${items.map(td => eventRowHtml(td)).join("")}</div></div>`;
  }).join("");
}

function selectionLabel(selection) {
  let start = dayjs(selection.start, "YYYY-MM-DD", true);
  let end = dayjs(selection.end, "YYYY-MM-DD", true);
  if (selection.start === selection.end) return start.format("MMMM D, YYYY");
  if (!start.isSame(end, "year")) return `${start.format("MMMM D, YYYY")} – ${end.format("MMMM D, YYYY")}`;
  if (start.isSame(end, "month")) return `${start.format("MMMM D")}–${end.format("D, YYYY")}`;
  return `${start.format("MMMM D")} – ${end.format("MMMM D, YYYY")}`;
}

function eventRowHtml(td) {
  let track = tracks[td.track];
  let saved = savedEventsSet.has(getEventKey(td));
  let org = orgs[td.org];
  let showOrg = track.nickname !== td.org;
  let price = td.price >= 0 ? "$" + td.price : "";
  let vehicle = selectedVehicleTypes.size > 1 ? [...td.vehicleType].map(t => vehicleTypeMap[t]).filter(Boolean).join("/") : "";
  let event = selectedEventTypes.size > 1 ? [...td.eventType].map(t => ({T: "Trackday", S: "School", R: "Race"}[t] || t)).filter(Boolean).join("/") : "";
  let meta = [vehicle, event, td.subtrack, td.note].filter(Boolean).join(" · ");
  let dist = formatMiles(track.dist);
  let fullTrack = track.showNickname && track.nickname ? `${track.name} (${track.nickname})` : track.name;
  let shortTrack = track.nickname || track.name;
  let fullHost = org ? org.org : td.org;
  let shortHost = (org && org.orgNickname) || td.org;
  let titleInner = (trackLabel, hostLabel) => {
    let host = showOrg ? ` <span class="cal-event-org">${escapeHtml(hostLabel)}</span>` : "";
    return `${escapeHtml(trackLabel)}${host}`;
  };
  let metaHtml = meta ? `<span class="cal-event-meta">${escapeHtml(meta)}</span>` : "";
  let priceHtml = price ? `<span class="cal-event-price">${escapeHtml(price)}</span>` : "";
  let distHtml = dist ? `<span class="cal-event-dist">${escapeHtml(dist)}</span>` : "";
  let side = (priceHtml || distHtml) ? `<span class="cal-event-side">${priceHtml}${distHtml}</span>` : "";
  let inner = `<span class="cal-event-title allowSelect"><span class="cal-event-full">${titleInner(fullTrack, fullHost)}</span><span class="cal-event-short" aria-hidden="true">${titleInner(shortTrack, shortHost)}</span></span>${side}${metaHtml}`;
  let url = safeHttpUrl(td.url);
  let main = url
    ? `<a class="cal-event-main" href="${escapeHtml(url)}" target="_blank" rel="noopener">${inner}</a>`
    : `<div class="cal-event-main">${inner}</div>`;
  return `<div class="cal-event event-item${saved ? " is-saved" : ""}">${main}${saveStarHtml(td)}</div>`;
}

function saveStarHtml(td) {
  let key = getEventKey(td);
  let saved = savedEventsSet.has(key);
  let label = saved ? "Unsave Event" : "Save Event";
  return `<button type="button" class="event-save-star" title="${label}" aria-label="${label}" aria-pressed="${saved ? "true" : "false"}" data-event-key="${encodeURIComponent(key)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6l2.5 5.1 5.6.8-4 3.9.9 5.6L12 16.8 7 19l.9-5.6-4-3.9 5.6-.8z"/></svg></button>`;
}

function fitCalendarTitles() {
  // Full names stay when they fit. Otherwise use nicknames, then drop price and distance if the name still does not fit.
  document.querySelectorAll("#calendar .cal-gutter-day .cal-event-title").forEach((title) => {
    let full = title.querySelector(".cal-event-full");
    let short = title.querySelector(".cal-event-short");
    let main = title.closest(".cal-event-main");
    if (!full || !short || !main || title.clientWidth === 0) return;
    let side = main.querySelector(".cal-event-side");
    let overflows = () => title.scrollWidth > title.clientWidth + 1;
    let canNick = full.textContent !== short.textContent;
    title.classList.remove("is-nick");
    main.classList.remove("is-hide-side");
    if (overflows() && canNick) title.classList.add("is-nick");
    if (overflows() && side) {
      main.classList.add("is-hide-side");
      if (canNick) {
        title.classList.remove("is-nick");
        if (overflows()) title.classList.add("is-nick");
      }
    }
    let nick = title.classList.contains("is-nick");
    if (nick) {
      full.setAttribute("aria-hidden", "true");
      short.removeAttribute("aria-hidden");
      title.title = full.textContent;
    } else {
      full.removeAttribute("aria-hidden");
      short.setAttribute("aria-hidden", "true");
      title.removeAttribute("title");
    }
    if (side) side.toggleAttribute("aria-hidden", main.classList.contains("is-hide-side"));
  });
}

let calendarFitFrame = 0;
function scheduleFitCalendarTitles() {
  if (calendarFitFrame) return;
  calendarFitFrame = requestAnimationFrame(() => {
    calendarFitFrame = 0;
    fitCalendarTitles();
  });
}

let calendarRoot = document.getElementById("calendar");
if (calendarRoot && typeof ResizeObserver !== "undefined") {
  new ResizeObserver(scheduleFitCalendarTitles).observe(calendarRoot);
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleFitCalendarTitles);

function formatMiles(dist) {
  if (typeof dist !== "number" || !isFinite(dist)) return "";
  if (dist < 1) return "<1 mi";
  return Math.round(dist) + " mi";
}
