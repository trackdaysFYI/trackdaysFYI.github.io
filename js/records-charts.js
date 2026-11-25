let chartInstances = [];
let chartDrawId = 0;
let chartResizeObserver = null;
let plottedKey = "";
let plottedSections = [];

function clearRecordCharts() {
  chartDrawId++;
  plottedKey = "";
  plottedSections = [];
  disposeRecordCharts();
  let root = document.getElementById("lap-charts");
  if (!root) return;
  root.innerHTML = "";
  root.hidden = true;
}

function renderRecordCharts(shown, refRecord) {
  let root = document.getElementById("lap-charts");
  if (!root) return;
  let key = chartDataKey(shown);
  if (key === plottedKey && (chartInstances.length || root.hidden || root.querySelector(".lap-charts-note"))) {
    if (chartInstances.length) applyReference(refRecord);
    return;
  }
  let drawId = ++chartDrawId;
  plottedKey = "";
  plottedSections = [];
  disposeRecordCharts();
  if (!shown || !shown.length || !singleTrackSelected()) {
    root.innerHTML = "";
    root.hidden = true;
    plottedKey = key;
    return;
  }
  if (typeof echarts === "undefined") {
    root.hidden = false;
    root.innerHTML = `<p class="lap-charts-note">Charts could not be loaded.</p>`;
    plottedKey = key;
    return;
  }
  let colors = chartColors();
  let models = subtrackGroups(shown).map(([key, records]) => sectionModel(key, records));
  let showHeading = models.length > 1;
  root.hidden = false;
  root.innerHTML = models.map((model, index) => sectionHtml(model, showHeading, index, colors)).join("");
  requestAnimationFrame(() => {
    if (drawId !== chartDrawId) return;
    root.querySelectorAll(".lap-chart-section").forEach(section => {
      let model = models[Number(section.getAttribute("data-i"))];
      if (model) mountSection(section, model, refRecord, colors);
    });
    watchChartResize(root);
    plottedKey = key;
  });
}

function disposeRecordCharts() {
  chartInstances.forEach(chart => chart.dispose());
  chartInstances = [];
}

function watchChartResize(root) {
  if (typeof ResizeObserver !== "function") return;
  if (!chartResizeObserver) chartResizeObserver = new ResizeObserver(() => {
    chartInstances.forEach(chart => chart.resize());
  });
  chartResizeObserver.observe(root);
}

function sectionModel(key, records) {
  let valid = [];
  records.forEach(record => {
    let ms = validLapMs(record);
    if (ms == null) return;
    valid.push({
      record,
      ms,
      type: chartVehicleType(record),
    });
  });
  valid.sort((a, b) => a.ms - b.ms);
  let times = valid.map(item => item.ms);
  let classes = classBuckets(valid);
  let binning = times.length ? buildBins(valid) : null;
  return {
    key,
    valid,
    times,
    types: presentTypes(valid),
    classes,
    binning,
    labels: binning ? binning.bins.map(bin => formatChartMs(bin.start, 0)) : [],
    showHistogram: times.length >= 5,
    showEcdf: times.length >= 5,
    showBox: classes.show,
  };
}

function sectionHtml(model, showHeading, index, colors) {
  let heading = showHeading ? `<h2 class="lap-chart-heading">${escapeHtml(sectionTitle(model.key))}</h2>` : "";
  if (!model.times.length) {
    return `<section class="lap-chart-section" data-i="${index}">${heading}<p class="lap-charts-note">No lap times to plot.</p></section>`;
  }
  let cards = [];
  if (model.showEcdf) cards.push(chartCard("ecdf", "Percentile"));
  if (model.showHistogram) cards.push(chartCard("hist", "Distribution"));
  let gridClass = cards.length === 1 ? "lap-chart-grid is-single" : "lap-chart-grid";
  let grid = cards.length ? `<div class="${gridClass}">${cards.join("")}</div>` : "";
  let wide = [];
  if (model.showBox) {
    let height = model.classes.groups.length > 8 ? 340 : 270;
    wide.push(chartCard("box", "By class", { wide: true, height, key: typeKeyHtml(model.classes.types, colors) }));
  }
  return `<section class="lap-chart-section" data-i="${index}">${heading}${summaryHtml(model.times)}${grid}${wide.join("")}</section>`;
}

