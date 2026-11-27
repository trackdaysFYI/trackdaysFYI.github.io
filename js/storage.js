export const STORAGE_KEYS = {
  savedEvents: "trackdaysFYI:userSavedEvents",
  vehicleTypes: "trackdaysFYI:userVehicleTypes",
  eventTypes: "trackdaysFYI:userEventTypes",
  emptyTracks: "trackdaysFYI:showEmptyTracks",
  weekdays: "trackdaysFYI:userWeekdays",
  hosts: "trackdaysFYI:userHosts",
  travelRadius: "trackdaysFYI:travelRadius",
  homeLocation: "trackdaysFYI:homeLocation",
  headerAdClosed: "headerAdClosed",
};

export function readStoredList(key) {
  try {
    let raw = localStorage.getItem(key);
    if (raw === null) return null;
    let arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : null;
  } catch (e) {
    return null;
  }
}

export function writeStoredList(key, items) {
  localStorage.setItem(key, JSON.stringify([...items]));
}

export function loadSavedEvents() {
  return new Set(readStoredList(STORAGE_KEYS.savedEvents) || []);
}

export function persistSavedEvents(savedSet) {
  writeStoredList(STORAGE_KEYS.savedEvents, savedSet);
}

export function clearSavedEvents() {
  localStorage.removeItem(STORAGE_KEYS.savedEvents);
}

export function loadHomeLocation() {
  let stored = readStoredList(STORAGE_KEYS.homeLocation);
  if (!stored || stored.length !== 2) return null;
  let lat = Number(stored[0]);
  let lng = Number(stored[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return [lat, lng];
}

export function persistHomeLocation(latlng) {
  writeStoredList(STORAGE_KEYS.homeLocation, [latlng.lat, latlng.lng]);
}

export function loadRadiusIndex(radiusValues) {
  let raw = localStorage.getItem(STORAGE_KEYS.travelRadius);
  if (raw === null) return null;
  let index = radiusValues.indexOf(Number(raw));
  return index === -1 ? null : index;
}

export function persistRadius(radius) {
  localStorage.setItem(STORAGE_KEYS.travelRadius, String(radius));
}

export function ensureDefaultToggleCodes(key, allCodes) {
  if (!localStorage.getItem(key)) {
    localStorage.setItem(key, allCodes.join(""));
  }
}

export function readToggleCodes(key) {
  return localStorage.getItem(key) || "";
}

export function writeToggleCodes(key, codes) {
  localStorage.setItem(key, [...codes].join(""));
}

export function loadShowEmptyTracks(defaultOn) {
  let stored = localStorage.getItem(STORAGE_KEYS.emptyTracks);
  return stored === null ? defaultOn : stored === "1";
}

export function persistShowEmptyTracks(enabled) {
  localStorage.setItem(STORAGE_KEYS.emptyTracks, enabled ? "1" : "0");
}

export function clearStoredFilters() {
  localStorage.removeItem(STORAGE_KEYS.emptyTracks);
  localStorage.removeItem(STORAGE_KEYS.weekdays);
  localStorage.removeItem(STORAGE_KEYS.hosts);
  localStorage.removeItem(STORAGE_KEYS.travelRadius);
  localStorage.removeItem(STORAGE_KEYS.homeLocation);
}

export function isHeaderAdClosed() {
  return Boolean(localStorage.getItem(STORAGE_KEYS.headerAdClosed));
}

export function markHeaderAdClosed() {
  localStorage.setItem(STORAGE_KEYS.headerAdClosed, "true");
}
