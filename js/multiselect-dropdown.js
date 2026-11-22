var style = document.createElement("style");
style.setAttribute("id", "multiselect_dropdown_styles");
style.textContent = `
.multiselect-dropdown{
  border-radius: 0px;
  border: solid 1px var(--line, rgb(100,100,100));
  position: relative;
}
.multiselect-dropdown span.optext, .multiselect-dropdown span.placeholder{
  display:inline-block;
  cursor: pointer;
}
.multiselect-dropdown span.placeholder{
  color: var(--muted, rgb(176, 176, 176));
}
.multiselect-dropdown span.optext{
  background-color: transparent;
  color: white;
}
.multiselect-dropdown-list-wrapper{
  z-index: 100;
  padding: 0.45rem;
  border-radius: 12px;
  border: 1px solid var(--line, rgb(100,100,100));
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.45);
  display: none;
  margin: 0;
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  background: rgb(28, 32, 36);
  color: var(--soft, rgb(220, 220, 220));
}
.multiselect-dropdown-list-wrapper .multiselect-dropdown-search{
  display: block;
  width: 100%;
  box-sizing: border-box;
  margin: 0 0 0.4rem;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--line, rgb(100,100,100));
  border-radius: 8px;
  background: rgb(16, 18, 21);
  color: white;
  font: inherit;
  font-size: 0.85rem;
  line-height: 1.3;
  text-align: left;
  user-select: text;
  -webkit-user-select: text;
}
.multiselect-dropdown-search::placeholder{color: var(--muted, rgb(176, 176, 176));}
.multiselect-dropdown-search:focus{outline: 2px solid var(--accent, rgb(57, 115, 172)); outline-offset: 1px; border-color: transparent;}
.multiselect-dropdown-list{
  text-align: left;
  padding: 0;
  height: auto;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: rgb(130, 130, 130) transparent;
}
.multiselect-dropdown-list::-webkit-scrollbar {width: 6px;}
.multiselect-dropdown-list::-webkit-scrollbar-thumb {background-color: rgb(130,130,130); border-radius:3px;}
.multiselect-dropdown-list div{
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0;
  padding: 0.1rem 0.4rem;
  border-radius: 6px;
  cursor: pointer;
  line-height: 1.2;
}
.multiselect-dropdown-list label{flex: 1 1 auto; min-width: 0; cursor: pointer;}
.multiselect-dropdown-list input{
  flex: 0 0 auto;
  width: 0.95rem;
  height: 0.95rem;
  margin: 0;
  accent-color: var(--accent, rgb(57, 115, 172));
  cursor: pointer;
}
.multiselect-dropdown-list div:hover{background-color: rgb(255 255 255 / 0.07);}
.multiselect-dropdown span.maxselected {width:100%;}
.multiselect-dropdown-all-selector{margin-bottom: 0.2rem; border-bottom: 1px solid rgb(255 255 255 / 0.12); border-radius: 6px 6px 0 0; font-weight: 650;}
`;
document.head.appendChild(style);

// The select stays the source of truth. loadOptions() rebuilds the rows from each option's selected flag.
function MultiselectDropdown(options) {
  let config = {
    height: "16rem",
    txtNothingSelected: "None Selected",
    txtNothingAvailable: "None Found",
    txtSelectedSuffix: "selected",
    txtAll: "Select All",
    txtSearch: "Search",
    ...options
  };

  document.querySelectorAll("select[multiple]").forEach((select) => {
    if (select.loadOptions) return;

    let showSearch = select.getAttribute("multiselect-search") === "true";
    let showAll = select.getAttribute("multiselect-select-all") === "true";
    let suffix = select.getAttribute("data-txtSelectedSuffix") || config.txtSelectedSuffix;
    let nothingSelected = select.getAttribute("data-txtNothingSelected") || config.txtNothingSelected;
    let nothingAvailable = select.getAttribute("data-txtNothingAvailable") || config.txtNothingAvailable;
    let allLabel = select.getAttribute("data-txtAll") || config.txtAll;
    let searchLabel = select.getAttribute("data-txtSearch") || config.txtSearch;

    let root = document.createElement("div");
    root.className = "multiselect-dropdown";
    select.style.display = "none";
    select.after(root);

    let listWrap = document.createElement("div");
    listWrap.className = "multiselect-dropdown-list-wrapper";
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
    root.append(listWrap);

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
      root.querySelectorAll("span.optext, span.placeholder").forEach((node) => node.remove());
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
      root.append(span);
    }

    function applySearch() {
      let query = search.value.toUpperCase();
      rows.forEach((row) => {
        let text = row.querySelector("label").textContent.toUpperCase();
        row.style.display = text.includes(query) ? "" : "none";
      });
      syncAll();
    }

    function emit() {
      syncAll();
      summary();
      select.dispatchEvent(new Event("change"));
    }

    function loadOptions() {
      list.replaceChildren();
      rows = [];
      allBox = null;
      if (showAll) {
        let allRow = document.createElement("div");
        allRow.className = "multiselect-dropdown-all-selector";
        allBox = document.createElement("input");
        allBox.type = "checkbox";
        let allText = document.createElement("label");
        allText.textContent = allLabel;
        allRow.append(allBox, allText);
        allRow.addEventListener("click", () => {
          let visible = visibleRows();
          if (!visible.length) {
            syncAll();
            return;
          }
          let selectAll = visible.some((row) => !row.option.selected);
          visible.forEach((row) => {
            row.option.selected = selectAll;
            paint(row);
          });
          emit();
        });
        list.append(allRow);
      }
      Array.from(select.options).forEach((option) => {
        let row = document.createElement("div");
        row.option = option;
        let box = document.createElement("input");
        box.type = "checkbox";
        let text = document.createElement("label");
        text.textContent = option.text;
        row.append(box, text);
        paint(row);
        row.addEventListener("click", () => {
          row.option.selected = !row.option.selected;
          paint(row);
          emit();
        });
        list.append(row);
        rows.push(row);
      });
      applySearch();
      summary();
    }

    select.loadOptions = loadOptions;

    function isOpen() {
      return listWrap.style.display === "block";
    }

    function close() {
      if (!isOpen()) return;
      listWrap.style.display = "none";
      root.classList.remove("is-open");
      summary();
    }

    function open() {
      document.querySelectorAll(".multiselect-dropdown.is-open").forEach((menu) => {
        if (menu !== root) menu.classList.remove("is-open");
      });
      document.querySelectorAll(".multiselect-dropdown-list-wrapper").forEach((menu) => {
        if (menu !== listWrap) menu.style.display = "none";
      });
      listWrap.style.display = "block";
      root.classList.add("is-open");
      if (showSearch) {
        search.focus();
        search.select();
      }
    }

    search.addEventListener("input", applySearch);
    root.addEventListener("click", (event) => {
      if (listWrap.contains(event.target)) return;
      if (isOpen()) close();
      else open();
    });
    document.addEventListener("click", (event) => {
      if (!root.contains(event.target)) close();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });

    loadOptions();
  });
}
