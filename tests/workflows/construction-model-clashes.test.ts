import { describe, expect, it } from 'vitest';
import { compareModels, parseModelComponents } from '@/domain/construction/model-clashes';

const obj = (label: string, x: number) => new TextEncoder().encode(`o ${label}\nv ${x} 0 0\nv ${x + 1} 0 0\nv ${x + 1} 1 0\nv ${x} 0 1\nf 1 2 3\nf 1 2 4\n`);
function glb(): Uint8Array {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 1]);
  const json = JSON.stringify({ asset: { version: '2.0' }, buffers: [{ byteLength: positions.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ name: 'Duct', extras: { ifcGuid: 'ifc-duct-1' }, mesh: 0, translation: [2, 3, 4] }], scenes: [{ nodes: [0] }], scene: 0 });
  const text = new TextEncoder().encode(json), jsonLength = Math.ceil(text.length / 4) * 4;
  const bytes = new Uint8Array(12 + 8 + jsonLength + 8 + positions.byteLength), view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.length, true);
  view.setUint32(12, jsonLength, true); view.setUint32(16, 0x4e4f534a, true); bytes.set(text, 20); bytes.fill(32, 20 + text.length, 20 + jsonLength);
  const at = 20 + jsonLength; view.setUint32(at, positions.byteLength, true); view.setUint32(at + 4, 0x004e4942, true);
  bytes.set(new Uint8Array(positions.buffer), at + 8); return bytes;
}

describe('Construction model geometry precheck', () => {
  it('parses named OBJ elements and flags only envelopes overlapping beyond tolerance', () => {
    const structure = parseModelComponents(obj('Beam-42', 0), 'structure.obj');
    const overlapping = parseModelComponents(obj('Duct-17', 0.5), 'mep.obj');
    const distant = parseModelComponents(obj('Duct-18', 2), 'mep.obj');
    expect(structure[0]).toMatchObject({ id: 'Beam-42#1', min: [0, 0, 0], max: [1, 1, 1] });
    expect(compareModels(structure, overlapping, 5)).toMatchObject([{ point: [0.75, 0.5, 0.5], overlapMm: 500 }]);
    expect(compareModels(structure, overlapping, 600)).toEqual([]);
    expect(compareModels(structure, distant, 0)).toEqual([]);
  });

  it('applies GLB node transforms and retains IFC component identifiers when exported', () => {
    const components = parseModelComponents(glb(), 'mep.glb');
    expect(components).toEqual([{ id: 'ifc-duct-1:0', name: 'Duct', min: [2, 3, 4], max: [3, 4, 5] }]);
    expect(compareModels(components, [{ id: 'beam', name: 'Beam', min: [2.5, 3, 4.5], max: [3.5, 4, 5.5] }], 5)).toHaveLength(1);
  });

  it('rejects malformed geometry and unsafe comparison requests', () => {
    expect(() => parseModelComponents(new TextEncoder().encode('o Broken\nv 0 0 0\nf 1 2 3\n' + ' '.repeat(40)), 'broken.obj')).toThrow();
    expect(() => compareModels(parseModelComponents(obj('A', 0), 'a.obj'), parseModelComponents(obj('B', 0), 'b.obj'), -1)).toThrow();
  });
});
