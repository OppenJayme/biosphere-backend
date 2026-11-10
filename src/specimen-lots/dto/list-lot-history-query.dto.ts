import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { LotTransactionType } from '../entities/specimen-lot-transaction.entity';
import { ListLotTransactionsQueryDto } from './list-lot-transactions-query.dto';

export class ListLotHistoryQueryDto extends ListLotTransactionsQueryDto {
  @ApiPropertyOptional({ enum: LotTransactionType })
  @IsOptional()
  @IsEnum(LotTransactionType)
  transactionType?: LotTransactionType;
}
