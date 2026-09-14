import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { AttachSpecimenTagDto } from './dto/attach-specimen-tag.dto';
import {
  AttachSpecimenTagResult,
  DetachSpecimenTagResult,
  Tag,
} from './entities/tag.entity';
import { SpecimenTagsService } from './specimen-tags.service';

@ApiTags('specimen-tags')
@Roles('CURATOR')
@Controller('specimens/:specimenId/tags')
export class SpecimenTagsController {
  constructor(private readonly service: SpecimenTagsService) {}

  @Get()
  @ApiOperation({ summary: "List a specimen's tags" })
  @ApiOkResponse({ type: [Tag] })
  findForSpecimen(
    @Param('specimenId', ParseUUIDPipe) specimenId: string,
  ): Promise<Tag[]> {
    return this.service.findForSpecimen(specimenId);
  }

  @Post()
  @ApiOperation({ summary: 'Create or reuse and attach a specimen tag' })
  @ApiCreatedResponse({ type: AttachSpecimenTagResult })
  @ApiConflictResponse({
    description: 'Tag relationships changed concurrently; reload and retry',
  })
  attach(
    @Param('specimenId', ParseUUIDPipe) specimenId: string,
    @Body() dto: AttachSpecimenTagDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AttachSpecimenTagResult> {
    return this.service.attach(specimenId, dto, user.accountId);
  }

  @Delete(':tagId')
  @ApiOperation({ summary: 'Detach a tag without deleting shared vocabulary' })
  @ApiOkResponse({ type: DetachSpecimenTagResult })
  @ApiNotFoundResponse({ description: 'Specimen or tag attachment not found' })
  @ApiConflictResponse({
    description: 'Tag relationships changed concurrently; reload and retry',
  })
  detach(
    @Param('specimenId', ParseUUIDPipe) specimenId: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DetachSpecimenTagResult> {
    return this.service.detach(specimenId, tagId, user.accountId);
  }
}
