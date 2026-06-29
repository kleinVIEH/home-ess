'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { valuesEqual } = require('../src/output/engine');

test('Output-Readback vergleicht Zahlen unabhängig von MQTT-Darstellung', () => {
  assert.equal(valuesEqual('12.50', 12.5), true);
  assert.equal(valuesEqual('12,50', 12.5), true);
  assert.equal(valuesEqual('12.51', 12.5), false);
});

test('Output-Readback erkennt boolesche ioBroker-Darstellungen', () => {
  assert.equal(valuesEqual('true', true), true);
  assert.equal(valuesEqual(1, true), true);
  assert.equal(valuesEqual('0', false), true);
  assert.equal(valuesEqual(false, true), false);
});
