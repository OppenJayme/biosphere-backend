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
import { SendVisitorMessageDto } from '../communication-history/dto/send-visitor-message.dto';
import { PUBLIC_FORM_RATE_LIMIT } from '../config/rate-limit.config';
import { ApproveVisitScheduleDto } from './dto/approve-visit-schedule.dto';
import { CreateVisitRequestDto } from './dto/create-visit-request.dto';
import { ListVisitRequestsQueryDto } from './dto/list-visit-requests-query.dto';
import { UpdateVisitRequestDto } from './dto/update-visit-request.dto';
import { VisitDateRangeQueryDto } from './dto/visit-date-range-query.dto';
import {
  CampusEntrySummary,
  VisitAvailability,
  VisitCalendarEvent,
  VisitRequest,
  VisitRequestSubmissionReceipt,
} from './entities/visit-request.entity';
import { VisitRequestsService } from './visit-requests.service';

// POST (SRS §4.9) and GET availability are the only public routes. Every
// other route handles visitor personal data, so it is curator-only
// (NFR-SEC-10); @Roles is set per method because a class-level @Roles would
// also block the public routes.
// There is no DELETE: Declined, Cancelled, and Completed requests are kept
// as history (REQ-4.9-14).
@ApiTags('visit-requests')
@Controller('visit-requests')
export class VisitRequestsController {
  constructor(private readonly visitRequestsService: VisitRequestsService) {}

  @Public()
  @Post()
  @Throttle({ default: PUBLIC_FORM_RATE_LIMIT })
  @ApiOperation({ summary: 'Submit a visit request (public)' })
  @ApiCreatedResponse({ type: VisitRequestSubmissionReceipt })
  create(
    @Body() createVisitRequestDto: CreateVisitRequestDto,
  ): Promise<VisitRequestSubmissionReceipt> {
    return this.visitRequestsService.create(createVisitRequestDto);
  }

  @Roles('CURATOR')
  @Get()
  @ApiOperation({
    summary: 'List or search visit requests, newest first (curator-only)',
  })
  @ApiOkResponse({ type: [VisitRequest] })
  findAll(@Query() query: ListVisitRequestsQueryDto): Promise<VisitRequest[]> {
    return this.visitRequestsService.findAll(query);
  }

  // Public and personal-data free: museum opening hours plus the date and
  // time ranges held by curator-approved visits, so the visit form can offer
  // only free times.
  @Public()
  @Get('availability')
  @ApiOperation({
    summary: 'Opening hours and times already held by approved visits (public)',
  })
  @ApiOkResponse({ type: VisitAvailability })
  getAvailability(
    @Query() query: VisitDateRangeQueryDto,
  ): Promise<VisitAvailability> {
    return this.visitRequestsService.getAvailability(query);
  }

  @Roles('CURATOR')
  @Get('calendar')
  @ApiOperation({
    summary:
      'Curator-approved visits in a date range for the calendar (curator-only)',
  })
  @ApiOkResponse({ type: [VisitCalendarEvent] })
  getCalendar(
    @Query() query: VisitDateRangeQueryDto,
  ): Promise<VisitCalendarEvent[]> {
    return this.visitRequestsService.getCalendar(query);
  }

  @Roles('CURATOR')
  @Get(':id')
  @ApiOperation({ summary: 'Get one visit request (curator-only)' })
  @ApiOkResponse({ type: VisitRequest })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<VisitRequest> {
    return this.visitRequestsService.findOne(id);
  }

  @Roles('CURATOR')
  @Patch(':id')
  @ApiOperation({
    summary:
      'Submit for campus entry, complete, decline, or cancel (curator-only)',
  })
  @ApiOkResponse({ type: VisitRequest })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateVisitRequestDto: UpdateVisitRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<VisitRequest> {
    return this.visitRequestsService.update(
      id,
      updateVisitRequestDto,
      user.accountId,
    );
  }

  @Roles('CURATOR')
  @Patch(':id/approve-schedule')
  @ApiOperation({
    summary: 'Approve one preferred schedule option (curator-only)',
  })
  @ApiOkResponse({ type: VisitRequest })
  approveSchedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveVisitScheduleDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<VisitRequest> {
    return this.visitRequestsService.approveSchedule(id, dto, user.accountId);
  }

  @Roles('CURATOR')
  @Get(':id/campus-entry-summary')
  @ApiOperation({
    summary: 'Approved visit details for the USC campus-entry process',
  })
  @ApiOkResponse({ type: CampusEntrySummary })
  getCampusEntrySummary(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CampusEntrySummary> {
    return this.visitRequestsService.getCampusEntrySummary(id);
  }

  @Roles('CURATOR')
  @Get(':id/history')
  @ApiOperation({
    summary: 'Status changes, referrals, and notes, oldest first',
  })
  @ApiOkResponse({ type: [CommunicationEntry] })
  listHistory(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CommunicationEntry[]> {
    return this.visitRequestsService.listHistory(id);
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
    return this.visitRequestsService.addNote(id, dto, user.accountId);
  }

  @Roles('CURATOR')
  @Post(':id/messages')
  @ApiOperation({
    summary:
      'Email the visitor a message, e.g. a request for more information (curator-only)',
  })
  @ApiCreatedResponse({
    type: CommunicationEntry,
    description: 'The timeline entry; deliveryResult shows whether it was sent',
  })
  sendMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendVisitorMessageDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CommunicationEntry> {
    return this.visitRequestsService.sendMessage(id, dto, user.accountId);
  }
}
