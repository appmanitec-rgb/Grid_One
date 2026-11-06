import { execFile } from 'child_process';
import { existsSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { DocxToPdfService } from './docx-to-pdf.service';

jest.mock('child_process', () => ({ execFile: jest.fn() }));
jest.mock('fs', () => ({ ...jest.requireActual('fs'), existsSync: jest.fn() }));
const execute = jest.mocked(execFile);

function converted(
  args: string[],
  content = '%PDF-1.4\nDocumento de teste\n%%EOF',
) {
  const destination = args[args.indexOf('--outdir') + 1];
  writeFileSync(
    join(destination, basename(args.at(-1)!, '.docx') + '.pdf'),
    content,
  );
}

describe('Conversão reutilizável do mesmo documento', () => {
  let converter: DocxToPdfService;
  beforeEach(() => {
    jest.mocked(existsSync).mockReturnValue(true);
    execute.mockImplementation(((
      _binary: string,
      args: string[],
      _options: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      converted(args);
      callback(null, 'converted', '');
      return {};
    }) as unknown as typeof execFile);
    converter = new DocxToPdfService({
      get: () => undefined,
    } as unknown as ConfigService);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetAllMocks();
  });

  it('reutiliza bytes válidos e protege a cópia guardada contra alteração pelo consumidor', async () => {
    const input = {
      buffer: Buffer.from('Word aprovado A'),
      fileName: 'proposta.docx',
    };
    const first = await converter.convertDocxToPdf(input);
    first.fill(0);
    const second = await converter.convertDocxToPdf({
      ...input,
      fileName: 'copia-word.docx',
    });
    expect(second.subarray(0, 4).toString()).toBe('%PDF');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('agrupa solicitações simultâneas sem iniciar outro processo de conversão', async () => {
    const input = {
      buffer: Buffer.from('Word aprovado B'),
      fileName: 'proposta.docx',
    };
    const [a, b] = await Promise.all([
      converter.convertDocxToPdf(input),
      converter.convertDocxToPdf(input),
    ]);
    expect(a.equals(b)).toBe(true);
    expect(a).not.toBe(b);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('converte novamente quando os bytes do Word mudam', async () => {
    await converter.convertDocxToPdf({
      buffer: Buffer.from('Word A'),
      fileName: 'proposta.docx',
    });
    await converter.convertDocxToPdf({
      buffer: Buffer.from('Word B'),
      fileName: 'proposta.docx',
    });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('não guarda saída inválida nem expõe o comando interno e permite nova tentativa', async () => {
    execute.mockImplementationOnce(((
      _binary: string,
      args: string[],
      _options: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      converted(args, 'invalid');
      callback(null, '', '');
      return {};
    }) as unknown as typeof execFile);
    const input = { buffer: Buffer.from('Word C'), fileName: 'proposta.docx' };
    await expect(converter.convertDocxToPdf(input)).rejects.toThrow(
      'Não foi possível concluir a conversão',
    );
    const result = await converter.convertDocxToPdf(input);
    expect(result.subarray(0, 4).toString()).toBe('%PDF');
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
