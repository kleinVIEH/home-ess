'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { updateExtremeWindows, updateLoadSwitch, hasPhaseFailure, allPhasesPresent } = require('../src/grid-control/automation');
const { normalizeGridControlInput } = require('../src/grid-control/config');
const sqlite3 = require('sqlite3').verbose();
const mqttClient = require('../src/mqtt/client');
const modulesState = require('../src/modules');
const operatingState = require('../src/operating-state');

test('SoC remains off between the two independent switching windows', () => {
  assert.deepEqual(
    updateExtremeWindows(50, 20, 95, 2, false, false),
    { low: false, high: false, available: true }
  );
});

test('lower window releases only above its local hysteresis', () => {
  assert.equal(updateExtremeWindows(20, 20, 95, 2, false, false).low, true);
  assert.equal(updateExtremeWindows(21, 20, 95, 2, true, false).low, true);
  assert.equal(updateExtremeWindows(22, 20, 95, 2, true, false).low, false);
});

test('upper window releases only below its local hysteresis', () => {
  assert.equal(updateExtremeWindows(95, 20, 95, 2, false, false).high, true);
  assert.equal(updateExtremeWindows(94, 20, 95, 2, false, true).high, true);
  assert.equal(updateExtremeWindows(93, 20, 95, 2, false, true).high, false);
});

test('SoC hysteresis is limited to five percent', () => {
  assert.equal(normalizeGridControlInput({ socHysteresis: 99 }).socHysteresis, 5);
});

test('feed-in permission is disabled without a target topic', () => {
  assert.equal(normalizeGridControlInput({ feedInAllowed: 'on' }).feedInAllowed, false);
});

test('one failed phase is enough, but all phases are required for recovery', () => {
  assert.equal(hasPhaseFailure([50, 0, 50]), true);
  assert.equal(allPhasesPresent([50, 0, 50]), false);
  assert.equal(allPhasesPresent([50, null, 50]), false);
  assert.equal(allPhasesPresent([50, 50, 50]), true);
});

test('load switches on by any phase and off only below all three return thresholds', () => {
  const on = [4000, 4000, 4000];
  const off = [3000, 3000, 3000];
  assert.equal(updateLoadSwitch([4100, 1000, 1000], on, off, false), true);
  assert.equal(updateLoadSwitch([2500, 3200, 2500], on, off, true), true);
  assert.equal(updateLoadSwitch([2500, 2500, 2500], on, off, true), false);
});

