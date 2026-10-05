# Auditoria geral do GridOne — 05/10/2026

## Escopo e decisão

Revisão de código, documentação, configuração local, banco e testes. Não houve emissão fiscal, envio bancário, alteração de dados de negócio nem teste com clientes reais. Este relatório distingue falha reproduzida, função ausente no código e homologação ainda sem evidência. **O sistema ainda não está aprovado para operação fiscal/bancária real nem para piloto formal.** Isso não impede uso local dos módulos já operacionais com os controles atuais.

Versão auditada: branch `fix/studio-word-template-workflow`, commit `abf3784`. O código desse commit foi enviado ao GitHub antes desta auditoria. O próprio relatório é uma entrega adicional posterior ao commit auditado.

### Atualização da Etapa 1 — 05/10/2026

O commit `f2f1517` corrigiu os três fixtures de teste, regularizou a formatação e a tipagem apontadas pelo lint e reforçou o teste Playwright da edição sobreposta de modelos. Na versão desse commit, passaram localmente: lint backend (zero erros/avisos), lint frontend, 338 testes unitários backend, 5 E2E backend e builds backend/frontend. O Playwright encontrou o teste atualizado, mas ele não foi executado contra o banco operacional porque cria e altera registros. O commit foi enviado ao GitHub; a conclusão do GitHub Actions ainda não pôde ser consultada nesta sessão. Assim, o gate **local** está verde e a confirmação **remota** permanece pendente.

## Evidência verificada na linha de base (`abf3784`)

| Área | Resultado | Implicação |
| --- | --- | --- |
| Ambiente local | `npm run env:check` passou; ambiente `development`, armazenamento `local` | Desenvolvimento funcional; não comprova configuração de produção |
| Banco | `npm run db:preflight` e `npm run db:status` passaram; 97 migrations aplicadas em `gridone_db` | Esquema local atualizado |
| API | `/health` respondeu 200; `/health/db` e `/health/storage` exigem autenticação | Não classificar o 401 sem token como falha; verificar esses dois com usuário autorizado |
| Build | Backend e frontend compilaram | Compilação não substitui teste de fluxo |
| Testes unitários backend | 335 aprovados, 3 falharam, em 53 suites | Gate de CI vermelho |
| E2E backend | 5 testes aprovados em 1 suite, focada em política de acesso | Cobertura insuficiente para provar o ciclo de negócio |
| Lint | Frontend passou; backend falhou com 469 apontamentos (465 erros, 4 avisos) | Gate de CI vermelho; predominam quebras de linha/formatação |
| Navegador | Nenhum navegador de automação disponível nesta sessão | Alterações recentes de interface ainda sem inspeção visual nesta auditoria |

Falhas unitárias reproduzidas:

1. `auth.controller.spec.ts`: módulo de teste não fornece `DatabaseService` exigido por `AuthGuard`.
2. `customer-portal.service.spec.ts`: mock de transação não fornece `maintenanceOrder.upsert`.
3. `deliveries.service.spec.ts`: mesmo `maintenanceOrder.upsert` ausente no mock.

As três falhas indicam fixtures de teste desatualizadas. Não há evidência suficiente para classificá-las como defeito do fluxo em produção. O workflow `.github/workflows/ci.yml` executa lint, unitários, E2E e build, portanto falha antes de uma aprovação integral.

## Inventário funcional e lacunas

| Domínio | O que existe | Falta ou evidência necessária |
| --- | --- | --- |
| Comercial/CRM | Oportunidades, atividades, tarefas, previsão ponderada, propostas | Rodar cenários completos em staging, inclusive peças avulsas, peças vinculadas a equipamento, serviço por hora, contratos e reprovação/alteração |
| Operação | OS, entrega, máquinas paradas e garantias têm páginas e serviços | Validar transições, responsáveis, anexos, prazos, comunicação e faturamento com dados de teste de ponta a ponta |
| Financeiro | Títulos, cobrança, conciliação, fluxo de caixa e faturamento da OS têm implementação | Validar idempotência, revisão financeira, conta/CNPJ corretos e baixa somente após confirmação bancária |
| Fiscal | Rascunhos por CNPJ e instalação protegida de A1 têm implementação | `issuanceConfigured: false`; faltam autorização, consulta e cancelamento reais de NF-e e NFS-e, parametrização fiscal e homologação por emitente |
| Santander | Geração CNAB 240, prévia/importação de retorno e registro de teste têm implementação | A referência de teste é declaração do operador; envio é marcado manualmente. Faltam aceite do banco e retorno real conciliado, por conta/CNPJ |
| Infraestrutura | Scripts, healthchecks e guia de implantação existem | Não foi apresentada evidência atual de staging separado, HTTPS, storage de produção, backup restaurado, logs externos, alertas e rollback ensaiado |
| UX e permissões | Há páginas dedicadas, RBAC e edições em tela sobreposta nos cadastros curtos | Revisar visualmente as telas recentes, teclado, foco, acessibilidade, permissões por perfil e comportamento em telas menores |

Os documentos `docs/staging-backup-restore-report.md`, `docs/ciclo-18-staging-homologation.md` e `docs/go-live-checklist.md` registram pendências de staging e aceite de piloto. Eles podem não refletir infraestrutura criada depois; enquanto não houver nova evidência registrada, os itens permanecem **não comprovados**. Auditorias antigas de UX e do fluxo comercial contêm observações já corrigidas no código atual e não devem ser transformadas automaticamente em novos defeitos.

## Etapa 1 — Restaurar o gate de qualidade

