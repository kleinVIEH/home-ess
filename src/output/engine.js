'use strict';

// Output-Engine: schreibt berechnete interne Werte an ihre Ziel-Topics. Da die
// internen Werte abgeleitet sind (kein direkter Cache-Key), wird bei jeder
// Auswertung der aktuelle Wert-Katalog berechnet und je Output gegen den zuletzt
// publizierten Wert verglichen – nur Änderungen werden publiziert.
//
// Ausgelöst wird die Auswertung debounced bei MQTT-Wertänderungen (für Live-Werte
// wie Leistung/direkte Sonne) und zusätzlich periodisch (für langsame Energie-Summen).

const mqttClient = require('../mqtt/client');
const { listOutputs } = require('./outputs');
const { listInternalValues } = require('./internal-values');

const DEBOUNCE_MS = 1500;
const PERIODIC_MS = 60000;

let database = null;
let outputs = [];
let lastPublished = new Map(); // outputId -> zuletzt publizierter Wert
let unsubscribe = null;
let debounceTimer = null;
let periodicTimer = null;
let evaluating = false;

async function evaluate() {
  if (!database || evaluating) return;
  evaluating = true;
  try {
    if (!outputs.length) return;
    const values = await listInternalValues(database, mqttClient.getCache());
    const byId = new Map(values.map((entry) => [entry.id, entry]));
    for (const output of outputs) {
      const entry = byId.get(output.sourceId);
      if (!entry || entry.value == null) continue;
      if (lastPublished.get(output.id) === entry.value) continue;
      if (mqttClient.publish(output.targetTopic, entry.value)) {
        lastPublished.set(output.id, entry.value);
      }
    }
  } finally {
    evaluating = false;
  }
}

function scheduleEvaluate() {
  if (debounceTimer) return;
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    evaluate().catch(() => {});
  }, DEBOUNCE_MS);
}

async function reload() {
  if (!database) return [];
  outputs = await listOutputs(database);
  // Nach Konfigurationsänderung neu publizieren (z. B. geändertes Ziel-Topic).
  lastPublished = new Map();
  return outputs;
}

async function init(db) {
  database = db;
  await reload();
  if (!unsubscribe) unsubscribe = mqttClient.onValuesChanged(scheduleEvaluate);
  if (!periodicTimer) periodicTimer = setInterval(() => evaluate().catch(() => {}), PERIODIC_MS);
}

module.exports = { init, reload, evaluate };
