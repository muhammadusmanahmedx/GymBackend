import { Body, Controller, Get, Param, Post, Delete } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { CreateSettingsDto } from './dto/create-settings.dto';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Post()
  upsert(@Body() dto: CreateSettingsDto) {
    return this.settingsService.upsert(dto);
  }

  @Get(':userId')
  getByUser(@Param('userId') userId: string) {
    return this.settingsService.findByUserId(userId);
  }

  @Delete(':userId')
  remove(@Param('userId') userId: string) {
    return this.settingsService.removeByUserId(userId);
  }
}
