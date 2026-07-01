'use strict';

// Modbus-TCP-Adapter. Liest die in der Instanz angelegten Register (Live-States,
// aus config.registers — NICHT aus Presets) periodisch vom Server und meldet die
// dekodierten Werte. Schreibbare Register nehmen Schreibvorgänge aus homeESS an.
// Regelwerk für Presets: PRESET.md. Datentypen/Reihenfolgen: decode.js.

const { ModbusTcpClient } = require('./modbus-tcp');
const { registerCount, decode, encode, toBool } = require('./decode');

module.exports = function createModbusAdapter(host) {
  let cfg = {};
  let registers = [];
  let byAddress = new Map();
  let client = null;
  let connecting = false;
  let stopped = false;
  const timers = [];

  function buildClient() {
    return new ModbusTcpClient({
      host: cfg.host,
      port: cfg.port,
      timeoutMs: cfg.timeoutMs,
    });
  }

  // Unit-ID des Registers (erste Adressebene, Default 1).
  function unitOf(reg) {
    const u = Number(reg.unitId);
    return Number.isInteger(u) && u >= 0 ? u : 1;
  }

  // homeESS-State-Adresse: <unitId>/<adresse> -> modbus://instanz/<unitId>/<adresse>.
  function stateAddress(reg) {
    return `${unitOf(reg)}/${reg.address}`;
  }

  async function ensureConnected() {
    if (stopped || !cfg.host) return false;
    if (client && client.connected) return true;
    if (connecting) return false;
    connecting = true;
    try {
      client = buildClient();
      await client.connect();
      host.log(`verbunden mit ${cfg.host}:${cfg.port || 502}`);
      host.setConnected(true, `${cfg.host}:${cfg.port || 502}`);
      connecting = false;
      return true;
    } catch (err) {
      if (client) client.close();
      client = null;
      connecting = false;
      host.setConnected(false, `nicht erreichbar: ${cfg.host}:${cfg.port || 502}`);
      return false;
    }
  }

  async function readRegister(reg) {
    const unit = unitOf(reg);
    if (reg.registerType === 'coil') return (await client.readCoils(reg.register, 1, unit))[0];
    if (reg.registerType === 'discrete') return (await client.readDiscreteInputs(reg.register, 1, unit))[0];
    const count = registerCount(reg);
    const regs = reg.registerType === 'input'
      ? await client.readInputRegisters(reg.register, count, unit)
      : await client.readHoldingRegisters(reg.register, count, unit);
    return decode(regs, reg);
  }

  async function pollOne(reg) {
    if (!(await ensureConnected())) return;
    try {
      const value = await readRegister(reg);
      if (value != null) host.publishState(stateAddress(reg), value);
    } catch (err) {
      // Lesefehler: bei Verbindungsabbruch Client verwerfen -> nächster Tick reconnectet.
      if (!client || !client.connected) { client = null; host.setConnected(false, 'Verbindung verloren'); }
    }
  }

  function isWritable(reg) {
    return reg.writable && (reg.registerType === 'coil' || reg.registerType === 'holding');
  }

  return {
    async start(config) {
      cfg = config || {};
      registers = Array.isArray(cfg.registers) ? cfg.registers : [];
      // Schlüssel ist die mehrstufige State-Adresse <unitId>/<adresse>.
      byAddress = new Map(registers.map((r) => [stateAddress(r), r]));

      host.setStates(registers.map((r) => ({
        address: stateAddress(r),
        name: r.name,
        category: r.category,
        unit: r.unit,
        writable: isWritable(r),
      })));

      if (!cfg.host) { host.log('kein Server konfiguriert – warte auf Einstellungen.'); return; }
      if (!registers.length) { host.log('keine Register angelegt.'); }

      await ensureConnected();
      for (const reg of registers) {
        await pollOne(reg);
        const interval = Math.max(250, Number(reg.pollIntervalMs) || 5000);
        timers.push(setInterval(() => { pollOne(reg).catch(() => {}); }, interval));
      }
    },

    stop() {
      stopped = true;
      while (timers.length) clearInterval(timers.pop());
      if (client) client.close();
      client = null;
    },

    write(address, value) {
      const reg = byAddress.get(address);
      if (!reg || !isWritable(reg)) return;
      ensureConnected().then((ok) => {
        if (!ok) return;
        const unit = unitOf(reg);
        const done = reg.registerType === 'coil'
          ? client.writeCoil(reg.register, toBool(value), unit)
          : (() => {
              const regs = encode(value, reg);
              return regs.length === 1
                ? client.writeRegister(reg.register, regs[0], unit)
                : client.writeRegisters(reg.register, regs, unit);
            })();
        Promise.resolve(done)
          .then(() => pollOne(reg))
          .catch((err) => host.error(`Schreiben ${address} fehlgeschlagen: ${err.message}`));
      });
    },

    read(address) {
      const reg = byAddress.get(address);
      if (reg) pollOne(reg).catch(() => {});
    },
  };
};
