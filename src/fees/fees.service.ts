import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Fee, FeeDocument } from '../schemas/fee.schema';
import { CreateFeeDto } from './dto/create-fee.dto';
import { UpdateFeeDto } from './dto/update-fee.dto';
import { Member, MemberDocument } from '../schemas/member.schema';
import { Gym, GymDocument } from '../schemas/gym.schema';
import { Settings, SettingsDocument } from '../settings/settings.schema';

@Injectable()
export class FeesService {
  constructor(
    @InjectModel(Fee.name) private feeModel: Model<FeeDocument>,
    @InjectModel(Member.name) private memberModel: Model<MemberDocument>,
    @InjectModel(Gym.name) private gymModel: Model<GymDocument>,
    @InjectModel(Settings.name) private settingsModel: Model<SettingsDocument>,
  ) {}

  async create(dto: CreateFeeDto) {
    const createdDoc = await this.feeModel.create({
      memberId: new Types.ObjectId(dto.memberId),
      gymId: new Types.ObjectId(dto.gymId),
      amount: dto.amount,
      month: dto.month,
      dueDate: new Date(dto.dueDate),
      status: dto.status || 'pending',
      paidDate: dto.paidDate ? new Date(dto.paidDate) : undefined,
    });
    const created = createdDoc.toObject();

    // push into member.feeHistory if member exists (include fee _id)
    try {
      const feeEntry = {
        _id: created._id,
        month: created.month,
        amount: created.amount,
        dueDate: created.dueDate,
        status: created.status,
        paidDate: created.paidDate || undefined,
      };
      await this.memberModel.findByIdAndUpdate(created.memberId, { $push: { feeHistory: feeEntry } }).exec();
    } catch (e) {
      // ignore errors syncing member feeHistory
    }

    return created;
  }

  async findAll(memberId?: string, gymId?: string) {
    const filter: any = {};
    if (memberId) filter.memberId = new Types.ObjectId(memberId);
    if (gymId) filter.gymId = new Types.ObjectId(gymId);
    let fees = await this.feeModel.find(filter).lean().exec();

    // If queried by memberId, ensure Fee documents exist for all feeHistory entries
    if (memberId) {
      try {
        const member = await this.memberModel.findById(memberId).lean().exec();
        if (member) {
          const feeHistory = (member as any).feeHistory || [];
          
          // For each feeHistory entry, ensure a Fee document exists
          for (const fh of feeHistory) {
            const existingFee = await this.feeModel.findOne({ 
              memberId: member._id, 
              month: fh.month 
            }).lean().exec();
            
            if (!existingFee) {
              // Create Fee document for this feeHistory entry
              console.log('Creating Fee doc for feeHistory entry:', fh.month);
              const created = await this.feeModel.create({
                memberId: member._id,
                gymId: member.gymId,
                amount: fh.amount || 0,
                month: fh.month,
                dueDate: fh.dueDate || new Date(),
                status: fh.status || 'pending',
                paidDate: fh.paidDate || undefined,
              });
              
              // Update feeHistory entry to have matching _id
              try {
                const fhIndex = feeHistory.findIndex((x: any) => x.month === fh.month);
                if (fhIndex >= 0) {
                  await this.memberModel.updateOne(
                    { _id: member._id },
                    { $set: { [`feeHistory.${fhIndex}._id`]: created._id } }
                  ).exec();
                }
              } catch (e) {
                console.log('Error updating feeHistory _id:', e);
              }
            }
          }
          
          // If no feeHistory at all, create initial fee for current month
          if (feeHistory.length === 0) {
            const now = new Date();
            const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            
            // determine amount from settings
            let amount = 0;
            if (member.gymId) {
              try {
                const gym = await this.gymModel.findById(member.gymId).lean().exec();
                if (gym) {
                  try {
                    const settings = await this.settingsModel.findOne({ userId: gym.ownerId }).lean().exec();
                    if (settings && typeof settings.monthlyFee === 'number' && settings.monthlyFee > 0) {
                      amount = settings.monthlyFee;
                    }
                  } catch (e) { /* ignore */ }
                  if (!amount && typeof gym.monthlyFee === 'number') amount = gym.monthlyFee;
                }
              } catch (e) { /* ignore */ }
            }
            
            const created = await this.feeModel.create({
              memberId: member._id,
              gymId: member.gymId,
              amount,
              month: monthStr,
              dueDate: now,
              status: member.feeStatus || 'pending',
            });
            
            await this.memberModel.findByIdAndUpdate(member._id, {
              $push: {
                feeHistory: {
                  _id: created._id,
                  month: monthStr,
                  amount,
                  dueDate: now,
                  status: member.feeStatus || 'pending',
                },
              },
            }).exec();
          }
          
          // Re-query fees after syncing
          fees = await this.feeModel.find({ memberId: new Types.ObjectId(memberId) }).lean().exec();
        }
      } catch (e) {
        console.log('Error syncing fees:', e);
      }
    }

    return fees;
  }

