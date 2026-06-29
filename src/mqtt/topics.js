'use strict';

// Topic-Helfer für ioBroker-MQTT. Reine Funktionen, abgeleitet aus MQTT.md.
// Diese Schicht kapselt die Eigenheiten des ioBroker-Brokers (Punkt-/Slash-
// Notation, eingebettete Slashes, Command-Topics) für Lese- und Schreibpfade.

function normalizeMqttTopic(topic) {
  return String(topic || '')
    .trim()
    .replace(/^\/+/, '') // kein führender Slash
    .replace(/\/+/g, '/'); // keine doppelten Slashes
}

// State-ID (Punktnotation) -> MQTT-Topic (Slash-Notation).
function ioBrokerIdToMqttTopic(stateId) {
  return String(stateId || '')
    .replace(/^\/+/, '')
    .replace(/\./g, '/')
    .replace(/\/+/g, '/');
}

// "mqtt.0.Heizung.Vorlauf" -> Broker-Topic "Heizung/Vorlauf".
function mqttAdapterStateToBrokerTopic(topic) {
  const clean = normalizeMqttTopic(topic);
  const dotMatch = clean.match(/^mqtt\.\d+\.(.+)$/i);
  if (dotMatch) return ioBrokerIdToMqttTopic(dotMatch[1]);
  const slashMatch = clean.match(/^mqtt\/\d+\/(.+)$/i);
  if (slashMatch) return normalizeMqttTopic(slashMatch[1]);
  return '';
}

// Alle realistischen Lese-Pfade für ein konfiguriertes Topic (exakt, kein Wildcard).
function mqttReadCandidates(configuredTopic) {
  const clean = normalizeMqttTopic(configuredTopic);
  if (!clean) return [];
  const slashVariant = ioBrokerIdToMqttTopic(clean);
  const adapterVariant = mqttAdapterStateToBrokerTopic(clean);
  const result = new Set([clean]);
  if (slashVariant !== clean) result.add(slashVariant);
  if (adapterVariant && adapterVariant !== clean) result.add(adapterVariant);
  return Array.from(result);
}

// Wildcard-Abo für State-IDs mit eingebettetem Slash (Modbus/Victron-Bug).
function mqttSlashStateWildcard(configuredTopic) {
  const clean = normalizeMqttTopic(configuredTopic);
  const firstSlash = clean.indexOf('/');
  if (firstSlash === -1) return '';
  const dotPrefix = clean.slice(0, firstSlash);
  const lastDot = dotPrefix.lastIndexOf('.');
  if (lastDot === -1) return '';
  const base = dotPrefix.slice(0, lastDot);
  const slashBase = ioBrokerIdToMqttTopic(base);
  return slashBase ? `${slashBase}/#` : '';
}

// Alle Abo-Pfade (Lese-Kandidaten + ggf. Wildcard) für ein konfiguriertes Topic.
function mqttSubscribeCandidates(configuredTopic) {
  const clean = normalizeMqttTopic(configuredTopic);
  if (!clean) return [];
  const candidates = new Set(mqttReadCandidates(clean));
  const wildcard = mqttSlashStateWildcard(clean);
  if (wildcard) candidates.add(wildcard);
  return Array.from(candidates);
}

function isCommandTopic(topic) {
  const upper = normalizeMqttTopic(topic).toUpperCase();
  return upper.endsWith('.SET') || upper.endsWith('/SET') || upper.endsWith('_SET');
}

// Auspacken einer ioBroker-MQTT-Nachricht inkl. ack-Flag.
//   { value, ack } – ack ist true/false (aus dem JSON) oder null (kein JSON-Wrap).
// In ioBroker bedeutet ack:true den BESTÄTIGTEN Ist-Zustand, ack:false einen
// reinen Schreibwunsch/Kommando. Letzteres ist u. a. das Echo unserer eigenen
// Schreibvorgänge auf dem Haupt-Topic und darf NICHT als Readback gelten.
function unwrapMqttMessage(raw) {
  const text = String(raw);
  if (!text || (text[0] !== '{' && text[0] !== '[')) return { value: text, ack: null };
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && 'val' in parsed) {
      return { value: parsed.val, ack: typeof parsed.ack === 'boolean' ? parsed.ack : null };
    }
  } catch (_) {
    /* kein gültiges JSON */
  }
  return { value: text, ack: null };
}

// Auspacken des ioBroker-JSON-Formats { val, ack, ... }; sonst Rohstring.
function unwrapMqttPayload(raw) {
  return unwrapMqttMessage(raw).value;
}

function isMeaningfulValue(value) {
  const text = String(value == null ? '' : value).trim();
  return text !== '' && text.toLowerCase() !== 'null' && text.toLowerCase() !== 'nan';
}

// Typrichtiger Wert für das val-Feld beim JSON-Publish.
function parseValue(value) {
  const text = String(value);
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text !== '' && Number.isFinite(Number(text))) return Number(text);
  return text;
}

module.exports = {
  normalizeMqttTopic,
  ioBrokerIdToMqttTopic,
  mqttAdapterStateToBrokerTopic,
  mqttReadCandidates,
  mqttSlashStateWildcard,
  mqttSubscribeCandidates,
  isCommandTopic,
  unwrapMqttMessage,
  unwrapMqttPayload,
  isMeaningfulValue,
  parseValue,
};
