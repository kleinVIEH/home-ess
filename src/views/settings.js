'use strict';

const { renderLayout } = require('./layout');
const { escapeHtml, statusText } = require('./components');

// Auswahl gängiger Zeitzonen (IANA). Die erste Gruppe deckt den DACH-Raum ab,
// danach folgen weitere europäische und internationale Zonen.
const TIMEZONE_GROUPS = [
  {
    label: 'Europa',
    zones: [
      ['Europe/Berlin', 'Berlin (MEZ/MESZ)'],
      ['Europe/Vienna', 'Wien (MEZ/MESZ)'],
      ['Europe/Zurich', 'Zürich (MEZ/MESZ)'],
      ['Europe/London', 'London (GMT/BST)'],
      ['Europe/Paris', 'Paris'],
      ['Europe/Madrid', 'Madrid'],
      ['Europe/Rome', 'Rom'],
      ['Europe/Amsterdam', 'Amsterdam'],
      ['Europe/Warsaw', 'Warschau'],
      ['Europe/Athens', 'Athen'],
      ['Europe/Helsinki', 'Helsinki'],
      ['Europe/Moscow', 'Moskau'],
    ],
  },
  {
    label: 'Welt',
    zones: [
      ['UTC', 'UTC (koordinierte Weltzeit)'],
      ['Atlantic/Reykjavik', 'Reykjavík'],
      ['America/New_York', 'New York'],
      ['America/Chicago', 'Chicago'],
      ['America/Denver', 'Denver'],
      ['America/Los_Angeles', 'Los Angeles'],
      ['America/Sao_Paulo', 'São Paulo'],
      ['Asia/Dubai', 'Dubai'],
      ['Asia/Kolkata', 'Kolkata'],
      ['Asia/Shanghai', 'Shanghai'],
      ['Asia/Tokyo', 'Tokio'],
      ['Australia/Sydney', 'Sydney'],
    ],
  },
];

function renderTimezoneOptions(selected) {
  const current = selected || 'Europe/Berlin';
  return TIMEZONE_GROUPS.map((group) => {
    const options = group.zones
      .map(([value, label]) => {
        const isSelected = value === current ? ' selected' : '';
        return `<option value="${escapeHtml(value)}"${isSelected}>${escapeHtml(label)}</option>`;
      })
      .join('\n            ');
    return `<optgroup label="${escapeHtml(group.label)}">\n            ${options}\n          </optgroup>`;
  }).join('\n          ');
}

