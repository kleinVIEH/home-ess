'use strict';

// Zentrale, wiederverwendbare Routine für den Wertekatalog. Statt eines langen
// Dropdowns wird eine kompakte Liste mit schmalen Zeilen und einklappbaren
// Kategorien (= Herkunft des Wertes) samt aktuellem Ist-Wert gerendert. Die
// Auswahl landet in einem versteckten Eingabefeld (`inputId`), sodass sich das
// Bauteil unverändert in bestehende Formulare einfügt.
//
// Eingebunden auf der Output-Seite (Dialog „Hinzufuegen") und im Dashboard
// (Dialog „Widget hinzufuegen").

const { escapeHtml } = require('./components');
const { VALUE_CATEGORIES } = require('../output/internal-values');

function groupByCategory(values) {
  const byCat = new Map();
  for (const value of values) {
    const cat = value.category || 'Sonstiges';
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push(value);
  }
  const known = VALUE_CATEGORIES.filter((cat) => byCat.has(cat));
  const extra = [...byCat.keys()].filter((cat) => !VALUE_CATEGORIES.includes(cat)).sort((a, b) => a.localeCompare(b, 'de'));
  return [...known, ...extra].map((cat) => ({
    name: cat,
    items: byCat.get(cat).slice().sort((a, b) => String(a.label).localeCompare(String(b.label), 'de')),
  }));
}

// renderValueCatalog({ values, inputId, name, selectedId, label })
// values: [{ id, label, display, category }]
function renderValueCatalog({ values = [], inputId, name, selectedId = '', label = 'Interner Wert' } = {}) {
  const fieldName = name || inputId;
  const groups = groupByCategory(values);
  const selected = values.find((value) => value.id === selectedId) || null;

  const categories = groups
    .map((group) => {
      const open = selected && group.items.some((item) => item.id === selectedId);
      const rows = group.items
        .map((item) => {
          const isSel = item.id === selectedId;
          return `              <button type="button" class="value-row${isSel ? ' is-selected' : ''}" data-id="${escapeHtml(item.id)}" data-label="${escapeHtml(item.label)}" onclick="valueCatalogSelect('${escapeHtml(inputId)}', this)">
                <span class="value-row-label">${escapeHtml(item.label)}</span>
                <span class="value-row-now">${escapeHtml(item.display == null ? '—' : item.display)}</span>
              </button>`;
        })
        .join('\n');
      return `            <div class="value-cat${open ? ' is-open' : ''}">
              <button type="button" class="value-cat-head" aria-expanded="${open ? 'true' : 'false'}" onclick="valueCatalogToggle(this)">
                <span class="value-cat-caret" aria-hidden="true">▸</span>
                <span class="value-cat-name">${escapeHtml(group.name)}</span>
                <span class="value-cat-count">${group.items.length}</span>
              </button>
              <div class="value-cat-body">
${rows}
              </div>
            </div>`;
    })
    .join('\n');

  const emptyHint = values.length
    ? ''
    : '<p class="muted form-hint">Noch keine internen Werte verfuegbar. Bitte zuerst MQTT-Quellen konfigurieren.</p>';

  return `          <div class="field-block value-catalog" id="catalog-${escapeHtml(inputId)}" data-input="${escapeHtml(inputId)}">
            <span>${escapeHtml(label)}</span>
            <input type="hidden" id="${escapeHtml(inputId)}" name="${escapeHtml(fieldName)}" value="${escapeHtml(selectedId)}">
            <div class="value-catalog-bar">
              <input type="text" class="value-catalog-search" placeholder="Wert suchen…" oninput="valueCatalogFilter('${escapeHtml(inputId)}', this.value)">
              <span class="value-catalog-selected${selected ? ' has-value' : ''}" id="${escapeHtml(inputId)}-selected">${selected ? escapeHtml(selected.label) : 'Kein Wert gewählt'}</span>
            </div>
            <div class="value-catalog-cats">
${categories}
            </div>
            ${emptyHint}
          </div>`;
}

// Gemeinsame Client-Logik. Wird einmalig in den Seiten-Script eingehängt und
// von beliebig vielen Katalog-Instanzen (über die inputId adressiert) genutzt.
function valueCatalogScript() {
  return `    function valueCatalogToggle(head) {
      var cat = head.parentNode;
      var open = cat.classList.toggle('is-open');
      head.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function valueCatalogSelect(inputId, row) {
      var catalog = document.getElementById('catalog-' + inputId);
      if (!catalog) return;
      var prev = catalog.querySelector('.value-row.is-selected');
      if (prev) prev.classList.remove('is-selected');
      row.classList.add('is-selected');
      var input = document.getElementById(inputId);
      if (input) input.value = row.getAttribute('data-id');
      var sel = document.getElementById(inputId + '-selected');
      if (sel) { sel.textContent = row.getAttribute('data-label'); sel.classList.add('has-value'); }
    }

    // Auswahl programmgesteuert setzen (z. B. beim Öffnen im Bearbeiten-Modus).
    function valueCatalogSync(inputId, valueId) {
      var catalog = document.getElementById('catalog-' + inputId);
      var input = document.getElementById(inputId);
      if (input) input.value = valueId || '';
      if (!catalog) return;
      var search = catalog.querySelector('.value-catalog-search');
      if (search) { search.value = ''; valueCatalogFilter(inputId, ''); }
      var prev = catalog.querySelector('.value-row.is-selected');
      if (prev) prev.classList.remove('is-selected');
      var sel = document.getElementById(inputId + '-selected');
      if (!valueId) {
        var openCats = catalog.querySelectorAll('.value-cat.is-open');
        for (var i = 0; i < openCats.length; i++) {
          openCats[i].classList.remove('is-open');
          var h = openCats[i].querySelector('.value-cat-head');
          if (h) h.setAttribute('aria-expanded', 'false');
        }
        if (sel) { sel.textContent = 'Kein Wert gewählt'; sel.classList.remove('has-value'); }
        return;
      }
      var row = catalog.querySelector('.value-row[data-id="' + valueId + '"]');
      if (row) {
        row.classList.add('is-selected');
        var cat = row.parentNode.parentNode;
        if (cat && cat.classList.contains('value-cat')) {
          cat.classList.add('is-open');
          var head = cat.querySelector('.value-cat-head');
          if (head) head.setAttribute('aria-expanded', 'true');
        }
        if (sel) { sel.textContent = row.getAttribute('data-label'); sel.classList.add('has-value'); }
      } else if (sel) {
        sel.textContent = 'Kein Wert gewählt';
        sel.classList.remove('has-value');
      }
    }

    function valueCatalogFilter(inputId, query) {
      var catalog = document.getElementById('catalog-' + inputId);
      if (!catalog) return;
      var q = (query || '').trim().toLowerCase();
      var cats = catalog.querySelectorAll('.value-cat');
      for (var i = 0; i < cats.length; i++) {
        var anyVisible = false;
        var rows = cats[i].querySelectorAll('.value-row');
        for (var j = 0; j < rows.length; j++) {
          var match = !q || rows[j].getAttribute('data-label').toLowerCase().indexOf(q) !== -1;
          rows[j].style.display = match ? '' : 'none';
          if (match) anyVisible = true;
        }
        cats[i].style.display = anyVisible ? '' : 'none';
        if (q && anyVisible) {
          cats[i].classList.add('is-open');
          var head = cats[i].querySelector('.value-cat-head');
          if (head) head.setAttribute('aria-expanded', 'true');
        }
      }
    }`;
}

module.exports = { renderValueCatalog, valueCatalogScript };
