import {
  ServiceUnavailableException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { promisify } from 'util';
import { createHash } from 'crypto';

const execFileAsync = promisify(execFile);

export type DocxToPdfStatus = {
  available: boolean;
  binaryPath?: string;
  reason?: string;
};

@Injectable()
export class DocxToPdfService {
  private readonly logger = new Logger(DocxToPdfService.name);
  private readonly recent = new Map<string, Buffer>();
  private readonly converting = new Map<string, Promise<Buffer>>();
  constructor(private readonly configService: ConfigService) {}

  status(): DocxToPdfStatus {
    const binaryPath = this.resolveBinaryPath();

    if (!binaryPath) {
      return {
        available: false,
        reason:
          'LibreOffice/soffice nao encontrado. Defina LIBREOFFICE_BIN ou instale LibreOffice no servidor.',
      };
    }

    return {
      available: true,
      binaryPath: this.maskUserPath(binaryPath),
    };
  }

  async convertDocxToPdf(input: {
    buffer: Buffer;
    fileName: string;
  }): Promise<Buffer> {
    const source = Buffer.from(input.buffer);
    const key = createHash('sha256').update(source).digest('hex');
    const cached = this.recent.get(key);
    if (cached) {
      this.recent.delete(key);
      this.recent.set(key, cached);
      return Buffer.from(cached);
    }
    const pending = this.converting.get(key);
    if (pending) return Buffer.from(await pending);
    const task = this.convertFresh({ ...input, buffer: source });
    this.converting.set(key, task);
    try {
      const pdf = await task;
      // At most 16 MiB; only valid conversions are reusable, never a failed attempt.
      if (pdf.length <= 2 * 1024 * 1024) {
        this.recent.set(key, Buffer.from(pdf));
        if (this.recent.size > 8) {
          const oldest = this.recent.keys().next();
          if (!oldest.done) this.recent.delete(oldest.value);
        }
      }
      return Buffer.from(pdf);
    } finally {
      this.converting.delete(key);
    }
  }

  private async convertFresh(input: {
    buffer: Buffer;
    fileName: string;
  }): Promise<Buffer> {
    const binaryPath = this.resolveBinaryPath();

    if (!binaryPath) {
      throw new ServiceUnavailableException(
        'Conversor LibreOffice indisponivel para gerar PDF a partir do DOCX.',
      );
    }

    const tempDir = await mkdtemp(join(tmpdir(), 'manitec-docx-pdf-'));
    const profileDir = join(tempDir, 'lo-profile');
    const baseName = this.safeBaseName(input.fileName);
    const docxPath = join(tempDir, `${baseName}.docx`);
    const pdfPath = join(tempDir, `${baseName}.pdf`);
    const timeoutMs = Number(
      this.configService.get<string>('LIBREOFFICE_TIMEOUT_MS') || 75_000,
    );

    try {
      await mkdir(profileDir, { recursive: true });
      await writeFile(docxPath, input.buffer);
      await execFileAsync(
        binaryPath,
        [
          '--headless',
          '--nologo',
          '--nodefault',
          '--nofirststartwizard',
          `-env:UserInstallation=${this.fileUri(profileDir)}`,
          '--convert-to',
          'pdf:writer_pdf_Export',
          '--outdir',
          tempDir,
          docxPath,
        ],
        {
          timeout:
            Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 75_000,
          cwd: dirname(binaryPath),
          windowsHide: true,
          maxBuffer: 1024 * 1024,
        },
      );

      const pdf = await readFile(pdfPath);
      if (pdf.subarray(0, 4).toString('ascii') !== '%PDF') {
        throw new Error('Arquivo convertido nao possui assinatura PDF.');
      }

      return pdf;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'erro desconhecido';
      this.logger.warn(`Conversão DOCX/PDF não concluída: ${message}`);
      throw new ServiceUnavailableException({
        code: 'DOCX_PDF_CONVERSION_FAILED',
        message:
          'Não foi possível concluir a conversão do Word para PDF. Tente novamente ou baixe o DOCX. Os documentos aprovados permanecem preservados.',
      });
    } finally {
      try {
        await rm(tempDir, {
          recursive: true,
          force: true,
          maxRetries: 8,
          retryDelay: 250,
        });
      } catch {
        // O LibreOffice pode manter o DOCX aberto após o timeout no Windows.
        // A limpeza tardia não deve substituir o erro de conversão.
        setTimeout(() => {
          void rm(tempDir, {
            recursive: true,
            force: true,
            maxRetries: 20,
            retryDelay: 500,
          }).catch(() => undefined);
        }, 10_000).unref();
      }
    }
  }

  private resolveBinaryPath() {
    const configured =
      this.configService.get<string>('LIBREOFFICE_BIN') ||
      this.configService.get<string>('SOFFICE_BIN');
    const candidates = [
      configured?.replace(/soffice\.exe$/i, 'soffice.com'),
      configured,
      'C:\\Program Files\\LibreOffice\\program\\soffice.com',
      'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
      'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.com',
      'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
      '/usr/bin/libreoffice',
      '/usr/bin/soffice',
      '/opt/libreoffice/program/soffice',
    ].filter((candidate): candidate is string => Boolean(candidate));

    return candidates.find((candidate) => existsSync(candidate));
  }

  private safeBaseName(fileName: string) {
    return (
      fileName
        .replace(/\.docx$/i, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'documento'
    );
  }

  private fileUri(path: string) {
    return `file:///${encodeURI(path.replace(/\\/g, '/'))}`;
  }

  private maskUserPath(path: string) {
    return path.replace(
      /^([A-Z]:\/Users\/|[A-Z]:\\Users\\)[^/\\]+/i,
      '$1<user>',
    );
  }
}