function chartCard(name, title, extra) {
  let wide = extra && extra.wide ? " lap-chart-wide" : "";
  let style = extra && extra.height ? ` style="height:${extra.height}px"` : "";
  let key = extra && extra.key ? extra.key : "";
  return `<figure class="lap-chart-card${wide}"><figcaption>${title}${key}</figcaption><div class="lap-chart" data-chart="${name}"${style}></div></figure>`;
}

function summaryHtml(times) {
  let rows = [
    ["Best", formatChartMs(times[0], 3)],
    ["p10", formatChartMs(percentile(times, 0.1), 3)],
    ["p25", formatChartMs(percentile(times, 0.25), 3)],
    ["Median", formatChartMs(percentile(times, 0.5), 3)],
    ["p75", formatChartMs(percentile(times, 0.75), 3)],
    ["p90", formatChartMs(percentile(times, 0.9), 3)],
    ["Records", String(times.length)],
  ];
  return `<dl class="lap-chart-summary">${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("")}</dl>`;
}

function typeKeyHtml(types, colors) {
  if (!types || types.length < 2) return "";
  let items = types.map(type => {
    return `<span class="lap-chart-key-item"><i style="background:${typeColor(colors, type)}"></i>${escapeHtml(typeName(type))}</span>`;
  }).join("");
  return `<span class="lap-chart-key">${items}</span>`;
}

function mountSection(section, model, refRecord, colors) {
  let refMs = referenceLapMs(refRecord, model.key);
  let refLabel = refMs == null ? "" : shortHolder(refRecord);
  let histEl = section.querySelector('[data-chart="hist"]');
  let ecdfEl = section.querySelector('[data-chart="ecdf"]');
  let boxEl = section.querySelector('[data-chart="box"]');
  plottedSections.push({
    model,
    hist: histEl ? mountChart(histEl, histogramOption(model, refMs, refLabel, colors)) : null,
    ecdf: ecdfEl ? mountChart(ecdfEl, ecdfOption(model, refMs, refLabel, colors)) : null,
  });
  if (boxEl) mountChart(boxEl, boxOption(model, colors));
}

function singleTrackSelected() {
  return typeof trackSelect !== "undefined" && !!trackSelect.value;
}

function mountChart(el, option) {
  let chart = echarts.init(el, null, { renderer: "canvas" });
  chart.setOption(option);
  chartInstances.push(chart);
  return chart;
}

function chartDataKey(shown) {
  if (!singleTrackSelected()) return "all-tracks";
  if (!shown || !shown.length) return "empty";
  return shown.map(record => [
    typeof recordKey === "function" ? recordKey(record) : record.recordId || "",
    record.time || "",
    record.vehicleType || "",
    record.vehicleClass || "",
    record.subtrack || "",
    String(record.track || "").toUpperCase(),
  ].join("\0")).sort().join("\n");
}

function applyReference(refRecord) {
  let colors = chartColors();
  plottedSections.forEach(section => {
    let model = section.model;
    let refMs = referenceLapMs(refRecord, model.key);
    let refLabel = refMs == null ? "" : shortHolder(refRecord);
    if (section.hist) replaceMarks(section.hist, histogramMarks(model, refMs, refLabel, colors), colors);
    if (section.ecdf) replaceMarks(section.ecdf, holderMarks(model, refMs, refLabel, colors), colors);
  });
}

function replaceMarks(chart, marks, colors) {
  let series = chart.getOption().series || [];
  let index = series.findIndex(item => item.name === "marks");
  if (!marks.length) {
    if (index < 0) return;
    chart.setOption({ series: patchSeries(series.length, index, { name: "marks", markLine: { data: [] } }) });
    return;
  }
  let next = markSeries(marks, colors);
  if (index < 0) {
    chart.setOption({ series: patchSeries(series.length + 1, series.length, next) });
    return;
  }
  chart.setOption({ series: patchSeries(series.length, index, { name: "marks", markLine: { data: marks } }) });
}

function patchSeries(length, index, patch) {
  let next = [];
  for (let i = 0; i < length; i++) next.push(i === index ? patch : {});
  return next;
}