// Einstellungen: Passwort ändern + Standort/Zeit + MQTT-Broker konfigurieren/testen.
// renderSettings({ passwordError, passwordSuccess, mqtt, mqttMessage })
function renderSettings({
  passwordError = '',
  passwordSuccess = '',
  mqtt = {
    host: '',
    port: '',
    username: '',
    password: '',
    latitude: '',
    longitude: '',
    timezone: 'Europe/Berlin',
    dstEnabled: 1,
    outdoorTemperatureTopic: '',
    clockTimeTopic: '',
    clockDateTopic: '',
  },
  mqttMessage = '',
} = {}) {
  const dstChecked = mqtt.dstEnabled === undefined || mqtt.dstEnabled ? ' checked' : '';

  const body = `        <h1>Einstellungen</h1>

        <div class="settings-layout">
          <section class="settings-card">
            <div class="settings-card-head">
              <h2>Passwort</h2>
              <p class="settings-card-hint">Zugangspasswort für die Weboberfläche ändern.</p>
            </div>
            <form action="/settings/password" method="POST" class="settings-form">
              <div class="field">
                <label for="password">Neues Passwort</label>
                <input type="password" id="password" name="password" required placeholder="Neues Passwort">
              </div>
              <div class="field">
                <label for="passwordConfirm">Passwort bestätigen</label>
                <input type="password" id="passwordConfirm" name="passwordConfirm" required placeholder="Passwort bestätigen">
              </div>
              ${statusText(passwordError)}
              ${statusText(passwordSuccess, 'success')}
              <div class="button-row">
                <button type="submit">Passwort speichern</button>
              </div>
            </form>
          </section>

          <form action="/settings/mqtt" method="POST" class="settings-form mqtt-form settings-card-form">
            <section class="settings-card">
              <div class="settings-card-head">
                <h2>Standort &amp; Zeit</h2>
                <p class="settings-card-hint">Geografische Position und Zeitzone für die spätere Verfeinerung des Clear-Sky-Modells. Diese Werte beeinflussen weder die übermittelte Uhrzeit noch das Datum – die per MQTT empfangenen Zeiten entsprechen bereits der lokalen Ortszeit.</p>
              </div>
              <div class="field-grid">
                <div class="field">
                  <label for="latitude">Geografischer Breitengrad</label>
                  <input type="number" step="0.000001" id="latitude" name="latitude" placeholder="z.B. 52.520008" value="${escapeHtml(mqtt.latitude)}">
                </div>
                <div class="field">
                  <label for="longitude">Geografischer Längengrad</label>
                  <input type="number" step="0.000001" id="longitude" name="longitude" placeholder="z.B. 13.404954" value="${escapeHtml(mqtt.longitude)}">
                </div>
                <div class="field">
                  <label for="timezone">Zeitzone</label>
                  <select id="timezone" name="timezone">
                    ${renderTimezoneOptions(mqtt.timezone)}
                  </select>
                </div>
              </div>
              <label class="checkbox-field" for="dstEnabled">
                <input type="checkbox" id="dstEnabled" name="dstEnabled" value="1"${dstChecked}>
                <span>Automatische Zeitumstellung (Sommer-/Winterzeit) aktivieren</span>
              </label>
            </section>

            <section class="settings-card">
              <div class="settings-card-head">
                <h2>MQTT Verbindung</h2>
                <p class="settings-card-hint">Verbindungsdaten zum MQTT-Broker.</p>
              </div>
              <div class="field-grid">
                <div class="field">
                  <label for="mqttHost">Broker Host</label>
                  <input type="text" id="mqttHost" name="host" placeholder="z.B. localhost" value="${escapeHtml(mqtt.host)}" required>
                </div>
                <div class="field">
                  <label for="mqttPort">Port</label>
                  <input type="number" id="mqttPort" name="port" placeholder="1883" value="${escapeHtml(mqtt.port)}" required>
                </div>
                <div class="field">
                  <label for="mqttUser">Benutzername</label>
                  <input type="text" id="mqttUser" name="username" placeholder="optional" value="${escapeHtml(mqtt.username)}">
                </div>
                <div class="field">
                  <label for="mqttPass">Passwort</label>
                  <input type="password" id="mqttPass" name="password" placeholder="optional" value="${escapeHtml(mqtt.password)}">
                </div>
              </div>
            </section>

            <section class="settings-card">
              <div class="settings-card-head">
                <h2>MQTT Topics</h2>
                <p class="settings-card-hint">Quell-Topics für Umgebungswerte.</p>
              </div>
              <div class="field">
                <label for="outdoorTemperatureTopic">Topic Aussentemperatur</label>
                <input type="text" id="outdoorTemperatureTopic" name="outdoorTemperatureTopic" placeholder="z.B. weather.0.outdoorTemp" value="${escapeHtml(mqtt.outdoorTemperatureTopic)}">
              </div>
              <div class="field">
                <label for="clockTimeTopic">Topic Uhrzeit</label>
                <input type="text" id="clockTimeTopic" name="clockTimeTopic" placeholder="z.B. system.0.timeText" value="${escapeHtml(mqtt.clockTimeTopic)}">
              </div>
              <div class="field">
                <label for="clockDateTopic">Topic Datum</label>
                <input type="text" id="clockDateTopic" name="clockDateTopic" placeholder="z.B. system.0.dateText" value="${escapeHtml(mqtt.clockDateTopic)}">
              </div>
            </section>

            <section class="settings-card">
              <div class="button-row">
                <button type="submit">Einstellungen speichern</button>
                <button type="button" class="button-secondary" onclick="testMqtt()">MQTT-Verbindung testen</button>
              </div>
              ${mqttMessage ? `<p class="settings-card-hint settings-card-hint-strong">${escapeHtml(mqttMessage)}</p>` : ''}
              <label for="mqttLog">MQTT Protokoll</label>
              <textarea id="mqttLog" readonly class="mqtt-log" placeholder="Protokollausgabe">${escapeHtml(mqttMessage)}</textarea>
            </section>
          </form>
        </div>`;

  const script = `    async function testMqtt() {
      const payload = {
        host: document.getElementById('mqttHost').value,
        port: document.getElementById('mqttPort').value,
        username: document.getElementById('mqttUser').value,
        password: document.getElementById('mqttPass').value,
        latitude: document.getElementById('latitude').value,
        longitude: document.getElementById('longitude').value,
        timezone: document.getElementById('timezone').value,
        dstEnabled: document.getElementById('dstEnabled').checked,
        outdoorTemperatureTopic: document.getElementById('outdoorTemperatureTopic').value,
        clockTimeTopic: document.getElementById('clockTimeTopic').value,
        clockDateTopic: document.getElementById('clockDateTopic').value,
      };
      const logBox = document.getElementById('mqttLog');
      logBox.value = 'Teste Verbindung...';
      try {
        const resp = await fetch('/settings/mqtt/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await resp.json();
        logBox.value = data.message || JSON.stringify(data);
      } catch (e) {
        logBox.value = 'Fehler: ' + e.message;
      }
    }`;

  return renderLayout({ title: 'Einstellungen', activePath: '/settings', body, script });
}

module.exports = renderSettings;
