import { Transform } from 'class-transformer';
import {
  Equals,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { trimFaqText } from './faq-text.transform';

export class SubmitFaqReviewDto {
  @Transform(trimFaqText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  question!: string;

  @Equals(true)
  consent!: boolean;

  @IsUUID()
  submissionId!: string;
}
