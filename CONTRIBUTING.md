# Contribuindo

## Ambiente
- Node.js LTS (testado com 22+). Não há dependências npm.
- Para jogar/depurar você precisa da **sua** cópia de Marvel Ultimate Alliance (PC). Nenhum arquivo do jogo é versionado.
- Servir o projeto: `npm run serve` (porta 8765) e abrir `http://localhost:8765/web/index.html`; aponte a pasta do jogo pelo botão "Abrir pasta do jogo" ou sirva a pasta do jogo com CORS e use `?remote=http://localhost:8766/`.

## Fluxo
1. Crie uma branch a partir de `main`: `feature/<assunto>` ou `fix/<assunto>`.
2. Commits no padrão Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`.
3. Abra um Pull Request para `main`. O CI (`build-and-test`) precisa passar antes do merge.

## Testes
- `npm test` roda todas as suítes de `test/`. As que leem os arquivos do jogo são puladas quando a pasta não existe (como no CI); rode-as localmente antes de abrir o PR.
- Comportamento novo precisa de teste. Prefira dados sintéticos em testes de unidade; use os arquivos reais só em suítes de integração.

## Checklist de PR
- [ ] Descrição do que mudou e por quê (cite a função/dado do jogo que fundamenta, quando for engenharia reversa)
- [ ] Testes adicionados ou atualizados e `npm test` passando
- [ ] README/docs atualizados (`docs/FORMATS.md` para formatos)
- [ ] Nenhum arquivo do jogo (`.bin`, `.igb`, `.fsb`, dados extraídos) no diff

## Bugs e sugestões
Abra uma issue com os passos para reproduzir, a fase/mapa e o console do navegador.