test('emergency mode stays latched until grid frequency returns', async () => {
  const db = new sqlite3.Database(':memory:');
  const exec = (sql) => new Promise((resolve, reject) => db.exec(sql, (err) => err ? reject(err) : resolve()));
  await exec(`
    CREATE TABLE modules (key TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE operating_state (id INTEGER PRIMARY KEY, operating_level INTEGER, emergency_mode INTEGER);
    INSERT INTO operating_state VALUES (1, 2, 0);
    CREATE TABLE batterie_config (
      id INTEGER PRIMARY KEY, soc_topic TEXT, power_topic TEXT, voltage_topic TEXT,
      temperatur_topic TEXT, min_soc_topic TEXT, min_soc INTEGER, battery_type TEXT,
      cell_count INTEGER, lower_voltage REAL, upper_voltage REAL
    );
    INSERT INTO batterie_config VALUES (1, 'battery.soc', '', '', '', '', 20, 'lifepo4', 16, 44.8, 55.2);
    CREATE TABLE grid_control_config (
      id INTEGER PRIMARY KEY, grid_command_topic TEXT, feed_in_command_topic TEXT,
      temperature_warning_topic TEXT, temperature_warning_value TEXT,
      warning_text_topic TEXT, warning_active_topic TEXT, soc_enabled INTEGER,
      voltage_enabled INTEGER, temperature_enabled INTEGER, feed_in_allowed INTEGER,
      soc_lower_offset INTEGER, soc_upper_offset INTEGER, soc_hysteresis INTEGER,
      voltage_hysteresis REAL, grid_frequency_l1_topic TEXT,
      grid_frequency_l2_topic TEXT, grid_frequency_l3_topic TEXT,
      grid_detection_seconds INTEGER
    );
    INSERT INTO grid_control_config VALUES
      (1, 'grid.command', '', '', '1', 'warning.text', 'warning.active', 1, 0, 0, 0, 0, 5, 2, 0.5,
       'grid.frequency.l1', 'grid.frequency.l2', 'grid.frequency.l3', 1);
  `);
  await operatingState.init(db);
  await modulesState.setEnabled(db, 'grid-control', true);

  const cache = mqttClient.getCache();
  cache.clear();
  cache.set('mqtt.clockDate', { value: '2026-06-28', receivedAt: Date.now() });
  cache.set('batterie.soc', { value: 10, receivedAt: Date.now() });
  cache.set('gridcontrol.gridFrequencyL1', { value: 0, receivedAt: Date.now() });
  cache.set('gridcontrol.gridFrequencyL2', { value: 50, receivedAt: Date.now() });
  cache.set('gridcontrol.gridFrequencyL3', { value: 50, receivedAt: Date.now() });
  const published = [];
  const originalPublish = mqttClient.publish;
  mqttClient.publish = (topic, value) => { published.push([topic, value]); return true; };

  const automation = require('../src/grid-control/automation');
  await automation.runNow(db);
  await new Promise((resolve) => setTimeout(resolve, 1050));
  await automation.runNow(db);
  assert.equal(operatingState.getState().emergencyMode, true);
  assert.equal(automation.getState().gridActual, true);
  assert.equal(operatingState.getState().operatingLevel, 2);
  assert.equal(operatingState.getState().autark, false);
  assert.ok(published.some(([topic, value]) => topic === 'warning.text' && String(value).includes('Kein Netz')));

  cache.set('batterie.soc', { value: 50, receivedAt: Date.now() });
  await automation.runNow(db);
  assert.equal(operatingState.getState().emergencyMode, true);
  assert.equal(operatingState.getState().operatingLevel, 2);

  cache.set('batterie.soc', { value: 10, receivedAt: Date.now() });
  await automation.runNow(db);
  assert.equal(operatingState.getState().operatingLevel, 2);

  cache.set('gridcontrol.gridFrequencyL1', { value: 50, receivedAt: Date.now() });
  cache.set('gridcontrol.gridFrequencyL2', { value: 0, receivedAt: Date.now() });
  await automation.runNow(db);
  assert.equal(operatingState.getState().emergencyMode, true);

  cache.set('gridcontrol.gridFrequencyL2', { value: 50, receivedAt: Date.now() });
  await automation.runNow(db);
  assert.equal(operatingState.getState().emergencyMode, false);
  assert.equal(operatingState.getState().operatingLevel, 2);

  cache.set('batterie.soc', { value: 50, receivedAt: Date.now() });
  await automation.runNow(db);
  assert.equal(operatingState.getState().operatingLevel, 2);
  assert.equal(automation.getState().gridActual, false);
  assert.equal(operatingState.getState().autark, false);

  cache.set('mqtt.clockDate', { value: '2026-06-29', receivedAt: Date.now() });
  await automation.runNow(db);
  assert.equal(operatingState.getState().autark, true);

  cache.set('batterie.soc', { value: 10, receivedAt: Date.now() });
  await automation.runNow(db);
  assert.equal(operatingState.getState().autark, false);

  mqttClient.publish = originalPublish;
  await new Promise((resolve) => db.close(resolve));
});

