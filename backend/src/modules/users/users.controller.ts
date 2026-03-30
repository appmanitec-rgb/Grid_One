import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { AuthGuard } from '../auth/auth.guard';
import { CreateUserCertificationDto } from './dto/create-user-certification.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { CreateUserSpecialtyDto } from './dto/create-user-specialty.dto';
import { UpdateUserCertificationDto } from './dto/update-user-certification.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserSpecialtyDto } from './dto/update-user-specialty.dto';
import { UserPresencePingDto } from './dto/user-presence-ping.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(AuthGuard, AccessPolicyGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @RequireAccessPolicy('users.manage')
  @Post()
  create(@Req() req: Request, @Body() createUserDto: CreateUserDto) {
    const actorUserId = this.extractUserId(req);
    return this.usersService.create(createUserDto, actorUserId);
  }

  @RequireAccessPolicy('pages.dashboard')
  @Get('me/access')
  getMyAccess(@Req() req: Request) {
    const userId = this.extractUserId(req);
    return this.usersService.getEffectiveAccessForUser(userId);
  }

  @RequireAccessPolicy('pages.dashboard')
  @Get('me/offline-bundle')
  getOfflineBundle(@Req() req: Request) {
    const userId = this.extractUserId(req);
    return this.usersService.getOfflineBundle(userId);
  }

  @RequireAccessPolicy('pages.dashboard')
  @Get('me')
  getMyProfile(@Req() req: Request) {
    const userId = this.extractUserId(req);
    return this.usersService.getMyProfile(userId);
  }

  @RequireAccessPolicy('pages.dashboard')
  @Patch('me')
  updateMyProfile(@Req() req: Request, @Body() updateUserDto: UpdateUserDto) {
    const userId = this.extractUserId(req);
    return this.usersService.updateMyProfile(userId, updateUserDto);
  }

  @RequireAccessPolicy('users.manageCertifications')
  @Get('certifications/expiring')
  listCertificationsExpiring(@Query('days') days?: string) {
    const parsedDays = days ? Number(days) : 30;
    return this.usersService.listCertificationsExpiring(
      Number.isFinite(parsedDays) ? parsedDays : 30,
    );
  }

  @RequireAccessPolicy('pages.orders')
  @Post('presence/ping')
  pingPresence(@Req() req: Request, @Body() dto: UserPresencePingDto) {
    const userId = this.extractUserId(req);
    return this.usersService.pingPresence(userId, dto);
  }

  @RequireAccessPolicy('users.viewLiveLocation')
  @Get('presence/live')
  listLivePresence() {
    return this.usersService.listLivePresence();
  }

  @RequireAccessPolicy('users.manage')
  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @RequireAccessPolicy('users.manage')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @RequireAccessPolicy('users.manage')
  @Patch(':id')
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    const actorUserId = this.extractUserId(req);
    return this.usersService.update(id, updateUserDto, actorUserId);
  }

  @RequireAccessPolicy('users.manage')
  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    const actorUserId = this.extractUserId(req);
    return this.usersService.remove(id, actorUserId);
  }

  @RequireAccessPolicy('users.manageCertifications')
  @Get(':id/certifications')
  listCertifications(@Param('id') userId: string) {
    return this.usersService.listCertifications(userId);
  }

  @RequireAccessPolicy('users.manageCertifications')
  @Post(':id/certifications')
  createCertification(
    @Req() req: Request,
    @Param('id') userId: string,
    @Body() dto: CreateUserCertificationDto,
  ) {
    const actorUserId = this.extractUserId(req);
    return this.usersService.createCertification(userId, dto, actorUserId);
  }

  @RequireAccessPolicy('users.manageCertifications')
  @Patch(':id/certifications/:certId')
  updateCertification(
    @Req() req: Request,
    @Param('id') userId: string,
    @Param('certId') certId: string,
    @Body() dto: UpdateUserCertificationDto,
  ) {
    const actorUserId = this.extractUserId(req);
    return this.usersService.updateCertification(
      userId,
      certId,
      dto,
      actorUserId,
    );
  }

  @RequireAccessPolicy('users.manageCertifications')
  @Delete(':id/certifications/:certId')
  removeCertification(
    @Req() req: Request,
    @Param('id') userId: string,
    @Param('certId') certId: string,
  ) {
    const actorUserId = this.extractUserId(req);
    return this.usersService.removeCertification(userId, certId, actorUserId);
  }

  @RequireAccessPolicy('users.manageSpecialties')
  @Get(':id/specialties')
  listSpecialties(@Param('id') userId: string) {
    return this.usersService.listSpecialties(userId);
  }

  @RequireAccessPolicy('users.manageSpecialties')
  @Post(':id/specialties')
  createSpecialty(
    @Req() req: Request,
    @Param('id') userId: string,
    @Body() dto: CreateUserSpecialtyDto,
  ) {
    const actorUserId = this.extractUserId(req);
    return this.usersService.createSpecialty(userId, dto, actorUserId);
  }

  @RequireAccessPolicy('users.manageSpecialties')
  @Patch(':id/specialties/:specialtyId')
  updateSpecialty(
    @Req() req: Request,
    @Param('id') userId: string,
    @Param('specialtyId') specialtyId: string,
    @Body() dto: UpdateUserSpecialtyDto,
  ) {
    const actorUserId = this.extractUserId(req);
    return this.usersService.updateSpecialty(
      userId,
      specialtyId,
      dto,
      actorUserId,
    );
  }

  @RequireAccessPolicy('users.manageSpecialties')
  @Delete(':id/specialties/:specialtyId')
  removeSpecialty(
    @Req() req: Request,
    @Param('id') userId: string,
    @Param('specialtyId') specialtyId: string,
  ) {
    const actorUserId = this.extractUserId(req);
    return this.usersService.removeSpecialty(userId, specialtyId, actorUserId);
  }

  private extractUserId(req: Request) {
    const authUser = req['user'] as any;
    return authUser?.sub as string;
  }
}
