'use strict';

const { renderLayout } = require('./layout');
const { escapeHtml, statusText } = require('./components');

function renderStromverbrauch({
  config = {
    eigenverbrauchL1Topic: '',
    eigenverbrauchL2Topic: '',
    eigenverbrauchL3Topic: '',
    netzbezugL1Topic: '',
    netzbezugL2Topic: '',
    netzbezugL3Topic: '',
    netzbezugZaehlerL1Topic: '',
    netzbezugZaehlerL2Topic: '',
    netzbezugZaehlerL3Topic: '',
    einspeisungZaehlerL1Topic: '',
    einspeisungZaehlerL2Topic: '',
    einspeisungZaehlerL3Topic: '',
  },
  metrics = {
    formatted: {
      eigenverbrauchPower: '— W',
      netzbezugPower: '— W',
      today: emptyBreakdown(),
      week: emptyBreakdown(),
      year: emptyBreakdown(),
      previousYear: emptyBreakdown(),
      rawCounters: emptyRawCounters(),
    },
  },
  formMessage = '',
  formError = '',
  weekMessage = '',
  weekError = '',
  yearMessage = '',
  yearError = '',
} = {}) {
  const body = `        <h1>Stromverbrauch</h1>

        <div class="energy-overview">
          <div class="energy-overview-head">
            <span>Bereich</span>
            <span>Aktuell</span>
            <span>Heute</span>
            <span>Diese Woche</span>
            <span>Dieses Jahr</span>
            <span>Vorjahr</span>
          </div>
          ${renderEnergyRow('Eigenverbrauch', 'eigenverbrauch', metrics.formatted.eigenverbrauchPower, metrics)}
          ${renderEnergyRow('Netzbezug', 'netzbezug', metrics.formatted.netzbezugPower, metrics)}
          <div class="energy-overview-actions">
            <button type="button" class="secondary-button" onclick="openValueDialog('weekValueDialog')">Woche setzen</button>
            <button type="button" class="secondary-button" onclick="openValueDialog('yearValueDialog')">Jahr setzen</button>
          </div>
        </div>

        <div class="strom-layout">
          <form action="/stromverbrauch/topics" method="POST" class="topic-panel">
            <div class="topic-panel-head">
              <h2>MQTT-Topics</h2>
              <button type="submit">Topics speichern</button>
            </div>
            ${statusText(formError)}
            ${statusText(formMessage, 'success')}
            <div class="topic-columns">
          <div class="topic-column">
            <h3>Leistung</h3>
            <label for="eigenverbrauchL1Topic">Eigenverbrauch L1</label>
            <input type="text" id="eigenverbrauchL1Topic" name="eigenverbrauchL1Topic" value="${escapeHtml(config.eigenverbrauchL1Topic)}">
            <label for="eigenverbrauchL2Topic">Eigenverbrauch L2</label>
            <input type="text" id="eigenverbrauchL2Topic" name="eigenverbrauchL2Topic" value="${escapeHtml(config.eigenverbrauchL2Topic)}">
            <label for="eigenverbrauchL3Topic">Eigenverbrauch L3</label>
            <input type="text" id="eigenverbrauchL3Topic" name="eigenverbrauchL3Topic" value="${escapeHtml(config.eigenverbrauchL3Topic)}">
            <label for="netzbezugL1Topic">Netzbezug L1</label>
            <input type="text" id="netzbezugL1Topic" name="netzbezugL1Topic" value="${escapeHtml(config.netzbezugL1Topic)}">
            <label for="netzbezugL2Topic">Netzbezug L2</label>
            <input type="text" id="netzbezugL2Topic" name="netzbezugL2Topic" value="${escapeHtml(config.netzbezugL2Topic)}">
            <label for="netzbezugL3Topic">Netzbezug L3</label>
            <input type="text" id="netzbezugL3Topic" name="netzbezugL3Topic" value="${escapeHtml(config.netzbezugL3Topic)}">
          </div>

          <div class="topic-column">
            <h3>Zaehler-Rohdaten</h3>
            <label for="netzbezugZaehlerL1Topic">Netzbezug L1</label>
            <input type="text" id="netzbezugZaehlerL1Topic" name="netzbezugZaehlerL1Topic" value="${escapeHtml(config.netzbezugZaehlerL1Topic)}">
            <label for="netzbezugZaehlerL2Topic">Netzbezug L2</label>
            <input type="text" id="netzbezugZaehlerL2Topic" name="netzbezugZaehlerL2Topic" value="${escapeHtml(config.netzbezugZaehlerL2Topic)}">
            <label for="netzbezugZaehlerL3Topic">Netzbezug L3</label>
            <input type="text" id="netzbezugZaehlerL3Topic" name="netzbezugZaehlerL3Topic" value="${escapeHtml(config.netzbezugZaehlerL3Topic)}">
            <label for="einspeisungZaehlerL1Topic">Einspeisung L1</label>
            <input type="text" id="einspeisungZaehlerL1Topic" name="einspeisungZaehlerL1Topic" value="${escapeHtml(config.einspeisungZaehlerL1Topic)}">
            <label for="einspeisungZaehlerL2Topic">Einspeisung L2</label>
            <input type="text" id="einspeisungZaehlerL2Topic" name="einspeisungZaehlerL2Topic" value="${escapeHtml(config.einspeisungZaehlerL2Topic)}">
            <label for="einspeisungZaehlerL3Topic">Einspeisung L3</label>
            <input type="text" id="einspeisungZaehlerL3Topic" name="einspeisungZaehlerL3Topic" value="${escapeHtml(config.einspeisungZaehlerL3Topic)}">
          </div>
            </div>
          </form>

        <div class="raw-counter-panel">
          <h2>Zuletzt erfasste Zaehler</h2>
          ${renderRawCounterTable(metrics.formatted.rawCounters)}
          ${statusText(weekError)}
          ${statusText(weekMessage, 'success')}
          ${statusText(yearError)}
          ${statusText(yearMessage, 'success')}
        </div>
        </div>

        <dialog id="weekValueDialog" class="value-dialog">
          <form action="/stromverbrauch/week-offset" method="POST" class="dialog-form">
            <h3>Wert fuer diese Woche setzen</h3>
            <p class="muted">Bitte Netzbezug und Einspeisung zum Tagesstart eingeben. Eigenverbrauch wird aus PV-Ertrag plus Netzbezug minus Einspeisung berechnet.</p>
            <label for="weekNetzbezugStartValue">Netzbezug zum Tagesstart (kWh)</label>
            <input type="number" step="0.01" id="weekNetzbezugStartValue" name="weekNetzbezugStartValue" required>
            <label for="weekEinspeisungStartValue">Einspeisung zum Tagesstart (kWh)</label>
            <input type="number" step="0.01" id="weekEinspeisungStartValue" name="weekEinspeisungStartValue" required>
            <div class="button-row">
              <button type="submit">Uebernehmen</button>
              <button type="button" class="secondary-button" onclick="closeValueDialog('weekValueDialog')">Abbrechen</button>
            </div>
          </form>
        </dialog>

        <dialog id="yearValueDialog" class="value-dialog">
          <form action="/stromverbrauch/year-offset" method="POST" class="dialog-form">
            <h3>Wert fuer dieses Jahr setzen</h3>
            <p class="muted">Bitte Netzbezug und Einspeisung zum Tagesstart eingeben. Eigenverbrauch wird aus PV-Ertrag plus Netzbezug minus Einspeisung berechnet.</p>
            <label for="yearNetzbezugStartValue">Netzbezug zum Tagesstart (kWh)</label>
            <input type="number" step="0.01" id="yearNetzbezugStartValue" name="yearNetzbezugStartValue" required>
            <label for="yearEinspeisungStartValue">Einspeisung zum Tagesstart (kWh)</label>
            <input type="number" step="0.01" id="yearEinspeisungStartValue" name="yearEinspeisungStartValue" required>
            <div class="button-row">
              <button type="submit">Uebernehmen</button>
              <button type="button" class="secondary-button" onclick="closeValueDialog('yearValueDialog')">Abbrechen</button>
            </div>
          </form>
        </dialog>`;

  const script = `    function openValueDialog(id) {
      var dialog = document.getElementById(id);
      if (dialog && typeof dialog.showModal === 'function') dialog.showModal();
    }

    function closeValueDialog(id) {
      var dialog = document.getElementById(id);
      if (dialog) dialog.close();
    }

    function setBreakdown(prefix, values) {
      document.getElementById('eigenverbrauch-' + prefix).textContent = values.eigenverbrauch;
      document.getElementById('netzbezug-' + prefix).textContent = values.netzbezug;
    }

    async function refreshConsumptionMetrics() {
      try {
        var response = await fetch('/stromverbrauch/data', { headers: { Accept: 'application/json' } });
        if (!response.ok) return;
        var data = await response.json();
        document.getElementById('eigenverbrauch-current').textContent = data.eigenverbrauchPower;
        document.getElementById('netzbezug-current').textContent = data.netzbezugPower;
        setBreakdown('today', data.today);
        setBreakdown('week', data.week);
        setBreakdown('year', data.year);
        setBreakdown('previous-year', data.previousYear);
        setRawCounters(data.rawCounters);
      } catch (_) {
        // Anzeige bleibt einfach auf dem letzten gueltigen Stand.
      }
    }

    function setRawCounters(rawCounters) {
      document.getElementById('raw-import-l1').textContent = rawCounters.import.l1;
      document.getElementById('raw-import-l2').textContent = rawCounters.import.l2;
      document.getElementById('raw-import-l3').textContent = rawCounters.import.l3;
      document.getElementById('raw-export-l1').textContent = rawCounters.export.l1;
      document.getElementById('raw-export-l2').textContent = rawCounters.export.l2;
      document.getElementById('raw-export-l3').textContent = rawCounters.export.l3;
    }

    refreshConsumptionMetrics();
    window.addEventListener('homeess:mqtt', refreshConsumptionMetrics);
    setInterval(refreshConsumptionMetrics, 60000);`;

  return renderLayout({
    title: 'Stromverbrauch',
    activePath: '/stromverbrauch',
    body,
    script,
  });
}

