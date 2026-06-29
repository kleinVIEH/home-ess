'use strict';

const DEFAULTS = {
  chargeEfficiency: 95,
  dischargeEfficiency: 95,
  historyDays: 28,
  behaviorModel: 'grid_parallel',
  behaviorActive: false,
};

const BEHAVIOR_MODELS = {
  grid_parallel: 'Netzparallelbetrieb',
  off_grid: 'Autarkbetrieb',
};

function numberInRange(value, min, max, fallback) {
  const parsed = Number(String(value == null ? '' : value).replace(',', '.'));
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function loadPrognosisConfig(db) {
  return new Promise((resolve) => {
    db.get('SELECT * FROM prognosis_config WHERE id = 1', (err, row) => {
      if (err || !row) return resolve({ ...DEFAULTS });
      resolve({
        chargeEfficiency: numberInRange(row.charge_efficiency, 50, 100, DEFAULTS.chargeEfficiency),
        dischargeEfficiency: numberInRange(row.discharge_efficiency, 50, 100, DEFAULTS.dischargeEfficiency),
        historyDays: Math.round(numberInRange(row.history_days, 7, 90, DEFAULTS.historyDays)),
        behaviorModel: BEHAVIOR_MODELS[row.behavior_model] ? row.behavior_model : DEFAULTS.behaviorModel,
        behaviorActive: !!row.behavior_active,
      });
    });
  });
}

function savePrognosisConfig(db, input) {
  const config = {
    chargeEfficiency: numberInRange(input.chargeEfficiency, 50, 100, DEFAULTS.chargeEfficiency),
    dischargeEfficiency: numberInRange(input.dischargeEfficiency, 50, 100, DEFAULTS.dischargeEfficiency),
    historyDays: Math.round(numberInRange(input.historyDays, 7, 90, DEFAULTS.historyDays)),
  };
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO prognosis_config
        (id, charge_efficiency, discharge_efficiency, history_days)
       VALUES (1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        charge_efficiency=excluded.charge_efficiency,
        discharge_efficiency=excluded.discharge_efficiency,
        history_days=excluded.history_days`,
      [config.chargeEfficiency, config.dischargeEfficiency, config.historyDays],
      (err) => (err ? reject(err) : resolve(config))
    );
  });
}

function activateBehaviorModel(db, model) {
  const behaviorModel = BEHAVIOR_MODELS[model] ? model : DEFAULTS.behaviorModel;
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE prognosis_config SET behavior_model = ?, behavior_active = 1 WHERE id = 1`,
      [behaviorModel],
      (err) => (err ? reject(err) : resolve({ behaviorModel, behaviorActive: true }))
    );
  });
}

module.exports = {
  loadPrognosisConfig, savePrognosisConfig, activateBehaviorModel,
  DEFAULTS, BEHAVIOR_MODELS,
};
