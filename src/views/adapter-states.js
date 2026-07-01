'use strict';

const { renderLayout } = require('./layout');
const { escapeHtml, statusText } = require('./components');
const { rowKey } = require('../adapters/state-editor');

function keyFieldsOf(editor) {
  return editor.keyFields && editor.keyFields.length ? editor.keyFields : [editor.keyField];
}
function keyHeader(editor) {
  const byKey = new Map(editor.columns.map((c) => [c.key, c.label]));
  return keyFieldsOf(editor).map((k) => byKey.get(k) || k).join(' / ');
}

// Verwaltungs-Unterseite für die Live-States einer Adapter-Instanz (generisch aus
// dem stateEditor-Schema). Tabelle der angelegten States + Formular zum Anlegen/
// Bearbeiten + (optional) Preset-Panel zum Laden/Speichern/Hochladen.

function renderColumnField(column, value) {
  const id = `col-${escapeHtml(column.key)}`;
  const req = column.required ? ' required' : '';
  let control;
  if (column.type === 'checkbox') {
    const checked = value === true || value === 'true' || value === 1 || value === '1';
    control = `<input type="checkbox" id="${id}" name="${escapeHtml(column.key)}" value="1"${checked ? ' checked' : ''}>`;
    return `              <label class="field-block" style="flex-direction:row; align-items:center; gap:8px;">${control}<span>${escapeHtml(column.label)}</span></label>`;
  }
  if (column.type === 'select') {
    const opts = column.options.map((o) => `<option value="${escapeHtml(o.value)}"${String(value) === o.value ? ' selected' : ''}>${escapeHtml(o.label)}</option>`).join('');
    control = `<select id="${id}" name="${escapeHtml(column.key)}"${req}>${opts}</select>`;
  } else {
    const type = column.type === 'number' ? 'number' : 'text';
    const step = column.type === 'number' ? ' step="any"' : '';
    control = `<input type="${type}"${step} id="${id}" name="${escapeHtml(column.key)}" value="${escapeHtml(value == null ? '' : value)}"${req} data-no-state-picker>`;
  }
  return `              <label class="field-block" for="${id}"><span>${escapeHtml(column.label)}${column.required ? ' *' : ''}</span>${control}${column.hint ? `<small>${escapeHtml(column.hint)}</small>` : ''}</label>`;
}

function renderRowsTable(editor, rows) {
  if (!rows.length) {
    return '<p class="muted">Noch keine States angelegt. Lege manuell welche an oder lade ein Preset.</p>';
  }
  const keySet = new Set(keyFieldsOf(editor));
  const detailCols = editor.columns.filter((c) => !keySet.has(c.key) && c.key !== editor.nameField);
  const body = rows.map((row) => {
    const key = rowKey(row, editor);
    const details = detailCols
      .map((c) => `${escapeHtml(c.label)}: ${escapeHtml(row[c.key] === '' || row[c.key] == null ? '–' : row[c.key])}`)
      .join(' · ');
    return `              <tr>
                <td><code>${escapeHtml(key)}</code></td>
                <td>${escapeHtml(row[editor.nameField] == null ? '' : row[editor.nameField])}</td>
                <td class="muted" style="font-size:12px;">${details}</td>
                <td style="white-space:nowrap;">
                  <button type="button" class="module-toggle-btn" onclick="editRow('${escapeHtml(key)}')">Bearbeiten</button>
                  <button type="button" class="module-toggle-btn button-danger" onclick="deleteRow('${escapeHtml(key)}')">Löschen</button>
                </td>
              </tr>`;
  }).join('\n');
  return `          <table class="states-edit-table">
            <thead><tr><th>${escapeHtml(keyHeader(editor))}</th><th>${escapeHtml(editor.nameField)}</th><th>Details</th><th></th></tr></thead>
            <tbody>
${body}
            </tbody>
          </table>`;
}

