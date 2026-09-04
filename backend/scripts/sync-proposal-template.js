const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const templatePath = path.join(
  __dirname,
  '..',
  'src',
  'templates',
  'documents',
  'proposal',
  'manitec-default-v1',
  'template.docx',
);

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function run(value, options = {}) {
  const props = [
    '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>',
    options.bold ? '<w:b/><w:bCs/>' : '',
    options.color ? `<w:color w:val="${options.color}"/>` : '',
    `<w:sz w:val="${options.size || 20}"/>`,
    `<w:szCs w:val="${options.size || 20}"/>`,
  ].join('');

  return `<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r>`;
}

function textRuns(value, options = {}) {
  return String(value)
    .split(/\r?\n/)
    .map((line, index) => `${index ? '<w:r><w:br/></w:r>' : ''}${run(line, options)}`)
    .join('');
}

function paragraph(value, options = {}) {
  const alignment = options.align ? `<w:jc w:val="${options.align}"/>` : '';
  return `<w:p><w:pPr><w:spacing w:before="${options.before || 0}" w:after="${options.after ?? 100}" w:line="276" w:lineRule="auto"/>${alignment}</w:pPr>${textRuns(value, options)}</w:p>`;
}

function title(value) {
  return `<w:p><w:pPr><w:keepNext/><w:spacing w:before="500" w:after="80"/><w:pBdr><w:bottom w:val="single" w:sz="18" w:space="8" w:color="0B4F8A"/></w:pBdr></w:pPr>${run(value, { bold: true, size: 34, color: '102A43' })}</w:p>`;
}

function sectionHeading(value) {
  return `<w:p><w:pPr><w:keepNext/><w:spacing w:before="220" w:after="90"/></w:pPr>${run(value.toLocaleUpperCase('pt-BR'), { bold: true, size: 18, color: '0B4F8A' })}</w:p>`;
}

function labeledParagraph(label, value) {
  return `<w:p><w:pPr><w:keepNext/><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr>${run(`${label}: `, { bold: true, size: 20, color: '243B53' })}${textRuns(value, { size: 20 })}</w:p>`;
}

function cell(content, options) {
  const borders =
    options.borderTop || options.borderBottom
      ? `<w:tcBorders>${options.borderTop ? '<w:top w:val="single" w:sz="8" w:space="0" w:color="9FB3C8"/>' : ''}${options.borderBottom ? '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="D9E2EC"/>' : ''}</w:tcBorders>`
      : '';
  const fill = options.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${options.fill}"/>` : '';
  const alignment = options.align ? `<w:jc w:val="${options.align}"/>` : '';
  return `<w:tc><w:tcPr><w:tcW w:w="${options.width}" w:type="pct"/>${fill}${borders}<w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:spacing w:after="0" w:line="252" w:lineRule="auto"/>${alignment}</w:pPr>${content}</w:p></w:tc>`;
}

