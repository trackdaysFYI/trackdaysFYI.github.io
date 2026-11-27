import {EVENT_TYPES, VEHICLE_TYPES} from "./config.js";
import {todayIso} from "./dates.js";
import {loadSavedEvents, persistSavedEvents} from "./storage.js";

export const INFINITE_RADIUS = 0;
export const RADIUS_VALUES = [];
for (let miles = 50; miles <= 950; miles += 50) RADIUS_VALUES.push(miles);
RADIUS_VALUES.push(INFINITE_RADIUS);

export const state = {
  tracks: undefined,
  orgs: undefined,
  trackdays: undefined,
  savedEventsSet: loadSavedEvents(),
  selectedVehicleTypes: new Set(),
  selectedEventTypes: new Set(),
  selectedCalendarStart: null,
  selectedCalendarEnd: null,
  searchRadius: INFINITE_RADIUS,
  lastOpenedTrack: undefined,
};

function removePastSavedEvents() {
  let todayStr = todayIso();
  let hasChanges = false;
  [...state.savedEventsSet].forEach((key) => {
    let [eventDate] = key.split("|");
    if (eventDate && eventDate < todayStr) {
      console.log(`Removing past saved event: ${key}`);
      state.savedEventsSet.delete(key);
      hasChanges = true;
    }
  });
  if (hasChanges) persistSavedEvents(state.savedEventsSet);
}
removePastSavedEvents();

export function getEventKey(td) {
  return [td.dateKey, td.org, td.track, td.subtrack, td.eventType, td.vehicleType].join("|");
}

export function dateInRange(dateKey) {
  if (!state.selectedCalendarStart || !state.selectedCalendarEnd) return true;
  return dateKey >= state.selectedCalendarStart && dateKey <= state.selectedCalendarEnd;
}

export function setCalendarRange(start, end) {
  if (!start || !end) {
    state.selectedCalendarStart = null;
    state.selectedCalendarEnd = null;
  } else if (start <= end) {
    state.selectedCalendarStart = start;
    state.selectedCalendarEnd = end;
  } else {
    state.selectedCalendarStart = end;
    state.selectedCalendarEnd = start;
  }
}

export function selectedWeekdays() {
  let daySelectElement = document.getElementById("daySelect");
  return new Set(Array.from(daySelectElement.options).filter(option => option.selected).map(option => option.value));
}

export function trackWithinRadius(trackKey) {
  return state.searchRadius === INFINITE_RADIUS || state.tracks[trackKey].dist <= state.searchRadius;
}

// opts toggles which checks apply: radius, date, day, org, vehicle, event
export function passesFilters(td, opts = {}) {
  if (opts.radius && !trackWithinRadius(td.track)) return false;
  if (opts.date && !dateInRange(td.dateKey)) return false;
  if (opts.day) {
    let days = opts.selectedDays || selectedWeekdays();
    if (!days.has(td.weekday)) return false;
  }
  if (opts.org && !state.orgs[td.org].dropdownSelected) return false;
  if (opts.vehicle && ![...td.vehicleType].some(t => state.selectedVehicleTypes.has(t))) return false;
  if (opts.event && ![...td.eventType].some(t => state.selectedEventTypes.has(t))) return false;
  return true;
}

export function updateTrackdaysVisibilityProperty() {
  let selectedDays = selectedWeekdays();
  state.trackdays.forEach((td) => {
    let withinRadius = trackWithinRadius(td.track);
    let core = passesFilters(td, {date: true, day: true, org: true, vehicle: true, event: true, selectedDays});
    let isSaved = state.savedEventsSet.has(getEventKey(td));
    // Saved events skip most filters, but still respect the selected date range.
    let savedVisible = isSaved && dateInRange(td.dateKey);
    td.visibilityDropdown = passesFilters(td, {radius: true, vehicle: true, event: true});
    td.visibilityMap = savedVisible || core;
    td.visibilityCalendar = savedVisible || (core && withinRadius);
  });
}

export function hiddenEventNote(hidden) {
  // Only name a filter when it is off and one of these events is actually that kind.
  // Two reasons still read clearly. More than that collapses back to a generic line.
  let days = selectedWeekdays();
  let reasons = new Set();
  let addVehicle = (td, code, label) => {
    let types = [...td.vehicleType];
    if (types.some(t => state.selectedVehicleTypes.has(t))) return;
    if (types.includes(code) && !state.selectedVehicleTypes.has(code)) reasons.add(label);
  };
  let addEvent = (td, code, label) => {
    let types = [...td.eventType];
    if (types.some(t => state.selectedEventTypes.has(t))) return;
    if (types.includes(code) && !state.selectedEventTypes.has(code)) reasons.add(label);
  };
  hidden.forEach((td) => {
    for (let [code, info] of Object.entries(VEHICLE_TYPES)) addVehicle(td, code, info.filterNote);
    for (let [code, info] of Object.entries(EVENT_TYPES)) addEvent(td, code, info.filterNote);
    if (!dateInRange(td.dateKey)) reasons.add("date");
    if (!days.has(td.weekday)) reasons.add("weekday");
    if (state.orgs[td.org] && !state.orgs[td.org].dropdownSelected) reasons.add("host");
  });
  let n = hidden.length;
  let noun = n === 1 ? "event" : "events";
  let ordered = [
    ...Object.values(VEHICLE_TYPES).map(info => info.filterNote),
    ...Object.values(EVENT_TYPES).map(info => info.filterNote),
    "date",
    "weekday",
    "host",
  ].filter(label => reasons.has(label));
  if (ordered.length === 1) return `${n} ${ordered[0]} ${noun} filtered`;
  if (ordered.length === 2) return `${n} ${ordered[0]} and ${ordered[1]} ${noun} filtered`;
  return `${n} ${noun} filtered`;
}

export function updatePillCounts() {
  if (!state.trackdays || !state.tracks) return;
  let selectedDays = selectedWeekdays();
  let shared = state.trackdays.filter(td => passesFilters(td, {radius: true, date: true, day: true, org: true, selectedDays}));
  let hasVehicle = (td, code) => [...td.vehicleType].includes(code);
  let hasEvent = (td, code) => [...td.eventType].includes(code);
  let vehicleMatch = (td) => [...td.vehicleType].some(t => state.selectedVehicleTypes.has(t));
  let eventMatch = (td) => [...td.eventType].some(t => state.selectedEventTypes.has(t));
  document.getElementById("countCar").textContent = shared.filter(td => hasVehicle(td, "C") && eventMatch(td)).length;
  document.getElementById("countMoto").textContent = shared.filter(td => hasVehicle(td, "M") && eventMatch(td)).length;
  document.getElementById("countSumo").textContent = shared.filter(td => hasVehicle(td, "S") && eventMatch(td)).length;
  document.getElementById("countTrackdays").textContent = shared.filter(td => hasEvent(td, "T") && vehicleMatch(td)).length;
  document.getElementById("countSchools").textContent = shared.filter(td => hasEvent(td, "S") && vehicleMatch(td)).length;
  document.getElementById("countRaces").textContent = shared.filter(td => hasEvent(td, "R") && vehicleMatch(td)).length;
  let tracksWithEvents = new Set(state.trackdays.filter(td => td.visibilityCalendar).map(td => td.track));
  document.getElementById("countEmpty").textContent = Object.keys(state.tracks).filter((track) => {
    return trackWithinRadius(track) && !tracksWithEvents.has(track);
  }).length;
}
