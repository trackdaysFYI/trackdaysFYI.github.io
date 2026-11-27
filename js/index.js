import {EVENT_TYPES, TRACKDAYS_URL, VEHICLE_TYPES, fetchJson} from "./config.js";
import {
  formatIsoUtcDate,
  formatRelativeTime,
  parseIsoDate,
  parseUtcTimestamp,
  todayIso,
  weekdayShort,
} from "./dates.js";
import {MultiselectDropdown} from "./multiselect-dropdown.js";
import {escapeHtml, safeHttpUrl} from "./lap-record-shared.js";
import {
  STORAGE_KEYS,
  clearSavedEvents,
  clearStoredFilters,
  ensureDefaultToggleCodes,
  isHeaderAdClosed,
  loadShowEmptyTracks,
  markHeaderAdClosed,
  persistSavedEvents,
  persistShowEmptyTracks,
  readStoredList,
  readToggleCodes,
  writeStoredList,
  writeToggleCodes,
} from "./storage.js";
import {
  getEventKey,
  selectedWeekdays,
  setCalendarRange,
  state,
  updatePillCounts,
  updateTrackdaysVisibilityProperty,
} from "./filters.js";
import {downloadSavedEventsICS} from "./ics.js";
import {
  createTrackMarkers,
  getGPSLocation,
  resetHome,
  setHomeIcon,
  showAllTrackMarkers,
  unlockHome,
  updateTrackIcons,
  wireHomeAndRadius,
} from "./map.js";
import {syncOpenPopup, updateTrackPopup, wirePopupActions} from "./popup.js";
import {
  finishLapRecordsPreload,
  initIndexLapRecords,
  loadAllLapRecords,
  loadTrackRecords,
  openRecordForm,
  resetRecordForm,
  setRecordsOpen,
} from "./index-lap-records.js";
import {initIndexSuggest, reportMissingEvent} from "./index-suggest.js";
import {dateRangeButtonLabel} from "./calendar.js";
import {
  calendarClearDatesHtml,
  initCalendarMonth,
  renderCalendarView,
  resetCalendarMonth,
} from "./calendar-month.js";

const showCarEventsButton = document.getElementById("showCarEvents");
const showMotoEventsButton = document.getElementById("showMotoEvents");
const showSumoEventsButton = document.getElementById("showSumoEvents");
const orgSelectElement = document.getElementById("orgSelect");
const daySelectElement = document.getElementById("daySelect");
const showTracksWithoutEventsToggleElement = document.getElementById("showTracksWithoutEvents");
const showTrackdaysToggleElement = document.getElementById("showTrackdays");
const showSchoolsToggleElement = document.getElementById("showSchools");
const showRacesToggleElement = document.getElementById("showRaces");
const exportSavedEventsElement = document.getElementById("exportSavedEvents");
const resetElement = document.getElementById("resetFilters");

orgSelectElement.style.display = "block";
MultiselectDropdown();

function persistWeekdays() {
  writeStoredList(STORAGE_KEYS.weekdays, selectedWeekdays());
}

function persistHosts() {
  let selected = Object.values(state.orgs).filter((org) => org.dropdownSelected).map((org) => org.orgNickname);
  writeStoredList(STORAGE_KEYS.hosts, selected);
}

function applyStoredWeekdays() {
  let stored = readStoredList(STORAGE_KEYS.weekdays);
  if (!stored) return;
  let selected = new Set(stored);
  Array.from(daySelectElement.options).forEach((opt) => {
    opt.selected = selected.has(opt.value);
  });
  daySelectElement.loadOptions();
}

function applyStoredHosts() {
  let stored = readStoredList(STORAGE_KEYS.hosts);
  if (!stored) return;
  let selected = new Set(stored);
  Object.values(state.orgs).forEach((org) => {
    org.dropdownSelected = selected.has(org.orgNickname);
  });
}

function updateCalendar() {
  // trackdays should be sorted by distance before this
  renderCalendarView();
  updatePillCounts();
}

function updateDropdown() {
  let visibleOrgs = new Set(state.trackdays.filter(td => td.visibilityDropdown).map(td => td.org));
  // delete and recreate options so orgs are alphabetical
  orgSelectElement.options.length = 0;
  Object.values(state.orgs).filter(org => org.numEvents > 0).forEach((org) => {
    if (visibleOrgs.has(org.orgNickname)) {
      org.dropdownOption.selected = org.dropdownSelected;
      orgSelectElement.add(org.dropdownOption);
    }
  });
  orgSelectElement.loadOptions();
}

