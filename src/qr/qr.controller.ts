import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { QrCodeInfo } from './entities/qr-code.entity';
import { QrService } from './qr.service';

@ApiTags('exhibit-qr')
@Roles('CURATOR')
@Controller('exhibits/:id/qr')
export class QrController {
  constructor(private readonly service: QrService) {}

  @Get()
  @ApiOperation({
    summary: 'Get the published exhibit URL backing this QR code',
  })
  @ApiOkResponse({ type: QrCodeInfo })
  getInfo(@Param('id', ParseUUIDPipe) id: string): Promise<QrCodeInfo> {
    return this.service.getInfo(id);
  }

  @Get('png')
  @ApiOperation({
    summary: 'Download a printable PNG QR code for the exhibit (REQ-4.12-05)',
  })
  async getPng(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StreamableFile> {
    const buffer = await this.service.generatePng(id, user.accountId);
    return new StreamableFile(buffer, {
      type: 'image/png',
      disposition: `attachment; filename="exhibit-${id}-qr.png"`,
    });
  }

  @Get('svg')
  @ApiOperation({
    summary: 'Download a printable SVG QR code for the exhibit (REQ-4.12-05)',
  })
  @Header('Content-Type', 'image/svg+xml')
  async getSvg(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const svg = await this.service.generateSvg(id, user.accountId);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="exhibit-${id}-qr.svg"`,
    );
    return svg;
  }
}
