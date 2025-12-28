import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { FeesService } from './fees.service';
import { CreateFeeDto } from './dto/create-fee.dto';
import { UpdateFeeDto } from './dto/update-fee.dto';

@Controller('fees')
export class FeesController {
  constructor(private readonly feesService: FeesService) {}

  @Post()
  create(@Body() dto: CreateFeeDto) {
    return this.feesService.create(dto);
  }

  @Get()
  findAll(@Query('memberId') memberId?: string, @Query('gymId') gymId?: string) {
    return this.feesService.findAll(memberId, gymId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.feesService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateFeeDto) {
    return this.feesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.feesService.remove(id);
  }
}
