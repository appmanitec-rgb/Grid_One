# Fixtures bancarias do Ciclo 16

Arquivos anonimizados para validar importacao e conciliacao bancaria em desenvolvimento/testes.

Estes fixtures nao comprovam homologacao oficial com bancos reais. Eles cobrem formatos comuns:

- CSV com separador ponto e virgula e decimal brasileiro.
- CSV com cabecalhos alternativos por perfil de importacao.
- OFX com `FITID`.
- OFX sem `FITID`, usando identificador sintetico.
- CNAB inicial limitado, apenas para validar parser conservador.
- Arquivo invalido para testes negativos.

Antes de uso operacional, cada banco/layout precisa ser homologado com arquivos reais do provedor escolhido.
