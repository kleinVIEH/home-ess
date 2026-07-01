'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  unwrapMqttMessage,
  unwrapMqttPayload,
  parseSchemeTopic,
  isSchemeTopic,
  buildSchemeTopic,
  normalizeMqttTopic,
} = require('../src/mqtt/topics');

test('normalizeMqttTopic zerstört das "://" von Adapter-Topics nicht', () => {
  // Regression: Kollabieren doppelter Slashes machte modbus://… zu modbus:/…,
  // wodurch das Topic nicht mehr als Adapter-Topic erkannt und fälschlich über
  // den Broker geroutet wurde → beim Konsumenten kam kein Wert an.
  const topic = 'modbus://victron/1/40001';
  assert.equal(normalizeMqttTopic(topic), topic);
  assert.equal(isSchemeTopic(normalizeMqttTopic(topic)), true);
  // Normale Broker-Topics werden weiterhin bereinigt.
  assert.equal(normalizeMqttTopic('/Heizung//Vorlauf/'), 'Heizung/Vorlauf/');
});

test('ack:true marks a confirmed broker state', () => {
  assert.deepEqual(unwrapMqttMessage('{"val":1,"ack":true}'), { value: 1, ack: true });
});

test('ack:false is recognised as a write command, not confirmed state', () => {
  // Das ist u. a. das Echo unserer eigenen Schreibvorgänge auf dem Haupt-Topic.
  assert.deepEqual(unwrapMqttMessage('{"val":0,"ack":false}'), { value: 0, ack: false });
});

test('plain values and ack-less JSON carry no ack flag', () => {
  assert.deepEqual(unwrapMqttMessage('50.1'), { value: '50.1', ack: null });
  assert.deepEqual(unwrapMqttMessage('{"val":5}'), { value: 5, ack: null });
  assert.deepEqual(unwrapMqttMessage('{"power":123}'), { value: '{"power":123}', ack: null });
});

test('unwrapMqttPayload stays backward compatible (value only)', () => {
  assert.equal(unwrapMqttPayload('{"val":42,"ack":true}'), 42);
  assert.equal(unwrapMqttPayload('hello'), 'hello');
});

test('parseSchemeTopic erkennt Adapter-Topics prefix://instanz/adresse', () => {
  assert.deepEqual(parseSchemeTopic('modbus://victron/register/123'), {
    scheme: 'modbus',
    instance: 'victron',
    address: 'register/123',
  });
  assert.deepEqual(parseSchemeTopic('demo://sim1'), {
    scheme: 'demo',
    instance: 'sim1',
    address: '',
  });
});

test('parseSchemeTopic liefert null für normale ioBroker-Topics', () => {
  assert.equal(parseSchemeTopic('battery.0.soc'), null);
  assert.equal(parseSchemeTopic('Heizung/Vorlauf'), null);
  assert.equal(parseSchemeTopic(''), null);
  assert.equal(isSchemeTopic('mqtt.0.foo'), false);
  assert.equal(isSchemeTopic('demo://sim1/x'), true);
});

test('buildSchemeTopic ist invers zu parseSchemeTopic', () => {
  const topic = buildSchemeTopic('Modbus', 'victron', 'reg/1');
  assert.equal(topic, 'modbus://victron/reg/1');
  const parsed = parseSchemeTopic(topic);
  assert.equal(buildSchemeTopic(parsed.scheme, parsed.instance, parsed.address), topic);
});
