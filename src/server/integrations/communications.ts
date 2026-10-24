import 'server-only';

type Message = { to: string; body: string; purpose: string };
function requireEnv(name: string): string { const value = process.env[name]; if (!value) throw new Error(`${name} is not configured.`); return value; }

export async function sendSms(message: Message): Promise<{ provider: 'termii'; id: string }> {
  const key = requireEnv('TERMII_API_KEY');
  const res = await fetch('https://api.ng.termii.com/api/sms/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to: message.to, from: process.env.TERMII_SENDER_ID ?? 'Reeve', sms: message.body, type: 'plain', channel: 'generic', api_key: key }) });
  if (!res.ok) throw new Error(`Termii request failed (${res.status}).`);
  const data = await res.json() as { message_id?: string };
  return { provider: 'termii', id: data.message_id ?? 'accepted' };
}

export async function sendEmail(message: Message): Promise<{ provider: 'resend'; id: string }> {
  const key = requireEnv('RESEND_API_KEY');
  const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: requireEnv('EMAIL_FROM'), to: [message.to], subject: message.purpose, text: message.body }) });
  if (!res.ok) throw new Error(`Email provider failed (${res.status}).`);
  const data = await res.json() as { id?: string };
  return { provider: 'resend', id: data.id ?? 'accepted' };
}

export async function sendWhatsApp(message: Message): Promise<{ provider: 'meta'; id: string }> {
  const token = requireEnv('WHATSAPP_ACCESS_TOKEN'); const phoneId = requireEnv('WHATSAPP_PHONE_NUMBER_ID');
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: message.to, type: 'text', text: { body: message.body } }) });
  if (!res.ok) throw new Error(`WhatsApp provider failed (${res.status}).`);
  const data = await res.json() as { messages?: Array<{ id: string }> };
  return { provider: 'meta', id: data.messages?.[0]?.id ?? 'accepted' };
}