function histogramOption(model, refMs, refLabel, colors) {
  let types = model.types;
  let legend = legendOption(types.map(typeName), colors);
  let series = types.map(type => ({
    name: typeName(type),
    type: "bar",
    stack: "times",
    data: model.binning.bins.map(bin => bin.counts[type] || 0),
    cursor: "default",
    itemStyle: { color: withAlpha(typeColor(colors, type), 0.92) },
  }));
  series.push(markSeries(histogramMarks(model, refMs, refLabel, colors), colors));
  return chartOption(colors, {
    legend,
    grid: chartGrid(legendVisible(legend), 8),
    tooltip: { show: false },
    xAxis: categoryAxis(model.labels, colors, {
      axisLabel: Object.assign(axisText(colors), { hideOverlap: true }),
    }),
    yAxis: valueAxis(colors, { minInterval: 1 }),
    series,
  });
}

function histogramMarks(model, refMs, refLabel, colors) {
  let bins = model.binning.bins;
  let labels = model.labels;
  let marks = [];
  let medianIdx = binIndex(bins, percentile(model.times, 0.5));
  let refIdx = refMs == null ? -1 : binIndex(bins, refMs);
  let ratio = idx => bins.length <= 1 ? 0 : idx / (bins.length - 1);
  if (medianIdx >= 0) marks.push(timeMark(labels[medianIdx], "Median", colors.muted, colors, ratio(medianIdx), "insideEndBottom", [0, 26]));
  if (refIdx >= 0) marks.push(timeMark(labels[refIdx], refLabel, colors.accent, colors, ratio(refIdx), "insideEndBottom", [0, 4]));
  return marks;
}

function holderMarks(model, refMs, refLabel, colors) {
  if (refMs == null) return [];
  let span = model.times[model.times.length - 1] - model.times[0];
  let ratio = span > 0 ? (refMs - model.times[0]) / span : 0;
  return [timeMark(refMs, refLabel, colors.accent, colors, ratio)];
}

function ecdfOption(model, refMs, refLabel, colors) {
  let lines = ecdfLines(model.valid, model.types, colors);
  let names = lines.map(line => line.name);
  let legend = legendOption(names, colors);
  let axis = secondRange(model.times);
  let series = lines.map(line => ({
    name: line.name,
    type: "line",
    step: "end",
    showSymbol: line.points.length <= 24,
    symbol: line.type === "M" ? "diamond" : "circle",
    symbolSize: 7,
    data: line.points,
    itemStyle: { color: line.color },
    lineStyle: { width: 2, color: line.color, type: line.type === "M" ? "dashed" : "solid" },
  }));
  let marks = holderMarks(model, refMs, refLabel, colors);
  if (marks.length) series.push(markSeries(marks, colors));
  return chartOption(colors, {
    legend,
    grid: chartGrid(legendVisible(legend), 8),
    tooltip: Object.assign(tooltipBase(colors), {
      trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: colors.muted, type: "dashed" } },
      formatter: items => ecdfTip(items, model.types.length > 1),
    }),
    xAxis: valueAxis(colors, {
      min: axis.min,
      max: axis.max,
      interval: axis.step,
      axisLabel: Object.assign(axisText(colors), {
        hideOverlap: true,
        formatter: value => formatChartMs(value, 0),
      }),
      splitLine: { show: false },
    }),
    yAxis: valueAxis(colors, {
      min: 0,
      max: 100,
      axisLabel: Object.assign(axisText(colors), { formatter: "{value}%" }),
    }),
    series,
  });
}

function ecdfLines(valid, types, colors) {
  let lines = [];
  types.forEach(type => {
    let items = valid.filter(item => item.type === type);
    if (items.length < 2) return;
    lines.push({
      type,
      name: typeName(type),
      color: typeColor(colors, type),
      points: ecdfPoints(items),
    });
  });
  if (!lines.length && valid.length >= 2) {
    lines.push({
      type: "",
      name: "Records",
      color: colors.text,
      points: ecdfPoints(valid),
    });
  }
  return lines;
}

function ecdfPoints(items) {
  let sorted = items.map(item => item.ms);
  let n = sorted.length;
  let points = [];
  for (let i = 0; i < n; i++) {
    if (i + 1 < n && sorted[i + 1] === sorted[i]) continue;
    // Span the ordered laps from 100% at the fastest to 0% at the slowest.
    let y = n === 1 ? 100 : (n - i - 1) / (n - 1) * 100;
    points.push([sorted[i], y]);
  }
  if (points.length) {
    points[0][1] = 100;
    points[points.length - 1][1] = 0;
  }
  return points;
}

