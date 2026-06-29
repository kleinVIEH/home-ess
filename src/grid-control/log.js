'use strict';

// Persistentes, begrenztes Audit-Log der Grid-Control. Jede erkannte
// Wertänderung, jeder kritische Zustand und jede ausgeführte Aktion wird mit
// Zeitstempel, Kategorie (info/action/critical) und dem zugehörigen
// Werte-Schnappschuss festgehalten. Über Seiten abrufbar (Seite 1 = neueste).

const MAX_ENTRIES = 2000; // harte Obergrenze; ältere Einträge werden beschnitten
const PAGE_SIZE = 100;

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, (err) => (err ? reject(err) : resolve())));
}
function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || []))));
}
function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))));
}

async function initLog(db) {
  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS grid_control_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      values_text TEXT
    )`
  );
}

async function appendLog(db, category, message, values) {
  await dbRun(
    db,
    'INSERT INTO grid_control_log (ts, category, message, values_text) VALUES (?, ?, ?, ?)',
    [Date.now(), category, String(message), values == null ? '' : String(values)]
  );
  // Auf MAX_ENTRIES beschneiden: alles unterhalb des MAX_ENTRIES-jüngsten Eintrags löschen.
  await dbRun(
    db,
    `DELETE FROM grid_control_log WHERE id <= (
       SELECT id FROM grid_control_log ORDER BY id DESC LIMIT 1 OFFSET ?
     )`,
    [MAX_ENTRIES]
  );
}

async function readLog(db, page = 1) {
  const p = Math.max(1, Math.floor(Number(page) || 1));
  const countRow = await dbGet(db, 'SELECT COUNT(*) AS n FROM grid_control_log');
  const total = countRow ? countRow.n : 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(p, totalPages);
  const offset = (safePage - 1) * PAGE_SIZE;
  const rows = await dbAll(
    db,
    'SELECT id, ts, category, message, values_text FROM grid_control_log ORDER BY id DESC LIMIT ? OFFSET ?',
    [PAGE_SIZE, offset]
  );
  return {
    page: safePage,
    pageSize: PAGE_SIZE,
    total,
    totalPages,
    entries: rows.map((r) => ({
      id: r.id,
      ts: r.ts,
      category: r.category,
      message: r.message,
      values: r.values_text || '',
    })),
  };
}

module.exports = { initLog, appendLog, readLog, PAGE_SIZE, MAX_ENTRIES };
