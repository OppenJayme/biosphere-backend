import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum UserAccountRole {
  CURATOR = 'CURATOR',
  DEVELOPER = 'DEVELOPER',
}

export enum UserAccountStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

/** One curator or developer account as the curator Users page shows it. */
export class UserAccountSummary {
  @ApiProperty({ format: 'uuid', description: 'public.user_account.id' })
  id!: string;

  @ApiProperty()
  fullName!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  email!: string | null;

  @ApiProperty({ enum: UserAccountRole })
  role!: UserAccountRole;

  @ApiProperty({ enum: UserAccountStatus })
  status!: UserAccountStatus;

  @ApiProperty({
    description:
      'False while the onboarding invitation has not been accepted yet',
  })
  inviteAccepted!: boolean;

  @ApiPropertyOptional({ nullable: true, type: Date })
  lastSignInAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;
}