function updateDateFilterBar() {
  let bar = document.getElementById("dateFilterBar");
  if (!bar) return;
  let ranged = !!(state.selectedCalendarStart && state.selectedCalendarEnd);
  if (!ranged) {
    bar.classList.add("is-idle");
    bar.classList.remove("is-chip");
    bar.removeAttribute("aria-hidden");
    bar.setAttribute("role", "button");
    bar.setAttribute("tabindex", "0");
    bar.setAttribute("aria-label", "Select dates on calendar");
    bar.innerHTML = `<span class="date-filter-bar-text">Select on calendar</span>`;
    return;
  }
  let label = dateRangeButtonLabel();
  bar.classList.remove("is-idle");
  bar.classList.add("is-chip");
  bar.removeAttribute("aria-hidden");
  bar.removeAttribute("role");
  bar.removeAttribute("tabindex");
  bar.removeAttribute("aria-label");
  bar.innerHTML = `<span class="date-filter-bar-text">${escapeHtml(label)}</span>${calendarClearDatesHtml()}`;
}

function refresh({trackVisibility = false, popup = false, calendar = false, dropdown = false} = {}) {
  updateTrackdaysVisibilityProperty();
  updateTrackIcons(trackVisibility);
  if (popup) updateTrackPopup();
  if (calendar) updateCalendar();
  if (dropdown) updateDropdown();
  updateDateFilterBar();
}

function clearCalendarDateFilter() {
  setCalendarRange(null, null);
  refresh({trackVisibility: true, popup: true, calendar: true});
}

function onEventSaveToggle(btn) {
  let key = decodeURIComponent(btn.getAttribute("data-event-key"));
  let nowSaved = !state.savedEventsSet.has(key);
  if (nowSaved) state.savedEventsSet.add(key);
  else state.savedEventsSet.delete(key);
  persistSavedEvents(state.savedEventsSet);
  btn.setAttribute("aria-pressed", nowSaved ? "true" : "false");
  btn.title = nowSaved ? "Unsave Event" : "Save Event";
  btn.setAttribute("aria-label", nowSaved ? "Unsave Event" : "Save Event");
  let item = btn.closest(".event-item");
  if (item) item.classList.toggle("is-saved", nowSaved);
  if (state.trackdays) {
    // do not refresh the open popup, so an accidental unsave can be checked again
    refresh({trackVisibility: true, calendar: true});
  }
}

function alertOnMissingSavedEvents() {
  if (!state.trackdays) return;
  let currentEventKeys = new Set(state.trackdays.map(td => getEventKey(td)));
  let unmatchedSavedEvents = [...state.savedEventsSet].filter(key => !currentEventKeys.has(key));
  if (unmatchedSavedEvents.length === 0) return;
  let eventList = unmatchedSavedEvents
    .map((key) => {
      let [date, org, track] = key.split("|");
      return `${date} | ${track} | ${org}`;
    })
    .join("\n");
  alert(`Previously saved events have been cancelled or modified:\n${eventList}`);
  unmatchedSavedEvents.forEach((key) => {state.savedEventsSet.delete(key);});
  persistSavedEvents(state.savedEventsSet);
}

