'use strict';

// Katalog der auswählbaren internen Werte für Outputs. Angeboten werden die von
// home-ess BERECHNETEN Werte (Leistungen, Erträge, Summen, direkte Sonne) – nicht
// die Roh-Inputs aus dem ioBroker. Jeder Eintrag liefert:
//   id      – stabiler Schlüssel
//   label   – Anzeigename (alphabetisch sortiert)
//   value   – Roh-Wert zum Publizieren (Zahl/Boolean) oder null
//   display – formatierte Anzeige für die Oberfläche

const { listPvPlants } = require('../photovoltaik/plants');
const { readPhotovoltaikValues } = require('../photovoltaik/aggregation');
const { computePvForecast } = require('../photovoltaik/forecast');
const { computeInstantSunIntensity, readSunIntensityAverages } = require('../photovoltaik/sun-intensity');
const { readStromverbrauchValues } = require('../stromverbrauch/aggregation');
const { loadBatterieConfig, readBatterieData, STATE_IDS: BAT_IDS } = require('../batterie/config');
const { loadPoolConfig, readPoolValue } = require('../pool/config');
const { isEnabled } = require('../modules');

function roundTo(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function powerEntry(id, label, value) {
  const rounded = value == null ? null : roundTo(value, 0);
  return {
    id,
    label,
    value: rounded,
    display: rounded == null ? '— W' : `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(rounded)} W`,
  };
}

function energyEntry(id, label, value) {
  const rounded = value == null ? null : roundTo(value, 2);
  return {
    id,
    label,
    value: rounded,
    display:
      rounded == null
        ? '— kWh'
        : `${new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(rounded)} kWh`,
  };
}

function boolEntry(id, label, value) {
  return {
    id,
    label,
    value: value === true,
    display: value === true ? 'Ja' : 'Nein',
  };
}

function temperaturEntry(id, label, rawValue) {
  const n = rawValue == null ? null : parseFloat(String(rawValue).replace(',', '.'));
  const rounded = Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
  return { id, label, value: rounded, display: rounded == null ? '— °C' : `${rounded.toFixed(1).replace('.', ',')} °C` };
}

function voltageEntry(id, label, rawValue) {
  const n = rawValue == null ? null : parseFloat(String(rawValue).replace(',', '.'));
  const rounded = Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
  return { id, label, value: rounded, display: rounded == null ? '— V' : `${rounded.toFixed(1).replace('.', ',')} V` };
}

function pumpEntry(id, label, rawValue) {
  const on = rawValue != null && (rawValue === true || rawValue === 'true' || rawValue === 1 || rawValue === '1');
  return { id, label, value: on ? 1 : 0, display: rawValue == null ? '—' : (on ? 'Ein' : 'Aus') };
}

function phEntry(id, label, rawValue) {
  const n = rawValue == null ? null : parseFloat(String(rawValue).replace(',', '.'));
  const rounded = Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  return { id, label, value: rounded, display: rounded == null ? '—' : rounded.toFixed(2).replace('.', ',') };
}

function percentEntry(id, label, value) {
  const rounded = value == null ? null : roundTo(value, 0);
  return {
    id,
    label,
    value: rounded,
    display: rounded == null ? '— %' : `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(rounded)} %`,
  };
}

const PERIODS = [
  { key: 'today', label: 'heute' },
  { key: 'week', label: 'Woche' },
  { key: 'year', label: 'Jahr' },
  { key: 'previousYear', label: 'Vorjahr' },
];

// PV-Prognose: erwarteter Tagesertrag je Tagesindex (0 = heute … 3 = +3 Tage).
const FORECAST_VALUES = [
  { id: 'pv.forecast.today', index: 0, label: 'PV Prognose Ertrag heute' },
  { id: 'pv.forecast.tomorrow', index: 1, label: 'PV Prognose Ertrag morgen' },
  { id: 'pv.forecast.day2', index: 2, label: 'PV Prognose Ertrag in 2 Tagen' },
  { id: 'pv.forecast.day3', index: 3, label: 'PV Prognose Ertrag in 3 Tagen' },
];

async function listInternalValues(db, cache) {
  const plants = await listPvPlants(db);
  const batCfg = await new Promise((resolve) => loadBatterieConfig(db, resolve));
  const poolCfg = isEnabled('pool') ? await new Promise((resolve) => loadPoolConfig(db, resolve)) : null;

  const [pv, strom, sunIntensity, sunIntensityNow, forecast] = await Promise.all([
    readPhotovoltaikValues(db, cache, plants),
    readStromverbrauchValues(db, cache),
    readSunIntensityAverages(db),
    computeInstantSunIntensity(db, cache),
    // Prognose ohne blockierenden Netzwerkabruf (nur Cache) – gefüllt vom periodischen Job.
    computePvForecast(db, plants, { allowFetch: false, cache }).catch(() => null),
  ]);

  const entries = [];

  // Photovoltaik – Gesamtwerte
  entries.push(boolEntry('pv.directSunlight', 'Direkte Sonneneinstrahlung', pv.totals.directSunlight));

  // Sonnenintensität (Clear-Sky-Modell, in %, auf 100% gedeckelt)
  entries.push(percentEntry('sun.intensity.current', 'Sonnenintensität aktuell', sunIntensityNow));
  entries.push(percentEntry('sun.intensity.last10min', 'Sonnenintensität 10-Minuten-Mittel', sunIntensity.last10min));
  entries.push(percentEntry('sun.intensity.today', 'Sonnenintensität Tagesmittel', sunIntensity.today));
  entries.push(percentEntry('sun.intensity.yesterday', 'Sonnenintensität Vortagsmittel', sunIntensity.yesterday));
  entries.push(powerEntry('pv.current', 'PV Leistung aktuell', pv.totals.current));
  entries.push(powerEntry('pv.ideal', 'PV Leistung ideal', pv.totals.ideal));
  entries.push(powerEntry('pv.shadow', 'PV Leistung Schatten', pv.totals.shadow));
  entries.push(energyEntry('pv.today', 'PV Ertrag heute', pv.totals.today));
  entries.push(energyEntry('pv.week', 'PV Ertrag Woche', pv.totals.week));
  entries.push(energyEntry('pv.year', 'PV Ertrag Jahr', pv.totals.year));
  entries.push(energyEntry('pv.previousYear', 'PV Ertrag Vorjahr', pv.totals.previousYear));

  // Photovoltaik – Wetterprognose (Open-Meteo): erwarteter Tagesertrag heute + 3 Tage.
  // Tagesindex ist stabil (0 = heute), unabhängig vom Wochentag-Label der Oberfläche.
  const forecastDays = forecast && Array.isArray(forecast.days) ? forecast.days : [];
  for (const fc of FORECAST_VALUES) {
    const day = forecastDays[fc.index];
    entries.push(energyEntry(fc.id, fc.label, day ? day.totalKwh : null));
  }
  // Heutigen Prognose-Tagesertrag aufgeteilt: bis zum aktuellen Moment „bereits"
  // (Soll-Stand) und der für den Rest des Tages „noch" erwartete Ertrag.
  entries.push(energyEntry('pv.forecast.today.elapsed', 'PV Prognose Ertrag heute (bisher)', forecast ? forecast.todayElapsedKwh : null));
  entries.push(energyEntry('pv.forecast.today.remaining', 'PV Prognose Ertrag heute (noch)', forecast ? forecast.todayRemainingKwh : null));
  // Erwartete Momentanleistung laut Prognose (Stundenmittel der aktuellen Stunde).
  entries.push(powerEntry('pv.forecast.current', 'PV Prognose Leistung aktuell', forecast ? forecast.currentPowerWatt : null));

  // Photovoltaik – je Anlage
  for (const plant of pv.plants) {
    entries.push(powerEntry(`pv.plant.${plant.id}.current`, `PV ${plant.name} – Leistung aktuell`, plant.current));
    entries.push(powerEntry(`pv.plant.${plant.id}.ideal`, `PV ${plant.name} – Leistung ideal`, plant.ideal));
    entries.push(powerEntry(`pv.plant.${plant.id}.shadow`, `PV ${plant.name} – Leistung Schatten`, plant.shadow));
    entries.push(energyEntry(`pv.plant.${plant.id}.today`, `PV ${plant.name} – Ertrag heute`, plant.today));
    entries.push(boolEntry(`pv.plant.${plant.id}.directSunlight`, `PV ${plant.name} – direkte Sonne`, plant.directSunlight));
  }

  // Stromverbrauch – Leistungen
  entries.push(powerEntry('strom.eigenverbrauch.power', 'Eigenverbrauch Leistung', strom.eigenverbrauchPower));
  entries.push(powerEntry('strom.netzbezug.power', 'Netzbezug Leistung', strom.netzbezugPower));

  // Stromverbrauch – Energie je Zeitraum
  for (const period of PERIODS) {
    const bd = strom.breakdown[period.key];
    const cs = strom.counterSums[period.key];
    entries.push(energyEntry(`strom.eigenverbrauch.${period.key}`, `Eigenverbrauch ${period.label}`, bd.eigenverbrauch));
    entries.push(energyEntry(`strom.netzbezug.${period.key}`, `Netzbezug ${period.label}`, bd.netzbezug));
    entries.push(energyEntry(`strom.verbrauch.${period.key}`, `Verbrauch gesamt ${period.label}`, bd.summe));
    entries.push(energyEntry(`strom.bezug.summe.${period.key}`, `Netzbezug Zählersumme ${period.label}`, cs.import));
    entries.push(energyEntry(`strom.einspeisung.summe.${period.key}`, `Einspeisung Zählersumme ${period.label}`, cs.export));
  }

  // Batterie
  const bat = readBatterieData(cache);
  if (batCfg.socTopic)      entries.push(percentEntry('batterie.soc',       'Batterie Ladezustand (SoC)', bat.soc));
  if (batCfg.powerTopic)    entries.push(powerEntry  ('batterie.power',     'Batterie Leistung',         bat.power));
  if (batCfg.voltageTopic)  entries.push(voltageEntry('batterie.voltage',   'Batterie Spannung',         bat.voltage));
  if (batCfg.temperaturTopic) entries.push(temperaturEntry('batterie.temperatur', 'Batterie Temperatur', bat.temperatur));

  // Pool (nur wenn Modul aktiv)
  if (poolCfg) {
    if (poolCfg.temperatureTopic)    entries.push(temperaturEntry('pool.wassertemperatur', 'Pool Wassertemperatur', readPoolValue(cache, poolCfg.temperatureTopic)));
    if (poolCfg.solarPumpStatusTopic) entries.push(pumpEntry     ('pool.solarPumpe',       'Pool Solarpumpe',       readPoolValue(cache, poolCfg.solarPumpStatusTopic)));
    if (poolCfg.filterPumpStatusTopic) entries.push(pumpEntry    ('pool.filterPumpe',      'Pool Filterpumpe',      readPoolValue(cache, poolCfg.filterPumpStatusTopic)));
    if (poolCfg.phTopic)             entries.push(phEntry        ('pool.ph',               'Pool pH-Wert',          readPoolValue(cache, poolCfg.phTopic)));
    if (poolCfg.chlorTopic)          entries.push(phEntry        ('pool.chlor',            'Pool Chlor (mg/l)',     readPoolValue(cache, poolCfg.chlorTopic)));
  }

  entries.sort((a, b) => a.label.localeCompare(b.label, 'de'));
  return entries;
}

module.exports = { listInternalValues };
