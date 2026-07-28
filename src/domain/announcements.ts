/**
 * EM-04 / AI-E-04 — announcement composition & delivery model.
 *
 * All deterministic (no LLM): a topic maps to a template draft with a thinking
 * trace and a Nigerian-Pidgin translation, audience size is estimated from the
 * target + channels, and read analytics summarise sent notices. AI-E-04 is a
 * hard rule enforced in the action layer: an AI-drafted send needs manager
 * approval — this module only produces drafts, it never sends.
 */

import type { Announcement } from './entities';
import type { AnnouncementScope } from './enums';
import type { Tone } from '@/lib/status-tones';

/* --- audience estimate ---------------------------------------------------- */

const ESTATE_POP = 240; // demo estate resident head-count
export const BLOCKS: Record<string, number> = { 'Block A': 44, 'Block B': 52, 'Block C': 38, 'Block D': 40, 'Block E': 33 };
const AUDIENCE_FACTOR: Record<string, number> = { 'All residents': 1, Owners: 0.56, Tenants: 0.44, Managers: 0.05, Committee: 0.08 };

export type Channel = 'in_app' | 'push' | 'sms' | 'email';
export const CHANNELS: { key: Channel; label: string; reach: number }[] = [
  { key: 'in_app', label: 'In-app', reach: 0.98 },
  { key: 'push', label: 'Push', reach: 0.72 },
  { key: 'sms', label: 'SMS', reach: 0.95 },
  { key: 'email', label: 'Email', reach: 0.6 },
];

/** Base head-count a target selects, before channel reach. */
export function targetSize(scope: AnnouncementScope, audience: string, block?: string): number {
  const base = scope === 'building' ? BLOCKS[block ?? ''] ?? 40 : ESTATE_POP;
  const factor = AUDIENCE_FACTOR[audience] ?? 1;
  return Math.round(base * factor);
}

/** Estimated unique people reached: 1 − ∏(1 − channelReach) over selected
 *  channels, applied to the target size. Deterministic, labelled an estimate. */
export function estimateReach(size: number, channels: Channel[]): number {
  if (channels.length === 0) return 0;
  const miss = channels.reduce((p, c) => p * (1 - (CHANNELS.find((x) => x.key === c)?.reach ?? 0)), 1);
  return Math.round(size * (1 - miss));
}

/* --- AI draft composer ---------------------------------------------------- */

export type Draft = { title: string; body: string };
export type Composed = { draft: Draft; pidgin: Draft; thoughts: string[]; template: string };

type Template = { key: string; match: RegExp; en: Draft; pcm: Draft };

