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

function renderCalendarView() {
  let root = document.getElementById("calendar");
  let month = dayjs(selectedMonth).startOf("month");
  let byDay = eventsByDay((td) => td.date.isSame(month, "month"));
  let grid = calendarGridOpen ? monthGridHtml(month, byDay) : "";
  root.innerHTML = `<div class="cal">${monthNavHtml(month)}${grid}${monthListHtml(month, byDay)}</div>`;
  fitCalendarTitles();
}

function monthNavHtml(month) {
  let label = escapeHtml(month.format("MMMM YYYY"));
  let expanded = calendarGridOpen ? "true" : "false";
  let toggleLabel = calendarGridOpen ? "Hide calendar" : "Show calendar";
  return `<div class="cal-nav">
    <button type="button" class="cal-nav-btn" data-month-delta="-1" aria-label="Previous month"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    <button type="button" class="cal-nav-title" data-cal-toggle-grid aria-expanded="${expanded}" aria-label="${toggleLabel}">${label}<svg class="cal-nav-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 9.5 12 15l5.5-5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    <button type="button" class="cal-nav-btn" data-month-delta="1" aria-label="Next month"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
  </div>`;
}

function monthGridHtml(month, byDay) {
  let labels = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
    .map(label => `<span class="cal-weekday">${label}</span>`).join("");
  let start = month.startOf("month");
  let end = month.endOf("month");
  let cursor = start.subtract(start.day(), "day");
  let last = end.add(6 - end.day(), "day");
  let selection = calendarSelection(month);
  let today = dayjs().startOf("day");
  let cells = [];
  for (; !cursor.isAfter(last, "day"); cursor = cursor.add(1, "day")) {
    let key = cursor.format("YYYY-MM-DD");
    let inMonth = cursor.isSame(month, "month");
    let items = byDay.get(key) || [];
    if (!inMonth) {
      cells.push(`<span class="cal-day is-outside" aria-hidden="true"><span class="cal-day-num">${cursor.date()}</span></span>`);
      continue;
    }
    let classes = ["cal-day"];
    if (cursor.isSame(today, "day")) classes.push("is-today");
    let selected = selection && key >= selection.start && key <= selection.end;
    if (selected) classes.push("is-selected");
    if (items.length) classes.push("has-events");
    let countLabel = items.length ? `, ${items.length} ${items.length === 1 ? "event" : "events"}` : ", no events";
    cells.push(`<button type="button" class="${classes.join(" ")}" data-cal-day="${key}" aria-pressed="${selected ? "true" : "false"}" aria-label="${escapeHtml(cursor.format("MMMM D"))}${countLabel}"><span class="cal-day-num">${cursor.date()}</span>${dayMarksHtml(items)}</button>`);
  }
  return `<div class="cal-weekdays" aria-hidden="true">${labels}</div><div class="cal-grid">${cells.join("")}</div>`;
}

function dayMarksHtml(items) {
  if (!items.length) return "";
  let saved = items.some(td => savedEventsSet.has(getEventKey(td))) ? " is-saved" : "";
  return `<span class="cal-dots"><span class="cal-dot${saved}"></span></span>`;
}

function monthListHtml(month, byDay) {
  let selection = calendarSelection(month);
  if (selection) {
    let keys = [...byDay.keys()].filter(key => key >= selection.start && key <= selection.end).sort();
    let empty = selection.start === selection.end ? "No events this day" : "No events these days";
    let body = keys.length ? agendaHtml(byDay, keys) : `<div class="cal-empty">${empty}</div>`;
    return `<div class="cal-list"><div class="cal-focushead"><span>${escapeHtml(selectionLabel(selection))}</span><button type="button" class="cal-show-month" data-cal-show-month>Show month</button></div>${body}</div>`;
  }
  if (byDay.size === 0) return `<div class="cal-empty">No events this month</div>`;
  return `<div class="cal-list">${agendaHtml(byDay)}</div>`;
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

function calendarSelection(month) {
  if (!selectedCalendarStart || !selectedCalendarEnd) return null;
  let start = dayjs(selectedCalendarStart, "YYYY-MM-DD", true);
  if (!start.isValid() || !start.isSame(month, "month")) return null;
  return {start: selectedCalendarStart, end: selectedCalendarEnd};
}

function selectionLabel(selection) {
  let start = dayjs(selection.start, "YYYY-MM-DD", true);
  let end = dayjs(selection.end, "YYYY-MM-DD", true);
  if (selection.start === selection.end) return start.format("dddd, MMM D");
  if (start.isSame(end, "month")) return `${start.format("MMM D")}–${end.format("D")}`;
  return `${start.format("MMM D")}–${end.format("MMM D")}`;
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
    let host = showOrg ? ` <span class="cal-event-org">hosted by ${escapeHtml(hostLabel)}</span>` : "";
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
