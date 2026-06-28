'use strict';

// Sonnenintensität aus dem Clear-Sky-Modell: Verhältnis der tatsächlichen
// PV-Gesamtleistung zur idealen Klarhimmel-Leistung, in Prozent und auf 100%
// gedeckelt. Momentanwerte werden periodisch als Zeitreihe gespeichert, um
// Mittelwerte (10 Minuten, aktueller Tag, Vortag) zu bilden. Nachts/ohne Daten
// wird kein Sample erfasst. Tagesmittel beruecksichtigen davon nur Samples, bei
// denen mindestens eine Anlage oberhalb des Idealwert-Cutoffs liegt.

const { listPvPlants } = require('./plants');
const { readPhotovoltaikValues } = require('./aggregation');

const SAMPLE_RETENTION_MS = 2 * 24 * 60 * 60 * 1000; // 2 Tage (für Vortag)
const TEN_MINUTES_MS = 10 * 60 * 1000;

function pad(value) {
  return String(value).padStart(2, '0');
}

function getDateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getYesterdayKey(now = new Date()) {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  date.setDate(date.getDate() - 1);
  return getDateKey(date);
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => (err ? reject(err) : resolve()));
  });
}

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

// Momentane Sonnenintensität in Prozent (0..100) oder null, wenn keine
// belastbare Klarhimmel-Referenz vorliegt (Nacht, keine Leistungsdaten).
//
// Wichtig: Das Verhältnis wird nur über Anlagen gebildet, die BEIDE Werte liefern
// (aktuelle Leistung UND Idealwert). Fehlt bei einer Anlage kurz der MQTT-Wert,
// würde ihr Idealanteil im Nenner das Verhältnis sonst künstlich nach unten ziehen
// und so einen scheinbaren Einbruch trotz voller Sonne erzeugen. Eine real auf 0
// produzierende Anlage (Leistung 0, nicht null) bleibt dagegen korrekt enthalten.
async function computeSunIntensitySample(db, cache) {
  const plants = await listPvPlants(db);
  const pv = await readPhotovoltaikValues(db, cache, plants);

  let currentSum = 0;
  let idealSum = 0;
  let hasMatch = false;
  for (const plant of pv.plants) {
    // Nur Anlagen einbeziehen, die aktuell als Sonnenreferenz taugen (größenrelativer
    // Cutoff je nach Sonnenstand). off-axis-Anlagen – z. B. die große Südanlage
    // morgens – liefern aus Diffuslicht weit mehr als ihr winziges Ideal und würden
    // das Verhältnis sonst künstlich nach oben ziehen (scheinbar Sonne trotz Wolken).
    if (!plant.sunReference) continue;
    if (plant.current == null || plant.ideal == null || plant.ideal <= 0) continue;
    currentSum += plant.current;
    idealSum += plant.ideal;
    hasMatch = true;
  }
  if (!hasMatch || idealSum <= 0) return null;

  const percent = (currentSum / idealSum) * 100;
  if (!Number.isFinite(percent)) return null;
  // Jede erfasste Probe stammt nun ausschließlich aus Sonnenreferenz-Anlagen und ist
  // damit für die Tagesmittel geeignet.
  return {
    intensity: Math.max(0, Math.min(100, percent)),
    dayAverageEligible: true,
  };
}

async function computeInstantSunIntensity(db, cache) {
  const sample = await computeSunIntensitySample(db, cache);
  return sample == null ? null : sample.intensity;
}

// Einen Messpunkt erfassen und alte Samples aufräumen.
async function recordSample(db, cache, now = new Date()) {
  const sample = await computeSunIntensitySample(db, cache);
  if (sample == null) return null;
  const ts = now.getTime();
  await dbRun(
    db,
    `INSERT INTO sun_intensity_samples
     (recorded_at, day_key, intensity, day_average_eligible)
     VALUES (?, ?, ?, ?)`,
    [ts, getDateKey(now), sample.intensity, sample.dayAverageEligible ? 1 : 0]
  );
  await dbRun(db, 'DELETE FROM sun_intensity_samples WHERE recorded_at < ?', [
    ts - SAMPLE_RETENTION_MS,
  ]);
  return sample.intensity;
}

// Mittelwerte (in Prozent) für die drei Zeitfenster; null, wenn keine Samples.
async function readSunIntensityAverages(db, now = new Date()) {
  const [tenMin, today, yesterday] = await Promise.all([
    dbGet(db, 'SELECT AVG(intensity) AS avg FROM sun_intensity_samples WHERE recorded_at >= ?', [
      now.getTime() - TEN_MINUTES_MS,
    ]),
    dbGet(
      db,
      'SELECT AVG(intensity) AS avg FROM sun_intensity_samples WHERE day_key = ? AND day_average_eligible = 1',
      [getDateKey(now)]
    ),
    dbGet(
      db,
      'SELECT AVG(intensity) AS avg FROM sun_intensity_samples WHERE day_key = ? AND day_average_eligible = 1',
      [getYesterdayKey(now)]
    ),
  ]);
  const value = (row) => (row && row.avg != null ? row.avg : null);
  return { last10min: value(tenMin), today: value(today), yesterday: value(yesterday) };
}

module.exports = { computeInstantSunIntensity, recordSample, readSunIntensityAverages };
