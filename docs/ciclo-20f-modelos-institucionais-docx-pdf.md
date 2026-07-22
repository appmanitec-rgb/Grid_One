# Ciclo 20F - Modelos institucionais DOCX/PDF

## 1. Resumo executivo

O Ciclo 20F substituiu o caminho principal de "imprimir tela" por geracao server-side de documento institucional DOCX para documentos do hub operacional. Proposta, contrato e O.S. agora podem gerar/baixar DOCX versionado, salvo em storage privado e registrado em `DocumentDelivery` com template, versao, checksum, MIME, tamanho e snapshot sem `storageKey`.

O PDF server-side do Ciclo 19 foi preservado como fallback temporario. A conversao DOCX -> PDF nao foi declarada homologada porque nao ha LibreOffice/headless configurado nem modelo Word binario oficial fornecido.

## 2. Commit base

Base: `5157e9c feat: ciclo 20e links inteligentes navegacao cruzada`.

## 3. Onde existia impressao da tela

| Area | Evidencia antes do ciclo | Acao no 20F |
| --- | --- | --- |
| Shell de documentos | `frontend/app/dashboard/documents/DocumentPrintKit.tsx` tinha `window.print()` e botao `Imprimir / salvar PDF`. | Removido o acionamento de print do navegador. |
| Contrato | `frontend/app/dashboard/documents/contracts/[id]/page.tsx` usava `PrintDocumentShell` com acao default de print. | Passou a usar botao `Gerar/Baixar documento` via backend. |
| O.S. | `frontend/app/dashboard/documents/orders/[id]/page.tsx` usava `PrintDocumentShell` com acao default de print. | Passou a usar botao `Gerar/Baixar documento` via backend. |
| Laudo interno | `frontend/app/dashboard/relatorios-tecnicos/[id]/page.tsx` abria HTML de `/service-reports/:id/print`. | Botao removido. PDF binario server-side permanece. |
| Laudo portal | `frontend/app/portal/laudos/[id]/page.tsx` abria HTML de `/customer-portal/service-reports/:id/print`. | Botao removido. Download PDF binario permanece. |
| HTML legado de laudo | `backend/src/modules/service-reports/service-reports.service.ts` autoexecutava `window.print()` quando `?print=1`. | Auto-print removido. Rota HTML fica apenas como fallback legado. |

## 4. O que foi substituido

- Proposta interna: botao principal agora baixa DOCX em `/documents/proposals/:id/download-docx`.
- Proposta no portal: cliente baixa DOCX em `/customer-portal/proposals/:id/download-docx`.
- Contrato: novo endpoint `/documents/contracts/:id/download-docx`.
- O.S.: novo endpoint `/documents/orders/:id/download-docx`.
- Páginas de proposta/contrato/O.S. exibem metadados do ultimo documento institucional gerado quando existe.
- Screenshots gerados pelo E2E que ficaram em loading foram restaurados e nao entraram no diff.

## 5. Arquitetura do motor DOCX/template

Arquivos principais:

- `backend/src/modules/documents/document-template.service.ts`
- `backend/src/modules/documents/docx-template-renderer.service.ts`
- `backend/src/modules/documents/institutional-document.service.ts`
- `backend/src/modules/documents/document-generation.service.ts`
- `backend/src/modules/documents/documents.service.ts`
- `backend/src/modules/file-storage/file-storage.service.ts`

Fluxo:

```text
registro
-> payload institucional normalizado
-> template versionado em backend/src/templates/documents
-> validacao de variaveis obrigatorias
-> render DOCX Office Open XML server-side
-> storage privado
-> DocumentDelivery
-> download autorizado
```

## 6. Tipos de documento cobertos

| Tipo | Status 20F | Observacao |
| --- | --- | --- |
| Proposta | Implementado | Interno e portal baixam DOCX institucional. PDF Ciclo 19 continua fallback. |
| Contrato | Implementado no hub interno | Gera DOCX institucional pelo backend. |
| O.S. | Implementado no hub interno | Gera DOCX institucional pelo backend. |
| Laudo tecnico | Preparado parcialmente | Template/schema DOCX criados; fluxo principal segue PDF binario existente por causa de versionamento/evidencias/retencao. |
| Public share/verify | Sem mudanca funcional pesada | Mantem PDF/validacao existentes, sem print de tela. |

## 7. Variaveis suportadas

Payload padrao:

- `company`
- `client`
- `contact`
- `record`
- `equipment`
- `items`
- `commercialTerms`
- `technicalScope`
- `signatures`
- `metadata`

Aliases por documento:

- `proposal`
- `contract`
- `workOrder`
- `serviceReport`

Templates criados:

- `backend/src/templates/documents/proposal/manitec-default-v1`
- `backend/src/templates/documents/contract/manitec-default-v1`
- `backend/src/templates/documents/work-order/manitec-default-v1`
- `backend/src/templates/documents/service-report/manitec-default-v1`

## 8. Estrategia DOCX/PDF usada

Implementado:

```text
template institucional estruturado
-> DOCX final server-side
-> storage privado
-> DocumentDelivery
```

Nao implementado como homologado:

