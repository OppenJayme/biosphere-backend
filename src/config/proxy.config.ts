export const DEFAULT_TRUST_PROXY = 'loopback';

/**
 * Express `trust proxy` setting, from TRUST_PROXY.
 *
 * In production the API sits behind the DCISM Apache reverse proxy, which
 * connects from 127.0.0.1 and passes the visitor's address in
 * X-Forwarded-For. Without this setting every request looks like it came from
 * the proxy, so the global rate limit and the FAQ assistant's per-visitor AI
 * limit would be shared by everyone at once.
 *
 * The default trusts only a proxy on this machine, so a visitor cannot spoof
 * their address with their own X-Forwarded-For header. Accepted values:
 * `true`, `false`, a hop count such as `1`, or Express's comma-separated
 * names and subnets (`loopback`, `10.0.0.0/8`, ...).
 */
export function resolveTrustProxy(
  env: NodeJS.ProcessEnv,
): boolean | number | string {
  const value = env.TRUST_PROXY?.trim();
  if (!value) return DEFAULT_TRUST_PROXY;
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}
