'use strict';

// Aggregiert die von den Adapter-Instanzen gemeldeten States zu einem Baum
// (Instanz → Kategorie → State) inkl. aktuellem Live-Wert aus dem state-bus.
// Grundlage ist die persistierte Tabelle adapter_states (vom Host gepflegt), damit
// die States-Seite und der Picker auch bei gestopptem Adapter Namen anzeigen.

const bus = require('../state-bus');
const registry = require('./registry');
const instancesRepo = require('./instances');
const host = require('./host');
const { buildSchemeTopic } = require('../mqtt/topics');

function loadStateRows(db) {
  return new Promise((resolve) => {
    db.all('SELECT * FROM adapter_states ORDER BY category, name, address', (err, rows) => {
      resolve(err ? [] : rows || []);
    });
  });
}

function displayValue(value, unit) {
  if (value == null || value === '') return '—';
  return unit ? `${value} ${unit}` : String(value);
}

// Liefert: [{ instanceId, instanceName, adapterId, prefix, enabled, running,
//             categories: [{ name, states: [{ address, name, topic, unit,
//             writable, value, display }] }] }]
async function buildStatesTree(db) {
  const instances = await instancesRepo.listInstances(db);
  const rows = await loadStateRows(db);
  const cache = bus.getCache();
  const rowsByInstance = new Map();
  for (const row of rows) {
    if (!rowsByInstance.has(row.instance_id)) rowsByInstance.set(row.instance_id, []);
    rowsByInstance.get(row.instance_id).push(row);
  }

  return instances.map((instance) => {
    const manifest = registry.getManifest(instance.adapterId);
    const prefix = manifest ? manifest.prefix : instance.adapterId;
    const byCategory = new Map();
    for (const row of rowsByInstance.get(instance.id) || []) {
      const topic = buildSchemeTopic(prefix, instance.name, row.address);
      const cached = cache.get(topic);
      const value = cached ? cached.value : row.last_value;
      const cat = row.category || 'Allgemein';
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat).push({
        address: row.address,
        name: row.name || row.address,
        topic,
        unit: row.unit || '',
        writable: !!row.writable,
        value: value == null ? null : value,
        display: displayValue(value, row.unit),
      });
    }
    const categories = Array.from(byCategory.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'de'))
      .map(([name, states]) => ({ name, states }));
    return {
      instanceId: instance.id,
      instanceName: instance.name,
      adapterId: instance.adapterId,
      adapterName: manifest ? manifest.name : instance.adapterId,
      prefix,
      enabled: instance.enabled,
      running: host.isRunning(instance.id),
      categories,
    };
  });
}

module.exports = { buildStatesTree, displayValue };
