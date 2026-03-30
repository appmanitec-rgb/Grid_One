import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { AuthGuard } from '../auth/auth.guard';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { UpdateProposalDto } from './dto/update-proposal.dto';
import { ProposalsService } from './proposals.service';

@Controller('proposals')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('pages.proposals')
export class ProposalsController {
  constructor(private readonly proposalsService: ProposalsService) {}

  @UseGuards(AuthGuard)
  @Post()
  create(@Body() createProposalDto: CreateProposalDto) {
    return this.proposalsService.create(createProposalDto);
  }

  @UseGuards(AuthGuard)
  @Post(':id/submit-board')
  async submitBoard(@Param('id') id: string, @Req() req: Request) {
    try {
      const userId = (req['user'] as any)?.sub as string | undefined;
      return await this.proposalsService.submitForBoardReview(id, userId);
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('proposals.approveBudget')
  @Post(':id/board-approve')
  async boardApprove(@Param('id') id: string, @Req() req: Request) {
    try {
      const userId = (req['user'] as any)?.sub as string | undefined;
      return await this.proposalsService.boardApprove(id, userId);
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('proposals.approveBudget')
  @Post(':id/board-reject')
  async boardReject(
    @Param('id') id: string,
    @Req() req: Request,
    @Body() body: { note?: string },
  ) {
    try {
      const userId = (req['user'] as any)?.sub as string | undefined;
      return await this.proposalsService.boardReject(id, userId, body?.note);
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  @UseGuards(AuthGuard)
  @Post(':id/client-approve')
  async clientApprove(@Param('id') id: string, @Req() req: Request) {
    try {
      const userId = (req['user'] as any)?.sub as string | undefined;
      return await this.proposalsService.clientApprove(id, userId);
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  @UseGuards(AuthGuard)
  @Post(':id/client-reject')
  async clientReject(
    @Param('id') id: string,
    @Req() req: Request,
    @Body() body: { note?: string },
  ) {
    try {
      const userId = (req['user'] as any)?.sub as string | undefined;
      return await this.proposalsService.clientReject(id, userId, body?.note);
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('proposals.requestDiscountAboveLimit')
  @Post(':id/request-discount')
  async requestDiscount(
    @Param('id') id: string,
    @Req() req: Request,
    @Body() body: { discountPercent: number; reason?: string },
  ) {
    try {
      const userId = (req['user'] as any)?.sub as string | undefined;
      return await this.proposalsService.requestDiscount(
        id,
        Number(body?.discountPercent || 0),
        userId,
        body?.reason,
      );
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  @UseGuards(AuthGuard)
  @Post(':id/approve')
  async approve(@Param('id') id: string) {
    try {
      return await this.proposalsService.approve(id);
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  @UseGuards(AuthGuard)
  @Post(':id/revise')
  async revise(@Param('id') id: string, @Req() req: Request) {
    try {
      const userId = (req['user'] as any)?.sub as string | undefined;
      return await this.proposalsService.revise(id, userId);
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  @UseGuards(AuthGuard)
  @Post(':id/convert-contract')
  async convertToContract(@Param('id') id: string, @Req() req: Request) {
    try {
      const userId = (req['user'] as any)?.sub as string | undefined;
      return await this.proposalsService.convertWonProposalToContract(
        id,
        userId,
      );
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('proposals.approveBudget')
  @Get('board/pending')
  async boardPending(@Req() req: Request) {
    const userId = (req['user'] as any)?.sub as string;
    return this.proposalsService.getBoardPending(userId);
  }

  @UseGuards(AuthGuard)
  @Get('my/updates')
  async myUpdates(@Req() req: Request) {
    const userId = (req['user'] as any)?.sub as string;
    return this.proposalsService.getMyUpdates(userId);
  }

  @Get()
  findAll() {
    return this.proposalsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.proposalsService.findOne(id);
  }

  @UseGuards(AuthGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Req() req: Request,
    @Body() updateProposalDto: UpdateProposalDto,
  ) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    return this.proposalsService.update(id, updateProposalDto, userId);
  }

  @UseGuards(AuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.proposalsService.remove(id);
  }
}
