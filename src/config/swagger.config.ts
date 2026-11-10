/**
 * Whether to serve the Swagger UI and spec at /docs, from SWAGGER_ENABLED.
 *
 * `true` or `false` (any case) decides explicitly. When it is unset, Swagger
 * is on everywhere except NODE_ENV=production, so the public API host does not
 * publish the route list unless someone turns it on deliberately.
 */
export function resolveSwaggerEnabled(env: NodeJS.ProcessEnv): boolean {
  const value = env.SWAGGER_ENABLED?.trim().toLowerCase();
  if (value === 'true') return true;
  if (value === 'false') return false;
  return env.NODE_ENV?.trim() !== 'production';
}
