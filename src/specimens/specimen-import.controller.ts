import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { CommitSpecimenImportDto } from './dto/commit-specimen-import.dto';
import {
  SpecimenImportCommitResult,
  SpecimenImportPreviewResult,
} from './entities/specimen-import.entity';
import {
  MAX_IMPORT_FILE_BYTES,
  SpecimenImportService,
} from './specimen-import.service';

@ApiTags('specimens')
@Roles('CURATOR')
@Controller('specimens/import')
export class SpecimenImportController {
  constructor(private readonly service: SpecimenImportService) {}

  @Post('preview')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_FILE_BYTES } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary:
      'Validate a CSV of specimen rows and flag possible duplicates without saving anything (REQ-4.4-19/20/21)',
  })
  @ApiCreatedResponse({ type: SpecimenImportPreviewResult })
  preview(
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<SpecimenImportPreviewResult> {
    return this.service.previewImport(file);
  }

  @Post('commit')
  @ApiOperation({
    summary:
      'Create Uncataloged specimen records from curator-approved import rows',
  })
  @ApiOkResponse({ type: SpecimenImportCommitResult })
  commit(
    @Body() dto: CommitSpecimenImportDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SpecimenImportCommitResult> {
    return this.service.commitImport(dto.rows, user.accountId);
  }
}
