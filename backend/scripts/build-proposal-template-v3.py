"""Build the customer-first proposal master; never modifies previous templates."""
from pathlib import Path
import json
from docx import Document
from docx.shared import Mm, Pt, Twips, RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT

ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'backend/src/templates/documents/proposal'
OUT=BASE/'manitec-default-v3'
OUT.mkdir(exist_ok=True)
doc=Document()
section=doc.sections[0]
section.page_width,section.page_height=Mm(210),Mm(297)
section.left_margin=section.right_margin=Mm(20)
section.top_margin,section.bottom_margin=Mm(24),Mm(16)
section.header_distance,section.footer_distance=Mm(7),Mm(7)
W=9638
normal=doc.styles['Normal']
normal.font.name,normal.font.size='Arial',Pt(10.5)
normal.font.color.rgb=RGBColor.from_string('222B35')
normal.paragraph_format.space_after=Pt(4)
normal.paragraph_format.line_spacing=1.06
normal.paragraph_format.widow_control=True
for name,size in [('Title',18),('Heading 1',12),('Heading 2',10.5)]:
    style=doc.styles[name]
    style.font.name,style.font.size='Arial',Pt(size)
    style.font.color.rgb=RGBColor(0,0,0)
    style.font.bold=True
    style.paragraph_format.keep_with_next=True
    style.paragraph_format.space_before=Pt(8 if name!='Title' else 0)
    style.paragraph_format.space_after=Pt(4)
    style.paragraph_format.line_spacing=1.03
    for node in list(style.element.xpath('.//w:pBdr')):node.getparent().remove(node)
header=section.header.paragraphs[0]
header.paragraph_format.space_after=Pt(0)
header.add_run().add_picture(str(ROOT/'frontend/public/brand/manitec-logo-transparent.png'),width=Mm(46))
for drawing in header._p.xpath('.//wp:docPr'):drawing.set('descr','Manitec Grupos Geradores')
footer=section.footer.paragraphs[0]
doc.styles['Footer'].paragraph_format.tab_stops.clear_all()
doc.styles['Footer'].font.name='Arial'
doc.styles['Footer'].font.size=Pt(8)
footer.paragraph_format.space_after=Pt(0)
footer.paragraph_format.tab_stops.add_tab_stop(Twips(W),WD_ALIGN_PARAGRAPH.RIGHT)
footer.add_run('Proposta {{proposal.number}} | {{clientProposal.footerLabel}}\tPágina ')
for instruction in ['PAGE','NUMPAGES']:
    if instruction=='NUMPAGES':footer.add_run(' de ')
    field=OxmlElement('w:fldSimple');field.set(qn('w:instr'),instruction);footer._p.append(field)
for run in footer.runs:run.font.name='Arial';run.font.size=Pt(8);run.font.color.rgb=RGBColor.from_string('64748B')

def para(text='',style=None,size=None,bold=False,after=4,before=0,color=None):
    p=doc.add_paragraph(text,style)
    p.paragraph_format.space_after=Pt(after)
    p.paragraph_format.space_before=Pt(before)
    p.paragraph_format.widow_control=True
    for run in p.runs:
        if size:run.font.size=Pt(size)
        if bold:run.bold=True
        if color:run.font.color.rgb=RGBColor.from_string(color)
    return p
def lead(label,value,**kwargs):
    p=para('',**kwargs);p.add_run(label+': ').bold=True;p.add_run(value);return p
def heading(text):return para(text,'Heading 2')
def gap(size=3):
    p=para('',after=0);p.paragraph_format.line_spacing=Pt(size);p.add_run().font.size=Pt(1)
def region(name,identifier,start=True):
    p=para('',after=0);p.paragraph_format.line_spacing=Pt(1)
    node=OxmlElement('w:bookmarkStart' if start else 'w:bookmarkEnd')
    node.set(qn('w:id'),str(identifier))
    if start:node.set(qn('w:name'),name)
    p._p.append(node)
def finance(rows=None):
    rows=rows or [('Deslocamento técnico','{{clientProposal.displacementTotal}}'),('Outras despesas operacionais','{{clientProposal.otherExpensesTotal}}'),('Desconto geral da proposta','- {{proposal.generalDiscountTotal}}'),('VALOR TOTAL','{{proposal.total}}')]
    table=doc.add_table(rows=0,cols=2)
    table.autofit=False;table.alignment=WD_TABLE_ALIGNMENT.CENTER
    widths=[7400,W-7400]
    for column,width in zip(table.columns,widths):column.width=Twips(width)
    props=table._tbl.tblPr
    margin=OxmlElement('w:tblCellMar')
    for name,value in [('top','45'),('bottom','45'),('left','90'),('right','90')]:
        node=OxmlElement('w:'+name);node.set(qn('w:w'),value);node.set(qn('w:type'),'dxa');margin.append(node)
    props.append(margin)
    for index,(label,value) in enumerate(rows):
        row=table.add_row();no_split=OxmlElement('w:cantSplit');row._tr.get_or_add_trPr().append(no_split)
        for i,(cell,text,width) in enumerate(zip(row.cells,[label,value],widths)):
            cell.width=Twips(width);cell.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
            cell.text=text
            p=cell.paragraphs[0];p.paragraph_format.space_after=Pt(0);p.paragraph_format.line_spacing=1.05
            if i==1:p.alignment=WD_ALIGN_PARAGRAPH.RIGHT
            for run in p.runs:
                run.font.name='Arial';run.font.size=Pt(10.5 if index<3 else 16);run.bold=index==3
                if index==3:run.font.color.rgb=RGBColor.from_string('173652')
            if index==3:
                border=OxmlElement('w:tcBorders');top=OxmlElement('w:top')
                top.set(qn('w:val'),'single');top.set(qn('w:sz'),'5');top.set(qn('w:color'),'CAD3DD');border.append(top);cell._tc.get_or_add_tcPr().append(border)
    gap(3)

