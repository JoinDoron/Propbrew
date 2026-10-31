/** Bounded, deterministic geometry precheck for exported coordination models.
 * An overlapping component envelope is a clash candidate, not engineering sign-off. */
export const MODEL_MAX_BYTES = 12 * 1024 * 1024;
export const MODEL_MAX_COMPONENTS = 2_000;
export const MODEL_MAX_CANDIDATES = 100;
export type ModelFormat = 'obj' | 'glb';
export type Point3 = [number, number, number];
export type ModelComponent = { id: string; name: string; min: Point3; max: Point3 };
export type ClashCandidate = { a: ModelComponent; b: ModelComponent; point: Point3; overlapMm: number };

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const point = (values: unknown): values is Point3 => Array.isArray(values) && values.length === 3 && values.every(finite);
const empty = (): { min: Point3; max: Point3; faces: number } => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], faces: 0 });
function include(box: { min: Point3; max: Point3 }, p: Point3) {
  for (let axis = 0; axis < 3; axis++) { box.min[axis] = Math.min(box.min[axis], p[axis]); box.max[axis] = Math.max(box.max[axis], p[axis]); }
}
function name(value: unknown, fallback: string): string { return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : fallback; }

export function detectModelFormat(bytes: Uint8Array, fileName: string): ModelFormat | null {
  if (bytes.length < 32 || bytes.length > MODEL_MAX_BYTES) return null;
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.glb') && new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true) === 0x46546c67) return 'glb';
  if (lower.endsWith('.obj') && bytes.subarray(0, 1024).every((byte) => byte === 9 || byte === 10 || byte === 13 || byte >= 32 && byte <= 126)) return 'obj';
  return null;
}

function parseObj(bytes: Uint8Array): ModelComponent[] {
  const body = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const vertices: Point3[] = []; const groups = new Map<string, ReturnType<typeof empty>>();
  let current = 'Model'; let faces = 0;
  for (const line of body.split(/\r?\n/)) {
    if (line.startsWith('o ') || line.startsWith('g ')) { current = name(line.slice(2), `Element ${groups.size + 1}`); continue; }
    if (line.startsWith('v ')) {
      const parts = line.slice(2).trim().split(/\s+/).slice(0, 3).map(Number);
      if (!point(parts)) throw new Error('Model vertex coordinates are invalid.');
      vertices.push(parts); if (vertices.length > 750_000) throw new Error('Model has too many vertices.');
    }
    if (!line.startsWith('f ')) continue;
    const indexes = line.slice(2).trim().split(/\s+/);
    if (indexes.length < 3) throw new Error('Model contains an invalid face.');
    const box = groups.get(current) ?? empty(); groups.set(current, box);
    for (const token of indexes) {
      const raw = Number(token.split('/')[0]);
      const index = raw > 0 ? raw - 1 : vertices.length + raw;
      if (!Number.isInteger(raw) || raw === 0 || index < 0 || index >= vertices.length) throw new Error('Model face references a missing vertex.');
      include(box, vertices[index]);
    }
    box.faces++; if (++faces > 500_000) throw new Error('Model has too many faces.');
  }
  const components = [...groups].filter(([, box]) => box.faces).map(([label, box], index) => ({ id: `${label}#${index + 1}`, name: label, min: box.min, max: box.max }));
  if (!components.length || components.length > MODEL_MAX_COMPONENTS) throw new Error('Model must contain between 1 and 2,000 named geometry groups.');
  return components;
}

type Gltf = { buffers?: { byteLength: number; uri?: string }[]; bufferViews?: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }[];
  accessors?: { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string; sparse?: unknown }[];
  meshes?: { name?: string; extras?: Record<string, unknown>; primitives: { attributes: { POSITION?: number } }[] }[];
  nodes?: { name?: string; extras?: Record<string, unknown>; mesh?: number; children?: number[]; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }[];
  scenes?: { nodes?: number[] }[]; scene?: number };
