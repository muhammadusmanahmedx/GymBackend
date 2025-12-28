import { IsOptional, IsString, IsNumber, IsNotEmpty } from 'class-validator';

export class CreateSettingsDto {
  @IsNotEmpty()
  @IsString()
  userId: string;

  @IsOptional()
  @IsString()
  gymName?: string;

  @IsOptional()
  @IsNumber()
  monthlyFee?: number;
}
