import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class OnboardCuratorDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fullName!: string;
}
