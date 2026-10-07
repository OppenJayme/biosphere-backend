import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum UserAccountStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

/** One curator account as the curator Users page shows it. */
export class UserAccountSummary {
  @ApiProperty({ format: 'uuid', description: 'public.user_account.id' })
  id!: string;

  @ApiProperty()
  fullName!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  email!: string | null;

  @ApiProperty({ enum: UserAccountStatus })
  status!: UserAccountStatus;

  @ApiProperty({
    description:
      'False until the invited curator has set a password; opening the invite link alone does not count',
  })
  inviteAccepted!: boolean;

  @ApiPropertyOptional({ nullable: true, type: Date })
  lastSignInAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;
}
