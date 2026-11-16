// The backend sends requests to whatever endpoint a browser registers, so only
// the browser vendors' push services are accepted. Anything else could turn
// the server into a proxy for arbitrary URLs.
const PUSH_SERVICE_HOSTS: readonly RegExp[] = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge on Android, Opera, Samsung Internet
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /^[a-z0-9-]+\.push\.apple\.com$/, // Safari (incl. iOS home-screen apps)
  /^web\.push\.apple\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/, // Edge on Windows
];

export const PUSH_ENDPOINT_MAX_LENGTH = 1000;

export function isAllowedPushEndpoint(value: string): boolean {
  if (value.length > PUSH_ENDPOINT_MAX_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    return false;
  }
  return PUSH_SERVICE_HOSTS.some((host) => host.test(url.hostname));
}