function table(rows) {
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="90" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>${rows}</w:tbl>`;
}

function simpleTable(cells) {
  return table(`<w:tr>${cells.join('')}</w:tr>`);
}

function metaLine(items) {
  return simpleTable(
    items.map(([label, value]) =>
      cell(
        `${run(`${label.toUpperCase()}:  `, { bold: true, size: 15, color: '627D98' })}${run(value, { bold: true, size: 20, color: '243B53' })}`,
        { width: Math.floor(5000 / items.length), borderBottom: true },
      ),
    ),
  );
}

function infoRows(items) {
  const rows = [];
  for (let index = 0; index < items.length; index += 2) {
    const pair = items.slice(index, index + 2);
    while (pair.length < 2) pair.push(['', '']);
    rows.push(
      `<w:tr>${pair
        .map(([label, value]) =>
          cell(
            `${run(`${label.toUpperCase()}:  `, { bold: true, size: 14, color: '627D98' })}${run(value, { size: 20, color: '243B53' })}`,
            { width: 2500, borderBottom: true },
          ),
        )
        .join('')}</w:tr>`,
    );
  }
  return table(rows.join(''));
}

function investmentBand(items) {
  return simpleTable(
    items.map(([label, value], index) =>
      cell(
        `${run(`${label.toUpperCase()}:  `, { bold: true, size: 14, color: '627D98' })}${run(value, { bold: true, size: index === 0 ? 28 : 20, color: index === 0 ? '0B4F8A' : '243B53' })}`,
        { width: index === 0 ? 2000 : 1500, borderTop: true, borderBottom: true },
      ),
    ),
  );
}

function itemsRow(values, header = false) {
  const widths = [2100, 800, 500, 800, 800];
  return `<w:tr>${header ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${values
    .map((value, index) =>
      cell(run(value || '-', { bold: header, size: header ? 16 : 18, color: header ? 'FFFFFF' : '243B53' }), {
        width: widths[index],
        fill: header ? '163A5F' : undefined,
        borderBottom: true,
      }),
    )
    .join('')}</w:tr>`;
}

function itemsSection(titleText, loopPath) {
  return `${sectionHeading(titleText)}${table(
    `${itemsRow(['Descricao', 'SKU', 'Qtd.', 'Unitario', 'Total'], true)}{{#${loopPath}}}${itemsRow(
      ['{{description}}', '{{sku}}', '{{quantity}}', '{{unitPrice}}', '{{total}}'],
    )}{{/${loopPath}}}`,
  )}`;
}

function totalsTable(items) {
  return table(
    items
      .map(([label, value], index) => {
        const total = index === items.length - 1;
        return `<w:tr>${cell(run(label, { bold: total, size: total ? 21 : 19, color: total ? 'FFFFFF' : '243B53' }), {
          width: 3500,
          fill: total ? '163A5F' : undefined,
          borderBottom: true,
        })}${cell(run(value, { bold: true, size: total ? 23 : 19, color: total ? 'FFFFFF' : '0B4F8A' }), {
          width: 1500,
          fill: total ? '163A5F' : undefined,
          borderBottom: true,
          align: 'right',
        })}</w:tr>`;
      })
      .join(''),
  );
}

function signatureTable(items) {
  return table(
    `<w:tr>${items
      .map(([name, role]) =>
        cell(`${run(name, { bold: true, size: 19, color: '243B53' })}<w:r><w:br/></w:r>${run(role, { size: 16, color: '627D98' })}`, {
          width: 2500,
          borderTop: true,
        }),
      )
      .join('')}</w:tr>`,
  );
}

function pageBreak() {
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
}

function professionalTemplateBody() {
  return [
    title('Proposta comercial'),
    paragraph('{{proposal.title}}', { size: 24, color: '334E68', after: 120 }),
    metaLine([
      ['Proposta', '{{proposal.number}}'],
      ['Emissão', '{{proposal.date}}'],
      ['Validade', '{{proposal.validUntil}}'],
    ]),
    sectionHeading('Resumo executivo'),
    paragraph('A {{company.name}} apresenta a {{client.name}} esta proposta para {{proposal.summary}}.', { after: 180 }),
    infoRows([
      ['Cliente', '{{client.name}}'],
      ['CNPJ / CPF', '{{client.document}}'],
      ['Responsável', '{{contact.name}}'],
      ['Contato', '{{contact.phone}} | {{contact.email}}'],
      ['Equipamento', '{{equipment.name}}'],
      ['Série', '{{equipment.serialNumber}}'],
    ]),
    investmentBand([
      ['Investimento total', '{{proposal.total}}'],
      ['Pagamento', '{{proposal.paymentTerms}}'],
      ['Prazo previsto', '{{proposal.deliveryTerms}}'],
    ]),
    paragraph('Responsável comercial: {{consultant.name}} | {{consultant.email}} | {{consultant.phone}}', {
      size: 18,
      color: '627D98',
      before: 160,
    }),
    pageBreak(),
    title('Escopo e composição'),
    sectionHeading('Objetivo e escopo'),
    paragraph('{{proposal.scope}}', { after: 180 }),
    sectionHeading('Equipamento de referência'),
    infoRows([
      ['Equipamento', '{{equipment.name}}'],
      ['Tipo', '{{equipment.type}}'],
      ['Fabricante', '{{equipment.manufacturer}}'],
      ['Motor', '{{equipment.engineManufacturer}}'],
      ['Potência', '{{equipment.power}}'],
      ['Horímetro', '{{equipment.hourMeter}}'],
    ]),
    itemsSection('Peças e materiais', 'parts'),
    itemsSection('Serviços', 'services'),
    pageBreak(),
    title('Condições de fornecimento'),
    sectionHeading('Prazos, garantia e critérios técnicos'),
    labeledParagraph('Prazo de entrega e execução', '{{proposal.deliveryTerms}}'),
    labeledParagraph('Garantia', '{{technicalScope.warranty}}'),
    labeledParagraph('Normas e segurança', '{{terms.standards}}'),
    sectionHeading('Responsabilidades'),
    labeledParagraph('MANITEC', '{{terms.contractorObligations}}'),
    labeledParagraph('Cliente', '{{terms.clientObligations}}'),
    sectionHeading('Limites do fornecimento'),
    labeledParagraph('Exclusões', '{{technicalScope.exclusions}}'),
    labeledParagraph('Observações', '{{proposal.notes}}'),
    pageBreak(),
    title('Condições comerciais e aceite'),
    sectionHeading('Composição do investimento'),
    totalsTable([
      ['Serviços e mão de obra', '{{proposal.laborTotal}}'],
      ['Materiais e peças', '{{proposal.materialsTotal}}'],
      ['Despesas', '{{proposal.expensesTotal}}'],
      ['Descontos', '{{proposal.discountTotal}}'],
      ['Valor total da proposta', '{{proposal.total}}'],
    ]),
    sectionHeading('Condições comerciais'),
    infoRows([
      ['Condição de pagamento', '{{proposal.paymentTerms}}'],
      ['Forma de pagamento', '{{proposal.paymentMethod}}'],
      ['Validade', '{{proposal.validUntil}}'],
      ['Prazo', '{{proposal.deliveryTerms}}'],
      ['Frete', '{{proposal.freight}}'],
      ['Impostos', '{{proposal.taxes}}'],
    ]),
    paragraph('{{terms.default}}', { size: 18, color: '486581', before: 120, after: 140 }),
    sectionHeading('Aceite'),
    paragraph('A aprovação desta proposta confirma a ciência e o aceite do escopo, dos valores, dos prazos e das condições comerciais apresentados.', {
      after: 300,
    }),
    signatureTable([
      ['{{approval.clientSignerName}}', 'Cliente'],
      ['{{consultant.name}}', 'MANITEC'],
    ]),
    paragraph('{{company.city}}, {{approval.date}}', { align: 'right', size: 18, before: 180 }),
  ].join('');
}

function findEndOfCentralDirectory(buffer) {
  const minimumOffset = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error('DOCX invalido: fim do ZIP nao encontrado.');
}

function unzip(buffer) {
  const endOffset = findEndOfCentralDirectory(buffer);
  const totalEntries = buffer.readUInt16LE(endOffset + 10);
  let offset = buffer.readUInt32LE(endOffset + 16);
  const files = [];

  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('DOCX invalido: diretorio ZIP corrompido.');
    }

    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const fileName = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString('utf8');

    offset += 46 + fileNameLength + extraLength + commentLength;
    if (fileName.endsWith('/')) continue;

    const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

    files.push({
      path: fileName,
      content: method === 8 ? zlib.inflateRawSync(compressed) : compressed,
    });
  }

  return files;
}

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[index] = crc >>> 0;
  }
  return table;
}

const crcTable = makeCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTime() {
  const date = new Date();
  return (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
}

function dosDate() {
  const date = new Date();
  return ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
}

function zip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.path, 'utf8');
    const contentCrc = crc32(file.content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dosTime(), 10);
    local.writeUInt16LE(dosDate(), 12);
    local.writeUInt32LE(contentCrc, 14);
    local.writeUInt32LE(file.content.length, 18);
    local.writeUInt32LE(file.content.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, file.content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(dosTime(), 12);
    central.writeUInt16LE(dosDate(), 14);
    central.writeUInt32LE(contentCrc, 16);
    central.writeUInt32LE(file.content.length, 20);
    central.writeUInt32LE(file.content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + file.content.length;
  }

  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

const source = fs.readFileSync(templatePath);
const files = unzip(source);
const documentFile = files.find((file) => file.path === 'word/document.xml');

if (!documentFile) {
  throw new Error('word/document.xml nao encontrado no template.');
}

const sourceXml = documentFile.content.toString('utf8');
const bodyMatch = sourceXml.match(/^([\s\S]*?<w:body>)([\s\S]*)(<\/w:body>[\s\S]*)$/);
if (!bodyMatch) {
  throw new Error('Modelo de proposta sem corpo Word reconhecivel.');
}

const [, prefix, body, suffix] = bodyMatch;
const firstTable = body.indexOf('<w:tbl');
const sections = [...body.matchAll(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)];
const finalSection = sections.at(-1)?.[0];

if (firstTable < 0 || !finalSection) {
  throw new Error('Modelo de proposta sem divisao de capa ou secao principal.');
}

const cover = body.slice(0, firstTable);
documentFile.content = Buffer.from(`${prefix}${cover}${professionalTemplateBody()}${finalSection}${suffix}`, 'utf8');
fs.writeFileSync(templatePath, zip(files));
console.log(`Template sincronizado: ${templatePath}`);
