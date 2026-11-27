import {eventFullLabel, vehicleShortLabel} from "./config.js";
import {escapeHtml, safeHttpUrl} from "./lap-record-shared.js";

let calCtx = null;

export function initCalendar(context) {
  calCtx = context;
}

// Heat tint ignores the selected date range so other days keep their event color.
export function calendarHeatByDay(bounds) {
  let byDay = new Map();
  let trackdays = calCtx?.getTrackdays();
  if (!trackdays) return byDay;
  let savedEventsSet = calCtx.getSavedEventsSet();
  let selectedDays = calCtx.selectedWeekdays();
  let minKey = bounds.min.format("YYYY-MM-DD");
  let maxKey = bounds.max.format("YYYY-MM-DD");
  trackdays.forEach((td) => {
    if (td.dateKey < minKey || td.dateKey > maxKey) return;
    let saved = savedEventsSet.has(calCtx.getEventKey(td));
    let passes = calCtx.passesFilters(td, {radius: true, day: true, org: true, vehicle: true, event: true, selectedDays});
    if (!saved && !passes) return;
    if (!byDay.has(td.dateKey)) byDay.set(td.dateKey, []);
    byDay.get(td.dateKey).push(td);
  });
  return byDay;
}

export function activeCalendarRange() {
  let {start, end} = calCtx.getSelectedCalendarRange();
  if (!start || !end) return null;
  return {start, end};
}

export function selectableDateBounds() {
  return {
    min: dayjs().startOf("day"),
    max: dayjs().startOf("day").add(1, "year"),
  };
}

export function dateRangeButtonLabel(monthFmt = "MMM") {
  let {start: startKey, end: endKey} = calCtx.getSelectedCalendarRange();
  if (!startKey || !endKey) return "";
  let start = dayjs(startKey, "YYYY-MM-DD", true);
  let end = dayjs(endKey, "YYYY-MM-DD", true);
  if (startKey === endKey) return start.format(`${monthFmt} D`);
  if (!start.isSame(end, "year")) return `${start.format(`${monthFmt} D, YYYY`)} - ${end.format(`${monthFmt} D, YYYY`)}`;
  if (start.isSame(end, "month")) return `${start.format(`${monthFmt} D`)} - ${end.format("D")}`;
  return `${start.format(`${monthFmt} D`)} - ${end.format(`${monthFmt} D`)}`;
}

export function eventRowHtml(td) {
  let tracks = calCtx.getTracks();
  let orgs = calCtx.getOrgs();
  let savedEventsSet = calCtx.getSavedEventsSet();
  let selectedVehicleTypes = calCtx.getSelectedVehicleTypes();
  let selectedEventTypes = calCtx.getSelectedEventTypes();
  let track = tracks[td.track];
  let eventKey = calCtx.getEventKey(td);
  let saved = savedEventsSet.has(eventKey);
  let org = orgs[td.org];
  let showOrg = track.nickname !== td.org;
  let price = td.price >= 0 ? "$" + td.price : "";
  let vehicle = selectedVehicleTypes.size > 1 ? [...td.vehicleType].map(vehicleShortLabel).filter(Boolean).join("/") : "";
  let event = selectedEventTypes.size > 1 ? [...td.eventType].map(eventFullLabel).filter(Boolean).join("/") : "";
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
  return `<div class="cal-event event-item${saved ? " is-saved" : ""}">${main}${saveStarHtml(eventKey, saved)}</div>`;
}

export function saveStarHtml(key, saved, {popupAction = false} = {}) {
  let label = saved ? "Unsave Event" : "Save Event";
  let action = popupAction ? ` data-popup-action="save-event"` : "";
  return `<button type="button" class="event-save-star" title="${label}" aria-label="${label}" aria-pressed="${saved ? "true" : "false"}" data-event-key="${encodeURIComponent(key)}"${action}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6l2.5 5.1 5.6.8-4 3.9.9 5.6L12 16.8 7 19l.9-5.6-4-3.9 5.6-.8z"/></svg></button>`;
}

export function fitCalendarTitles() {
  // Full names stay when they fit. Otherwise use nicknames, then drop price and distance if the name still does not fit.
  document.querySelectorAll("#calendar .cal-month-detail .cal-event-title").forEach((title) => {
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
export function scheduleFitCalendarTitles() {
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

export function formatMiles(dist) {
  if (typeof dist !== "number" || !isFinite(dist)) return "";
  if (dist < 1) return "<1 mi";
  return Math.round(dist) + " mi";
}
