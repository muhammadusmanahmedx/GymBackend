import { IsNotEmpty, IsString, IsNumber, IsDateString } from 'class-validator';

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

  status?: 'paid' | 'pending' | 'overdue';
  paidDate?: string;
}
