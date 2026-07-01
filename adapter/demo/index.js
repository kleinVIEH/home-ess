'use strict';

// Demo-Adapter (Referenz/Vorlage). Erzeugt simulierte States und akzeptiert
// Schreibvorgänge. Keine externen Abhängigkeiten. Das vollständige Regelwerk für
// Adapter steht in ADAPTER.md im Stammverzeichnis.
//
// Vertrag: module.exports = function createAdapter(host) { return { start, stop, write, read } }
//   host.setStates(list)            – deklariert/aktualisiert den State-Katalog
//   host.publishState(address, val) – meldet einen aktuellen Wert
//   host.getConfig()                – die instanzeigenen Einstellungen
//   host.log(...) / host.error(...) – Logging in die homeESS-Konsole

module.exports = function createAdapter(host) {
  let timer = null;
  let schalter = false;

  // Adressraum dieses Adapters. Topics lauten demo://<instanz>/<address>.
  const STATES = [
    { address: 'messwerte/temperatur', name: 'Temperatur', category: 'Messwerte', unit: '°C', writable: false },
    { address: 'messwerte/leistung', name: 'Leistung', category: 'Messwerte', unit: 'W', writable: false },
    { address: 'steuerung/schalter', name: 'Schalter', category: 'Steuerung', unit: '', writable: true },
  ];

  function tick() {
    const cfg = host.getConfig();
    const basePower = Number(cfg.basePower) || 1000;
    const temperatur = (20 + Math.sin(Date.now() / 60000) * 5).toFixed(1);
    const leistung = Math.round(basePower + (Math.random() - 0.5) * basePower * 0.4);
    host.publishState('messwerte/temperatur', Number(temperatur));
    host.publishState('messwerte/leistung', leistung);
    host.publishState('steuerung/schalter', schalter);
  }

  return {
    start(config) {
      const intervalSec = Math.max(1, Number(config.interval) || 5);
      host.setStates(STATES);
      host.setConnected(true, 'Simulator');
      host.log(`gestartet, Intervall ${intervalSec}s`);
      tick();
      timer = setInterval(tick, intervalSec * 1000);
    },

    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },

    // Schreibwunsch aus homeESS (z. B. Output-Engine schreibt auf demo://…/schalter).
    write(address, value) {
      if (address === 'steuerung/schalter') {
        schalter = value === true || value === 'true' || value === 1 || value === '1';
        host.publishState('steuerung/schalter', schalter);
        host.log(`Schalter -> ${schalter}`);
      }
    },

    // Aktiver Lesewunsch (Refresh): aktuellen Wert sofort melden.
    read() {
      tick();
    },
  };
};
