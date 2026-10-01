import { VisualDocumentKind } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { DocumentTemplateService } from './document-template.service';
import { DocxTemplateRendererService } from './docx-template-renderer.service';
import { InstitutionalDocumentService } from './institutional-document.service';
import { VisualDocumentService, VisualBlock } from './visual-document.service';

describe('VisualDocumentService', () => {
  const field = {
    id: 'builtin-client_name',
    key: 'client_name',
    label: 'Nome do Cliente',
    category: 'Cliente',
    kinds: [VisualDocumentKind.PROPOSAL],
    sourcePath: 'client.name',
    fixedValue: null,
  };
  const block: VisualBlock = {
    id: 'first',
    type: 'paragraph',
    fontSize: 12,
    bold: false,
    align: 'left',
    spaceAfter: 8,
    segments: [
      { type: 'text', text: 'Proposta para: ' },
      { type: 'field', fieldId: field.id },
    ],
  };
  const db = {
    visualDocumentField: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([field]),
    },
    visualDocumentTemplate: { findFirst: jest.fn() },
    visualDocumentTemplateVersion: { findUnique: jest.fn() },
    companySettings: { findFirst: jest.fn() },
    serviceReport: { findUnique: jest.fn() },
  };
  const service = new VisualDocumentService(
    db as unknown as DatabaseService,
    new DocumentTemplateService(),
    new InstitutionalDocumentService(),
  );

  beforeEach(() => jest.clearAllMocks());

  it('previews friendly fields with example data and no technical markers', async () => {
    const result = await service.preview({
      kind: VisualDocumentKind.PROPOSAL,
      blocks: [block],
    });
    expect(result.html).toContain('Proposta para: Cliente Exemplo');
    expect(result.html).not.toContain('{{');
    expect(result.isSample).toBe(true);
  });

  it('rejects hand typed template variables and unknown fields', async () => {
    await expect(
      service.preview({
        kind: VisualDocumentKind.PROPOSAL,
        blocks: [
          { ...block, segments: [{ type: 'text', text: '{{client.name}}' }] },
        ],
      }),
    ).rejects.toThrow('Use texto comum');
    db.visualDocumentField.findMany.mockResolvedValueOnce([]);
    await expect(
      service.preview({ kind: VisualDocumentKind.PROPOSAL, blocks: [block] }),
    ).rejects.toThrow('não está disponível');
  });

  it('uses the published version with real proposal data for DOCX and PDF', async () => {
    db.visualDocumentTemplate.findFirst.mockResolvedValue({
      id: 'template-1',
      name: 'Proposta visual',
      publishedVersion: 1,
    });
    db.visualDocumentTemplateVersion.findUnique.mockResolvedValue({
      versionNumber: 1,
      blocks: [block],
      fieldsMapping: [
        { fieldId: field.id, sourcePath: field.sourcePath, fixedValue: null },
      ],
    });
    const rendered = await service.renderPublished(
      VisualDocumentKind.PROPOSAL,
      {
        company: { companyName: 'MANITEC' },
        client: { companyName: 'Cliente Real', cnpj: '11.111.111/0001-11' },
        document: {
          code: 'PROP-1',
          totalValue: 250,
          issuedAt: new Date().toISOString(),
        },
      },
    );
    expect(rendered?.blocks[0].text).toBe('Proposta para: Cliente Real');
    expect(rendered?.templateVersion).toBe('v1');
    const docx = new DocxTemplateRendererService().renderVisual({
      title: 'Proposta visual',
      blocks: rendered!.blocks,
      templateKey: rendered!.templateKey,
      templateVersion: rendered!.templateVersion,
      fileName: 'proposta.docx',
    });
    expect(docx.buffer.toString('utf8')).toContain('Cliente Real');
    expect(
      service
        .pdf('Proposta visual', rendered!.blocks)
        .subarray(0, 8)
        .toString(),
    ).toContain('%PDF');
  });

  it('previews a real report checklist and only customer visible evidence', async () => {
    const checklist = {
      ...field,
      id: 'builtin-report_checklist',
      kinds: [VisualDocumentKind.SERVICE_REPORT],
      sourcePath: '__report_checklist__',
    };
    const evidence = {
      ...field,
      id: 'builtin-report_evidence',
      kinds: [VisualDocumentKind.SERVICE_REPORT],
      sourcePath: '__report_evidence__',
    };
    db.visualDocumentField.findMany.mockResolvedValueOnce([
      checklist,
      evidence,
    ]);
    db.companySettings.findFirst.mockResolvedValue({ companyName: 'MANITEC' });
    db.serviceReport.findUnique.mockResolvedValue({
      id: 'report-1',
      code: 'REL-1',
      title: 'Visita',
      client: { companyName: 'Cliente Real' },
      generator: { name: 'Gerador 1' },
      technician: { user: { name: 'Técnico 1' } },
      checklistItems: [{ label: 'Partida', result: 'APPROVED' }],
      evidences: [{ title: 'Foto da instalação', customerVisible: true }],
    });
    const preview = await service.preview({
      kind: VisualDocumentKind.SERVICE_REPORT,
      recordId: 'report-1',
      blocks: [
        {
          ...block,
          segments: [
            { type: 'field', fieldId: checklist.id },
            { type: 'text', text: '\n' },
            { type: 'field', fieldId: evidence.id },
          ],
        },
      ],
    });
    expect(preview.html).toContain('Partida: APPROVED');
    expect(preview.html).toContain('Foto da instalação');
    expect(db.serviceReport.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          evidences: { where: { deletedAt: null, customerVisible: true } },
        }),
      }),
    );
  });
});
