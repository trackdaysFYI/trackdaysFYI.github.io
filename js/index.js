dayjs.extend(window.dayjs_plugin_relativeTime);
dayjs.extend(window.dayjs_plugin_utc);
dayjs.extend(window.dayjs_plugin_customParseFormat);

const STORAGE_KEY_USER_SAVED_EVENTS = "trackdaysFYI:userSavedEvents";
const STORAGE_KEY_USER_VEHICLE_TYPES = "trackdaysFYI:userVehicleTypes";
const STORAGE_KEY_USER_EVENT_TYPES = "trackdaysFYI:userEventTypes";
const STORAGE_KEY_EMPTY_TRACKS = "trackdaysFYI:showEmptyTracks";
const STORAGE_KEY_WEEKDAYS = "trackdaysFYI:userWeekdays";
const STORAGE_KEY_HOSTS = "trackdaysFYI:userHosts";
const STORAGE_KEY_TRAVEL_RADIUS = "trackdaysFYI:travelRadius";
const STORAGE_KEY_HOME_LOCATION = "trackdaysFYI:homeLocation";
let savedEventsSet = (function () {
  try {
    let raw = localStorage.getItem(STORAGE_KEY_USER_SAVED_EVENTS);
    if (!raw) {return new Set();}
    let arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (e) {
    return new Set();
  }
})();

function persistSavedEvents() {
  localStorage.setItem(STORAGE_KEY_USER_SAVED_EVENTS, JSON.stringify([...savedEventsSet]));
}

function readStoredList(key) {
  try {
    let raw = localStorage.getItem(key);
    if (raw === null) return null;
    let arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : null;
  } catch (e) {
    return null;
  }
}

function persistWeekdays() {
  localStorage.setItem(STORAGE_KEY_WEEKDAYS, JSON.stringify([...selectedWeekdays()]));
}

function persistHosts() {
  let selected = Object.values(orgs).filter((org) => org.dropdownSelected).map((org) => org.orgNickname);
  localStorage.setItem(STORAGE_KEY_HOSTS, JSON.stringify(selected));
}

function persistRadius() {
  localStorage.setItem(STORAGE_KEY_TRAVEL_RADIUS, String(searchRadius));
}

function storedRadiusIndex() {
  let raw = localStorage.getItem(STORAGE_KEY_TRAVEL_RADIUS);
  if (raw === null) return null;
  let index = radiusValues.indexOf(Number(raw));
  return index === -1 ? null : index;
}

function storedHomeLocation() {
  let stored = readStoredList(STORAGE_KEY_HOME_LOCATION);
  if (!stored || stored.length !== 2) return null;
  let lat = Number(stored[0]);
  let lng = Number(stored[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return [lat, lng];
}

function persistHomeLocation(latlng) {
  localStorage.setItem(STORAGE_KEY_HOME_LOCATION, JSON.stringify([latlng.lat, latlng.lng]));
}

function clearStoredFilters() {
  localStorage.removeItem(STORAGE_KEY_EMPTY_TRACKS);
  localStorage.removeItem(STORAGE_KEY_WEEKDAYS);
  localStorage.removeItem(STORAGE_KEY_HOSTS);
  localStorage.removeItem(STORAGE_KEY_TRAVEL_RADIUS);
  localStorage.removeItem(STORAGE_KEY_HOME_LOCATION);
}

function applyStoredWeekdays() {
  let stored = readStoredList(STORAGE_KEY_WEEKDAYS);
  if (!stored) return;
  let selected = new Set(stored);
  Array.from(daySelectElement.options).forEach((opt) => {
    opt.selected = selected.has(opt.value);
  });
  daySelectElement.loadOptions();
}

function applyStoredHosts() {
  let stored = readStoredList(STORAGE_KEY_HOSTS);
  if (!stored) return;
  let selected = new Set(stored);
  Object.values(orgs).forEach((org) => {
    org.dropdownSelected = selected.has(org.orgNickname);
  });
}

function removePastSavedEvents() {
  let todayStr = dayjs().format("YYYY-MM-DD");
  let hasChanges = false;
  [...savedEventsSet].forEach((key) => {
    let [eventDate] = key.split("|");
    if (eventDate && eventDate < todayStr) {
      console.log(`Removing past saved event: ${key}`);
      savedEventsSet.delete(key);
      hasChanges = true;
    }
  });
  if (hasChanges) persistSavedEvents();
}
removePastSavedEvents();

let locationDefault = [39.50, -98.35];  // Central US or GPS location
let isGPSLocation = false;
let homeLocked = false;  // user moved the home pin or the travel radius
let searchRadius, minDate, maxDate;
let lastOpenedTrack, selectedMonth, selectedCalendarStart = null, selectedCalendarEnd = null;
let tracks;
const infiniteRadius = 0;
const radiusValues = [];
for (let miles = 50; miles <= 950; miles += 50) radiusValues.push(miles);
radiusValues.push(infiniteRadius);
const vehicleTypeMap = {"M": "Bike", "S": "Sumo", "C": "Car"};
const eventTypeMap = {"T": "TD", "S": "School", "R": "Race"};
const homeImgMoto = `<svg xmlns="http://www.w3.org/2000/svg" fill="#ff0000" viewBox="0 0 64 64"><path d="M53 44a9 9 0 0 0-7 3l-1-1h1v-1l13-6a4 4 0 0 0-1-2c2-2 2-5 2-5v-2h-2l-6 1-3 1-1-3s-6-6-12-8c2-1 2-3 2-7 0-6-5-12-12-12a12 12 0 0 0-13 14c-1 0 1 6 3 6 2 5 4 6 6 6l4-1v4l-2 1-1-2h-1c-5 0-9 2-12 6l-2 4 1 2 2 1a10 10 0 0 0-6 2h1a9 9 0 0 0 5 17c4 0 8-3 9-6a3 3 0 0 0 3 3l19-3h1v-2a9 9 0 0 0 0-1 15 15 0 0 1 0-1 9 9 0 0 0 0 1c0 5 4 9 10 9s9-4 9-9-4-9-9-9m-8-5c4-3 1-5 8-7h5s0 4-3 5c-7 4-12 4-12 4l2-2m-7 5a4 4 0 0 1 1 2l-2 2 1-4M25 25l-3 1c-2 0-3-2-4-4l10-6 2-2-2-2-2 1-11 2a8 8 0 0 1 0-1c0-5 5-10 11-10s10 5 10 10 0 5-7 9a255 255 0 0 0-4 2m-1 12 1-1 6-2a2 2 0 0 0 0-2v-2l4 4h-1l-4 1-2 1-2 2v1a70 70 0 0 0-2-1v-1m10-1-1 4h-2a45 45 0 0 0-3-1v-1l1-1 5-1m-14-3a1 1 0 0 1 2 0v2c1 2 1 2-2 3h-1l-1-1c-1-2 0-3 1-3l1-1m-4 20h2a6 6 0 0 1-1 3l-1-1a5 5 0 0 1-1 1h2a7 7 0 0 1-2 2l-1-2a5 5 0 0 1-1 1l1 2a7 7 0 0 1-2 0v-2h-1v2a7 7 0 0 1-2 0l1-2a5 5 0 0 1-1-1l-1 2a7 7 0 0 1-2-2h2a5 5 0 0 1-1-1l-2 1a6 6 0 0 1 0-3h2v-1H5a6 6 0 0 1 0-2l2 1 1-1-2-1a7 7 0 0 1 2-2l1 2a5 5 0 0 1 1 0l-1-2a7 7 0 0 1 2-1v2h1v-2a7 7 0 0 1 2 1l-2 3a3 3 0 0 0-1 0c-1 0-2 1-2 3s1 3 2 3c2 0 3-2 3-3l-1-2 2-3 2 1-2 1 1 1 1-1 1 2h-2v1m25 1v1l-18 2-1-1-1-8-3-2-8-6 1-3a12 12 0 0 1 7-5v1l-2 2-1 1c0 1-2 2 0 2l2 1a3 3 0 0 0 2 1l2-1a56 56 0 0 1 11 3l-1 6h-1a4 4 0 0 0-1 0l-1-1-6-4h-1l1 1 4 3 2 1-2 2 8 2c1 1 2 0 2-1v-1c3 0 2-2 4-2h2l-1 6m0-9-1-1 4-1a25 25 0 0 0 3-1l-2 1-4 2m8 2v1h-1l1-1m8 6h2a6 6 0 0 1 0 3l-2-1a5 5 0 0 1-1 1h2a7 7 0 0 1-2 2l-1-2-1 1 2 2a7 7 0 0 1-3 0v-2h-1v2a7 7 0 0 1-2 0l1-2a5 5 0 0 1-1-1l-1 2a7 7 0 0 1-2-2h2a5 5 0 0 1-1-1l-1 1a6 6 0 0 1-1-3h1l4 2a3 3 0 0 0 2 1l2-3c0-2-1-3-2-3l-3-1h1l-1-2a7 7 0 0 1 2-1v2h1c1 0 0 0 0 0v-2a7 7 0 0 1 2 1l-1 2h1l1-2a7 7 0 0 1 2 2l-2 1 1 1 2-1v2h-2v1"/></svg>`
const homeImgCar = `<svg xmlns="http://www.w3.org/2000/svg" fill="#ff0000" viewBox="0 0 64 64"><path d="M62 45.3 60 41l-5 3-.2-.2 4.8-2.9c1.6-1.2 1.6-4.3-.2-7-1.7-2.7-4.5-3.9-6.1-2.7L48.9 34l-.4.2c-.7.6-.9 1.9-.7 3.2l-.1-.1v-3.8l-4.4-7-2.6-1.6.5-.3c2-1.4 1.8-5-.2-8-2-3.2-5.2-4.6-7-3.2l-9 5.3.2 1.1-.7.4L19 18v-1.2l7.7-4-4-3.7L2 16.8l6.1 5.6 6.9-3.6v1.8l3.6 2.7-1.7 1-2.4-.6-3.6 2.1v.6l-5.4 3.2-.5.3c-2 1.4-1 6.5.7 9 1.7 2.6 3.9 4.2 5.8 4.2a3 3 0 0 0 1.8-.6l5.7-3.3a3 3 0 0 0 .4-.3 3.3 3.3 0 0 0 .9-1l5 3.8 6.5 1.5-.3.1c-1.8 1.3-.8 5.8.6 8 1.5 2.3 3.4 3.7 5.1 3.7a3 3 0 0 0 1.6-.5l4.7-2.8L49 54l13-8.7m-3.4-3 1.7 3.6-1 .8-2-3.7 1.3-.7M21.1 10l3.5 3.4-1.4.6-3.8-3.4 1.7-.6M10.9 20.5 5.2 16l2.4-.9 5 4.5-1.7.9M49.1 35a1.5 1.5 0 0 1 1-.3c1 0 2.5.8 3.8 2.7 1.5 2.3 1.4 4.8.4 5.6l-.3.2-1.5-1.4a1.2 1.2 0 0 0 .9-.2c.9-.7.8-2.3-.1-3.8-1-1.4-2.4-2-3.3-1.4-.6.5-.6 1.4-.2 2.4l1.4-.8c1-.5 2.1.8 1.5 1.7l-1.5.9-2.1-2c-.5-1.6-.5-3.2 0-3.6M49 47.7l-4 2.4c.6-1.2.6-2.8 0-4.5l3.9 2.1m-4-3.5-.3.2a10.4 10.4 0 0 0-.7-1.2 10.7 10.7 0 0 0-.5-.7c1-.5 2.1.7 1.5 1.7m-16.6-27 14.3 9.5 4.4 7-1.2.7-4.4-7-14.3-9.5 1.2-.7m9 13.6.4-.2c-.5 1.7-1.6 2.6-3.8 2.6-2.8 0-6.4-1.5-6.4-4.5s2.3-5.4 5.2-5.4a5 5 0 0 1 5 4.3c0-.2-.2-.2-.3-.2-2.9.2-6.7.1-6.8 1.2-.1 1.1 2.2 2.5 6.8 2.2M16 19.8v-1.6l2-1v1.4l11.5 4.5-3.4 1.6-10-4.8m-1.7 6c-.7-.3-1.5-.3-2.2-.2l1.1-.6 1.1.8m-3 16.2c-1.5 0-3.4-1.4-5-3.7-1.4-2.3-2.2-6.7-1-7.7.5-.2 1-.4 1.4-.4 1.8 0 3.9 1.5 5.3 3.7 2 3 2.2 6.5.5 7.7a2 2 0 0 1-1.2.4m13.7-6.3-4.7-3.3a11.5 11.5 0 0 0-2.6-4.3l9.6 6.4 11 4.4-1.7 1-11.6-4.2m12 18.2c-1.3 0-3-1.3-4.2-3.3-1.5-2.1-2-5.8-1-6.6l1.2-.3c1.5 0 3.3 1.3 4.5 3.2 1.7 2.6 2 5.6.5 6.7-.3.2-.6.3-1 .3m10-4.8 4.1 2.8-1 .8-4.4-2.8 1.4-.8"/><path d="M7 32.9c-1.2.8-.7 3 .5 4.8 1.2 1.9 2.7 2.7 3.8 1.9 1.2-.8 1.1-3 0-4.9C10 33 8 32 6.8 33m26.4 13c-1 .7-.6 2.6.5 4.2 1 1.7 2.4 2.4 3.4 1.7s1-2.7-.1-4.3c-1.1-1.6-2.8-2.4-3.8-1.7"/></svg>`
const homeIconMoto = new L.DivIcon({html: homeImgMoto, className: "", iconSize: [36, 36], iconAnchor: [18, 18]});
const homeIconCar = new L.DivIcon({html: homeImgCar, className: "", iconSize: [50, 50], iconAnchor: [25, 25]});

function getGPSLocation() {
  function setGPSLocation(position) {
    locationDefault = [position.coords.latitude, position.coords.longitude];
    isGPSLocation = true;
    // panning, filters, and the calendar can be reset; a moved pin or radius cannot
    if (tracks && !homeLocked) resetHome();
  }
  // timeout starts after the permission prompt, so a hung lookup cannot arrive much later
  navigator.geolocation?.getCurrentPosition(setGPSLocation, () => {}, {timeout: 10000});
}

function resetHome() {
  let savedHome = storedHomeLocation();
  let home = savedHome || locationDefault;
  homeMarker.setLatLng(home);
  searchCircle.setLatLng(home);
  map.setView(home, savedHome || isGPSLocation ? 6 : 3);
  radiusSliderElement.max = String(radiusValues.length - 1);
  let radiusIndex = storedRadiusIndex();
  if (radiusIndex === null) radiusIndex = isGPSLocation ? radiusValues.indexOf(200) : radiusValues.length - 1;
  radiusSliderElement.value = String(radiusIndex);
  new L.Popup(home, {"content": "<b>Drag Me</b>", "className": "dragMe", "autoPan": false, "closeButton": false, "offset": [0, 50]}).openOn(map);

  updateTrackDistances();
  updateSearchRadius(radiusValues[radiusSliderElement.value]);
  selectedMonth = undefined;  // updateCalendar updates to current month
  refresh({trackVisibility: true, popup: true, calendar: true, dropdown: true});
}

function milesBetween(lat1, lon1, lat2, lon2) {
  function deg2rad(deg) {return deg * (Math.PI/180);}
  let r = 6371;  // earth radius km
  lat1 = deg2rad(lat1);
  lat2 = deg2rad(lat2);
  let deltaLat = lat2 - lat1;
  let deltaLon = deg2rad(lon2 - lon1);
  let a = Math.pow(Math.sin(deltaLat / 2), 2) + Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin(deltaLon / 2), 2);
  let d = 2 * r * Math.asin(Math.sqrt(a));
  return d * 0.621371;
}

function updateTrackDistances() {
  let {lat, lng} = homeMarker.getLatLng();
  Object.keys(tracks).forEach((track) => {
    tracks[track]["dist"] = milesBetween(lat, lng, tracks[track].lat, tracks[track].lon);
  });
  trackdays.sort((a, b) => tracks[a.track].dist - tracks[b.track].dist);  // keep sorted for calendar order
}

function updateTrackIcons(updateTrackVisibility) {
  let allTracks = Object.keys(tracks);
  let tracksWithEvents = new Set(trackdays.filter(td => td.visibilityMap).map(td => td.track));

  if (updateTrackVisibility) {
    // visibilityMap already includes saved events. Empty Tracks also shows a matching vehicle with nothing listed.
    let showEmpty = showTracksWithoutEventsToggleElement.classList.contains("on");
    allTracks.forEach(track => {
      let matchingVehicleType = [...tracks[track].vehicleType].some(t => selectedVehicleTypes.has(t));
      let show = tracksWithEvents.has(track) || (showEmpty && matchingVehicleType);
      show ? mapMarkers[track].addTo(map) : mapMarkers[track].remove();
    });
  }

  let tracksWithSavedEvents = new Set();
  if (savedEventsSet.size) {
    trackdays.forEach((td) => {
      if (savedEventsSet.has(getEventKey(td))) tracksWithSavedEvents.add(td.track);
    });
  }
  allTracks.forEach((track) => {
    let withinRadius = (searchRadius === infiniteRadius || tracks[track].dist <= searchRadius);
    let containsSavedEvent = tracksWithSavedEvents.has(track);
    let opacityMultiplier = tracksWithEvents.has(track) ? 1.0 : 0.35;
    let inside = withinRadius || containsSavedEvent;
    let icon = inside ? trackIconCheckered : trackIconRed;
    let opacity = (inside ? 0.8 : 0.6) * opacityMultiplier;
    let marker = mapMarkers[track];
    if (marker.options.icon !== icon) marker.setIcon(icon);
    if (marker.options.opacity !== opacity) marker.setOpacity(opacity);
  });
}

function updateSearchRadius(radiusMiles) {
  searchRadius = radiusMiles;
  searchCircle.setRadius(searchRadius * 1609.34);
  document.getElementById("displayedRadius").innerText = (searchRadius === infiniteRadius ? `∞` : `${searchRadius}`);
}

// minDate and maxDate are padded, so these exclusive comparisons include the chosen days
// an invalid bound means that side is open
function dateInRange(date) {
  let afterMin = !minDate.isValid() || date.isAfter(minDate);
  let beforeMax = !maxDate.isValid() || date.isBefore(maxDate);
  return afterMin && beforeMax;
}

function selectedWeekdays() {
  return new Set(Array.from(daySelectElement.options).filter(option => option.selected).map(option => option.value));
}

function trackWithinRadius(trackKey) {
  return searchRadius === infiniteRadius || tracks[trackKey].dist <= searchRadius;
}

// opts toggles which checks apply: radius, date, day, org, vehicle, event
function passesFilters(td, opts = {}) {
  if (opts.radius && !trackWithinRadius(td.track)) return false;
  if (opts.date && !dateInRange(td.date)) return false;
  if (opts.day) {
    let days = opts.selectedDays || selectedWeekdays();
    if (!days.has(dayjs(td.date).format("ddd"))) return false;
  }
  if (opts.org && !orgs[td.org].dropdownSelected) return false;
  if (opts.vehicle && ![...td.vehicleType].some(t => selectedVehicleTypes.has(t))) return false;
  if (opts.event && ![...td.eventType].some(t => selectedEventTypes.has(t))) return false;
  return true;
}

function updateTrackdaysVisibilityProperty() {
  let selectedDays = selectedWeekdays();
  trackdays.forEach((td) => {
    let withinRadius = trackWithinRadius(td.track);
    let core = passesFilters(td, {date: true, day: true, org: true, vehicle: true, event: true, selectedDays});
    let isSaved = savedEventsSet.has(getEventKey(td));
    td.visibilityDropdown = passesFilters(td, {radius: true, vehicle: true, event: true});
    // saved events intentionally skip most filters (radius, price, date, weekday, host, vehicle type, event type)
    td.visibilityMap = isSaved || core;
    td.visibilityCalendar = isSaved || (core && withinRadius);
  });
}

function getEventKey(td) {  // string identifying a specific event
  return [td.date.format("YYYY-MM-DD"), td.org, td.track, td.subtrack, td.eventType, td.vehicleType].join("|");
}

function onEventSaveToggle(btn) {
  let key = decodeURIComponent(btn.getAttribute("data-event-key"));
  let nowSaved = !savedEventsSet.has(key);
  if (nowSaved) {
    savedEventsSet.add(key);
  } else {
    savedEventsSet.delete(key);
  }
  persistSavedEvents();
  btn.setAttribute("aria-pressed", nowSaved ? "true" : "false");
  btn.title = nowSaved ? "Unsave Event" : "Save Event";
  btn.setAttribute("aria-label", nowSaved ? "Unsave Event" : "Save Event");
  let item = btn.closest(".event-item");
  if (item) item.classList.toggle("is-saved", nowSaved);
  if (typeof trackdays !== "undefined") {
    // do not refresh the open popup, so an accidental unsave can be checked again
    refresh({trackVisibility: true, calendar: true});
  }
}

function alertOnMissingSavedEvents() {
  if (typeof trackdays === "undefined") {return;}
  let currentEventKeys = new Set(trackdays.map(td => getEventKey(td)));
  let unmatchedSavedEvents = [...savedEventsSet].filter(key => !currentEventKeys.has(key));
  if (unmatchedSavedEvents.length === 0) {return;}
  let eventList = unmatchedSavedEvents
    .map((key) => {
      let [date, org, track] = key.split("|");
      return `${date} | ${track} | ${org}`;
    })
    .join("\n");
  alert(`Previously saved events have been cancelled or modified:\n${eventList}`);
  unmatchedSavedEvents.forEach((key) => {savedEventsSet.delete(key);});
  persistSavedEvents();
}

function escapeICSValue(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")  // escape backslash
    .replace(/\r?\n/g, "\\n")  // escape newline
    .replace(/,/g, "\\,")  // escape commas
    .replace(/;/g, "\\;");  // escape semicolon
}

function foldICSLine(line) {
  // RFC 5545: fold at 75 octets. A continuation line starts with one space.
  const maxOctets = 75;
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= maxOctets) return line;
  let folded = "";
  let budget = maxOctets;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (size > budget) {
      folded += "\r\n ";
      budget = maxOctets - 1;
    }
    folded += char;
    budget -= size;
  }
  return folded;
}

