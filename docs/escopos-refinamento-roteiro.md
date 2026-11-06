# Refinamento dos escopos — validação do vendedor

Retomada em 26/10/2026. **Todos os casos abaixo estão pendentes no navegador.** A conexão da automação voltou a expirar; testes de regras e API não comprovam aparência ou experiência de uso.

Usar exclusivamente `http://127.0.0.1:3002`, com dados fictícios na base isolada. Executar em **1366 × 768 e 390 × 844, zoom de 100%**, nos temas claro e escuro. Registrar navegador, responsável, data, captura/vídeo e resultado. Não alterar a base principal ou realizar entregas/pagamentos reais.

| Caso | Ação e resultado esperado | Situação |
| --- | --- | --- |
| R01 | Vender somente filtro; depois óleo em embalagens e filtros sem serviço. Conferir fornecimento e quantidades, sem troca, teste ou capacidade de óleo presumidos. | Pendente |
| R02 | Adicionar horas sem finalidade. Salvar/reabrir o rascunho em Serviços; não perder campos. Liberação deve apontar a classificação faltante, sem frase genérica no texto do cliente. | Pendente |
| R03 | Pesquisar procedimentos na etapa Serviços. Conferir limite de 10 resultados visíveis, seleção/remoção por teclado e aplicação somente ao serviço correspondente. Catálogo não pode ser alterado pela seleção na proposta. | Pendente |
| R04 | Informar descrição manual curta e depois finalidade/execução suficiente. Conferir pendência, geração e aplicação da prévia. A validação mínima não substitui a análise do responsável técnico. | Pendente |
| R05 | Após classificar, alterar quantidade/horas/equipamento. Texto deve permanecer disponível, com confirmação pendente quando aplicável. Confirmar para os fatos atuais, gerar e revisar novamente antes da liberação. | Pendente |
| R06 | Criar dois serviços repetidos com finalidades diferentes; remover uma linha. Nenhuma finalidade pode ser remapeada silenciosamente. Conferir aviso, conteúdo preservado e confirmação explícita. | Pendente |
| R07 | Classificar um serviço que tinha pacote de procedimentos no catálogo com outro procedimento explícito. Conferir que o pacote anterior não acrescenta atividades nem teste com carga. Remover a classificação e testar “Usar vínculo do catálogo”. | Pendente |
| R08 | Contratar teste sem carga e depois teste com carga. O primeiro não pode incluir o segundo; o segundo mantém autorização operacional pendente. Escolher procedimento não autoriza execução. | Pendente |
| R09 | Troca de bateria e instalação de pré-aquecedor: conferir somente materiais, atividades e condições efetivamente contratados, sem tensão/capacidade presumida. | Pendente |
| R10 | Inspeção preventiva sem materiais e atendimento corretivo: omitir fornecimento inexistente; distinguir diagnóstico de reparo/solução garantida. | Pendente |
| R11 | Inserir serviço avulso em Outros itens sem finalidade. Confirmar que esse tipo também não contorna a conferência técnica. | Pendente |
| R12 | Gerar/revisar, alterar finalidade ou texto e tentar liberar. Conferir obsolescência, justificativas aplicáveis e caminho direto para correção em Serviços. Conferência não pode substituir alçada/permissão. | Pendente |
| R13 | Aprovar, baixar PDF/DOCX e conferir no portal; depois editar procedimento/modelo apenas na cópia. Documento e escopo da O.S. devem preservar a versão contratada; notas internas ausentes. Comparar também uma proposta aprovada pelo motor anterior. | Pendente |
| R14 | Testar navegação de quatro etapas, rascunhos, conflitos, rede lenta/falha, teclado/foco, sobreposições, contraste e rodapé no mobile. Conferir que classificação em andamento não bloqueia a digitação nem associa dados de um item anterior ao novo. | Pendente |
| R15 | Na cópia, conferir contratos, geradores, propostas externas e flag desligada. Fluxos anteriores preservados, sem exigência retroativa sobre documentos históricos. | Pendente |

Usar também o [roteiro da Fase 1](propostas-fase1-roteiro-homologacao.md) para pagamento, despesas, descontos, aprovação e emitentes distintos. A implantação permanece bloqueada até obter evidência visual e aprovação técnica dos procedimentos usados na operação.
