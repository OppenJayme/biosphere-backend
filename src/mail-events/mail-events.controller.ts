import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Public } from '../auth/decorators/public.decorator';
import { parseBrevoEvents } from './brevo-event';
import { MailEventsResult, MailEventsService } from './mail-events.service';

// Brevo calls this when a visitor email is delivered, delayed or bounced.
// It is not a user route: @Public skips the Supabase guard and the shared
// BREVO_WEBHOOK_SECRET authenticates Brevo instead, sent either as a Bearer
// token or as the password of Basic auth (https://brevo:<secret>@host/...).
// With no secret configured the route answers 404, so it is off by default.
// Throttling is skipped because one send can produce several events at once.
@ApiExcludeController()
@Public()
@SkipThrottle()
@Controller('mail-events')
export class MailEventsController {
  constructor(
    private readonly service: MailEventsService,
    private readonly config: ConfigService,
  ) {}

  @Post('brevo')
  @HttpCode(HttpStatus.OK)
  receive(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ): Promise<MailEventsResult> {
    const secret = this.config.get<string>('BREVO_WEBHOOK_SECRET')?.trim();
    if (!secret) throw new NotFoundException();
    if (!matchesSecret(authorization, secret)) {
      throw new UnauthorizedException();
    }
    return this.service.apply(parseBrevoEvents(body));
  }
}

function presentedSecret(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const [scheme, value] = authorization.trim().split(/\s+/, 2);
  if (!value) return null;
  if (scheme.toLowerCase() === 'bearer') return value;
  if (scheme.toLowerCase() === 'basic') {
    const decoded = Buffer.from(value, 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    return separator >= 0 ? decoded.slice(separator + 1) : null;
  }
  return null;
}

// Compares fixed-length digests, so the check takes the same time whatever
// the presented value is.
function matchesSecret(
  authorization: string | undefined,
  secret: string,
): boolean {
  const presented = presentedSecret(authorization);
  if (presented === null) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(presented), digest(secret));
}
