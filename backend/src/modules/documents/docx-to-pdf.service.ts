import { ServiceUnavailableException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export type DocxToPdfStatus = {
  available: boolean;
  binaryPath?: string;
  reason?: string;
};

@Injectable()
export class DocxToPdfService {
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
      this.configService.get<string>('LIBREOFFICE_TIMEOUT_MS') || 60_000,
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
          timeout: Number.isFinite(timeoutMs) ? timeoutMs : 60_000,
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
      throw new ServiceUnavailableException(
        `Falha ao converter DOCX para PDF via LibreOffice: ${message}`,
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private resolveBinaryPath() {
    const configured =
      this.configService.get<string>('LIBREOFFICE_BIN') ||
      this.configService.get<string>('SOFFICE_BIN');
    const candidates = [
      configured,
      'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
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