function downloadSavedEventsICS() {
  if (typeof trackdays === "undefined") return;
  let savedEvents = trackdays
    .filter(td => savedEventsSet.has(getEventKey(td)))
    .sort((a, b) => (a.date > b.date ? 1 : -1));
  if (savedEvents.length === 0) {
    alert("No saved events to export.\nStar events to save them.");
    return;
  }

  let nowStamp = dayjs.utc().format("YYYYMMDDTHHmmss[Z]");
  let lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Trackdays.fyi//Saved Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH"
  ];

  savedEvents.forEach((td) => {
    let startDate = td.date.format("YYYYMMDD");
    let endDate = td.date.add(1, "day").format("YYYYMMDD");
    let track = tracks[td.track];
    let summary = `${track.nickname} - ${td.org}`;
    let eventType = [...td.eventType].map(t => eventTypeMap[t]).join("/");
    let vehicleType = [...td.vehicleType].map(t => vehicleTypeMap[t]).join("/");
    let descriptionParts = [
      `Track: ${track.name}`,
      td.subtrack ? `Circuit: ${td.subtrack}` : "",
      eventType ? `Type: ${eventType}` : "",
      vehicleType ? `Vehicle: ${vehicleType}` : "",
      td.price >= 0 ? `Price: $${td.price}` : "",
      td.note ? `Note: ${td.note}` : "",
      `Link: ${td.url}`,
      `[Generated by https://trackdays.fyi]`
    ].filter(Boolean);

    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeICSValue(getEventKey(td))}@trackdays.fyi`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART;VALUE=DATE:${startDate}`,
      `DTEND;VALUE=DATE:${endDate}`,
      `SUMMARY:${escapeICSValue(summary)}`,
      `LOCATION:${escapeICSValue(track.name)}`,
      `DESCRIPTION:${escapeICSValue(descriptionParts.join("\n"))}`,
      `URL:${escapeICSValue(td.url)}`,
      "END:VEVENT"
    );
  });
  lines.push("END:VCALENDAR");

  let icsBlob = new Blob([lines.map(foldICSLine).join("\r\n")], {type: "text/calendar;charset=utf-8"});
  let fileName = `trackdaysFYI-saved-events-${dayjs().format("YYYYMMDD")}.ics`;
  let url = URL.createObjectURL(icsBlob);
  let link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const TRACKDAYS_URL = "https://atqtpmna66.execute-api.us-east-1.amazonaws.com/getTrackdays";

