'use strict';

const express = require('express');
const { requireAuth } = require('../auth/session');
const { hashPassword } = require('../auth/password');
const { loadMqttConfig, saveMqttConfig } = require('../mqtt/config');
const mqttClient = require('../mqtt/client');
const { loadAllStateDefinitions } = require('../mqtt/state-definitions');
const renderSettings = require('../views/settings');

// Einstellungs-Routen: Seite anzeigen, Passwort ändern, MQTT speichern/testen.
function settingsRoutes(db) {
  const router = express.Router();

  router.get('/settings', requireAuth, (req, res) => {
    loadMqttConfig(db, (cfg) => res.send(renderSettings({ mqtt: cfg })));
  });

  router.post('/settings/password', requireAuth, (req, res) => {
    const { password, passwordConfirm } = req.body;
    const fail = (msg) =>
      loadMqttConfig(db, (cfg) => res.send(renderSettings({ mqtt: cfg, passwordError: msg })));

    if (!password || !passwordConfirm) return fail('Bitte beide Felder ausfüllen.');
    if (password !== passwordConfirm) return fail('Passwörter stimmen nicht überein.');

    db.run(
      'UPDATE users SET password = ? WHERE id = (SELECT id FROM users LIMIT 1)',
      [hashPassword(password)],
      (err) => {
        if (err) return fail('Fehler beim Speichern.');
        loadMqttConfig(db, (cfg) =>
          res.send(renderSettings({ mqtt: cfg, passwordSuccess: 'Passwort gespeichert.' }))
        );
      }
    );
  });

  router.post('/settings/mqtt', requireAuth, (req, res) => {
    saveMqttConfig(db, req.body, (err, cfg) => {
      if (err) {
        return res.send(renderSettings({ mqtt: req.body, mqttMessage: 'Fehler beim Speichern.' }));
      }
      loadAllStateDefinitions(db)
        .then((definitions) => {
          mqttClient.setStateDefinitions(definitions);
          mqttClient.connect(cfg);
          res.send(renderSettings({ mqtt: cfg, mqttMessage: 'MQTT-Konfiguration gespeichert.' }));
        })
        .catch(() => {
          mqttClient.connect(cfg);
          res.send(renderSettings({ mqtt: cfg, mqttMessage: 'MQTT-Konfiguration gespeichert.' }));
        });
    });
  });

  router.post('/settings/mqtt/test', requireAuth, async (req, res) => {
    const result = await mqttClient.testConnection(req.body);
    res.json(result);
  });

  return router;
}

module.exports = settingsRoutes;
