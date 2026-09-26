import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { UserRole } from '../types/auth.types';

export class CurrentUserProfile {
  @ApiProperty()
  accountId!: string;

  @ApiPropertyOptional({ nullable: true })
  email!: string | null;

  @ApiProperty()
  fullName!: string;

  @ApiProperty()
  role!: UserRole;
}
