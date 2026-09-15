import { createClient } from '@supabase/supabase-js';
import { createSupabaseAuthClient } from './supabase-auth-client.factory';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue({}),
}));

describe('createSupabaseAuthClient', () => {
  const configServiceMock = {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'SUPABASE_URL') return 'https://project.supabase.co';
      if (key === 'SUPABASE_ANON_KEY') return 'anon-key';
      throw new Error(`Unexpected config key requested in test: ${key}`);
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a stateless client scoped to the anon key, not the service-role key', () => {
    createSupabaseAuthClient(configServiceMock as never);

    expect(createClient).toHaveBeenCalledWith(
      'https://project.supabase.co',
      'anon-key',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      },
    );
  });

  it('returns a new client instance on every call', () => {
    createSupabaseAuthClient(configServiceMock as never);
    createSupabaseAuthClient(configServiceMock as never);

    expect(createClient).toHaveBeenCalledTimes(2);
  });
});
