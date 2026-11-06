"""Restore the original cover and letterhead around the approved V4 body.

Reads the existing institutional assets; never changes the V1 or V4 templates.
"""
from copy import deepcopy
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile
import hashlib
import json

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from docx.shared import Mm, Pt, RGBColor, Twips

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'backend/src/templates/documents/proposal'
OUT = BASE / 'manitec-default-v5'
OUT.mkdir(exist_ok=True)
with ZipFile(BASE / 'manitec-default-v1/template.docx') as original:
    cover = original.read('word/media/image2.png')
    letterhead = original.read('word/media/image1.jpg')
assert hashlib.sha256(cover).hexdigest() == '37440c699cff811101cb51d21904d92ec8c08079c102b89370806980446e28ba'
assert hashlib.sha256(letterhead).hexdigest() == '6f48ff8d8a77709d87f081678c2bf82ab72d5e901120c4506858ccbd2c97081b'

doc = Document(BASE / 'manitec-default-v4/template.docx')
section = doc.sections[0]
section.top_margin = Mm(32)
section.bottom_margin = Mm(28)
section.header_distance = Mm(6)
section.footer_distance = Mm(6)

def clear(container):
    for child in list(container._element):
        container._element.remove(child)

def text(container, value, size=8, bold=False, color='64748B', align=WD_ALIGN_PARAGRAPH.CENTER):
    p = container.add_paragraph()
    p.alignment = align
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.line_spacing = 1
    run = p.add_run(value)
    run.font.name = 'Arial'
    run.font.size = Pt(size)
    run.bold = bold
    run.font.color.rgb = RGBColor.from_string(color)
    return p

# Dedicated empty parts prevent the institutional furniture appearing on the cover.
empty_header, empty_footer = section.first_page_header, section.first_page_footer
clear(empty_header)
empty_header.add_paragraph()
clear(empty_footer)
empty_footer.add_paragraph()
empty_header_id = doc.part.relate_to(empty_header.part, RT.HEADER)
empty_footer_id = doc.part.relate_to(empty_footer.part, RT.FOOTER)
section.different_first_page_header_footer = False

header = section.header
clear(header)
p = header.add_paragraph()
p.paragraph_format.space_before = Pt(0)
p.paragraph_format.space_after = Pt(1)
p.paragraph_format.line_spacing = 1
# Same source crop as the supplied Word; no raster modification or stretching.
visible_ratio = (384 / 2239) * (1 - 39086 / 100000)
shape = p.add_run().add_picture(BytesIO(letterhead), width=Mm(170), height=Mm(170 * visible_ratio))
fill = shape._inline.graphic.graphicData.pic.blipFill
crop = OxmlElement('a:srcRect')
crop.set('b', '39086')
fill.insert(1, crop)
shape._inline.docPr.set('descr', 'Cabeçalho institucional Manitec Grupos Geradores')
text(header, 'PROPOSTA COMERCIAL {{proposal.number}}', size=8, color='005AA8', align=WD_ALIGN_PARAGRAPH.RIGHT)

footer = section.footer
clear(footer)
p = text(footer, 'MANITEC GRUPOS GERADORES', size=8, bold=True, color='005AA8')
borders = OxmlElement('w:pBdr')
line = OxmlElement('w:top')
for key, value in [('val', 'single'), ('sz', '6'), ('space', '4'), ('color', '005AA8')]:
    line.set(qn('w:' + key), value)
borders.append(line)
p._p.get_or_add_pPr().append(borders)
text(footer, '+55 (19) 3894-5048  |  WhatsApp +55 (19) 3885-1458  |  comercial@manitec.com.br', size=7.5)
text(footer, 'www.manitec.com.br', size=7.5)
p = text(footer, 'Proposta {{proposal.number}} | {{clientProposal.footerLabel}}\tPágina ', size=7.5, align=WD_ALIGN_PARAGRAPH.LEFT)
p.paragraph_format.tab_stops.add_tab_stop(Twips(9638), WD_ALIGN_PARAGRAPH.RIGHT)
for instruction in ['PAGE', 'NUMPAGES']:
    if instruction == 'NUMPAGES':
        run = p.add_run(' de ')
        run.font.name, run.font.size = 'Arial', Pt(7.5)
    field = OxmlElement('w:fldSimple')
    field.set(qn('w:instr'), instruction)
    p._p.append(field)

