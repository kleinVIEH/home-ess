'use strict';

const { normalizeMqttTopic } = require('../mqtt/topics');

const STATE_IDS = {
  soc: 'batterie.soc',
  power: 'batterie.power',
  voltage: 'batterie.voltage',
  temperatur: 'batterie.temperatur',
};

const DEFAULTS = {
  socTopic: '',
  powerTopic: '',
  voltageTopic: '',
  temperaturTopic: '',
};

function loadBatterieConfig(db, callback) {
  db.get(
    'SELECT soc_topic, power_topic, voltage_topic, temperatur_topic FROM batterie_config WHERE id = 1',
    (err, row) => {
      if (err || !row) return callback({ ...DEFAULTS });
      callback({
        socTopic: row.soc_topic || '',
        powerTopic: row.power_topic || '',
        voltageTopic: row.voltage_topic || '',
        temperaturTopic: row.temperatur_topic || '',
      });
    }
  );
}

function saveBatterieConfig(db, input, callback) {
  const cfg = {
    socTopic: normalizeMqttTopic(input.socTopic || ''),
    powerTopic: normalizeMqttTopic(input.powerTopic || ''),
    voltageTopic: normalizeMqttTopic(input.voltageTopic || ''),
    temperaturTopic: normalizeMqttTopic(input.temperaturTopic || ''),
  };
  db.run(
    `INSERT INTO batterie_config (id, soc_topic, power_topic, voltage_topic, temperatur_topic)
     VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       soc_topic = excluded.soc_topic,
       power_topic = excluded.power_topic,
       voltage_topic = excluded.voltage_topic,
       temperatur_topic = excluded.temperatur_topic`,
    [cfg.socTopic, cfg.powerTopic, cfg.voltageTopic, cfg.temperaturTopic],
    (err) => callback(err, cfg)
  );
}

function buildBatterieStateDefinitions(cfg) {
  return [
    { id: STATE_IDS.soc,       topic: cfg.socTopic },
    { id: STATE_IDS.power,     topic: cfg.powerTopic },
    { id: STATE_IDS.voltage,   topic: cfg.voltageTopic },
    { id: STATE_IDS.temperatur, topic: cfg.temperaturTopic },
  ].filter((e) => e.topic);
}

function readBatterieData(cache) {
  const get = (id) => { const e = cache.get(id); return e ? e.value : null; };
  return {
    soc:       get(STATE_IDS.soc),
    power:     get(STATE_IDS.power),
    voltage:   get(STATE_IDS.voltage),
    temperatur: get(STATE_IDS.temperatur),
  };
}

module.exports = {
  loadBatterieConfig,
  saveBatterieConfig,
  buildBatterieStateDefinitions,
  readBatterieData,
  STATE_IDS,
  DEFAULTS,
};
