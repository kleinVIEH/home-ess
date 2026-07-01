'use strict';

// Minimaler, abhängigkeitsfreier Modbus-TCP-Client (pure Node net-Socket).
// Unterstützt die benötigten Funktionscodes: 01/02/03/04 (lesen), 05/06/16
// (schreiben). Anfragen werden seriell abgearbeitet (eine zur Zeit), Frames über
// die MBAP-Längeninfo zusammengesetzt. Reconnect/Polling steuert der Aufrufer.

const net = require('net');

const EXCEPTIONS = {
  1: 'Illegal Function', 2: 'Illegal Data Address', 3: 'Illegal Data Value',
  4: 'Server Device Failure', 5: 'Acknowledge', 6: 'Server Busy',
};

class ModbusTcpClient {
  constructor({ host, port = 502, unitId = 1, timeoutMs = 2000 } = {}) {
    this.host = host;
    this.port = Number(port) || 502;
    this.unitId = Number(unitId) || 1;
    this.timeoutMs = Number(timeoutMs) || 2000;
    this.socket = null;
    this.connected = false;
    this.buffer = Buffer.alloc(0);
    this.tid = 0;
    this.queue = [];
    this.pending = null; // { tid, fc, resolve, reject, timer }
  }

  connect() {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port });
      this.socket = socket;
      socket.setNoDelay(true);
      socket.once('connect', () => { this.connected = true; resolve(); });
      socket.on('data', (chunk) => this._onData(chunk));
      socket.on('error', (err) => { this._failAll(err); if (!this.connected) reject(err); });
      socket.on('close', () => { this.connected = false; this._failAll(new Error('Verbindung geschlossen')); });
    });
  }

  close() {
    if (this.socket) { try { this.socket.destroy(); } catch (_) { /* egal */ } }
    this.socket = null;
    this.connected = false;
  }

  _failAll(err) {
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(err);
      this.pending = null;
    }
    while (this.queue.length) this.queue.shift().reject(err);
  }

  _onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    // MBAP: tid(2) proto(2) length(2) unit(1) ... length zählt ab unitId.
    while (this.buffer.length >= 6) {
      const length = this.buffer.readUInt16BE(4);
      const total = 6 + length;
      if (this.buffer.length < total) break;
      const frame = this.buffer.subarray(0, total);
      this.buffer = this.buffer.subarray(total);
      this._handleFrame(frame);
    }
  }

  _handleFrame(frame) {
    const tid = frame.readUInt16BE(0);
    const fc = frame.readUInt8(7);
    const p = this.pending;
    if (!p || p.tid !== tid) return; // verwaiste/alte Antwort
    clearTimeout(p.timer);
    this.pending = null;
    const pdu = frame.subarray(7); // ab function code
    if (fc & 0x80) {
      const code = pdu.readUInt8(1);
      p.reject(new Error(`Modbus-Ausnahme ${code}: ${EXCEPTIONS[code] || 'unbekannt'}`));
    } else {
      try { p.resolve(p.parse(pdu)); } catch (err) { p.reject(err); }
    }
    this._next();
  }

  _next() {
    if (this.pending || !this.queue.length) return;
    if (!this.connected) { this._failAll(new Error('nicht verbunden')); return; }
    const job = this.queue.shift();
    const tid = (this.tid = (this.tid + 1) & 0xffff);
    const header = Buffer.alloc(7);
    header.writeUInt16BE(tid, 0);
    header.writeUInt16BE(0, 2);
    header.writeUInt16BE(job.pdu.length + 1, 4);
    header.writeUInt8(job.unit != null ? job.unit : this.unitId, 6);
    const frame = Buffer.concat([header, job.pdu]);
    this.pending = {
      tid, fc: job.pdu[0], parse: job.parse, resolve: job.resolve, reject: job.reject,
      timer: setTimeout(() => { this.pending = null; job.reject(new Error('Timeout')); this._next(); }, this.timeoutMs),
    };
    this.socket.write(frame);
  }

  _request(pdu, parse, unit) {
    return new Promise((resolve, reject) => {
      this.queue.push({ pdu, parse, unit, resolve, reject });
      this._next();
    });
  }

  _readBitsPdu(fc, address, quantity, unit) {
    const pdu = Buffer.alloc(5);
    pdu.writeUInt8(fc, 0);
    pdu.writeUInt16BE(address, 1);
    pdu.writeUInt16BE(quantity, 3);
    return this._request(pdu, (resp) => {
      const byteCount = resp.readUInt8(1);
      const bits = [];
      for (let i = 0; i < quantity; i += 1) {
        const byte = resp.readUInt8(2 + Math.floor(i / 8));
        bits.push(((byte >> (i % 8)) & 1) === 1);
      }
      void byteCount;
      return bits;
    }, unit);
  }

  _readRegistersPdu(fc, address, quantity, unit) {
    const pdu = Buffer.alloc(5);
    pdu.writeUInt8(fc, 0);
    pdu.writeUInt16BE(address, 1);
    pdu.writeUInt16BE(quantity, 3);
    return this._request(pdu, (resp) => {
      const byteCount = resp.readUInt8(1);
      const regs = [];
      for (let i = 0; i < byteCount; i += 2) regs.push(resp.readUInt16BE(2 + i));
      return regs;
    }, unit);
  }

  readCoils(address, quantity = 1, unit) { return this._readBitsPdu(0x01, address, quantity, unit); }
  readDiscreteInputs(address, quantity = 1, unit) { return this._readBitsPdu(0x02, address, quantity, unit); }
  readHoldingRegisters(address, quantity = 1, unit) { return this._readRegistersPdu(0x03, address, quantity, unit); }
  readInputRegisters(address, quantity = 1, unit) { return this._readRegistersPdu(0x04, address, quantity, unit); }

  writeCoil(address, value, unit) {
    const pdu = Buffer.alloc(5);
    pdu.writeUInt8(0x05, 0);
    pdu.writeUInt16BE(address, 1);
    pdu.writeUInt16BE(value ? 0xff00 : 0x0000, 3);
    return this._request(pdu, () => true, unit);
  }

  writeRegister(address, value, unit) {
    const pdu = Buffer.alloc(5);
    pdu.writeUInt8(0x06, 0);
    pdu.writeUInt16BE(address, 1);
    pdu.writeUInt16BE(value & 0xffff, 3);
    return this._request(pdu, () => true, unit);
  }

  writeRegisters(address, values, unit) {
    const qty = values.length;
    const pdu = Buffer.alloc(6 + qty * 2);
    pdu.writeUInt8(0x10, 0);
    pdu.writeUInt16BE(address, 1);
    pdu.writeUInt16BE(qty, 3);
    pdu.writeUInt8(qty * 2, 5);
    for (let i = 0; i < qty; i += 1) pdu.writeUInt16BE(values[i] & 0xffff, 6 + i * 2);
    return this._request(pdu, () => true, unit);
  }
}

module.exports = { ModbusTcpClient };
