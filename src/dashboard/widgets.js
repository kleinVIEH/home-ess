'use strict';

// CRUD für Dashboard-Widgets. Ein Widget zeigt einen internen Wert (gleicher
// Katalog wie die Outputs) als Kachel. Widgets können einer Gruppe zugeordnet
// (group_id) und per Drag&Drop angeordnet werden (position).

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
}

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function normalizeWidgetRow(row = {}) {
  return {
    id: row.id,
    sourceId: row.source_id || '',
    groupId: row.group_id == null ? null : row.group_id,
    position: row.position == null ? 0 : row.position,
  };
}

async function listWidgets(db) {
  const rows = await dbAll(
    db,
    'SELECT id, source_id, group_id, position FROM dashboard_widgets ORDER BY position ASC, id ASC'
  );
  return rows.map(normalizeWidgetRow);
}

async function getWidget(db, id) {
  const row = await dbGet(
    db,
    'SELECT id, source_id, group_id, position FROM dashboard_widgets WHERE id = ?',
    [id]
  );
  return row ? normalizeWidgetRow(row) : null;
}

function parseGroupId(value) {
  if (value == null || value === '' || value === 'null') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeWidgetInput(input = {}) {
  return {
    sourceId: String(input.sourceId || '').trim(),
    groupId: parseGroupId(input.groupId),
  };
}

function validateWidgetInput(input) {
  const errors = [];
  if (!input.sourceId) errors.push('Bitte einen Wert auswählen.');
  return errors;
}

async function nextPosition(db) {
  const row = await dbGet(db, 'SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM dashboard_widgets');
  return row ? row.pos : 0;
}

async function createWidget(db, input) {
  const widget = normalizeWidgetInput(input);
  const errors = validateWidgetInput(widget);
  if (errors.length) {
    const error = new Error(errors[0]);
    error.validation = true;
    throw error;
  }

  const position = await nextPosition(db);
  const result = await dbRun(
    db,
    'INSERT INTO dashboard_widgets (source_id, group_id, position) VALUES (?, ?, ?)',
    [widget.sourceId, widget.groupId, position]
  );
  return getWidget(db, result.lastID);
}

async function updateWidget(db, id, input) {
  const widget = normalizeWidgetInput(input);
  const errors = validateWidgetInput(widget);
  if (errors.length) {
    const error = new Error(errors[0]);
    error.validation = true;
    throw error;
  }

  await dbRun(
    db,
    'UPDATE dashboard_widgets SET source_id = ?, group_id = ? WHERE id = ?',
    [widget.sourceId, widget.groupId, id]
  );
  return getWidget(db, id);
}

async function deleteWidget(db, id) {
  await dbRun(db, 'DELETE FROM dashboard_widgets WHERE id = ?', [id]);
}

// Neue Anordnung aus dem Drag&Drop persistieren: je Widget Gruppe und Position.
async function reorderWidgets(db, items) {
  for (let index = 0; index < (items || []).length; index += 1) {
    const item = items[index];
    const id = Number(item.id);
    if (!Number.isFinite(id)) continue;
    const groupId = parseGroupId(item.groupId);
    const position = Number.isFinite(Number(item.position)) ? Number(item.position) : index;
    await dbRun(db, 'UPDATE dashboard_widgets SET group_id = ?, position = ? WHERE id = ?', [
      groupId,
      position,
      id,
    ]);
  }
}

module.exports = {
  listWidgets,
  getWidget,
  createWidget,
  updateWidget,
  deleteWidget,
  reorderWidgets,
  normalizeWidgetInput,
};
