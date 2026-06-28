'use strict';

const express = require('express');
const { requireAuth } = require('../auth/session');
const mqttClient = require('../mqtt/client');
const { buildEnvironmentSnapshot } = require('../mqtt/config');
const { listPvPlants } = require('../photovoltaik/plants');
const { assessHeaderSkyState } = require('../photovoltaik/aggregation');

function renderEvent(name, data) {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

function liveRoutes(db) {
  const router = express.Router();

  router.get('/live/header', requireAuth, async (req, res) => {
    const cache = mqttClient.getCache();
    const snapshot = buildEnvironmentSnapshot(cache);
    let sky = 'moon';
    try {
      const plants = await listPvPlants(db);
      sky = await assessHeaderSkyState(db, cache, plants);
    } catch (_) {
      sky = 'moon';
    }
    const socRaw = cache.get('batterie.soc');
    const batterySoc = socRaw != null ? parseFloat(String(socRaw.value)) : NaN;
    res.json({ ...snapshot, sky, batterySoc: Number.isFinite(batterySoc) ? batterySoc : null });
  });

  router.get('/live/events', requireAuth, (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders && res.flushHeaders();
    res.write(renderEvent('ready', { connected: true, receivedAt: Date.now() }));

    const unsubscribe = mqttClient.onValuesChanged((event) => {
      res.write(renderEvent('mqtt', event));
    });

    const keepAlive = setInterval(() => {
      res.write(': keep-alive\n\n');
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe();
      res.end();
    });
  });

  return router;
}

module.exports = liveRoutes;
