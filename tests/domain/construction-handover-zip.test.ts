import { describe, expect, it } from 'vitest';
import { handoverZip } from '@/server/construction/handover-zip';

describe('handover archive', () => {
  it('writes a bounded ZIP containing the manifest and document bytes', () => {
    const manifest = new TextEncoder().encode('{"ref":"HDP-0001"}');
    const pdf = new TextEncoder().encode('%PDF-1.7\ncontrolled revision');
    const archive = handoverZip([{ name: 'manifest.json', bytes: manifest }, { name: 'as_built-001.pdf', bytes: pdf }]);
    const view = new DataView(archive.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(archive.length - 22, true)).toBe(0x06054b50);
    expect(view.getUint16(archive.length - 22 + 10, true)).toBe(2);
    expect(new TextDecoder().decode(archive)).toContain('%PDF-1.7');
    expect(() => handoverZip([{ name: '../escape.pdf', bytes: pdf }])).toThrow('Invalid archive filename');
  });
});
