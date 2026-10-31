import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser';

export type BcfTopic = { guid: string; title: string; description: string; status: 'Open' | 'InProgress' | 'Resolved';
  createdAtISO: string; componentIds: string[]; point?: [number, number, number] };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ifcGuid = /^[0-9A-Za-z_$]{22}$/;
const xml = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_', format: true, suppressEmptyNode: true });
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false, parseTagValue: false, processEntities: false });
const clean = (value: unknown, limit: number) => String(value ?? '').trim().slice(0, limit);
const array = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];

function safeZipEntries(bytes: Uint8Array): void {
  if (bytes.length < 22 || bytes.length > 4 * 1024 * 1024) throw new Error('BCFZIP must be at most 4 MB.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) if (view.getUint32(at, true) === 0x06054b50) { end = at; break; }
  if (end < 0) throw new Error('BCFZIP directory is invalid.');
  const count = view.getUint16(end + 10, true), directory = view.getUint32(end + 16, true);
  if (count > 160 || directory >= end) throw new Error('BCFZIP contains too many files.');
  let at = directory, total = 0;
  for (let i = 0; i < count; i++) {
    if (at + 46 > end || view.getUint32(at, true) !== 0x02014b50) throw new Error('BCFZIP file directory is invalid.');
    const size = view.getUint32(at + 24, true), nameLen = view.getUint16(at + 28, true), extraLen = view.getUint16(at + 30, true), commentLen = view.getUint16(at + 32, true);
    if (at + 46 + nameLen + extraLen + commentLen > end) throw new Error('BCFZIP file directory is invalid.');
    const path = strFromU8(bytes.subarray(at + 46, at + 46 + nameLen));
    if (!path || path.startsWith('/') || path.includes('..') || path.includes('\\') || !/^[A-Za-z0-9._/-]+$/.test(path)) throw new Error('BCFZIP contains an unsafe path.');
    total += size; if (size > 512 * 1024 || total > 8 * 1024 * 1024) throw new Error('BCFZIP expands beyond the permitted size.');
    at += 46 + nameLen + extraLen + commentLen;
  }
}

export function parseBcfZip(bytes: Uint8Array): BcfTopic[] {
  safeZipEntries(bytes);
  const files = unzipSync(bytes);
  const version = files['bcf.version'];
  if (!version || XMLValidator.validate(strFromU8(version)) !== true || parser.parse(strFromU8(version))?.Version?.['@_VersionId'] !== '3.0') throw new Error('Choose a BCF 3.0 ZIP file.');
  const entries = Object.entries(files).filter(([path]) => /^[0-9a-f-]{36}\/markup\.bcf$/i.test(path));
  if (!entries.length || entries.length > 100) throw new Error('BCFZIP must contain between 1 and 100 topics.');
  const seen = new Set<string>();
  return entries.map(([path, data]) => {
    const markup = strFromU8(data);
    if (XMLValidator.validate(markup) !== true) throw new Error('BCF topic markup is invalid.');
    const root = parser.parse(markup)?.Markup;
    const topic = root?.Topic;
    const guid = clean(topic?.['@_Guid'], 36).toLowerCase();
    if (!uuid.test(guid) || seen.has(guid) || path.slice(0, 36).toLowerCase() !== guid) throw new Error('BCF topic identifier is invalid, repeated or does not match its folder.');
    seen.add(guid);
    const title = clean(topic?.Title, 180), description = clean(topic?.Description, 2000);
    if (title.length < 4) throw new Error('BCF topic title is missing.');
    const rawStatus = clean(topic?.['@_TopicStatus'], 30).toLowerCase();
    const status: BcfTopic['status'] = rawStatus === 'resolved' || rawStatus === 'closed' ? 'Resolved' : rawStatus === 'inprogress' || rawStatus === 'in_progress' ? 'InProgress' : 'Open';
    const date = clean(topic?.CreationDate, 40);
    const createdAtISO = Number.isFinite(Date.parse(date)) ? new Date(date).toISOString() : new Date().toISOString();
    const folder = path.slice(0, -'markup.bcf'.length);
    const viewRefs = array(topic?.Viewpoints?.ViewPoint).map((row: Record<string, unknown>) => clean(row?.Viewpoint, 150));
    const componentIds: string[] = [];
    let point: BcfTopic['point'];
    for (const ref of viewRefs) {
      if (!ref || ref.includes('/') || ref.includes('..')) continue;
      const viewpoint = files[folder + ref]; if (!viewpoint) continue;
      const body = strFromU8(viewpoint);
      if (XMLValidator.validate(body) !== true) continue;
      const info = parser.parse(body)?.VisualizationInfo;
      for (const row of array(info?.Components?.Selection?.Component)) {
        const id = clean((row as Record<string, unknown>)?.['@_IfcGuid'], 22);
        if (ifcGuid.test(id) && !componentIds.includes(id)) componentIds.push(id);
      }
      const location = info?.PerspectiveCamera?.CameraViewPoint ?? info?.OrthogonalCamera?.CameraViewPoint;
      const xyz = [Number(location?.X), Number(location?.Y), Number(location?.Z)];
      if (xyz.every(Number.isFinite)) point = xyz as [number, number, number];
    }
    return { guid, title, description, status, createdAtISO, componentIds: componentIds.slice(0, 20), point };
  });
}

export function createBcfZip(projectName: string, projectGuid: string, topics: BcfTopic[]): Uint8Array {
  if (!uuid.test(projectGuid) || !topics.length || topics.length > 100) throw new Error('Choose 1 to 100 coordination issues for BCF export.');
  const files: Record<string, Uint8Array> = {
    'bcf.version': strToU8(xml.build({ Version: { '@_VersionId': '3.0' } })),
    'project.bcfp': strToU8(xml.build({ ProjectInfo: { Project: { '@_ProjectId': projectGuid, Name: clean(projectName, 160) } } })),
  };
  for (const topic of topics) {
    if (!uuid.test(topic.guid)) throw new Error('BCF topic identifier is invalid.');
    const ids = topic.componentIds.filter((id) => ifcGuid.test(id)).slice(0, 20);
    const guid = topic.guid.toLowerCase();
    const viewId = guid;
    files[`${guid}/`] = new Uint8Array();
    files[`${guid}/markup.bcf`] = strToU8(xml.build({ Markup: {
      Topic: { '@_Guid': guid, '@_TopicType': 'Clash', '@_TopicStatus': topic.status,
        Title: clean(topic.title, 180), CreationDate: topic.createdAtISO, CreationAuthor: 'Propbrew',
        ...(clean(topic.description, 2000) ? { Description: clean(topic.description, 2000) } : {}),
        ...(topic.point ? { Viewpoints: { ViewPoint: { '@_Guid': viewId, Viewpoint: 'viewpoint.bcfv' } } } : {}) },
    } }));
    if (topic.point) files[`${guid}/viewpoint.bcfv`] = strToU8(xml.build({ VisualizationInfo: { '@_Guid': viewId,
      ...(ids.length ? { Components: { Selection: { Component: ids.map((id) => ({ '@_IfcGuid': id })) } } } : {}),
      PerspectiveCamera: { CameraViewPoint: { X: topic.point[0], Y: topic.point[1], Z: topic.point[2] }, CameraDirection: { X: 0, Y: 0, Z: -1 }, CameraUpVector: { X: 0, Y: 1, Z: 0 }, FieldOfView: 60, AspectRatio: 1.6 },
    } }));
  }
  return zipSync(files, { level: 6 });
}
