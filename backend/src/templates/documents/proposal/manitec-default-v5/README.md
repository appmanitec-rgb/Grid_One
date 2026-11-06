# Proposta Manitec v5

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