function ecdfTip(items, multipleTypes) {
  return [].concat(items || []).filter(item => item && item.seriesName !== "marks" && item.value).map(item => {
    let ms = item.value[0];
    let pct = Math.round(item.value[1]);
    let subject = "records";
    if (multipleTypes) subject = item.seriesName === "Records" ? "these records" : `${String(item.seriesName).toLowerCase()} records`;
    return `${swatch(item.color)}${escapeHtml(formatChartMs(ms, 3))} is faster than ${pct}% of ${escapeHtml(subject)}`;
  }).join("<br>");
}

function boxOption(model, colors) {
  let groups = model.classes.groups;
  let labels = groups.map(group => classLabel(group, model.classes.includeType));
  let stats = groups.map(group => fiveNumber(group.items.map(item => item.ms)));
  let span = Math.max(...stats.map(row => row[4])) - Math.min(...stats.map(row => row[0]));
  let digits = tickDigits(span);
  let series = [{
    name: "By class",
    type: "boxplot",
    data: groups.map((group, index) => ({
      value: stats[index],
      count: group.items.length,
      itemStyle: {
        color: withAlpha(typeColor(colors, group.type), 0.4),
        borderColor: typeColor(colors, group.type),
        borderWidth: 1.5,
      },
    })),
    boxWidth: ["28%", 36],
  }];
  return chartOption(colors, {
    legend: { show: false },
    grid: chartGrid(false, labels.length > 4 ? 24 : 8),
    tooltip: Object.assign(tooltipBase(colors), {
      trigger: "item",
      formatter: params => boxTip(params, colors),
    }),
    xAxis: categoryAxis(labels, colors, {
      axisLabel: Object.assign(axisText(colors), {
        interval: 0,
        rotate: labels.length > 6 ? 28 : 0,
        hideOverlap: false,
      }),
    }),
    yAxis: valueAxis(colors, {
      scale: true,
      axisLabel: Object.assign(axisText(colors), { formatter: value => formatChartMs(value, digits) }),
    }),
    series,
  });
}

function boxTip(params, colors) {
  let value = boxValues(params);
  if (!value) return "";
  let count = params.data && params.data.count;
  let rows = [
    ["Fastest", value[0]],
    ["p25", value[1]],
    ["Median", value[2]],
    ["p75", value[3]],
    ["Slowest", value[4]],
  ];
  let times = rows.map(([label, ms]) => {
    return `<span>${label}</span><span style="text-align:right">${lapTimeDigits(boxLapTime(ms))}</span>`;
  }).join("");
  let rule = colors && colors.line ? colors.line : "rgba(255,255,255,0.22)";
  let head = `<div>${escapeHtml(params.name || "")}</div>`;
  let meta = count ? `<div>${count} records</div>` : "";
  let divider = `<div style="margin:6px 0 4px;border-top:1px solid ${rule}"></div>`;
  return `<div style="display:inline-block">${head}${meta}${divider}<div style="display:grid;grid-template-columns:auto auto;column-gap:16px;align-items:baseline">${times}</div></div>`;
}

function lapTimeDigits(text) {
  return [...text].map(ch => {
    if (ch >= "0" && ch <= "9") return `<span style="display:inline-block;width:1ch;text-align:center">${ch}</span>`;
    return escapeHtml(ch);
  }).join("");
}

function boxLapTime(ms) {
  let text = formatChartMs(ms, 3);
  if (text.includes(":")) return text;
  let [whole, frac] = text.split(".");
  return `0:${whole.padStart(2, "0")}${frac == null ? "" : "." + frac}`;
}

function boxValues(params) {
  let value = params.value || params.data;
  if (value && !Array.isArray(value) && Array.isArray(value.value)) value = value.value;
  if (!Array.isArray(value)) return null;
  if (value.length > 5) value = value.slice(value.length - 5);
  return value.length === 5 ? value : null;
}

function chartOption(colors, option) {
  option.backgroundColor = "transparent";
  option.animation = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  option.textStyle = { fontFamily: '"DM Sans", sans-serif', color: colors.text };
  option.color = [colors.car, colors.moto, colors.other];
  return option;
}

function chartGrid(showLegend, bottom) {
  return { left: 8, right: 16, top: showLegend ? 32 : 16, bottom, containLabel: true };
}

