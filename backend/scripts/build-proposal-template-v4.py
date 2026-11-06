"""Build the Manitec branded proposal without overwriting earlier versions."""
from pathlib import Path
import json
from docx import Document
from docx.shared import Mm,Pt,Twips,RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT,WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.style import WD_STYLE_TYPE

ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'backend/src/templates/documents/proposal'
OUT=BASE/'manitec-default-v4';OUT.mkdir(exist_ok=True)
BLUE='005AA8';RED='E21E36';W=9638
doc=Document();s=doc.sections[0]
s.page_width,s.page_height=Mm(210),Mm(297)
s.left_margin=s.right_margin=Mm(20)
s.top_margin,s.bottom_margin=Mm(20),Mm(16)
s.header_distance,s.footer_distance=Mm(6),Mm(7)
s.different_first_page_header_footer=True
normal=doc.styles['Normal'];normal.font.name='Arial';normal.font.size=Pt(10.5)
normal.font.color.rgb=RGBColor.from_string('263746')
normal.paragraph_format.space_after=Pt(4)
normal.paragraph_format.line_spacing=1.08
normal.paragraph_format.widow_control=True
title=doc.styles['Title'];title.font.name='Arial';title.font.size=Pt(23);title.font.bold=True;title.font.color.rgb=RGBColor(255,255,255)
title.paragraph_format.space_before=Pt(0);title.paragraph_format.space_after=Pt(0)
title.paragraph_format.keep_with_next=True
band=doc.styles.add_style('ManitecFaixa',WD_STYLE_TYPE.PARAGRAPH)
band.base_style=normal;band.font.name='Arial';band.font.size=Pt(11);band.font.bold=True;band.font.color.rgb=RGBColor(255,255,255)
band.paragraph_format.space_before=Pt(7);band.paragraph_format.space_after=Pt(5)
band.paragraph_format.line_spacing=1.45;band.paragraph_format.keep_with_next=True
shade=OxmlElement('w:shd');shade.set(qn('w:fill'),BLUE);band.element.get_or_add_pPr().append(shade)
for name in ['Heading 1','Heading 2']:
    st=doc.styles[name];st.font.name='Arial';st.font.size=Pt(11);st.font.bold=True;st.font.color.rgb=RGBColor.from_string(BLUE)
    st.paragraph_format.space_before=Pt(8);st.paragraph_format.space_after=Pt(4);st.paragraph_format.keep_with_next=True
    for node in list(st.element.xpath('.//w:pBdr')):node.getparent().remove(node)
logo=ROOT/'frontend/public/brand/manitec-logo-transparent.png'
header=s.header.paragraphs[0]
doc.styles['Header'].paragraph_format.tab_stops.clear_all()
header.paragraph_format.tab_stops.add_tab_stop(Twips(W),WD_ALIGN_PARAGRAPH.RIGHT)
header.paragraph_format.space_after=Pt(0)
header.add_run().add_picture(str(logo),width=Mm(32))
r=header.add_run('\tPROPOSTA COMERCIAL {{proposal.number}}');r.font.name='Arial';r.font.size=Pt(8);r.font.color.rgb=RGBColor.from_string(BLUE)
for drawing in header._p.xpath('.//wp:docPr'):drawing.set('descr','Manitec Grupos Geradores')
doc.styles['Footer'].paragraph_format.tab_stops.clear_all();doc.styles['Footer'].font.name='Arial';doc.styles['Footer'].font.size=Pt(8)
for footer in [s.footer,s.first_page_footer]:
    p=footer.paragraphs[0];p.paragraph_format.space_after=Pt(0)
    p.paragraph_format.tab_stops.add_tab_stop(Twips(W),WD_ALIGN_PARAGRAPH.RIGHT)
    p.add_run('Manitec | Proposta {{proposal.number}} | {{clientProposal.footerLabel}}\tPágina ')
    for instruction in ['PAGE','NUMPAGES']:
        if instruction=='NUMPAGES':p.add_run(' de ')
        field=OxmlElement('w:fldSimple');field.set(qn('w:instr'),instruction);p._p.append(field)
    for run in p.runs:run.font.name='Arial';run.font.size=Pt(8);run.font.color.rgb=RGBColor.from_string('64748B')

