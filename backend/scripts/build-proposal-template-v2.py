from pathlib import Path
import json, zipfile, io, re
from docx import Document
from docx.shared import Twips, Pt, RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.style import WD_STYLE_TYPE

ROOT = Path(__file__).resolve().parents[2]
OLD = ROOT / 'backend/src/templates/documents/proposal/manitec-default-v1'
NEW = OLD.parent / 'manitec-default-v2'
NEW.mkdir(exist_ok=True)
doc = Document(OLD / 'template.docx')
original = list(doc.element.body)
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
def original_text(index):
    return re.sub(r'\s+', ' ', ''.join(node.text or '' for node in original[index].iter(W + 't'))).strip()

# Keep the original cover section and its relationships. The historical v1 is never written.
for node in original[2:]:
    if node.tag != W + 'sectPr':
        doc.element.body.remove(node)
main = doc.sections[-1]
main.page_width, main.page_height = Twips(11906), Twips(16838)
main.left_margin = main.right_margin = Twips(1553)
main.top_margin, main.bottom_margin = Twips(1350), Twips(1050)
main.header_distance, main.footer_distance = Twips(500), Twips(430)
main.different_first_page_header_footer = False
normal = doc.styles['Normal']
normal.font.name, normal.font.size = 'Arial', Pt(10.5)
normal.paragraph_format.space_after = Pt(5)
normal.paragraph_format.line_spacing = 1.12
normal.paragraph_format.widow_control = True
for name in ['Title', 'Heading 1', 'Heading 2']:
    style = doc.styles[name] if name in doc.styles else doc.styles.add_style(name, WD_STYLE_TYPE.PARAGRAPH)
    style.base_style = normal
    style.font.name = 'Arial'
    style.font.color.rgb = RGBColor.from_string('111827' if name == 'Title' else '16324F')
    style.font.size = Pt(18 if name == 'Title' else 11)
    style.font.bold = True
    style.paragraph_format.space_before = Pt(9 if name != 'Title' else 0)
    style.paragraph_format.space_after = Pt(5)
    style.paragraph_format.keep_with_next = True
    style.paragraph_format.page_break_before = False
    for border in list(style.element.xpath('.//w:pBdr')):
        border.getparent().remove(border)

def p(text='', style=None, after=5):
    para = doc.add_paragraph(text, style)
    para.paragraph_format.space_after = Pt(after)
    para.paragraph_format.widow_control = True
    return para

def heading(text):
    return p(text, 'Heading 1', 5)

