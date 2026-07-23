# Ciclo 20F - Modelos institucionais DOCX/PDF

## 1. Resumo executivo

O Ciclo 20F substituiu o caminho principal de "imprimir tela" por geracao server-side de documento institucional DOCX para documentos do hub operacional. Proposta, contrato e O.S. agora podem gerar/baixar DOCX versionado, salvo em storage privado e registrado em `DocumentDelivery` com template, versao, checksum, MIME, tamanho e snapshot sem `storageKey`.

O PDF server-side do Ciclo 19 foi preservado como fallback temporario. Na continuidade do 20F, a proposta passou a usar `template.docx` real quando disponivel e ganhou conversao local DOCX -> PDF via LibreOffice headless em endpoint separado.

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

Implementado inicialmente no fechamento do 20F:

```text
template institucional estruturado
-> DOCX final server-side
-> storage privado
-> DocumentDelivery
```

Implementado na continuidade com modelo Word real da proposta:

```text
template.docx da proposta
-> DOCX final
-> PDF por LibreOffice/headless
-> storage privado
-> DocumentDelivery
```

O endpoint legado `/download-pdf` foi mantido. O novo PDF institucional da proposta usa rota separada para permitir homologacao visual antes da virada completa.

## 9. Limitacoes tecnicas

- `template.docx` oficial foi fornecido apenas para proposta; contrato, O.S. e laudo ainda usam base/fallback estruturado.
- O PDF institucional por DOCX depende de LibreOffice instalado no servidor/container.
- A conversao DOCX -> PDF foi testada localmente, mas ainda exige homologacao visual fina em staging/producao.
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
- Status do conversor LibreOffice e geracao PDF a partir do DOCX.
- Bloqueio indireto de dados sensiveis no conteudo gerado.

## 12. E2E

Alterados:

- `frontend/e2e/ux-operational.spec.ts`
- `frontend/e2e/commercial-contract-finance.spec.ts`

Cobertura:

- Admin baixa DOCX institucional da proposta.
- Documento nao depende de print da tela.
- Documento baixa como arquivo DOCX OpenXML valido.
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
- `npm test -- --runInBand`: passou; 35 suites / 200 testes.
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

- O modelo Word institucional da proposta ainda precisa homologacao visual humana.
- PDF final a partir de DOCX exige LibreOffice/headless ou conversor equivalente no servidor.
- Laudo tecnico ainda usa PDF server-side proprio como caminho oficial.
- `DocumentAccessType.PDF_DOWNLOAD` ainda nao diferencia semanticamente DOCX por enum.
- Validacao visual fina do DOCX em Microsoft Word/LibreOffice ainda precisa etapa manual.

## 15. Pendencias

- Homologar visualmente `template.docx` da proposta em Word/LibreOffice.
- Migrar contrato, O.S. e laudo para `template.docx` oficial quando os modelos forem aprovados.
- Migrar laudo tecnico para DOCX institucional em ciclo dedicado.
- Avaliar migration futura para `DOCUMENT_DOWNLOAD` ou `DOCX_DOWNLOAD`.
- Criar preview seguro de documento gerado sem depender da tela do ERP.

## 16. Proximo ciclo recomendado

`20G - Responsividade, zoom e baseline visual`.

Antes do 20G, recomenda-se validar manualmente um DOCX de proposta, contrato e O.S. em Word/LibreOffice para ajustar margens, estilos e identidade visual fina.

## 17. Atualizacao - template Word da proposta e LibreOffice local

Depois do fechamento inicial do 20F, foi adicionado o arquivo Word oficial da proposta em:

- `backend/src/templates/documents/proposal/manitec-default-v1/template.docx`

O backend agora segue esta ordem:

```text
template.docx existente
-> substituicao server-side de placeholders
-> DOCX final
-> conversao opcional via LibreOffice headless
-> PDF institucional
-> storage privado
-> DocumentDelivery
```

Se `template.docx` nao existir em um modelo, o renderer continua usando `template.json` como fallback.

Configuracao local recomendada:

```env
LIBREOFFICE_BIN="C:\Program Files\LibreOffice\program\soffice.exe"
LIBREOFFICE_TIMEOUT_MS="60000"
```

Fatos validados localmente nesta retomada:

- `template.docx` real detectado em `proposal/manitec-default-v1`.
- LibreOffice encontrado em `C:\Program Files\LibreOffice\program\soffice.exe`.
- Conversao real DOCX -> PDF testada localmente; PDF gerado com assinatura `%PDF`.
- Backend passou com 35 suites / 200 testes.
- Frontend `npm run lint` passou.
- Frontend `npm run build` passou apos liberar rede para download das fontes Google do Next.
- Frontend `npm run e2e` passou com 50 testes e 1 staging remoto skipado.

Novos endpoints de PDF institucional da proposta:

- `GET /documents/proposals/:id/download-document-pdf`
- `GET /customer-portal/proposals/:id/download-document-pdf`

Os endpoints antigos `/download-pdf` foram preservados como compatibilidade para o PDF server-side anterior. A virada completa para o PDF institucional deve ser feita depois de homologacao visual do Word e da conversao em ambiente real.

Pendencias ainda verdadeiras:

- Contrato, O.S. e laudo ainda nao foram migrados completamente para `template.docx` oficial.
- A qualidade visual final depende de validacao manual no Word/LibreOffice.
- Em producao/staging, o servidor ou container do backend precisa ter LibreOffice instalado.
