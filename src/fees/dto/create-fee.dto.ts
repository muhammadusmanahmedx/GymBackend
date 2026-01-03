import { IsNotEmpty, IsString, IsNumber, IsDateString, IsOptional, IsIn } from 'class-validator';

export class CreateFeeDto {
  @IsNotEmpty()
  @IsString()
  memberId: string;

  @IsNotEmpty()
  @IsString()
  gymId: string;

  @IsNotEmpty()
  @IsNumber()
  amount: number;

  @IsNotEmpty()
  @IsString()
  month: string; // YYYY-MM

  @IsNotEmpty()
  @IsDateString()
  dueDate: string;

  @IsOptional()
  @IsIn(['paid', 'pending', 'overdue'])
  status?: 'paid' | 'pending' | 'overdue';

  @IsOptional()
  @IsString()
  paidDate?: string;
}
