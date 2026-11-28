import {INFINITE_RADIUS, RADIUS_VALUES, getEventKey, state} from "./filters.js";
import {loadHomeLocation, loadRadiusIndex, persistHomeLocation, persistRadius} from "./storage.js";

let locationDefault = [39.50, -98.35];  // Central US or GPS location
let isGPSLocation = false;
let homeLocked = false;  // user moved the home pin or the travel radius

const homeImgMoto = `<svg xmlns="http://www.w3.org/2000/svg" fill="#ff0000" viewBox="0 0 64 64"><path d="M53 44a9 9 0 0 0-7 3l-1-1h1v-1l13-6a4 4 0 0 0-1-2c2-2 2-5 2-5v-2h-2l-6 1-3 1-1-3s-6-6-12-8c2-1 2-3 2-7 0-6-5-12-12-12a12 12 0 0 0-13 14c-1 0 1 6 3 6 2 5 4 6 6 6l4-1v4l-2 1-1-2h-1c-5 0-9 2-12 6l-2 4 1 2 2 1a10 10 0 0 0-6 2h1a9 9 0 0 0 5 17c4 0 8-3 9-6a3 3 0 0 0 3 3l19-3h1v-2a9 9 0 0 0 0-1 15 15 0 0 1 0-1 9 9 0 0 0 0 1c0 5 4 9 10 9s9-4 9-9-4-9-9-9m-8-5c4-3 1-5 8-7h5s0 4-3 5c-7 4-12 4-12 4l2-2m-7 5a4 4 0 0 1 1 2l-2 2 1-4M25 25l-3 1c-2 0-3-2-4-4l10-6 2-2-2-2-2 1-11 2a8 8 0 0 1 0-1c0-5 5-10 11-10s10 5 10 10 0 5-7 9a255 255 0 0 0-4 2m-1 12 1-1 6-2a2 2 0 0 0 0-2v-2l4 4h-1l-4 1-2 1-2 2v1a70 70 0 0 0-2-1v-1m10-1-1 4h-2a45 45 0 0 0-3-1v-1l1-1 5-1m-14-3a1 1 0 0 1 2 0v2c1 2 1 2-2 3h-1l-1-1c-1-2 0-3 1-3l1-1m-4 20h2a6 6 0 0 1-1 3l-1-1a5 5 0 0 1-1 1h2a7 7 0 0 1-2 2l-1-2a5 5 0 0 1-1 1l1 2a7 7 0 0 1-2 0v-2h-1v2a7 7 0 0 1-2 0l1-2a5 5 0 0 1-1-1l-1 2a7 7 0 0 1-2-2h2a5 5 0 0 1-1-1l-2 1a6 6 0 0 1 0-3h2v-1H5a6 6 0 0 1 0-2l2 1 1-1-2-1a7 7 0 0 1 2-2l1 2a5 5 0 0 1 1 0l-1-2a7 7 0 0 1 2-1v2h1v-2a7 7 0 0 1 2 1l-2 3a3 3 0 0 0-1 0c-1 0-2 1-2 3s1 3 2 3c2 0 3-2 3-3l-1-2 2-3 2 1-2 1 1 1 1-1 1 2h-2v1m25 1v1l-18 2-1-1-1-8-3-2-8-6 1-3a12 12 0 0 1 7-5v1l-2 2-1 1c0 1-2 2 0 2l2 1a3 3 0 0 0 2 1l2-1a56 56 0 0 1 11 3l-1 6h-1a4 4 0 0 0-1 0l-1-1-6-4h-1l1 1 4 3 2 1-2 2 8 2c1 1 2 0 2-1v-1c3 0 2-2 4-2h2l-1 6m0-9-1-1 4-1a25 25 0 0 0 3-1l-2 1-4 2m8 2v1h-1l1-1m8 6h2a6 6 0 0 1 0 3l-2-1a5 5 0 0 1-1 1h2a7 7 0 0 1-2 2l-1-2-1 1 2 2a7 7 0 0 1-3 0v-2h-1v2a7 7 0 0 1-2 0l1-2a5 5 0 0 1-1-1l-1 2a7 7 0 0 1-2-2h2a5 5 0 0 1-1-1l-1 1a6 6 0 0 1-1-3h1l4 2a3 3 0 0 0 2 1l2-3c0-2-1-3-2-3l-3-1h1l-1-2a7 7 0 0 1 2-1v2h1c1 0 0 0 0 0v-2a7 7 0 0 1 2 1l-1 2h1l1-2a7 7 0 0 1 2 2l-2 1 1 1 2-1v2h-2v1"/></svg>`;
const homeImgCar = `<svg xmlns="http://www.w3.org/2000/svg" fill="#ff0000" viewBox="0 0 64 64"><path d="M62 45.3 60 41l-5 3-.2-.2 4.8-2.9c1.6-1.2 1.6-4.3-.2-7-1.7-2.7-4.5-3.9-6.1-2.7L48.9 34l-.4.2c-.7.6-.9 1.9-.7 3.2l-.1-.1v-3.8l-4.4-7-2.6-1.6.5-.3c2-1.4 1.8-5-.2-8-2-3.2-5.2-4.6-7-3.2l-9 5.3.2 1.1-.7.4L19 18v-1.2l7.7-4-4-3.7L2 16.8l6.1 5.6 6.9-3.6v1.8l3.6 2.7-1.7 1-2.4-.6-3.6 2.1v.6l-5.4 3.2-.5.3c-2 1.4-1 6.5.7 9 1.7 2.6 3.9 4.2 5.8 4.2a3 3 0 0 0 1.8-.6l5.7-3.3a3 3 0 0 0 .4-.3 3.3 3.3 0 0 0 .9-1l5 3.8 6.5 1.5-.3.1c-1.8 1.3-.8 5.8.6 8 1.5 2.3 3.4 3.7 5.1 3.7a3 3 0 0 0 1.6-.5l4.7-2.8L49 54l13-8.7m-3.4-3 1.7 3.6-1 .8-2-3.7 1.3-.7M21.1 10l3.5 3.4-1.4.6-3.8-3.4 1.7-.6M10.9 20.5 5.2 16l2.4-.9 5 4.5-1.7.9M49.1 35a1.5 1.5 0 0 1 1-.3c1 0 2.5.8 3.8 2.7 1.5 2.3 1.4 4.8.4 5.6l-.3.2-1.5-1.4a1.2 1.2 0 0 0 .9-.2c.9-.7.8-2.3-.1-3.8-1-1.4-2.4-2-3.3-1.4-.6.5-.6 1.4-.2 2.4l1.4-.8c1-.5 2.1.8 1.5 1.7l-1.5.9-2.1-2c-.5-1.6-.5-3.2 0-3.6M49 47.7l-4 2.4c.6-1.2.6-2.8 0-4.5l3.9 2.1m-4-3.5-.3.2a10.4 10.4 0 0 0-.7-1.2 10.7 10.7 0 0 0-.5-.7c1-.5 2.1.7 1.5 1.7m-16.6-27 14.3 9.5 4.4 7-1.2.7-4.4-7-14.3-9.5 1.2-.7m9 13.6.4-.2c-.5 1.7-1.6 2.6-3.8 2.6-2.8 0-6.4-1.5-6.4-4.5s2.3-5.4 5.2-5.4a5 5 0 0 1 5 4.3c0-.2-.2-.2-.3-.2-2.9.2-6.7.1-6.8 1.2-.1 1.1 2.2 2.5 6.8 2.2M16 19.8v-1.6l2-1v1.4l11.5 4.5-3.4 1.6-10-4.8m-1.7 6c-.7-.3-1.5-.3-2.2-.2l1.1-.6 1.1.8m-3 16.2c-1.5 0-3.4-1.4-5-3.7-1.4-2.3-2.2-6.7-1-7.7.5-.2 1-.4 1.4-.4 1.8 0 3.9 1.5 5.3 3.7 2 3 2.2 6.5.5 7.7a2 2 0 0 1-1.2.4m13.7-6.3-4.7-3.3a11.5 11.5 0 0 0-2.6-4.3l9.6 6.4 11 4.4-1.7 1-11.6-4.2m12 18.2c-1.3 0-3-1.3-4.2-3.3-1.5-2.1-2-5.8-1-6.6l1.2-.3c1.5 0 3.3 1.3 4.5 3.2 1.7 2.6 2 5.6.5 6.7-.3.2-.6.3-1 .3m10-4.8 4.1 2.8-1 .8-4.4-2.8 1.4-.8"/><path d="M7 32.9c-1.2.8-.7 3 .5 4.8 1.2 1.9 2.7 2.7 3.8 1.9 1.2-.8 1.1-3 0-4.9C10 33 8 32 6.8 33m26.4 13c-1 .7-.6 2.6.5 4.2 1 1.7 2.4 2.4 3.4 1.7s1-2.7-.1-4.3c-1.1-1.6-2.8-2.4-3.8-1.7"/></svg>`;
const checkeredFlagImg = `<svg xmlns="http://www.w3.org/2000/svg" fill="#000000" viewBox="0 0 24 24"><path d="M4 2v18H3v2h4v-2H6v-5h13a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H6V2H4zm4 3v2h2V5h2v2h2V5h2v2h2v2h-2v2h2v2h-2v-2h-2v2h-2v-2h-2v2H8v-2H6V9h2V7H6V5h2z"/><path d="M8 9h2v2H8zm4 0h2v2h-2zm-2-2h2v2h-2zm4 0h2v2h-2z"/></svg>`;

