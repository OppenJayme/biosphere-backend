import { UnauthorizedException } from '@nestjs/common';

/** The token from an `Authorization: Bearer <token>` header, or a 401. */
export function bearerToken(authHeader: string | undefined): string {
  if (!authHeader) {
    throw new UnauthorizedException('Missing authorization token');
  }

  const [scheme, token, extra] = authHeader.trim().split(/\s+/);

  if (scheme?.toLowerCase() !== 'bearer' || !token || extra) {
    throw new UnauthorizedException('Malformed authorization token');
  }

  return token;
}