test('grid command is verified against broker readback and re-asserted on divergence', async () => {
  const db = new sqlite3.Database(':memory:');
  const exec = (sql) => new Promise((resolve, reject) => db.exec(sql, (err) => err ? reject(err) : resolve()));
  await exec(`
    CREATE TABLE modules (key TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE operating_state (id INTEGER PRIMARY KEY, operating_level INTEGER, emergency_mode INTEGER);
    INSERT INTO operating_state VALUES (1, 2, 0);
    CREATE TABLE batterie_config (
      id INTEGER PRIMARY KEY, soc_topic TEXT, power_topic TEXT, voltage_topic TEXT,
      temperatur_topic TEXT, min_soc_topic TEXT, min_soc INTEGER, battery_type TEXT,
      cell_count INTEGER, lower_voltage REAL, upper_voltage REAL
    );
    INSERT INTO batterie_config VALUES (1, 'battery.soc', '', '', '', '', 20, 'lifepo4', 16, 44.8, 55.2);
    CREATE TABLE grid_control_config (
      id INTEGER PRIMARY KEY, grid_command_topic TEXT, feed_in_command_topic TEXT,
      temperature_warning_topic TEXT, temperature_warning_value TEXT,
      warning_text_topic TEXT, warning_active_topic TEXT, soc_enabled INTEGER,
      voltage_enabled INTEGER, temperature_enabled INTEGER, feed_in_allowed INTEGER,
      soc_lower_offset INTEGER, soc_upper_offset INTEGER, soc_hysteresis INTEGER,
      voltage_hysteresis REAL, grid_frequency_l1_topic TEXT,
      grid_frequency_l2_topic TEXT, grid_frequency_l3_topic TEXT,
      grid_detection_seconds INTEGER
    );
    INSERT INTO grid_control_config VALUES
      (1, 'grid.cmd.recon', '', '', '1', 'warning.text', 'warning.active', 1, 0, 0, 0, 0, 5, 2, 0.5,
       'grid.frequency.l1', 'grid.frequency.l2', 'grid.frequency.l3', 30);
  `);
  await operatingState.init(db);
  await modulesState.setEnabled(db, 'grid-control', true);

  const cache = mqttClient.getCache();
  cache.clear();
  const fresh = () => Date.now();
  cache.set('mqtt.clockDate', { value: '2026-06-28', receivedAt: fresh() });
  cache.set('batterie.soc', { value: 10, receivedAt: fresh() }); // unter unterer Grenze → Netz an
  cache.set('gridcontrol.gridFrequencyL1', { value: 50, receivedAt: fresh() });
  cache.set('gridcontrol.gridFrequencyL2', { value: 50, receivedAt: fresh() });
  cache.set('gridcontrol.gridFrequencyL3', { value: 50, receivedAt: fresh() });

  const published = [];
  const originalPublish = mqttClient.publish;
  const originalGetStatus = mqttClient.getStatus;
  mqttClient.publish = (topic, value) => { published.push([topic, value]); return true; };
  mqttClient.getStatus = () => ({ connected: true });

  const automation = require('../src/grid-control/automation');

  // Tick 1: Netz soll an, Broker hat noch nichts zurückgemeldet → nicht bestätigt,
  // Befehl 1 wird geschrieben.
  await automation.runNow(db);
  assert.equal(automation.getState().gridActual, true);
  assert.equal(automation.getState().gridCommandConfirmed, false);
  assert.ok(published.some(([t, v]) => t === 'grid.cmd.recon' && Number(v) === 1), 'Befehl 1 muss geschrieben werden');

  // Broker meldet 1 zurück → bestätigt.
  cache.set('gridcontrol.gridCommand', { value: 1, receivedAt: fresh() });
  await automation.runNow(db);
  assert.equal(automation.getState().gridCommandConfirmed, true);

  // Broker-Stand kippt unbemerkt auf 0 (verlorener Write / externe Änderung),
  // Soll bleibt aber an → die Überwachung MUSS die Abweichung erkennen.
  published.length = 0;
  cache.set('gridcontrol.gridCommand', { value: 0, receivedAt: fresh() });
  await automation.runNow(db);
  assert.equal(automation.getState().gridCommandConfirmed, false, 'Divergenz muss erkannt werden');

  // Nach Ablauf des Wiederhol-Intervalls wird der Befehl selbstheilend erneut gesetzt.
  await new Promise((resolve) => setTimeout(resolve, 4100));
  await automation.runNow(db);
  assert.ok(published.some(([t, v]) => t === 'grid.cmd.recon' && Number(v) === 1), 'Befehl muss erneut geschrieben werden');

  // Bei getrennter Verbindung gilt der Befehl niemals als bestätigt.
  mqttClient.getStatus = () => ({ connected: false });
  cache.set('gridcontrol.gridCommand', { value: 1, receivedAt: fresh() });
  await automation.runNow(db);
  assert.equal(automation.getState().gridCommandConfirmed, false, 'ohne Verbindung keine Bestätigung');
  assert.equal(automation.getState().mqttConnected, false);

  mqttClient.publish = originalPublish;
  mqttClient.getStatus = originalGetStatus;
  await new Promise((resolve) => db.close(resolve));
});