const homeIconMoto = new L.DivIcon({html: homeImgMoto, className: "", iconSize: [36, 36], iconAnchor: [18, 18]});
const homeIconCar = new L.DivIcon({html: homeImgCar, className: "", iconSize: [50, 50], iconAnchor: [25, 25]});
const trackIconCheckered = new L.DivIcon({html: checkeredFlagImg, className: "", iconSize: [32, 32], iconAnchor: [6, 24], popupAnchor: [10, -20]});
const trackIconRed = new L.DivIcon({html: checkeredFlagImg.replace("#000000", "#ff0000"), className: "", iconSize: [32, 32], iconAnchor: [6, 24], popupAnchor: [10, -20]});

export const map = new L.Map("map", {doubleClickZoom: false, boxZoom: false, minZoom: 3, maxZoom: 15, worldCopyJump: true});
new L.TileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: `<a class="map-attribution" href="http://www.openstreetmap.org/copyright">&copy; OpenStreetMap</a>`,
}).addTo(map);
map.attributionControl.setPrefix("");

export const homeMarker = new L.Marker(locationDefault, {title: "Home", icon: homeIconMoto, opacity: 0.9, draggable: true, autoPan: true, autoPanSpeed: 1, zIndexOffset: 1000}).addTo(map);
const searchCircle = new L.Circle(locationDefault, {stroke: true, color: "#ff0000", opacity: 0.4, dashArray: "4", fill: false, interactive: false, radius: INFINITE_RADIUS}).addTo(map);
export const mapMarkers = {};

