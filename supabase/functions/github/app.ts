// GitHub App auth: an App JWT signed with the private key, then short-lived installation
// tokens. Read-only calls only; nothing here writes to GitHub (SPEC §7).

const API = 'https://api.github.com';

export interface AppConfig {
  appId: string;
  privateKey: string;
}

export class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function derLength(n: number): number[] {
  if (n < 0x80) return [n];
  const out: number[] = [];
  for (let v = n; v > 0; v >>= 8) out.unshift(v & 0xff);
  return [0x80 | out.length, ...out];
}

function der(tag: number, body: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array([tag, ...derLength(body.length), ...body]);
}

/** GitHub hands out PKCS#1 keys ("BEGIN RSA PRIVATE KEY"); WebCrypto wants PKCS#8. */
function toPkcs8(pem: string): Uint8Array<ArrayBuffer> {
  const pkcs1 = !pem.includes('BEGIN PRIVATE KEY');
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  if (!pkcs1) return bytes;
  // SEQUENCE { INTEGER 0, SEQUENCE { OID rsaEncryption, NULL }, OCTET STRING { pkcs1 } }
  const version = new Uint8Array([0x02, 0x01, 0x00]);
  const algorithm = new Uint8Array([0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]);
  const key = der(0x04, bytes);
  return der(0x30, new Uint8Array([...version, ...algorithm, ...key]));
}

let signingKey: Promise<CryptoKey> | null = null;

async function appJwt(config: AppConfig): Promise<string> {
  signingKey ??= crypto.subtle.importKey(
    'pkcs8',
    toPkcs8(config.privateKey.replace(/\\n/g, '\n')),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const now = Math.floor(Date.now() / 1000);
  const enc = new TextEncoder();
  const head = b64url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = b64url(enc.encode(JSON.stringify({ iat: now - 60, exp: now + 540, iss: config.appId })));
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await signingKey, enc.encode(`${head}.${claims}`));
  return `${head}.${claims}.${b64url(new Uint8Array(signature))}`;
}

async function call<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'finishlyne',
    },
  });
  if (!res.ok) throw new GitHubError(res.status, `GitHub ${path.split('?')[0]} answered ${res.status}`);
  return (await res.json()) as T;
}

export interface Installation {
  id: number;
  account: { id: number; login: string };
}

export interface AppInfo {
  slug: string;
  installation: Installation | null;
}

/** The App's slug and the installation on the signed-in user's own account, if any. */
export async function findInstallation(config: AppConfig, githubUserId: number): Promise<AppInfo> {
  const jwt = await appJwt(config);
  const [app, installs] = await Promise.all([
    call<{ slug: string }>('/app', jwt),
    call<Installation[]>('/app/installations?per_page=100', jwt),
  ]);
  return { slug: app.slug, installation: installs.find((i) => i.account.id === githubUserId) ?? null };
}

const tokens = new Map<number, { token: string; expires: number }>();

/** An installation token, reused until five minutes before it expires. */
export async function installationToken(config: AppConfig, installationId: number): Promise<string> {
  const cached = tokens.get(installationId);
  if (cached && cached.expires - Date.now() > 300_000) return cached.token;
  const jwt = await appJwt(config);
  const out = await call<{ token: string; expires_at: string }>(`/app/installations/${installationId}/access_tokens`, jwt, {
    method: 'POST',
  });
  tokens.set(installationId, { token: out.token, expires: Date.parse(out.expires_at) });
  return out.token;
}

export function get<T>(path: string, token: string): Promise<T> {
  return call<T>(path, token);
}
