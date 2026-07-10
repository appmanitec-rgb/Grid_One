import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { AuthGuard } from '../auth/auth.guard';
import { DocumentsService } from './documents.service';

@Controller('documents')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('pages.dashboard')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get('hub')
  getHub(@Req() req: Request) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    return this.documentsService.getHub(userId || '');
  }

  @Get('proposals/:id')
  getProposalDocument(@Req() req: Request, @Param('id') id: string) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    return this.documentsService.getProposalDocument(id, userId || '');
  }

  @Get('contracts/:id')
  getContractDocument(@Req() req: Request, @Param('id') id: string) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    return this.documentsService.getContractDocument(id, userId || '');
  }

  @Get('orders/:id')
  getOrderDocument(@Req() req: Request, @Param('id') id: string) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    return this.documentsService.getOrderDocument(id, userId || '');
  }
}
