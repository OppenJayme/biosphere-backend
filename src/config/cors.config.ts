export const DEFAULT_CORS_ORIGIN = 'http://localhost:3000';

// The public site and the curator PWA are separate origins, so CORS_ORIGINS
// takes a comma-separated list. FRONTEND_URL stays the single origin used for
// auth redirect links and is only the fallback here.
export function resolveCorsOrigins(env: NodeJS.ProcessEnv): string[] {
  const origins = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => origin.length > 0);

  if (origins.length > 0) {
    return [...new Set(origins)];
  }
  return [env.FRONTEND_URL?.trim().replace(/\/+$/, '') || DEFAULT_CORS_ORIGIN];
}