function hiddenEventNote(hidden) {
  // Only name a filter when it is off and one of these events is actually that kind.
  // Two reasons still read clearly. More than that collapses back to a generic line.
  let days = selectedWeekdays();
  let reasons = new Set();
  let addVehicle = (td, code, label) => {
    let types = [...td.vehicleType];
    if (types.some(t => selectedVehicleTypes.has(t))) return;
    if (types.includes(code) && !selectedVehicleTypes.has(code)) reasons.add(label);
  };
  let addEvent = (td, code, label) => {
    let types = [...td.eventType];
    if (types.some(t => selectedEventTypes.has(t))) return;
    if (types.includes(code) && !selectedEventTypes.has(code)) reasons.add(label);
  };
  hidden.forEach((td) => {
    addVehicle(td, "C", "car");
    addVehicle(td, "M", "motorcycle");
    addVehicle(td, "S", "supermoto");
    addEvent(td, "T", "trackday");
    addEvent(td, "S", "school");
    addEvent(td, "R", "race");
    if (!dateInRange(td.date)) reasons.add("date");
    if (!days.has(td.date.format("ddd"))) reasons.add("weekday");
    if (orgs[td.org] && !orgs[td.org].dropdownSelected) reasons.add("host");
  });
  let n = hidden.length;
  let noun = n === 1 ? "event" : "events";
  let ordered = ["car", "motorcycle", "supermoto", "trackday", "school", "race", "date", "weekday", "host"].filter(label => reasons.has(label));
  if (ordered.length === 1) return `${n} ${ordered[0]} ${noun} filtered`;
  if (ordered.length === 2) return `${n} ${ordered[0]} and ${ordered[1]} ${noun} filtered`;
  return `${n} ${noun} filtered`;
}

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

