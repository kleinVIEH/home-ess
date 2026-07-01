'use strict';

// Generischer, schema-getriebener Editor für die Live-States eines Adapters
// (z. B. Modbus-Register). Der Adapter deklariert im Manifest einen stateEditor mit
// Spalten; hier werden Zeilen gegen dieses Schema normalisiert/validiert. Die
// Zeilen liegen in instance.settings[storageKey] und sind die WIRKLICHEN States,
// mit denen der Adapter arbeitet — Presets sind davon getrennt (nur Vorlagen).

function coerceCell(value, column) {
  if (column.type === 'number') {
    if (value === '' || value == null) return column.default === '' ? null : column.default;
    const n = Number(String(value).replace(',', '.'));
    return Number.isFinite(n) ? n : (column.default === '' ? null : column.default);
  }
  if (column.type === 'checkbox') {
    return value === true || value === 'true' || value === 1 || value === '1' || value === 'on';
  }
  if (column.type === 'select') {
    const allowed = column.options.map((o) => o.value);
    const str = value == null ? '' : String(value);
    if (allowed.includes(str)) return str;
    return column.default !== '' && allowed.includes(String(column.default)) ? String(column.default) : (allowed[0] || '');
  }
  return value == null ? '' : String(value);
}

// Rohzeile (aus Formular/Preset) auf eine saubere Zeile gemäß Spalten abbilden.
function normalizeRow(raw = {}, editor) {
  const row = {};
  for (const column of editor.columns) {
    const provided = Object.prototype.hasOwnProperty.call(raw, column.key);
    const value = provided ? raw[column.key] : column.default;
    row[column.key] = coerceCell(value, column);
  }
  return row;
}

// Eindeutiger Schlüssel einer Zeile. Bei zusammengesetztem Schlüssel (keyFields,
// z. B. unitId + address) werden die nicht-leeren Segmente mit '/' verbunden – das
// ergibt zugleich die mehrstufige State-Adresse (z. B. "1/batterie/soc").
function rowKey(row, editor) {
  const fields = editor.keyFields && editor.keyFields.length ? editor.keyFields : [editor.keyField];
  return fields
    .map((f) => String(row[f] == null ? '' : row[f]).trim())
    .filter((s) => s !== '')
    .join('/');
}

function rowName(row, editor) {
  const name = row[editor.nameField];
  return name == null || name === '' ? rowKey(row, editor) : String(name);
}

// Pflichtfelder + nicht-leerer Schlüssel. Liefert Liste von Fehlertexten (leer = ok).
function validateRow(row, editor) {
  const errors = [];
  if (!rowKey(row, editor)) errors.push(`${editor.keyField} darf nicht leer sein.`);
  for (const column of editor.columns) {
    if (!column.required) continue;
    const v = row[column.key];
    if (v == null || v === '') errors.push(`${column.label} ist erforderlich.`);
  }
  return errors;
}

// Aktuelle Zeilen einer Instanz (normalisiert).
function getRows(instance, editor) {
  const raw = instance && instance.settings ? instance.settings[editor.storageKey] : null;
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => normalizeRow(r, editor));
}

// Neue Settings mit ersetzter Zeilenliste (übrige Settings bleiben erhalten).
function withRows(instance, editor, rows) {
  return { ...(instance.settings || {}), [editor.storageKey]: rows };
}

module.exports = {
  coerceCell,
  normalizeRow,
  validateRow,
  rowKey,
  rowName,
  getRows,
  withRows,
};
