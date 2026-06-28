'use strict';

const { EventEmitter } = require('events');
const mqtt = require('mqtt');
const {
  normalizeMqttTopic,
  ioBrokerIdToMqttTopic,
  mqttReadCandidates,
  mqttSubscribeCandidates,
  unwrapMqttPayload,
  isMeaningfulValue,
  isCommandTopic,
  parseValue,
} = require('./topics');

// Verbindungs-Manager für den ioBroker-MQTT-Broker. Hält eine einzige laufende
// Verbindung, abonniert konfigurierte Topics und cached eingehende Werte.
// Aufgebaut nach den Regeln in MQTT.md (clean-Session, Set beim connect leeren,
// Wildcard für Slash-States, exaktes Routing). Die Last-Schalt-Logik (Regel-
// Engine) setzt später auf dem hier gepflegten Wert-Cache auf.

let client = null;
let connected = false;
let lastError = null;

let subscribedTopics = new Set(); // Deduplizierung der Abos
const valueCache = new Map(); // cacheKey -> { value, receivedAt }
const topicRoutes = new Map(); // exaktes incomingTopic -> [{ cacheKey, configuredTopic }]

// Ad-hoc-Topics (Modul-Topics außerhalb der State-Definitionen).
// adhocRoutes: incomingCandidate -> cacheKey (alle Read-Varianten registriert)
// adhocConfigured: cacheKey -> configuredTopic (für Reconnect-Resubscription)
const adhocRoutes = new Map();
const adhocConfigured = new Map();

const events = new EventEmitter();
events.setMaxListeners(0);

// Konfigurierte States/Lasten. Wird später aus der DB gefüllt; aktuell leer.
let stateDefinitions = [];

function buildOptions(cfg) {
  return {
    username: cfg.username || undefined,
    password: cfg.password || undefined,
    clientId: 'homeess_' + Math.random().toString(16).slice(2),
    clean: true,
    reconnectPeriod: 5000,
    connectTimeout: 10000,
    keepalive: 60,
  };
}

// Routing-Tabelle aus den konfigurierten States neu aufbauen (nur exakte Topics).
function buildTopicRoutes() {
  topicRoutes.clear();
  for (const state of stateDefinitions) {
    for (const candidate of mqttReadCandidates(state.topic)) {
      const routes = topicRoutes.get(candidate) || [];
      routes.push({ cacheKey: String(state.id), configuredTopic: state.topic });
      topicRoutes.set(candidate, routes);
    }
  }
}

function subscribeTopic(topic) {
  const clean = normalizeMqttTopic(topic);
  if (!clean || subscribedTopics.has(clean) || !client) return;
  client.subscribe(clean, { qos: 0 }, (err) => {
    if (!err) subscribedTopics.add(clean);
  });
}

function subscribeAllTopics() {
  for (const state of stateDefinitions) {
    for (const candidate of mqttSubscribeCandidates(state.topic)) subscribeTopic(candidate);
  }
}

function handleMessage(topic, buffer) {
  const incomingTopic = normalizeMqttTopic(topic);
  const payload = unwrapMqttPayload(buffer.toString('utf8'));
  if (!isMeaningfulValue(payload)) return;
  const receivedAt = Date.now();
  const changedKeys = [];
  for (const route of topicRoutes.get(incomingTopic) || []) {
    valueCache.set(route.cacheKey, { value: payload, receivedAt });
    changedKeys.push(route.cacheKey);
  }
  const adhocKey = adhocRoutes.get(incomingTopic);
  if (adhocKey) {
    valueCache.set(adhocKey, { value: payload, receivedAt });
    if (!changedKeys.includes(adhocKey)) changedKeys.push(adhocKey);
  }
  if (changedKeys.length) {
    events.emit('values', { topic: incomingTopic, changedKeys, receivedAt });
  }
}

// Verbindung mit der übergebenen Konfiguration (neu) aufbauen.
function connect(cfg) {
  disconnect();
  buildTopicRoutes();

  const url = `mqtt://${cfg.host}:${cfg.port}`;
  client = mqtt.connect(url, buildOptions(cfg));

  client.on('connect', () => {
    connected = true;
    lastError = null;
    subscribedTopics = new Set(); // KRITISCH: bei jedem connect leeren (Auto-Reconnect)
    subscribeAllTopics();
    subscribeAllAdhocTopics();
    requestAllAdhocValues();
  });
  client.on('reconnect', () => {
    connected = false;
  });
  client.on('close', () => {
    connected = false;
  });
  client.on('error', (err) => {
    lastError = err.message;
  });
  client.on('message', (topic, buffer) => {
    if (client) handleMessage(topic, buffer);
  });

  return client;
}

function disconnect() {
  if (client) {
    client.end(true);
    client = null;
  }
  connected = false;
  subscribedTopics = new Set();
}

