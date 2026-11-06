"""Add category payment cards and a spacious acceptance signature to V5."""
from pathlib import Path
import json
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, Twips, RGBColor
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT

ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'backend/src/templates/documents/proposal'
OUT=BASE/'manitec-default-v6'
OUT.mkdir(exist_ok=True)
doc=Document(BASE/'manitec-default-v5/template.docx')

def paragraph(value,style=None,size=10,after=3,bold=False,keep=False):
    p=doc.add_paragraph(value,style)
    p.paragraph_format.space_after=Pt(after)
    p.paragraph_format.keep_with_next=keep
    p.paragraph_format.keep_together=True
    for r in p.runs:
        r.font.name='Arial';r.font.size=Pt(size);r.bold=bold
    return p

anchor=next(p for p in doc.paragraphs if p.text=='6 ESCOPO E EXCLUSÕES' or p.text.strip()=='6 ESCOPO E EXCLUSÕES')
heading=paragraph('5.2 DADOS DE PAGAMENTO','Heading 2',size=11,bold=True,keep=True)
anchor._p.addprevious(heading._p)
table=doc.add_table(rows=1,cols=2)
table.alignment=WD_TABLE_ALIGNMENT.CENTER
table.autofit=False
for c in table.columns:c.width=Twips(4819)
props=table._tbl.tblPr
margin=OxmlElement('w:tblCellMar')
for side,value in [('top','95'),('bottom','95'),('left','135'),('right','135')]:
    n=OxmlElement('w:'+side);n.set(qn('w:w'),value);n.set(qn('w:type'),'dxa');margin.append(n)
props.append(margin)
borders=OxmlElement('w:tblBorders')
for side in ['top','bottom','left','right','insideV']:
    n=OxmlElement('w:'+side);n.set(qn('w:val'),'single');n.set(qn('w:sz'),'4');n.set(qn('w:color'),'D9E2EB');borders.append(n)
props.append(borders)
no_split=OxmlElement('w:cantSplit');table.rows[0]._tr.get_or_add_trPr().append(no_split)
for cell,category in zip(table.rows[0].cells,['services','parts']):
    cell.width=Twips(4819);cell.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.TOP
    for i,key in enumerate(['value','company','cnpj','bank','agency','account','pix','method']):
        p=cell.paragraphs[0] if i==0 else cell.add_paragraph()
        p.paragraph_format.space_after=Pt(1)
        p.paragraph_format.line_spacing=1.03
        r=p.add_run('{{proposalPayment.'+category+'.'+key+'}}')
        r.font.name='Arial';r.font.size=Pt(9.5)
        if key in ['value','company']:r.bold=True
        if key=='value':r.font.color.rgb=RGBColor.from_string('005AA8')
anchor._p.addprevious(table._tbl)
for key in ['entryInstruction','transferInstruction','adjustmentNote']:
    p=paragraph('{{proposalPayment.'+key+'}}',size=9.5,after=2)
    anchor._p.addprevious(p._p)

# Keep payment data in the commercial section, with a cross-reference in terms.
for p in list(doc.paragraphs):
    if p.text=='{{brandedProposal.receivingDetails}}':
        p.text='{{proposalPayment.reference}}'
    elif p.text=='{{brandedProposal.billingNote}}':
        p._p.getparent().remove(p._p)

signature=next(p for p in doc.paragraphs if p.text.startswith('Responsável pelo cliente:'))
old_date=next(p for p in doc.paragraphs if p.text.startswith('Cargo:'))
for value,after in [
    ('Assinatura do responsável: __________________________________________',16),
    ('Nome do responsável: ______________________________________________',16),
    ('Data: ______ / ______ / __________',0),
]:
    p=paragraph(value,size=10.5,after=after,keep=after>0)
    if value.startswith('Assinatura'):p.paragraph_format.space_before=Pt(16)
    signature._p.addprevious(p._p)