para('Proposta comercial {{proposal.number}}','Title',after=4)
para('{{clientProposal.reviewLabel}}',size=9,bold=True,color='A51D2D',after=7)
para('{{client.companyName}}',size=11.5,bold=True,after=2)
para('Cliente {{client.code}} | CPF/CNPJ {{client.document}}',size=9.5,after=2)
para('Emissão {{proposal.date}} | Validade {{proposal.validUntil}}',size=9.5,after=6)
lead('Equipamento','{{equipment.name}} | {{equipment.power}} | Série {{equipment.serialNumber}}',after=3)
lead('Objetivo','{{clientProposal.objective}}',after=6)
region('manitec_compact_items',501)
para('!propostapecasresumo.dataset',after=0);gap(4)
para('!propostaservicosresumo.dataset',after=0);gap(3)
para('Descontos dos itens já incluídos nas linhas e nos subtotais.',size=8.5,after=5)
region('manitec_compact_items',501,False)
region('manitec_extended_summary',502)
finance([('Peças e materiais','{{proposal.summaryMaterialsTotal}}'),('Serviços e mão de obra','{{proposal.summaryLaborTotal}}')])
para('Subtotais líquidos. A relação completa de itens está nas páginas seguintes.',size=9,after=5)
region('manitec_extended_summary',502,False)
finance()
para('{{clientProposal.arithmeticNote}}',size=9,bold=True,color='A51D2D',after=0)
lead('Pagamento','{{clientProposal.payment}}',after=2)
para('{{clientProposal.paymentPending}}',size=9.5,color='A51D2D',after=4)
lead('Previsão de execução','{{clientProposal.execution}}',after=2)
para('{{clientProposal.scheduling}}',size=9.5,after=4)
lead('Peças','{{clientProposal.availability}}',after=2)
lead('Frete dos materiais','{{clientProposal.freight}}',after=2)
para('{{clientProposal.exclusions}}',size=9.5,after=0)

title=para('Detalhamento e condições gerais','Heading 1',after=6)
title.paragraph_format.page_break_before=True
region('manitec_extended_items',503)
para('!propostapecasresumo.dataset',after=0);gap(5)
para('!propostaservicosresumo.dataset',after=0);gap(5)
para('Descontos dos itens já considerados nas linhas e nos subtotais.',size=9,after=5)
para('Escopo e condições gerais','Heading 1')
region('manitec_extended_items',503,False)
heading('1 Atividades e entregas incluídas')
para('{{clientProposal.activities}}')
para('{{clientProposal.deliverables}}',size=10)
para('{{clientProposal.installationNote}}',after=0)
heading('2 Diagnóstico peças e agendamento')
para('{{clientProposal.partsTiming}}')
heading('3 Responsabilidades')
para('A Manitec executará os serviços e fornecerá os materiais discriminados. O cliente deve garantir acesso seguro ao equipamento e indicar um responsável para acompanhar o atendimento.')
heading('4 Faturamento e recebimento')
lead('Dados do cliente','{{client.companyName}} | CPF/CNPJ {{client.document}} | {{client.address}}',size=10)
para('{{proposal.paymentMethod}}',size=10)
para('{{clientProposal.paymentAllocation}}',size=10)
heading('5 Garantia')
para('{{clientProposal.warranty}}',size=10)
heading('6 Atraso no pagamento')
para('{{clientProposal.defaultTerms}}',size=10)
heading('7 Cancelamento')
para('{{clientProposal.cancellationTerms}}',size=10)
heading('8 Aceite')
para('O aceite deverá abranger os itens, os valores, o escopo e as condições gerais desta proposta, após a confirmação das pendências indicadas.',size=10)
para('Responsável pelo cliente ______________________________________________',size=10,after=3)
para('Cargo ___________________ Assinatura ___________________ Data ____/____/________',size=10,after=5)
lead('Contato comercial','{{consultant.name}} | {{consultant.email}} | {{consultant.phone}}',size=9,after=0)

