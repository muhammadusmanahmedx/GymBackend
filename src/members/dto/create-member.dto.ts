import { IsNotEmpty, IsOptional, IsString, IsEmail, IsIn } from 'class-validator';

export class CreateMemberDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  phone: string;

  @IsOptional()
  joinDate?: Date;

  @IsOptional()
  status?: 'active' | 'left';

  @IsOptional()
  feeStatus?: 'paid' | 'pending' | 'overdue';

  @IsOptional()
  lastPayment?: Date;

  @IsOptional()
  gymId?: string;

  @IsOptional()
  @IsIn(['male', 'female'])
  gender?: 'male' | 'female';
}