const TEMPLATES: Template[] = [
  {
    key: 'water', match: /water|borehole|pump|supply/i,
    en: { title: 'Water supply interruption', body: 'Please note there will be a temporary interruption to the water supply for planned maintenance on the main pump. Kindly store water in advance. Normal supply resumes the same day. We apologise for the inconvenience.' },
    pcm: { title: 'Water go stop small', body: 'Abeg make una know say water go stop small make dem fit fix di main pump. Store water before e start. Water go come back di same day. Sorry for di wahala.' },
  },
  {
    key: 'power', match: /power|light|electric|phcn|generator|diesel|grid/i,
    en: { title: 'Power supply update', body: 'The estate will run on generator between the stated hours while we address a fault on the public supply. Please switch off heavy appliances to reduce load. We will confirm once the grid is restored.' },
    pcm: { title: 'Light update', body: 'We go dey use generator for di hours wey we talk while we dey fix di NEPA fault. Abeg off heavy appliances make load no too much. We go tell una once di grid come back.' },
  },
  {
    key: 'security', match: /security|safety|gate|patrol|intrud|emergency/i,
    en: { title: 'Security reminder', body: 'For everyone’s safety, please ensure all visitors are pre-registered at the gate and keep your emergency contacts up to date in the app. Report anything unusual to the control room immediately.' },
    pcm: { title: 'Security reminder', body: 'For everybody safety, abeg make sure say you register all your visitors for gate, and update your emergency contact for di app. If you see anything wey no correct, tell di control room sharp-sharp.' },
  },
  {
    key: 'charge', match: /charge|invoice|payment|due|levy|arrears|bill/i,
    en: { title: 'Service charge reminder', body: 'A friendly reminder that your service charge is now due. Please settle in-app before the due date to keep your account in good standing and avoid late fees. Thank you for keeping the estate running.' },
    pcm: { title: 'Service charge reminder', body: 'Just to remind you say your service charge don due. Abeg pay for di app before di due date so your account go dey correct and you no go pay late fee. Thank you for helping di estate.' },
  },
  {
    key: 'maintenance', match: /lift|elevator|mainten|servic|repair|clean|road|work/i,
    en: { title: 'Scheduled maintenance', body: 'Scheduled maintenance will take place at the stated time and may cause brief disruption in the affected area. Our team will work to complete it quickly and safely. Thank you for your patience.' },
    pcm: { title: 'Scheduled maintenance', body: 'We go do maintenance for di time wey we talk, e fit disturb di area small. Our team go finish am quick-quick and safe. Thank you for your patience.' },
  },
  {
    key: 'event', match: /event|meeting|agm|party|festiv|amenity|pool|gym|club/i,
    en: { title: 'Community notice', body: 'We are pleased to share an upcoming community event. Please see the details below and let us know if you plan to attend so we can prepare. We look forward to seeing you there.' },
    pcm: { title: 'Community notice', body: 'We happy to share one event wey dey come. Check di details for down, and tell us if you go come so we fit prepare. We dey expect to see you there.' },
  },
];

const GENERIC: Template = {
  key: 'general', match: /.*/,
  en: { title: 'Estate notice', body: 'Please see the following important information from estate management. If you have any questions, reply in the app or contact the management office. Thank you.' },
  pcm: { title: 'Estate notice', body: 'Abeg see dis important info from estate management. If you get any question, reply for di app or call di management office. Thank you.' },
};

/** Turn a free-text topic into a template draft + a Claude-style thought trace.
 *  Deterministic; the title incorporates the operator's own topic words. */
export function composeDraft(topic: string): Composed {
  const t = TEMPLATES.find((x) => x.match.test(topic)) ?? GENERIC;
  const topicClean = topic.trim().replace(/\s+/g, ' ');
  const titled = (d: Draft): Draft => ({ title: topicClean && t.key === 'general' ? capitalize(topicClean) : d.title, body: d.body });
  return {
    template: t.key,
    draft: titled(t.en),
    pidgin: titled(t.pcm),
    thoughts: [
      'Reading the topic and intent…',
      `Matched the “${t.key}” notice pattern`,
      'Checking the estate’s tone — calm, clear, action-first',
      'Drafting with a timeframe and a next step',
      'Preparing a Nigerian-Pidgin variant for wider reach',
    ],
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* --- read analytics ------------------------------------------------------- */

export function readRate(a: Announcement): number {
  return a.delivered ? Math.round((a.read / a.delivered) * 100) : 0;
}

export function engagementTone(rate: number): Tone {
  return rate >= 75 ? 'success' : rate >= 50 ? 'warn' : 'danger';
}

export type Analytics = { sent: number; drafts: number; totalDelivered: number; totalRead: number; avgReadRate: number };

export function analytics(rows: readonly Announcement[]): Analytics {
  const sent = rows.filter((a) => a.sentAt);
  const delivered = sent.reduce((n, a) => n + a.delivered, 0);
  const read = sent.reduce((n, a) => n + a.read, 0);
  return {
    sent: sent.length,
    drafts: rows.length - sent.length,
    totalDelivered: delivered,
    totalRead: read,
    avgReadRate: delivered ? Math.round((read / delivered) * 100) : 0,
  };
}
