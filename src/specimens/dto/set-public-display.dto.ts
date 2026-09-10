import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetPublicDisplayDto {
  @ApiProperty()
  @IsBoolean()
  publicDisplay!: boolean;
}
