import { BadRequestException } from '@nestjs/common';
import {
  buildSantanderCollectionRemittance,
  makeSantanderOurNumber,
  parseSantanderCollectionReturn,
} from './santander-cnab240';

const agreement = {
  transmissionCode: '123456789012345',
  beneficiaryName: 'Manitec Ltda',
  beneficiaryDocument: '12345678000195',
  agency: '1234',
  agencyDigit: '5',
  accountNumber: '123456789',
  accountDigit: '0',
  walletCode: '1',
  registrationForm: '1',
  documentType: '2',
};

function line(type: string, segment?: string) {
  const chars = Array<string>(240).fill(' ');
  const set = (start: number, value: string) =>
    value.split('').forEach((char, index) => {
      chars[start - 1 + index] = char;
    });
  set(1, '033');
  set(4, type === '0' ? '0000' : type === '9' ? '9999' : '0001');
  set(8, type);
  if (segment) set(14, segment);
  return { chars, set, value: () => chars.join('') };
}

describe('Santander cobrança CNAB 240', () => {
  it('calcula o dígito do Nosso Número conforme exemplo do banco', () => {
    expect(makeSantanderOurNumber(3147578)).toBe('0000031475787');
    expect(makeSantanderOurNumber(4870184)).toBe('0000048701840');
  });

  it('gera remessa P/Q com posições, totais e 240 bytes por registro', () => {
    const bytes = buildSantanderCollectionRemittance({
      agreement,
      sequence: 7,
      generatedAt: new Date('2026-10-01T00:00:00Z'),
      titles: [
        {
          id: 'aabbccdd-0000-0000-0000-000000000001',
          documentNumber: 'NF123',
          ourNumber: makeSantanderOurNumber(1),
          amount: 1234.56,
          dueDate: new Date('2026-10-20T00:00:00Z'),
          speciesCode: '04',
          payerName: 'Cliente São Paulo',
          payerDocument: '11222333000144',
          street: 'Rua Um, 10',
          district: 'Centro',
          zipCode: '01001000',
          city: 'São Paulo',
          state: 'SP',
        },
      ],
    });
    const rows = bytes.toString('latin1').split('\r\n').filter(Boolean);
    expect(rows).toHaveLength(6);
    expect(rows.every((row) => row.length === 240)).toBe(true);
    expect(rows.map((row) => row[7])).toEqual(['0', '1', '3', '3', '5', '9']);
    expect(rows[0].slice(142, 143)).toBe('1');
    expect(rows[2].slice(13, 14)).toBe('P');
    expect(rows[2].slice(44, 57)).toBe(makeSantanderOurNumber(1));
    expect(rows[2].slice(85, 100)).toBe('000000000123456');
    expect(rows[3].slice(13, 14)).toBe('Q');
    expect(rows[3].slice(33, 73).trim()).toBe('CLIENTE SAO PAULO');
    expect(rows[4].slice(17, 23)).toBe('000004');
    expect(rows[5].slice(23, 29)).toBe('000006');
  });

  it('lê T/U de retorno e rejeita conta e quantidade divergentes', () => {
    const header = line('0');
    header.set(18, '012345678000195');
    header.set(33, agreement.agency);
    header.set(37, agreement.agencyDigit);
    header.set(38, agreement.accountNumber);
    header.set(47, agreement.accountDigit);
    header.set(143, '2');
    const lot = line('1');
    const t = line('3', 'T');
    t.set(16, '06');
    t.set(41, makeSantanderOurNumber(1));
    t.set(55, 'NF123'.padEnd(15));
    t.set(78, '000000000123456');
    const u = line('3', 'U');
    u.set(16, '06');
    u.set(78, '000000000123456');
    u.set(93, '000000000123456');
    u.set(138, '20102026');
    const lotTrailer = line('5');
    const trailer = line('9');
    trailer.set(24, '000006');
    const file = (rows: string[]) =>
      Buffer.from(`${rows.join('\r\n')}\r\n`, 'latin1');
    const rows = [
      header.value(),
      lot.value(),
      t.value(),
      u.value(),
      lotTrailer.value(),
      trailer.value(),
    ];
    expect(
      parseSantanderCollectionReturn(
        file(rows),
        agreement.beneficiaryDocument,
        agreement,
      ),
    ).toEqual([
      expect.objectContaining({
        movementCode: '06',
        documentNumber: 'NF123',
        paidAmount: 1234.56,
        netCreditAmount: 1234.56,
      }),
    ]);
    expect(() =>
      parseSantanderCollectionReturn(
        file(rows),
        agreement.beneficiaryDocument,
        { ...agreement, accountNumber: '000000000' },
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      parseSantanderCollectionReturn(
        file(rows.slice(0, -1)),
        agreement.beneficiaryDocument,
        agreement,
      ),
    ).toThrow(BadRequestException);
    const invalidPaid = [...rows];
    invalidPaid[3] = `${invalidPaid[3].slice(0, 77)}NOT-A-NUMBER!!!${invalidPaid[3].slice(92)}`;
    expect(() =>
      parseSantanderCollectionReturn(
        file(invalidPaid),
        agreement.beneficiaryDocument,
        agreement,
      ),
    ).toThrow(BadRequestException);
  });
});
