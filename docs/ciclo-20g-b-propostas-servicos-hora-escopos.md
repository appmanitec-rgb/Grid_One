# Ciclo 20G-B - Propostas, servicos por hora e escopos prontos

## 1. Resumo executivo

O bloco 20G-B evoluiu a criacao de Propostas para uma operacao comercial mais real: cliente, vendedor, catalogo e equipamento deixam de depender de listas completas; a proposta passa a aceitar cliente rapido, maquina rapida, servico por hora, item avulso e escopos prontos vindos do backend.

O backend passou a validar o vendedor como usuario comercial ativo, calcular item por hora no servidor e armazenar os metadados do item sem expor custo interno ou margem.

## 2. Commit base

Base utilizada:

```text
61de7d3 feat: ciclo 20g-a oportunidades pesquisa pipeline
```

## 3. Auditoria inicial de Propostas

- `Proposal` ja possuia `clientId`, `generatorId`, `salesOpportunityId`, `userId`, `scope`, condicoes comerciais e itens.
- `ProposalItem` exigia `catalogItemId`, o que impedia item por hora ou item avulso sem criar item fake no catalogo.
- A tela `frontend/app/dashboard/proposals/new/page.tsx` carregava `/clients`, `/catalogs` e `/generators` completos.
- A proposta vinculada a oportunidade ja herdava cliente, mas nao deixava claro pipeline/tipo e nao herdava vendedor de forma segura.

## 4. Cliente rapido

- Reutilizado `POST /clients`.
- A tela permite cadastrar cliente com nome, fantasia, CPF/CNPJ, telefone, e-mail, contato, endereco, cidade e UF.
- Cliente criado fica selecionado automaticamente na proposta.

## 5. Maquina rapida

- Criado `POST /proposals/quick-generator`.
- Maquina fica vinculada ao cliente selecionado.
- Campos rapidos: nome, tag, fabricante, modelo, serie, potencia, tensao, local/site e observacao.
- Nao duplica o cadastro tecnico completo do modulo Equipamentos.

## 6. Busca de cliente/equipamento/vendedor

- Cliente usa `/clients/lookup`, limite maximo 20.
- Equipamento usa `GET /proposals/generator-lookup`, limite maximo 20 e filtro por cliente.
- Vendedor usa `/crm/sellers`, somente usuarios `SALES` ativos.
- Catalogo usa `GET /catalogs/lookup`, limite maximo 20 e filtro por tipo `PART`/`SERVICE`.

## 7. Servico por hora

Adicionado suporte backend/frontend para `HOURLY_SERVICE` com:

- tipo de hora;
- tipo de tecnico;
- quantidade de horas;
- valor hora de venda;
- desconto;
- total calculado.

## 8. Tipos de hora

Tipos iniciais:

- Hora avulsa;
- Hora contrato;
- Hora emergencia;
- Hora deslocamento;
- Hora engenharia.

Regra implementada: `Hora contrato` aplica desconto padrao de 20% quando o item nao informa desconto explicito.

## 9. Tipos de tecnico

Tipos iniciais:

- Tecnico junior;
- Tecnico pleno;
- Tecnico senior;
- Engenheiro de aplicacao;
- Especialista.

## 10. Escopos prontos

Criada tabela `ProposalScopeTemplate` com escopos ativos e ordenados.

Escopos seedados pela migration:

- Troca de bateria;
- Troca de oleo e filtros;
- Troca de vela;
- TOF;
- Preventiva basica;
- Preventiva completa;
- Diagnostico tecnico;
- Teste com carga;
- Inspecao de QTA;
- Correcao de vazamento;
- Limpeza tecnica.

## 11. Escopo combinado

A tela permite selecionar multiplos escopos, visualizar previa, adicionar ao campo livre e editar manualmente depois. O texto combinado remove duplicidades simples.

## 12. RBAC/custos

- Vendedor de proposta precisa ser usuario `SALES` ativo.
- Busca de catalogo preserva mascaramento de custo ja existente.
- O fluxo novo usa valor de venda ao cliente.
- Custo interno, margem e composicao sensivel nao sao exibidos na proposta nem no E2E.

## 13. Migrations

Criada e aplicada:

```text
20260728110000_ciclo_20g_b_proposal_hour_scope_templates
```

Alteracoes:

- novos enums `ProposalItemKind`, `ProposalHourType`, `ProposalTechnicianType`;
- `ProposalItem.catalogItemId` passou a ser opcional;
- novos campos em `ProposalItem`: `kind`, `description`, `hours`, `discountPercent`, `hourType`, `technicianType`;
- nova tabela `proposal_scope_templates`.

## 14. Testes backend

Adicionados/ajustados testes para:

- vendedor invalido bloqueado;
- hora contrato calculada com desconto padrao de 20%;
- proposta antiga com item de catalogo continua compativel;
- escopos ativos retornados;
- maquina rapida vinculada ao cliente.

Resultado:

```text
npm test -- --runInBand
36 suites / 211 testes passaram
```

## 15. E2E

Criada spec:

```text
frontend/e2e/proposal-operational.spec.ts
```

Cobre:

- cliente rapido;
- maquina rapida;
- vendedor comercial;
- servico por hora;
- escopos prontos;
- salvamento da proposta;
- ausencia de custo interno na tela.

Resultado completo:

```text
npm run e2e
51 passed / 1 staging skipado
```

## 16. Validacoes

- `npm run env:check`: passou.
- `npm run db:preflight`: passou.
- `npx prisma migrate status`: banco atualizado, 47 migrations.
- Backend `npm run lint`: passou.
- Backend `npm run build`: passou.
- Backend `npm test -- --runInBand`: passou, 36 suites / 211 testes.
- Backend `npm run seed:flow`: passou com senha demo local.
- Frontend `npm run lint`: passou.
- Frontend `npm run build`: passou com rede liberada para Google Fonts.
- Frontend `npm run e2e`: passou, 51 passed / 1 staging skipado.

## 17. Riscos restantes

- Tipos de hora e tipos de tecnico ainda sao configuracao controlada em backend, sem tela administrativa.
- Escopos prontos possuem tabela, mas ainda nao ha editor administrativo.
- Busca de catalogo retorna preco de venda (`basePrice`), mas precificacao avancada por tabela/cliente ainda nao foi implementada.

## 18. Pendencias

- Pipeline proprio de Propostas ainda nao implementado.
- Regras comerciais por segmento, cliente ou contrato ainda precisam parametrizacao.
- Alçadas e politica de precificacao avancada continuam fora deste bloco.
- UX de edicao de proposta existente ainda pode ser lapidada em ciclo futuro.

## 19. Proximo bloco recomendado

Seguir para `20G-C - Contratos`, revisando a aba de contratos ponta a ponta, principalmente heranca da proposta, links operacionais, filtros e criacao sem listas gigantes.
