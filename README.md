# MUA Web

![CI](https://github.com/eroskarsburg/mua1-browser/actions/workflows/ci.yml/badge.svg) ![License](https://img.shields.io/badge/license-MIT-blue)

Visualizador/porte em andamento de **Marvel Ultimate Alliance (PC)** para o navegador, por engenharia reversa dos formatos.
Modelo "traga seus arquivos": você aponta a pasta do jogo que já possui; os `.bin` são lidos localmente com `File.slice()`
(ou HTTP Range), decifrados e descomprimidos **só nos trechos necessários**. Nenhum asset do jogo é distribuído.

## Estado
| Camada | Estado |
|---|---|
| Container `.bin` (LCG + zlib), streaming por entrada | pronto, validado nos 19 arquivos |
| `.xmlb` (XML binário) | pronto, 5213/5213 |
| `.igb` parser genérico (self-descriptive) | pronto, 6046 arquivos (texturas, modelos, mapas, hud, skybox) |
| Texturas DXT1/DXT5 (GPU S3TC + fallback CPU) | pronto |
| Cena estática (modelos, mapas) + WebGL2, culling, upload preguiçoso | pronto |
| Personagens: malha + textura na pose de bind (397 atores, 935k tris) | pronto |
| Personagens: esqueleto Bip01 + skinning na GPU (paleta de matrizes, até 48 ossos) | pronto |
| Animações: codec Enbaya revertido (2763/2763 com todos os fluxos consumidos byte a byte); seletor de animação e reprodução em loop | pronto |
| Scripts BehavEd (`scripts.bin`, 4595): parser + interpretador por corrotinas, relógio virtual, host plugável | pronto (4595/4595 executam até o fim) |
| Mundo (`.xmlb` dos mapas: 11k definições, 31k instâncias) + host que liga as nativas de entidade ao estado | pronto (62% das referências dos scripts resolvem; resto = NPCs criados por spawners) |
| Atores no mundo: spawners criam personagens (259 de 309 com malha+animações), heróis nos pontos de início, poses animadas por instância | pronto |
| Combate: J = ataque leve (combo de 3), K = pesado; acerto por alcance+arco, reações (knockback), morte (`death_gen` + script `monster_deathscript`), barras de vida | pronto |
| Poderes: teclas 1-4 usam `power_N` (30 de energia, regenera 6/s), dano em área (raio 240) e anel visual; Tab troca o herói controlado | pronto (sem efeitos de partícula reais) |
| Partículas (`effects.bin`, 3066 efeitos / 10984 emissores): hit_* nos golpes, `char/<herói>/pN_power` nos poderes; billboards aditivos/alpha com textura | pronto (aproximado: ParticleCloud/Sprite/Spark; Trail/Cylinder/Model/Lightning só como sprites) |
| HUD da equipe: retratos (`hud.bin`), vida/energia por herói, ativo destacado; clique, Tab ou F1-F4 trocam de herói | pronto |
| IA: inimigos perseguem e atacam; aliados (heróis 2-4) seguem o líder e lutam | pronto (básica) |
| Cutscenes/câmera: `lockControls`, `startCutScene/endCutScene`, `cameraFade/Move/Pan/ToLocationAngles/FocusToEntity/Reset/Shake/FOV` (≈6.700 usos nos scripts) via `Director` | pronto |
| Conversas (`conversations.bin`: 1666, árvores com escolhas e scripts) com caixa de diálogo, leitura automática e teclado | pronto |
| Objetivos (`data/missions/*.engb`, 93 com texto de 334 usados) + avisos `display` | pronto (texto ausente cai para o nome) |
| Menu de partida: 96 fases (ato/mapa) + equipe de 4 dos 25 heróis jogáveis com retratos, lembra a escolha (localStorage); `loadZone/loadMap` trocam de mapa com fade e põem a equipe na ligação | pronto |
| Encenação de scripts: `playanim` (com sinal ao terminar), IA global/alvos, `moveHeroesToEnt`, `attackEntityWithType`, `setNoClip`, `setScale`, `spawnEffect`, luz de ambiente/equipe, patrulha por waypoints | pronto |
| Itens: orbes de vida/energia (drop 44%, coleta por toque), XP e níveis (+8% vida, +6% dano), HUD com nível | pronto |
| Save automático (localStorage: mapa, equipe, níveis, flags, objetivos, a cada 10 s e ao subir de nível/trocar de zona) + "Continuar" no menu | pronto |
| Áudio: 12.787 `.fsb` (FSB5/MPEG-1 Layer II, 24.457 amostras) decodificados com jsmpeg; `sound()` dos scripts, golpes, coleta, nível e **falas das conversas**; volume | pronto |
| Crossfade entre animações (0,18 s) | pronto |
| Jogador: WASD (relativo à câmera), Shift anda, `idle/walk/run`, chão (raycast na geometria), colisão com paredes (desliza), câmera em 3ª pessoa com colisão | pronto |
| Mundo no renderer: mapa + instâncias com modelo/posição/orientação (99,9% dos modelos resolvem), marcadores por classe, estado dos scripts em tempo real | pronto |
| Áudio FSB (FMOD), vídeo Bink 2 | pendente |

## Controles (viewer, ao abrir um mapa)
Botão **▶ Jogar (menu)** na barra lateral escolhe fase e equipe. WASD/setas movem o herói 1 (Wolverine); Shift = andar; **J** ataque leve (encadeia combo), **K** ataque pesado, **1-4** poderes, **Tab** troca de herói; arrastar = girar a câmera; roda = zoom; "▶ scripts do mapa" roda os scripts; "marcadores" mostra spawners/triggers/zonas.

## Falta
- **Vídeo Bink 2** (51 `.bk2`): `startMovie` só mostra um aviso (sem decoder).
- **Navmesh `.navb`** (IA anda em linha reta) e colisão de entidades sólidas (portas/caixas).
- Música (`setMusicOverride`, pacotes `music`), timers/hints de HUD (`timerStart`, `setHintType`), minimapa (`automaps`).
- Efeitos: `Trail/Cylinder/Lightning` aproximados; `CameraShake/ScreenFlash` de efeitos ignorados.
- Mundo: ~30% das referências de entidade ainda não resolvem (NPCs de spawners dinâmicos); `smartent`/interações.
- Itens equipáveis/inventário (`items.xmlb`, `actionFigureReward`), simulador, desafios.
- Testes automáticos de renderer/HUD/menu (só validados no navegador).

## Uso
```
npm test                      # roda todas as suítes (test/*.test.mjs) contra os arquivos reais do jogo
npm run serve                 # http://localhost:8765/web/index.html  -> "Abrir pasta do jogo"
```
Ferramentas de RE em `tools/` (Python); formatos documentados em `docs/FORMATS.md`.

## Fluxo do jogo original (reproduzido)
Título ("Press 1", logo 3D de `ui.bin`) → PLAY → BEGIN STORY → EASY/NORMAL/HARD → Flight Deck (`act1/heli/heli1`, equipe Capitão América/Wolverine/Homem-Aranha/Thor).
Inclui nome da zona, HUD circular com arcos de vida/energia e 4 slots de poder, e **Tech Bits** (`pickups/tech_01..03`, inventário `MONEY`, ímã de coleta, contador no HUD, salvo no save).
Combate e animação (engenharia reversa dos dados do jogo, `src/fightstyle.js`):
- `data/shared_anims.xmlb` (ação `ea_*` → clipe), `shared_event_templates.xmlb` (golpes: dano, alcance, arco, knockback), `shared_nodes*.xmlb` e `fightstyles/*.xmlb` (nós `FightMove` com `startchaintime`, cadeias `attack/smash/idle`, gatilhos de golpe/deslize/som, `playspeed`, `inherit`, modificadores `dmgmod_*`).
- Combos fiéis (light1→2→3, heavy→knockback2, stun/trip/popup), reações da vítima por tipo (pain_high/low/rear, flyingback/forward → land → getup, popup, trip, stun) com os clipes compartilhados `common`/`common_combat`.
- Velocidade de corrida/caminhada = passada do clipe (pé de apoio), sem deslizar. Câmera alta (pitch ~57°).
- `Marvel.exe` decompilado com Ghidra 12.2 (JDK 25) em `C:\Users\Eros\tools\re` (scripts Java em `scripts/`: DumpStrings, Decompile, DecompVtable, Xrefs). Achados: handlers `ch_*` registrados em `FUN_14057dc30` (cada um com vtable); `ch_move` ajusta a taxa da animação = velocidade×input ÷ velocidade de referência; as velocidades walk/run/sprint (enum `ea_*` 7/8/9) e advance/retreat/strafe (23–26) vêm de uma tabela por conjunto de animação preenchida em `FUN_140376ee0`; pulo (`ch_move_jump`, `FUN_140558100`): velocidade vertical 450 u/s, horizontal ×1.4. A gravidade do pulo não foi localizada (ajustada à duração do clipe).
- **Canal "Motion"** (descoberto via `FUN_14062fcf0`, que compara nomes de osso com "bip01"/"motion"): cada clipe tem um osso `Motion` com o deslocamento de raiz acumulado (x = frente, y = esquerda). Ele dá as velocidades reais: walk 40, run 160, sprint 245,6 u/s, e a distância das esquivas (rolamento frontal 172 u, laterais ~118 u). `Pose.motionAt/motionSpeed` o leem; `Actors.groundSpeed` usa a velocidade dele; a esquiva (tecla L) aplica o movimento de raiz com invulnerabilidade até `startchaintime` (0,6 s).
- **Poderes por herói** (`src/talents.js`): `herostat` aponta o `powerstyle` (`data/powerstyles/ps_<herói>.xmlb`, que sobrescreve os nós de ataque do estilo base com os tempos próprios do herói e define os nós `power1..N`) e os talentos (`data/talents/<herói>.xmlb`: nível mínimo `_req`, dano `_dmg`, custo de energia `_pwr`, por nível). Slots 1–4 (teclas 1–4, igual ao HUD original) usam o talento `_pN`; projéteis (escudo do Capitão América: velocidade 450, alcance 800, atravessa e volta) e efeitos `char/<herói>/pN_power` vêm do nó.
- **Controles do jogo** (dicas dos tutoriais em `dialogs.bin`): ATTACK / SMASH (segurar carrega, 1 s) / POWER+botão / BLOCK (segurar) / MOVE (pular). Teclas no port: J, K, 1–4, Q (bloqueio, inferida), Espaço (pulo, confirmado no original), L (esquiva, inferida).
- **Sistema de ativação** (`src/acts.js`): `actontouch`, `scripttriggerent`+`boxcollision`, `acttargets`, `actscript`/`deactscript`, `actdelay`, `actcountremove/disable`, `actrescheduledelay`, `actonuse`, `toggleonact`, `tipid`, `startenabled`. É o que conduz a fase. A tecla E usa portas e saídas; `zonelinkent` troca de zona e a chegada usa o `playerstartent` com `prevzone`.
- **Início da fase**: `playerstartent` com `default="true"`; o `zonescript` do mapa roda ao carregar.
- **Física** (`FUN_140426fd0`): gravidade -1300 u/s² (-400 debaixo d'água). Pulo: 450 u/s; pulo duplo: 450×0.6 somado à subida atual e ×1.4 na horizontal (`FUN_140558100`).
- **Drops** (`FUN_1403f7c40`, `1403fc080`, `1403fbe50`, `1403f6150`): `randompickups` 0..5 (padrão 3 em personagens) dá chance de item 0/15/30/45/65/100%; Tech Bits = max(valor/10, 1..4) em 1..2 pilhas, valor = nível×(1+15r); orbes 0..2 abaixo do nível 10, vida ou energia conforme o herói mais fraco; limite de 24 itens. `inventory_money`: toque, 60 s, sem ímã. Sem equipamento no port, o ramo de item paga em Tech Bits.
- **Objetos quebráveis**: `physent` com `health`, `deatheffect`, `deathsound`, `deathspawn`, `randompickups`. **Inimigos**: `specific_health` ou `monst_health`, dano `mdmg_*`, `spawnorbs`, `scale_factor` (`npcstat`, `shared_talents`). Efeitos contínuos do mapa: `loopfx`.
- Decompilado completo em `C:\Users\Eros\tools\re\out\all.c` (31.875 funções), gerado por `scripts/DumpAll.java`.
Pendente: agarrar, efeitos de carga, equipamento, vida dos heróis por `body` (hoje 240 fixo), `cameraFollowMotionPath`, iluminação do mapa (nós existem nos dados), carga do golpe pesado (segurar K), encontros scriptados da fase, popups do Fury com voz.

## Testes
`npm test` (Node LTS). Suítes que precisam dos arquivos do jogo são puladas quando a pasta não existe.

## Contribuindo / Licença
Veja [CONTRIBUTING.md](CONTRIBUTING.md). Código sob licença [MIT](LICENSE); Marvel Ultimate Alliance e seus dados pertencem aos respectivos donos e não são distribuídos.
