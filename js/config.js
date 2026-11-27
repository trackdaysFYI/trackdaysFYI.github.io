export const TRACKDAYS_URL = "https://atqtpmna66.execute-api.us-east-1.amazonaws.com/getTrackdays";
export const TRACKS_URL = TRACKDAYS_URL + "?include=tracks";
export const LAP_RECORDS_URL = "https://8fu4ilcse5.execute-api.us-east-1.amazonaws.com/getLapRecords";
export const LAP_RECORD_SUBMIT_URL = "https://8fu4ilcse5.execute-api.us-east-1.amazonaws.com/submitLapRecord";
export const SUGGESTION_URL = "https://8fu4ilcse5.execute-api.us-east-1.amazonaws.com/submitSuggestion";

export const VEHICLE_TYPES = {
  C: {short: "Car", label: "Car", filterNote: "car"},
  M: {short: "Bike", label: "Motorcycle", filterNote: "motorcycle"},
  S: {short: "Sumo", label: "Supermoto", filterNote: "supermoto"},
};

export const EVENT_TYPES = {
  T: {short: "TD", label: "Trackday", filterNote: "trackday"},
  S: {short: "School", label: "School", filterNote: "school"},
  R: {short: "Race", label: "Race", filterNote: "race"},
};

export function vehicleShortLabel(code) {
  return (VEHICLE_TYPES[code] && VEHICLE_TYPES[code].short) || code || "";
}

export function vehicleFullLabel(code) {
  return (VEHICLE_TYPES[code] && VEHICLE_TYPES[code].label) || code || "";
}

export function eventShortLabel(code) {
  return (EVENT_TYPES[code] && EVENT_TYPES[code].short) || code || "";
}

export function eventFullLabel(code) {
  return (EVENT_TYPES[code] && EVENT_TYPES[code].label) || code || "";
}

export async function fetchJson(url, opts) {
  let res = await fetch(url, opts);
  if (!res.ok) throw Object.assign(new Error("HTTP " + res.status), {status: res.status});
  return res.json();
}

export function downloadBlob(blob, fileName) {
  let url = URL.createObjectURL(blob);
  let link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
