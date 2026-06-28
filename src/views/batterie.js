'use strict';

const { renderLayout } = require('./layout');
const { escapeHtml, statusText } = require('./components');

function renderBatterie({
  config = { socTopic: '', powerTopic: '', voltageTopic: '', temperaturTopic: '' },
  data = { soc: null, power: null, voltage: null, temperatur: null },
  message = '',
  error = '',
} = {}) {
  const hasSoc     = !!config.socTopic;
  const hasPower   = !!config.powerTopic;
  const hasVoltage = !!config.voltageTopic;
  const hasTemp    = !!config.temperaturTopic;
  const hasAny     = hasSoc || hasPower || hasVoltage || hasTemp;

  const fmtSoc     = data.soc     != null ? `${parseFloat(data.soc).toFixed(1)} %`  : '— %';
  const fmtPower   = formatPower(data.power);
  const fmtVoltage = data.voltage  != null ? `${parseFloat(data.voltage).toFixed(1)} V`  : '— V';
  const fmtTemp    = data.temperatur != null ? `${parseFloat(data.temperatur).toFixed(1)} °C` : '— °C';

  const socPct = data.soc != null ? Math.min(100, Math.max(0, parseFloat(data.soc))) : 0;

  const kpiCards = [];
  if (hasSoc) {
    kpiCards.push(`
          <div class="kpi-card kpi-card--bat">
            <div class="kpi-label">Ladezustand (SoC)</div>
            <div class="kpi-value" id="kpi-soc">${escapeHtml(fmtSoc)}</div>
          </div>`);
  }
  if (hasPower) {
    kpiCards.push(`
          <div class="kpi-card kpi-card--bat">
            <div class="kpi-label">Leistung</div>
            <div class="kpi-value" id="kpi-power">${escapeHtml(fmtPower.text)}</div>
          </div>`);
  }
  if (hasVoltage) {
    kpiCards.push(`
          <div class="kpi-card kpi-card--bat">
            <div class="kpi-label">Spannung</div>
            <div class="kpi-value" id="kpi-voltage">${escapeHtml(fmtVoltage)}</div>
          </div>`);
  }
  if (hasTemp) {
    kpiCards.push(`
          <div class="kpi-card kpi-card--bat">
            <div class="kpi-label">Temperatur</div>
            <div class="kpi-value" id="kpi-temp">${escapeHtml(fmtTemp)}</div>
          </div>`);
  }

  const body = `        <h1>Batterie</h1>

        ${message ? statusText(message, 'success') : ''}
        ${error ? statusText(error) : ''}

        ${hasAny ? `
        <div class="kpi-row">
          ${kpiCards.join('')}
        </div>

        ${hasSoc ? `
        <div class="soc-bar-wrap">
          <div class="soc-bar-label">Ladezustand</div>
          <div class="soc-bar-track">
            <div class="soc-bar-fill" id="soc-bar" style="width:${socPct.toFixed(1)}%; background:${socBarColor(socPct)}"></div>
          </div>
          <div class="soc-bar-pct" id="soc-pct">${escapeHtml(fmtSoc)}</div>
        </div>` : ''}
        ` : '<div class="info-card"><p class="muted">Noch keine MQTT-Topics konfiguriert.</p></div>'}

        <form action="/batterie/topics" method="POST">
          <div class="settings-card">
            <div class="settings-card-head">
              <h2>MQTT-Topics</h2>
              <p class="settings-card-hint">Werte werden über den konfigurierten MQTT-Broker bezogen. Leer lassen um eine Anzeige auszublenden.</p>
            </div>
            <div class="field-grid">
              <div class="field">
                <label for="socTopic">Ladezustand – Topic (SoC, %)</label>
                <input type="text" id="socTopic" name="socTopic"
                       placeholder="z.B. battery.0.soc"
                       value="${escapeHtml(config.socTopic)}">
              </div>
              <div class="field">
                <label for="powerTopic">Leistung – Topic (W, positiv = laden)</label>
                <input type="text" id="powerTopic" name="powerTopic"
                       placeholder="z.B. battery.0.power"
                       value="${escapeHtml(config.powerTopic)}">
              </div>
              <div class="field">
                <label for="voltageTopic">Spannung – Topic (V)</label>
                <input type="text" id="voltageTopic" name="voltageTopic"
                       placeholder="z.B. battery.0.voltage"
                       value="${escapeHtml(config.voltageTopic)}">
              </div>
              <div class="field">
                <label for="temperaturTopic">Temperatur – Topic (°C)</label>
                <input type="text" id="temperaturTopic" name="temperaturTopic"
                       placeholder="z.B. battery.0.temperature"
                       value="${escapeHtml(config.temperaturTopic)}">
              </div>
            </div>
          </div>
          <div class="button-row">
            <button type="submit">Konfiguration speichern</button>
          </div>
        </form>`;

  const script = `
    var BAT_CHARGING_COLOR    = '#27ae60';
    var BAT_DISCHARGING_COLOR = '#e67e22';
    var BAT_STANDBY_COLOR     = '#6b7280';

    function socBarColor(pct) {
      if (pct < 20) return '#e74c3c';
      if (pct < 50) return '#d4a500';
      return 'linear-gradient(90deg, #27ae60, #2ecc71)';
    }

    function formatPower(val) {
      if (val == null || val === '') return { text: '— W', color: BAT_STANDBY_COLOR };
      var n = parseFloat(val);
      if (!isFinite(n)) return { text: '— W', color: BAT_STANDBY_COLOR };
      if (n > 0)  return { text: 'Laden · '    + n.toFixed(0) + ' W', color: BAT_CHARGING_COLOR };
      if (n < 0)  return { text: 'Entladen · ' + Math.abs(n).toFixed(0) + ' W', color: BAT_DISCHARGING_COLOR };
      return { text: 'Bereit · 0 W', color: BAT_STANDBY_COLOR };
    }

    function refreshData() {
      fetch('/batterie/data', { headers: { Accept: 'application/json' } })
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(d) {
          if (!d) return;

          var socEl   = document.getElementById('kpi-soc');
          var barEl   = document.getElementById('soc-bar');
          var pctEl   = document.getElementById('soc-pct');
          if (socEl && d.soc != null) {
            var pct = Math.min(100, Math.max(0, parseFloat(d.soc)));
            var txt = pct.toFixed(1) + ' %';
            socEl.textContent = txt;
            if (barEl) { barEl.style.width = pct.toFixed(1) + '%'; barEl.style.background = socBarColor(pct); }
            if (pctEl) pctEl.textContent = txt;
          }

          var powerEl = document.getElementById('kpi-power');
          if (powerEl && d.power != null) {
            var p = formatPower(d.power);
            powerEl.textContent = p.text;
            powerEl.style.color = p.color;
          }

          var voltEl = document.getElementById('kpi-voltage');
          if (voltEl && d.voltage != null) {
            voltEl.textContent = parseFloat(d.voltage).toFixed(1) + ' V';
          }

          var tempEl = document.getElementById('kpi-temp');
          if (tempEl && d.temperatur != null) {
            tempEl.textContent = parseFloat(d.temperatur).toFixed(1) + ' °C';
          }
        })
        .catch(function() {});
    }

    refreshData();
    window.addEventListener('homeess:mqtt', refreshData);
    setInterval(refreshData, 30000);
  `;

  return renderLayout({ title: 'Batterie', activePath: '/batterie', body, script });
}

function formatPower(raw) {
  if (raw == null) return { text: '— W', color: null };
  const n = parseFloat(raw);
  if (!isFinite(n)) return { text: '— W', color: null };
  if (n > 0) return { text: `Laden · ${n.toFixed(0)} W`, color: null };
  if (n < 0) return { text: `Entladen · ${Math.abs(n).toFixed(0)} W`, color: null };
  return { text: 'Bereit · 0 W', color: null };
}

function socBarColor(pct) {
  if (pct < 20) return '#e74c3c';
  if (pct < 50) return '#d4a500';
  return 'linear-gradient(90deg, #27ae60, #2ecc71)';
}

module.exports = renderBatterie;
