import { ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { DatabaseService } from '../../database/database.service';
import { CommercialScopeGuard } from '../auth/rules/commercial-scope.guard';
import { DocumentsController } from './documents.controller';

describe('Commercial scope on document routes', () => {
  it('protects every proposal document route with the existing commercial guard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, DocumentsController)).toContain(
      CommercialScopeGuard,
    );
  });

  it.each([
    '',
    '/draft-preview',
    '/download-pdf',
    '/download-docx',
    '/download-document-pdf',
    '/download-approved-word-pdf',
    '/preview-html',
    '/generate-document',
  ])(
    'rejects another seller record at /documents/proposals/:id%s',
    async (suffix) => {
      const db = {
        proposal: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ type: 'PARTS_AND_SERVICES' }),
          findFirst: jest.fn().mockResolvedValue(null),
        },
      };
      const request = {
        user: {
          sub: 'seller-a',
          role: 'SALES',
          accessRules: { commercial: { partsServices: true } },
        },
        path: '/documents/proposals/proposal-b' + suffix,
        params: { id: 'proposal-b' },
      };
      const context = {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;
      await expect(
        new CommercialScopeGuard(db as unknown as DatabaseService).canActivate(
          context,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(db.proposal.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'proposal-b',
            AND: [expect.objectContaining({ OR: expect.any(Array) })],
          }),
        }),
      );
    },
  );
});
