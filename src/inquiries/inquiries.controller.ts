import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PUBLIC_FORM_RATE_LIMIT } from '../config/rate-limit.config';
import { CreateInquiryDto } from './dto/create-inquiry.dto';
import { ListInquiriesQueryDto } from './dto/list-inquiries-query.dto';
import { UpdateInquiryDto } from './dto/update-inquiry.dto';
import { Inquiry, InquirySubmissionReceipt } from './entities/inquiry.entity';
import { InquiriesService } from './inquiries.service';

// POST is the only public route (SRS §4.8). Every other route handles
// visitor personal data, so it is curator-only (NFR-SEC-10); @Roles is set
// per method because a class-level @Roles would also block the public POST.
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
  @ApiOperation({ summary: 'List inquiries, newest first (curator-only)' })
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
  @ApiOperation({ summary: 'Change an inquiry status (curator-only)' })
  @ApiOkResponse({ type: Inquiry })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateInquiryDto: UpdateInquiryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Inquiry> {
    return this.inquiriesService.update(id, updateInquiryDto, user.accountId);
  }

  @Roles('CURATOR')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an inquiry (curator-only)' })
  @ApiNoContentResponse()
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.inquiriesService.remove(id, user.accountId);
  }
}