**Execução:** atualizar os três fixtures de teste conforme os contratos atuais; normalizar as quebras de linha e formatação que causam o lint; revisar os avisos restantes; executar lint, unitários, E2E backend e build dos dois projetos no mesmo commit; confirmar o resultado do GitHub Actions. Adicionar casos de teste para alterações recentes quando cobrirem um risco real, sobretudo seleção de cliente, edição em overlay e cobrança após OS.

**Aceite:** CI inteiramente verde na branch e no PR; nenhuma falha de lint/teste; diffs de formatação separados de correções funcionais quando possível.

## Etapa 2 — Homologar ambiente e recuperação

**Execução:** criar staging isolado de produção com banco, armazenamento de documentos, URL HTTPS, CORS e segredos próprios; aplicar migrations; criar dados fictícios; exercitar upload/download/PDF/links públicos; configurar logs, alertas e healthchecks externos; gerar backup, restaurar em banco descartável e registrar tempos e integridade; ensaiar rollback. Revisar retenção documental, acessos e obrigações de privacidade com responsáveis internos.

**Aceite:** relatório de staging com commit, horários, resultados, evidência de restauração e responsáveis; checklist de deploy preenchido; nenhum dado real copiado sem tratamento autorizado.

## Etapa 3 — Testar o ciclo CRM → operação → financeiro

**Execução:** em staging, executar matriz de 10 a 15 clientes fictícios cobrindo oportunidade, atividade e prazo, proposta (peças de máquina, avulsas, mão de obra, horas e combinações), aprovação, contrato/OS/entrega, estoque, conclusão, revisão do financeiro, título e cobrança. Repetir cancelamento, devolução, atraso, retrabalho, acesso por perfil e chamadas repetidas. Conferir valores, CNPJ, conta, rastreabilidade e ausência de duplicatas/orfandade. Usar automação de API e navegador, registrar cada cenário e corrigir qualquer discrepância antes de aprovar.

**Aceite:** todos os cenários com resultado esperado e evidência, totais reconciliados e defeitos críticos resolvidos. A suíte E2E atual de política de acesso, sozinha, não atende a esta etapa.

## Etapa 4 — Fiscal real dos dois CNPJs

**Execução:** conferir dados cadastrais e regras tributárias de cada emitente com a contabilidade; instalar cada A1 pela tela em localhost ou HTTPS e confirmar CNPJ/validade (vencimento informado: 12/07/2027); implementar autorização, consulta de estado e cancelamento de NF-e na SEFAZ e de NFS-e no ambiente oficial aplicável. Tratar respostas incertas e reenvio com idempotência; guardar XML, protocolo, identificadores e eventos; emitir e cancelar documentos de homologação para cada CNPJ, com aceite contábil antes de produção.

**Aceite:** provas de autorização, consulta e cancelamento por tipo e emitente, regras fiscais revisadas, rastreabilidade completa e nenhuma nota duplicada após repetição de requisição. O rascunho atual não equivale a nota emitida.

## Etapa 5 — Santander em operação controlada

**Execução:** confirmar com o banco convênio, carteira, código de transmissão, agência e conta de cada beneficiário; conferir vínculo entre CNPJ da nota/título e conta; gerar CNAB 240 H7815 v8.5 de teste; submetê-lo ao Teste de Arquivos do Santander e anexar o resultado aceito; enviar lote operacional controlado; importar retorno real com prévia e conciliar entrada, rejeição, liquidação e totais contra extrato. Testar retorno repetido, arquivo incompatível e divergências sem baixa indevida.

**Aceite:** evidência do banco e do primeiro retorno reconciliado por conta/CNPJ; rejeições tratadas; títulos só marcados registrados ou liquidados conforme confirmação bancária.

## Etapa 6 — Piloto e liberação

**Execução:** selecionar usuários e casos reais limitados, treinar comercial/operação/financeiro, definir suporte e responsáveis, acompanhar diariamente erros, pendências e tempos de resolução; revisar permissões, UX e acessibilidade em navegador; preencher o checklist de go-live, aprovar plano de reversão e registrar aceite do financeiro, fiscal/contabilidade e operação.

**Aceite:** etapas 1 a 5 aprovadas, nenhum defeito crítico aberto, métricas e alertas acompanhados, responsáveis e decisão de piloto assinados. Expandir uso somente após esse aceite.

## Dependências externas e ordem

Etapas 1 e 2 podem avançar em paralelo. A etapa 3 depende do staging. As etapas 4 e 5 dependem da base técnica e de informações de contabilidade/banco; podem ocorrer em paralelo entre si. A etapa 6 depende de todas. Não registrar como concluída qualquer homologação fiscal ou bancária com simulação local ou campo de referência preenchido manualmente.

## Referências de implementação

- CI: `.github/workflows/ci.yml`.
- Fiscal: `backend/src/modules/finance/fiscal-documents.service.ts`, `fiscal-documents.controller.ts`, `fiscal-certificates.service.ts`.
- Banco: `backend/src/modules/finance/bank-collection.service.ts` e `bank-collection.controller.ts`.
- Operação financeira: `backend/src/modules/finance/execution-billing.ts`.
- CRM: `backend/src/modules/crm/crm.service.ts` e páginas de oportunidades.
- Guias internos: `docs/fiscal-bank-go-live.md`, `docs/deploy-checklist.md`, `docs/go-live-checklist.md`.
- Fontes oficiais: [NFS-e Nacional — documentação técnica](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual), [ambientes das APIs NFS-e](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao), [Santander — layout CNAB 240](https://cms.santander.com.br/sites/WPS/documentos/arq-layout-de-arquivos-download-cob240ptbr/26-02-25_131410_h7815_layout_cobran%C3%A7a_cnab_240_posi%C3%A7%C3%B5es_padr%C3%A3o_santander_multibanco_fev_2026_v.8.5_%28portugu%C3%AAs%29.pdf).