type Matrix = [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];
const identity = (): Matrix => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function multiply(a: Matrix, b: Matrix): Matrix { const out = identity(); for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) out[col * 4 + row] = a[row] * b[col * 4] + a[4 + row] * b[col * 4 + 1] + a[8 + row] * b[col * 4 + 2] + a[12 + row] * b[col * 4 + 3]; return out; }
function localMatrix(node: NonNullable<Gltf['nodes']>[number]): Matrix {
  if (node.matrix) { if (node.matrix.length !== 16 || !node.matrix.every(finite)) throw new Error('Model transform is invalid.'); return node.matrix as Matrix; }
  const t = node.translation ?? [0, 0, 0], s = node.scale ?? [1, 1, 1], q = node.rotation ?? [0, 0, 0, 1];
  if (!point(t) || !point(s) || q.length !== 4 || !q.every(finite)) throw new Error('Model transform is invalid.');
  const [x, y, z, w] = q, [sx, sy, sz] = s;
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    t[0], t[1], t[2], 1];
}
function transform(m: Matrix, p: Point3): Point3 { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; }
function parseGlb(bytes: Uint8Array): ModelComponent[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length) throw new Error('Choose a valid GLB 2.0 model.');
  let json: Gltf | null = null, binary: Uint8Array | null = null;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true); offset += 8;
    if (length > bytes.length - offset) throw new Error('Model chunk is incomplete.');
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(bytes.subarray(offset, offset + length))) as Gltf;
    if (type === 0x004e4942) binary = bytes.subarray(offset, offset + length);
    offset += length;
  }
  if (!json || !binary || json.buffers?.length !== 1 || json.buffers[0].uri || json.buffers[0].byteLength > binary.length) throw new Error('GLB must contain embedded geometry.');
  const model: Gltf = json, bin: Uint8Array = binary;
  const meshes = model.meshes ?? [], nodes = model.nodes ?? [], components: ModelComponent[] = [], visited = new Set<number>();
  function meshBounds(meshIndex: number, matrix: Matrix, label: string, nodeId: number) {
    const mesh = meshes[meshIndex]; if (!mesh) throw new Error('Model mesh reference is invalid.');
    for (let p = 0; p < mesh.primitives.length; p++) {
      const accessor = model.accessors?.[mesh.primitives[p].attributes.POSITION ?? -1];
      const source = accessor && model.bufferViews?.[accessor.bufferView ?? -1];
      if (!accessor || !source || accessor.type !== 'VEC3' || accessor.componentType !== 5126 || accessor.sparse || source.buffer !== 0 || accessor.count < 1 || accessor.count > 750_000) throw new Error('GLB position data is unsupported or invalid.');
      const stride = source.byteStride ?? 12, start = (source.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
      if (stride < 12 || start < 0 || start + (accessor.count - 1) * stride + 12 > (source.byteOffset ?? 0) + source.byteLength || start + (accessor.count - 1) * stride + 12 > bin.length) throw new Error('GLB position data is incomplete.');
      const box = empty(), data = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
      for (let i = 0; i < accessor.count; i++) { const at = start + i * stride, xyz: Point3 = [data.getFloat32(at, true), data.getFloat32(at + 4, true), data.getFloat32(at + 8, true)]; if (!point(xyz)) throw new Error('GLB contains invalid geometry.'); include(box, transform(matrix, xyz)); }
      const guid = name(nodes[nodeId]?.extras?.ifcGuid ?? nodes[nodeId]?.extras?.GlobalId ?? mesh.extras?.ifcGuid, `node-${nodeId}`);
      components.push({ id: `${guid}:${p}`, name: label, min: box.min, max: box.max });
      if (components.length > MODEL_MAX_COMPONENTS) throw new Error('Model has more than 2,000 geometry components.');
    }
  }
  function visit(index: number, parent: Matrix, stack: Set<number>) {
    const node = nodes[index]; if (!node || stack.has(index)) throw new Error('Model scene graph is invalid.');
    const next = new Set(stack).add(index), matrix = multiply(parent, localMatrix(node)); visited.add(index);
    if (node.mesh !== undefined) meshBounds(node.mesh, matrix, name(node.name, name(meshes[node.mesh]?.name, `Element ${index + 1}`)), index);
    for (const child of node.children ?? []) visit(child, matrix, next);
  }
  const roots = model.scenes?.[model.scene ?? 0]?.nodes ?? nodes.map((_, index) => index).filter((index) => !nodes.some((row) => row.children?.includes(index)));
  for (const root of roots) if (!visited.has(root)) visit(root, identity(), new Set());
  if (!components.length) throw new Error('Model has no readable 3D mesh geometry.');
  return components;
}

export function parseModelComponents(bytes: Uint8Array, fileName: string): ModelComponent[] {
  const format = detectModelFormat(bytes, fileName);
  if (!format) throw new Error('Upload an OBJ or embedded GLB model of at most 12 MB.');
  return format === 'obj' ? parseObj(bytes) : parseGlb(bytes);
}

/** Compare two disciplines in the same coordinate system. Distinct component
 * envelopes must overlap beyond the tolerance on all three axes. */
export function compareModels(a: readonly ModelComponent[], b: readonly ModelComponent[], toleranceMm = 5): ClashCandidate[] {
  if (!Number.isFinite(toleranceMm) || toleranceMm < 0 || toleranceMm > 1000) throw new Error('Choose a tolerance from 0 to 1,000 mm.');
  if (a.length > MODEL_MAX_COMPONENTS || b.length > MODEL_MAX_COMPONENTS) throw new Error('Model has too many components.');
  const threshold = toleranceMm / 1000, out: ClashCandidate[] = [];
  for (const left of a) for (const right of b) {
    const lo: Point3 = [0, 0, 0], hi: Point3 = [0, 0, 0];
    for (let axis = 0; axis < 3; axis++) { lo[axis] = Math.max(left.min[axis], right.min[axis]); hi[axis] = Math.min(left.max[axis], right.max[axis]); }
    const depth = Math.min(...hi.map((value, index) => value - lo[index]));
    if (depth <= threshold) continue;
    out.push({ a: left, b: right, point: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2], overlapMm: Math.round(depth * 1000) });
    if (out.length > MODEL_MAX_CANDIDATES) throw new Error('More than 100 possible clashes. Narrow the models by floor or work package and run again.');
  }
  return out;
}
