'use strict';

const express = require('express');
const { requireAuth } = require('../auth/session');
const mqttClient = require('../mqtt/client');
const { loadAllStateDefinitions } = require('../mqtt/state-definitions');
const {
  loadBatterieConfig,
  saveBatterieConfig,
  readBatterieData,
} = require('../batterie/config');
const renderBatterie = require('../views/batterie');

function batterieRoutes(db) {
  const router = express.Router();

  router.get('/batterie', requireAuth, (req, res) => {
    loadBatterieConfig(db, (config) => {
      const data = readBatterieData(mqttClient.getCache());
      res.send(renderBatterie({ config, data }));
    });
  });

  router.post('/batterie/topics', requireAuth, (req, res) => {
    saveBatterieConfig(db, req.body, (err, config) => {
      if (err) {
        loadBatterieConfig(db, (cfg) => {
          res.send(renderBatterie({ config: cfg, data: readBatterieData(mqttClient.getCache()), error: 'Fehler beim Speichern.' }));
        });
        return;
      }
      loadAllStateDefinitions(db)
        .then((defs) => mqttClient.setStateDefinitions(defs))
        .catch(() => {})
        .finally(() => {
          const data = readBatterieData(mqttClient.getCache());
          res.send(renderBatterie({ config, data, message: 'Konfiguration gespeichert.' }));
        });
    });
  });

  router.get('/batterie/data', requireAuth, (req, res) => {
    const data = readBatterieData(mqttClient.getCache());
    res.json(data);
  });

  return router;
}

module.exports = batterieRoutes;
