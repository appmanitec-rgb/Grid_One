# Comercial & CRM - Arquitetura Relacional

## Menu alvo
- Funil de Vendas (Oportunidades)
- Clientes & Contatos
- Vistorias Comerciais
- Propostas e Orcamentos
- Contratos de Manutencao

## Entidades novas
- `sales_opportunities`
  - Fases: PROSPECTION, SITE_SURVEY_SCHEDULED, PROPOSAL_SENT, NEGOTIATION, WON, LOST
  - Temperatura: HOT, WARM, COLD
  - Motivo de perda: PRICE, DEADLINE, COMPETITOR, PROJECT_CANCELED, TECHNICAL_SCOPE, OTHER
  - Vinculos: `client`, `clientAddress`, `primaryContact`, `assignedSeller`, `proposals`, `inspections`

- `commercial_inspections`
  - Vinculo obrigatorio com oportunidade e cliente
  - Checklist tecnico em `checklistData` (JSON)
  - Campos tecnicos: kVA, tensao, distancia QTA, necessidade de munck, observacoes
  - Vinculos: `clientAddress`, `primaryContact`, `inspectorUser`, `media`

- `commercial_inspection_media`
  - Anexos da vistoria (foto/arquivo)
  - Metadados: nome, URL, MIME, tamanho, data de captura

## Ajustes em entidades existentes
- `proposals`
  - Novo campo `salesOpportunityId` para manter rastreabilidade do funil para o orçamento.

- `clients`, `client_addresses`, `client_contacts`, `users`
  - Novas relacoes para oportunidades e vistorias.

## Regras de negocio-chave
- Ao mover oportunidade para `LOST`, exigir `lossReason`.
- Oportunidade em `WON` deve viabilizar criacao de proposta/contrato com heranca de dados tecnicos da vistoria.
- Vistoria deve ocorrer antes da proposta para reduzir erro de escopo tecnico.
- Contrato aprovado segue gatilhos ja existentes para OS preventivas e financeiro.
