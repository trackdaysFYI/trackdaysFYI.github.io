// The select stays the source of truth. refresh() rebuilds the rows from each option's selected flag.
let popoverSeq = 0;

export function createMultiselect(select, options) {
  let config = {
    height: "16rem",
    txtNothingSelected: "None Selected",
    txtNothingAvailable: "None Found",
    txtSelectedSuffix: "selected",
    txtAll: "Select All",
    txtSearch: "Search",
    ...options,
  };

  let showSearch = select.dataset.multiselectSearch === "true";
  let showAll = select.dataset.multiselectSelectAll === "true";
  let suffix = select.getAttribute("data-txtSelectedSuffix") || config.txtSelectedSuffix;
  let nothingSelected = select.getAttribute("data-txtNothingSelected") || config.txtNothingSelected;
  let nothingAvailable = select.getAttribute("data-txtNothingAvailable") || config.txtNothingAvailable;
  let allLabel = select.getAttribute("data-txtAll") || config.txtAll;
  let searchLabel = select.getAttribute("data-txtSearch") || config.txtSearch;

  let popoverId = `multiselect-popover-${select.id || ++popoverSeq}`;

  let root = document.createElement("div");
  root.className = "multiselect-dropdown";
  select.style.display = "none";
  select.after(root);

  let trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "multiselect-trigger";
  trigger.setAttribute("popovertarget", popoverId);
  trigger.setAttribute("aria-controls", popoverId);
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-haspopup", "listbox");

  let listWrap = document.createElement("div");
  listWrap.id = popoverId;
  listWrap.className = "multiselect-dropdown-list-wrapper";
  listWrap.setAttribute("popover", "auto");

  let list = document.createElement("div");
  list.className = "multiselect-dropdown-list";
  list.style.maxHeight = select.getAttribute("data-height") || config.height;

  let search = document.createElement("input");
  search.type = "text";
  search.className = "multiselect-dropdown-search form-control";
  search.placeholder = searchLabel;
  search.autocomplete = "off";
  search.spellcheck = false;
  search.style.display = showSearch ? "block" : "none";

  listWrap.append(search, list);
  root.append(trigger, listWrap);

  let rows = [];
  let allBox = null;

  function visibleRows() {
    return rows.filter((row) => row.style.display !== "none");
  }

  function paint(row) {
    row.classList.toggle("checked", row.option.selected);
    row.querySelector("input").checked = row.option.selected;
  }

  function syncAll() {
    if (!allBox) return;
    let visible = visibleRows();
    allBox.checked = visible.length > 0 && visible.every((row) => row.option.selected);
  }

  function summary() {
    let selected = Array.from(select.selectedOptions);
    let span = document.createElement("span");
    if (selected.length) {
      span.className = "optext maxselected";
      span.textContent = selected.length === select.options.length
        ? "All " + suffix
        : selected.length + "/" + select.options.length + " " + suffix;
    } else {
      span.className = "placeholder";
      let placeholder = select.getAttribute("placeholder");
      span.textContent = placeholder !== null
        ? placeholder
        : (select.options.length === 0 ? nothingAvailable : nothingSelected);
    }
    trigger.replaceChildren(span);
  }

  function applySearch() {
    let query = search.value.toUpperCase();
    rows.forEach((row) => {
      let text = row.querySelector("span").textContent.toUpperCase();
      row.style.display = text.includes(query) ? "" : "none";
    });
    syncAll();
  }

  function emit() {
    syncAll();
    summary();
    select.dispatchEvent(new Event("change"));
  }

  function positionPopover() {
    let rect = trigger.getBoundingClientRect();
    let gap = 6;
    let margin = 8;
    listWrap.style.minWidth = `${Math.round(rect.width)}px`;
    listWrap.style.width = showSearch ? `${Math.round(rect.width)}px` : "max-content";
    listWrap.style.maxWidth = `calc(100vw - ${margin * 2}px)`;

    let panelWidth = listWrap.getBoundingClientRect().width || rect.width;
    let left = rect.left;
    if (left + panelWidth > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - margin - panelWidth);
    }
    if (left < margin) left = margin;
    listWrap.style.left = `${Math.round(left)}px`;
    listWrap.style.top = `${Math.round(rect.bottom + gap)}px`;
  }

  function onViewportMove(event) {
    if (event.target === list) return;
    positionPopover();
  }

  function refresh() {
    list.replaceChildren();
    rows = [];
    allBox = null;
    if (showAll) {
      let allRow = document.createElement("label");
      allRow.className = "multiselect-dropdown-all-selector";
      allBox = document.createElement("input");
      allBox.type = "checkbox";
      let allText = document.createElement("span");
      allText.textContent = allLabel;
      allRow.append(allBox, allText);
      allBox.addEventListener("change", () => {
        let visible = visibleRows();
        if (!visible.length) {
          syncAll();
          return;
        }
        let selectAll = allBox.checked;
        visible.forEach((row) => {
          row.option.selected = selectAll;
          paint(row);
        });
        emit();
      });
      list.append(allRow);
    }
    Array.from(select.options).forEach((option) => {
      let row = document.createElement("label");
      row.option = option;
      let box = document.createElement("input");
      box.type = "checkbox";
      let text = document.createElement("span");
      text.textContent = option.text;
      row.append(box, text);
      paint(row);
      box.addEventListener("change", () => {
        row.option.selected = box.checked;
        paint(row);
        emit();
      });
      list.append(row);
      rows.push(row);
    });
    applySearch();
    summary();
  }

  search.addEventListener("input", applySearch);

  listWrap.addEventListener("beforetoggle", (event) => {
    if (event.newState === "open") positionPopover();
  });

  listWrap.addEventListener("toggle", (event) => {
    let open = event.newState === "open";
    root.classList.toggle("is-open", open);
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      positionPopover();
      window.addEventListener("scroll", onViewportMove, {passive: true, capture: true});
      window.addEventListener("resize", onViewportMove, {passive: true});
      if (showSearch) {
        search.focus();
        search.select();
      }
    } else {
      window.removeEventListener("scroll", onViewportMove, true);
      window.removeEventListener("resize", onViewportMove);
      summary();
    }
  });

  refresh();
  return {refresh};
}
