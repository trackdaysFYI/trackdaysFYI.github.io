import {eventFullLabel, vehicleShortLabel} from "./config.js";
import {addYears, dayOfMonth, formatMonthDay, formatMonthDayYear, todayIso} from "./dates.js";
import {escapeHtml, safeHttpUrl} from "./lap-record-shared.js";
import {getEventKey, passesFilters, selectedWeekdays, state} from "./filters.js";

// Heat tint ignores the selected date range so other days keep their event color.
export function calendarHeatByDay(bounds) {
  let byDay = new Map();
  if (!state.trackdays) return byDay;
  let selectedDays = selectedWeekdays();
  state.trackdays.forEach((td) => {
    if (td.dateKey < bounds.min || td.dateKey > bounds.max) return;
    let saved = state.savedEventsSet.has(getEventKey(td));
    let passes = passesFilters(td, {radius: true, day: true, org: true, vehicle: true, event: true, selectedDays});
    if (!saved && !passes) return;
    if (!byDay.has(td.dateKey)) byDay.set(td.dateKey, []);
    byDay.get(td.dateKey).push(td);
  });
  return byDay;
}

export function activeCalendarRange() {
  if (!state.selectedCalendarStart || !state.selectedCalendarEnd) return null;
  return {start: state.selectedCalendarStart, end: state.selectedCalendarEnd};
}

export function selectableDateBounds() {
  let min = todayIso();
  return {min, max: addYears(min, 1)};
}

export function dateRangeButtonLabel(monthFmt = "MMM") {
  let startKey = state.selectedCalendarStart;
  let endKey = state.selectedCalendarEnd;
  if (!startKey || !endKey) return "";
  let longMonth = monthFmt === "MMMM";
  if (startKey === endKey) return formatMonthDay(startKey, {longMonth});
  if (startKey.slice(0, 4) !== endKey.slice(0, 4)) {
    return `${formatMonthDayYear(startKey, {longMonth})} - ${formatMonthDayYear(endKey, {longMonth})}`;
  }
  if (startKey.slice(0, 7) === endKey.slice(0, 7)) {
    return `${formatMonthDay(startKey, {longMonth})} - ${dayOfMonth(endKey)}`;
  }
  return `${formatMonthDay(startKey, {longMonth})} - ${formatMonthDay(endKey, {longMonth})}`;
}

export function eventRowHtml(td) {
  let track = state.tracks[td.track];
  let eventKey = getEventKey(td);
  let saved = state.savedEventsSet.has(eventKey);
  let org = state.orgs[td.org];
  let showOrg = track.nickname !== td.org;
  let price = td.price >= 0 ? "$" + td.price : "";
  let vehicle = state.selectedVehicleTypes.size > 1 ? [...td.vehicleType].map(vehicleShortLabel).filter(Boolean).join("/") : "";
  let event = state.selectedEventTypes.size > 1 ? [...td.eventType].map(eventFullLabel).filter(Boolean).join("/") : "";
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
  let fullTitleText = showOrg ? `${fullTrack} ${fullHost}` : fullTrack;
  let titleAttr = fullTitleText !== (showOrg ? `${shortTrack} ${shortHost}` : shortTrack) ? ` title="${escapeHtml(fullTitleText)}"` : "";
  let inner = `<span class="cal-event-title allowSelect"${titleAttr}><span class="cal-event-full">${titleInner(fullTrack, fullHost)}</span><span class="cal-event-short">${titleInner(shortTrack, shortHost)}</span></span>${side}${metaHtml}`;
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

export function formatMiles(dist) {
  if (typeof dist !== "number" || !isFinite(dist)) return "";
  if (dist < 1) return "<1 mi";
  return Math.round(dist) + " mi";
}
