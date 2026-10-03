import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { STORAGE_RULES } from '../supabase/storage.config';
import { AddExhibitMediaDto } from './dto/add-exhibit-media.dto';
import { CreateExhibitDto } from './dto/create-exhibit.dto';
import { ExhibitQrQueryDto } from './dto/exhibit-qr-query.dto';
import { ListExhibitsQueryDto } from './dto/list-exhibits-query.dto';
import { ReplaceExhibitUrlDto } from './dto/replace-exhibit-url.dto';
import { SetExhibitArDto } from './dto/set-exhibit-ar.dto';
import { UpdateExhibitMediaDto } from './dto/update-exhibit-media.dto';
import { UpdateExhibitDto } from './dto/update-exhibit.dto';
import { Exhibit, PublicExhibitResponse } from './entities/exhibit.entity';
import { ExhibitMedia } from './entities/exhibit-media.entity';
import { ExhibitQrImage, ExhibitsService } from './exhibits.service';

// Unlike specimens/storage-locations, this controller mixes a public route
// (the QR page) with curator-only routes, so @Roles is applied per-method
// rather than at the class level (see AuthController for the same pattern) —
// a class-level @Roles('CURATOR') would still apply to the @Public() route
// once SupabaseAuthGuard lets it through, blocking visitors. AR assets
// themselves are uploaded and activated only through /developer (REQ-4.2-04);
// curators enable or disable an exhibit's uploaded AR here (REQ-4.13-02).
@ApiTags('exhibits')
@Controller('exhibits')
export class ExhibitsController {
  constructor(private readonly exhibitsService: ExhibitsService) {}

  @Roles('CURATOR')
  @Post()
  @ApiOperation({ summary: 'Create an exhibit from an eligible specimen' })
  @ApiCreatedResponse({ type: Exhibit })
  create(
    @Body() dto: CreateExhibitDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Exhibit> {
    return this.exhibitsService.create(dto, user.accountId);
  }

  @Roles('CURATOR')
  @Get()
  @ApiOperation({
    summary: 'List or search active exhibits (curator-only)',
  })
  @ApiOkResponse({ type: [Exhibit] })
  findAll(@Query() query: ListExhibitsQueryDto): Promise<Exhibit[]> {
    return this.exhibitsService.findAll(query);
  }

  // Placed ahead of the curator :id route in source for readability; route
  // matching is unaffected since 'public/:slug' is a two-segment path.
  @Public()
  @Get('public/:slug')
  @ApiOperation({ summary: 'Retrieve a published exhibit page (public)' })
  @ApiOkResponse({ type: PublicExhibitResponse })
  findPublishedBySlug(@Param('slug') slug: string) {
    return this.exhibitsService.findPublishedBySlug(slug);
  }

  @Roles('CURATOR')
  @Get(':id')
  @ApiOperation({ summary: 'Retrieve one exhibit, including its media' })
  @ApiOkResponse({ type: Exhibit })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Exhibit> {
    return this.exhibitsService.findOne(id);
  }

  @Roles('CURATOR')
  @Patch(':id')
  @ApiOperation({
    summary: 'Edit exhibit content; the public URL stays the same',
  })
  @ApiOkResponse({ type: Exhibit })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExhibitDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Exhibit> {
    return this.exhibitsService.update(id, dto, user.accountId);
  }

  @Roles('CURATOR')
  @Patch(':id/replace-url')
  @ApiOperation({
    summary:
      'Intentionally replace the public URL; QR codes printed for the old URL stop working',
  })
  @ApiOkResponse({ type: Exhibit })
  replaceUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceExhibitUrlDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Exhibit> {
    return this.exhibitsService.replaceUrl(id, dto, user.accountId);
  }

  @Roles('CURATOR')
  @Patch(':id/publish')
  @ApiOperation({ summary: 'Publish an exhibit to its public QR page' })
  @ApiOkResponse({ type: Exhibit })
  publish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Exhibit> {
    return this.exhibitsService.publish(id, user.accountId);
  }

  @Roles('CURATOR')
  @Patch(':id/unpublish')
  @ApiOperation({ summary: 'Take a published exhibit page offline' })
  @ApiOkResponse({ type: Exhibit })
  unpublish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Exhibit> {
    return this.exhibitsService.unpublish(id, user.accountId);
  }

  @Roles('CURATOR')
  @Patch(':id/disable')
  @ApiOperation({ summary: 'Disable an exhibit page' })
  @ApiOkResponse({ type: Exhibit })
  disable(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Exhibit> {
    return this.exhibitsService.disable(id, user.accountId);
  }

  @Roles('CURATOR')
  @Patch(':id/archive')
  @ApiOperation({ summary: 'Archive an exhibit instead of deleting it' })
  @ApiOkResponse({ type: Exhibit })
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Exhibit> {
    return this.exhibitsService.archive(id, user.accountId);
  }

  @Roles('CURATOR')
  @Patch(':id/ar')
  @ApiOperation({
    summary:
      "Enable or disable an exhibit's uploaded AR assets (curator); developers upload them",
  })
  @ApiOkResponse({ type: Exhibit })
  setAr(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetExhibitArDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Exhibit> {
    return this.exhibitsService.setAr(id, dto, user.accountId);
  }

  @Roles('CURATOR')
  @Get(':id/qr')
  @ApiOperation({
    summary:
      'QR code for the public page (PNG or SVG); regenerated identically on every request',
  })
  @ApiProduces('image/png', 'image/svg+xml')
  @Header('Cache-Control', 'no-store')
  async getQrCode(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ExhibitQrQueryDto,
  ): Promise<StreamableFile> {
    return toFile(await this.exhibitsService.getQrCode(id, query));
  }

  @Roles('CURATOR')
  @Get(':id/label')
  @ApiOperation({
    summary:
      'Printable exhibit label: QR code, specimen name, and human-readable URL (SVG)',
  })
  @ApiProduces('image/svg+xml')
  @Header('Cache-Control', 'no-store')
  async getLabel(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    return toFile(await this.exhibitsService.getLabel(id));
  }

  @Roles('CURATOR')
  @Post(':id/media')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: STORAGE_RULES['exhibit-media'].maxBytes },
    }),
  )
  @ApiOperation({ summary: 'Upload an image to an exhibit' })
  @ApiCreatedResponse({ type: ExhibitMedia })
  addMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: AddExhibitMediaDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ExhibitMedia> {
    return this.exhibitsService.addMedia(id, file, dto, user.accountId);
  }

  @Roles('CURATOR')
  @Patch(':id/media/:mediaId')
  @ApiOperation({ summary: 'Edit an image caption, order, or cover flag' })
  @ApiOkResponse({ type: ExhibitMedia })
  updateMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Body() dto: UpdateExhibitMediaDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ExhibitMedia> {
    return this.exhibitsService.updateMedia(id, mediaId, dto, user.accountId);
  }

  @Roles('CURATOR')
  @Delete(':id/media/:mediaId')
  @ApiOperation({ summary: 'Remove exhibit media' })
  removeMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.exhibitsService.removeMedia(id, mediaId, user.accountId);
  }
}

// Served inline so the browser can show or print it; the filename is used
// when the curator saves it.
function toFile(image: ExhibitQrImage): StreamableFile {
  return new StreamableFile(
    typeof image.body === 'string' ? Buffer.from(image.body) : image.body,
    {
      type: image.contentType,
      disposition: `inline; filename="${image.fileName}"`,
    },
  );
}