function syncOpenPopup(popup) {
  if (!popup || !popup.isOpen()) return;
  fitPopupToMap(popup);
  popup.update();
  fitPopupHosts(popup);
  bindPopupFade(popup);
  let scroll = popup.getElement()?.querySelector(".popup-timeline .tl-scroll");
  if (scroll) syncPopupFade(scroll);
}

function popupList(inner, foot) {
  return `<div class="tl-scroll-wrap"><div class="tl-scroll">${inner}</div><div class="tl-fade" hidden></div></div><div class="tl-foot">${foot}</div>`;
}

function updateTrackPopup() {
  if (lastOpenedTrack === undefined) {return;}
  let track = tracks[lastOpenedTrack];
  let trackdaysAtTrack = trackdays.filter(td => td.track === lastOpenedTrack);
  let trackdaysFiltered = trackdaysAtTrack.filter(td => td.visibilityMap);
  let hiddenTrackdays = trackdaysAtTrack.filter(td => !td.visibilityMap);
  let numTrackdaysHidden = hiddenTrackdays.length;
  let multipleVehicleTypes = (selectedVehicleTypes.size > 1);
  let multipleEventTypes = trackdaysFiltered.some(td => td.eventType != "T") && (selectedEventTypes.size > 1);
  const eventLabel = {"T": "Trackday", "S": "School", "R": "Race"};
  function rowMain(td, meta, price, mark) {
    let copy = `<span class="tl-copy"><span class="tl-dow">${td.date.format("ddd")}</span><span class="tl-host allowSelect">${escapeHtml(td.org)}</span>${meta ? `<span class="tl-meta">${meta}</span>` : ""}${price ? `<span class="tl-price">${price}</span>` : ""}</span>`;
    let eventUrl = safeHttpUrl(td.url);
    if (eventUrl) return `<a class="tl-row-link" href="${escapeHtml(eventUrl)}" target="_blank" rel="noopener">${mark}${copy}</a>`;
    return `<div class="tl-row-link">${mark}${copy}</div>`;
  }
  function saveBox(eventKey) {
    let saved = savedEventsSet.has(eventKey);
    return `<button type="button" class="event-save-star" title="${saved ? "Unsave Event" : "Save Event"}" aria-label="${saved ? "Unsave Event" : "Save Event"}" aria-pressed="${saved ? "true" : "false"}" data-event-key="${encodeURIComponent(eventKey)}" data-popup-action="save-event"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6l2.5 5.1 5.6.8-4 3.9.9 5.6L12 16.8 7 19l.9-5.6-4-3.9 5.6-.8z"/></svg></button>`;
  }
  function money(td) {
    return td.price >= 0 ? "$" + escapeHtml(td.price) : "";
  }
  function detailText(td) {
    let bits = [];
    if (multipleVehicleTypes) bits.push([...td.vehicleType].map(t => vehicleTypeMap[t]).join("/"));
    if (multipleEventTypes) bits.push([...td.eventType].map(t => eventLabel[t] || t).join("/"));
    if (td.subtrack) bits.push(td.subtrack);
    if (td.note) bits.push(td.note);
    return bits.map(bit => escapeHtml(bit)).join(" · ");
  }
  let directionsUrl = "https://www.google.com/maps?q=" + encodeURIComponent("directions " + track.name);
  let weatherUrl = "https://www.google.com/search?q=" + encodeURIComponent("weather " + track.name);
  let nickname = track.showNickname ? ` (${escapeHtml(track.nickname)})` : "";
  let hiddenNote = numTrackdaysHidden ? `<span class="hidden-note">${hiddenEventNote(hiddenTrackdays)}</span>` : "";
  let head = `<div class="popup-head"><b class="allowSelect">${escapeHtml(track.name)}${nickname}</b><div class="popup-links"><a href="${escapeHtml(directionsUrl)}" target="_blank" rel="noopener" title="Directions">${directionImg}</a><a href="${escapeHtml(weatherUrl)}" target="_blank" rel="noopener" title="Weather">${weatherImg}</a></div></div>`;
  let lastDate = "";
  let rows = trackdaysFiltered.map((td) => {
    let eventKey = getEventKey(td);
    let saved = savedEventsSet.has(eventKey) ? " is-saved" : "";
    let dateKey = td.date.format("YYYY-MM-DD");
    let showDate = dateKey !== lastDate;
    lastDate = dateKey;
    let meta = detailText(td);
    let price = money(td);
    let mark = `<span class="tl-mark"><span class="tl-date">${showDate ? escapeHtml(td.date.format("MMM D")) : ""}</span><span class="tl-dot"></span></span>`;
    return `<div class="event-item tl-item${saved}">${rowMain(td, meta, price, mark)}${saveBox(eventKey)}</div>`;
  }).join("");
  let list = trackdaysFiltered.length === 0 ? `<div class="empty">No Events Found</div>` : `<div class="tl">${rows}</div>`;
  let report = `<button type="button" class="missing-event-link" data-popup-action="missing-event">Missing an event?</button>`;
  let eventsBody = popupList(list, hiddenNote + report);
  let tabs = `<div class="rec-tabs"><button type="button" class="${recordsUi.open ? "" : "on"}" data-popup-action="records-tab" data-open="0">Events</button><button type="button" class="${recordsUi.open ? "on" : ""}" data-popup-action="records-tab" data-open="1">Records</button></div>`;
  let body = recordsUi.open ? recordsListHtml(lastOpenedTrack) : eventsBody;
  let popup = mapMarkers[lastOpenedTrack].getPopup();
  popup.setContent(`<div class="popup popup-timeline">${head}${tabs}${body}</div>`);
  if (popup.isOpen()) syncOpenPopup(popup);
}

