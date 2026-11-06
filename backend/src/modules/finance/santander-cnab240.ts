import { BadRequestException } from '@nestjs/common';

export type SantanderAgreementData = {
  transmissionCode: string;
  beneficiaryName: string;
  beneficiaryDocument: string;
  agency: string;
  agencyDigit: string;
  accountNumber: string;
  accountDigit: string;
  walletCode: string;
  registrationForm: string;
  documentType: string;
};

export type SantanderRemittanceTitle = {
  id: string;
  documentNumber: string;
  ourNumber: string;
  amount: number;
  dueDate: Date;
  speciesCode: '02' | '04';
  payerName: string;
  payerDocument: string;
  street: string;
  district: string;
  zipCode: string;
  city: string;
  state: string;
};

export type SantanderReturnEvent = {
  lineNumber: number;
  movementCode: string;
  ourNumber: string;
  documentNumber: string;
  companyReference: string;
  nominalAmount: number;
  paidAmount: number;
  netCreditAmount: number;
  eventDate: Date | null;
  reasonCodes: string;
};

function digits(value: string) {
  return value.replace(/\D/g, '');
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .toUpperCase();
}

function record() {
  return Array<string>(240).fill(' ');
}

function put(
  line: string[],
  start: number,
  end: number,
  value: string | number,
  numeric = false,
) {
  const width = end - start + 1;
  const raw = String(value);
  const prepared = numeric ? digits(raw) : normalizeText(raw);
  if (numeric && (!prepared || prepared.length > width))
    throw new BadRequestException(
      `Campo numérico CNAB inválido nas posições ${start}-${end}.`,
    );
  const filled = numeric
    ? prepared.padStart(width, '0')
    : prepared.slice(0, width).padEnd(width, ' ');
  for (let index = 0; index < width; index++)
    line[start - 1 + index] = filled[index];
}

function ymd(date: Date) {
  if (Number.isNaN(date.getTime()))
    throw new BadRequestException('Data inválida na remessa.');
  return `${String(date.getUTCDate()).padStart(2, '0')}${String(date.getUTCMonth() + 1).padStart(2, '0')}${date.getUTCFullYear()}`;
}

function cents(value: number) {
  if (
    !Number.isFinite(value) ||
    value <= 0 ||
    Math.round(value * 100) > 999_999_999_999_999
  )
    throw new BadRequestException('Valor do boleto inválido para o CNAB 240.');
  return String(Math.round(value * 100));
}

export function makeSantanderOurNumber(sequence: number) {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999_999_999_999)
    throw new BadRequestException('Sequência de Nosso Número inválida.');
  const base = String(sequence).padStart(12, '0');
  let total = 0;
  for (
    let i = base.length - 1, weight = 2;
    i >= 0;
    i--, weight = weight === 9 ? 2 : weight + 1
  )
    total += Number(base[i]) * weight;
  const remainder = total % 11;
  const digit =
    remainder === 0 || remainder === 1
      ? 0
      : remainder === 10
        ? 1
        : 11 - remainder;
  return `${base}${digit}`;
}

