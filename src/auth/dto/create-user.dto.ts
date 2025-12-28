import { IsEmail, IsNotEmpty, MinLength, IsOptional, IsString } from 'class-validator';

export class CreateUserDto {
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @IsNotEmpty()
  @MinLength(6)
  password: string;

  role?: 'owner' | 'staff';
  
  @IsOptional()
  @IsString()
  gymName?: string;

  @IsOptional()
  @IsString()
  gymLocation?: string;
}