function renderPresetPanel(adapter, instance, editor, presets) {
  if (!editor.presets) return '';
  const list = presets.length
    ? presets.map((p) => `              <div class="adapter-instance-row" style="display:flex; align-items:center; gap:8px; padding:8px 0; border-top:1px solid rgba(0,0,0,0.08);">
                <span style="flex:1;"><strong>${escapeHtml(p.name)}</strong>${p.device ? ` <span class="muted">(${escapeHtml(p.device)})</span>` : ''}<br><span class="muted" style="font-size:0.85em;">${p.count} Einträge${p.description ? ' · ' + escapeHtml(p.description) : ''}</span></span>
                <a class="module-toggle-btn" href="/adapter/instance/${instance.id}/presets/${encodeURIComponent(p.file)}">Laden …</a>
              </div>`).join('\n')
    : '              <p class="muted">Keine Presets im Verzeichnis <code>presets/</code> gefunden.</p>';

  return `        <div class="settings-card">
          <div class="settings-card-head">
            <h2>Presets</h2>
            <p class="settings-card-hint">Presets sind Vorlagen. Beim Laden wählst du, welche Einträge als States in dieser Instanz angelegt werden.</p>
          </div>
          <div class="adapter-instances">
${list}
          </div>
          <div class="field-grid" style="margin-top:14px;">
            <form method="POST" action="/adapter/instance/${instance.id}/presets/save" class="settings-form" style="display:flex; gap:8px; align-items:flex-end;">
              <label class="field-block" style="flex:1;"><span>Aktuelle States als Preset speichern</span>
                <input type="text" name="name" placeholder="Preset-Name" required data-no-state-picker></label>
              <button type="submit">Speichern</button>
            </form>
            <div class="field-block">
              <span>Preset von PC hochladen (.json)</span>
              <div style="display:flex; gap:8px;">
                <input type="file" id="presetUpload" accept="application/json,.json" style="flex:1;">
                <button type="button" onclick="uploadPreset()">Hochladen</button>
              </div>
              <small class="muted" id="uploadMsg"></small>
            </div>
          </div>
        </div>`;
}

function renderAdapterStates({ adapter, instance, editor, rows = [], presets = [], message = '', error = '' } = {}) {
  const fields = editor.columns.map((c) => renderColumnField(c, c.default)).join('\n');
  const rowsJson = JSON.stringify(rows).replace(/</g, '\\u003c');

  const body = `        <h1>${escapeHtml(adapter.name)} – ${escapeHtml(instance.name)}: ${escapeHtml(editor.label)}</h1>
        <p class="muted" style="margin-bottom:16px;">Adresse: <code>${escapeHtml(adapter.prefix)}://${escapeHtml(instance.name)}/</code> · <a href="/adapter/instance/${instance.id}">Einstellungen</a></p>
        ${message ? statusText(message, 'success') : ''}
        ${error ? statusText(error) : ''}

        <div class="settings-card">
          <div class="settings-card-head"><h2>Angelegte States</h2></div>
          ${renderRowsTable(editor, rows)}
        </div>

        <form method="POST" action="/adapter/instance/${instance.id}/states/save" class="settings-form">
          <div class="settings-card">
            <div class="settings-card-head"><h2 id="editTitle">${escapeHtml(editor.label)} anlegen</h2></div>
            <input type="hidden" name="originalKey" id="originalKey" value="">
            <div class="field-grid">
${fields}
            </div>
            <div class="button-row">
              <button type="button" class="module-toggle-btn" onclick="resetRowForm()">Neu</button>
              <button type="submit">Speichern</button>
            </div>
          </div>
        </form>

${renderPresetPanel(adapter, instance, editor, presets)}

        <form method="POST" action="/adapter/instance/${instance.id}/states/delete" id="deleteForm" style="display:none;">
          <input type="hidden" name="key" id="deleteKey">
        </form>`;

  const script = `
    var EDITOR_ROWS = ${rowsJson};
    var EDITOR_KEYFIELDS = ${JSON.stringify(keyFieldsOf(editor))};
    var EDITOR_COLS = ${JSON.stringify(editor.columns.map((c) => ({ key: c.key, type: c.type })))};

    function rowKeyOf(r) {
      return EDITOR_KEYFIELDS.map(function (f) { return String(r[f] == null ? '' : r[f]).trim(); })
        .filter(function (s) { return s !== ''; }).join('/');
    }
    function setField(col, value) {
      var el = document.getElementById('col-' + col.key);
      if (!el) return;
      if (col.type === 'checkbox') el.checked = (value === true || value === 'true' || value === 1 || value === '1');
      else el.value = (value == null ? '' : value);
    }
    function editRow(key) {
      var row = EDITOR_ROWS.find(function (r) { return rowKeyOf(r) === String(key); });
      if (!row) return;
      EDITOR_COLS.forEach(function (col) { setField(col, row[col.key]); });
      document.getElementById('originalKey').value = key;
      document.getElementById('editTitle').textContent = 'Bearbeiten: ' + key;
      window.scrollTo({ top: document.getElementById('editTitle').getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' });
    }
    function resetRowForm() {
      EDITOR_COLS.forEach(function (col) {
        var el = document.getElementById('col-' + col.key);
        if (!el) return;
        if (col.type === 'checkbox') el.checked = false; else el.value = '';
      });
      document.getElementById('originalKey').value = '';
      document.getElementById('editTitle').textContent = ${JSON.stringify(editor.label + ' anlegen')};
    }
    function deleteRow(key) {
      if (!confirm('State „' + key + '" löschen?')) return;
      document.getElementById('deleteKey').value = key;
      document.getElementById('deleteForm').submit();
    }
    function uploadPreset() {
      var input = document.getElementById('presetUpload');
      var msg = document.getElementById('uploadMsg');
      if (!input.files || !input.files[0]) { msg.textContent = 'Bitte eine Datei wählen.'; return; }
      var file = input.files[0];
      var reader = new FileReader();
      reader.onload = function () {
        var data;
        try { data = JSON.parse(reader.result); }
        catch (e) { msg.textContent = 'Keine gültige JSON-Datei.'; return; }
        fetch('/adapter/instance/${instance.id}/presets/upload', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, data: data })
        }).then(function (r) { return r.json().catch(function () { return { ok: r.ok }; }); })
          .then(function (res) {
            if (res && res.ok) window.location.reload();
            else msg.textContent = (res && res.error) || 'Upload fehlgeschlagen.';
          }).catch(function () { msg.textContent = 'Upload fehlgeschlagen.'; });
      };
      reader.readAsText(file);
    }
  `;

  return renderLayout({ title: `${adapter.name} – ${editor.label}`, activePath: '/adapter', body, script });
}

