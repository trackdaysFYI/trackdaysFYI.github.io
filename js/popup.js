import {eventFullLabel, vehicleShortLabel} from "./config.js";
import {formatMonthDay} from "./dates.js";
import {escapeHtml, safeHttpUrl} from "./lap-record-shared.js";
import {dateInRange, getEventKey, hiddenEventNote, state} from "./filters.js";
import {saveStarHtml} from "./calendar.js";
import {map, mapMarkers} from "./map.js";
import {recordsListHtml, recordsUi} from "./index-lap-records.js";

const directionImg = `<svg xmlns="http://www.w3.org/2000/svg" width="22px" height="22px" viewBox="0 0 24 24"><path d="m2.3 12.7 9 9c.4.4 1 .4 1.4 0l9-9a1 1 0 0 0 0-1.4l-9-9a1 1 0 0 0-1.4 0l-9 9a1 1 0 0 0 0 1.4zM9 10h5V8l3 3-3 3v-2h-3v4H9v-6z"/></svg>`;
const weatherImg = `<svg xmlns="http://www.w3.org/2000/svg" width="22px" height="22px" viewBox="0 0 24 24"><path d="M7 12a5 5 0 1 0 10 0 5 5 0 0 0-10 0zm4 7h2v3h-2zm0-17h2v3h-2zm-9 9h3v2H2zm17 0h3v2h-3zM5.6 19.8l-1.4-1.4 2.1-2.2 1.5 1.5zM16.2 6.3l2.2-2 1.4 1.3-2.1 2.2zM6.3 7.8l-2-2.2 1.3-1.4 2.2 2.1zm13.5 10.6-1.4 1.4-2.2-2.1 1.5-1.5z"/></svg>`;

function syncPopupFade(scroll) {
  let fade = scroll.parentElement && scroll.parentElement.querySelector(".tl-fade");
  if (!fade) return;
  let overflow = scroll.scrollHeight - scroll.clientHeight > 1;
  let atEnd = scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 1;
  fade.hidden = !overflow || atEnd;
}

function bindPopupFade(popup) {
  let root = popup.getElement();
  if (!root || root._fadeBound) return;
  root._fadeBound = true;
  // Scroll events do not bubble, and Leaflet rebuilds the popup body on update.
  root.addEventListener("scroll", (ev) => {
    if (ev.target && ev.target.classList && ev.target.classList.contains("tl-scroll")) syncPopupFade(ev.target);
  }, true);
}

function fitPopupToMap(popup) {
  // Keep the panel inside the map, with room for the tip and margins.
  let width = Math.max(160, map.getSize().x - 32);
  popup.options.maxWidth = Math.min(420, width);
  popup.options.minWidth = Math.min(240, popup.options.maxWidth);
}

// Prefer a full host name: drop meta, then price, then weekday, and put back anything that still fits.
function fitPopupHosts(popup) {
  let root = popup.getElement();
  if (!root) return;
  root.querySelectorAll(".popup-timeline .tl-copy").forEach((copy) => {
    let host = copy.querySelector(".tl-host");
    if (!host) return;
    let extras = [copy.querySelector(".tl-meta"), copy.querySelector(".tl-price"), copy.querySelector(".tl-dow")].filter(Boolean);
    let cramped = () => copy.scrollWidth > copy.clientWidth + 1 || host.scrollWidth > host.clientWidth + 1;
    extras.forEach((el) => { el.hidden = false; });
    for (let el of extras) {
      if (!cramped()) break;
      el.hidden = true;
    }
    for (let i = extras.length - 1; i >= 0; i--) {
      if (!extras[i].hidden) continue;
      extras[i].hidden = false;
      if (cramped()) extras[i].hidden = true;
    }
  });
}

export function syncOpenPopup(popup) {
  if (!popup || !popup.isOpen()) return;
  fitPopupToMap(popup);
  popup.update();
  fitPopupHosts(popup);
  bindPopupFade(popup);
  let scroll = popup.getElement()?.querySelector(".popup-timeline .tl-scroll");
  if (scroll) syncPopupFade(scroll);
}

export function popupList(inner, foot) {
  return `<div class="tl-scroll-wrap"><div class="tl-scroll">${inner}</div><div class="tl-fade" hidden></div></div><div class="tl-foot">${foot}</div>`;
}

