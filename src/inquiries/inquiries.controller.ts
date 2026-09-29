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
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { CommunicationEntry } from '../communication-history/communication-history.entity';
import { CreateInternalNoteDto } from '../communication-history/dto/create-internal-note.dto';
import { PUBLIC_FORM_RATE_LIMIT } from '../config/rate-limit.config';
import { CreateInquiryDto } from './dto/create-inquiry.dto';
import { ListInquiriesQueryDto } from './dto/list-inquiries-query.dto';
import { ReferInquiryDto } from './dto/refer-inquiry.dto';
import { UpdateInquiryDto } from './dto/update-inquiry.dto';
import {
  Inquiry,
  InquiryReferralResult,
  InquirySubmissionReceipt,
} from './entities/inquiry.entity';
import { InquiriesService } from './inquiries.service';

// POST is the only public route (SRS §4.8). Every other route handles
// visitor personal data, so it is curator-only (NFR-SEC-10); @Roles is set
// per method because a class-level @Roles would also block the public POST.
// There is no DELETE: Closed inquiries are kept as history (REQ-4.8-12).
@ApiTags('inquiries')
@Controller('inquiries')
export class InquiriesController {
  constructor(private readonly inquiriesService: InquiriesService) {}

  @Public()
  @Post()
  @Throttle({ default: PUBLIC_FORM_RATE_LIMIT })
  @ApiOperation({ summary: 'Submit a general inquiry (public)' })
  @ApiCreatedResponse({ type: InquirySubmissionReceipt })
  create(
    @Body() createInquiryDto: CreateInquiryDto,
  ): Promise<InquirySubmissionReceipt> {
    return this.inquiriesService.create(createInquiryDto);
  }

  @Roles('CURATOR')
  @Get()
  @ApiOperation({
    summary: 'List or search inquiries, newest first (curator-only)',
  })
  @ApiOkResponse({ type: [Inquiry] })
  findAll(@Query() query: ListInquiriesQueryDto): Promise<Inquiry[]> {
    return this.inquiriesService.findAll(query);
  }

  @Roles('CURATOR')
  @Get(':id')
  @ApiOperation({ summary: 'Get one inquiry (curator-only)' })
  @ApiOkResponse({ type: Inquiry })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Inquiry> {
    return this.inquiriesService.findOne(id);
  }

  @Roles('CURATOR')
  @Patch(':id')
  @ApiOperation({ summary: 'Mark reviewed or close (curator-only)' })
  @ApiOkResponse({ type: Inquiry })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateInquiryDto: UpdateInquiryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Inquiry> {
    return this.inquiriesService.update(id, updateInquiryDto, user.accountId);
  }

  @Roles('CURATOR')
  @Post(':id/referral')
  @ApiOperation({
    summary: 'Refer an inquiry to a new Pending visit request (curator-only)',
  })
  @ApiCreatedResponse({ type: InquiryReferralResult })
  refer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReferInquiryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<InquiryReferralResult> {
    return this.inquiriesService.refer(id, dto, user.accountId);
  }

  @Roles('CURATOR')
  @Get(':id/history')
  @ApiOperation({
    summary: 'Status changes, referral, and notes, oldest first',
  })
  @ApiOkResponse({ type: [CommunicationEntry] })
  listHistory(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CommunicationEntry[]> {
    return this.inquiriesService.listHistory(id);
  }

  @Roles('CURATOR')
  @Post(':id/notes')
  @ApiOperation({ summary: 'Add an internal curator note' })
  @ApiCreatedResponse({ type: CommunicationEntry })
  addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateInternalNoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CommunicationEntry> {
    return this.inquiriesService.addNote(id, dto, user.accountId);
  }
}