def para(text='',style=None,size=None,bold=False,after=4,color=None,keep=False):
    p=doc.add_paragraph(text,style);p.paragraph_format.space_after=Pt(after)
    p.paragraph_format.widow_control=True
    if keep:p.paragraph_format.keep_with_next=True
    for run in p.runs:
        if size:run.font.size=Pt(size)
        if bold:run.bold=True
        if color:run.font.color.rgb=RGBColor.from_string(color)
    return p
def label(name,value,**kwargs):
    p=para('',**kwargs);p.add_run(name+': ').bold=True;p.add_run(value);return p
def faixa(text,new_page=False):
    p=para('  '+text,'ManitecFaixa');p.paragraph_format.page_break_before=new_page;return p
def sub(text):return para(text,'Heading 2')
def table(rows,widths,header=False,financial=False):
    t=doc.add_table(rows=0,cols=len(widths));t.alignment=WD_TABLE_ALIGNMENT.CENTER;t.autofit=False
    for c,width in zip(t.columns,widths):c.width=Twips(width)
    pr=t._tbl.tblPr
    margins=OxmlElement('w:tblCellMar')
    for name,value in [('top','65'),('bottom','65'),('left','100'),('right','100')]:
        n=OxmlElement('w:'+name);n.set(qn('w:w'),value);n.set(qn('w:type'),'dxa');margins.append(n)
    pr.append(margins)
    borders=OxmlElement('w:tblBorders')
    for name in ['bottom','insideH']:
        n=OxmlElement('w:'+name);n.set(qn('w:val'),'single');n.set(qn('w:sz'),'4');n.set(qn('w:color'),'D9E2EB');borders.append(n)
    pr.append(borders)
    for index,values in enumerate(rows):
        row=t.add_row();nosplit=OxmlElement('w:cantSplit');row._tr.get_or_add_trPr().append(nosplit)
        for col,(cell,value,width) in enumerate(zip(row.cells,values,widths)):
            cell.width=Twips(width);cell.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER;cell.text=value
            for p in cell.paragraphs:
                p.paragraph_format.space_after=Pt(1);p.paragraph_format.line_spacing=1.06
                if financial and col==1:p.alignment=WD_ALIGN_PARAGRAPH.RIGHT
                if financial and index<len(rows)-1:p.paragraph_format.keep_with_next=True
                for run in p.runs:run.font.name='Arial';run.font.size=Pt(10.5)
            if header and index==0:
                sh=OxmlElement('w:shd');sh.set(qn('w:fill'),'E8F2FA');cell._tc.get_or_add_tcPr().append(sh)
                for run in cell.paragraphs[0].runs:run.bold=True;run.font.color.rgb=RGBColor.from_string(BLUE)
            if financial and index==len(rows)-1:
                sh=OxmlElement('w:shd');sh.set(qn('w:fill'),'E8F2FA');cell._tc.get_or_add_tcPr().append(sh)
                for run in cell.paragraphs[0].runs:run.font.size=Pt(17);run.bold=True;run.font.color.rgb=RGBColor.from_string(BLUE)
        if header and index==0:repeat=OxmlElement('w:tblHeader');row._tr.get_or_add_trPr().append(repeat)
    return t
def bookmark(name,start=True):
    p=para('',after=0);p.paragraph_format.line_spacing=Pt(1)
    n=OxmlElement('w:bookmarkStart' if start else 'w:bookmarkEnd');n.set(qn('w:id'),'601')
    if start:n.set(qn('w:name'),name)
    p._p.append(n)

