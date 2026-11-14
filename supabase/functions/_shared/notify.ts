/**
 * Notification providers. Push (FCM) is live in Phase 1.
 * SMS / WhatsApp providers plug in here later (approved providers + customer consent only).
 */
export interface OutboundMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channel?: string;
}
export interface Recipient { userId: string; fcmToken?: string | null; phone?: string | null; consent?: boolean }
export interface SendResult { ok: boolean; error?: string; invalidToken?: boolean }

export interface NotifyProvider {
  readonly name: 'fcm' | 'sms' | 'whatsapp';
  canSend(to: Recipient): boolean;
  send(to: Recipient, msg: OutboundMessage): Promise<SendResult>;
}

// ---------------------------------------------------------------------------- FCM HTTP v1
interface ServiceAccount { client_email: string; private_key: string; project_id: string }
let cachedToken: { value: string; exp: number } | null = null;

function b64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function googleAccessToken(sa: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.value;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`));
  const jwt = `${header}.${claims}.${b64url(sig)}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  if (!res.ok) throw new Error(`Google token error ${res.status}: ${await res.text()}`);
  const j = await res.json();
  cachedToken = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

export class FcmProvider implements NotifyProvider {
  readonly name = 'fcm' as const;
  private sa: ServiceAccount;
  constructor(serviceAccountJson: string) { this.sa = JSON.parse(serviceAccountJson); }
  canSend(to: Recipient) { return !!to.fcmToken; }
  async send(to: Recipient, msg: OutboundMessage): Promise<SendResult> {
    const token = await googleAccessToken(this.sa);
    const data: Record<string, string> = {};
    for (const [k, v] of Object.entries(msg.data ?? {})) data[k] = typeof v === 'string' ? v : JSON.stringify(v);
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${this.sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token: to.fcmToken,
          notification: { title: msg.title, body: msg.body },
          data,
          android: { priority: 'high', notification: { channel_id: msg.channel ?? 'default', color: '#23915C' } },
        },
      }),
    });
    if (res.ok) return { ok: true };
    const text = await res.text();
    return { ok: false, error: `FCM ${res.status}: ${text.slice(0, 300)}`, invalidToken: res.status === 404 || text.includes('UNREGISTERED') || text.includes('not a valid FCM registration token') };
  }
}

// ---------------------------------------------------------------------------- SMS (Phase 2 placeholder)
export class SmsProvider implements NotifyProvider {
  readonly name = 'sms' as const;
  canSend(to: Recipient) { return false && !!to.phone && !!to.consent; }
  async send(): Promise<SendResult> { return { ok: false, error: 'SMS sending is not enabled in Phase 1' }; }
}
