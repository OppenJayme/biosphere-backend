import { IsIn } from 'class-validator';

export class ReviewFaqQuestionDto {
  @IsIn(['REVIEWED', 'DISMISSED'])
  status!: 'REVIEWED' | 'DISMISSED';
}