function updateCalendar() {
  if (selectedMonth === undefined) {
    selectedMonth = dayjs().startOf("month").toDate();
  }
  // trackdays should be sorted by distance before this
  renderCalendarView();
  updatePillCounts();
  if (dateRangePopover && !dateRangePopover.hidden) renderDateRangePopover();
}

function shiftSelectedMonth(delta) {
  if (selectedMonth === undefined) return;
  selectedMonth = dayjs(selectedMonth).startOf("month").add(delta, "month").toDate();
}

function updatePillCounts() {
  if (typeof trackdays === "undefined" || typeof tracks === "undefined") return;
  let selectedDays = selectedWeekdays();
  let shared = trackdays.filter(td => passesFilters(td, {radius: true, date: true, day: true, org: true, selectedDays}));
  let hasVehicle = (td, code) => [...td.vehicleType].includes(code);
  let hasEvent = (td, code) => [...td.eventType].includes(code);
  let vehicleMatch = (td) => [...td.vehicleType].some(t => selectedVehicleTypes.has(t));
  let eventMatch = (td) => [...td.eventType].some(t => selectedEventTypes.has(t));
  document.getElementById("countCar").textContent = shared.filter(td => hasVehicle(td, "C") && eventMatch(td)).length;
  document.getElementById("countMoto").textContent = shared.filter(td => hasVehicle(td, "M") && eventMatch(td)).length;
  document.getElementById("countSumo").textContent = shared.filter(td => hasVehicle(td, "S") && eventMatch(td)).length;
  document.getElementById("countTrackdays").textContent = shared.filter(td => hasEvent(td, "T") && vehicleMatch(td)).length;
  document.getElementById("countSchools").textContent = shared.filter(td => hasEvent(td, "S") && vehicleMatch(td)).length;
  document.getElementById("countRaces").textContent = shared.filter(td => hasEvent(td, "R") && vehicleMatch(td)).length;
  let tracksWithEvents = new Set(trackdays.filter(td => td.visibilityCalendar).map(td => td.track));
  document.getElementById("countEmpty").textContent = Object.keys(tracks).filter((track) => {
    return trackWithinRadius(track) && !tracksWithEvents.has(track);
  }).length;
}

function updateDropdown() {
  let visibleOrgs = new Set(trackdays.filter(td => td.visibilityDropdown).map(td => td.org));
  // delete and recreate options so orgs are alphabetical
  orgSelectElement.options.length = 0;
  Object.values(orgs).filter(org => org.numEvents > 0).forEach((org) => {
    if (visibleOrgs.has(org.orgNickname)) {
      org.dropdownOption.selected = org.dropdownSelected;
      orgSelectElement.add(org.dropdownOption);
    }
  });
  orgSelectElement.loadOptions();
}

function refresh({trackVisibility = false, popup = false, calendar = false, dropdown = false} = {}) {
  updateTrackdaysVisibilityProperty();
  updateTrackIcons(trackVisibility);
  if (popup) updateTrackPopup();
  if (calendar) updateCalendar();
  if (dropdown) updateDropdown();
}

function applyCalendarBounds() {
  // exclusive comparisons: pad the start back 1s and the end forward 1 minute so those midnights are included
  if (selectedCalendarStart && selectedCalendarEnd) {
    minDate = dayjs(selectedCalendarStart, "YYYY-MM-DD", true).subtract(1, "s");
    maxDate = dayjs(selectedCalendarEnd, "YYYY-MM-DD", true).add(1, "minute");
  } else {
    minDate = dayjs().startOf("day").subtract(1, "s");
    maxDate = dayjs("", "YYYY-MM-DD", true);
  }
  let button = document.getElementById("dateRangeButton");
  if (!button) return;
  let label = dateRangeButtonLabel();
  button.textContent = label;
  let custom = !!(selectedCalendarStart && selectedCalendarEnd);
  button.classList.toggle("is-set", custom);
  button.setAttribute("aria-label", custom ? `Date range, ${label}` : `Date range, ${label}`);
}

let showSyncInfo = false;
function toggleSyncInfo() {
  if (showSyncInfo) {
    document.getElementById("syncInfo").innerHTML = "";
    showSyncInfo = false;
  } else {
    let tbody = Object.values(orgs).map(org => {
      let orgUrl = safeHttpUrl(org.url);
      let name = escapeHtml(org.org);
      let nameCell = orgUrl ? `<a href="${escapeHtml(orgUrl)}" target="_blank" rel="noopener">${name}</a>` : name;
      return `
      <tr>
        <td>${nameCell}</td>
        <td>${org.numEvents}</td>
        <td>${dayjs().to(org.syncTimeUTC)}</td>
      </tr>
    `}).join("");
    let tbl = `
      <div class="sync-columns">
        <table class="center gray sync-table">
          <thead><tr>
            <th>Host</th>
            <th>Events</th>
            <th>Last Sync</th>
          </tr></thead>
          <tbody>${tbody}</tbody>
        </table>
      </div>`;
    document.getElementById("syncInfo").innerHTML = "<hr>" + tbl;
    showSyncInfo = true;
  }
}

function wirePopupActions() {
  // capture: Leaflet stopPropagation on popups blocks bubble to document
  document.addEventListener("click", (event) => {
    let el = event.target.closest("[data-popup-action]");
    if (!el || !el.closest(".leaflet-popup")) return;
    let action = el.dataset.popupAction;
    if (action === "save-event") onEventSaveToggle(el);
    else if (action === "missing-event") reportMissingEvent();
    else if (action === "records-tab") setRecordsOpen(el.dataset.open === "1");
    else if (action === "add-record") openRecordForm();
  }, true);
}
wirePopupActions();
document.getElementById("lastSyncMessage").addEventListener("click", (event) => {
  event.preventDefault();
  toggleSyncInfo();
});

document.getElementById("calendar").addEventListener("click", (event) => {
  let star = event.target.closest(".event-save-star");
  if (star) {
    event.preventDefault();
    onEventSaveToggle(star);
    return;
  }
  if (event.target.closest("[data-cal-show-month]")) {
    setCalendarRange(null, null);
    refresh({trackVisibility: true, popup: true, calendar: true});
    return;
  }
  let nav = event.target.closest("[data-month-delta]");
  if (!nav) return;
  shiftSelectedMonth(Number(nav.dataset.monthDelta));
  updateCalendar();
}, true);

function setCalendarRange(start, end) {
  if (!start || !end) {
    selectedCalendarStart = null;
    selectedCalendarEnd = null;
  } else if (start <= end) {
    selectedCalendarStart = start;
    selectedCalendarEnd = end;
  } else {
    selectedCalendarStart = end;
    selectedCalendarEnd = start;
  }
  applyCalendarBounds();
}

