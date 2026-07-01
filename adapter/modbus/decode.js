'use strict';

// Dekodierung/Kodierung von Modbus-Registerwerten gemäß PRESET.md (Datentypen,
// Byte-/Word-Reihenfolge, Skalierung). Reine Funktionen, ohne Netzwerk.

// Anzahl 16-bit-Register je Datentyp (string: explizite length).
function registerCount(reg) {
  switch (reg.dataType) {
    case 'int32': case 'uint32': case 'float32': return 2;
    case 'int64': case 'uint64': case 'float64': return 4;
    case 'string': return Math.max(1, Number(reg.length) || 1);
    default: return 1; // int16, uint16, bit, bool
  }
}

// Registerliste (Array von 16-bit-Ints) -> Byte-Buffer in kanonischer Reihenfolge.
function regsToBuffer(regs, byteOrder, wordOrder) {
  const words = wordOrder === 'little' ? regs.slice().reverse() : regs.slice();
  const buf = Buffer.alloc(words.length * 2);
  for (let i = 0; i < words.length; i += 1) {
    const w = words[i] & 0xffff;
    const hi = (w >> 8) & 0xff;
    const lo = w & 0xff;
    if (byteOrder === 'little') {
      buf[i * 2] = lo;
      buf[i * 2 + 1] = hi;
    } else {
      buf[i * 2] = hi;
      buf[i * 2 + 1] = lo;
    }
  }
  return buf;
}

function round6(n) {
  return Number.isInteger(n) ? n : Math.round(n * 1e6) / 1e6;
}

// Rohwert aus Registern dekodieren (ohne Skalierung). Für coil/discrete wird der
// Boolean bereits beim Lesen geliefert; hier nur Registertypen.
function decodeRaw(regs, reg) {
  const byteOrder = reg.byteOrder === 'little' ? 'little' : 'big';
  const wordOrder = reg.wordOrder === 'little' ? 'little' : 'big';

  if (reg.dataType === 'bit') {
    const bit = Number(reg.bit) || 0;
    return ((regs[0] >> bit) & 1) === 1;
  }
  if (reg.dataType === 'string') {
    // String: Bytes je Register (byteOrder), keine Wort-Umkehr.
    const buf = regsToBuffer(regs, byteOrder, 'big');
    const end = buf.indexOf(0);
    return buf.toString('ascii', 0, end === -1 ? buf.length : end).trim();
  }

  const buf = regsToBuffer(regs, byteOrder, wordOrder);
  switch (reg.dataType) {
    case 'int16': return buf.readInt16BE(0);
    case 'uint16': return buf.readUInt16BE(0);
    case 'int32': return buf.readInt32BE(0);
    case 'uint32': return buf.readUInt32BE(0);
    case 'int64': return Number(buf.readBigInt64BE(0));
    case 'uint64': return Number(buf.readBigUInt64BE(0));
    case 'float32': return round6(buf.readFloatBE(0));
    case 'float64': return round6(buf.readDoubleBE(0));
    default: return buf.readUInt16BE(0);
  }
}

// Vollständig dekodieren inkl. Skalierung/Offset.
function decode(regs, reg) {
  const raw = decodeRaw(regs, reg);
  if (typeof raw !== 'number') return raw; // bool/string unverändert
  const scale = reg.scale == null || reg.scale === '' ? 1 : Number(reg.scale);
  const offset = reg.offset == null || reg.offset === '' ? 0 : Number(reg.offset);
  return round6(raw * (Number.isFinite(scale) ? scale : 1) + (Number.isFinite(offset) ? offset : 0));
}

// Kanonischen Byte-Buffer in Register zerlegen (Umkehrung von regsToBuffer).
function bufferToRegs(buf, byteOrder, wordOrder) {
  const count = buf.length / 2;
  const regs = [];
  for (let i = 0; i < count; i += 1) {
    const a = buf[i * 2];
    const b = buf[i * 2 + 1];
    regs.push(byteOrder === 'little' ? ((b << 8) | a) : ((a << 8) | b));
  }
  return wordOrder === 'little' ? regs.reverse() : regs;
}

// Wert zum Schreiben in Register kodieren. Liefert Array von 16-bit-Ints.
// Unterstützt int16/uint16/int32/uint32/float32/float64 (skaliert).
function encode(value, reg) {
  const byteOrder = reg.byteOrder === 'little' ? 'little' : 'big';
  const wordOrder = reg.wordOrder === 'little' ? 'little' : 'big';
  const scale = reg.scale == null || reg.scale === '' ? 1 : Number(reg.scale);
  const offset = reg.offset == null || reg.offset === '' ? 0 : Number(reg.offset);
  const raw = (Number(value) - (Number.isFinite(offset) ? offset : 0)) / (Number.isFinite(scale) && scale !== 0 ? scale : 1);

  let buf;
  switch (reg.dataType) {
    case 'int16': buf = Buffer.alloc(2); buf.writeInt16BE((Math.round(raw) << 16) >> 16, 0); break;
    case 'uint16': buf = Buffer.alloc(2); buf.writeUInt16BE(Math.round(raw) & 0xffff, 0); break;
    case 'int32': buf = Buffer.alloc(4); buf.writeInt32BE(Math.round(raw) | 0, 0); break;
    case 'uint32': buf = Buffer.alloc(4); buf.writeUInt32BE(Math.round(raw) >>> 0, 0); break;
    case 'float32': buf = Buffer.alloc(4); buf.writeFloatBE(raw, 0); break;
    case 'float64': buf = Buffer.alloc(8); buf.writeDoubleBE(raw, 0); break;
    default: buf = Buffer.alloc(2); buf.writeUInt16BE(Math.round(raw) & 0xffff, 0); break;
  }
  return bufferToRegs(buf, byteOrder, wordOrder);
}

function toBool(value) {
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'on';
}

module.exports = { registerCount, decode, decodeRaw, encode, regsToBuffer, bufferToRegs, toBool };
