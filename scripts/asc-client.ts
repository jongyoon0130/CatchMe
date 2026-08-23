/**
 * Minimal App Store Connect API client.
 *
 * Credentials come from the environment:
 *   ASC_KEY_ID     10-character key ID
 *   ASC_KEY_PATH   path to the downloaded AuthKey_*.p8
 *   ASC_ISSUER_ID  required for team keys; omit for individual keys
 *   ASC_BUNDLE_ID  defaults to app.futureme.studio
 */

const KEY_ID = process.env.ASC_KEY_ID;
const ISSUER_ID = process.env.ASC_ISSUER_ID;
const KEY_PATH = process.env.ASC_KEY_PATH;

export const BUNDLE_ID = process.env.ASC_BUNDLE_ID ?? 'app.futureme.studio';

const BASE = 'https://api.appstoreconnect.apple.com';

if (!KEY_ID || !KEY_PATH) {
  throw new Error('Missing ASC_KEY_ID / ASC_KEY_PATH');
}

function b64url(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

let cachedKey: CryptoKey | undefined;

async function signingKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const pem = await Bun.file(KEY_PATH!).text();
  const der = Uint8Array.from(
    atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')),
    (c) => c.charCodeAt(0),
  );
  cachedKey = await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  return cachedKey;
}

let token: { value: string; expiresAt: number } | undefined;

async function bearer(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (token && token.expiresAt - 120 > now) return token.value;

  const header = b64url(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' }));
  // Team keys authenticate with `iss`; individual keys omit it and use `sub: 'user'`.
  const expiresAt = now + 1140;
  const payload = b64url(
    JSON.stringify({
      ...(ISSUER_ID ? { iss: ISSUER_ID } : { sub: 'user' }),
      iat: now - 60,
      exp: expiresAt,
      aud: 'appstoreconnect-v1',
    }),
  );
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    await signingKey(),
    new TextEncoder().encode(`${header}.${payload}`),
  );
  token = { value: `${header}.${payload}.${b64url(new Uint8Array(signature))}`, expiresAt };
  return token.value;
}

export async function asc(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${await bearer()}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status}\n${text}`);
  }
  return text ? JSON.parse(text) : null;
}

export async function getApp(): Promise<{ id: string; attributes: any }> {
  const apps = await asc(`/v1/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}`);
  const app = apps.data?.[0];
  if (!app) throw new Error(`No app found for bundleId ${BUNDLE_ID}`);
  return app;
}