function paintCalendarRange(start, end) {
  let lo = null;
  let hi = null;
  if (start && end) {
    lo = start < end ? start : end;
    hi = start < end ? end : start;
  }
  document.querySelectorAll("#dateRangeScroll [data-cal-day]").forEach((day) => {
    let on = lo !== null && day.dataset.calDay >= lo && day.dataset.calDay <= hi;
    day.classList.toggle("is-selected", on);
    day.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

let dateRangeButton = document.getElementById("dateRangeButton");
let dateRangePopover = document.getElementById("dateRangePopover");
let dateRangeScroll = document.getElementById("dateRangeScroll");
let dateDrag = null;
let dateDragPoint = null;
let dateDragScrollRaf = 0;

function updateDateRangeHint() {
  let hint = document.getElementById("dateRangeHint");
  if (hint) hint.textContent = pendingCalendarDay ? "Select an end date" : "Select a start and end";
}

function paintCurrentSelection() {
  if (pendingCalendarDay) paintCalendarRange(pendingCalendarDay, pendingCalendarDay);
  else paintCalendarRange(selectedCalendarStart, selectedCalendarEnd);
}

function dateDayAt(x, y) {
  for (let el of document.elementsFromPoint(x, y)) {
    if (!el.closest) continue;
    let day = el.closest("[data-cal-day]");
    if (day && dateRangeScroll.contains(day)) return day.dataset.calDay;
  }
  return null;
}

function stopDateDragScroll() {
  if (!dateDragScrollRaf) return;
  cancelAnimationFrame(dateDragScrollRaf);
  dateDragScrollRaf = 0;
}

function tickDateDragScroll() {
  dateDragScrollRaf = 0;
  if (!dateDrag || dateDrag.pointerType === "touch" || !dateDragPoint) return;
  let box = dateRangeScroll.getBoundingClientRect();
  let zone = 36;
  let y = dateDragPoint.y;
  let delta = 0;
  if (y < box.top + zone) delta = -Math.ceil((box.top + zone - y) / 2);
  else if (y > box.bottom - zone) delta = Math.ceil((y - (box.bottom - zone)) / 2);
  if (!delta) return;
  delta = Math.max(-18, Math.min(18, delta));
  let before = dateRangeScroll.scrollTop;
  dateRangeScroll.scrollTop += delta;
  if (dateRangeScroll.scrollTop === before) return;
  let key = dateDayAt(dateDragPoint.x, dateDragPoint.y);
  if (key && key !== dateDrag.current) {
    if (key !== dateDrag.anchor) dateDrag.moved = true;
    dateDrag.current = key;
    paintCalendarRange(dateDrag.anchor, dateDrag.current);
  }
  dateDragScrollRaf = requestAnimationFrame(tickDateDragScroll);
}

function scheduleDateDragScroll() {
  if (dateDragScrollRaf) return;
  dateDragScrollRaf = requestAnimationFrame(tickDateDragScroll);
}

function revealDateDay(el, center) {
  let scrollerBox = dateRangeScroll.getBoundingClientRect();
  let elBox = el.getBoundingClientRect();
  let above = elBox.top < scrollerBox.top;
  let below = elBox.bottom > scrollerBox.bottom;
  if (!center && !above && !below) return;
  let delta = elBox.top - scrollerBox.top - (dateRangeScroll.clientHeight - elBox.height) / 2;
  dateRangeScroll.scrollTop += delta;
}

function closeDateRange(opts = {}) {
  pendingCalendarDay = null;
  stopDateDragScroll();
  dateDrag = null;
  dateDragPoint = null;
  dateRangePopover.classList.remove("is-dragging");
  dateRangePopover.hidden = true;
  dateRangeButton.setAttribute("aria-expanded", "false");
  updateDateRangeHint();
  if (opts.focusButton) dateRangeButton.focus();
}

function openDateRange() {
  pendingCalendarDay = null;
  renderDateRangePopover();
  dateRangePopover.hidden = false;
  dateRangeButton.setAttribute("aria-expanded", "true");
  updateDateRangeHint();
  let key = selectedCalendarStart || dayjs().format("YYYY-MM-DD");
  let el = dateRangeScroll.querySelector(`[data-cal-day="${key}"]`) || dateRangeScroll.querySelector("[data-cal-day]");
  if (!el) return;
  dateRangeScroll.querySelectorAll("[data-cal-day]").forEach((day) => {day.tabIndex = day === el ? 0 : -1;});
  revealDateDay(el, true);
  el.focus({preventScroll: true});
}

function commitCalendarRange(start, end) {
  pendingCalendarDay = null;
  setCalendarRange(start, end);
  closeDateRange({focusButton: true});
  if (typeof trackdays === "undefined") return;
  refresh({trackVisibility: true, popup: true, calendar: true});
}

function swallowNextClick() {
  let stop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    cleanup();
  };
  let cleanup = () => {
    document.removeEventListener("click", stop, true);
    clearTimeout(timer);
  };
  document.addEventListener("click", stop, true);
  let timer = setTimeout(cleanup, 500);
}

function onDateClick(key) {
  if (!pendingCalendarDay) {
    pendingCalendarDay = key;
    setCalendarRange(key, key);
    updateDateRangeHint();
    if (typeof trackdays !== "undefined") refresh({trackVisibility: true, popup: true, calendar: true});
    else paintCalendarRange(key, key);
    let el = dateRangeScroll.querySelector(`[data-cal-day="${key}"]`);
    if (el) {
      dateRangeScroll.querySelectorAll("[data-cal-day]").forEach((day) => {day.tabIndex = day === el ? 0 : -1;});
      el.focus({preventScroll: true});
    }
    return;
  }
  commitCalendarRange(pendingCalendarDay, key);
}

function moveDateFocus(day, deltaDays) {
  let bounds = selectableDateBounds();
  let next = dayjs(day.dataset.calDay, "YYYY-MM-DD", true).add(deltaDays, "day");
  if (next.isBefore(bounds.min, "day") || next.isAfter(bounds.max, "day")) return;
  let el = dateRangeScroll.querySelector(`[data-cal-day="${next.format("YYYY-MM-DD")}"]`);
  if (!el) return;
  day.tabIndex = -1;
  el.tabIndex = 0;
  el.focus({preventScroll: true});
  revealDateDay(el, false);
}

dateRangeButton.addEventListener("click", () => {
  if (dateRangePopover.hidden) openDateRange();
  else closeDateRange();
});

document.getElementById("dateRangeClear").addEventListener("click", () => {
  pendingCalendarDay = null;
  setCalendarRange(null, null);
  updateDateRangeHint();
  if (!dateRangePopover.hidden) renderDateRangePopover();
  if (typeof trackdays === "undefined") return;
  refresh({trackVisibility: true, popup: true, calendar: true});
});

document.addEventListener("pointerdown", (event) => {
  if (dateRangePopover.hidden) return;
  if (dateRangePopover.contains(event.target) || dateRangeButton.contains(event.target)) return;
  closeDateRange();
}, true);

document.addEventListener("keydown", (event) => {
  if (dateRangePopover.hidden || event.key !== "Escape") return;
  event.preventDefault();
  closeDateRange({focusButton: true});
});

dateRangePopover.addEventListener("keydown", (event) => {
  let day = event.target.closest("[data-cal-day]");
  if (!day) return;
  let delta = {ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7}[event.key];
  if (delta) {
    event.preventDefault();
    moveDateFocus(day, delta);
    return;
  }
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onDateClick(day.dataset.calDay);
  }
});

dateRangePopover.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  let day = event.target.closest("[data-cal-day]");
  if (!day || !dateRangeScroll.contains(day)) return;
  dateDrag = {
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    anchor: day.dataset.calDay,
    current: day.dataset.calDay,
    moved: false,
    originX: event.clientX,
    originY: event.clientY,
  };
  dateDragPoint = {x: event.clientX, y: event.clientY};
  if (event.pointerType === "touch") return;
  dateRangePopover.classList.add("is-dragging");
  try {dateRangePopover.setPointerCapture(event.pointerId);} catch (e) {}
  event.preventDefault();
  paintCalendarRange(dateDrag.anchor, dateDrag.anchor);
});

dateRangePopover.addEventListener("pointermove", (event) => {
  if (!dateDrag || event.pointerId !== dateDrag.pointerId || dateDrag.pointerType === "touch") return;
  dateDragPoint = {x: event.clientX, y: event.clientY};
  let key = dateDayAt(event.clientX, event.clientY);
  if (key && key !== dateDrag.current) {
    if (key !== dateDrag.anchor) dateDrag.moved = true;
    dateDrag.current = key;
    if (dateDrag.moved) paintCalendarRange(dateDrag.anchor, key);
  }
  if (Math.hypot(event.clientX - dateDrag.originX, event.clientY - dateDrag.originY) > 4) scheduleDateDragScroll();
});

dateRangePopover.addEventListener("pointerup", (event) => {
  if (!dateDrag || event.pointerId !== dateDrag.pointerId) return;
  stopDateDragScroll();
  let drag = dateDrag;
  dateDrag = null;
  dateDragPoint = null;
  dateRangePopover.classList.remove("is-dragging");
  if (drag.pointerType === "touch") {
    let travel = Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY);
    if (travel > 10) {
      paintCurrentSelection();
      return;
    }
    swallowNextClick();
    onDateClick(drag.anchor);
  } else if (drag.moved) commitCalendarRange(drag.anchor, drag.current);
  else onDateClick(drag.anchor);
});

