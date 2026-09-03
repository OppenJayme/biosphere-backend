import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // Prisma needs only this external primary key when it builds a temporary
    // shadow database for future BioSphere migrations.
    initShadowDb: `
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY);
    `,
  },
  datasource: {
    // Prisma CLI operations use the direct/session connection, never the
    // transaction-pooled runtime connection.
    url: process.env['DIRECT_URL'],
  },
  // Supabase owns everything in the auth schema. Prisma may represent these
  // objects and their relationships, but Prisma Migrate must never manage them.
  experimental: {
    externalTables: true,
  },
  tables: {
    external: [
      'auth.audit_log_entries',
      'auth.custom_oauth_providers',
      'auth.flow_state',
      'auth.identities',
      'auth.instances',
      'auth.mfa_amr_claims',
      'auth.mfa_challenges',
      'auth.mfa_factors',
      'auth.oauth_authorizations',
      'auth.oauth_client_states',
      'auth.oauth_clients',
      'auth.oauth_consents',
      'auth.one_time_tokens',
      'auth.refresh_tokens',
      'auth.saml_providers',
      'auth.saml_relay_states',
      'auth.schema_migrations',
      'auth.sessions',
      'auth.sso_domains',
      'auth.sso_providers',
      'auth.users',
      'auth.webauthn_challenges',
      'auth.webauthn_credentials',
    ],
  },
  enums: {
    external: [
      'auth.aal_level',
      'auth.code_challenge_method',
      'auth.factor_status',
      'auth.factor_type',
      'auth.oauth_authorization_status',
      'auth.oauth_client_type',
      'auth.oauth_registration_type',
      'auth.oauth_response_type',
      'auth.one_time_token_type',
    ],
  },
});
