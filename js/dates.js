const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const RTF = new Intl.RelativeTimeFormat("en", {numeric: "always"});

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isoParts(iso) {
  let match = ISO_DATE_RE.exec(String(iso || ""));
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function parseIsoDate(iso) {
  let parts = isoParts(iso);
  if (!parts) return null;
  let [y, m, d] = parts;
  let date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
}

export function formatIsoUtcDate(date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function todayIso() {
  let now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function todayUtcIso() {
  return formatIsoUtcDate(new Date());
}

export function compactIso(iso) {
  return String(iso || "").replace(/-/g, "");
}

export function monthKeyOf(iso) {
  return String(iso || "").slice(0, 7);
}

export function startOfMonth(monthOrIso) {
  return `${monthKeyOf(monthOrIso)}-01`;
}

export function endOfMonth(monthOrIso) {
  let [y, m] = monthKeyOf(monthOrIso).split("-").map(Number);
  return formatIsoUtcDate(new Date(Date.UTC(y, m, 0)));
}

export function nextMonthKey(monthKey) {
  let [y, m] = monthKey.split("-").map(Number);
  let date = new Date(Date.UTC(y, m, 1));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
}

export function addDays(iso, delta) {
  let date = parseIsoDate(iso);
  if (!date) return "";
  date.setUTCDate(date.getUTCDate() + delta);
  return formatIsoUtcDate(date);
}

export function addMonths(iso, delta) {
  let parts = isoParts(iso);
  if (!parts) return "";
  let [y, m, d] = parts;
  let first = new Date(Date.UTC(y, m - 1 + delta, 1));
  let lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, lastDay));
  return formatIsoUtcDate(first);
}

export function addYears(iso, delta) {
  return addMonths(iso, delta * 12);
}

export function dayOfWeek(iso) {
  let date = parseIsoDate(iso);
  return date ? date.getUTCDay() : -1;
}

export function weekdayShort(iso) {
  let dow = dayOfWeek(iso);
  return dow >= 0 ? WEEKDAYS_SHORT[dow] : "";
}

export function dayOfMonth(iso) {
  let parts = isoParts(iso);
  return parts ? parts[2] : 0;
}

export function formatMonthDay(iso, {longMonth = false} = {}) {
  let parts = isoParts(iso);
  if (!parts) return "";
  let months = longMonth ? MONTHS_LONG : MONTHS_SHORT;
  return `${months[parts[1] - 1]} ${parts[2]}`;
}

export function formatMonthDayYear(iso, {longMonth = false} = {}) {
  let parts = isoParts(iso);
  if (!parts) return "";
  let months = longMonth ? MONTHS_LONG : MONTHS_SHORT;
  return `${months[parts[1] - 1]} ${parts[2]}, ${parts[0]}`;
}

export function formatMonthYear(monthKey) {
  let [y, m] = String(monthKey || "").split("-").map(Number);
  if (!y || !m) return "";
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

export function formatDayHeading(iso) {
  return `${weekdayShort(iso)}, ${formatMonthDay(iso, {longMonth: true})}`;
}

export function parseUtcTimestamp(value) {
  if (value instanceof Date) return value;
  let text = String(value || "").trim().replace(" ", "T");
  if (!text) return new Date(NaN);
  if (!/(?:[Zz]|[+-]\d{2}:?\d{2})$/.test(text)) text += "Z";
  return new Date(text);
}

export function utcIcsTimestamp(date = new Date()) {
  return (
    `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}` +
    `T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`
  );
}

export function formatRelativeTime(targetDate) {
  let diffSec = Math.round((targetDate.getTime() - Date.now()) / 1000);
  let abs = Math.abs(diffSec);
  if (abs < 45) return diffSec <= 0 ? "a few seconds ago" : "in a few seconds";
  let mins = Math.round(diffSec / 60);
  if (Math.abs(mins) < 45) return RTF.format(mins, "minute");
  let hours = Math.round(diffSec / 3600);
  if (Math.abs(hours) < 22) return RTF.format(hours, "hour");
  let days = Math.round(diffSec / 86400);
  if (Math.abs(days) < 26) return RTF.format(days, "day");
  let months = Math.round(diffSec / (86400 * 30.436875));
  if (Math.abs(months) < 11) return RTF.format(months, "month");
  let years = Math.round(diffSec / (86400 * 365.2425));
  return RTF.format(years, "year");
}
