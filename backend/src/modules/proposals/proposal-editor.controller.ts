import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { ProposalEditorService } from './proposal-editor.service';
import {
  ProposalConferenceDto,
  SaveProposalEditingDraftDto,
} from './proposal-editor.dto';
function actor(req: Request) {
  return (req['user'] as { sub: string }).sub;
}
@Controller('proposals/editor')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('proposals.view')
export class ProposalEditorController {
  constructor(private readonly service: ProposalEditorService) {}
  @Get('context') context(@Req() req: Request) {
    return this.service.context(actor(req));
  }
  @Post('conference') review(
    @Req() req: Request,
    @Body() dto: ProposalConferenceDto,
  ) {
    return this.service.review(dto.data, actor(req), dto.proposalId);
  }
  @Get('drafts') list(@Req() req: Request) {
    return this.service.list(actor(req));
  }
  @Get('drafts/:draftId') get(
    @Req() req: Request,
    @Param('draftId', ParseUUIDPipe) id: string,
  ) {
    return this.service.get(id, actor(req));
  }
  @Put('drafts/:draftId') save(
    @Req() req: Request,
    @Param('draftId', ParseUUIDPipe) id: string,
    @Body() dto: SaveProposalEditingDraftDto,
  ) {
    return this.service.save(id, dto, actor(req));
  }
}