def table(rows, widths=None, header=False, money=False):
    t = doc.add_table(rows=0, cols=len(rows[0]))
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = False
    widths = widths or [8800 // len(rows[0])] * len(rows[0])
    for col, width in zip(t.columns, widths): col.width = Twips(width)
    pr = t._tbl.tblPr
    for tag in ['tblBorders', 'tblInd']:
        for node in list(pr.findall(W + tag)): pr.remove(node)
    borders = OxmlElement('w:tblBorders')
    for name in ['bottom', 'insideH']:
        line = OxmlElement('w:' + name)
        for key, val in [('val','single'),('sz','4'),('color','DFE5EB')]: line.set(qn('w:'+key),val)
        borders.append(line)
    pr.append(borders)
    margin = OxmlElement('w:tblCellMar')
    for name,val in [('top','75'),('bottom','75'),('left','100'),('right','100')]:
        edge=OxmlElement('w:'+name);edge.set(qn('w:w'),val);edge.set(qn('w:type'),'dxa');margin.append(edge)
    pr.append(margin)
    for index, values in enumerate(rows):
        row = t.add_row()
        no_split=OxmlElement('w:cantSplit');row._tr.get_or_add_trPr().append(no_split)
        for col_index,(cell, text, width) in enumerate(zip(row.cells, values, widths)):
            cell.width = Twips(width)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.TOP
            cell.text = text
            for para in cell.paragraphs:
                para.paragraph_format.space_after = Pt(2)
                para.paragraph_format.line_spacing = 1.08
                if money and col_index == len(values)-1: para.alignment=WD_ALIGN_PARAGRAPH.RIGHT
                for run in para.runs:
                    run.font.name,run.font.size='Arial',Pt(10)
            if header and index == 0:
                for run in cell.paragraphs[0].runs:
                    run.bold=True;run.font.color.rgb=RGBColor.from_string('16324F')
            if money and index == len(rows)-1:
                shade=OxmlElement('w:shd');shade.set(qn('w:fill'),'EAF0F6');cell._tc.get_or_add_tcPr().append(shade)
                for run in cell.paragraphs[0].runs: run.bold=True
        if header and index == 0:
            repeat=OxmlElement('w:tblHeader');row._tr.get_or_add_trPr().append(repeat)
    p('',after=2).paragraph_format.line_spacing=Pt(2)
    return t

# Main header uses the same institutional artwork, within the content width.
main.header.is_linked_to_previous=False
for node in list(main.header._element): main.header._element.remove(node)
with zipfile.ZipFile(OLD/'template.docx') as archive:
    banner=archive.read('word/media/image1.jpg')
hp=main.header.add_paragraph();hp.paragraph_format.space_after=Pt(0)
hp.add_run().add_picture(io.BytesIO(banner),width=Twips(8800))
main.footer.is_linked_to_previous=False
for node in list(main.footer._element): main.footer._element.remove(node)
fp=main.footer.add_paragraph('MANITEC GRUPOS GERADORES  ·  Proposta {{proposal.number}}')
fp.paragraph_format.space_after=Pt(2)
for run in fp.runs: run.font.name='Arial';run.font.size=Pt(8);run.font.color.rgb=RGBColor.from_string('64748B')
fp.add_run('  ·  Página ')
field=OxmlElement('w:fldSimple');field.set(qn('w:instr'),'PAGE');fp._p.append(field)

p('PROPOSTA COMERCIAL {{proposal.number}}','Title',6)
p('{{proposal.title}}',after=7)
table([['Emissão: {{proposal.date}}','Validade: {{proposal.validUntil}}']], [4400,4400])
heading('Identificação das partes')
table([
    ['CONTRATADA','CONTRATANTE'],
    ['{{company.name}}','{{client.companyName}}'],
    ['CPF/CNPJ: {{company.document}}','CPF/CNPJ: {{client.document}}'],
    ['{{company.address}}','{{client.address}}'],
    ['Consultor: {{consultant.name}}','Código do cliente: {{client.code}}'],
    ['{{consultant.email}} · {{consultant.phone}}','{{proposal.contactSummary}}'],
], [4400,4400], True)
heading('Informações de CNPJ para faturamentos')
p('{{proposal.billingSummary}}')
heading('Equipamento de referência')
table([
    ['Equipamento: {{equipment.name}}','Série: {{equipment.serialNumber}}'],
    ['Fabricante: {{equipment.manufacturer}}','Potência: {{equipment.power}}'],
    ['Motor: {{equipment.engineManufacturer}}','Horímetro: {{equipment.hourMeter}}'],
], [5200,3600])
heading('Itens e serviços da proposta')
p('!propostaitens.dataset',after=2)
p('Os descontos por item já estão considerados nos totais das linhas. Valores em reais.',after=4).runs[0].font.size=Pt(8.5)
heading('Escopo do fornecimento e dos serviços')
p('{{proposal.scope}}')
heading('Exclusões do fornecimento')
p('{{technicalScope.exclusions}}')
heading('Observações para o cliente')
p('{{proposal.notes}}')
heading('Condições comerciais')
table([
    ['Composição do investimento','Valor'],
    ['Peças e materiais · valores líquidos','{{proposal.summaryMaterialsTotal}}'],
    ['Serviços e mão de obra · valores líquidos','{{proposal.summaryLaborTotal}}'],
    ['Despesas operacionais','{{proposal.expensesTotal}}'],
    ['Desconto geral da proposta','− {{proposal.generalDiscountTotal}}'],
    ['VALOR TOTAL DA PROPOSTA','{{proposal.total}}'],
], [6500,2300], True, True)
p('Despesas previstas: {{proposal.expensesIncluded}}',after=6).runs[0].font.size=Pt(9)
table([
    ['Condição de pagamento','{{proposal.paymentTerms}}'],
    ['Dados de recebimento','{{proposal.paymentMethod}}'],
    ['Validade da proposta','{{proposal.validUntil}}'],
    ['Prazo de entrega e execução','{{proposal.deliveryTerms}}'],
    ['Frete','{{proposal.freightLabel}}'],
    ['Impostos','{{proposal.taxes}}'],
], [2600,6200])
heading('Condições de fornecimento')
# Retain the existing wording of operational obligations and commercial clauses.
groups=[(18,19),(26,33),(35,46),(51,53),(56,58),(60,62)]
for start,end in groups:
    i=start
    while i<=end:
        text=original_text(i)
        if i in [39,42,45] and i+1<=end:
            text+=' '+original_text(i+1);i+=1
        if text:
            if text.isupper() or text.rstrip(':').lower() in ['inadimplemento','cancelamento do pedido']:
                p(text.rstrip(':').strip(),'Heading 2')
            else:
                p(text.replace('!orcamentositens2.respnomeentrega','{{contact.name}}'))
        i+=1
heading('Aceite da proposta')
p('Em caso de aprovação, devolva esta proposta assinada ou registre o aceite pelo canal disponibilizado pela Manitec, para continuidade do atendimento.')
p('Cliente: {{client.companyName}}')
p('Nome e cargo do responsável: __________________________________________________')
p('Assinatura: __________________________________    Data do aceite: ____/____/________',after=0)
doc.core_properties.title='Modelo padrão de proposta comercial Manitec'
doc.core_properties.subject='Modelo v2 com campos comerciais e paginação contínua'
doc.core_properties.author='Manitec'
doc.save(NEW/'template.docx')

schema=json.loads((OLD/'schema.json').read_text(encoding='utf8'))
schema.update(version='manitec-default-v2',legacyMarkersSupported=True)
schema['fields'].update({'client.code':'Código comercial do cliente','proposal.billingSummary':'Emitentes dos perfis de recebimento selecionados na proposta','proposal.generalDiscountTotal':'Desconto geral sem repetir descontos dos itens','proposal.summaryMaterialsTotal':'Materiais líquidos antes do desconto geral','proposal.summaryLaborTotal':'Serviços líquidos antes do desconto geral','proposal.contactSummary':'Contato público do cliente','proposal.freightLabel':'Responsabilidade pelo frete em linguagem comercial'})
schema['fields']['client.companyName']='Razão social do cliente'
schema['fields']['proposal.expensesIncluded']='Categorias de despesas previstas no atendimento'
(NEW/'schema.json').write_text(json.dumps(schema,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
definition=json.loads((OLD/'template.json').read_text(encoding='utf8'))
definition['sections'][0]['paragraphs'].append('Código do cliente: {{client.code}}')
definition['sections'][4]['paragraphs'].insert(0,'Faturamento: {{proposal.billingSummary}}')
definition['sections'][3]['table']['columns'].insert(3,{'header':'Un.','path':'unit'})
definition['sections'][3]['table']['columns'].insert(5,{'header':'Desc.','path':'discountPercent','align':'right'})
definition['sections'][5]['paragraphs'][-1]='Data do aceite: ____/____/________ | Assinatura: __________________________________'
definition['footer']=['{{company.name}} | {{company.document}} | {{company.email}} | {{company.phone}}','Proposta {{proposal.number}}']
(NEW/'template.json').write_text(json.dumps(definition,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
sample=json.loads((OLD/'sample-data.json').read_text(encoding='utf8'))
sample['client']['code']='2020CLI'
sample['client']['companyName']=sample['client']['name']
sample['metadata']['templateKey']='proposal/manitec-default-v2'
sample['proposal']['expensesIncluded']='Sem despesas operacionais previstas'
for item in sample['items']: item['discountPercent']='0%'
sample['proposal'].update(summaryMaterialsTotal='R$ 2.000,00',summaryLaborTotal='R$ 8.000,00',generalDiscountTotal='R$ 0,00',billingSummary='Peças e serviços · Emitente de exemplo · CNPJ conforme conta selecionada',contactSummary='Contato Cliente · cliente@example.test',freightLabel='Por conta do cliente (FOB)')
(NEW/'sample-data.json').write_text(json.dumps(sample,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
(NEW/'README.md').write_text('# Proposta Manitec v2\n\nModelo padrão com a capa e a marca originais, paginação contínua, tabela única de itens e emissão a partir dos dados comerciais congelados na proposta.\n\nO v1 e os arquivos aprovados permanecem preservados. Perfis já publicados no Studio mantêm sua prioridade e não são publicados novamente por este arquivo.\n\n`!propostaitens.dataset` insere a tabela de itens com código, quantidade, unidade e desconto. Demais campos usam `{{caminho.da.variavel}}`. CNPJs e contas são dados da proposta; não devem ser digitados como constantes.\n',encoding='utf8')
print('Template v2 created; v1 preserved.')