function getStatus() {
  return {
    connected,
    lastError,
    cachedValues: valueCache.size,
    subscriptions: subscribedTopics.size,
  };
}

function getCache() {
  return valueCache;
}

function onValuesChanged(listener) {
  events.on('values', listener);
  return () => events.off('values', listener);
}

// Konfigurierte States setzen und Routing/Abos neu aufbauen.
function setStateDefinitions(defs) {
  stateDefinitions = Array.isArray(defs) ? defs : [];
  buildTopicRoutes();
  if (connected) {
    subscribedTopics = new Set();
    subscribeAllTopics();
  }
}

// Wert an ein Ziel-Topic schreiben (ioBroker-Konvention aus MQTT.md):
// Command-Topics (_SET/.SET//SET) erhalten nur den Rohwert; normale States
// erhalten zusätzlich /set (Rohwert) und das Haupt-Topic als JSON {val, ack:false}.
function publish(targetTopic, value) {
  if (!client) return false;
  const baseTopic = ioBrokerIdToMqttTopic(normalizeMqttTopic(targetTopic));
  if (!baseTopic) return false;

  if (isCommandTopic(targetTopic)) {
    client.publish(baseTopic, String(value));
    return true;
  }

  client.publish(`${baseTopic}/set`, String(value));
  client.publish(baseTopic, JSON.stringify({ val: parseValue(value), ack: false }));
  return true;
}

// Einmaliger Verbindungstest (eigener, kurzlebiger Client) für die Settings-Seite.
function testConnection(cfg) {
  return new Promise((resolve) => {
    const url = `mqtt://${cfg.host}:${cfg.port}`;
    const testClient = mqtt.connect(url, {
      username: cfg.username || undefined,
      password: cfg.password || undefined,
      connectTimeout: 5000,
      reconnectPeriod: 0,
    });

    let settled = false;
    const done = (ok, message) => {
      if (settled) return;
      settled = true;
      testClient.end(true);
      resolve({ success: ok, message });
    };

    testClient.on('connect', () => done(true, 'MQTT Verbindung erfolgreich.'));
    testClient.on('error', (err) => done(false, 'Fehler: ' + err.message));
    setTimeout(() => done(false, 'Timeout beim Verbindungsaufbau.'), 6000);
  });
}

// Hilfsfunktionen für Ad-hoc-Abonnements ─────────────────────────────────

// Routen für alle Lese-Kandidaten eines konfigurierten Topics eintragen.
function registerAdhocRoutes(configuredTopic, cacheKey) {
  for (const candidate of mqttReadCandidates(configuredTopic)) {
    adhocRoutes.set(candidate, cacheKey);
  }
}

// Bei jedem Reconnect alle Ad-hoc-Topics mit vollständigen Subscribe-Kandidaten
// (inkl. Wildcard für Slash-eingebettete State-IDs) neu abonnieren.
function subscribeAllAdhocTopics() {
  for (const configuredTopic of adhocConfigured.values()) {
    for (const sub of mqttSubscribeCandidates(configuredTopic)) {
      subscribeTopic(sub);
    }
  }
}

// Aktive Wertanfrage (/get) für alle Ad-hoc-Topics.
function requestAllAdhocValues() {
  if (!client || !connected) return;
  for (const configuredTopic of adhocConfigured.values()) {
    for (const candidate of mqttReadCandidates(configuredTopic)) {
      client.publish(`${candidate}/get`, '');
    }
  }
}

// Öffentliche API: Topic für Ad-hoc-Empfang registrieren.
// Verwendet mqttReadCandidates für Routing (Punkt/Slash/Adapter-Varianten) und
// mqttSubscribeCandidates für das eigentliche Abo (inkl. Wildcard bei Slash-States).
function subscribeAdHoc(configuredTopic, cacheKey) {
  const clean = normalizeMqttTopic(configuredTopic);
  if (!clean || !cacheKey) return;

  registerAdhocRoutes(clean, cacheKey);
  adhocConfigured.set(cacheKey, clean);

  if (connected) {
    for (const sub of mqttSubscribeCandidates(clean)) subscribeTopic(sub);
    for (const candidate of mqttReadCandidates(clean)) {
      client.publish(`${candidate}/get`, '');
    }
  }
}

function unsubscribeAdHoc(cacheKey) {
  const configuredTopic = adhocConfigured.get(cacheKey);
  if (!configuredTopic) return;
  for (const candidate of mqttReadCandidates(configuredTopic)) {
    adhocRoutes.delete(candidate);
  }
  adhocConfigured.delete(cacheKey);
}

module.exports = {
  connect,
  disconnect,
  getStatus,
  getCache,
  onValuesChanged,
  setStateDefinitions,
  subscribeAdHoc,
  unsubscribeAdHoc,
  publish,
  testConnection,
};