signature._p.getparent().remove(signature._p)
old_date._p.getparent().remove(old_date._p)
doc.core_properties.subject='Capa institucional, pagamentos por categoria e assinatura do responsável'
doc.save(OUT/'template.docx')

schema=json.loads((BASE/'manitec-default-v5/schema.json').read_text(encoding='utf8'))
schema['version']='manitec-default-v6'
labels={'value':'Valor','company':'Favorecido','cnpj':'CNPJ do favorecido','bank':'Banco','agency':'Agência','account':'Conta','pix':'Chave PIX','method':'Instruções de boleto'}
for category,label in [('services','serviços'),('parts','peças')]:
    for key,title in labels.items():schema['fields']['proposalPayment.'+category+'.'+key]=title+' de '+label
for key,label in [('entryInstruction','Instrução de entrada e saldo'),('transferInstruction','Instrução de pagamento por favorecido'),('adjustmentNote','Composição de despesas e desconto'),('reference','Referência aos dados de pagamento')]:schema['fields']['proposalPayment.'+key]=label
(OUT/'schema.json').write_text(json.dumps(schema,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
sample=json.loads((BASE/'manitec-default-v5/sample-data.json').read_text(encoding='utf8'))
sample['metadata']['templateKey']='proposal/manitec-default-v6'
sample['proposalPayment']={
    'services':{'value':'VALOR DE SERVIÇOS: '+sample['proposal']['summaryLaborTotal'],'company':'MANITEC SERVICES GERADORES LTDA','cnpj':'CNPJ: 24.878.520/0001-60','bank':'Banco: Santander','agency':'Agência: 3729','account':'Conta: 13003264-4','pix':'CHAVE PIX: 24878520000160','method':''},
    'parts':{'value':'VALOR DE PEÇAS: '+sample['proposal']['summaryMaterialsTotal'],'company':'MANITEC ENERGIA EQUIPAMENTOS LTDA','cnpj':'CNPJ: 39.315.244/0001-07','bank':'Banco: Santander','agency':'Agência: 0157','account':'Conta: 1300575-2','pix':'CHAVE PIX: 39315244000107','method':''},
    'entryInstruction':'O pagamento segue a condição e os vencimentos indicados nesta proposta.',
    'transferInstruction':'Pague cada categoria na conta do respectivo favorecido e identifique o número da proposta no comprovante.',
    'adjustmentNote':'',
    'reference':'Dados bancários e instruções no quadro Dados de pagamento das condições comerciais.',
}
(OUT/'sample-data.json').write_text(json.dumps(sample,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
(OUT/'template.json').write_bytes((BASE/'manitec-default-v5/template.json').read_bytes())
(OUT/'README.md').write_text('''# Proposta Manitec v6

Preserva capa, cabeçalho e rodapé institucionais da v5. Acrescenta os quadros
de pagamento de serviços e peças nas condições comerciais e assinatura final
com assinatura, nome e data em linhas separadas e espaçadas.

Construção: `backend/scripts/build-proposal-template-v6.py`. Dados bancários
seguem exclusivamente o snapshot da conta selecionada, cadastrada no Studio
em Dados > Contas para Propostas. Não existem contas bancárias de reserva no
gerador. Campos ausentes aparecem como “A definir”. Alterações no cadastro
entram em novas propostas ou ao salvar novamente a seleção de um rascunho;
documentos emitidos conservam os dados aprovados e exigem uma revisão.
Valores por categoria são os itens líquidos. Despesas e desconto geral seguem
o resumo e não recebem uma distribuição fiscal inventada. Entrada e saldo
seguem os valores cadastrados; não se criam vencimentos.

Nenhuma regra de aprovação, recebíveis ou confirmação financeira foi alterada.
As versões anteriores e documentos aprovados permanecem preservados.
''',encoding='utf8')
print('Modelo v6 criado; capa e versões anteriores preservadas.')
