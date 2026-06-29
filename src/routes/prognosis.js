'use strict';

const express = require('express');
const { requireAuth } = require('../auth/session');
const mqttClient = require('../mqtt/client');
const { computePrognosis } = require('../prognosis/forecast');
const { savePrognosisConfig, activateBehaviorModel } = require('../prognosis/config');
const { applyBehaviorLevel } = require('../prognosis/behavior');
const { loadAllStateDefinitions } = require('../mqtt/state-definitions');
const operatingState = require('../operating-state');
const renderPrognosis = require('../views/prognosis');

async function renderPage(db, res, options = {}) {
  const prognosis = await computePrognosis(db, mqttClient.getCache(), { allowFetch: false });
  res.send(renderPrognosis({ prognosis, ...options }));
}

function prognosisRoutes(db) {
  const router = express.Router();

  router.get('/prognose', requireAuth, async (req, res, next) => {
    try { await renderPage(db, res); } catch (err) { next(err); }
  });

  router.get('/prognose/data', requireAuth, async (req, res, next) => {
    try {
      const prognosis = await computePrognosis(db, mqttClient.getCache(), { allowFetch: true });
      res.json(prognosis);
    } catch (err) { next(err); }
  });

  router.post('/prognose/behavior', requireAuth, async (req, res, next) => {
    try {
      const behavior = await activateBehaviorModel(db, req.body.behaviorModel);
      const prognosis = await computePrognosis(db, mqttClient.getCache(), { allowFetch: false });
      const applied = await applyBehaviorLevel(db, prognosis);
      // computePrognosis enthält den Betriebszustand vom Beginn der Berechnung.
      // Nach dem Setzen muss die Antwort den wirklich aktivierten Level zeigen.
      prognosis.operating = operatingState.getState();
      const result = applied
        ? ` · Level ${applied.level}: ${applied.reason}.`
        : ' · Regelung wartet auf eine vollständige Prognose.';
      res.send(renderPrognosis({
        prognosis,
        message: `${behavior.behaviorModel === 'off_grid' ? 'Autarkbetrieb' : 'Netzparallelbetrieb'} aktiviert${result}`,
      }));
    } catch (err) { next(err); }
  });

  router.post('/prognose/config', requireAuth, async (req, res, next) => {
    try {
      await savePrognosisConfig(db, req.body);
      const stateBefore = operatingState.getState();
      const nextTopic = String(req.body.autarkDaysTopic || '').trim();
      const nextPreviousYearTopic = String(req.body.autarkDaysPreviousYearTopic || '').trim();
      const currentChanged = nextTopic !== stateBefore.autarkDaysTopic;
      const previousYearChanged = nextPreviousYearTopic !== stateBefore.autarkDaysPreviousYearTopic;
      let message = 'Prognose-Einstellungen gespeichert.';
      if (currentChanged || previousYearChanged) {
        if (currentChanged) await operatingState.setAutarkDaysTopic(db, nextTopic);
        if (previousYearChanged) {
          await operatingState.setAutarkDaysPreviousYearTopic(db, nextPreviousYearTopic);
        }
        const preserveLocalCurrent = currentChanged && nextTopic && req.body.adoptMqttStart !== 'yes';
        const preserveLocalPrevious = previousYearChanged && nextPreviousYearTopic && req.body.adoptMqttPreviousYearStart !== 'yes';
        if (preserveLocalCurrent || preserveLocalPrevious) operatingState.suppressExternalSync(3000);
        const definitions = await loadAllStateDefinitions(db);
        mqttClient.setStateDefinitions(definitions);
        const messages = [];
        if (currentChanged && nextTopic) {
          messages.push(await applyMqttStart({
            cache: mqttClient.getCache(), key: operatingState.AUTARK_DAYS_STATE_ID,
            adopt: req.body.adoptMqttStart === 'yes',
            setValue: (value) => operatingState.setAutarkDaysCount(db, value),
            label: 'laufendes Jahr',
          }));
        }
        if (previousYearChanged && nextPreviousYearTopic) {
          messages.push(await applyMqttStart({
            cache: mqttClient.getCache(), key: operatingState.AUTARK_DAYS_PREVIOUS_YEAR_STATE_ID,
            adopt: req.body.adoptMqttPreviousYearStart === 'yes',
            setValue: (value) => operatingState.setAutarkDaysPreviousYearCount(db, value),
            label: 'Vorjahr',
          }));
        }
        if ((preserveLocalCurrent || preserveLocalPrevious)) operatingState.publishAutarkDays();
        if (messages.length) message = `Einstellungen gespeichert; ${messages.join(' ')}`;
      }
      await renderPage(db, res, { message });
    } catch (err) { next(err); }
  });

  return router;
}

async function applyMqttStart({ cache, key, adopt, setValue, label }) {
  if (!adopt) return `${label}: HomeESS-Zähler an MQTT gesendet.`;
  const external = await waitForCacheValue(cache, key, 2000);
  const number = Number(String(external == null ? '' : external).replace(',', '.'));
  if (!Number.isFinite(number) || number < 0) return `${label}: kein gültiger MQTT-Startwert verfügbar.`;
  await setValue(number);
  return `${label}: MQTT-Startwert ${Math.min(366, Math.round(number))} übernommen.`;
}

function waitForCacheValue(cache, key, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const check = () => {
      const entry = cache.get(key);
      if (entry && entry.value != null) return resolve(entry.value);
      if (Date.now() - started >= timeoutMs) return resolve(null);
      setTimeout(check, 100);
    };
    check();
  });
}

module.exports = prognosisRoutes;