doc.core_properties.title='Proposta comercial Manitec'
doc.core_properties.subject='Modelo v3 orientado à decisão do cliente'
doc.core_properties.author='Manitec'
doc.save(OUT/'template.docx')
schema=json.loads((BASE/'manitec-default-v2/schema.json').read_text(encoding='utf8'))
schema['version']='manitec-default-v3'
for key in ['reviewLabel','objective','displacementTotal','otherExpensesTotal','execution','scheduling','availability','payment','paymentPending','freight','exclusions','activities','deliverables','installationNote','partsTiming','paymentAllocation','arithmeticNote','defaultTerms','cancellationTerms','warranty']:
    schema['fields']['clientProposal.'+key]='Proposta ao cliente '+key
labels={'reviewLabel':'Situação de revisão da proposta','objective':'Objetivo do atendimento','displacementTotal':'Valor do deslocamento técnico','otherExpensesTotal':'Outras despesas operacionais','execution':'Previsão de execução e pendências','scheduling':'Condições de agendamento','availability':'Disponibilidade das peças','payment':'Resumo de pagamento','paymentPending':'Vencimentos pendentes de confirmação','freight':'Condições de frete dos materiais','exclusions':'Exclusões comerciais','activities':'Atividades incluídas','deliverables':'Entregas previstas no escopo','installationNote':'Condições de instalação quando contratada','partsTiming':'Diagnóstico disponibilidade e substituição de peças','paymentAllocation':'Orientação de faturamento e recebimento','arithmeticNote':'Divergência de valores','defaultTerms':'Condições de atraso no pagamento','cancellationTerms':'Condições de cancelamento','warranty':'Condições de garantia a confirmar'}
labels['footerLabel']='Identificação de prévia no rodapé'
for key,label in labels.items():schema['fields']['clientProposal.'+key]=label
(OUT/'schema.json').write_text(json.dumps(schema,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
definition={'title':'Proposta comercial {{proposal.number}}','sections':[{'paragraphs':['{{clientProposal.reviewLabel}}','{{client.companyName}}','{{clientProposal.objective}}','Valor total {{proposal.total}}','Pagamento {{clientProposal.payment}}','{{clientProposal.execution}}']}],'footer':['Proposta {{proposal.number}}']}
(OUT/'template.json').write_text(json.dumps(definition,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
sample=json.loads((BASE/'manitec-default-v2/sample-data.json').read_text(encoding='utf8'))
sample['metadata']['templateKey']='proposal/manitec-default-v3'
sample['clientProposal']={'reviewLabel':'DADOS DEMONSTRATIVOS | PRÉVIA PARA REVISÃO','objective':'Atendimento conforme o escopo descrito','displacementTotal':'R$ 0,00','otherExpensesTotal':'R$ 0,00','payment':'Condição de pagamento a confirmar','paymentPending':'Vencimentos a confirmar','execution':'Previsão a confirmar com o planejamento','scheduling':'Agendamento sujeito à aprovação e ao acesso ao equipamento','availability':'Disponibilidade a confirmar','freight':'Frete dos materiais a confirmar','exclusions':'Não incluídos os itens não discriminados nesta proposta','activities':sample['proposal']['scope'],'deliverables':'Entregas conforme o escopo contratado','installationNote':'','partsTiming':'Disponibilidade de peças e agendamento a confirmar. Não há promessa de substituição em prazo fixo.','paymentAllocation':'Confirmar o faturamento e os vencimentos antes da emissão','arithmeticNote':'','warranty':'Prazo e cobertura a confirmar','defaultTerms':'Modelo de referência prevê multa de 2%, juros de 1% ao mês e correção monetária; redação a confirmar','cancellationTerms':'Modelo de referência prevê multa de 10% sobre o serviço após cinco dias corridos; aplicação a confirmar'}
sample['clientProposal'].update(footerLabel='Exemplo | Prévia para revisão',extendedLayout=False)
sample['clientProposal']['activityParagraphs']=[{'description':line} for line in sample['clientProposal']['activities'].splitlines() if line.strip()]
(OUT/'sample-data.json').write_text(json.dumps(sample,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
(OUT/'README.md').write_text('# Proposta comercial Manitec v3\n\nResumo comercial antes das condições gerais, com tabelas separadas para peças e mão de obra. Sem capa institucional. Os campos `clientProposal.*` são calculados pela apresentação pública, sem alterar preços, aprovação ou cronograma financeiro.\n\nPendências de prazo, vencimentos e condições comerciais ficam explícitas. O gerador não cria prazos de garantia, promete disponibilidade, escolhe dias úteis/corridos ou divide pagamentos entre empresas. Instalação só recebe uma observação quando expressamente presente no escopo, sem normas presumidas.\n\nO v1, o v2, documentos congelados e publicações do Studio permanecem preservados. Para reconstruir o DOCX use `backend/scripts/build-proposal-template-v3.py` com python-docx.\n',encoding='utf8')
print('Modelo v3 criado; modelos anteriores preservados.')
