import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export enum AccountStatus {
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE',
}

export class UserAccount {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ format: 'uuid' })
    authUserId!: string;

    @ApiProperty()
    fullName!: string;

    @ApiProperty({ enum: AccountStatus })
    status!: AccountStatus;

    @ApiPropertyOptional()
    avatarPath?: string;

    @ApiProperty()
    createAt!: Date;

    @ApiProperty()
    updatedAt!: Date;
}