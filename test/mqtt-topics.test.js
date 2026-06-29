'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { unwrapMqttMessage, unwrapMqttPayload } = require('../src/mqtt/topics');

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
