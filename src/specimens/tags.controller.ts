import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { ListTagsQueryDto } from './dto/list-tags-query.dto';
import { Tag } from './entities/tag.entity';
import { SpecimenTagsService } from './specimen-tags.service';

@ApiTags('tags')
@Roles('CURATOR')
@Controller('tags')
export class TagsController {
  constructor(private readonly service: SpecimenTagsService) {}

  @Get()
  @ApiOperation({ summary: 'Search reusable tags for curator autocomplete' })
  @ApiOkResponse({ type: [Tag] })
  findAvailable(@Query() query: ListTagsQueryDto): Promise<Tag[]> {
    return this.service.findAvailable(query);
  }
}
