import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { CreateFaqEntryDto } from './dto/create-faq-entry.dto';
import { ListFaqEntriesQueryDto } from './dto/list-faq-entries-query.dto';
import { UpdateFaqEntryDto } from './dto/update-faq-entry.dto';
import { FaqEntry, FaqEntryPage } from './entities/faq-entry.entity';
import { FaqService } from './faq.service';

@ApiTags('faq-knowledge')
@Roles('CURATOR')
@Controller('faq/entries')
export class FaqController {
  constructor(private readonly service: FaqService) {}

  @Post()
  @ApiOperation({ summary: 'Create inactive curator-approved FAQ knowledge' })
  @ApiCreatedResponse({ type: FaqEntry })
  create(
    @Body() dto: CreateFaqEntryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FaqEntry> {
    return this.service.create(dto, user.accountId);
  }

  @Get()
  @ApiOperation({ summary: 'List FAQ knowledge for curator management' })
  @ApiOkResponse({ type: FaqEntryPage })
  findAll(@Query() query: ListFaqEntriesQueryDto): Promise<FaqEntryPage> {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Retrieve FAQ knowledge, including archived entries',
  })
  @ApiOkResponse({ type: FaqEntry })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<FaqEntry> {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit active or inactive FAQ knowledge' })
  @ApiOkResponse({ type: FaqEntry })
  @ApiConflictResponse({ description: 'FAQ knowledge changed concurrently' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFaqEntryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FaqEntry> {
    return this.service.update(id, dto, user.accountId);
  }

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Activate approved FAQ knowledge for matching' })
  @ApiOkResponse({ type: FaqEntry })
  activate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FaqEntry> {
    return this.service.activate(id, user.accountId);
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Remove FAQ knowledge from public matching' })
  @ApiOkResponse({ type: FaqEntry })
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FaqEntry> {
    return this.service.deactivate(id, user.accountId);
  }

  @Patch(':id/archive')
  @ApiOperation({ summary: 'Archive FAQ knowledge without deleting it' })
  @ApiOkResponse({ type: FaqEntry })
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FaqEntry> {
    return this.service.archive(id, user.accountId);
  }
}
