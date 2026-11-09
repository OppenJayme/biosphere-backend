import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { FAQ_ASSISTANT_RATE_LIMIT } from '../config/rate-limit.config';
import { AskFaqAssistantDto } from './dto/ask-faq-assistant.dto';
import { ListFaqSuggestionsQueryDto } from './dto/list-faq-suggestions-query.dto';
import {
  FaqAssistantResponse,
  FaqSuggestionList,
} from './entities/faq-assistant.entity';
import { FaqAssistantService } from './faq-assistant.service';

// Kept separate from FaqController because that controller's class-level
// @Roles('CURATOR') would still block these @Public() visitor routes.
@ApiTags('faq-assistant')
@Public()
@Throttle({ default: FAQ_ASSISTANT_RATE_LIMIT })
@Controller('faq/assistant')
export class FaqAssistantController {
  constructor(private readonly service: FaqAssistantService) {}

  @Get('suggestions')
  @ApiOperation({ summary: 'List suggested active FAQ questions (public)' })
  @ApiOkResponse({ type: FaqSuggestionList })
  suggestions(
    @Query() query: ListFaqSuggestionsQueryDto,
  ): Promise<FaqSuggestionList> {
    return this.service.suggestions(query);
  }

  @Post('ask')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Match a visitor question against active curator-approved FAQ knowledge (public)',
  })
  @ApiOkResponse({ type: FaqAssistantResponse })
  ask(
    @Body() dto: AskFaqAssistantDto,
    @Ip() ip: string,
  ): Promise<FaqAssistantResponse> {
    // The IP only keys the in-memory AI quota; it is never stored or logged.
    return this.service.ask(dto, ip || 'anonymous');
  }
}
