'use strict';

const {
  EIGENVERBRAUCH_L1_STATE_ID,
  EIGENVERBRAUCH_L2_STATE_ID,
  EIGENVERBRAUCH_L3_STATE_ID,
  NETZBEZUG_L1_STATE_ID,
  NETZBEZUG_L2_STATE_ID,
  NETZBEZUG_L3_STATE_ID,
  NETZBEZUG_ZAEHLER_L1_STATE_ID,
  NETZBEZUG_ZAEHLER_L2_STATE_ID,
  NETZBEZUG_ZAEHLER_L3_STATE_ID,
  EINSPEISUNG_ZAEHLER_L1_STATE_ID,
  EINSPEISUNG_ZAEHLER_L2_STATE_ID,
  EINSPEISUNG_ZAEHLER_L3_STATE_ID,
} = require('./config');
const { listPvPlants } = require('../photovoltaik/plants');
const {
  buildPhotovoltaikSnapshot,
  readPhotovoltaikValues,
  getConsumerSidePvCurrentTotal,
} = require('../photovoltaik/aggregation');

const IMPORT_COUNTER_KEYS = [
  { id: NETZBEZUG_ZAEHLER_L1_STATE_ID, key: 'import_l1' },
  { id: NETZBEZUG_ZAEHLER_L2_STATE_ID, key: 'import_l2' },
  { id: NETZBEZUG_ZAEHLER_L3_STATE_ID, key: 'import_l3' },
];

const EXPORT_COUNTER_KEYS = [
  { id: EINSPEISUNG_ZAEHLER_L1_STATE_ID, key: 'export_l1' },
  { id: EINSPEISUNG_ZAEHLER_L2_STATE_ID, key: 'export_l2' },
  { id: EINSPEISUNG_ZAEHLER_L3_STATE_ID, key: 'export_l3' },
];

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
}

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => (err ? reject(err) : resolve()));
  });
}

