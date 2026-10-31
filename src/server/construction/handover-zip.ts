/** Small, deterministic ZIP writer for a bounded handover pack. Files are stored
 * without compression because project PDFs are already compressed. */
export function handoverZip(entries: readonly { name: string; bytes: Uint8Array }[]): Uint8Array {
  if (!entries.length || entries.length > 32) throw new Error('Invalid handover archive.');
  const table = Uint32Array.from({ length: 256 }, (_, index) => {
    let crc = index;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    return crc >>> 0;
  });
  const crc32 = (bytes: Uint8Array) => { let crc = 0xffffffff; for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; };
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = []; const central: Uint8Array[] = [];
  let offset = 0; let total = 0;
  for (const entry of entries) {
    if (!entry.name || entry.name.length > 160 || /[/\\\u0000-\u001f]/.test(entry.name)) throw new Error('Invalid archive filename.');
    total += entry.bytes.length;
    if (total > 50_000_000) throw new Error('Handover archive exceeds 50 MB.');
    const name = encoder.encode(entry.name); const crc = crc32(entry.bytes);
    const local = new Uint8Array(30 + name.length); const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x0800, true);
    l.setUint32(14, crc, true); l.setUint32(18, entry.bytes.length, true); l.setUint32(22, entry.bytes.length, true); l.setUint16(26, name.length, true);
    local.set(name, 30); chunks.push(local, entry.bytes);
    const directory = new Uint8Array(46 + name.length); const d = new DataView(directory.buffer);
    d.setUint32(0, 0x02014b50, true); d.setUint16(4, 20, true); d.setUint16(6, 20, true); d.setUint16(8, 0x0800, true);
    d.setUint32(16, crc, true); d.setUint32(20, entry.bytes.length, true); d.setUint32(24, entry.bytes.length, true);
    d.setUint16(28, name.length, true); d.setUint32(42, offset, true); directory.set(name, 46); central.push(directory);
    offset += local.length + entry.bytes.length;
  }
  const centralLength = central.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22); const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true);
  e.setUint32(12, centralLength, true); e.setUint32(16, offset, true);
  const output = new Uint8Array(offset + centralLength + end.length);
  let cursor = 0;
  for (const part of [...chunks, ...central, end]) { output.set(part, cursor); cursor += part.length; }
  return output;
}
