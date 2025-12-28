import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Expense, ExpenseDocument } from '../schemas/expense.schema';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';

@Injectable()
export class ExpensesService {
  constructor(
    @InjectModel(Expense.name) private expenseModel: Model<ExpenseDocument>,
    @InjectModel('User') private userModel: Model<any>,
  ) {}

  async create(dto: CreateExpenseDto, authHeader?: string) {
    let gymIdStr = dto.gymId;
    let userId: string | undefined = undefined;
    if (authHeader && !gymIdStr) {
      try {
        const token = authHeader.replace(/^Bearer\s+/i, '');
        const jwt = require('jsonwebtoken');
        const secret = process.env.JWT_SECRET || 'change-me';
        const decoded: any = jwt.verify(token, secret);
        userId = decoded?.sub;
        if (userId) {
          const user = (await this.userModel.findById(userId).lean().exec()) as any;
          if (user && user.gymId) gymIdStr = String(user.gymId);
        }
      } catch (e) {
        // ignore
      }
    }

    const payload: any = {
      ...dto,
      gymId: new Types.ObjectId(gymIdStr),
      date: new Date((dto as any).date),
    };
    if (userId) payload.userId = new Types.ObjectId(userId);

    const created = await this.expenseModel.create(payload);
    return created.toObject();
  }

  async findAll(gymId?: string) {
    const filter: any = {};
    if (gymId) filter.gymId = new Types.ObjectId(gymId);
    return this.expenseModel.find(filter).lean().exec();
  }

  async findOne(id: string) {
    const found = await this.expenseModel.findById(id).lean().exec();
    if (!found) throw new NotFoundException('Expense not found');
    return found;
  }

  async update(id: string, dto: UpdateExpenseDto) {
    const payload: any = { ...dto };
    if (dto.gymId) payload.gymId = new Types.ObjectId(dto.gymId as any);
    if (dto.date) payload.date = new Date(dto.date as any);
    const updated = await this.expenseModel.findByIdAndUpdate(id, payload, { new: true }).lean().exec();
    if (!updated) throw new NotFoundException('Expense not found');
    return updated;
  }

  async remove(id: string) {
    const res = await this.expenseModel.findByIdAndDelete(id).lean().exec();
    if (!res) throw new NotFoundException('Expense not found');
    return { success: true };
  }
}