# The approved commercial body stays native/editable. Its large opening logo is
# replaced by the institutional letterhead; all commercial blocks are retained.
opening = doc.paragraphs[0]
assert opening._p.xpath('.//w:drawing')
opening._p.getparent().remove(opening._p)

cover_p = doc.add_paragraph()
cover_p.paragraph_format.space_after = Pt(0)
cover_p.paragraph_format.line_spacing = Pt(1)
inline = cover_p.add_run().add_picture(BytesIO(cover), width=Mm(210), height=Mm(210 * 1491 / 1055))._inline
inline.docPr.set('descr', 'Capa institucional Manitec com grupos geradores Generac')
anchor = OxmlElement('wp:anchor')
for key, value in [('distT', '0'), ('distB', '0'), ('distL', '0'), ('distR', '0'), ('simplePos', '0'), ('relativeHeight', '0'), ('behindDoc', '1'), ('locked', '0'), ('layoutInCell', '1'), ('allowOverlap', '1')]:
    anchor.set(key, value)
simple = OxmlElement('wp:simplePos')
simple.set('x', '0')
simple.set('y', '0')
anchor.append(simple)
for axis in ['H', 'V']:
    position = OxmlElement('wp:position' + axis)
    position.set('relativeFrom', 'page')
    offset = OxmlElement('wp:posOffset')
    offset.text = '0'
    position.append(offset)
    anchor.append(position)
anchor.append(deepcopy(inline.extent))
anchor.append(OxmlElement('wp:wrapNone'))
for child in list(inline):
    if child.tag != qn('wp:extent'):
        anchor.append(deepcopy(child))
inline.getparent().replace(inline, anchor)

cover_section = deepcopy(section._sectPr)
for node in list(cover_section):
    if node.tag in [qn('w:headerReference'), qn('w:footerReference'), qn('w:titlePg'), qn('w:pgNumType')]:
        cover_section.remove(node)
for kind, rid in [('headerReference', empty_header_id), ('footerReference', empty_footer_id)]:
    ref = OxmlElement('w:' + kind)
    ref.set(qn('w:type'), 'default')
    ref.set(qn('r:id'), rid)
    cover_section.insert(0, ref)
for key in ['top', 'right', 'bottom', 'left', 'header', 'footer']:
    cover_section.pgMar.set(qn('w:' + key), '0')
cover_section.get_or_add_type().set(qn('w:val'), 'nextPage')
break_p = doc.add_paragraph()
break_p.paragraph_format.space_after = Pt(0)
break_p.paragraph_format.line_spacing = Pt(1)
break_p._p.get_or_add_pPr().append(cover_section)
body = doc._element.body
body.insert(0, cover_p._p)
body.insert(1, break_p._p)

settings = doc.settings.element
update = settings.find(qn('w:updateFields'))
if update is None:
    update = OxmlElement('w:updateFields')
    settings.append(update)
update.set(qn('w:val'), 'true')
doc.core_properties.subject = 'Capa e papel timbrado institucional com o conteúdo comercial aprovado'
doc.save(OUT / 'template.docx')

for name in ['schema.json', 'sample-data.json', 'template.json']:
    data = json.loads((BASE / 'manitec-default-v4' / name).read_text(encoding='utf8'))
    if name == 'schema.json':
        data['version'] = 'manitec-default-v5'
    if name == 'sample-data.json':
        data['metadata']['templateKey'] = 'proposal/manitec-default-v5'
    (OUT / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
(OUT / 'README.md').write_text('''# Proposta Manitec v5

Restaura a capa institucional completa, o timbrado e os contatos de rodapé do
modelo original, mantendo o corpo comercial aprovado da v4.

Construção: `backend/scripts/build-proposal-template-v5.py`. O construtor lê a
v4 e reutiliza os bytes das duas imagens da v1, idênticos aos do Word fornecido.
Não depende de Downloads, não edita imagens nem sobrescreve versões anteriores.

A capa usa seção própria A4, sem cabeçalho/rodapé sobreposto. Todas as páginas
de conteúdo usam cabeçalho institucional, contatos e Página X de Y; a capa
integra a contagem. Dados de faturamento permanecem no corpo comercial.

O PDF deriva do Word pelo serviço existente. Modelos publicados no Studio
mantêm prioridade; snapshots de documentos aprovados permanecem preservados.
''', encoding='utf8')
print('Modelo v5 criado com capa e papel timbrado originais. Versões anteriores preservadas.')