function valueAxis(colors, extra) {
  return Object.assign({
    type: "value",
    axisLabel: axisText(colors),
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } },
  }, extra);
}

function categoryAxis(labels, colors, extra) {
  return Object.assign({
    type: "category",
    data: labels,
    axisLabel: axisText(colors),
    axisLine: { lineStyle: { color: colors.line } },
    axisTick: { show: false },
  }, extra);
}

function legendOption(names, colors) {
  if (!names || names.length < 2) return { show: false };
  return {
    show: true,
    data: names,
    top: 0,
    left: 0,
    itemWidth: 14,
    itemHeight: 8,
    textStyle: { color: colors.muted, fontSize: 12 },
  };
}

function legendVisible(legend) {
  return !!(legend && legend.show !== false);
}

function tooltipBase(colors) {
  return {
    backgroundColor: "rgb(28, 32, 36)",
    borderColor: colors.line,
    textStyle: { color: colors.text, fontFamily: '"DM Sans", sans-serif' },
    confine: true,
  };
}

function axisText(colors) {
  return { color: colors.muted, fontSize: 11 };
}

function markSeries(marks, colors) {
  return {
    name: "marks",
    type: "line",
    data: [],
    silent: true,
    symbol: "none",
    lineStyle: { opacity: 0 },
    tooltip: { show: false },
    emphasis: { disabled: true },
    blur: {
      lineStyle: { opacity: 0 },
      label: { opacity: 1 },
    },
    markLine: {
      silent: true,
      symbol: "none",
      animation: false,
      data: marks,
      label: { color: colors.text, fontSize: 11 },
      emphasis: { disabled: true },
      blur: {
        label: { opacity: 1 },
        lineStyle: { opacity: 1 },
      },
    },
  };
}

function timeMark(xValue, label, color, colors, ratio, position, distance) {
  return {
    xAxis: xValue,
    label: {
      show: true,
      formatter: () => label,
      color: colors.text,
      fontSize: 11,
      position: position || "middle",
      rotate: 0,
      align: ratio > 0.7 ? "right" : "left",
      distance: distance == null ? 8 : distance,
      backgroundColor: "rgba(28, 32, 36, 0.88)",
      padding: [2, 4],
      borderRadius: 3,
    },
    lineStyle: { color, type: "dashed", width: 1.5 },
  };
}

function buildBins(valid) {
  let min = valid[0].ms;
  let max = valid[valid.length - 1].ms;
  let width = chooseBinWidth(max - min);
  let start = Math.floor(min / width) * width;
  let end = Math.ceil((max + width * 1e-6) / width) * width;
  if (end <= start) end = start + width;
  let bins = [];
  for (let edge = start; edge < end; edge += width) {
    bins.push({ start: edge, end: edge + width, counts: { C: 0, M: 0, "": 0 } });
  }
  valid.forEach(item => {
    let idx = Math.floor((item.ms - start) / width);
    if (idx >= bins.length) idx = bins.length - 1;
    if (idx < 0) idx = 0;
    bins[idx].counts[item.type] += 1;
  });
  return { width, bins };
}

function chooseBinWidth(span) {
  let widths = [1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000];
  if (!(span > 0)) return 1000;
  let choice = widths[widths.length - 1];
  let best = Infinity;
  for (let width of widths) {
    let count = Math.ceil(span / width);
    if (count > 18) continue;
    let score = Math.abs(count - 12);
    if (score < best) {
      best = score;
      choice = width;
    }
  }
  return choice;
}

function binIndex(bins, ms) {
  if (ms == null) return -1;
  for (let i = 0; i < bins.length; i++) {
    let last = i === bins.length - 1;
    if (ms >= bins[i].start && (ms < bins[i].end || (last && ms <= bins[i].end))) return i;
  }
  return -1;
}

function classBuckets(valid) {
  let map = new Map();
  valid.forEach(item => {
    let className = item.record.vehicleClass || "";
    let key = item.type + "\0" + className;
    if (!map.has(key)) map.set(key, { type: item.type, className, items: [] });
    map.get(key).items.push(item);
  });
  let groups = [...map.values()].filter(group => group.items.length >= 5);
  let types = ["C", "M", ""].filter(type => groups.some(group => group.type === type));
  let includeType = types.length > 1;
  groups.sort((a, b) => a.items[0].ms - b.items[0].ms || classLabel(a, includeType).localeCompare(classLabel(b, includeType)));
  return { includeType, groups, types, show: groups.length >= 2 };
}