export function buildSantanderCollectionRemittance(input: {
  agreement: SantanderAgreementData;
  sequence: number;
  generatedAt: Date;
  titles: SantanderRemittanceTitle[];
}) {
  const { agreement, titles } = input;
  const beneficiaryDocument = digits(agreement.beneficiaryDocument);
  if (
    ![11, 14].includes(beneficiaryDocument.length) ||
    !/^\d{15}$/.test(agreement.transmissionCode) ||
    !/^\d{4}$/.test(agreement.agency) ||
    !/^\d$/.test(agreement.agencyDigit) ||
    !/^\d{9}$/.test(agreement.accountNumber) ||
    !/^\d$/.test(agreement.accountDigit) ||
    !/^[135]$/.test(agreement.walletCode) ||
    agreement.registrationForm !== '1' ||
    !/^[12]$/.test(agreement.documentType)
  )
    throw new BadRequestException(
      'Convênio Santander incompleto ou incompatível com cobrança registrada CNAB 240.',
    );
  if (
    !titles.length ||
    titles.length > 9999 ||
    !Number.isInteger(input.sequence) ||
    input.sequence < 1 ||
    input.sequence > 999999
  )
    throw new BadRequestException(
      'Lote de remessa vazio ou sequência inválida.',
    );
  const taxType = beneficiaryDocument.length === 14 ? '2' : '1';
  const fileHeader = record();
  put(fileHeader, 1, 3, '033', true);
  put(fileHeader, 4, 7, '0', true);
  put(fileHeader, 8, 8, '0', true);
  put(fileHeader, 17, 17, taxType, true);
  put(fileHeader, 18, 32, beneficiaryDocument, true);
  put(fileHeader, 33, 47, agreement.transmissionCode, true);
  put(fileHeader, 73, 102, agreement.beneficiaryName);
  put(fileHeader, 103, 132, 'BANCO SANTANDER');
  put(fileHeader, 143, 143, '1', true);
  put(fileHeader, 144, 151, ymd(input.generatedAt), true);
  put(fileHeader, 158, 163, input.sequence, true);
  put(fileHeader, 164, 166, '040', true);

  const lotHeader = record();
  put(lotHeader, 1, 3, '033', true);
  put(lotHeader, 4, 7, '1', true);
  put(lotHeader, 8, 8, '1', true);
  put(lotHeader, 9, 9, 'R');
  put(lotHeader, 10, 11, '01', true);
  put(lotHeader, 14, 16, '030', true);
  put(lotHeader, 18, 18, taxType, true);
  put(lotHeader, 19, 33, beneficiaryDocument, true);
  put(lotHeader, 54, 68, agreement.transmissionCode, true);
  put(lotHeader, 74, 103, agreement.beneficiaryName);
  put(lotHeader, 184, 191, input.sequence, true);
  put(lotHeader, 192, 199, ymd(input.generatedAt), true);

  const lines = [fileHeader.join(''), lotHeader.join('')];
  let detailSequence = 0;
  for (const title of titles) {
    const payerDocument = digits(title.payerDocument);
    const cep = digits(title.zipCode);
    if (
      ![11, 14].includes(payerDocument.length) ||
      cep.length !== 8 ||
      !/^[A-Z]{2}$/.test(title.state.toUpperCase()) ||
      !/^\d{13}$/.test(title.ourNumber) ||
      !/^[A-Z0-9-]{1,15}$/i.test(title.documentNumber)
    )
      throw new BadRequestException(
        `Dados incompletos para o boleto ${title.documentNumber}.`,
      );
    const amount = cents(title.amount);
    const p = record();
    put(p, 1, 3, '033', true);
    put(p, 4, 7, '1', true);
    put(p, 8, 8, '3', true);
    put(p, 9, 13, ++detailSequence, true);
    put(p, 14, 14, 'P');
    put(p, 16, 17, '01', true);
    put(p, 18, 21, agreement.agency, true);
    put(p, 22, 22, agreement.agencyDigit, true);
    put(p, 23, 31, agreement.accountNumber, true);
    put(p, 32, 32, agreement.accountDigit, true);
    put(p, 33, 41, '0', true);
    put(p, 42, 42, '0', true);
    put(p, 45, 57, title.ourNumber, true);
    put(p, 58, 58, agreement.walletCode);
    put(p, 59, 59, agreement.registrationForm, true);
    put(p, 60, 60, agreement.documentType, true);
    put(p, 63, 77, title.documentNumber);
    put(p, 78, 85, ymd(title.dueDate), true);
    put(p, 86, 100, amount, true);
    put(p, 101, 104, '0', true);
    put(p, 105, 105, '0', true);
    put(p, 107, 108, title.speciesCode, true);
    put(p, 109, 109, 'N');
    put(p, 110, 117, ymd(input.generatedAt), true);
    put(p, 118, 118, '3', true);
    put(p, 119, 126, '0', true);
    put(p, 127, 141, '0', true);
    put(p, 142, 142, '0', true);
    put(p, 143, 150, '0', true);
    put(p, 151, 165, '0', true);
    put(p, 166, 180, '0', true);
    put(p, 181, 195, '0', true);
    put(p, 196, 220, title.id.replace(/-/g, '').slice(0, 25));
    put(p, 221, 221, '0', true);
    put(p, 222, 223, '0', true);
    put(p, 224, 224, '3', true);
    put(p, 225, 225, '0', true);
    put(p, 226, 227, '0', true);
    put(p, 228, 229, '00', true);
    lines.push(p.join(''));

    const q = record();
    put(q, 1, 3, '033', true);
    put(q, 4, 7, '1', true);
    put(q, 8, 8, '3', true);
    put(q, 9, 13, ++detailSequence, true);
    put(q, 14, 14, 'Q');
    put(q, 16, 17, '01', true);
    put(q, 18, 18, payerDocument.length === 14 ? '2' : '1', true);
    put(q, 19, 33, payerDocument, true);
    put(q, 34, 73, title.payerName);
    put(q, 74, 113, title.street);
    put(q, 114, 128, title.district);
    put(q, 129, 133, cep.slice(0, 5), true);
    put(q, 134, 136, cep.slice(5), true);
    put(q, 137, 151, title.city);
    put(q, 152, 153, title.state);
    put(q, 154, 154, '0', true);
    put(q, 155, 169, '0', true);
    put(q, 210, 221, '0', true);
    lines.push(q.join(''));
  }
  const lotTrailer = record();
  put(lotTrailer, 1, 3, '033', true);
  put(lotTrailer, 4, 7, '1', true);
  put(lotTrailer, 8, 8, '5', true);
  put(lotTrailer, 18, 23, detailSequence + 2, true);
  lines.push(lotTrailer.join(''));
  const fileTrailer = record();
  put(fileTrailer, 1, 3, '033', true);
  put(fileTrailer, 4, 7, '9999', true);
  put(fileTrailer, 8, 8, '9', true);
  put(fileTrailer, 18, 23, '1', true);
  put(fileTrailer, 24, 29, lines.length + 1, true);
  lines.push(fileTrailer.join(''));
  return Buffer.from(`${lines.join('\r\n')}\r\n`, 'latin1');
}

