import { VisualDocumentKind } from '@prisma/client';
import { readFileSync } from 'fs';
import { DatabaseService } from '../../database/database.service';
import { DocumentTemplateService } from './document-template.service';
import { DocxTemplateRendererService } from './docx-template-renderer.service';
import { InstitutionalDocumentService } from './institutional-document.service';
import { VisualDocumentService } from './visual-document.service';

describe('Word editável do Studio', () => {
  const templates = new DocumentTemplateService();
  const renderer = new DocxTemplateRendererService();
  const db = {
    visualDocumentField: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as DatabaseService;
  const editor = new VisualDocumentService(
    db,
    templates,
    new InstitutionalDocumentService(),
    renderer,
  );

  it.each([
    [VisualDocumentKind.PROPOSAL, 'proposal'],
    [VisualDocumentKind.CONTRACT, 'contract'],
    [VisualDocumentKind.SERVICE_REPORT, 'service-report'],
  ] as const)(
    'preserva o modelo Word %s ao baixar, editar e preencher',
    async (kind, folder) => {
      const original = templates.loadInstitutional(folder);
      const originalBuffer = readFileSync(original.docxTemplatePath!);
      const editable = await editor.baseWord(kind);
      const inspection = renderer.inspectFriendlyWord(editable);
      expect(inspection.technicalMarkers).toBe(false);
      expect(inspection.labels.length).toBeGreaterThan(0);
      expect(inspection.labels).toContain('Nome do Cliente');
      const fields = await editor.wordFields(kind);
      const filled = renderer.renderFriendlyWord(
        editable,
        original.sampleData,
        inspection.labels.map(
          (label) => fields.find((field) => field.label === label)!,
        ),
      );
      expect(filled.subarray(0, 2).toString()).toBe('PK');
      expect(renderer.inspectFriendlyWord(filled)).toEqual({
        labels: [],
        technicalMarkers: false,
      });
      if (kind === VisualDocumentKind.PROPOSAL) {
        expect(filled.toString('utf8')).toContain('Kit de filtros para GMG');
        expect(filled.toString('utf8')).toContain('Manutencao preventiva');
      }
      if (kind === VisualDocumentKind.CONTRACT)
        expect(filled.toString('utf8')).toContain('GMG Principal');
      if (originalBuffer.includes(Buffer.from('word/media/')))
        expect(filled.includes(Buffer.from('word/media/'))).toBe(true);
    },
  );

  it('adiciona o endereço de validação ao relatório Word publicado', async () => {
    const editable = await editor.baseWord(VisualDocumentKind.SERVICE_REPORT);
    const fields = await editor.wordFields(VisualDocumentKind.SERVICE_REPORT);
    const labels = renderer.inspectFriendlyWord(editable).labels;
    const filled = renderer.renderFriendlyWord(
      editable,
      templates.loadInstitutional('service-report').sampleData,
      labels.map((label) => fields.find((field) => field.label === label)!),
      'https://manitec.local/validar/123',
    );
    expect(filled.toString('utf8')).toContain('Validação do relatório');
    expect(filled.toString('utf8')).toContain(
      'https://manitec.local/validar/123',
    );
  });

  it('salva o DOCX e usa a versão publicada na geração seguinte', async () => {
    const editable = await editor.baseWord(VisualDocumentKind.PROPOSAL);
    const fields = await editor.wordFields(VisualDocumentKind.PROPOSAL);
    const mappings = renderer
      .inspectFriendlyWord(editable)
      .labels.map((label) => fields.find((field) => field.label === label)!);
    const create = jest.fn().mockResolvedValue({ id: 'modelo-word' });
    const database = {
      visualDocumentField: { findMany: jest.fn().mockResolvedValue([]) },
      visualDocumentTemplate: {
        create,
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'modelo-word', versions: [] }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'modelo-word',
          name: 'Modelo Word',
          publishedVersion: 1,
        }),
      },
      visualDocumentTemplateVersion: {
        findUnique: jest.fn().mockResolvedValue({
          format: 'WORD',
          versionNumber: 1,
          wordTemplate: editable,
          wordFieldMap: mappings,
          fieldsMapping: [],
        }),
      },
    } as unknown as DatabaseService;
    const savedEditor = new VisualDocumentService(
      database,
      templates,
      new InstitutionalDocumentService(),
      renderer,
    );
    await savedEditor.createWordTemplate({
      kind: VisualDocumentKind.PROPOSAL,
      name: 'Modelo Word',
      file: editable,
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          versions: {
            create: expect.objectContaining({
              format: 'WORD',
              wordTemplate: editable,
            }),
          },
        }),
      }),
    );
    const generated = await savedEditor.renderPublishedWord(
      VisualDocumentKind.PROPOSAL,
      {
        company: { companyName: 'MANITEC' },
        client: { companyName: 'Cliente Real' },
        document: { id: 'prop-1', code: 'PROP-1', totalValue: 100 },
        items: [],
      },
    );
    expect(generated?.templateVersion).toBe('v1');
    expect(generated?.buffer.toString('utf8')).toContain('Cliente Real');
    expect(renderer.inspectFriendlyWord(generated!.buffer).labels).toEqual([]);
  });
});
