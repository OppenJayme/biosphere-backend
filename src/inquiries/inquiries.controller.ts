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
import { InquiriesService } from './inquiries.service';
import { CreateInquiryDto } from './dto/create-inquiry.dto';
import { UpdateInquiryDto } from './dto/update-inquiry.dto';
import { Inquiry } from './entities/inquiry.entity';

// POST is the only public route (SRS §4.8 General Inquiry Management) —
// the public website's General Inquiry form submits here. GET/PATCH/DELETE
// are for the future curator-facing inquiry inbox and will need
// SupabaseAuthGuard + RolesGuard once auth is wired up.
@ApiTags('inquiries')
@Controller('inquiries')
export class InquiriesController {
  constructor(private readonly inquiriesService: InquiriesService) {}

  @Post()
  @ApiOperation({ summary: 'Submit a general inquiry (public)' })
  @ApiCreatedResponse({ type: Inquiry })
  create(@Body() createInquiryDto: CreateInquiryDto): Inquiry {
    return this.inquiriesService.create(createInquiryDto);
  }

  @Get()
  @ApiOperation({ summary: 'List inquiries (curator-only, not yet guarded)' })
  @ApiOkResponse({ type: [Inquiry] })
  findAll(): Inquiry[] {
    return this.inquiriesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one inquiry (curator-only, not yet guarded)' })
  @ApiOkResponse({ type: Inquiry })
  findOne(@Param('id') id: string): Inquiry {
    return this.inquiriesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Update an inquiry, e.g. resolve it (curator-only, not yet guarded)',
  })
  @ApiOkResponse({ type: Inquiry })
  update(
    @Param('id') id: string,
    @Body() updateInquiryDto: UpdateInquiryDto,
  ): Inquiry {
    return this.inquiriesService.update(id, updateInquiryDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete an inquiry (curator-only, not yet guarded)',
  })
  remove(@Param('id') id: string): void {
    this.inquiriesService.remove(id);
  }
}
