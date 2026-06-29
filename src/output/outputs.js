'use strict';

const { normalizeMqttTopic, isCommandTopic } = require('../mqtt/topics');

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

function normalizeOutputRow(row = {}) {
  return {
    id: row.id,
    sourceId: row.source_id || '',
    targetTopic: row.target_topic || '',
  };
}

async function listOutputs(db) {
  const rows = await dbAll(
    db,
    'SELECT id, source_id, target_topic FROM outputs ORDER BY id ASC'
  );
  return rows.map(normalizeOutputRow);
}

async function getOutput(db, id) {
  const row = await dbGet(
    db,
    'SELECT id, source_id, target_topic FROM outputs WHERE id = ?',
    [id]
  );
  return row ? normalizeOutputRow(row) : null;
}

function normalizeOutputInput(input = {}) {
  return {
    sourceId: String(input.sourceId || '').trim(),
    targetTopic: normalizeMqttTopic(input.targetTopic || ''),
  };
}

function validateOutputInput(input) {
  const errors = [];
  if (!input.sourceId) errors.push('Bitte einen internen Wert auswählen.');
  if (!input.targetTopic) errors.push('Bitte ein Ziel-Topic angeben.');
  if (input.targetTopic && isCommandTopic(input.targetTopic)) {
    errors.push('Command-Topics können nicht sicher zurückgelesen werden. Bitte einen bestätigten State als Ziel verwenden.');
  }
  return errors;
}

async function createOutput(db, input) {
  const output = normalizeOutputInput(input);
  const errors = validateOutputInput(output);
  if (errors.length) {
    const error = new Error(errors[0]);
    error.validation = true;
    throw error;
  }

  const result = await dbRun(
    db,
    'INSERT INTO outputs (source_id, target_topic) VALUES (?, ?)',
    [output.sourceId, output.targetTopic]
  );
  return getOutput(db, result.lastID);
}

async function updateOutput(db, id, input) {
  const output = normalizeOutputInput(input);
  const errors = validateOutputInput(output);
  if (errors.length) {
    const error = new Error(errors[0]);
    error.validation = true;
    throw error;
  }

  await dbRun(
    db,
    'UPDATE outputs SET source_id = ?, target_topic = ? WHERE id = ?',
    [output.sourceId, output.targetTopic, id]
  );
  return getOutput(db, id);
}

async function deleteOutput(db, id) {
  await dbRun(db, 'DELETE FROM outputs WHERE id = ?', [id]);
}

module.exports = {
  listOutputs,
  getOutput,
  createOutput,
  updateOutput,
  deleteOutput,
  normalizeOutputInput,
};