  async findOne(id: string) {
    const found = await this.feeModel.findById(id).lean().exec();
    if (!found) throw new NotFoundException('Fee not found');
    return found;
  }

  async update(id: string, dto: UpdateFeeDto) {
    console.log('=== FEE UPDATE START ===');
    console.log('Fee ID:', id);
    console.log('DTO:', dto);

    // Find the Fee document
    let feeDoc = await this.feeModel.findById(id).lean().exec();
    
    if (!feeDoc) {
      console.log('Fee document not found by ID');
      throw new NotFoundException('Fee not found');
    }

    console.log('Found fee document:', feeDoc);

    const paidDate = dto.paidDate ? new Date(dto.paidDate as any) : new Date();

    // Update the Fee document
    const updated = await this.feeModel.findByIdAndUpdate(
      id,
      {
        status: dto.status || feeDoc.status,
        paidDate: dto.status === 'paid' ? paidDate : undefined,
      },
      { new: true }
    ).lean().exec();

    console.log('Updated fee document:', updated);

    // If marking as paid, update member's feeHistory and create next month's fee
    if (dto.status === 'paid') {
      console.log('Processing paid status...');
      
      // Get the member
      const member = await this.memberModel.findById(feeDoc.memberId).exec();
      
      if (!member) {
        console.log('Member not found:', feeDoc.memberId);
        return updated;
      }

      console.log('Found member:', member.name);
      console.log('Current feeHistory:', JSON.stringify(member.feeHistory));

      // Find the feeHistory entry by month (more reliable than _id)
      const feeMonth = feeDoc.month;
      const fhIndex = member.feeHistory.findIndex((fh: any) => fh.month === feeMonth);
      
      console.log('Looking for month:', feeMonth, 'Found at index:', fhIndex);

      if (fhIndex >= 0) {
        // Update the existing feeHistory entry
        member.feeHistory[fhIndex].status = 'paid';
        member.feeHistory[fhIndex].paidDate = paidDate;
        console.log('Updated feeHistory entry at index', fhIndex);
      } else {
        // feeHistory entry doesn't exist, add it
        member.feeHistory.push({
          month: feeMonth,
          amount: feeDoc.amount,
          dueDate: feeDoc.dueDate,
          status: 'paid',
          paidDate: paidDate,
        } as any);
        console.log('Added new feeHistory entry for month:', feeMonth);
      }

      // Update lastPayment
      member.lastPayment = paidDate;

      // Create next month's fee if member is active
      // Calculate next month based on the FEE's month, not the payment date
      if (member.status === 'active') {
        // Parse the fee's month (e.g., "2026-01" -> year=2026, month=0)
        const [feeYear, feeMonthNum] = feeDoc.month.split('-').map(Number);
        // Calculate next month from the fee's month
        const nextMonthDate = new Date(Date.UTC(feeYear, feeMonthNum, 1)); // feeMonthNum is 1-based, so this gives us next month
        const nextMonth = `${nextMonthDate.getUTCFullYear()}-${String(nextMonthDate.getUTCMonth() + 1).padStart(2, '0')}`;
        
        // Use the same day of month as the original due date for the next due date
        const originalDueDay = new Date(feeDoc.dueDate).getUTCDate();
        const nextDueDate = new Date(Date.UTC(nextMonthDate.getUTCFullYear(), nextMonthDate.getUTCMonth(), originalDueDay));
        
        console.log('Fee month:', feeDoc.month, '-> Next month:', nextMonth);

        // Check if next month fee already exists in feeHistory
        const nextExists = member.feeHistory.some((fh: any) => fh.month === nextMonth);
        
        console.log('Next month exists in feeHistory?', nextExists);

        if (!nextExists) {
          // Create Fee document for next month
          const newFee = await this.feeModel.create({
            memberId: feeDoc.memberId,
            gymId: feeDoc.gymId,
            amount: feeDoc.amount,
            month: nextMonth,
            dueDate: nextDueDate,
            status: 'pending',
          });
          
          console.log('Created next month Fee document:', newFee._id);

          // Add to feeHistory
          member.feeHistory.push({
            month: nextMonth,
            amount: feeDoc.amount,
            dueDate: nextDueDate,
            status: 'pending',
          } as any);

          console.log('Added next month to feeHistory');
        }
      }

      // Keep feeStatus as 'paid' - it will change to 'pending' only when next month's due date arrives
      // This is handled by a separate check when fetching members
      member.feeStatus = 'paid';


      // Save the member with all changes
      await member.save();
      console.log('Saved member. New feeHistory:', JSON.stringify(member.feeHistory));
      console.log('=== FEE UPDATE END ===');
    }

    return updated;
  }

  async remove(id: string) {
    const res = await this.feeModel.findByIdAndDelete(id).lean().exec();
    if (!res) throw new NotFoundException('Fee not found');
    return { success: true };
  }
}
