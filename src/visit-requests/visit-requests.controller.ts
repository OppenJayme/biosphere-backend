import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiCreatedResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { VisitRequestsService } from './visit-requests.service';
import { CreateVisitRequestDto } from './dto/create-visit-request.dto';
import { UpdateVisitRequestDto } from './dto/update-visit-request.dto';
import { VisitRequest } from './entities/visit-request.entity';

// POST is the only public route (SRS §4.9 Visit-Request Management) —
// the public website's Request-a-Visit form submits here. GET/PATCH/DELETE
// are for the future curator-facing visit-request queue and will need
// SupabaseAuthGuard + RolesGuard once auth is wired up.
@ApiTags('visit-requests')
@Controller('visit-requests')
export class VisitRequestsController {
  constructor(private readonly visitRequestsService: VisitRequestsService) {}

  @Post()
  @ApiOperation({ summary: 'Submit a visit request (public)' })
  @ApiCreatedResponse({ type: VisitRequest })
  create(@Body() createVisitRequestDto: CreateVisitRequestDto): VisitRequest {
    return this.visitRequestsService.create(createVisitRequestDto);
  }

  @Get()
  @ApiOperation({
    summary: 'List visit requests (curator-only, not yet guarded)',
  })
  @ApiOkResponse({ type: [VisitRequest] })
  findAll(): VisitRequest[] {
    return this.visitRequestsService.findAll();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get one visit request (curator-only, not yet guarded)',
  })
  @ApiOkResponse({ type: VisitRequest })
  findOne(@Param('id') id: string): VisitRequest {
    return this.visitRequestsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Update a visit request, e.g. confirm/decline it (curator-only, not yet guarded)',
  })
  @ApiOkResponse({ type: VisitRequest })
  update(
    @Param('id') id: string,
    @Body() updateVisitRequestDto: UpdateVisitRequestDto,
  ): VisitRequest {
    return this.visitRequestsService.update(id, updateVisitRequestDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a visit request (curator-only, not yet guarded)',
  })
  remove(@Param('id') id: string): void {
    this.visitRequestsService.remove(id);
  }
}
