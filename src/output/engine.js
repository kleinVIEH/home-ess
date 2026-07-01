'use strict';

// Geschlossene Output-Regelschleife: Ein gesendeter Wert gilt erst dann als
// erfolgreich, wenn ioBroker ihn auf dem Ziel-State bestätigt zurückmeldet.
// Eigene ack:false-Schreib-Echos werden bereits im MQTT-Client verworfen.

const mqttClient = require('../mqtt/client');
const { normalizeMqttTopic, isCommandTopic } = require('../mqtt/topics');
const { listOutputs } = require('./outputs');
const { listInternalValues } = require('./internal-values');

const DEBOUNCE_MS = 1000;
const VERIFY_MS = 30000;
const RETRY_MS = 10000;

let database = null;
let outputs = [];
let lastAttempts = new Map(); // outputId -> { value, at }
let statuses = new Map(); // outputId -> { state, desired, actual, checkedAt }
let registeredReadbacks = new Map(); // cacheKey -> topic
let verificationRequestedAt = new Map(); // cacheKey -> Zeitpunkt der letzten /get-Anfrage
let unsubscribe = null;
let debounceTimer = null;
let verifyTimer = null;
let verifyEvaluateTimer = null;
let evaluating = false;

function readbackKey(topic) {
  return `output.readback:${normalizeMqttTopic(topic)}`;
}

function comparable(value) {
  if (typeof value === 'boolean') return { type: 'boolean', value };
  if (typeof value === 'number' && Number.isFinite(value)) return { type: 'number', value };
  const text = String(value == null ? '' : value).trim();
  const lower = text.toLowerCase();
  if (lower === 'true' || lower === 'false') return { type: 'boolean', value: lower === 'true' };
  if (text !== '' && Number.isFinite(Number(text.replace(',', '.')))) {
    return { type: 'number', value: Number(text.replace(',', '.')) };
  }
  return { type: 'string', value: text };
}

function valuesEqual(actual, desired) {
  const left = comparable(actual);
  const right = comparable(desired);
  if (left.type === 'number' && right.type === 'number') {
    return Math.abs(left.value - right.value) <= 0.000001;
  }
  if (left.type === 'boolean' && right.type === 'number') return Number(left.value) === right.value;
  if (left.type === 'number' && right.type === 'boolean') return left.value === Number(right.value);
  if (left.type === 'boolean' && right.type === 'boolean') return left.value === right.value;
  return String(left.value) === String(right.value);
}

function mayRetry(outputId, desired, now) {
  const previous = lastAttempts.get(outputId);
  return !previous || !valuesEqual(previous.value, desired) || now - previous.at >= RETRY_MS;
}

async function evaluate() {
  if (!database || evaluating) return;
  evaluating = true;
  try {
    if (!outputs.length) return;
    const values = await listInternalValues(database, mqttClient.getCache());
    const byId = new Map(values.map((entry) => [entry.id, entry]));
    const cache = mqttClient.getCache();
    const connected = mqttClient.getStatus().connected;
    const now = Date.now();

    for (const output of outputs) {
      if (isCommandTopic(output.targetTopic)) {
        statuses.set(output.id, { state: 'unsupported', desired: null, actual: null, checkedAt: now });
        continue;
      }
      const entry = byId.get(output.sourceId);
      if (!entry || entry.value == null) {
        statuses.set(output.id, { state: 'no-value', desired: null, actual: null, checkedAt: now });
        continue;
      }
      const readback = cache.get(readbackKey(output.targetTopic));
      const actual = readback ? readback.value : null;
      const requestedAt = verificationRequestedAt.get(readbackKey(output.targetTopic)) || 0;
      const freshReadback = readback && Number(readback.receivedAt || 0) >= requestedAt;
      if (freshReadback && valuesEqual(actual, entry.value)) {
        statuses.set(output.id, { state: 'confirmed', desired: entry.value, actual, checkedAt: now });
        continue;
      }

      const state = connected ? (freshReadback ? 'mismatch' : 'waiting') : 'disconnected';
      statuses.set(output.id, { state, desired: entry.value, actual, checkedAt: now });
      if (!connected || !mayRetry(output.id, entry.value, now)) continue;
      if (mqttClient.publish(output.targetTopic, entry.value)) {
        lastAttempts.set(output.id, { value: entry.value, at: now });
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

function verifyNow() {
  const requestedAt = Date.now();
  for (const cacheKey of registeredReadbacks.keys()) {
    if (mqttClient.requestAdHocValue(cacheKey)) verificationRequestedAt.set(cacheKey, requestedAt);
  }
  if (verifyEvaluateTimer) clearTimeout(verifyEvaluateTimer);
  // Kurzes Fenster für die Broker-Antwort; eingehende Werte lösen zusätzlich
  // selbst eine entprellte Auswertung aus.
  verifyEvaluateTimer = setTimeout(() => {
    verifyEvaluateTimer = null;
    evaluate().catch(() => {});
  }, 1000);
}

async function reload() {
  if (!database) return [];
  const nextOutputs = await listOutputs(database);
  const needed = new Map();
  for (const output of nextOutputs) {
    if (!isCommandTopic(output.targetTopic)) needed.set(readbackKey(output.targetTopic), output.targetTopic);
  }

  for (const cacheKey of registeredReadbacks.keys()) {
    if (!needed.has(cacheKey)) mqttClient.unsubscribeAdHoc(cacheKey);
  }
  for (const [cacheKey, topic] of needed) {
    if (!registeredReadbacks.has(cacheKey)) mqttClient.subscribeAdHoc(topic, cacheKey);
  }
  registeredReadbacks = needed;
  verificationRequestedAt = new Map();
  outputs = nextOutputs;
  lastAttempts = new Map();
  statuses = new Map();
  verifyNow();
  return outputs;
}

async function init(db) {
  database = db;
  await reload();
  if (!unsubscribe) unsubscribe = mqttClient.onValuesChanged(scheduleEvaluate);
  if (!verifyTimer) verifyTimer = setInterval(verifyNow, VERIFY_MS);
  evaluate().catch(() => {});
}

function getStatus(outputId) {
  return statuses.get(Number(outputId)) || { state: 'waiting', desired: null, actual: null, checkedAt: null };
}

module.exports = { init, reload, evaluate, verifyNow, getStatus, valuesEqual };
