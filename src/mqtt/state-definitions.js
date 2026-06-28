'use strict';

const { loadMqttConfig, buildMqttStateDefinitions } = require('./config');
const {
  loadStromverbrauchConfig,
  buildStromverbrauchStateDefinitions,
} = require('../stromverbrauch/config');
const {
  listPvPlants,
  buildPhotovoltaikStateDefinitions,
} = require('../photovoltaik/plants');
const {
  loadBatterieConfig,
  buildBatterieStateDefinitions,
} = require('../batterie/config');

async function loadAllStateDefinitions(db) {
  const mqttConfig = await new Promise((resolve) => loadMqttConfig(db, resolve));
  const stromverbrauchConfig = await new Promise((resolve) => loadStromverbrauchConfig(db, resolve));
  const batterieConfig = await new Promise((resolve) => loadBatterieConfig(db, resolve));
  const pvPlants = await listPvPlants(db);
  return [
    ...buildMqttStateDefinitions(mqttConfig),
    ...buildStromverbrauchStateDefinitions(stromverbrauchConfig),
    ...buildBatterieStateDefinitions(batterieConfig),
    ...buildPhotovoltaikStateDefinitions(pvPlants),
  ];
}

module.exports = { loadAllStateDefinitions };