function classLabel(group, includeType) {
  let name = group.className || "Unknown";
  if (!includeType) return name;
  return `${typeName(group.type)} · ${name}`;
}

function fiveNumber(sorted) {
  return [
    sorted[0],
    percentile(sorted, 0.25),
    percentile(sorted, 0.5),
    percentile(sorted, 0.75),
    sorted[sorted.length - 1],
  ];
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  let idx = (sorted.length - 1) * p;
  let lo = Math.floor(idx);
  let hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  let weight = idx - lo;
  return sorted[lo] * (1 - weight) + sorted[hi] * weight;
}

function referenceLapMs(refRecord, key) {
  if (!refRecord || layoutKey(refRecord) !== key) return null;
  return validLapMs(refRecord);
}

function layoutKey(record) {
  return [String(record.track || "").toUpperCase(), record.subtrack || ""].join("\0");
}

function sectionTitle(key) {
  let splitAt = key.indexOf("\0");
  let track = splitAt === -1 ? key : key.slice(0, splitAt);
  let subtrack = splitAt === -1 ? "" : key.slice(splitAt + 1);
  if (subtrack) return subtrack;
  return trackLabel(track);
}

function shortHolder(record) {
  let tag = raceTag(record);
  let name = String(record && record.holder || "Reference").trim() || "Reference";
  let full = tag ? `${name} ${tag}` : name;
  if (full.length <= 22) return full;
  let room = Math.max(1, 21 - (tag ? tag.length + 1 : 0));
  return `${name.slice(0, room)}…${tag ? " " + tag : ""}`;
}

function validLapMs(record) {
  let ms = timeToMs(record.time);
  if (ms === Number.MAX_SAFE_INTEGER) return null;
  return Math.round(ms);
}

function chartVehicleType(record) {
  return record.vehicleType === "C" || record.vehicleType === "M" ? record.vehicleType : "";
}

function presentTypes(items) {
  let found = new Set(items.map(item => item.type));
  return ["C", "M", ""].filter(type => found.has(type));
}

function typeName(type) {
  if (type === "C") return VEHICLE_LABELS.C || "Car";
  if (type === "M") return VEHICLE_LABELS.M || "Bike";
  return "Other";
}

function typeColor(colors, type) {
  if (type === "C") return colors.car;
  if (type === "M") return colors.moto;
  return colors.other;
}

function secondRange(times) {
  let step = 1000;
  let min = Math.floor(times[0] / step) * step;
  let max = Math.ceil(times[times.length - 1] / step) * step;
  if (min === times[0]) min -= step;
  if (max === times[times.length - 1]) max += step;
  if (max <= min) max = min + step;
  return { min, max, step };
}

function tickDigits(span) {
  if (span >= 60000) return 0;
  if (span >= 3000) return 1;
  return 3;
}

function formatChartMs(ms, digits) {
  ms = Math.round(Number(ms) || 0);
  let minutes = Math.floor(ms / 60000);
  let seconds = (ms % 60000) / 1000;
  let sec = seconds.toFixed(digits);
  if (Number(sec) >= 60) {
    minutes += 1;
    sec = (0).toFixed(digits);
  }
  if (!minutes) return sec;
  let parts = sec.split(".");
  let whole = parts[0].padStart(2, "0");
  return parts.length > 1 ? `${minutes}:${whole}.${parts[1]}` : `${minutes}:${whole}`;
}

function chartColors() {
  let style = getComputedStyle(document.documentElement);
  let pick = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  let accent = pick("--accent", "rgb(57, 115, 172)");
  let muted = pick("--muted", "rgb(176, 176, 176)");
  return {
    car: accent,
    moto: pick("--moto", "rgb(224, 164, 90)"),
    other: muted,
    accent,
    text: pick("--soft", "rgb(220, 220, 220)"),
    muted,
    line: pick("--line", "rgb(100, 100, 100)"),
  };
}

function withAlpha(color, alpha) {
  let match = String(color).match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (!match) return color;
  return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
}

function swatch(color) {
  let fill = typeof color === "string" ? color : "rgb(176, 176, 176)";
  return `<span style="display:inline-block;margin-right:6px;width:8px;height:8px;border-radius:2px;background:${fill}"></span>`;
}
