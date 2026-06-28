'use strict';

const path = require('path');

// Zentrale Konstanten der Anwendung. Eigene Datei, damit Werte an einer
// Stelle anpassbar sind und nicht über die Module verstreut liegen.
const ROOT_DIR = path.join(__dirname, '..');

module.exports = {
  ROOT_DIR,
  PORT: Number(process.env.PORT) || 3000,

  DATA_DIR: path.join(ROOT_DIR, 'data'),
  // Pfad zur SQLite-DB; per HOME_ESS_DB überschreibbar (z. B. für Tests).
  DB_PATH: process.env.HOME_ESS_DB || path.join(ROOT_DIR, 'data', 'app.db'),
  PUBLIC_DIR: path.join(ROOT_DIR, 'public'),

  // Standard-Zugangsdaten beim ersten Start (wird gehasht abgelegt).
  DEFAULT_PASSWORD: 'admin',

  // Session-/Cookie-Konfiguration.
  SESSION_COOKIE: 'ess_sid',
  // "Passwort merken" angehakt -> persistentes Cookie über 30 Tage.
  SESSION_REMEMBER_MS: 30 * 24 * 60 * 60 * 1000,
  // Ohne "merken" -> Session-Cookie, serverseitig nach 12 h ungültig.
  SESSION_DEFAULT_MS: 12 * 60 * 60 * 1000,
};
