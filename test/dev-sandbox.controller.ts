// Auth Tester
import { Controller, Post, Body } from "@nestjs/common";
import { Roles } from "src/auth/decorators/roles.decorator";

@Controller('test')
export class TestController {
    @Roles('curator')
    @Post('curator-table')
    editCuratorTable(
        @Body()
        body: { note: string }
    ) {
        return { message: 'Curator table edited', body}
    }

    @Roles('developer')
    @Post('developer-table')
    editDeveloperTable(
        @Body()
        body: { note: string }
    ) {
        return { message: 'Developer table edited', body}
    }
}