function renderEnergyRow(label, key, current, metrics) {
  const values =
    key === 'eigenverbrauch'
      ? {
          today: metrics.formatted.today.eigenverbrauch,
          week: metrics.formatted.week.eigenverbrauch,
          year: metrics.formatted.year.eigenverbrauch,
          previousYear: metrics.formatted.previousYear.eigenverbrauch,
        }
      : {
          today: metrics.formatted.today.netzbezug,
          week: metrics.formatted.week.netzbezug,
          year: metrics.formatted.year.netzbezug,
          previousYear: metrics.formatted.previousYear.netzbezug,
        };

  return `          <div class="energy-overview-row energy-overview-row--${key}">
            <strong>${label}</strong>
            <span id="${key}-current">${escapeHtml(current)}</span>
            <span id="${key}-today">${escapeHtml(values.today)}</span>
            <span id="${key}-week">${escapeHtml(values.week)}</span>
            <span id="${key}-year">${escapeHtml(values.year)}</span>
            <span id="${key}-previous-year">${escapeHtml(values.previousYear)}</span>
          </div>`;
}

function emptyBreakdown() {
  return { eigenverbrauch: '— kWh', netzbezug: '— kWh', summe: '— kWh' };
}

function emptyRawCounters() {
  return {
    import: { l1: '—', l2: '—', l3: '—' },
    export: { l1: '—', l2: '—', l3: '—' },
  };
}

function renderRawCounterTable(rawCounters) {
  return `          <div class="raw-counter-table">
            <div class="raw-counter-head">
              <span></span>
              <span>L1</span>
              <span>L2</span>
              <span>L3</span>
            </div>
            <div class="raw-counter-row">
              <strong>Netzbezug</strong>
              <span id="raw-import-l1">${escapeHtml(rawCounters.import.l1)}</span>
              <span id="raw-import-l2">${escapeHtml(rawCounters.import.l2)}</span>
              <span id="raw-import-l3">${escapeHtml(rawCounters.import.l3)}</span>
            </div>
            <div class="raw-counter-row">
              <strong>Einspeisung</strong>
              <span id="raw-export-l1">${escapeHtml(rawCounters.export.l1)}</span>
              <span id="raw-export-l2">${escapeHtml(rawCounters.export.l2)}</span>
              <span id="raw-export-l3">${escapeHtml(rawCounters.export.l3)}</span>
            </div>
          </div>`;
}

module.exports = renderStromverbrauch;