test('stale grid frequencies do not unlatch emergency mode', async () => {
  const db = new sqlite3.Database(':memory:');
  const exec = (sql) => new Promise((resolve, reject) => db.exec(sql, (err) => err ? reject(err) : resolve()));
  await exec(`
    CREATE TABLE modules (key TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE operating_state (id INTEGER PRIMARY KEY, operating_level INTEGER, emergency_mode INTEGER);
    INSERT INTO operating_state VALUES (1, 1, 1);
    CREATE TABLE batterie_config (
      id INTEGER PRIMARY KEY, soc_topic TEXT, power_topic TEXT, voltage_topic TEXT,
      temperatur_topic TEXT, min_soc_topic TEXT, min_soc INTEGER, battery_type TEXT,
      cell_count INTEGER, lower_voltage REAL, upper_voltage REAL
    );
    INSERT INTO batterie_config VALUES (1, 'battery.soc', '', '', '', '', 20, 'lifepo4', 16, 44.8, 55.2);
    CREATE TABLE grid_control_config (
      id INTEGER PRIMARY KEY, grid_command_topic TEXT, feed_in_command_topic TEXT,
      temperature_warning_topic TEXT, temperature_warning_value TEXT,
      warning_text_topic TEXT, warning_active_topic TEXT, soc_enabled INTEGER,
      voltage_enabled INTEGER, temperature_enabled INTEGER, feed_in_allowed INTEGER,
      soc_lower_offset INTEGER, soc_upper_offset INTEGER, soc_hysteresis INTEGER,
      voltage_hysteresis REAL, grid_frequency_l1_topic TEXT,
      grid_frequency_l2_topic TEXT, grid_frequency_l3_topic TEXT,
      grid_detection_seconds INTEGER
    );
    INSERT INTO grid_control_config VALUES
      (1, 'grid.command', '', '', '1', 'warning.text', 'warning.active', 1, 0, 0, 0, 0, 5, 2, 0.5,
       'grid.frequency.l1', 'grid.frequency.l2', 'grid.frequency.l3', 30);
  `);
  await operatingState.init(db);
  await modulesState.setEnabled(db, 'grid-control', true);

  const cache = mqttClient.getCache();
  cache.clear();
  cache.set('mqtt.clockDate', { value: '2026-06-28', receivedAt: Date.now() });
  cache.set('batterie.soc', { value: 30, receivedAt: Date.now() });
  // Alle drei Frequenzen "vorhanden", aber überaltert (älter als 60 s) →
  // dürfen den Notstrom NICHT entriegeln.
  const stale = Date.now() - 120000;
  cache.set('gridcontrol.gridFrequencyL1', { value: 50, receivedAt: stale });
  cache.set('gridcontrol.gridFrequencyL2', { value: 50, receivedAt: stale });
  cache.set('gridcontrol.gridFrequencyL3', { value: 50, receivedAt: stale });

  const originalPublish = mqttClient.publish;
  const originalGetStatus = mqttClient.getStatus;
  mqttClient.publish = () => true;
  mqttClient.getStatus = () => ({ connected: true });

  const automation = require('../src/grid-control/automation');
  await operatingState.setEmergencyMode(db, true);
  await automation.runNow(db);
  assert.equal(operatingState.getState().emergencyMode, true, 'stale Frequenzen entriegeln nicht');

  // Frische Werte → Entriegelung.
  cache.set('gridcontrol.gridFrequencyL1', { value: 50, receivedAt: Date.now() });
  cache.set('gridcontrol.gridFrequencyL2', { value: 50, receivedAt: Date.now() });
  cache.set('gridcontrol.gridFrequencyL3', { value: 50, receivedAt: Date.now() });
  await automation.runNow(db);
  assert.equal(operatingState.getState().emergencyMode, false, 'frische Frequenzen entriegeln');

  mqttClient.publish = originalPublish;
  mqttClient.getStatus = originalGetStatus;
  await new Promise((resolve) => db.close(resolve));
});