export function updateTrackPopup() {
  if (state.lastOpenedTrack === undefined) return;
  let track = state.tracks[state.lastOpenedTrack];
  let trackdaysAtTrack = state.trackdays.filter(td => td.track === state.lastOpenedTrack);
  let trackdaysFiltered = trackdaysAtTrack.filter(td => td.visibilityMap);
  let hiddenTrackdays = trackdaysAtTrack.filter(td => !td.visibilityMap);
  let multipleVehicleTypes = (state.selectedVehicleTypes.size > 1);
  let multipleEventTypes = trackdaysFiltered.some(td => td.eventType != "T") && (state.selectedEventTypes.size > 1);
  function rowMain(td, meta, price, mark) {
    let copy = `<span class="tl-copy"><span class="tl-dow">${td.weekday}</span><span class="tl-host allowSelect">${escapeHtml(td.org)}</span>${meta ? `<span class="tl-meta">${meta}</span>` : ""}${price ? `<span class="tl-price">${price}</span>` : ""}</span>`;
    let eventUrl = safeHttpUrl(td.url);
    if (eventUrl) return `<a class="tl-row-link" href="${escapeHtml(eventUrl)}" target="_blank" rel="noopener">${mark}${copy}</a>`;
    return `<div class="tl-row-link">${mark}${copy}</div>`;
  }
  function money(td) {
    return td.price >= 0 ? "$" + escapeHtml(td.price) : "";
  }
  function detailText(td) {
    let bits = [];
    if (multipleVehicleTypes) bits.push([...td.vehicleType].map(vehicleShortLabel).join("/"));
    if (multipleEventTypes) bits.push([...td.eventType].map(eventFullLabel).join("/"));
    if (td.subtrack) bits.push(td.subtrack);
    if (td.note) bits.push(td.note);
    return bits.map(bit => escapeHtml(bit)).join(" · ");
  }
  let directionsUrl = "https://www.google.com/maps?q=" + encodeURIComponent("directions " + track.name);
  let weatherUrl = "https://www.google.com/search?q=" + encodeURIComponent("weather " + track.name);
  let nickname = track.showNickname ? ` (${escapeHtml(track.nickname)})` : "";
  let dateHidden = hiddenTrackdays.filter(td => !dateInRange(td.dateKey));
  let otherHidden = hiddenTrackdays.filter(td => dateInRange(td.dateKey));
  let dateNote = dateHidden.length
    ? `<span class="hidden-note date-hidden-note">${dateHidden.length} ${dateHidden.length === 1 ? "event" : "events"} outside selected dates <button type="button" class="popup-clear-dates" data-popup-action="clear-date-range">Clear</button></span>`
    : "";
  let otherNote = otherHidden.length ? `<span class="hidden-note">${hiddenEventNote(otherHidden)}</span>` : "";
  let head = `<div class="popup-head"><b class="allowSelect">${escapeHtml(track.name)}${nickname}</b><div class="popup-links"><a href="${escapeHtml(directionsUrl)}" target="_blank" rel="noopener" title="Directions">${directionImg}</a><a href="${escapeHtml(weatherUrl)}" target="_blank" rel="noopener" title="Weather">${weatherImg}</a></div></div>`;
  let lastDate = "";
  let rows = trackdaysFiltered.map((td) => {
    let eventKey = getEventKey(td);
    let isSaved = state.savedEventsSet.has(eventKey);
    let saved = isSaved ? " is-saved" : "";
    let dateKey = td.dateKey;
    let showDate = dateKey !== lastDate;
    lastDate = dateKey;
    let meta = detailText(td);
    let price = money(td);
    let mark = `<span class="tl-mark"><span class="tl-date">${showDate ? escapeHtml(formatMonthDay(td.dateKey)) : ""}</span><span class="tl-dot"></span></span>`;
    return `<div class="event-item tl-item${saved}">${rowMain(td, meta, price, mark)}${saveStarHtml(eventKey, isSaved, {popupAction: true})}</div>`;
  }).join("");
  let emptyMsg = trackdaysAtTrack.length === 0 ? "No upcoming events" : "No matching events";
  let list = trackdaysFiltered.length === 0
    ? `<div class="empty">${emptyMsg}</div>`
    : `<div class="tl">${rows}</div>`;
  let report = `<button type="button" class="missing-event-link" data-popup-action="missing-event">Missing an event?</button>`;
  let eventsBody = popupList(list, dateNote + otherNote + report);
  let tabs = `<div class="rec-tabs"><button type="button" class="${recordsUi.open ? "" : "on"}" data-popup-action="records-tab" data-open="0">Events</button><button type="button" class="${recordsUi.open ? "on" : ""}" data-popup-action="records-tab" data-open="1">Records</button></div>`;
  let body = recordsUi.open ? recordsListHtml(state.lastOpenedTrack, popupList) : eventsBody;
  let popup = mapMarkers[state.lastOpenedTrack].getPopup();
  popup.setContent(`<div class="popup popup-timeline">${head}${tabs}${body}</div>`);
  if (popup.isOpen()) syncOpenPopup(popup);
}

export function wirePopupActions(handlers) {
  // capture: Leaflet stopPropagation on popups blocks bubble to document
  document.addEventListener("click", (event) => {
    let el = event.target.closest("[data-popup-action]");
    if (!el || !el.closest(".leaflet-popup")) return;
    let action = el.dataset.popupAction;
    if (action === "save-event") handlers.onSaveEvent(el);
    else if (action === "missing-event") handlers.onMissingEvent();
    else if (action === "records-tab") handlers.onRecordsTab(el.dataset.open === "1");
    else if (action === "add-record") handlers.onAddRecord();
    else if (action === "clear-date-range") handlers.onClearDateRange();
  }, true);
}
