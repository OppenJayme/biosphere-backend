import { isAllowedPushEndpoint } from './push-endpoint';

describe('isAllowedPushEndpoint', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc:def',
    'https://updates.push.services.mozilla.com/wpush/v2/gAAAA',
    'https://web.push.apple.com/QGuQyavXutnMH',
    'https://api.push.apple.com/3/device/abc',
    'https://wns2-par02p.notify.windows.com/w/?token=BQYAAA',
  ])('accepts the browser push service %s', (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    ['plain http', 'http://fcm.googleapis.com/fcm/send/abc'],
    ['another host', 'https://example.com/push'],
    ['a look-alike host', 'https://fcm.googleapis.com.evil.example/x'],
    ['an internal address', 'https://127.0.0.1/push'],
    ['credentials', 'https://user:pass@fcm.googleapis.com/fcm/send/abc'],
    ['a custom port', 'https://fcm.googleapis.com:8443/fcm/send/abc'],
    ['not a URL', 'fcm.googleapis.com/fcm/send/abc'],
    ['too long', `https://fcm.googleapis.com/${'a'.repeat(1000)}`],
  ])('rejects %s', (_label, endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });
});
