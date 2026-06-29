'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  batteryRemainingKwh, batteryUsableStoredKwh, batteryTimeToLimitHours,
  batteryStatus, updateBatteryDailyState,
} = require('../src/batterie/config');
const sqlite3 = require('sqlite3').verbose();

const config = {
  capacityAh: 200,
  batteryType: 'lifepo4',
  cellCount: 16,
  lowerVoltage: 44.8,
  upperVoltage: 55.2,
};

test('freie Batteriekapazität wird aus Nennenergie und fehlendem SoC berechnet', () => {
  assert.equal(batteryRemainingKwh(config, 100), 0);
  assert.equal(batteryRemainingKwh(config, 50), 5.12);
  assert.equal(batteryRemainingKwh(config, '75,0'), 2.56);
});

test('freie Batteriekapazität begrenzt SoC und verwirft fehlende Messwerte', () => {
  assert.equal(batteryRemainingKwh(config, 110), 0);
  assert.equal(batteryRemainingKwh(config, -10), 10.24);
  assert.equal(batteryRemainingKwh(config, null), null);
});

test('nutzbare Energie endet am dynamischen Mindest-SoC', () => {
  assert.equal(batteryUsableStoredKwh(config, 50, 20), 3.072);
  assert.equal(batteryUsableStoredKwh(config, 50, 30), 2.048);
  assert.equal(batteryUsableStoredKwh(config, 10, 20), 0);
});

test('Restzeit folgt der aktuellen Lade- oder Entladerichtung', () => {
  assert.equal(batteryTimeToLimitHours(config, 50, 20, 1024), 5);
  assert.equal(batteryTimeToLimitHours(config, 50, 20, -1024), 3);
  assert.equal(batteryTimeToLimitHours(config, 50, 20, 0), null);
  assert.equal(batteryTimeToLimitHours(config, null, 20, 1024), null);
});

test('Batteriestatus leitet die gewünschten Schwellen aus dem Mindest-SoC ab', () => {
  const status = batteryStatus({ minSoc: 10 }, { soc: 60, power: -500 });
  assert.equal(status.discharging, true);
  assert.equal(status.charge, false);
  assert.equal(status.emptySoc, 10);
  assert.equal(status.reserveSoc, 37);
  assert.equal(status.halfChargedSoc, 55);
  assert.equal(status.good, true);
  assert.equal(status.halfCharged, true);
  assert.equal(status.high, false);
  assert.equal(status.full, false);
});

test('Charged today bleibt bis zum nächsten lokalen Tag gesetzt', async () => {
  const db = new sqlite3.Database(':memory:');
  await new Promise((resolve, reject) => db.exec(`
    CREATE TABLE battery_daily_state (
      id INTEGER PRIMARY KEY, day_key TEXT NOT NULL, charged_today INTEGER NOT NULL
    );
  `, (err) => err ? reject(err) : resolve()));
  assert.equal(await updateBatteryDailyState(db, '2026-06-29', false), false);
  assert.equal(await updateBatteryDailyState(db, '2026-06-29', true), true);
  assert.equal(await updateBatteryDailyState(db, '2026-06-29', false), true);
  assert.equal(await updateBatteryDailyState(db, '2026-06-30', false), false);
  await new Promise((resolve) => db.close(resolve));
});
