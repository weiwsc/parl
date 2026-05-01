// Web Crypto JWT — runs in Cloudflare Workers runtime (no Node.js needed)

const STATE_KEY = 'parliament_state';

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function b64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function b64urlDecode(s: string): string {
  return atob(s.replace(/-/g, '+').replace(/_/g, '/'));
}

export async function signJWT(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header  = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const now     = Math.floor(Date.now() / 1000);
  const claims  = b64url(new TextEncoder().encode(JSON.stringify({ ...payload, iat: now, exp: now + 7 * 86400 })));
  const input   = `${header}.${claims}`;
  const key     = await hmacKey(secret);
  const sig     = b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input)));
  return `${input}.${sig}`;
}

export async function verifyJWT(token: string, secret: string): Promise<boolean> {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const input   = `${parts[0]}.${parts[1]}`;
  const key     = await hmacKey(secret);
  const sigBytes = Uint8Array.from(b64urlDecode(parts[2]), c => c.charCodeAt(0));
  const valid   = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(input));
  if (!valid) return false;
  const { exp } = JSON.parse(b64urlDecode(parts[1]));
  return exp > Math.floor(Date.now() / 1000);
}

export function cors(origin?: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin':  origin ?? '*',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export { STATE_KEY };