function parseCnabDate(value: string) {
  if (!/^\d{8}$/.test(value) || value === '00000000') return null;
  const day = Number(value.slice(0, 2));
  const month = Number(value.slice(2, 4));
  const year = Number(value.slice(4));
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCDate() === day && date.getUTCMonth() === month - 1
    ? date
    : null;
}

export function parseSantanderCollectionReturn(
  content: Buffer,
  beneficiaryDocument: string,
  account?: {
    agency: string;
    agencyDigit: string;
    accountNumber: string;
    accountDigit: string;
  },
): SantanderReturnEvent[] {
  if (content.length > 10 * 1024 * 1024)
    throw new BadRequestException('Retorno acima de 10 MB.');
  const lines = content.toString('latin1').split(/\r?\n/).filter(Boolean);
  if (
    lines.length < 4 ||
    lines.some((line) => line.length !== 240 || line.slice(0, 3) !== '033') ||
    lines[0][7] !== '0' ||
    lines[0][142] !== '2' ||
    lines.at(-1)?.[7] !== '9' ||
    digits(lines[0].slice(17, 32)).replace(/^0+/, '') !==
      digits(beneficiaryDocument).replace(/^0+/, '') ||
    (account !== undefined &&
      (lines[0].slice(32, 36) !== account.agency ||
        lines[0].slice(36, 37) !== account.agencyDigit ||
        lines[0].slice(37, 46) !== account.accountNumber ||
        lines[0].slice(46, 47) !== account.accountDigit))
  )
    throw new BadRequestException(
      'Arquivo de retorno Santander CNAB 240 inválido ou de outro beneficiário.',
    );
  const declaredCount = Number(lines.at(-1)!.slice(23, 29));
  const declaredLots = Number(lines.at(-1)!.slice(17, 23));
  if (declaredCount !== lines.length)
    throw new BadRequestException(
      'Quantidade de registros do retorno não confere.',
    );
  let activeLot: string | null = null;
  let detailCount = 0;
  let detailSequence = 0;
  let lotCount = 0;
  for (const line of lines.slice(1, -1)) {
    const type = line[7];
    const lot = line.slice(3, 7);
    if (type === '1' && activeLot === null) {
      if (
        digits(line.slice(18, 33)).replace(/^0+/, '') !==
          digits(beneficiaryDocument).replace(/^0+/, '') ||
        (account !== undefined &&
          (line.slice(53, 57) !== account.agency ||
            line.slice(57, 58) !== account.agencyDigit ||
            line.slice(58, 67) !== account.accountNumber ||
            line.slice(67, 68) !== account.accountDigit))
      )
        throw new BadRequestException(
          'Lote de retorno de outro beneficiário ou conta.',
        );
      activeLot = lot;
      detailCount = 0;
      detailSequence = 0;
      lotCount++;
    } else if (type === '3' && activeLot === lot) {
      const sequence = Number(line.slice(8, 13));
      if (!Number.isInteger(sequence) || sequence !== ++detailSequence)
        throw new BadRequestException(
          'Sequência dos detalhes do retorno Santander inválida.',
        );
      detailCount++;
    } else if (type === '5' && activeLot === lot) {
      if (Number(line.slice(17, 23)) !== detailCount + 2)
        throw new BadRequestException(
          'Quantidade de registros do lote Santander não confere.',
        );
      activeLot = null;
    } else {
      throw new BadRequestException(
        'Estrutura de lotes do retorno Santander inválida.',
      );
    }
  }
  if (activeLot !== null || lotCount < 1 || declaredLots !== lotCount)
    throw new BadRequestException(
      'Quantidade de lotes do retorno Santander não confere.',
    );
  const events: SantanderReturnEvent[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line[7] !== '3' || line[13] !== 'T') continue;
    const next = lines[index + 1];
    if (
      !next ||
      next[7] !== '3' ||
      next[13] !== 'U' ||
      next.slice(3, 7) !== line.slice(3, 7)
    )
      throw new BadRequestException(
        `Segmento U ausente após a linha ${index + 1}.`,
      );
    const movementCode = line.slice(15, 17);
    if (next.slice(15, 17) !== movementCode)
      throw new BadRequestException(
        `Movimento T/U divergente na linha ${index + 1}.`,
      );
    const ourNumber = line.slice(40, 53);
    if (
      account !== undefined &&
      (line.slice(17, 21) !== account.agency ||
        line.slice(21, 22) !== account.agencyDigit ||
        line.slice(22, 31) !== account.accountNumber ||
        line.slice(31, 32) !== account.accountDigit)
    )
      throw new BadRequestException(
        `Conta divergente no segmento T da linha ${index + 1}.`,
      );
    const documentNumber = line.slice(54, 69).trim();
    const nominal = line.slice(77, 92);
    const paid = next.slice(77, 92);
    const net = next.slice(92, 107);
    const eventDate = parseCnabDate(next.slice(137, 145));
    if (
      !/^\d{13}$/.test(ourNumber) ||
      !documentNumber ||
      !/^\d{15}$/.test(nominal) ||
      !/^\d{15}$/.test(paid) ||
      !/^\d{15}$/.test(net) ||
      (movementCode === '06' && !eventDate)
    )
      throw new BadRequestException(
        `Dados inválidos no retorno Santander na linha ${index + 1}.`,
      );
    events.push({
      lineNumber: index + 1,
      movementCode,
      ourNumber,
      documentNumber,
      companyReference: line.slice(100, 125).trim(),
      nominalAmount: Number(nominal) / 100,
      paidAmount: Number(paid) / 100,
      netCreditAmount: Number(net) / 100,
      eventDate,
      reasonCodes: line.slice(208, 218).trim(),
    });
    index++;
  }
  if (!events.length)
    throw new BadRequestException('Retorno sem ocorrências T/U reconhecidas.');
  return events;
}
