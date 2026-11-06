import { existsSync } from 'fs';
import { ConfigService } from '@nestjs/config';
import { DocxToPdfService } from './docx-to-pdf.service';

jest.mock('fs', () => ({ ...jest.requireActual('fs'), existsSync: jest.fn() }));
const exists = jest.mocked(existsSync);

describe('LibreOffice command resolution', () => {
  afterEach(() => jest.resetAllMocks());
  const converter = () =>
    new DocxToPdfService({
      get: (key: string) =>
        key === 'LIBREOFFICE_BIN'
          ? 'C:\\Office\\program\\soffice.exe'
          : undefined,
    } as ConfigService);
  it('prefers the console executable beside a configured Windows launcher', () => {
    exists.mockImplementation(
      (p) =>
        String(p) === 'C:\\Office\\program\\soffice.com' ||
        String(p) === 'C:\\Office\\program\\soffice.exe',
    );
    expect(converter().status()).toMatchObject({
      available: true,
      binaryPath: 'C:\\Office\\program\\soffice.com',
    });
  });
  it('preserves configured executables without a console companion', () => {
    exists.mockImplementation(
      (p) => String(p) === 'C:\\Office\\program\\soffice.exe',
    );
    expect(converter().status()).toMatchObject({
      available: true,
      binaryPath: 'C:\\Office\\program\\soffice.exe',
    });
  });
  it('reports unavailable rather than claiming a textual replacement is the template', () => {
    exists.mockReturnValue(false);
    expect(converter().status()).toMatchObject({ available: false });
  });
});
