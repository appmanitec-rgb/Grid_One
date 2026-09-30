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
import { AuthGuard } from '../auth/auth.guard';
import {
  TeamChannelDto,
  TeamCommentDto,
  TeamMessageDto,
  TeamPostDto,
} from './dto/team.dto';
import { TeamService } from './team.service';

@Controller('team')
@UseGuards(AuthGuard)
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  private userId(req: Request) {
    return (req['user'] as { sub?: string })?.sub || '';
  }

  @Get('feed')
  feed(
    @Req() req: Request,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.teamService.feed(this.userId(req), cursor, limit);
  }

  @Post('feed')
  createPost(@Req() req: Request, @Body() dto: TeamPostDto) {
    return this.teamService.createPost(this.userId(req), dto.body);
  }

  @Patch('feed/:id')
  updatePost(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: TeamPostDto,
  ) {
    return this.teamService.updatePost(this.userId(req), id, dto.body);
  }

  @Delete('feed/:id')
  deletePost(@Req() req: Request, @Param('id') id: string) {
    return this.teamService.deletePost(this.userId(req), id);
  }

  @Post('feed/:id/pin')
  togglePin(@Req() req: Request, @Param('id') id: string) {
    return this.teamService.togglePin(this.userId(req), id);
  }

  @Post('feed/:id/react')
  toggleReaction(@Req() req: Request, @Param('id') id: string) {
    return this.teamService.toggleReaction(this.userId(req), id);
  }

  @Get('feed/:id/comments')
  comments(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.teamService.comments(this.userId(req), id, cursor, limit);
  }

  @Post('feed/:id/comments')
  createComment(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: TeamCommentDto,
  ) {
    return this.teamService.createComment(this.userId(req), id, dto.body);
  }

  @Delete('comments/:id')
  deleteComment(@Req() req: Request, @Param('id') id: string) {
    return this.teamService.deleteComment(this.userId(req), id);
  }

  @Get('channels')
  channels(@Req() req: Request) {
    return this.teamService.channels(this.userId(req));
  }

  @Post('channels')
  createChannel(@Req() req: Request, @Body() dto: TeamChannelDto) {
    return this.teamService.createChannel(
      this.userId(req),
      dto.name,
      dto.description,
    );
  }

  @Get('channels/:id/messages')
  messages(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    return this.teamService.messages(this.userId(req), id, before, limit);
  }

  @Post('channels/:id/messages')
  sendMessage(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: TeamMessageDto,
  ) {
    return this.teamService.sendMessage(this.userId(req), id, dto.body);
  }

  @Post('channels/:id/read')
  markRead(@Req() req: Request, @Param('id') id: string) {
    return this.teamService.markRead(this.userId(req), id);
  }

  @Patch('messages/:id')
  updateMessage(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: TeamMessageDto,
  ) {
    return this.teamService.updateMessage(this.userId(req), id, dto.body);
  }

  @Delete('messages/:id')
  deleteMessage(@Req() req: Request, @Param('id') id: string) {
    return this.teamService.deleteMessage(this.userId(req), id);
  }
}
