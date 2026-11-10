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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { CollectionsService } from './collections.service';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { ListCollectionsQueryDto } from './dto/list-collections-query.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';
import { CollectionPage, MuseumCollection } from './entities/collection.entity';

@ApiTags('collections')
@Roles('CURATOR')
@Controller('collections')
export class CollectionsController {
  constructor(private readonly service: CollectionsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a curator-managed specimen collection' })
  @ApiCreatedResponse({ type: MuseumCollection })
  create(
    @Body() dto: CreateCollectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MuseumCollection> {
    return this.service.create(dto, user.accountId);
  }

  @Get()
  @ApiOperation({ summary: 'Search and paginate specimen collections' })
  @ApiOkResponse({ type: CollectionPage })
  findAll(@Query() query: ListCollectionsQueryDto): Promise<CollectionPage> {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve one specimen collection' })
  @ApiOkResponse({ type: MuseumCollection })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<MuseumCollection> {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename a specimen collection' })
  @ApiOkResponse({ type: MuseumCollection })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCollectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MuseumCollection> {
    return this.service.update(id, dto, user.accountId);
  }
}
