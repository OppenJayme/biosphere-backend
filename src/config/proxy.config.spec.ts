import { DEFAULT_TRUST_PROXY, resolveTrustProxy } from './proxy.config';

describe('resolveTrustProxy', () => {
  it('trusts only a local proxy by default', () => {
    expect(resolveTrustProxy({})).toBe(DEFAULT_TRUST_PROXY);
    expect(resolveTrustProxy({ TRUST_PROXY: '  ' })).toBe('loopback');
  });

  it('reads true and false in any case', () => {
    expect(resolveTrustProxy({ TRUST_PROXY: 'TRUE' })).toBe(true);
    expect(resolveTrustProxy({ TRUST_PROXY: 'false' })).toBe(false);
  });

  it('reads a hop count as a number', () => {
    expect(resolveTrustProxy({ TRUST_PROXY: '1' })).toBe(1);
  });

  it('passes names and subnets through to Express', () => {
    expect(resolveTrustProxy({ TRUST_PROXY: 'loopback, 10.0.0.0/8' })).toBe(
      'loopback, 10.0.0.0/8',
    );
  });
});
