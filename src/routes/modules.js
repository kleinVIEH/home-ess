'use strict';

const express = require('express');
const { requireAuth } = require('../auth/session');
const modulesState = require('../modules');
const renderModules = require('../views/modules');

function modulesRoutes(db) {
  const router = express.Router();

  function sendPage(res, message = '') {
    const registry = modulesState.getRegistry();
    const enabledKeys = new Set(
      registry.filter((m) => modulesState.isEnabled(m.key)).map((m) => m.key)
    );
    res.send(renderModules({ registry, enabledKeys, message }));
  }

  router.get('/module', requireAuth, (req, res) => {
    sendPage(res);
  });

  router.post('/module/:key/enable', requireAuth, (req, res) => {
    const { key } = req.params;
    const mod = modulesState.getRegistry().find((m) => m.key === key);
    if (!mod) return res.status(404).send('Unbekanntes Modul.');
    modulesState
      .setEnabled(db, key, true)
      .then(() => sendPage(res, `Modul "${mod.label}" wurde aktiviert.`))
      .catch(() => sendPage(res, 'Fehler beim Aktivieren.'));
  });

  router.post('/module/:key/disable', requireAuth, (req, res) => {
    const { key } = req.params;
    const mod = modulesState.getRegistry().find((m) => m.key === key);
    if (!mod) return res.status(404).send('Unbekanntes Modul.');
    modulesState
      .setEnabled(db, key, false)
      .then(() => sendPage(res, `Modul "${mod.label}" wurde deaktiviert.`))
      .catch(() => sendPage(res, 'Fehler beim Deaktivieren.'));
  });

  return router;
}

module.exports = modulesRoutes;