// Auswahlseite beim Laden eines Presets: Einträge mit Checkboxen.
function renderPresetSelection({ adapter, instance, editor, file, presetName, entries = [], message = '', error = '' } = {}) {
  const existingNote = '';
  const rows = entries.map((e, i) => `            <tr>
              <td><input type="checkbox" name="keys" value="${escapeHtml(e.key)}" id="pk-${i}"${e.exists ? '' : ' checked'}></td>
              <td><label for="pk-${i}"><code>${escapeHtml(e.key)}</code></label></td>
              <td>${escapeHtml(e.name)}${e.exists ? ' <span class="module-status module-status--off">existiert</span>' : ''}</td>
              <td class="muted" style="font-size:12px;">${escapeHtml(e.detail)}</td>
            </tr>`).join('\n');

  const body = `        <h1>Preset laden: ${escapeHtml(presetName)}</h1>
        <p class="muted" style="margin-bottom:16px;">Wähle die Einträge, die als States in <code>${escapeHtml(adapter.prefix)}://${escapeHtml(instance.name)}/</code> angelegt werden sollen.</p>
        ${message ? statusText(message, 'success') : ''}
        ${error ? statusText(error) : ''}
        <form method="POST" action="/adapter/instance/${instance.id}/presets/${encodeURIComponent(file)}/apply">
          <div class="settings-card">
            <div class="settings-card-head" style="display:flex; gap:12px; align-items:center;">
              <h2 style="flex:1;">${entries.length} Einträge</h2>
              <label style="display:flex; gap:6px; align-items:center;"><input type="checkbox" id="overwrite" name="overwrite" value="1"> Vorhandene überschreiben</label>
              <button type="button" class="module-toggle-btn" onclick="toggleAll(this)">Alle</button>
            </div>
            <table class="states-edit-table">
              <thead><tr><th></th><th>${escapeHtml(editor.keyField)}</th><th>${escapeHtml(editor.nameField)}</th><th>Details</th></tr></thead>
              <tbody>
${rows}
              </tbody>
            </table>
            ${existingNote}
            <div class="button-row">
              <a href="/adapter/instance/${instance.id}/states" class="module-toggle-btn">Abbrechen</a>
              <button type="submit">Ausgewählte übernehmen</button>
            </div>
          </div>
        </form>`;

  const script = `
    function toggleAll(btn) {
      var boxes = document.querySelectorAll('input[name="keys"]');
      var anyOff = Array.prototype.some.call(boxes, function (b) { return !b.checked; });
      for (var i = 0; i < boxes.length; i++) boxes[i].checked = anyOff;
    }
  `;
  return renderLayout({ title: `Preset laden – ${presetName}`, activePath: '/adapter', body, script });
}

module.exports = { renderAdapterStates, renderPresetSelection };