dateRangePopover.addEventListener("pointercancel", (event) => {
  if (!dateDrag || event.pointerId !== dateDrag.pointerId) return;
  stopDateDragScroll();
  dateDrag = null;
  dateDragPoint = null;
  dateRangePopover.classList.remove("is-dragging");
  paintCurrentSelection();
});

const headerAd = document.getElementById("fotosort-ad");
if (localStorage.getItem("headerAdClosed")) {
  headerAd.hidden = true;
}
document.getElementById("close-ad").addEventListener("click", function () {
  headerAd.hidden = true;
  localStorage.setItem("headerAdClosed", "true");
});

let map = new L.Map("map", {doubleClickZoom: false, boxZoom: false, minZoom: 3, maxZoom: 15, worldCopyJump: true});
let tiles = new L.TileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", 
  {attribution: `<a class="map-attribution" href="http://www.openstreetmap.org/copyright">&copy; OpenStreetMap</a>`}
).addTo(map);
map.attributionControl.setPrefix("");

let homeMarker = new L.Marker(locationDefault, {title: "Home", icon: homeIconMoto, opacity: 0.9, draggable: true, autoPan: true, autoPanSpeed: 1, zIndexOffset: 1000}).addTo(map);
let searchCircle = new L.Circle(locationDefault, {stroke: true, color: "#ff0000", opacity: 0.4, dashArray: "4", fill: false, interactive: false, radius: infiniteRadius}).addTo(map);

let showCarEventsButton = document.getElementById("showCarEvents");
let showMotoEventsButton = document.getElementById("showMotoEvents");
let showSumoEventsButton = document.getElementById("showSumoEvents");
let orgSelectElement = document.getElementById("orgSelect");
let radiusSliderElement = document.getElementById("radiusSlider");
let daySelectElement = document.getElementById("daySelect");
let showTracksWithoutEventsToggleElement = document.getElementById("showTracksWithoutEvents");
let showTrackdaysToggleElement = document.getElementById("showTrackdays");
let showSchoolsToggleElement = document.getElementById("showSchools");
let showRacesToggleElement = document.getElementById("showRaces");
let exportSavedEventsElement = document.getElementById("exportSavedEvents");
let resetElement = document.getElementById("resetFilters");

orgSelectElement.style.display = "block";
MultiselectDropdown();

applyCalendarBounds();

const checkeredFlagImg = `<svg xmlns="http://www.w3.org/2000/svg" fill="#000000" viewBox="0 0 24 24"><path d="M4 2v18H3v2h4v-2H6v-5h13a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H6V2H4zm4 3v2h2V5h2v2h2V5h2v2h2v2h-2v2h2v2h-2v-2h-2v2h-2v-2h-2v2H8v-2H6V9h2V7H6V5h2z"/><path d="M8 9h2v2H8zm4 0h2v2h-2zm-2-2h2v2h-2zm4 0h2v2h-2z"/></svg>`;
const directionImg = `<svg xmlns="http://www.w3.org/2000/svg" width="22px" height="22px" viewBox="0 0 24 24"><path d="m2.3 12.7 9 9c.4.4 1 .4 1.4 0l9-9a1 1 0 0 0 0-1.4l-9-9a1 1 0 0 0-1.4 0l-9 9a1 1 0 0 0 0 1.4zM9 10h5V8l3 3-3 3v-2h-3v4H9v-6z"/></svg>`;
const weatherImg = `<svg xmlns="http://www.w3.org/2000/svg" width="22px" height="22px" viewBox="0 0 24 24"><path d="M7 12a5 5 0 1 0 10 0 5 5 0 0 0-10 0zm4 7h2v3h-2zm0-17h2v3h-2zm-9 9h3v2H2zm17 0h3v2h-3zM5.6 19.8l-1.4-1.4 2.1-2.2 1.5 1.5zM16.2 6.3l2.2-2 1.4 1.3-2.1 2.2zM6.3 7.8l-2-2.2 1.3-1.4 2.2 2.1zm13.5 10.6-1.4 1.4-2.2-2.1 1.5-1.5z"/></svg>`;

const trackIconCheckered = new L.DivIcon({html: checkeredFlagImg, className: "", iconSize: [32, 32], iconAnchor: [6, 24], popupAnchor: [10, -20]});
const trackIconRed = new L.DivIcon({html: checkeredFlagImg.replace("#000000", "#ff0000"), className: "", iconSize: [32, 32], iconAnchor: [6, 24], popupAnchor: [10, -20]});

let orgs, trackdays;
let selectedVehicleTypes = new Set();
let selectedEventTypes = new Set();
let mapMarkers = new Object();

async function fetchAndNormalizeTrackdays() {
  const res = await fetch(TRACKDAYS_URL);
  if (!res.ok) throw new Error("unable to retrieve data");
  const data = await res.json();
  orgs = data["orgs"];
  tracks = data["tracks"];

  document.getElementById("eventInfoText").hidden = false;
  document.getElementById("eventInfoSpinner").hidden = true;

  tracks = tracks.reduce((obj, v) => {obj[v["nickname"].toUpperCase()] = v; return obj;}, {})  // reformat tracks to be object
  orgs = orgs.map(org => ({...org,
    numEvents: org.events.length,
    events: org.events.map(e => ({...e, org: org.orgNickname, url: e.url || org.url}))}));  // add org key and default url
  trackdays = orgs.flatMap(({events}) => events);  // aggregate events as single list
  trackdays = trackdays.map(td => ({...td, date: dayjs(td.date, "YYYY-MM-DD")}));  // convert date string to dayjs
  trackdays.sort((a, b) => (a.date > b.date ? 1 : -1));  // sort by date

  const idx = trackdays.findIndex(td => td.date >= dayjs().startOf("day"));  // remove trackdays prior to current day
  trackdays = idx === -1 ? [] : trackdays.slice(idx);

  orgs = orgs.map(({events, ...item}) => item);  // drop events key
  orgs = orgs.map(org => ({...org,
    syncTimeUTC: dayjs.utc(org.syncTimeUTC),
    dropdownOption: new Option(org.org, org.orgNickname),
    dropdownSelected: (org.numEvents > 0),
  }));
  orgs.sort((a, b) => (a.org > b.org ? 1 : -1));  // sort by name

  let lastSync = orgs.reduce((prev, curr) => prev.syncTimeUTC.isAfter(curr.syncTimeUTC) ? prev : curr).syncTimeUTC;
  document.getElementById("lastSyncMessage").innerText = dayjs().to(lastSync);
  document.getElementById("numTrackdays").innerText = trackdays.reduce((sum, td) => sum + [...td.eventType].filter(t => eventTypeMap[t]).length, 0);  // an event tagged with 2 types counts twice
  document.getElementById("numOrgs").innerText = new Set(trackdays.map(a => a.org)).size;  // num unique orgs

  orgs = orgs.reduce((result, org) => {  // map org nickname -> org
    result[org.orgNickname] = org;
    return result;
  }, {});
}

function createTrackMarkers() {
  Object.keys(tracks).forEach((trackName) => {
    let track = tracks[trackName];
    mapMarkers[trackName] = new L.Marker([track.lat, track.lon], {title: track.nickname, icon: trackIconCheckered, opacity: 0.8});
    mapMarkers[trackName].bindPopup("", {maxHeight: 300, minWidth: 240, maxWidth: 420, closeButton: false});  // popup content updated on click
    mapMarkers[trackName].on("pointerdown", (e) => {
      let trackKey = e.target.options.title.toUpperCase();
      if (trackKey !== lastOpenedTrack) resetRecordForm();
      lastOpenedTrack = trackKey;
      // records are new, so load them on open and spare the wait. later, load only when that tab is open: if (recordsUi.open) loadTrackRecords(trackKey); else updateTrackPopup();
      loadTrackRecords(trackKey);
    });
    // leaflet measures popup width before flex/scroll layout settles; remeasure after paint so text isn't truncated on first open
    mapMarkers[trackName].on("popupopen", (e) => {
      // redrawing the popup on click detaches the button, so Leaflet no longer sees the click as inside the popup and closes it
      let popupEl = e.popup.getElement();
      if (popupEl && !popupEl.dataset.keepOpen) {
        popupEl.dataset.keepOpen = "1";
        popupEl.addEventListener("click", (ev) => ev.stopPropagation());
      }
      requestAnimationFrame(() => {
        if (e.popup.isOpen()) syncOpenPopup(e.popup);
      });
    });
  });
}

