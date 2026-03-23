const PREFIX = 'pg_del_';

export interface DelegationTokenClaims {
  sub: string;
  scopes: string[];
  jti: string;
  exp: number;
  iat: number;
  ip_lock?: string;
}

export function decodeDelegationToken(token: string): DelegationTokenClaims {
  if (!token.startsWith(PREFIX)) throw new Error('Not a delegation token');
  const jwt = token.slice(PREFIX.length);
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT structure');

  const payload = JSON.parse(
    atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')),
  ) as DelegationTokenClaims;
  return payload;
}

export function isDelegationExpiringSoon(token: string, thresholdSeconds = 3600): boolean {
  const claims = decodeDelegationToken(token);
  const now = Math.floor(Date.now() / 1000);
  return claims.exp - now < thresholdSeconds;
}
