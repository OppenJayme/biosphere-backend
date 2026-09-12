import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
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
import { STORAGE_RULES } from '../supabase/storage.config';
import { CreateSpecimenMediaDto } from './dto/create-specimen-media.dto';
import { UpdateSpecimenMediaDto } from './dto/update-specimen-media.dto';
import {
  RemoveSpecimenMediaResult,
  ReplaceSpecimenMediaResult,
  SpecimenMedia,
  SpecimenMediaSignedUrl,
} from './entities/specimen-media.entity';
import { SpecimenMediaService } from './specimen-media.service';

@ApiTags('specimen-media')
@Roles('CURATOR')
@Controller('specimens/:specimenId/media')
export class SpecimenMediaController {
  constructor(private readonly service: SpecimenMediaService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: STORAGE_RULES['specimen-media'].maxBytes },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        caption: { type: 'string', maxLength: 255 },
        displayOrder: { type: 'integer', minimum: 0 },
        isCover: { type: 'boolean', default: false },
      },
    },
  })
  @ApiOperation({ summary: 'Upload an image for an active specimen' })
  @ApiCreatedResponse({ type: SpecimenMedia })
  create(
    @Param('specimenId', ParseUUIDPipe) specimenId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: CreateSpecimenMediaDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SpecimenMedia> {
    return this.service.create(specimenId, file, dto, user.accountId);
  }

  @Get()
  @ApiOperation({ summary: "List a specimen's media metadata" })
  @ApiOkResponse({ type: [SpecimenMedia] })
  findAll(
    @Param('specimenId', ParseUUIDPipe) specimenId: string,
  ): Promise<SpecimenMedia[]> {
    return this.service.findAll(specimenId);
  }

  @Get(':mediaId/signed-url')
  @ApiOperation({ summary: 'Create a short-lived URL for a private image' })
  @ApiOkResponse({ type: SpecimenMediaSignedUrl })
  createSignedUrl(
    @Param('specimenId', ParseUUIDPipe) specimenId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
  ): Promise<SpecimenMediaSignedUrl> {
    return this.service.createSignedUrl(specimenId, mediaId);
  }

  @Get(':mediaId')
  @ApiOkResponse({ type: SpecimenMedia })
  findOne(
    @Param('specimenId', ParseUUIDPipe) specimenId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
  ): Promise<SpecimenMedia> {
    return this.service.findOne(specimenId, mediaId);
  }

  @Put(':mediaId/file')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: STORAGE_RULES['specimen-media'].maxBytes },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: 'Replace an existing specimen image file' })
  @ApiOkResponse({ type: ReplaceSpecimenMediaResult })
  replaceFile(
    @Param('specimenId', ParseUUIDPipe) specimenId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReplaceSpecimenMediaResult> {
    return this.service.replaceFile(specimenId, mediaId, file, user.accountId);
  }

  @Patch(':mediaId')
  @ApiOperation({ summary: 'Update image caption or display order' })
  @ApiOkResponse({ type: SpecimenMedia })
  update(
    @Param('specimenId', ParseUUIDPipe) specimenId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Body() dto: UpdateSpecimenMediaDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SpecimenMedia> {
    return this.service.update(specimenId, mediaId, dto, user.accountId);
  }

  @Patch(':mediaId/cover')
  @ApiOperation({ summary: 'Select the specimen cover image' })
  @ApiOkResponse({ type: SpecimenMedia })
  setCover(
    @Param('specimenId', ParseUUIDPipe) specimenId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SpecimenMedia> {
    return this.service.setCover(specimenId, mediaId, user.accountId);
  }

  @Delete(':mediaId')
  @ApiOperation({ summary: 'Remove specimen media and its private image' })
  @ApiOkResponse({ type: RemoveSpecimenMediaResult })
  remove(
    @Param('specimenId', ParseUUIDPipe) specimenId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RemoveSpecimenMediaResult> {
    return this.service.remove(specimenId, mediaId, user.accountId);
  }
}
