import type { ServiceEnv } from '@chord-dht-tracker/backend-runtime/config';

const encoder = new TextEncoder();

// Narrow view of ServiceEnv for this service; the constructor takes the full
// ServiceEnv so the composition root passes its typed env directly.
type AuthServiceEnv = Pick<ServiceEnv, 'ADMIN_SECRET'>;

interface AuthServiceDeps {
  // Reserved for future injected collaborators; kept for composition uniformity.
  [key: string]: unknown;
}

// AuthService owns admin-token authentication. Logic moved verbatim from
// apps/api/src/auth.ts (isAdmin): constant-time HMAC comparison against
// ADMIN_SECRET with an UNCONFIGURED guard.
class AuthService {
  constructor(
    private readonly env: ServiceEnv,
    _deps: AuthServiceDeps = {},
  ) {}

  public async isAdmin(request: Request): Promise<boolean> {
    const auth = request.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) return false;
    const provided = auth.slice(7);
    if (!provided) return false;

    let secret: string | null;
    try {
      secret = (await this.env.ADMIN_SECRET?.get()) ?? null;
    } catch {
      return false;
    }
    if (!secret || secret === 'UNCONFIGURED') return false;

    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const [mac1, mac2] = await Promise.all([
      crypto.subtle.sign('HMAC', key, encoder.encode(provided)),
      crypto.subtle.sign('HMAC', key, encoder.encode(secret)),
    ]);
    const a = new Uint8Array(mac1);
    const b = new Uint8Array(mac2);
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  }
}

export { AuthService };
export type { AuthServiceDeps, AuthServiceEnv };