function parseNumber(value) {
  if (value == null || value === '') return null;
  const normalized = String(value).trim().replace(',', '.');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function getDateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getWeekKey(date = new Date()) {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = local.getDay() || 7;
  local.setDate(local.getDate() + 4 - day);
  const yearStart = new Date(local.getFullYear(), 0, 1);
  const week = Math.ceil((((local - yearStart) / 86400000) + 1) / 7);
  return `${local.getFullYear()}-W${pad(week)}`;
}

function getYearKey(date = new Date()) {
  return String(date.getFullYear());
}

function getCacheValue(cache, key) {
  const entry = cache.get(key);
  return entry ? parseNumber(entry.value) : null;
}

function sumCacheValues(cache, keys) {
  let sum = 0;
  let hasValue = false;
  for (const key of keys) {
    const value = getCacheValue(cache, key);
    if (value == null) continue;
    sum += value;
    hasValue = true;
  }
  return hasValue ? sum : null;
}

function formatPower(value) {
  if (value == null) return '— W';
  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(value)} W`;
}

function formatEnergy(value) {
  if (value == null) return '— kWh';
  return `${new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} kWh`;
}

function formatRawValue(value) {
  if (value == null) return '—';
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatBreakdown(breakdown) {
  return {
    eigenverbrauch: formatEnergy(breakdown.eigenverbrauch),
    netzbezug: formatEnergy(breakdown.netzbezug),
    summe: formatEnergy(breakdown.summe),
  };
}

function buildBreakdown(eigenverbrauch, netzbezug) {
  const summe =
    eigenverbrauch == null && netzbezug == null
      ? null
      : (eigenverbrauch || 0) + (netzbezug || 0);
  return { eigenverbrauch, netzbezug, summe };
}

function deriveEigenverbrauchFromPv(pvValue, exportValue) {
  if (pvValue == null && exportValue == null) return null;
  const value = (pvValue || 0) - (exportValue || 0);
  return value < 0 ? 0 : value;
}

function deriveEigenverbrauch(pvValue, importValue, exportValue) {
  if (pvValue == null && importValue == null && exportValue == null) return null;
  const value = (pvValue || 0) + (importValue || 0) - (exportValue || 0);
  return value < 0 ? 0 : value;
}

function deriveNetzbezug(importValue, exportValue) {
  if (importValue == null && exportValue == null) return null;
  return (importValue || 0) - (exportValue || 0);
}

function normalizeSummaryState(row = {}) {
  return {
    weekImportOffset: parseNumber(row.week_import_offset) || 0,
    weekExportOffset: parseNumber(row.week_export_offset) || 0,
    yearImportOffset: parseNumber(row.year_import_offset) || 0,
    yearExportOffset: parseNumber(row.year_export_offset) || 0,
    previousYearImportTotal: parseNumber(row.previous_year_import_total) || 0,
    previousYearExportTotal: parseNumber(row.previous_year_export_total) || 0,
    lastRolloverDate: row.last_rollover_date || '',
    weekKey: row.week_key || '',
    yearKey: row.year_key || '',
  };
}

function normalizeCounterState(row = {}) {
  return {
    lastRawValue: parseNumber(row.last_raw_value),
    dayTotal: parseNumber(row.day_total) || 0,
    lastDayKey: row.last_day_key || '',
  };
}

async function loadSummaryState(db) {
  const row = await dbGet(
    db,
    `SELECT week_import_offset, week_export_offset,
            year_import_offset, year_export_offset,
            previous_year_import_total, previous_year_export_total,
            last_rollover_date, week_key, year_key
     FROM stromverbrauch_aggregation
     WHERE id = 1`
  );
  return normalizeSummaryState(row);
}

async function saveSummaryState(db, state) {
  await dbRun(
    db,
    `UPDATE stromverbrauch_aggregation
     SET week_import_offset = ?, week_export_offset = ?,
         year_import_offset = ?, year_export_offset = ?,
         previous_year_import_total = ?, previous_year_export_total = ?,
         last_rollover_date = ?, week_key = ?, year_key = ?
     WHERE id = 1`,
    [
      state.weekImportOffset,
      state.weekExportOffset,
      state.yearImportOffset,
      state.yearExportOffset,
      state.previousYearImportTotal,
      state.previousYearExportTotal,
      state.lastRolloverDate,
      state.weekKey,
      state.yearKey,
    ]
  );
}

async function loadCounterStates(db) {
  const rows = await dbAll(
    db,
    'SELECT counter_key, last_raw_value, day_total, last_day_key FROM stromverbrauch_counter_state'
  );
  const states = new Map();
  for (const row of rows) {
    states.set(row.counter_key, normalizeCounterState(row));
  }
  return states;
}

async function saveCounterState(db, key, state) {
  await dbRun(
    db,
    `INSERT INTO stromverbrauch_counter_state (counter_key, last_raw_value, day_total, last_day_key)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(counter_key) DO UPDATE SET
       last_raw_value = excluded.last_raw_value,
       day_total = excluded.day_total,
       last_day_key = excluded.last_day_key`,
    [key, state.lastRawValue, state.dayTotal, state.lastDayKey]
  );
}

async function updateCounterStates(db, cache, now = new Date()) {
  const dayKey = getDateKey(now);
  const existing = await loadCounterStates(db);
  const previousDayTotals = { import: 0, export: 0 };
  const dayTotals = { import: 0, export: 0 };
  const rawValues = {
    import: { l1: null, l2: null, l3: null },
    export: { l1: null, l2: null, l3: null },
  };

  for (const entry of [...IMPORT_COUNTER_KEYS, ...EXPORT_COUNTER_KEYS]) {
    const bucket = entry.key.startsWith('import') ? 'import' : 'export';
    const phase = entry.key.endsWith('_l1') ? 'l1' : entry.key.endsWith('_l2') ? 'l2' : 'l3';
    const rawValue = getCacheValue(cache, entry.id);
    const state = existing.get(entry.key) || normalizeCounterState();

    if (state.lastDayKey && state.lastDayKey !== dayKey) {
      previousDayTotals[bucket] += state.dayTotal || 0;
      state.dayTotal = 0;
      state.lastDayKey = dayKey;
    } else if (!state.lastDayKey) {
      state.lastDayKey = dayKey;
    }

    if (rawValue != null) {
      if (state.lastRawValue == null) {
        state.lastRawValue = rawValue;
      } else {
        const delta = rawValue >= state.lastRawValue ? rawValue - state.lastRawValue : rawValue + 0.01;
        if (delta > 0) state.dayTotal += delta;
        state.lastRawValue = rawValue;
      }
    }

    dayTotals[bucket] += state.dayTotal || 0;
    rawValues[bucket][phase] = state.lastRawValue;
    await saveCounterState(db, entry.key, state);
  }

  return { previousDayTotals, dayTotals, rawValues, dayKey };
}

async function updateSummaryState(db, previousDayTotals, dayKey, now = new Date()) {
  const state = await loadSummaryState(db);
  const weekKey = getWeekKey(now);
  const yearKey = getYearKey(now);
  let changed = false;

  if (!state.lastRolloverDate) {
    state.lastRolloverDate = dayKey;
    state.weekKey = weekKey;
    state.yearKey = yearKey;
    changed = true;
  } else if (state.lastRolloverDate !== dayKey) {
    const finishedYearImport = state.yearImportOffset + previousDayTotals.import;
    const finishedYearExport = state.yearExportOffset + previousDayTotals.export;

    state.weekImportOffset =
      state.weekKey === weekKey ? state.weekImportOffset + previousDayTotals.import : 0;
    state.weekExportOffset =
      state.weekKey === weekKey ? state.weekExportOffset + previousDayTotals.export : 0;

    if (state.yearKey === yearKey) {
      state.yearImportOffset += previousDayTotals.import;
      state.yearExportOffset += previousDayTotals.export;
    } else {
      state.previousYearImportTotal = finishedYearImport;
      state.previousYearExportTotal = finishedYearExport;
      state.yearImportOffset = 0;
      state.yearExportOffset = 0;
    }

    state.lastRolloverDate = dayKey;
    state.weekKey = weekKey;
    state.yearKey = yearKey;
    changed = true;
  }

  if (changed) await saveSummaryState(db, state);
  return state;
}

async function setManualOffset(db, period, values, now = new Date()) {
  const state = await loadSummaryState(db);
  const dayKey = getDateKey(now);
  state.lastRolloverDate = dayKey;
  state.weekKey = getWeekKey(now);
  state.yearKey = getYearKey(now);

  if (period === 'week') {
    state.weekImportOffset = values.netzbezug;
    state.weekExportOffset = values.einspeisung;
  } else if (period === 'year') {
    state.yearImportOffset = values.netzbezug;
    state.yearExportOffset = values.einspeisung;
  } else {
    throw new Error('Unbekannter Zeitraum.');
  }

  await saveSummaryState(db, state);
  return state;
}

async function buildStromverbrauchSnapshot(db, cache) {
  const eigenverbrauchMeterValue = sumCacheValues(cache, [
    EIGENVERBRAUCH_L1_STATE_ID,
    EIGENVERBRAUCH_L2_STATE_ID,
    EIGENVERBRAUCH_L3_STATE_ID,
  ]);
  const netzbezugPowerValue = sumCacheValues(cache, [
    NETZBEZUG_L1_STATE_ID,
    NETZBEZUG_L2_STATE_ID,
    NETZBEZUG_L3_STATE_ID,
  ]);

  const pvSnapshot = await buildPhotovoltaikSnapshot(db, cache, await listPvPlants(db));
  const consumerSidePvValue = getConsumerSidePvCurrentTotal(pvSnapshot);
  const eigenverbrauchPowerValue =
    eigenverbrauchMeterValue == null && consumerSidePvValue == null
      ? null
      : (eigenverbrauchMeterValue || 0) + (consumerSidePvValue || 0);

  const counterUpdate = await updateCounterStates(db, cache);
  const todayImport = counterUpdate.dayTotals.import || 0;
  const todayExport = counterUpdate.dayTotals.export || 0;
  const summaryState = await updateSummaryState(
    db,
    counterUpdate.previousDayTotals,
    counterUpdate.dayKey
  );

  const weekImport = summaryState.weekImportOffset + todayImport;
  const weekExport = summaryState.weekExportOffset + todayExport;
  const yearImport = summaryState.yearImportOffset + todayImport;
  const yearExport = summaryState.yearExportOffset + todayExport;

  const todayBreakdown = buildBreakdown(
    deriveEigenverbrauch(pvSnapshot.totals.raw.today, todayImport, todayExport),
    deriveNetzbezug(todayImport, todayExport)
  );
  const weekBreakdown = buildBreakdown(
    deriveEigenverbrauch(pvSnapshot.totals.raw.week, weekImport, weekExport),
    deriveNetzbezug(weekImport, weekExport)
  );
  const yearBreakdown = buildBreakdown(
    deriveEigenverbrauch(pvSnapshot.totals.raw.year, yearImport, yearExport),
    deriveNetzbezug(yearImport, yearExport)
  );
  const previousYearBreakdown = buildBreakdown(
    deriveEigenverbrauch(
      pvSnapshot.totals.raw.previousYear,
      summaryState.previousYearImportTotal,
      summaryState.previousYearExportTotal
    ),
    deriveNetzbezug(
      summaryState.previousYearImportTotal,
      summaryState.previousYearExportTotal
    )
  );

  return {
    raw: {
      eigenverbrauchPower: eigenverbrauchPowerValue,
      netzbezugPower: netzbezugPowerValue,
      today: todayBreakdown,
      week: weekBreakdown,
      year: yearBreakdown,
      previousYear: previousYearBreakdown,
      rawCounters: counterUpdate.rawValues,
    },
    formatted: {
      eigenverbrauchPower: formatPower(eigenverbrauchPowerValue),
      netzbezugPower: formatPower(netzbezugPowerValue),
      today: formatBreakdown(todayBreakdown),
      week: formatBreakdown(weekBreakdown),
      year: formatBreakdown(yearBreakdown),
      previousYear: formatBreakdown(previousYearBreakdown),
      rawCounters: {
        import: {
          l1: formatRawValue(counterUpdate.rawValues.import.l1),
          l2: formatRawValue(counterUpdate.rawValues.import.l2),
          l3: formatRawValue(counterUpdate.rawValues.import.l3),
        },
        export: {
          l1: formatRawValue(counterUpdate.rawValues.export.l1),
          l2: formatRawValue(counterUpdate.rawValues.export.l2),
          l3: formatRawValue(counterUpdate.rawValues.export.l3),
        },
      },
    },
  };
}

// Schreibfreie Variante: liefert die aktuellen berechneten Strom-Werte (Leistungen,
// Eigenverbrauch/Netzbezug/Summen je Zeitraum sowie die Zählersummen Bezug/Einspeisung)
// ohne die DB-schreibende Zähler-/Summen-Fortschreibung. Die persistierten Tageswerte
// werden gelesen (max. so frisch wie der letzte 60-Sekunden-Lauf).
async function readStromverbrauchValues(db, cache) {
  const eigenverbrauchMeterValue = sumCacheValues(cache, [
    EIGENVERBRAUCH_L1_STATE_ID,
    EIGENVERBRAUCH_L2_STATE_ID,
    EIGENVERBRAUCH_L3_STATE_ID,
  ]);
  const netzbezugPowerValue = sumCacheValues(cache, [
    NETZBEZUG_L1_STATE_ID,
    NETZBEZUG_L2_STATE_ID,
    NETZBEZUG_L3_STATE_ID,
  ]);

  const plants = await listPvPlants(db);
  const pvValues = await readPhotovoltaikValues(db, cache, plants);
  let consumerCurrent = 0;
  let hasConsumer = false;
  for (const plant of pvValues.plants) {
    if (plant.isConsumerSide && plant.current != null) {
      consumerCurrent += plant.current;
      hasConsumer = true;
    }
  }
  const consumerSidePvValue = hasConsumer ? consumerCurrent : null;
  const eigenverbrauchPowerValue =
    eigenverbrauchMeterValue == null && consumerSidePvValue == null
      ? null
      : (eigenverbrauchMeterValue || 0) + (consumerSidePvValue || 0);

  const counters = await loadCounterStates(db);
  const sumDayTotals = (keys) => {
    let sum = 0;
    let has = false;
    for (const key of keys) {
      const state = counters.get(key);
      if (state) {
        sum += state.dayTotal || 0;
        has = true;
      }
    }
    return has ? sum : 0;
  };
  const todayImport = sumDayTotals(['import_l1', 'import_l2', 'import_l3']);
  const todayExport = sumDayTotals(['export_l1', 'export_l2', 'export_l3']);

  const summary = await loadSummaryState(db);
  const weekImport = summary.weekImportOffset + todayImport;
  const weekExport = summary.weekExportOffset + todayExport;
  const yearImport = summary.yearImportOffset + todayImport;
  const yearExport = summary.yearExportOffset + todayExport;
  const prevImport = summary.previousYearImportTotal;
  const prevExport = summary.previousYearExportTotal;

  const breakdown = (pvEnergy, importValue, exportValue) =>
    buildBreakdown(
      deriveEigenverbrauch(pvEnergy, importValue, exportValue),
      deriveNetzbezug(importValue, exportValue)
    );

  return {
    eigenverbrauchPower: eigenverbrauchPowerValue,
    netzbezugPower: netzbezugPowerValue,
    breakdown: {
      today: breakdown(pvValues.totals.today, todayImport, todayExport),
      week: breakdown(pvValues.totals.week, weekImport, weekExport),
      year: breakdown(pvValues.totals.year, yearImport, yearExport),
      previousYear: breakdown(pvValues.totals.previousYear, prevImport, prevExport),
    },
    counterSums: {
      today: { import: todayImport, export: todayExport },
      week: { import: weekImport, export: weekExport },
      year: { import: yearImport, export: yearExport },
      previousYear: { import: prevImport, export: prevExport },
    },
  };
}

module.exports = {
  buildStromverbrauchSnapshot,
  readStromverbrauchValues,
  setManualOffset,
  parseNumber,
};
