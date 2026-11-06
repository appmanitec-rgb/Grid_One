# PDF com o modelo do Word — correção de 27 e 28/10/2026

## Continuidade em 28/10/2026

Foi identificada uma segunda causa da falha intermitente: uma conversão respondeu com sucesso na API após **54.552 ms**, enquanto o proxy do Next.js instalado encerrava requisições após **30.000 ms**. O frontend então mostrava `Internal Server Error`/`ECONNRESET`, apesar de a API conseguir gerar o documento.

O limite do proxy foi ajustado para **90 segundos**, acima do limite padrão de **60 segundos** da conversão Word. A autenticação, os limites de arquivo e os arquivos aprovados não foram alterados. A validação complementar usa o proxy real do Next.js e servidores temporários em loopback para simular uma resposta de 35 segundos, além de repetir os downloads pela porta 3002.

**Resultado em 28/10:** a resposta controlada de 35 segundos atravessou o proxy em **35.271 ms**, com **HTTP 200** e uma única requisição. O teste usou a configuração da compilação entregue, não um valor simulado. Os servidores temporários foram encerrados ao final.

Os downloads reais também foram repetidos via **3002/api**: cópia PDF de **614.355 bytes** e prévia do rascunho de **622.556 bytes**, ambas com sucesso. A comparação confirmou os mesmos hashes dos originais aprovados, rascunho inalterado pela consulta e bloqueios de acesso preservados. Tipos, lint da configuração e build foram aprovados novamente. Evidências: `proxy-timeout-results.json` e `api-proxy-results.json`.

## Causa confirmada

A proposta de teste **20024/00** tinha dois arquivos diferentes congelados na aprovação:

- PDF de **6.329 bytes**, produzido pelo renderizador textual antigo;
- DOCX de **2.317.837 bytes**, contendo capa, imagens e tabelas institucionais.

Na cópia isolada não havia modelo ativo publicado no Studio. Nessa situação, a prévia/congelamento usava o PDF textual, enquanto o DOCX vinha do modelo institucional Word. Além disso, os downloads antigos podiam capturar falha do conversor e devolver silenciosamente outro PDF simplificado. A correção anterior havia resolvido a exibição do PDF no navegador, mas não essa divergência entre os arquivos gerados.

O LibreOffice estava instalado. O diagnóstico de conversão falhou com o launcher Windows e o prazo antigo; o executável de console, em perfil temporário separado, converteu o mesmo DOCX em aproximadamente 14,4 segundos. A execução em console segue a [documentação oficial do LibreOffice para linha de comando](https://help.libreoffice.org/latest/en-GB/text/shared/guide/start_parameters.html?DbPAR=WRITER&System=WIN).

## Correção

1. Novas prévias e novos PDFs de propostas passam pela geração do DOCX e pela conversão desses mesmos bytes para PDF. Isso também vale para o modelo institucional quando não há publicação ativa no Studio.
2. O congelamento recebe o mesmo DOCX usado na conversão, evitando versões diferentes entre os dois formatos. A publicação de modelos continua fora desta tarefa.
3. Falhas do conversor deixam de produzir um PDF de texto apresentado como se fosse o modelo. O erro é propagado e o Word continua disponível.
4. No Windows, o conversor prefere `soffice.com`, usa o diretório do executável e mantém um perfil temporário exclusivo por conversão. O prazo padrão passou de 15 para 60 segundos; a configuração explícita existente continua sendo respeitada.
5. Os PDFs/DOCX aprovados existentes permanecem imutáveis. Para visualizar e baixar o layout do Word da 20024/00, foi acrescentada uma **cópia convertida do Word aprovado**, com nome `proposta-20024-00-copia-word.pdf`. O PDF anterior permanece acessível em **PDF aprovado original**.
6. A tela identifica **Visualizar PDF do Word**, **Baixar PDF do Word** e **PDF aprovado original**, explicando a distinção. Os controles da prévia receberam uma superfície opaca para leitura.

O novo endpoint `GET /documents/proposals/:id/download-approved-word-pdf` usa os mesmos guardas de autenticação e a validação existente de acesso, cliente, carteira e aprovação. Não usa um modelo atual para substituir o Word congelado. Sem Word aprovado, recusa a conversão. O checksum do DOCX de origem fica na auditoria da cópia.

## Verificação

Ambiente confirmado: frontend **127.0.0.1:3002**, API **127.0.0.1:3005**, banco **gridone_proposals_f1_20261023**. Entregas externas e automações agendadas desativadas.

| Verificação | Resultado |
| --- | --- |
| Regressão backend | **24 suítes, 205 testes aprovados** |
| Documentos após os ajustes finais | **8 suítes, 39 testes aprovados** |
| Regressão pura frontend | **40 testes aprovados** |
| Tipos, lint e builds isolados | Aprovados; logs locais por etapa |
| Download real no navegador | Botão **Baixar PDF do Word** entregou arquivo de **614.355 bytes** |
| Arquivo efetivamente baixado | PDF A4 de nove páginas; primeira página contém duas imagens, incluindo a capa |
| Visualização no navegador | Capa e página de dados percorridas no visualizador |
| Documento original | Hash do PDF aprovado permaneceu `5dfb185060a49238165419edce03c6f35ed954eab028ef70bf92427f45c7842b` |
| Word original | Hash permaneceu `c4463500a13b4875e8b1b56fa5b52add62bc006ceccd86ce2569ba417cf6888a` |
| Permissões e status | Acesso sem autenticação recusado; tentativa de copiar Word de rascunho recusada com 403 |
| Rascunho 20025/00 | Nova prévia com o modelo Word, **622.556 bytes**, total **R$ 1.111,04**, sem o texto de observações internas |
| Preservação do rascunho | GET da prévia não alterou data/status/total nem criou snapshot aprovado |

As cópias de teste geraram registros de arquivo e acesso internos, como os downloads existentes. Não houve envio externo, aprovação de proposta, alteração de permissões, migração, commit, push ou mudança nos servidores principais.

## Arquivos e evidências

- Backend: `documents.service.ts`, `documents.controller.ts`, `document-generation.service.ts`, `docx-to-pdf.service.ts` e os testes correspondentes.
- Frontend: `lib/dashboard-documents.ts`, `app/dashboard/documents/proposals/[id]/page.tsx` e `next.config.ts`.
- Evidências privadas locais: `runtime-logs/pdf-template-20261027/`, incluindo `diagnosis.json`, `api-results.json`, `pdf-inspection.json`, resultados de testes, logs de build, arquivo baixado pelo navegador e capturas.

## Limites

- A cópia do Word não substitui nem altera o PDF aprovado anteriormente. Sua origem e seu nome distinguem os dois arquivos.
- O Word aprovado contém quebras de página explícitas. A conversão resultou em nove páginas, com seus espaços e divisões; não houve reedição do conteúdo ou compactação desse documento histórico. A inspeção das páginas foi feita para conferir a aplicação do modelo, sem declarar uma nova homologação editorial do contrato.
- A conversão depende do LibreOffice no servidor e das fontes disponíveis. Esta correção foi verificada no Windows local; outros servidores precisam de conferência antes de implantação.
- A validação geral de produção continua sujeita às pendências já registradas em [Revisão de UX ADMIN](ux-admin-20261026-validacao.md).