```text
DOCX oficial Word binario da Manitec
-> DOCX final
-> PDF por LibreOffice/headless
```

Motivo: nao ha arquivo Word institucional binario fornecido nem conversor LibreOffice/headless configurado no ambiente. O relatorio e o provider registram `pdfFromDocx.available=false`.

## 9. Limitacoes tecnicas

- `template.docx` oficial ainda nao foi fornecido; a fonte versionada atual e `template.json`.
- O DOCX gerado e Office Open XML simples, adequado para documento institucional basico, mas ainda nao substitui uma homologacao visual fina no Word.
- PDF por DOCX depende de conversor externo e fica pendente.
- Laudo tecnico ainda precisa ciclo dedicado para migrar DOCX sem quebrar QR, evidencias, aceite, versoes, retencao e links publicos.
- O enum de auditoria continua com `PDF_DOWNLOAD`; sem migration, o download DOCX reaproveita esse tipo historico e diferencia pelo `mimeType`/`provider`.

## 10. RBAC

- Interno usa `AuthGuard`, `AccessPolicyGuard` e as validacoes existentes de `DocumentsService`.
- Proposta exige acesso a propostas para usuario interno ou cliente vinculado ao mesmo `clientId`.
- Contrato exige acesso a contratos para usuario interno ou cliente vinculado ao mesmo `clientId`.
- O.S. exige acesso a ordens para usuario interno ou cliente vinculado ao cliente do equipamento.
- Portal de proposta usa `downloadCustomerProposalDocx`, herdando a mesma checagem de cliente vinculado.
- O DOCX nao inclui custo HH, margem, custo interno, notas administrativas, `storageKey` ou campos de RBAC.

## 11. Testes backend

Criados/alterados:

- `backend/src/modules/documents/docx-template-renderer.service.spec.ts`
- `backend/src/modules/documents/document-generation.service.spec.ts`
- `backend/src/modules/documents/documents.service.spec.ts`

Cobertura:

- Carregamento de template institucional.
- Variaveis simples.
- Tabelas/listas.
- Campos opcionais.
- DOCX real com assinatura ZIP `PK`.
- Checksum SHA-256.
- Registro de template/versao.
- Storage e `DocumentDelivery`.
- Fallback honesto de PDF por DOCX indisponivel.
- Bloqueio indireto de dados sensiveis no conteudo gerado.

## 12. E2E

Alterados:

- `frontend/e2e/ux-operational.spec.ts`
- `frontend/e2e/commercial-contract-finance.spec.ts`

Cobertura:

- Admin baixa DOCX institucional da proposta.
- Documento nao depende de print da tela.
- Documento contem template/versao.
- Cliente correto baixa DOCX da proposta pelo portal.
- Cliente errado nao baixa DOCX da proposta.
- Botao antigo de PDF profissional foi substituido por `Gerar/Baixar documento`.

## 13. Validacoes executadas

Backend:

- `npm run env:check`: passou.
- `npm run db:preflight`: passou.
- `npx prisma migrate status`: passou; 45 migrations, schema atualizado.
- `npm run lint`: passou.
- `npm run build`: passou.
- `npm test -- --runInBand`: passou; 35 suites / 198 testes.
- `npm run seed:flow`: primeira tentativa falhou por `SEED_DEMO_PASSWORD` ausente; repetido com variavel temporaria de processo e passou.

Frontend:

- `npm run lint`: passou.
- `npm run build`: primeira tentativa falhou por rede bloqueada em Google Fonts; repetido com rede liberada e passou.
- `npm run e2e -- e2e/commercial-contract-finance.spec.ts`: passou; 2 testes.
- `npm run e2e`: passou; 50 testes, 1 staging remoto skipado.

Git:

- `git diff --check`: passou.
- `git diff --cached --check`: passou.
- Checagem de escopo: nao retornou `staging`, `reconciliation`, `schema.prisma`, `migration`, `.env`, `log`, `cache` ou screenshots no diff final.

## 14. Riscos restantes

- O modelo Word institucional oficial da Manitec ainda precisa ser fornecido/homologado.
- PDF final a partir de DOCX exige LibreOffice/headless ou conversor equivalente.
- Laudo tecnico ainda usa PDF server-side proprio como caminho oficial.
- `DocumentAccessType.PDF_DOWNLOAD` ainda nao diferencia semanticamente DOCX por enum.
- Validacao visual fina do DOCX em Microsoft Word/LibreOffice ainda precisa etapa manual.

## 15. Pendencias

- Substituir `template.json` por `template.docx` oficial quando o arquivo institucional existir.
- Implementar conversao DOCX -> PDF se houver LibreOffice/headless homologado.
- Migrar laudo tecnico para DOCX institucional em ciclo dedicado.
- Avaliar migration futura para `DOCUMENT_DOWNLOAD` ou `DOCX_DOWNLOAD`.
- Criar preview seguro de documento gerado sem depender da tela do ERP.

## 16. Proximo ciclo recomendado

`20G - Responsividade, zoom e baseline visual`.

Antes do 20G, recomenda-se validar manualmente um DOCX de proposta, contrato e O.S. em Word/LibreOffice para ajustar margens, estilos e identidade visual fina.
