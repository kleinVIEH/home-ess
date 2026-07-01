'use strict';

// Generische Preset-Verwaltung für Adapter mit stateEditor. Ein Preset ist eine
// JSON-Vorlage (im presets/-Verzeichnis des Adapters), aus der ausgewählte Zeilen
// als Live-States in die Instanz übernommen werden. Presets sind NICHT die
// Live-States — sie dienen nur dem Anlegen, ohne Adressen abtippen zu müssen.
// Format-Regelwerk: das jeweilige PRESET.md im Adapterverzeichnis.

const fs = require('fs');
const path = require('path');
const { normalizeRow, validateRow, rowKey, rowName } = require('./state-editor');

const SUPPORTED_FORMAT = 1;
const FILE_RE = /^[a-z0-9][a-z0-9_-]*\.json$/i;

function presetsDir(manifest) {
  return manifest.presetsDir;
}

// Schlüssel des Zeilen-Arrays im Preset = storageKey des Editors (z. B. registers).
function rowsKey(editor) {
  return editor.storageKey;
}

function safeFileName(name) {
  let base = String(name || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!base) base = 'preset';
  return `${base}.json`;
}

function isSafeFile(file) {
  return typeof file === 'string' && FILE_RE.test(file) && !file.includes('/') && !file.includes('\\');
}

function listPresets(manifest, editor) {
  const dir = presetsDir(manifest);
  let entries = [];
  try {
    entries = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.json'));
  } catch (_) {
    return [];
  }
  const result = [];
  for (const file of entries) {
    const data = readPreset(manifest, file);
    if (!data) continue;
    const rows = Array.isArray(data[rowsKey(editor)]) ? data[rowsKey(editor)] : [];
    result.push({
      file,
      name: data.name ? String(data.name) : file,
      device: data.device ? String(data.device) : '',
      manufacturer: data.manufacturer ? String(data.manufacturer) : '',
      description: data.description ? String(data.description) : '',
      count: rows.length,
    });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

function readPreset(manifest, file) {
  if (!isSafeFile(file)) return null;
  const full = path.join(presetsDir(manifest), file);
  try {
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (_) {
    return null;
  }
}

// Preset-Inhalt prüfen und Zeilen normalisieren/validieren.
// -> { ok, error?, rows:[{row,key,name,errors}], skipped:Number }
function validatePresetData(data, editor) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: 'Kein gültiges Preset-Objekt.' };
  }
  const format = Number(data.presetFormat);
  if (!Number.isInteger(format) || format > SUPPORTED_FORMAT) {
    return { ok: false, error: `Nicht unterstützte presetFormat (${data.presetFormat}).` };
  }
  const rawRows = data[rowsKey(editor)];
  if (!Array.isArray(rawRows) || !rawRows.length) {
    return { ok: false, error: `Feld "${rowsKey(editor)}" fehlt oder ist leer.` };
  }
  const rows = [];
  const seen = new Set();
  let skipped = 0;
  for (const raw of rawRows) {
    const row = normalizeRow(raw, editor);
    const key = rowKey(row, editor);
    const errors = validateRow(row, editor);
    if (errors.length || seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    rows.push({ row, key, name: rowName(row, editor) });
  }
  if (!rows.length) return { ok: false, error: 'Keine gültigen Einträge im Preset.' };
  return { ok: true, rows, skipped };
}

function savePreset(manifest, fileName, data) {
  const dir = presetsDir(manifest);
  fs.mkdirSync(dir, { recursive: true });
  const safe = isSafeFile(fileName) ? fileName : safeFileName(fileName);
  fs.writeFileSync(path.join(dir, safe), JSON.stringify(data, null, 2));
  return safe;
}

// Preset-Objekt aus den aktuellen Instanz-Zeilen erzeugen (für „als Preset speichern").
function buildPreset(rows, editor, meta = {}) {
  return {
    presetFormat: SUPPORTED_FORMAT,
    name: meta.name || 'Eigenes Preset',
    description: meta.description || '',
    author: meta.author || '',
    [rowsKey(editor)]: rows,
  };
}

module.exports = {
  SUPPORTED_FORMAT,
  safeFileName,
  isSafeFile,
  listPresets,
  readPreset,
  validatePresetData,
  savePreset,
  buildPreset,
};