let showSyncInfo = false;
function toggleSyncInfo() {
  if (showSyncInfo) {
    document.getElementById("syncInfo").innerHTML = "";
    showSyncInfo = false;
    return;
  }
  let tbody = Object.values(state.orgs).map(org => {
    let orgUrl = safeHttpUrl(org.url);
    let name = escapeHtml(org.org);
    let nameCell = orgUrl ? `<a href="${escapeHtml(orgUrl)}" target="_blank" rel="noopener">${name}</a>` : name;
    return `
      <tr>
        <td>${nameCell}</td>
        <td>${org.numEvents}</td>
        <td>${formatRelativeTime(org.syncTimeUTC)}</td>
      </tr>
    `;
  }).join("");
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

async function fetchAndNormalizeTrackdays() {
  const data = await fetchJson(TRACKDAYS_URL);
  let rawOrgs = data.orgs;
  let rawTracks = data.tracks;

  document.getElementById("eventInfoText").hidden = false;
  document.getElementById("eventInfoSpinner").hidden = true;

  state.tracks = rawTracks.reduce((obj, v) => {obj[v.nickname.toUpperCase()] = v; return obj;}, {});
  let orgList = rawOrgs.map(org => ({
    ...org,
    numEvents: org.events.length,
    events: org.events.map(e => ({...e, org: org.orgNickname, url: e.url || org.url})),
  }));
  let todayKey = todayIso();
  state.trackdays = orgList.flatMap(({events}) => events).map(td => {
    let parsed = parseIsoDate(td.date);
    let dateKey = parsed ? formatIsoUtcDate(parsed) : String(td.date || "");
    return {...td, dateKey, weekday: weekdayShort(dateKey)};
  }).filter((td) => td.dateKey >= todayKey);
  state.trackdays.sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  orgList = orgList.map(({events, ...item}) => ({
    ...item,
    syncTimeUTC: parseUtcTimestamp(item.syncTimeUTC),
    dropdownOption: new Option(item.org, item.orgNickname),
    dropdownSelected: (item.numEvents > 0),
  }));
  orgList.sort((a, b) => a.org.localeCompare(b.org));

  let lastSync = orgList.reduce((prev, curr) => prev.syncTimeUTC > curr.syncTimeUTC ? prev : curr).syncTimeUTC;
  document.getElementById("lastSyncMessage").innerText = formatRelativeTime(lastSync);
  document.getElementById("numTrackdays").innerText = state.trackdays.reduce((sum, td) => sum + [...td.eventType].filter(t => EVENT_TYPES[t]).length, 0);
  document.getElementById("numOrgs").innerText = new Set(state.trackdays.map(a => a.org)).size;

  state.orgs = orgList.reduce((result, org) => {
    result[org.orgNickname] = org;
    return result;
  }, {});
}

function setFilterToggle(buttonElement, enabled) {
  buttonElement.classList.toggle("on", enabled);
  buttonElement.setAttribute("aria-pressed", enabled ? "true" : "false");
}

function bindToggleGroup(pairs, {selectedSet, storageKey, onChange}) {
  let stored = readToggleCodes(storageKey);
  for (const [buttonElement, code] of pairs) {
    let enabled = stored.includes(code);
    setFilterToggle(buttonElement, enabled);
    if (enabled) selectedSet.add(code);
    buttonElement.addEventListener("click", () => {
      let nowEnabled = !selectedSet.has(code);
      if (nowEnabled) selectedSet.add(code);
      else selectedSet.delete(code);
      setFilterToggle(buttonElement, nowEnabled);
      writeToggleCodes(storageKey, selectedSet);
      if (onChange) onChange(nowEnabled, code);
    });
  }
}

function enableAllToggles(pairs, selectedSet, storageKey, allCodes) {
  for (const [buttonElement] of pairs) setFilterToggle(buttonElement, true);
  selectedSet.clear();
  allCodes.forEach(code => selectedSet.add(code));
  writeToggleCodes(storageKey, allCodes);
}

function wireFilterControls() {
  const vehiclePairs = [[showCarEventsButton, "C"], [showMotoEventsButton, "M"], [showSumoEventsButton, "S"]];
  const eventPairs = [[showTrackdaysToggleElement, "T"], [showSchoolsToggleElement, "S"], [showRacesToggleElement, "R"]];

  applyStoredHosts();
  orgSelectElement.addEventListener("change", () => {
    Array.from(orgSelectElement.options).forEach((opt) => {
      state.orgs[opt.value].dropdownSelected = opt.selected;
    });
    persistHosts();
    refresh({trackVisibility: true, popup: true, calendar: true});
  });

  ensureDefaultToggleCodes(STORAGE_KEYS.vehicleTypes, Object.keys(VEHICLE_TYPES));
  ensureDefaultToggleCodes(STORAGE_KEYS.eventTypes, Object.keys(EVENT_TYPES));

  bindToggleGroup(vehiclePairs, {
    selectedSet: state.selectedVehicleTypes,
    storageKey: STORAGE_KEYS.vehicleTypes,
    onChange() {
      if (state.selectedVehicleTypes.size > 0) {
        setHomeIcon(state.selectedVehicleTypes.has("C"));
      }
      refresh({trackVisibility: true, popup: true, calendar: true, dropdown: true});
    },
  });
  if (state.selectedVehicleTypes.size === 0 || state.selectedVehicleTypes.has("C")) {
    setHomeIcon(true);
  }

  bindToggleGroup(eventPairs, {
    selectedSet: state.selectedEventTypes,
    storageKey: STORAGE_KEYS.eventTypes,
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
    persistShowEmptyTracks(nowEnabled);
    refresh({trackVisibility: true});
  });
  setFilterToggle(
    showTracksWithoutEventsToggleElement,
    loadShowEmptyTracks(showTracksWithoutEventsToggleElement.classList.contains("on"))
  );

  exportSavedEventsElement.addEventListener("click", downloadSavedEventsICS);

  resetElement.addEventListener("click", () => {
    let savedEventsPrompt = [...state.savedEventsSet].sort((a, b) => {
      let [dateA] = a.split("|");
      let [dateB] = b.split("|");
      return dateA.localeCompare(dateB) || a.localeCompare(b);
    }).map((eventKey) => {
      let [date, org, track] = eventKey.split("|");
      return `${date} | ${track} | ${org}`;
    }).join("\n");
    if (state.savedEventsSet.size > 0 && confirm(`Also clear all saved events?\n\n${savedEventsPrompt}`)) {
      state.savedEventsSet.clear();
      clearSavedEvents();
    }

    clearStoredFilters();

    enableAllToggles(vehiclePairs, state.selectedVehicleTypes, STORAGE_KEYS.vehicleTypes, Object.keys(VEHICLE_TYPES));
    enableAllToggles(eventPairs, state.selectedEventTypes, STORAGE_KEYS.eventTypes, Object.keys(EVENT_TYPES));
    setHomeIcon(true);

    Object.values(state.orgs).forEach(org => org.dropdownSelected = (org.numEvents > 0));
    setFilterToggle(showTracksWithoutEventsToggleElement, true);
    showAllTrackMarkers();

    setCalendarRange(null, null);
    resetCalendarMonth();  // updateCalendar returns to the current month
    Array.from(daySelectElement.options).forEach((opt) => {
      opt.selected = true;
    });
    daySelectElement.loadOptions();
    unlockHome();
    resetHome(refresh);
  });
}

function wireStaticListeners() {
  wirePopupActions({
    onSaveEvent: onEventSaveToggle,
    onMissingEvent: reportMissingEvent,
    onRecordsTab: setRecordsOpen,
    onAddRecord: openRecordForm,
    onClearDateRange: clearCalendarDateFilter,
  });

  document.getElementById("lastSyncMessage").addEventListener("click", (event) => {
    event.preventDefault();
    toggleSyncInfo();
  });

  document.getElementById("calendar").addEventListener("click", (event) => {
    if (event.target.closest("[data-cal-clear-range]")) {
      clearCalendarDateFilter();
      return;
    }
    let star = event.target.closest(".event-save-star");
    if (!star) return;
    event.preventDefault();
    onEventSaveToggle(star);
  }, true);

  let dateFilterBar = document.getElementById("dateFilterBar");
  dateFilterBar.addEventListener("click", (event) => {
    if (event.target.closest("[data-cal-clear-range]")) {
      clearCalendarDateFilter();
      return;
    }
    if (!dateFilterBar.classList.contains("is-idle")) return;
    document.getElementById("calendar")?.scrollIntoView({behavior: "smooth", block: "start"});
  });
  dateFilterBar.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (!dateFilterBar.classList.contains("is-idle")) return;
    event.preventDefault();
    document.getElementById("calendar")?.scrollIntoView({behavior: "smooth", block: "start"});
  });

  const headerAd = document.getElementById("fotosort-ad");
  if (isHeaderAdClosed()) headerAd.hidden = true;
  document.getElementById("close-ad").addEventListener("click", () => {
    headerAd.hidden = true;
    markHeaderAdClosed();
  });
}

async function visualizeData() {
  try {
    // Lap records: PRELOAD_ALL_LAP_RECORDS in index-lap-records.js. Drop loadAllLapRecords from this
    // Promise.all (and set that flag false) to switch back to per-track loading on popup open.
    await Promise.all([fetchAndNormalizeTrackdays(), loadAllLapRecords()]);
    finishLapRecordsPreload();
    createTrackMarkers({
      onTrackOpen(trackKey) {
        if (trackKey !== state.lastOpenedTrack) resetRecordForm();
        state.lastOpenedTrack = trackKey;
        // Cache hit when PRELOAD_ALL_LAP_RECORDS; otherwise fetches this track (see index-lap-records.js).
        loadTrackRecords(trackKey);
      },
      onPopupOpen: syncOpenPopup,
    });
    wireHomeAndRadius(refresh);
    wireFilterControls();
    alertOnMissingSavedEvents();
    resetHome(refresh);
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

initIndexLapRecords({updateTrackPopup});
initIndexSuggest();
initCalendarMonth({updateCalendar, refresh});
wireStaticListeners();
getGPSLocation(refresh);
visualizeData();
