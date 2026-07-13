# Ciclo 8 - Roteiro Manual de QA

Base esperada: `cf2bee5 feat: ciclo 7b pdf e versionamento de laudos` ou commit posterior do Ciclo 8.

## Preparação

- Backend: `http://localhost:3000`
- Frontend: `http://localhost:3001`
- Rodar migrations antes do teste: `npm run db:migrate`
- Rodar seed principal e seed de fluxo quando precisar de massa demo.
- Senha: usar o valor configurado em `SEED_DEMO_PASSWORD`, `SEED_ADMIN_PASSWORD` ou `SEED_MASTER_PASSWORD`.

Usuarios demo do `seed-flow`:

- Admin: `admin@manitec.local`, criado pelo seed principal quando executado.
- Gestor: `gestor.demo@manitec.local`
- Comercial: `vendas.demo@manitec.local`
- Operação: `operacao.demo@manitec.local`
- Técnico: `tecnico.demo@manitec.local`
- Financeiro: `financeiro.demo@manitec.local`
- Suprimentos: `suprimentos.demo@manitec.local`
- Pessoas/RH: `pessoas.demo@manitec.local`
- Auditor: `auditor.demo@manitec.local`
- Cliente A: `cliente.a.demo@manitec.local`
- Cliente B: `cliente.b.demo@manitec.local`

## Teste Admin

1. Acessar `/`.
2. Entrar com o usuario admin.
3. Abrir `/dashboard`.
4. Confirmar que dashboard, acessos, comercial, operação, ativos, suprimentos, financeiro, pessoas, laudos e automação aparecem.
5. Clicar em `Compactar secoes` e confirmar que as secoes recolhem.
6. Clicar em `Expandir secoes` e confirmar que as secoes abrem.
7. Abrir `/dashboard/control` e validar acesso a usuarios/permissoes.
8. Abrir `/dashboard/relatorios-tecnicos`, entrar em um laudo aprovado/liberado e testar `Gerar PDF`, `Baixar PDF`, `Criar link público` e `Revogar`.

## Teste Gestor

1. Entrar com `gestor.demo@manitec.local`.
2. Confirmar acesso amplo ao dashboard sem expor controles de sistema master.
3. Abrir atendimento em `/dashboard/atendimento`.
4. Abrir laudos em `/dashboard/relatorios-tecnicos`.
5. Aprovar um laudo elegivel.
6. Liberar laudo ao cliente.
7. Criar link público com PDF bloqueado e depois outro com PDF liberado, se houver PDF gerado.

## Teste Comercial

1. Entrar com `vendas.demo@manitec.local`.
2. Confirmar menu de clientes, oportunidades, propostas e contratos.
3. Abrir `/dashboard/opportunities`.
4. Criar uma oportunidade com cliente e valor.
5. Clicar em `Gerar proposta`.
6. Criar proposta e abrir o detalhe.
7. Enviar para revisão/diretoria conforme permissão.
8. Confirmar que financeiro, RH e configurações críticas não aparecem sem permissão.

## Teste Operação

1. Entrar com `operacao.demo@manitec.local`.
2. Abrir `/dashboard/atendimento`.
3. Criar ou abrir chamado existente.
4. Classificar, comentar e converter em OS quando houver equipamento.
5. Abrir `/dashboard/orders` e validar status da OS.
6. Abrir `/dashboard/dispatch` e validar técnico/agenda quando permitido.
7. Abrir laudo vinculado a OS e validar fluxo até liberação.

## Teste Tecnico

1. Entrar com `tecnico.demo@manitec.local`.
2. Confirmar que financeiro, RH, estoque amplo e configurações não aparecem.
3. Abrir `/dashboard/tecnico`.
4. Confirmar que aparecem apenas OS e chamados atribuídos ao técnico.
5. Abrir uma OS em `/dashboard/tecnico/ordens/[id]`.
6. Fazer check-in.
7. Tentar fazer check-in novamente e confirmar erro claro ou botao bloqueado.
8. Fazer check-out com observação.
9. Confirmar geração de apontamento/banco de horas na lista de sessões.
10. Abrir laudo vinculado quando existir.
11. Testar a tela em largura mobile.

## Teste Financeiro

1. Entrar com `financeiro.demo@manitec.local`.
2. Confirmar acesso ao financeiro e clientes/contratos de leitura conforme permissao.
3. Abrir contas a receber, contas a pagar, fluxo de caixa e contas bancarias.
4. Confirmar que a área técnica operacional não permite operações indevidas.
5. Validar que titulos exibem origem rastreavel quando vierem de contrato, OS ou compra.

## Teste Cliente

1. Entrar com `cliente.a.demo@manitec.local`.
2. Confirmar redirecionamento para `/portal`.
3. Abrir `/portal/dashboard`, `/portal/equipamentos`, `/portal/propostas`, `/portal/chamados`, `/portal/laudos`, `/portal/documentos`.
4. Criar chamado em `/portal/chamados/novo`.
5. Comentar chamado proprio.
6. Abrir proposta em revisão e aprovar/reprovar pelo modal de confirmação.
7. Abrir laudo liberado e baixar PDF somente se o botao aparecer.
8. Confirmar que não aparecem `storageKey`, observações internas, custos internos ou auditoria.
9. Sair, entrar com `cliente.b.demo@manitec.local`.
10. Confirmar que Cliente B não vê equipamentos, chamados, propostas, laudos ou documentos do Cliente A.

## Teste Link Publico

1. No ERP, abrir laudo liberado ao cliente.
2. Criar link público com PDF bloqueado.
3. Abrir `/public/service-reports/share/[token]` e confirmar ausencia de download PDF.
4. Criar link público com PDF liberado.
5. Abrir o link e confirmar botao `Baixar PDF`.
6. Abrir `/public/service-reports/verify/[token]` e confirmar status valido.
7. Revogar o link no ERP.
8. Reabrir o link e confirmar erro claro.

## Teste PDF/Laudo

1. Abrir laudo em rascunho ou revisão.
2. Preencher diagnostico, servico realizado, recomendacoes e observacoes ao cliente.
3. Adicionar checklist.
4. Adicionar evidencia com arquivo.
5. Assinar.
6. Aprovar.
7. Gerar documento.
8. Gerar PDF.
9. Baixar PDF interno.
10. Liberar ao cliente.
11. Baixar PDF pelo portal.
12. Abrir validação pública.
13. Revisar laudo liberado com motivo.
14. Confirmar nova versão e necessidade de gerar novo PDF.

## Criterios Visuais

- Nenhum botao principal deve ficar sem feedback.
- Ações sensíveis devem pedir confirmação.
- Dashboard deve mostrar os indicadores sem empurrar tudo para baixo.
- Pagina de proposta deve mostrar status, cliente, equipamento, valor e validade acima da dobra.
- Funil comercial deve evitar scroll horizontal em 1366x768.
- Portal e area tecnica devem funcionar bem em mobile.
