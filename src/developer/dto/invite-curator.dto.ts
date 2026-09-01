import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString, MaxLength } from "class-validator";

export class InviteCurator {
    @ApiProperty({ example: 'curator@biosphere.com' })
    @IsEmail()
    email!: string;

    @ApiProperty()
    @IsString()
    @MaxLength(255)
    fullName!: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    avatarPath?: string;
}