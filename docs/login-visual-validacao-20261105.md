# Tela de entrada — revisão visual de 05/11/2026

Implementada e disponível em **http://127.0.0.1:3004/**.

- Substituída a composição SVG com o “M” redesenhado pelo logo oficial completo, já existente em `public/brand/manitec-logo.png.png`. Os arquivos da marca foram preservados.
- Layout com identidade azul/vermelha da Manitec, tipografia de sistema, formulário alinhado à esquerda, menos elementos repetidos e acesso ao portal do cliente como ação secundária.
- Desktop mantém a imagem institucional do gerador. No celular, a marca e o formulário ficam em primeiro plano, sem exigir percorrer o painel de imagem.
- Estilos isolados em CSS Module; nenhuma alteração nos estilos globais ou nas telas internas.
- Mantidos campos, callbacks, mensagens, verificação em duas etapas, configuração por QR Code e códigos de recuperação. O controlador de autenticação `app/page.tsx` permaneceu com SHA-256 idêntico ao anterior.

## Validação

- Build Next.js/TypeScript aprovado, em `.next-ux-review`.
- ESLint dos arquivos TSX/teste alterados: aprovado, sem avisos ou erros.
- **Quatro testes Playwright aprovados**: responsividade; senha visível/oculta, teclado, carregamento e erro recuperável; desafio MFA e retorno ao login; configuração MFA com QR Code e submissão.
- Os testes de autenticação usam respostas simuladas no navegador e credenciais fictícias. Validam a interface e suas chamadas; não representam teste de login com contas reais nem conclusão de configuração MFA em uma conta.
- **Nove resoluções verificadas**: 1366×900, 1366×768, 1280×720, 1093×614, 1024×768, 768×1024, 390×844, 375×667 e 320×640, DPR 1/zoom 100%.
- Nenhuma rolagem horizontal; botão de entrada dentro da altura inicial nas nove resoluções. Desktop a partir de 720 px de altura sem rolagem vertical da página. Telas móveis menores permitem rolagem normal até o rodapé.
- Imagens visíveis carregadas, sem exceção JavaScript. Contraste do placeholder: **4,81:1**; borda do campo: **3,11:1** sobre branco. Não constitui certificação completa de acessibilidade.
- Banco, permissões, API e servidor principal preservados. Somente o frontend de validação 3004 foi recompilado/reiniciado. Sem commit ou push.

Evidências selecionadas: [desktop](evidencias/login-visual-20261105/desktop.png), [celular](evidencias/login-visual-20261105/mobile.png) e [verificações](evidencias/login-visual-20261105/verification.json).

Logs completos, cópias anteriores e demais capturas em `runtime-logs/login-visual-20261105/`: `build.log`, `login-tests-final.log`, `lint.log`, `verification.log` e `verification.json`.

## Complemento — portal do cliente e ativação

A captura enviada após a primeira entrega mostrou que `/cliente/entrar` ainda utilizava outra estrutura, com o SVG antigo. Essa parte ficou fora da primeira alteração e foi corrigida nesta continuação.

Equipe, cliente e ativação agora compartilham `app/_components/AccessFrame.tsx`, o logo oficial, a composição responsiva e o rodapé. Os formulários de cliente e criação de senha passaram a usar os mesmos estilos de campos, botões, foco e mensagens. A orientação de primeiro acesso e o retorno ao acesso da equipe estão presentes. O arquivo SVG antigo foi preservado como recurso existente; não é utilizado nessas telas.

- Build e TypeScript aprovados novamente; ESLint dos arquivos alterados sem erros ou avisos.
- **Oito testes Playwright aprovados na compilação final**, incluindo login da equipe, login do cliente, recusa de sessão de funcionário no portal, MFA, ativação sem token, confirmação de senha, erro recuperável e remoção do token da URL após conclusão simulada.
- **27 verificações visuais aprovadas**: as três telas nas nove resoluções já relacionadas. Marca carregada, um título principal por página, campos identificados, nenhuma rolagem horizontal e rodapé alcançável sem recortes. O estado de link incompleto também foi conferido.
- Comparação estrutural do TypeScript confirmou estados, efeitos e funções de envio do login/ativação de cliente idênticos aos anteriores, desconsiderando formatação. O controlador do acesso da equipe também permanece inalterado.
- Testes com respostas simuladas no navegador; nenhuma conta ativada, senha alterada ou gravação na base. API e ambiente principal preservados. Sem commit ou push.

Evidências atualizadas: [portal desktop](evidencias/login-visual-20261105/cliente-desktop.png), [portal celular](evidencias/login-visual-20261105/cliente-mobile.png), [ativação celular](evidencias/login-visual-20261105/ativacao-mobile.png), [27 verificações](evidencias/login-visual-20261105/verification-acessos.json) e [comparação da lógica](evidencias/login-visual-20261105/logic-proof.json).

Logs desta continuação: `runtime-logs/acessos-completos-20261105/`, incluindo `build.log`, `tests-final.log`, `visual-final.log`, `lint.log` e cópias anteriores. Validação disponível em **http://127.0.0.1:3004/cliente/entrar**.