function wireHomeAndRadius() {
  homeMarker.on("dragstart", () => {
    homeLocked = true;
    map.closePopup();  // close "Drag Me" popup
  });
  homeMarker.on("drag", () => {
    searchCircle.setLatLng(homeMarker.getLatLng());
  });
  homeMarker.on("dragend", () => {
    let latlng = homeMarker.getLatLng();
    searchCircle.setLatLng(latlng);
    persistHomeLocation(latlng);
    updateTrackDistances();
    refresh({calendar: true, dropdown: true});
  });

  radiusSliderElement.addEventListener("input", () => {
    homeLocked = true;
    updateSearchRadius(radiusValues[radiusSliderElement.value]);
  });

  radiusSliderElement.addEventListener("change", () => {
    persistRadius();
    refresh({calendar: true, dropdown: true});
  });

  map.on("pointerdown", () => {
    map.closePopup();
  });
}

function setFilterToggle(buttonElement, enabled) {
  buttonElement.classList.toggle("on", enabled);
  buttonElement.setAttribute("aria-pressed", enabled ? "true" : "false");
}

function bindToggleGroup(pairs, {selectedSet, storageKey, onChange}) {
  let stored = localStorage.getItem(storageKey) || "";
  for (const [buttonElement, code] of pairs) {
    let enabled = stored.includes(code);
    setFilterToggle(buttonElement, enabled);
    if (enabled) selectedSet.add(code);
    buttonElement.addEventListener("click", () => {
      let nowEnabled = !selectedSet.has(code);
      if (nowEnabled) selectedSet.add(code);
      else selectedSet.delete(code);
      setFilterToggle(buttonElement, nowEnabled);
      localStorage.setItem(storageKey, [...selectedSet].join(""));
      if (onChange) onChange(nowEnabled, code);
    });
  }
}

function enableAllToggles(pairs, selectedSet, storageKey, allCodes) {
  for (const [buttonElement] of pairs) setFilterToggle(buttonElement, true);
  selectedSet.clear();
  allCodes.forEach(code => selectedSet.add(code));
  localStorage.setItem(storageKey, allCodes.join(""));
}

function wireFilterControls() {
  const vehiclePairs = [[showCarEventsButton, "C"], [showMotoEventsButton, "M"], [showSumoEventsButton, "S"]];
  const eventPairs = [[showTrackdaysToggleElement, "T"], [showSchoolsToggleElement, "S"], [showRacesToggleElement, "R"]];

  applyStoredHosts();
  orgSelectElement.addEventListener("change", () => {
    Array.from(orgSelectElement.options).forEach((opt) => {
      orgs[opt.value].dropdownSelected = opt.selected;
    });
    persistHosts();
    refresh({trackVisibility: true, popup: true, calendar: true});
  });

  if (!localStorage.getItem(STORAGE_KEY_USER_VEHICLE_TYPES)) {  // new user or all vehicle types unselected
    localStorage.setItem(STORAGE_KEY_USER_VEHICLE_TYPES, Object.keys(vehicleTypeMap).join(""));
  }
  if (!localStorage.getItem(STORAGE_KEY_USER_EVENT_TYPES)) {  // new user or all event types unselected
    localStorage.setItem(STORAGE_KEY_USER_EVENT_TYPES, Object.keys(eventTypeMap).join(""));
  }

  bindToggleGroup(vehiclePairs, {
    selectedSet: selectedVehicleTypes,
    storageKey: STORAGE_KEY_USER_VEHICLE_TYPES,
    onChange() {
      if (selectedVehicleTypes.size > 0) {
        homeMarker.setIcon(selectedVehicleTypes.has("C") ? homeIconCar : homeIconMoto);
      }
      refresh({trackVisibility: true, popup: true, calendar: true, dropdown: true});
    },
  });
  if (selectedVehicleTypes.size === 0 || selectedVehicleTypes.has("C")) {
    homeMarker.setIcon(homeIconCar);
  }

  bindToggleGroup(eventPairs, {
    selectedSet: selectedEventTypes,
    storageKey: STORAGE_KEY_USER_EVENT_TYPES,
    onChange() {
      refresh({trackVisibility: true, popup: true, calendar: true, dropdown: true});
    },
  });

  applyStoredWeekdays();
  daySelectElement.addEventListener("change", () => {
    persistWeekdays();
    refresh({trackVisibility: true, popup: true, calendar: true});
  });

  showTracksWithoutEventsToggleElement.addEventListener("click", () => {
    let nowEnabled = !showTracksWithoutEventsToggleElement.classList.contains("on");
    setFilterToggle(showTracksWithoutEventsToggleElement, nowEnabled);
    localStorage.setItem(STORAGE_KEY_EMPTY_TRACKS, nowEnabled ? "1" : "0");
    refresh({trackVisibility: true});
  });
  let storedEmptyTracks = localStorage.getItem(STORAGE_KEY_EMPTY_TRACKS);
  let emptyTracksOn = storedEmptyTracks === null ? showTracksWithoutEventsToggleElement.classList.contains("on") : storedEmptyTracks === "1";
  setFilterToggle(showTracksWithoutEventsToggleElement, emptyTracksOn);

  exportSavedEventsElement.addEventListener("click", () => {
    downloadSavedEventsICS();
  });

  resetElement.addEventListener("click", () => {
    let savedEventsPrompt = [...savedEventsSet].sort((a, b) => {
      let [dateA] = a.split("|");
      let [dateB] = b.split("|");
      return dateA.localeCompare(dateB) || a.localeCompare(b);
    }).map((eventKey) => {
      let [date, org, track] = eventKey.split("|");
      return `${date} | ${track} | ${org}`;
    }).join("\n");
    if (savedEventsSet.size > 0 && confirm(`Also clear all saved events?\n\n${savedEventsPrompt}`)) {
      savedEventsSet.clear();
      localStorage.removeItem(STORAGE_KEY_USER_SAVED_EVENTS);
    }

    clearStoredFilters();

    enableAllToggles(vehiclePairs, selectedVehicleTypes, STORAGE_KEY_USER_VEHICLE_TYPES, Object.keys(vehicleTypeMap));
    enableAllToggles(eventPairs, selectedEventTypes, STORAGE_KEY_USER_EVENT_TYPES, Object.keys(eventTypeMap));
    homeMarker.setIcon(homeIconCar);

    Object.values(orgs).forEach(org => org.dropdownSelected = (org.numEvents > 0));
    setFilterToggle(showTracksWithoutEventsToggleElement, true);
    Object.keys(tracks).forEach((track) => {mapMarkers[track].addTo(map);});

    closeDateRange();
    setCalendarRange(null, null);
    Array.from(daySelectElement.options).forEach((opt) => {
      opt.selected = true;
    });
    daySelectElement.loadOptions();
    homeLocked = false;
    resetHome();
  });
}

async function visualizeData() {
  try {
    await fetchAndNormalizeTrackdays();
    createTrackMarkers();
    wireHomeAndRadius();
    wireFilterControls();
    alertOnMissingSavedEvents();
    resetHome();
  } catch (error) {
    document.getElementById("eventInfoText").hidden = true;
    const spinner = document.getElementById("eventInfoSpinner");
    spinner.hidden = false;
    spinner.querySelector("span").innerText = "Unable to retrieve events.";
    const loadingImg = spinner.querySelector("img");
    if (loadingImg) loadingImg.hidden = true;
    alert("Error: unable to retrieve data");
  }
}
getGPSLocation();
visualizeData();
