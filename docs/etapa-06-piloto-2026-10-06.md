# Etapa 06 — preparação do piloto (06/10/2026)

## Decisão atual

**Preparação em andamento; piloto formal e operação fiscal/bancária real não aprovados.** A etapa 01 passou localmente na auditoria anterior. O ensaio local da etapa 02 e a matriz local de 12 clientes da etapa 03 são evidências parciais, não substituem staging externo. A etapa 04 ainda não emite NF-e/NFS-e oficialmente. A etapa 05 (Santander) foi adiada a pedido do responsável. Não há aceite formal das áreas nem inspeção visual em navegador nesta sessão.

## Escopo do piloto proposto

Começar com um grupo pequeno de usuários de comercial, operação e financeiro e casos de baixa complexidade, definidos pelos respectivos responsáveis. Abrir somente os fluxos que tenham sido homologados em staging; manter emissão fiscal e remessa bancária reais fora do piloto até as etapas 04 e 05 passarem. Nenhum cliente real deve ser copiado para staging sem tratamento e autorização internos.

Antes de iniciar, registrar em um único termo: versão/commit, ambiente e URL, período, usuários e perfis, clientes/casos permitidos, volume máximo, responsável por cada área, plantão de suporte e contato para incidente. O termo deve registrar explicitamente quais funções estão habilitadas.

## Responsáveis e treinamento

| Papel | Treinamento prático e evidência | Responsável a designar |
| --- | --- | --- |
| Comercial | Oportunidade, atividade/próxima ação, proposta mista, aprovação e correção; exercício acompanhado | Gestor comercial |
| Operação | OS, consumo/estoque, conclusão, devolução apta a estoque e ocorrência; exercício acompanhado | Gestor de operação |
| Financeiro | Revisão do faturamento da OS, título, cobrança, cancelamento/devolução e conciliação; exercício acompanhado | Gestor financeiro |
| Fiscal/contabilidade | Dados dos dois emitentes, regras por operação, NF-e/NFS-e em homologação e cancelamento; aceite escrito antes de produção | Contabilidade |
| Administração/TI | Perfis e permissões, backup/restore, logs, alertas, deploy e rollback; simulado de incidente | Responsável técnico |

Cada participante deve completar o exercício com seu próprio perfil e confirmar que não consegue executar funções fora da sua área. Guardar data, resultado e dúvidas resolvidas no registro do piloto. Não usar contas compartilhadas.

## Acompanhamento diário

Registrar por dia, ambiente e versão: casos iniciados/concluídos, pendências por etapa, erros por severidade, duplicatas/orfandade, divergência de valor/estoque/CNPJ, tempo de resolução, falhas de login e integração, incidentes de permissão e restaurações. Conferir totais de proposta, OS, estoque e título com amostragem dos casos executados.

Severidade **crítica**: valor ou estoque incorreto sem correção segura, cobrança/nota duplicada, acesso indevido, perda de documento/dado ou indisponibilidade sem contorno. Nesses casos, parar o fluxo afetado, preservar logs/identificadores, designar responsável e acionar plano de reversão. Não retomar até a correção ser testada no mesmo fluxo. Severidade **alta**: tarefa bloqueada ou inconsistência corrigível com controle manual auditado; acompanhar até resolução antes de ampliar usuários.

Modelo mínimo do registro diário: data; commit; responsável; caso e IDs; resultado esperado/observado; impacto; evidência (sem senha ou certificado); ação e prazo; estado da correção; decisão de continuar, restringir ou parar.

## Gates de aceite

- [ ] Etapa 01: CI remoto verde no commit candidato.
- [ ] Etapa 02: staging externo isolado, HTTPS/storage, restore e rollback ensaiados, alertas ativos.
- [ ] Etapa 03: matriz completa no staging, exceções e perfis testados, totais reconciliados.
- [ ] Etapa 04: emissão, consulta e cancelamento oficiais de NF-e/NFS-e para os dois CNPJs; aceite contábil.
- [ ] Etapa 05: convênio e remessa/retorno Santander reais aceitos e reconciliados (adiada pelo responsável).
- [ ] Etapa 06: revisão em navegador de teclado, foco, legibilidade e telas menores; treinamento registrado; suporte e responsáveis designados; zero defeito crítico aberto.
- [ ] Termo com decisão expressa de comercial, operação, financeiro, fiscal/contabilidade e TI, com data/versão/escopo.

O checklist operacional detalhado está em `docs/go-live-checklist.md`. Marcar um item somente com evidência verificável; teste local ou rascunho fiscal não equivale a homologação externa. Enquanto a etapa 05 estiver adiada, é possível preparar e ensaiar um piloto **sem banco**, mas o aceite integral de go-live do CRM/ERP permanece pendente.
