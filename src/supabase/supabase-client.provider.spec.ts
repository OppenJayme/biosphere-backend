import { createClient } from '@supabase/supabase-js';
import { SupabaseClientProvider } from './supabase-client.provider';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue({}),
}));

describe('SupabaseClientProvider', () => {
  const configServiceMock = {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'SUPABASE_URL') return 'https://project.supabase.co';
      if (key === 'SUPABASE_SECRET_KEY') return 'secret-key';
      throw new Error(`Unexpected config key requested in test: ${key}`);
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates the shared client as stateless so it never retains or auto-refreshes a caller session', () => {
    SupabaseClientProvider.useFactory(configServiceMock as never);

    expect(createClient).toHaveBeenCalledWith(
      'https://project.supabase.co',
      'secret-key',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      },
    );
  });

  it('does not configure a custom Realtime transport', () => {
    SupabaseClientProvider.useFactory(configServiceMock as never);

    const createClientMock = jest.mocked(createClient);
    const options = createClientMock.mock.calls[0][2];
    expect(options?.realtime).toBeUndefined();
  });
});