export function setHomeIcon(isCar) {
  homeMarker.setIcon(isCar ? homeIconCar : homeIconMoto);
}

export function unlockHome() {
  homeLocked = false;
}

export function milesBetween(lat1, lon1, lat2, lon2) {
  function deg2rad(deg) {return deg * (Math.PI / 180);}
  let r = 6371;  // earth radius km
  lat1 = deg2rad(lat1);
  lat2 = deg2rad(lat2);
  let deltaLat = lat2 - lat1;
  let deltaLon = deg2rad(lon2 - lon1);
  let a = Math.pow(Math.sin(deltaLat / 2), 2) + Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin(deltaLon / 2), 2);
  let d = 2 * r * Math.asin(Math.sqrt(a));
  return d * 0.621371;
}

export function updateTrackDistances() {
  let {lat, lng} = homeMarker.getLatLng();
  Object.keys(state.tracks).forEach((track) => {
    state.tracks[track].dist = milesBetween(lat, lng, state.tracks[track].lat, state.tracks[track].lon);
  });
  state.trackdays.sort((a, b) => state.tracks[a.track].dist - state.tracks[b.track].dist);  // keep sorted for calendar order
}

export function updateTrackIcons(updateTrackVisibility) {
  let allTracks = Object.keys(state.tracks);
  let tracksWithEvents = new Set(state.trackdays.filter(td => td.visibilityMap).map(td => td.track));

  if (updateTrackVisibility) {
    // visibilityMap already includes saved events. Empty Tracks also shows a matching vehicle with nothing listed.
    let showEmpty = document.getElementById("showTracksWithoutEvents").classList.contains("on");
    allTracks.forEach(track => {
      let matchingVehicleType = [...state.tracks[track].vehicleType].some(t => state.selectedVehicleTypes.has(t));
      let show = tracksWithEvents.has(track) || (showEmpty && matchingVehicleType);
      show ? mapMarkers[track].addTo(map) : mapMarkers[track].remove();
    });
  }

  let tracksWithSavedEvents = new Set();
  if (state.savedEventsSet.size) {
    state.trackdays.forEach((td) => {
      if (state.savedEventsSet.has(getEventKey(td))) tracksWithSavedEvents.add(td.track);
    });
  }
  allTracks.forEach((track) => {
    let withinRadius = (state.searchRadius === INFINITE_RADIUS || state.tracks[track].dist <= state.searchRadius);
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

export function showAllTrackMarkers() {
  Object.keys(state.tracks).forEach((track) => {mapMarkers[track].addTo(map);});
}

export function updateSearchRadius(radiusMiles) {
  state.searchRadius = radiusMiles;
  searchCircle.setRadius(state.searchRadius * 1609.34);
  document.getElementById("displayedRadius").innerText = (state.searchRadius === INFINITE_RADIUS ? "∞" : `${state.searchRadius}`);
}

export function resetHome(onRefresh) {
  let radiusSliderElement = document.getElementById("radiusSlider");
  let savedHome = loadHomeLocation();
  let home = savedHome || locationDefault;
  homeMarker.setLatLng(home);
  searchCircle.setLatLng(home);
  map.setView(home, savedHome || isGPSLocation ? 6 : 3);
  radiusSliderElement.max = String(RADIUS_VALUES.length - 1);
  let radiusIndex = loadRadiusIndex(RADIUS_VALUES);
  if (radiusIndex === null) radiusIndex = isGPSLocation ? RADIUS_VALUES.indexOf(200) : RADIUS_VALUES.length - 1;
  radiusSliderElement.value = String(radiusIndex);
  new L.Popup(home, {"content": "<b>Drag Me</b>", "className": "dragMe", "autoPan": false, "closeButton": false, "offset": [0, 50]}).openOn(map);

  updateTrackDistances();
  updateSearchRadius(RADIUS_VALUES[radiusSliderElement.value]);
  // Keep the viewed month — GPS can arrive after the user has already scrolled/swiped.
  onRefresh({trackVisibility: true, popup: true, calendar: true, dropdown: true});
}

export function getGPSLocation(onRefresh) {
  function setGPSLocation(position) {
    locationDefault = [position.coords.latitude, position.coords.longitude];
    isGPSLocation = true;
    // Re-home map/radius when the pin was not moved; keep the viewed calendar month.
    if (state.tracks && !homeLocked) resetHome(onRefresh);
  }
  // timeout starts after the permission prompt, so a hung lookup cannot arrive much later
  navigator.geolocation?.getCurrentPosition(setGPSLocation, () => {}, {timeout: 10000});
}

export function createTrackMarkers({onTrackOpen, onPopupOpen}) {
  Object.keys(state.tracks).forEach((trackName) => {
    let track = state.tracks[trackName];
    mapMarkers[trackName] = new L.Marker([track.lat, track.lon], {title: track.nickname, icon: trackIconCheckered, opacity: 0.8});
    mapMarkers[trackName].bindPopup("", {maxHeight: 300, minWidth: 240, maxWidth: 550, closeButton: false});  // popup content updated on click
    mapMarkers[trackName].on("pointerdown", (e) => {
      let trackKey = e.target.options.title.toUpperCase();
      onTrackOpen(trackKey);
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
        if (e.popup.isOpen()) onPopupOpen(e.popup);
      });
    });
  });
}

export function wireHomeAndRadius(onRefresh) {
  let radiusSliderElement = document.getElementById("radiusSlider");
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
    onRefresh({calendar: true, dropdown: true});
  });

  radiusSliderElement.addEventListener("input", () => {
    homeLocked = true;
    updateSearchRadius(RADIUS_VALUES[radiusSliderElement.value]);
  });

  radiusSliderElement.addEventListener("change", () => {
    persistRadius(state.searchRadius);
    onRefresh({calendar: true, dropdown: true});
  });

  map.on("pointerdown", () => {
    map.closePopup();
  });
}
