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
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { DeveloperService } from './developer.service';
import { OnboardCuratorDto } from './dto/onboard-curator.dto';
import { UpdateCuratorStatusDto } from './dto/update-curator-status.dto';
import { CreateArAssetDto } from './dto/create-ar-asset.dto';
import { UpdateArAssetDto } from './dto/update-ar-asset.dto';
import { MAX_AR_ASSET_SIZE_BYTES } from './developer.constants';

@Roles('DEVELOPER')
@Controller('developer')
export class DeveloperController {
  constructor(private readonly developerService: DeveloperService) {}

  @Get('curators')
  listCurators() {
    return this.developerService.listCuratorAccounts();
  }

  @Post('curators/onboard')
  onboardInitialCurator(
    @Body() dto: OnboardCuratorDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.developerService.onboardInitialCurator(dto, user.id);
  }

  @Patch('curators/:id/status')
  updateCuratorStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCuratorStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.developerService.updateCuratorStatus(id, dto, user.id);
  }

  // ---- AR asset deployment (REQ-4.2-04, REQ-4.2-05) ----

  @Post('ar-assets')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_AR_ASSET_SIZE_BYTES } }),
  )
  createArAsset(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateArAssetDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.developerService.createArAsset(file, dto, user.id);
  }

  @Patch('ar-assets/:id')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_AR_ASSET_SIZE_BYTES } }),
  )
  updateArAsset(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UpdateArAssetDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.developerService.updateArAsset(id, file, dto, user.id);
  }

  @Patch('ar-assets/:id/activate')
  activateArAsset(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.developerService.setArAssetEnabled(id, true, user.id);
  }

  @Patch('ar-assets/:id/deactivate')
  deactivateArAsset(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.developerService.setArAssetEnabled(id, false, user.id);
  }

  @Delete('ar-assets/:id')
  removeArAsset(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.developerService.removeArAsset(id, user.id);
  }
}