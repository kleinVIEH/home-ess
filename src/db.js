'use strict';

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const config = require('./config');
const { hashPassword, isHashed } = require('./auth/password');

// Öffnet (und initialisiert beim ersten Start) die SQLite-Datenbank.
// Schema, Seed-Daten und Migrationen sind hier gebündelt, damit der Rest der
// Anwendung von einer fertig eingerichteten DB ausgehen kann.
function openDatabase() {
  const dbDir = path.dirname(config.DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new sqlite3.Database(config.DB_PATH);

  db.serialize(() => {
    db.run(
      'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, password TEXT NOT NULL)'
    );
    db.run(
      `CREATE TABLE IF NOT EXISTS mqtt_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        host TEXT,
        port INTEGER,
        username TEXT,
        password TEXT,
        latitude REAL,
        longitude REAL,
        timezone TEXT,
        dst_enabled INTEGER NOT NULL DEFAULT 1,
        outdoor_temperature_topic TEXT,
        clock_time_topic TEXT,
        clock_date_topic TEXT
      )`
    );
    db.run(
      'CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)'
    );
    db.run(
      'CREATE TABLE IF NOT EXISTS stromverbrauch_config (id INTEGER PRIMARY KEY CHECK (id = 1), current_topic TEXT, eigenverbrauch_l1_topic TEXT, eigenverbrauch_l2_topic TEXT, eigenverbrauch_l3_topic TEXT, netzbezug_l1_topic TEXT, netzbezug_l2_topic TEXT, netzbezug_l3_topic TEXT, today_topic TEXT, netzbezug_zaehler_l1_topic TEXT, netzbezug_zaehler_l2_topic TEXT, netzbezug_zaehler_l3_topic TEXT, einspeisung_zaehler_l1_topic TEXT, einspeisung_zaehler_l2_topic TEXT, einspeisung_zaehler_l3_topic TEXT)'
    );
    db.run(
      'CREATE TABLE IF NOT EXISTS stromverbrauch_aggregation (id INTEGER PRIMARY KEY CHECK (id = 1), week_offset REAL NOT NULL DEFAULT 0, month_offset REAL NOT NULL DEFAULT 0, year_offset REAL NOT NULL DEFAULT 0, previous_year_total REAL NOT NULL DEFAULT 0, last_today_value REAL NOT NULL DEFAULT 0, last_rollover_date TEXT NOT NULL DEFAULT \'\', week_key TEXT NOT NULL DEFAULT \'\', month_key TEXT NOT NULL DEFAULT \'\', year_key TEXT NOT NULL DEFAULT \'\', week_import_offset REAL NOT NULL DEFAULT 0, week_export_offset REAL NOT NULL DEFAULT 0, year_import_offset REAL NOT NULL DEFAULT 0, year_export_offset REAL NOT NULL DEFAULT 0, previous_year_import_total REAL NOT NULL DEFAULT 0, previous_year_export_total REAL NOT NULL DEFAULT 0)'
    );
    db.run(
      `CREATE TABLE IF NOT EXISTS stromverbrauch_counter_state (
        counter_key TEXT PRIMARY KEY,
        last_raw_value REAL,
        day_total REAL NOT NULL DEFAULT 0,
        last_day_key TEXT NOT NULL DEFAULT ''
      )`
    );
    db.run(
      `CREATE TABLE IF NOT EXISTS pv_plants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        kw_peak REAL NOT NULL,
        efficiency REAL NOT NULL,
        orientation TEXT,
        tilt REAL NOT NULL,
        is_consumer_side INTEGER NOT NULL DEFAULT 0,
        cell_type TEXT NOT NULL,
        converter_type TEXT NOT NULL DEFAULT 'Direkt',
        power_topic TEXT,
        today_yield_topic TEXT,
        auto_calibrate INTEGER NOT NULL DEFAULT 0,
        sun_cutoff_morning REAL NOT NULL DEFAULT 10,
        sun_cutoff_evening REAL NOT NULL DEFAULT 10
      )`
    );
    // Selbstkalibrierung: je Anlage und 15-Minuten-Bucket des Tages (0..95) ein
    // langsam nachgeführter Kalibrierfaktor (Default 1.0). Das abgeschlossene
    // 15-min-Fenster wird gegen die Open-Meteo-Strahlung desselben Fensters
    // verglichen; der Faktor wird auf den neuen Bucket übernommen. window_minutes
    // dokumentiert die Fensterbreite und dient als Migrations-Marker.
    db.run(
      `CREATE TABLE IF NOT EXISTS pv_calibration_buckets (
        plant_id INTEGER NOT NULL,
        bucket INTEGER NOT NULL,
        factor REAL NOT NULL DEFAULT 1.0,
        sample_count INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER,
        window_minutes INTEGER NOT NULL DEFAULT 15,
        PRIMARY KEY (plant_id, bucket),
        FOREIGN KEY (plant_id) REFERENCES pv_plants(id) ON DELETE CASCADE
      )`
    );
    db.run(
      `CREATE TABLE IF NOT EXISTS pv_aggregation (
        plant_id INTEGER PRIMARY KEY,
        week_offset REAL NOT NULL DEFAULT 0,
        total_offset REAL NOT NULL DEFAULT 0,
        last_today_value REAL NOT NULL DEFAULT 0,
        last_rollover_date TEXT NOT NULL DEFAULT '',
        week_key TEXT NOT NULL DEFAULT '',
        FOREIGN KEY (plant_id) REFERENCES pv_plants(id) ON DELETE CASCADE
      )`
    );
    db.run(
      `CREATE TABLE IF NOT EXISTS pv_summary_aggregation (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        week_offset REAL NOT NULL DEFAULT 0,
        year_offset REAL NOT NULL DEFAULT 0,
        previous_year_total REAL NOT NULL DEFAULT 0,
        last_today_value REAL NOT NULL DEFAULT 0,
        last_rollover_date TEXT NOT NULL DEFAULT '',
        week_key TEXT NOT NULL DEFAULT '',
        year_key TEXT NOT NULL DEFAULT ''
      )`
    );
    db.run(
      `CREATE TABLE IF NOT EXISTS outputs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id TEXT NOT NULL,
        target_topic TEXT NOT NULL
      )`
    );
    db.run(
      `CREATE TABLE IF NOT EXISTS dashboard_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        width TEXT NOT NULL DEFAULT 'full',
        position INTEGER NOT NULL DEFAULT 0
      )`
    );
    db.run(
      `CREATE TABLE IF NOT EXISTS dashboard_widgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id TEXT NOT NULL,
        group_id INTEGER,
        position INTEGER NOT NULL DEFAULT 0
      )`
    );
    db.run(
      `CREATE TABLE IF NOT EXISTS sun_intensity_samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recorded_at INTEGER NOT NULL,
        day_key TEXT NOT NULL,
        intensity REAL NOT NULL,
        day_average_eligible INTEGER NOT NULL DEFAULT 1
      )`
    );
    db.run(
      'CREATE INDEX IF NOT EXISTS idx_sun_intensity_recorded_at ON sun_intensity_samples (recorded_at)'
    );
    db.run(
      'CREATE INDEX IF NOT EXISTS idx_sun_intensity_day_key ON sun_intensity_samples (day_key)'
    );
    db.run(
      `CREATE TABLE IF NOT EXISTS modules (
        key TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 0
      )`
    );
    db.run(
      `CREATE TABLE IF NOT EXISTS batterie_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        soc_topic TEXT NOT NULL DEFAULT '',
        power_topic TEXT NOT NULL DEFAULT '',
        voltage_topic TEXT NOT NULL DEFAULT '',
        temperatur_topic TEXT NOT NULL DEFAULT ''
      )`
    );
    db.run(
      // Vollständiges Schema: frische DBs erhalten alle Spalten sofort, damit der
      // seedPoolConfig-INSERT nicht gegen die (asynchron laufende) Migration
      // rennt. migratePoolConfig bleibt als Upgrade-Pfad für alte DBs, die nur die
      // Basisspalten haben (CREATE IF NOT EXISTS ist dort ein No-op).
      `CREATE TABLE IF NOT EXISTS pool_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        temperature_topic TEXT NOT NULL DEFAULT '',
        pump_status_topic TEXT NOT NULL DEFAULT '',
        pump_command_topic TEXT NOT NULL DEFAULT '',
        ph_topic TEXT NOT NULL DEFAULT '',
        chlor_topic TEXT NOT NULL DEFAULT '',
        solar_pump_status_topic TEXT NOT NULL DEFAULT '',
        solar_pump_command_topic TEXT NOT NULL DEFAULT '',
        solar_pump_priority INTEGER NOT NULL DEFAULT 2,
        solar_pump_max_temp REAL,
        solar_pump_temp_on_seconds INTEGER NOT NULL DEFAULT 30,
        solar_pump_temp_pause_minutes INTEGER NOT NULL DEFAULT 30,
        solar_pump_temp_use_filter INTEGER NOT NULL DEFAULT 0,
        filter_pump_status_topic TEXT NOT NULL DEFAULT '',
        filter_pump_command_topic TEXT NOT NULL DEFAULT '',
        filter_pump_priority INTEGER NOT NULL DEFAULT 4,
        filter_pump_follow_solar INTEGER NOT NULL DEFAULT 0,
        filter_time_1_start TEXT NOT NULL DEFAULT '',
        filter_time_1_end TEXT NOT NULL DEFAULT '',
        filter_time_2_start TEXT NOT NULL DEFAULT '',
        filter_time_2_end TEXT NOT NULL DEFAULT '',
        filter_time_3_start TEXT NOT NULL DEFAULT '',
        filter_time_3_end TEXT NOT NULL DEFAULT '',
        filter_battery_enabled INTEGER NOT NULL DEFAULT 0,
        filter_battery_soc INTEGER NOT NULL DEFAULT 80,
        filter_battery_soc_topic TEXT NOT NULL DEFAULT ''
      )`
    );

    seedUser(db);
    seedMqttConfig(db);
    migrateMqttConfig(db);
    seedStromverbrauchConfig(db);
    migrateStromverbrauchConfig(db);
    seedStromverbrauchAggregation(db);
    migrateStromverbrauchAggregation(db);
    seedPvSummaryAggregation(db);
    migratePvPlants(db);
    migrateDashboardWidgets(db);
    migrateDashboardGroups(db);
    migrateSunIntensitySamples(db);
    migratePvCalibrationBuckets(db);
    migratePlaintextPassword(db);
    seedBatterieConfig(db);
    seedPoolConfig(db);
    migratePoolConfig(db);
  });

  return db;
}

function seedUser(db) {
  db.get('SELECT COUNT(*) AS cnt FROM users', (err, row) => {
    if (!err && row.cnt === 0) {
      db.run('INSERT INTO users (password) VALUES (?)', [hashPassword(config.DEFAULT_PASSWORD)]);
    }
  });
}

function seedMqttConfig(db) {
  db.get('SELECT COUNT(*) AS cnt FROM mqtt_config', (err, row) => {
    if (!err && row.cnt === 0) {
      db.run(
        `INSERT INTO mqtt_config
         (id, host, port, username, password, latitude, longitude, timezone, dst_enabled,
          outdoor_temperature_topic, clock_time_topic, clock_date_topic)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['localhost', 1883, '', '', null, null, 'Europe/Berlin', 1, '', '', '']
      );
    }
  });
}

function migrateMqttConfig(db) {
  db.all('PRAGMA table_info(mqtt_config)', (err, rows) => {
    if (err || !Array.isArray(rows) || rows.length === 0) return;
    const existing = new Set(rows.map((row) => row.name));
    const additions = [
      { name: 'latitude', sql: 'ALTER TABLE mqtt_config ADD COLUMN latitude REAL' },
      { name: 'longitude', sql: 'ALTER TABLE mqtt_config ADD COLUMN longitude REAL' },
      { name: 'timezone', sql: "ALTER TABLE mqtt_config ADD COLUMN timezone TEXT" },
      { name: 'dst_enabled', sql: 'ALTER TABLE mqtt_config ADD COLUMN dst_enabled INTEGER NOT NULL DEFAULT 1' },
      { name: 'outdoor_temperature_topic', sql: 'ALTER TABLE mqtt_config ADD COLUMN outdoor_temperature_topic TEXT' },
      { name: 'clock_time_topic', sql: 'ALTER TABLE mqtt_config ADD COLUMN clock_time_topic TEXT' },
      { name: 'clock_date_topic', sql: 'ALTER TABLE mqtt_config ADD COLUMN clock_date_topic TEXT' },
    ];

    for (const addition of additions) {
      if (!existing.has(addition.name)) db.run(addition.sql);
    }
  });
}

function seedStromverbrauchConfig(db) {
  db.get('SELECT COUNT(*) AS cnt FROM stromverbrauch_config', (err, row) => {
    if (!err && row.cnt === 0) {
      db.run(
        `INSERT INTO stromverbrauch_config
         (id, current_topic, eigenverbrauch_l1_topic, eigenverbrauch_l2_topic, eigenverbrauch_l3_topic,
          netzbezug_l1_topic, netzbezug_l2_topic, netzbezug_l3_topic, today_topic,
          netzbezug_zaehler_l1_topic, netzbezug_zaehler_l2_topic, netzbezug_zaehler_l3_topic,
          einspeisung_zaehler_l1_topic, einspeisung_zaehler_l2_topic, einspeisung_zaehler_l3_topic)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['', '', '', '', '', '', '', '', '', '', '', '', '', '']
      );
    }
  });
}

function migrateStromverbrauchConfig(db) {
  db.all('PRAGMA table_info(stromverbrauch_config)', (err, rows) => {
    if (err || !Array.isArray(rows) || rows.length === 0) return;
    const existing = new Set(rows.map((row) => row.name));
    const neededColumns = [
      'eigenverbrauch_l1_topic',
      'eigenverbrauch_l2_topic',
      'eigenverbrauch_l3_topic',
      'netzbezug_l1_topic',
      'netzbezug_l2_topic',
      'netzbezug_l3_topic',
      'netzbezug_zaehler_l1_topic',
      'netzbezug_zaehler_l2_topic',
      'netzbezug_zaehler_l3_topic',
      'einspeisung_zaehler_l1_topic',
      'einspeisung_zaehler_l2_topic',
      'einspeisung_zaehler_l3_topic',
    ];

    for (const column of neededColumns) {
      if (!existing.has(column)) {
        db.run(`ALTER TABLE stromverbrauch_config ADD COLUMN ${column} TEXT`);
      }
    }
  });
}


function seedStromverbrauchAggregation(db) {
  db.get('SELECT COUNT(*) AS cnt FROM stromverbrauch_aggregation', (err, row) => {
    if (!err && row.cnt === 0) {
      db.run(
        `INSERT INTO stromverbrauch_aggregation
         (id, week_offset, month_offset, year_offset, previous_year_total, last_today_value, last_rollover_date, week_key, month_key, year_key)
         VALUES (1, 0, 0, 0, 0, 0, '', '', '', '')`
      );
    }
  });
}

function migrateStromverbrauchAggregation(db) {
  db.all('PRAGMA table_info(stromverbrauch_aggregation)', (err, rows) => {
    if (err || !Array.isArray(rows) || rows.length === 0) return;
    const existing = new Set(rows.map((row) => row.name));
    const additions = [
      { name: 'year_offset', sql: 'ALTER TABLE stromverbrauch_aggregation ADD COLUMN year_offset REAL NOT NULL DEFAULT 0' },
      { name: 'previous_year_total', sql: 'ALTER TABLE stromverbrauch_aggregation ADD COLUMN previous_year_total REAL NOT NULL DEFAULT 0' },
      { name: 'year_key', sql: 'ALTER TABLE stromverbrauch_aggregation ADD COLUMN year_key TEXT NOT NULL DEFAULT \'\'' },
      { name: 'week_import_offset', sql: 'ALTER TABLE stromverbrauch_aggregation ADD COLUMN week_import_offset REAL NOT NULL DEFAULT 0' },
      { name: 'week_export_offset', sql: 'ALTER TABLE stromverbrauch_aggregation ADD COLUMN week_export_offset REAL NOT NULL DEFAULT 0' },
      { name: 'week_self_consumption_offset', sql: 'ALTER TABLE stromverbrauch_aggregation ADD COLUMN week_self_consumption_offset REAL NOT NULL DEFAULT 0' },
      { name: 'year_import_offset', sql: 'ALTER TABLE stromverbrauch_aggregation ADD COLUMN year_import_offset REAL NOT NULL DEFAULT 0' },
      { name: 'year_export_offset', sql: 'ALTER TABLE stromverbrauch_aggregation ADD COLUMN year_export_offset REAL NOT NULL DEFAULT 0' },
      { name: 'year_self_consumption_offset', sql: 'ALTER TABLE stromverbrauch_aggregation ADD COLUMN year_self_consumption_offset REAL NOT NULL DEFAULT 0' },
      { name: 'previous_year_import_total', sql: 'ALTER TABLE stromverbrauch_aggregation ADD COLUMN previous_year_import_total REAL NOT NULL DEFAULT 0' },
      { name: 'previous_year_export_total', sql: 'ALTER TABLE stromverbrauch_aggregation ADD COLUMN previous_year_export_total REAL NOT NULL DEFAULT 0' },
      { name: 'previous_year_self_consumption_total', sql: 'ALTER TABLE stromverbrauch_aggregation ADD COLUMN previous_year_self_consumption_total REAL NOT NULL DEFAULT 0' },
    ];

    for (const addition of additions) {
      if (!existing.has(addition.name)) db.run(addition.sql);
    }
  });
}

// PV-Anlagen erhielten nachträglich den Konverter-/Reglertyp. Bestehende Zeilen
// bekommen 'Direkt' (kein zusätzlicher Geräte-Wirkungsgrad), bis der Typ je
// Anlage gesetzt wird.
function migratePvPlants(db) {
  db.all('PRAGMA table_info(pv_plants)', (err, rows) => {
    if (err || !Array.isArray(rows) || rows.length === 0) return;
    const existing = new Set(rows.map((row) => row.name));
    if (!existing.has('converter_type')) {
      db.run("ALTER TABLE pv_plants ADD COLUMN converter_type TEXT NOT NULL DEFAULT 'Direkt'");
    }
    if (!existing.has('auto_calibrate')) {
      db.run('ALTER TABLE pv_plants ADD COLUMN auto_calibrate INTEGER NOT NULL DEFAULT 0');
    }
    if (!existing.has('sun_cutoff_morning')) {
      db.run('ALTER TABLE pv_plants ADD COLUMN sun_cutoff_morning REAL NOT NULL DEFAULT 10');
    }
    if (!existing.has('sun_cutoff_evening')) {
      db.run('ALTER TABLE pv_plants ADD COLUMN sun_cutoff_evening REAL NOT NULL DEFAULT 10');
    }
  });
}

function seedPvSummaryAggregation(db) {
  db.get('SELECT COUNT(*) AS cnt FROM pv_summary_aggregation', (err, row) => {
    if (!err && row.cnt === 0) {
      db.run(
        `INSERT INTO pv_summary_aggregation
         (id, week_offset, year_offset, previous_year_total, last_today_value, last_rollover_date, week_key, year_key)
         VALUES (1, 0, 0, 0, 0, '', '', '')`
      );
    }
  });
}

// Frühe Dashboard-Widgets hatten nur source_id. Gruppen-Zuordnung und Position
// werden bei Bedarf nachgerüstet.
function migrateDashboardWidgets(db) {
  db.all('PRAGMA table_info(dashboard_widgets)', (err, rows) => {
    if (err || !Array.isArray(rows) || rows.length === 0) return;
    const existing = new Set(rows.map((row) => row.name));
    if (!existing.has('group_id')) {
      db.run('ALTER TABLE dashboard_widgets ADD COLUMN group_id INTEGER');
    }
    if (!existing.has('position')) {
      db.run('ALTER TABLE dashboard_widgets ADD COLUMN position INTEGER NOT NULL DEFAULT 0');
    }
  });
}

// Gruppen erhielten nachträglich Breite und Sortier-Position.
function migrateDashboardGroups(db) {
  db.all('PRAGMA table_info(dashboard_groups)', (err, rows) => {
    if (err || !Array.isArray(rows) || rows.length === 0) return;
    const existing = new Set(rows.map((row) => row.name));
    if (!existing.has('width')) {
      db.run("ALTER TABLE dashboard_groups ADD COLUMN width TEXT NOT NULL DEFAULT 'full'");
    }
    if (!existing.has('position')) {
      db.run('ALTER TABLE dashboard_groups ADD COLUMN position INTEGER NOT NULL DEFAULT 0');
    }
  });
}

// Umstellung des Kalibrier-Bucket-Modells von 10 auf 15 Minuten: Die bisherigen
// 10-min-Buckets (0..143) sind im 15-min-Raster (0..95) nicht mehr gültig und
// beziehen sich zudem auf eine andere Vergleichsgröße — sie werden daher einmalig
// verworfen. Fehlt die Spalte window_minutes, ist es eine Alt-Datenbank: löschen
// und Spalte ergänzen (läuft so genau einmal).
function migratePvCalibrationBuckets(db) {
  db.all('PRAGMA table_info(pv_calibration_buckets)', (err, rows) => {
    if (err || !Array.isArray(rows) || rows.length === 0) return;
    const existing = new Set(rows.map((row) => row.name));
    if (!existing.has('window_minutes')) {
      db.run('DELETE FROM pv_calibration_buckets');
      db.run('ALTER TABLE pv_calibration_buckets ADD COLUMN window_minutes INTEGER NOT NULL DEFAULT 15');
    }
  });
}

function migrateSunIntensitySamples(db) {
  db.all('PRAGMA table_info(sun_intensity_samples)', (err, rows) => {
    if (err || !Array.isArray(rows) || rows.length === 0) return;
    const existing = new Set(rows.map((row) => row.name));
    if (!existing.has('day_average_eligible')) {
      db.run(
        'ALTER TABLE sun_intensity_samples ADD COLUMN day_average_eligible INTEGER NOT NULL DEFAULT 1'
      );
    }
  });
}

// Bestehende Datenbanken speicherten das Passwort im Klartext. Beim Start
// wird ein noch ungehashter Wert einmalig in einen scrypt-Hash überführt.
function migratePlaintextPassword(db) {
  db.get('SELECT id, password FROM users LIMIT 1', (err, row) => {
    if (err || !row || isHashed(row.password)) return;
    db.run('UPDATE users SET password = ? WHERE id = ?', [hashPassword(row.password), row.id]);
  });
}

function seedBatterieConfig(db) {
  db.get('SELECT COUNT(*) AS cnt FROM batterie_config', (err, row) => {
    if (!err && row.cnt === 0) {
      db.run(
        `INSERT INTO batterie_config (id, soc_topic, power_topic, voltage_topic, temperatur_topic)
         VALUES (1, '', '', '', '')`
      );
    }
  });
}

function seedPoolConfig(db) {
  db.get('SELECT COUNT(*) AS cnt FROM pool_config', (err, row) => {
    if (!err && row && row.cnt === 0) {
      db.run(
        `INSERT INTO pool_config
         (id, temperature_topic, pump_status_topic, pump_command_topic, ph_topic, chlor_topic,
          solar_pump_status_topic, solar_pump_command_topic, solar_pump_priority,
          filter_pump_status_topic, filter_pump_command_topic, filter_pump_priority,
          filter_pump_follow_solar,
          filter_time_1_start, filter_time_1_end,
          filter_time_2_start, filter_time_2_end,
          filter_time_3_start, filter_time_3_end,
          filter_battery_enabled, filter_battery_soc, filter_battery_soc_topic)
         VALUES (1, '', '', '', '', '', '', '', 5, '', '', 2, 0, '', '', '', '', '', '', 0, 80, '')`
      );
    }
  });
}

function migratePoolConfig(db) {
  db.all('PRAGMA table_info(pool_config)', (err, rows) => {
    if (err || !Array.isArray(rows) || rows.length === 0) return;
    const existing = new Set(rows.map((r) => r.name));
    const additions = [
      { name: 'solar_pump_status_topic', sql: "ALTER TABLE pool_config ADD COLUMN solar_pump_status_topic TEXT NOT NULL DEFAULT ''" },
      { name: 'solar_pump_command_topic', sql: "ALTER TABLE pool_config ADD COLUMN solar_pump_command_topic TEXT NOT NULL DEFAULT ''" },
      { name: 'solar_pump_priority', sql: 'ALTER TABLE pool_config ADD COLUMN solar_pump_priority INTEGER NOT NULL DEFAULT 2' },
      { name: 'solar_pump_max_temp', sql: 'ALTER TABLE pool_config ADD COLUMN solar_pump_max_temp REAL' },
      { name: 'solar_pump_temp_on_seconds', sql: 'ALTER TABLE pool_config ADD COLUMN solar_pump_temp_on_seconds INTEGER NOT NULL DEFAULT 30' },
      { name: 'solar_pump_temp_pause_minutes', sql: 'ALTER TABLE pool_config ADD COLUMN solar_pump_temp_pause_minutes INTEGER NOT NULL DEFAULT 30' },
      { name: 'solar_pump_temp_use_filter', sql: 'ALTER TABLE pool_config ADD COLUMN solar_pump_temp_use_filter INTEGER NOT NULL DEFAULT 0' },
      { name: 'filter_pump_status_topic', sql: "ALTER TABLE pool_config ADD COLUMN filter_pump_status_topic TEXT NOT NULL DEFAULT ''" },
      { name: 'filter_pump_command_topic', sql: "ALTER TABLE pool_config ADD COLUMN filter_pump_command_topic TEXT NOT NULL DEFAULT ''" },
      { name: 'filter_pump_priority', sql: 'ALTER TABLE pool_config ADD COLUMN filter_pump_priority INTEGER NOT NULL DEFAULT 4' },
      { name: 'filter_pump_follow_solar', sql: 'ALTER TABLE pool_config ADD COLUMN filter_pump_follow_solar INTEGER NOT NULL DEFAULT 0' },
      { name: 'filter_time_1_start', sql: "ALTER TABLE pool_config ADD COLUMN filter_time_1_start TEXT NOT NULL DEFAULT ''" },
      { name: 'filter_time_1_end', sql: "ALTER TABLE pool_config ADD COLUMN filter_time_1_end TEXT NOT NULL DEFAULT ''" },
      { name: 'filter_time_2_start', sql: "ALTER TABLE pool_config ADD COLUMN filter_time_2_start TEXT NOT NULL DEFAULT ''" },
      { name: 'filter_time_2_end', sql: "ALTER TABLE pool_config ADD COLUMN filter_time_2_end TEXT NOT NULL DEFAULT ''" },
      { name: 'filter_time_3_start', sql: "ALTER TABLE pool_config ADD COLUMN filter_time_3_start TEXT NOT NULL DEFAULT ''" },
      { name: 'filter_time_3_end', sql: "ALTER TABLE pool_config ADD COLUMN filter_time_3_end TEXT NOT NULL DEFAULT ''" },
      { name: 'filter_battery_enabled', sql: 'ALTER TABLE pool_config ADD COLUMN filter_battery_enabled INTEGER NOT NULL DEFAULT 0' },
      { name: 'filter_battery_soc', sql: 'ALTER TABLE pool_config ADD COLUMN filter_battery_soc INTEGER NOT NULL DEFAULT 80' },
      { name: 'filter_battery_soc_topic', sql: "ALTER TABLE pool_config ADD COLUMN filter_battery_soc_topic TEXT NOT NULL DEFAULT ''" },
    ];
    for (const addition of additions) {
      if (!existing.has(addition.name)) db.run(addition.sql);
    }
  });
}

module.exports = { openDatabase };
