'use strict';

// System-Informationen für die Info-Kachel des Dashboards. Liefert einen festen
// Katalog auswählbarer Felder (Versionen, Auslastungen, Laufzeiten) und deren
// aktuelle Werte. „usage"-Felder tragen zusätzlich einen Prozentwert für einen
// Fortschrittsbalken. Reine Node-Bordmittel (os/process), keine Abhängigkeiten.

const os = require('os');

let pkgVersion = '—';
try {
  // eslint-disable-next-line global-require
  pkgVersion = require('../../package.json').version || '—';
} catch (_) {
  /* Version bleibt unbekannt */
}

// Feld-Katalog. Reihenfolge = Anzeigereihenfolge in der Kachel.
// type: 'text' → nur Wert; 'usage' → Wert + Prozent (Balken).
const INFO_FIELDS = [
  { key: 'homeess_version', label: 'homeESS-Version', type: 'text' },
  { key: 'node_version', label: 'Node.js', type: 'text' },
  { key: 'platform', label: 'Plattform', type: 'text' },
  { key: 'hostname', label: 'Hostname', type: 'text' },
  { key: 'cpu_model', label: 'CPU', type: 'text' },
  { key: 'cpu_cores', label: 'CPU-Kerne', type: 'text' },
  { key: 'cpu_load', label: 'CPU-Auslastung', type: 'usage' },
  { key: 'mem_usage', label: 'RAM-Auslastung', type: 'usage' },
  { key: 'process_memory', label: 'Prozess-Speicher', type: 'text' },
  { key: 'process_uptime', label: 'Betriebszeit (homeESS)', type: 'text' },
  { key: 'system_uptime', label: 'System-Laufzeit', type: 'text' },
];

const INFO_FIELD_KEYS = INFO_FIELDS.map((field) => field.key);
const DEFAULT_INFO_FIELDS = INFO_FIELD_KEYS.slice();

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const parts = [];
  if (days) parts.push(`${days} d`);
  if (hours || days) parts.push(`${hours} h`);
  parts.push(`${minutes} min`);
  return parts.join(' ');
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

// Echte CPU-Auslastung über die Differenz der CPU-Zeiten zwischen zwei Messungen.
// os.loadavg() ist dafür ungeeignet: Es ist ein 1-Minuten-Mittel und spiegelt im
// (LXC-)Container die HOST-Last, während os.cpus().length nur die im Container
// sichtbaren Kerne zählt – das ergibt stark überhöhte Werte. Stattdessen summieren
// wir idle/total über alle Kerne und bilden den Auslastungsanteil im Intervall
// zwischen aufeinanderfolgenden Aufrufen (Dashboard pollt periodisch).
function cpuTimesSnapshot() {
  const cpus = os.cpus() || [];
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    const t = cpu.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idle, total };
}

// Hintergrund-Sampler: misst die Auslastung in einem festen 1-Sekunden-Fenster,
// damit die Anzeige immer den Mittelwert der letzten Sekunde zeigt – unabhängig
// davon, wann (und wie oft) readSystemInfo aufgerufen wird. Ohne festes Fenster
// wäre es das Delta zwischen zwei unregelmäßigen Aufrufen (verrauscht/nullnah).
let previousCpu = cpuTimesSnapshot();
let lastCpuPercent = 0;

function sampleCpu() {
  const snapshot = cpuTimesSnapshot();
  const idleDelta = snapshot.idle - previousCpu.idle;
  const totalDelta = snapshot.total - previousCpu.total;
  previousCpu = snapshot;
  if (totalDelta > 0) lastCpuPercent = clampPercent((1 - idleDelta / totalDelta) * 100);
}

const cpuTimer = setInterval(sampleCpu, 1000);
// Timer darf den Prozess (v. a. Tests) nicht am Leben halten.
if (cpuTimer.unref) cpuTimer.unref();

function currentCpuPercent() {
  return lastCpuPercent;
}

// Aktuellen Zustand aller Felder ermitteln. Rückgabe: { key: { display, percent? } }.
function readSystemInfo() {
  const cpus = os.cpus() || [];
  const cores = cpus.length || 1;
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const loadPercent = currentCpuPercent();
  const memPercent = clampPercent((usedMem / totalMem) * 100);
  const rss = process.memoryUsage().rss;

  return {
    homeess_version: { display: pkgVersion },
    node_version: { display: process.version },
    platform: { display: `${os.type()} ${os.release()} (${process.arch})` },
    hostname: { display: os.hostname() },
    cpu_model: { display: cpus.length ? cpus[0].model.trim() : '—' },
    cpu_cores: { display: String(cores) },
    cpu_load: { display: `${loadPercent} %`, percent: loadPercent },
    mem_usage: { display: `${formatBytes(usedMem)} / ${formatBytes(totalMem)}`, percent: memPercent },
    process_memory: { display: formatBytes(rss) },
    process_uptime: { display: formatDuration(process.uptime()) },
    system_uptime: { display: formatDuration(os.uptime()) },
  };
}

// Nur gültige, deduplizierte Feldschlüssel in Katalog-Reihenfolge zurückgeben.
function sanitizeFields(fields) {
  if (!Array.isArray(fields)) return DEFAULT_INFO_FIELDS.slice();
  const wanted = new Set(fields.map(String));
  const picked = INFO_FIELD_KEYS.filter((key) => wanted.has(key));
  return picked.length ? picked : DEFAULT_INFO_FIELDS.slice();
}

module.exports = {
  INFO_FIELDS,
  INFO_FIELD_KEYS,
  DEFAULT_INFO_FIELDS,
  readSystemInfo,
  sanitizeFields,
  formatBytes,
  formatDuration,
};
