'use strict';

const express = require('express');
const { requireAuth } = require('../auth/session');
const mqttClient = require('../mqtt/client');
const { loadAllStateDefinitions } = require('../mqtt/state-definitions');
const {
  loadStromverbrauchConfig,
  saveStromverbrauchConfig,
} = require('../stromverbrauch/config');
const {
  buildStromverbrauchSnapshot,
  setManualOffset,
  parseNumber,
} = require('../stromverbrauch/aggregation');
const renderStromverbrauch = require('../views/stromverbrauch');

async function renderPage(db, res, options = {}) {
  const config = await new Promise((resolve) => loadStromverbrauchConfig(db, resolve));
  const metrics = await buildStromverbrauchSnapshot(db, mqttClient.getCache());
  res.send(
    renderStromverbrauch({
      config,
      metrics,
      formMessage: options.formMessage || '',
      formError: options.formError || '',
      weekMessage: options.weekMessage || '',
      weekError: options.weekError || '',
      yearMessage: options.yearMessage || '',
      yearError: options.yearError || '',
    })
  );
}

function stromverbrauchRoutes(db) {
  const router = express.Router();

  router.get('/stromverbrauch', requireAuth, async (req, res, next) => {
    try {
      await renderPage(db, res);
    } catch (err) {
      next(err);
    }
  });

  router.get('/stromverbrauch/data', requireAuth, async (req, res, next) => {
    try {
      const metrics = await buildStromverbrauchSnapshot(db, mqttClient.getCache());
      res.json(metrics.formatted);
    } catch (err) {
      next(err);
    }
  });

  router.post('/stromverbrauch/topics', requireAuth, async (req, res, next) => {
    try {
      const cfg = await new Promise((resolve, reject) => {
        saveStromverbrauchConfig(db, req.body, (err, value) => (err ? reject(err) : resolve(value)));
      });
      const defs = await loadAllStateDefinitions(db);
      mqttClient.setStateDefinitions(defs);
      await renderPage(db, res, { formMessage: 'MQTT-Topics gespeichert.' });
    } catch (err) {
      try {
        await renderPage(db, res, { formError: 'Fehler beim Speichern der MQTT-Topics.' });
      } catch (_) {
        next(err);
      }
    }
  });

  router.post('/stromverbrauch/week-offset', requireAuth, async (req, res, next) => {
    try {
      const netzbezug = parseNumber(req.body.weekNetzbezugStartValue);
      const einspeisung = parseNumber(req.body.weekEinspeisungStartValue);
      if (netzbezug == null || einspeisung == null) {
        return renderPage(db, res, {
          weekError: 'Bitte gueltige Werte fuer Netzbezug und Einspeisung eingeben.',
        });
      }
      await setManualOffset(db, 'week', { netzbezug, einspeisung });
      await renderPage(db, res, { weekMessage: 'Wochenwert zum Tagesstart uebernommen.' });
    } catch (err) {
      next(err);
    }
  });

  router.post('/stromverbrauch/year-offset', requireAuth, async (req, res, next) => {
    try {
      const netzbezug = parseNumber(req.body.yearNetzbezugStartValue);
      const einspeisung = parseNumber(req.body.yearEinspeisungStartValue);
      if (netzbezug == null || einspeisung == null) {
        return renderPage(db, res, {
          yearError: 'Bitte gueltige Werte fuer Netzbezug und Einspeisung eingeben.',
        });
      }
      await setManualOffset(db, 'year', { netzbezug, einspeisung });
      await renderPage(db, res, { yearMessage: 'Jahreswert zum Tagesstart uebernommen.' });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = stromverbrauchRoutes;
