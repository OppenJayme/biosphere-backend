// Auth Tester
import { Body, Controller, Post } from '@nestjs/common';
import { Roles } from 'src/auth/decorators/roles.decorator';

@Controller('test')
export class TestController {
  @Roles('CURATOR')
  @Post('curator-table')
  editCuratorTable(
    @Body()
    body: {
      note: string;
    },
  ) {
    return { message: 'Curator table edited', body };
  }

  @Roles('DEVELOPER')
  @Post('developer-table')
  editDeveloperTable(
    @Body()
    body: {
      note: string;
    },
  ) {
    return { message: 'Developer table edited', body };
  }
}
