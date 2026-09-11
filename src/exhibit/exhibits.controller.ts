import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { STORAGE_RULES } from '../supabase/storage.config';
import { AddExhibitMediaDto } from './dto/add-exhibit-media.dto';
import { CreateExhibitDto } from './dto/create-exhibit.dto';
import { UpdateExhibitDto } from './dto/update-exhibit.dto';
import { Exhibit } from './entities/exhibit.entity';
import { ExhibitMedia } from './entities/exhibit-media.entity';
import { ExhibitsService } from './exhibits.service';

// Unlike specimens/storage-locations, this controller mixes a public route
// (the QR page) with curator-only routes, so @Roles is applied per-method
// rather than at the class level (see AuthController for the same pattern) —
// a class-level @Roles('CURATOR') would still apply to the @Public() route
// once SupabaseAuthGuard lets it through, blocking visitors.
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
  @ApiOperation({ summary: 'List active exhibits (curator-only)' })
  @ApiOkResponse({ type: [Exhibit] })
  findAll(): Promise<Exhibit[]> {
    return this.exhibitsService.findAll();
  }

  // Placed ahead of the curator :id route in source for readability; route
  // matching is unaffected since 'public/:slug' is a two-segment path.
  @Public()
  @Get('public/:slug')
  @ApiOperation({ summary: 'Retrieve a published exhibit page (public)' })
  @ApiOkResponse({ type: Exhibit })
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
  @ApiOperation({ summary: 'Update an active exhibit' })
  @ApiOkResponse({ type: Exhibit })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExhibitDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Exhibit> {
    return this.exhibitsService.update(id, dto, user.accountId);
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
  @Patch(':id/disable')
  @ApiOperation({ summary: 'Disable a published exhibit' })
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
  @Post(':id/media')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: STORAGE_RULES['exhibit-media'].maxBytes },
    }),
  )
  @ApiOperation({ summary: 'Attach media to an exhibit' })
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
