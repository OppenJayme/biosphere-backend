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
import { CreateVisitRequestDto } from './dto/create-visit-request.dto';
import { ListVisitRequestsQueryDto } from './dto/list-visit-requests-query.dto';
import { UpdateVisitRequestDto } from './dto/update-visit-request.dto';
import {
  VisitRequest,
  VisitRequestSubmissionReceipt,
} from './entities/visit-request.entity';
import { VisitRequestsService } from './visit-requests.service';

// POST is the only public route (SRS §4.9). Every other route handles
// visitor personal data, so it is curator-only (NFR-SEC-10); @Roles is set
// per method because a class-level @Roles would also block the public POST.
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
  @ApiOperation({ summary: 'List visit requests, newest first (curator-only)' })
  @ApiOkResponse({ type: [VisitRequest] })
  findAll(@Query() query: ListVisitRequestsQueryDto): Promise<VisitRequest[]> {
    return this.visitRequestsService.findAll(query);
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
  @ApiOperation({ summary: 'Change a visit request status (curator-only)' })
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
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a visit request (curator-only)' })
  @ApiNoContentResponse()
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.visitRequestsService.remove(id, user.accountId);
  }
}
