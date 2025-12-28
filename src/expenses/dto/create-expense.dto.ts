import { IsNotEmpty, IsString, IsNumber, IsEnum, IsDateString } from 'class-validator';

export const EXPENSE_CATEGORIES = ['equipment', 'utilities', 'rent', 'salary', 'maintenance', 'other'] as const;
export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

export class CreateExpenseDto {
  @IsNotEmpty()
  @IsString()
  gymId: string;

  @IsNotEmpty()
  @IsString()
  description: string;

  @IsNotEmpty()
  @IsNumber()
  amount: number;

  @IsNotEmpty()
  @IsEnum(EXPENSE_CATEGORIES as any)
  category: ExpenseCategory;

  @IsNotEmpty()
  @IsDateString()
  date: string; // ISO date string
}