opening=para('',after=7)
opening.add_run().add_picture(str(logo),width=Mm(82))
for drawing in opening._p.xpath('.//wp:docPr'):drawing.set('descr','Manitec Grupos Geradores')
p=para('  PROPOSTA COMERCIAL','Title',after=0)
sh=OxmlElement('w:shd');sh.set(qn('w:fill'),BLUE);p._p.get_or_add_pPr().append(sh)
p=para('  Nº {{proposal.number}}    |    VALOR TOTAL {{proposal.total}}',size=13,bold=True,color='FFFFFF',after=6,keep=True)
sh=OxmlElement('w:shd');sh.set(qn('w:fill'),BLUE);p._p.get_or_add_pPr().append(sh)
border=OxmlElement('w:pBdr');n=OxmlElement('w:bottom');n.set(qn('w:val'),'single');n.set(qn('w:sz'),'12');n.set(qn('w:color'),RED);border.append(n);p._p.get_or_add_pPr().append(border)
para('Emissão {{proposal.date}} | Validade {{proposal.validUntil}} | {{brandedProposal.reviewLabel}}',size=9,after=2)
para('{{brandedProposal.demonstrationNote}}',size=9,color='64748B',after=2)

faixa('1 IDENTIFICAÇÃO DAS PARTES')
t=doc.add_table(rows=1,cols=2);t.autofit=False;t.alignment=WD_TABLE_ALIGNMENT.CENTER
for c in t.columns:c.width=Twips(W//2)
row=t.rows[0];ns=OxmlElement('w:cantSplit');row._tr.get_or_add_trPr().append(ns)
fields=[
    [('CONTRATADA',True),('{{company.legalName}}',True),('CPF/CNPJ: {{company.document}}',False),('{{company.address}}',False),('Consultor: {{consultant.name}}',False),('Telefone: {{consultant.phone}}',False),('E-mail: {{consultant.email}}',False)],
    [('CONTRATANTE',True),('{{client.companyName}}',True),('CPF/CNPJ: {{client.document}}',False),('{{client.address}}',False),('Código do cliente: {{client.code}}',False),('Contato: {{contact.name}}',False),('Telefone: {{client.phone}}',False),('E-mail: {{client.email}}',False)],
]
for cell,values in zip(row.cells,fields):
    cell.width=Twips(W//2);cell.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.TOP
    for index,(text,bold) in enumerate(values):
        p=cell.paragraphs[0] if index==0 else cell.add_paragraph()
        p.paragraph_format.space_after=Pt(2);p.paragraph_format.line_spacing=1.04
        run=p.add_run(text);run.font.name='Arial';run.font.size=Pt(10);run.bold=bold
        if index==0:run.font.color.rgb=RGBColor.from_string(BLUE)

faixa('2 EQUIPAMENTO E OBJETIVO DO ATENDIMENTO')
table([
    ['Equipamento: {{equipment.name}}','Série: {{equipment.serialNumber}}'],
    ['Fabricante: {{equipment.manufacturer}}','Potência: {{equipment.power}}'],
    ['Motor: {{equipment.engineManufacturer}}','Horímetro: {{equipment.hourMeter}}'],
],[5800,W-5800])
label('Objetivo','{{clientProposal.objective}}',after=3)
faixa('3 PEÇAS E MATERIAIS')
para('!propostapecasmanitec.dataset',after=0)
faixa('4 SERVIÇOS E MÃO DE OBRA')
para('!propostaservicosmanitec.dataset',after=0)
para('Os descontos dos itens já estão incluídos nos totais das linhas e nos subtotais.',size=9,after=4)

faixa('5 RESUMO DO INVESTIMENTO E CONDIÇÕES COMERCIAIS')
table([
    ['Subtotal de peças e materiais','{{proposal.summaryMaterialsTotal}}'],
    ['Subtotal de serviços e mão de obra','{{proposal.summaryLaborTotal}}'],
    ['Deslocamento técnico','{{clientProposal.displacementTotal}}'],
    ['Outras despesas operacionais','{{clientProposal.otherExpensesTotal}}'],
    ['Desconto geral','- {{proposal.generalDiscountTotal}}'],
    ['VALOR TOTAL','{{proposal.total}}'],
],[6038,W-6038],financial=True)
para('{{brandedProposal.arithmeticWarning}}',size=9,color=RED,after=0)
commercial_start=len(doc.paragraphs)
sub('5.1 Pagamento, prazos e entrega')
label('Pagamento','{{brandedProposal.payment}}',after=2)
para('{{brandedProposal.paymentPending}}',after=3)
label('Previsão de execução','{{brandedProposal.execution}}',after=2)
para('O agendamento depende da aprovação, da disponibilidade das peças e do acesso ao equipamento.',after=2)
para('{{brandedProposal.availability}}',after=2)
label('Local de entrega e atendimento','{{client.address}}. Responsável: {{contact.name}}.',after=2)
label('Frete dos materiais','{{brandedProposal.freight}}',after=2)
label('Impostos','{{proposal.taxes}}',after=2)
label('Exclusões essenciais','{{technicalScope.exclusions}}',after=3)
for paragraph in doc.paragraphs[commercial_start:-1]:
    paragraph.paragraph_format.keep_with_next=True

faixa('6 ESCOPO E EXCLUSÕES')
sub('Atividades incluídas')
para('{{clientProposal.activities}}')
sub('Entregas incluídas')
para('{{brandedProposal.deliverables}}')
label('Fora do fornecimento','{{technicalScope.exclusions}}')
para('{{brandedProposal.customerNotes}}')
para('{{brandedProposal.installationNote}}')

faixa('7 CONDIÇÕES GERAIS',new_page=True)
sub('7.1 Prazos, disponibilidade de peças e agendamento')
p=para('{{brandedProposal.partsTiming}}');p.paragraph_format.keep_together=True
sub('7.2 Obrigações da contratada')
para('{{brandedProposal.contractorText}}')
sub('7.3 Obrigações da contratante')
para('{{brandedProposal.clientText}}')
sub('7.4 Faturamento e recebimento')
para('{{brandedProposal.receivingDetails}}')
para('{{brandedProposal.billingNote}}',size=10)
bookmark('manitec_v4_warranty')
sub('7.5 Garantia')
para('{{brandedProposal.warranty}}')
bookmark('manitec_v4_warranty',False)
sub('{{brandedProposal.defaultHeading}}')
para('{{brandedProposal.defaultTerms}}',size=10)
sub('{{brandedProposal.cancellationHeading}}')
para('{{brandedProposal.cancellationTerms}}',size=10)
sub('{{brandedProposal.acceptanceHeading}}')
p=para('Ao aprovar esta proposta, o responsável declara ciência e aceite dos itens, quantidades, valores, escopo e condições gerais apresentados.',size=10);p.paragraph_format.keep_with_next=True
para('Responsável pelo cliente: __________________________________________',size=10,after=4,keep=True)
para('Cargo: __________________ Assinatura: __________________ Data: ____/____/________',size=10,after=0)

doc.core_properties.title='Proposta comercial Manitec'
doc.core_properties.subject='Identidade Manitec e conteúdo comercial completo'
doc.core_properties.author='Manitec'
doc.save(OUT/'template.docx')
schema=json.loads((BASE/'manitec-default-v3/schema.json').read_text(encoding='utf8'))
schema['version']='manitec-default-v4'
labels={'reviewLabel':'Situação de revisão','demonstrationNote':'Identificação de dados demonstrativos','execution':'Prazo de execução','payment':'Condição de pagamento','paymentPending':'Vencimentos a definir','availability':'Disponibilidade de peças','freight':'Frete dos materiais','receivingDetails':'Faturamento e recebimento','billingNote':'Pagamento entre emitentes','contractorText':'Obrigações da contratada','clientText':'Obrigações da contratante','deliverables':'Entregas incluídas','installationNote':'Instalação quando contratada','customerNotes':'Observações externas','partsTiming':'Prazos disponibilidade e agendamento','warranty':'Garantia confirmada','defaultHeading':'Título de atraso no pagamento','cancellationHeading':'Título de cancelamento','acceptanceHeading':'Título de aceite','defaultTerms':'Condição de atraso no pagamento','cancellationTerms':'Condição de cancelamento','arithmeticWarning':'Situação dos valores'}
for key,label in labels.items():schema['fields']['brandedProposal.'+key]=label
schema['fields']['company.legalName']='Razão social da Manitec'
(OUT/'schema.json').write_text(json.dumps(schema,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
definition={'title':'PROPOSTA COMERCIAL {{proposal.number}}','sections':[{'heading':'IDENTIFICAÇÃO DAS PARTES','paragraphs':['{{company.legalName}} | {{company.document}} | {{company.address}}','{{client.companyName}} | {{client.document}} | {{client.address}}']},{'heading':'RESUMO DO INVESTIMENTO','paragraphs':['Peças {{proposal.summaryMaterialsTotal}} | Serviços {{proposal.summaryLaborTotal}}','Total {{proposal.total}}','Pagamento {{brandedProposal.payment}}','Prazo {{brandedProposal.execution}}']}],'footer':['Proposta {{proposal.number}}']}
(OUT/'template.json').write_text(json.dumps(definition,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
sample=json.loads((BASE/'manitec-default-v3/sample-data.json').read_text(encoding='utf8'))
sample['company']['legalName']=sample['company']['name']
sample['metadata']['templateKey']='proposal/manitec-default-v4'
sample['brandedProposal']={key:'' for key in labels}
sample['brandedProposal'].update(reviewLabel='Prévia para revisão',demonstrationNote='Dados demonstrativos',execution='A definir.',payment='A definir.',availability='Disponibilidade a definir.',freight='A definir.',receivingDetails='Dados de recebimento a definir.',contractorText='Executar os serviços contratados.',clientText='Garantir o acesso ao equipamento.',deliverables='Relatório de execução dos serviços.',partsTiming='O prazo depende da disponibilidade de peças e do agendamento.',warrantyConfirmed=False,defaultHeading='7.5 Atraso no pagamento',cancellationHeading='7.6 Cancelamento',acceptanceHeading='7.7 Aceite',defaultTerms='Multa de 2%, juros de mora de 1% ao mês e correção monetária.',cancellationTerms='Multa de 10% sobre o serviço após cinco dias corridos da contratação.',contractorChain=[],contractorLast=[{'description':'Executar os serviços contratados.'}],clientChain=[],clientLast=[{'description':'Garantir o acesso ao equipamento.'}])
for category in ['parts','services']:
    sample['brandedProposal'][category+'BeforeLast']=sample.get(category,[])[:-1]
    sample['brandedProposal'][category+'Last']=sample.get(category,[])[-1:]
(OUT/'sample-data.json').write_text(json.dumps(sample,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
(OUT/'README.md').write_text('# Proposta Manitec v4\n\nAbertura comercial com marca, identificação completa das partes, dados do equipamento e faixas azuis uniformes. Valores, peças e mão de obra preservados. Obrigações separadas e conteúdo pertinente recuperado do original.\n\nPendências editoriais ficam fora do documento do cliente. Campos sem definição mostram apenas indicação curta. Garantia só aparece quando explicitamente confirmada. O v3 e os arquivos históricos permanecem preservados.\n\nConstrução: `backend/scripts/build-proposal-template-v4.py`. O DOCX é convertido para PDF pelo serviço existente. O Studio mantém prioridade para publicações personalizadas.\n',encoding='utf8')
print('Modelo v4 criado. Modelos anteriores preservados.')
