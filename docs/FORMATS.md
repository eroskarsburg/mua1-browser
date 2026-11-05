# Formatos do Marvel Ultimate Alliance (PC) â€” engenharia reversa

## Container `.bin` (decifrado, validado em todos os 19 arquivos)
Header (28 bytes, LE): `u32 magic=0xB19ACA6E, u16 ver=1, u16 flags (0x11), u32 count, u32 comp1, u32 decomp2, u32 comp2, u32 maxEntry`.
Seguem `comp1` bytes (tabela de entradas, count*40) e `comp2` bytes (nomes, `\0`-separados); dados comeÃ§am em `0x1c+comp1+comp2`.
Cada bloco: `flags&0x10` => criptografia; `flags&1` => zlib. Ordem: ler -> decifrar -> inflate.
Cifra: `s=int16(compSize+0x55)`; `seed=(((s<<16)|s)^0x3b9a1d9)&0x0fffffff`; por dword: `seed=(seed*0x3fd+1)&0x0fffffff; dword^=seed` (bytes finais <4 ficam intactos).
Entrada (40 B): `u64 ts, u32 nameOff, u32 0, u64 dataOff (rel. ao inÃ­cio dos dados), u32 compSize, u32 0, u64 size`.
Origem: `Marvel.exe` 0x1400a1850 (leitor) e 0x1400a1b34 (`%s\%s.bin`).

## `.xmlb`
`u32 0x11b1, u32 ver=1, u32 strtabOff`; nÃ³ raiz em 8: `u32 nameOff, i32 nextSibling, i32 firstChild, u32 nAttr, nAttr*(u32 name,u32 val)`. Offsets absolutos; -1 = nenhum. 5213/5213 arquivos ok.

## Scripts (`scripts.bin`)
4595 arquivos texto "BehavEd" (`hero1 = alive("_HERO1_")`, `if/endif`, `startConversation(...)`). Precisa de interpretador prÃ³prio.

## `.igb` (Alchemy) — decifrado (6046 arquivos validados; texturas/modelos/mapas)
Header 48 B = 6 pares `(tamanho,contagem)`: P0 diretório, P1 meta-objetos, P2 objetos, P3 blobs, P4 tipos de metacampo, P5 (flags).
Ordem no arquivo: tabela de strings (0x30: `u32 size,u32 n`, n x (u32 len,bytes)) | tipos de metacampo (n x (len,1,0) + nomes) |
tipos de memória (`u32 size`) | meta-objetos (n x 6 i32 `[nameLen,1,0,nFields,parent,z]` + (nome, nFields x u16[tipo,slot,bytes])) |
pools (`u32 a,b,c,len`+nome, `u32 size,u32 n`+nomes) | diretório (registros `[tipo(3=objeto,4=memória),size,0x10,payload]`; tipo 3: [classe,nome]; tipo 4: [bytes,...,pool]) |
tabela F (`u32 size,u32 n,n x u16`: slot global -> índice do diretório) | objetos (`[classe,size,campos...]`) | blobs.
- Cada classe lista TODOS os seus campos (herdados incluídos); campo serializado = max(4,bytes) (Bool/Short ocupam 4; Vec3f=12; Long=8; Matrix44f=64).
- Slots globais: cada objeto e cada bloco de memória têm um slot; objetos ocupam, em ordem do fluxo, os slots cujo dir é tipo 3; `ObjectRef` = slot do objeto; `MemoryRef` = slot do bloco.
- Blobs: ordenados pelo slot crescente, tamanho = dir[F[slot]].bytes, alinhados a 4. A soma fecha com P3 em 100% dos arquivos.
- Listas (igNodeList/igAttrList/...): `[count, capacity, memref]`; o blob = array de slots (i32).
- Textura: igImage(w,h,..., fmt@9: 14=DXT1 16=DXT5, dataSize@10, memref@11); mips em igImageMipMapList; texturas bottom-up.
- Geometria: igGeometry -> igGeometryAttr2(vertexArray, indexArray); igVertexArray2 -> igVertexData[semântica 1 pos,3 normal,4 uv,2 cor 4uc,7/8 tangentes]; sempre lista de triângulos, índices u16.
- Nós: igTransform tem matriz 4x4 em v[4] (row-major com translação em [12..14] == column-major do GL).

## Atores (`actors.bin`, 813 `.igb`)
- Numerados (`0301` = herói 03 Wolverine, traje 01): malha; nomeados (`03_wolverine*.igb`, `zone_*`): esqueletos + animações.
- Raiz = `igSkin` -> `igBlendMatrixSelect` (grupo com attrs em v[4]) -> `igGeometry`. Sem `igSceneInfo`.
- Vértices skin: semântica 5 = pesos (igFloatList, 4/vértice), 6 = índices de blend (igUnsignedCharList, 4/vértice). Malha já vem na pose de bind.
- `igSkeleton`: v[2] = igSkeletonBoneInfoList (blob = slots de igSkeletonBoneInfo); v[3] = matrizes inverse-bind (uma por blend index, 64 B).
  `igSkeletonBoneInfo`: [nomeStringIdx, índiceDoPai, blendIndex(-1 se não skinned), flag]; nomes "Bip01 ...". Osso 0 = "Unnamed bone", último = "Motion".
- Multitextura: `igTextureBindAttr` por unidade (1 = difusa, 2 = mapa escuro/máscara). Formato de imagem 44 ainda não mapeado.
- Animação: `igAnimation` -> `igAnimationTrackList` -> `igAnimationTrack` -> `igEnbayaTransformSource[canal, ->igEnbayaAnimationSource(blob, ...)]`.

## Codec de animação Enbaya (`igEnbayaAnimationSource`) — decifrado
Blob (`g.mem(src.v[0])`): `u32 magic 0x017E36C4, u32 nCanais, f32 h (0.0004), f32 duração, u32 fps, u32 T[15]` (tamanhos das seções; soma == tamanho do blob; T[13] = nCanais, T[14] = 80 = tamanho do header).
Seções em ordem: `hdr | S1.D(T3) | S2.E(T8) | S3.D(T12) | S1.C(T2) | S2.D(T7) | S3.C(T11) | S1.A(T0) | S1.B(T1) | S2.A(T4) | S2.B(T5) | S2.C(T6) | S3.A(T9) | S3.B(T10) | máscaras(nCanais bytes)`.
- Cada canal = 7 componentes: quaternion (x,y,z,w) + translação (x,y,z). Máscara de 7 bits por canal = quais componentes recebem delta por frame.
- Frame 0 (S1): para cada canal e componente, código de 2 bits (MSB primeiro): 0→0, 1→i8 (S1.B), 2→i16 (S1.C), 3→i32 (S1.D). valor = int*h; quaternion normalizado. Acumuladores zerados.
- Frames 1..N (N = ceil(dur*fps)): por canal, por componente com bit na máscara: `acc += delta`; depois `v = v + h*acc` e normaliza o quaternion.
- Delta (S2): código 2b: 0→0, 1→+1, 3→-1, 2→escape p/ nibble (S2.B, MSB primeiro): tabela {esc,8,2,3,4,5,6,7,-8,-7,-6,-5,-4,-3,-2,-9}; nibble 0→byte (S2.C): 1..8→b+127, 0xF8..0xFF→b-128, outro→int8; byte 0→i16 (S2.D); i16 0→i32 (S2.E).
- S3 (run-length de máscara): lê-se um contador (código 2b: 0→0, 1→u8, 2→u16, 3→u32) antes do frame 1; antes de cada frame f>=2 percorre-se nCanais*7 posições (canal*7+comp): contador==0 → alterna o bit da máscara dessa posição e lê o próximo contador; senão consome posições.
- Validação: todos os 9 fluxos de 2763 animações são consumidos exatamente até o último byte.
- Pose: osso casa com canal por NOME (igAnimationBinding: blob i32 por osso do esqueleto da animação -> canal, -1 = sem canal). Translação do canal ≈0 => usa a do esqueleto (igSkeleton.v[1], 3 floats por osso). Rotação local row-vector = R(q) padrão; mundo = local·mundoPai; paleta = inverseBind·mundo.

## Scripts BehavEd (`scripts.bin`, `src/behaved.js`)
Gramática completa (71k linhas): `# comentário`; `f(a, b)`; `v = f(...)` ou `v = literal`; `if a op b` / `elif` / `else` / `endif` com op em `== != < > <= >=`;
argumentos = string `"..."` (pode conter vírgulas), número ou identificador (variável; indefinido == seu próprio nome). Sem laços, sem chamadas aninhadas.
Suspensão: `waittimed(seg)` e `waitsignal(nome)`. 244 nativas distintas; as mais usadas: waittimed, act, remove, setEnable, cameraFade, objective, copyOriginAndAngles, setGameFlag/getGameFlag, startConversation, playanim.
Nomes especiais de entidade: `_OWNER_`, `_ACTIVATOR_`, `_ACTIVE_HERO_`, `_HERO1_`.. `_HERO4_`.
Aritmética/strings puras: iadd isub fadd fsub fmul fdiv strcatstr strcatint instring randomInt. Entidades referenciam scripts por caminho (`actscript`, `spawnscript`, `deathscript`, `zonescript`, `monster_*script`...) ou por chamada inline (`actionFigureReward('r_af_bp',190,191)`).

## Mundo (`.xmlb` de `maps.bin`, `src/world.js`)
Raiz `world`: `entity` (definição: `name`, `classname`, `model`, `health`, `nocollide`, `actscript`...), `entinst type=X` com filhos `inst` (`name`, `pos "x y z"`, `orient "rx ry rz"`, `extents "x0 y0 z0 x1 y1 z1"`), `precache`.
Classes mais comuns: physent, monsterspawnerent, gameent, actionent, playerstartent, waypointent, doorent, zonelinkent, lightent, scripttriggerent, cameramagnetent.
Scripts de um mapa `a/b/c.xmlb` ficam em `a/b/c/*.py`.

## Instâncias no mapa
- `entity.model` + `.igb` resolve em `models.bin` (case-insensitive) para 19.627 de 19.652 instâncias com modelo.
- `inst.pos "x y z"`, `inst.orient "rx ry rz"` em radianos (Z para cima); matriz = T(pos) * Rz(rz) * Ry(ry) * Rx(rx), validada visualmente (colunas assentadas no piso).
- Instâncias sem modelo (playerstart, spawner, waypoint, zonelink, trigger) têm `extents "x0 y0 z0 x1 y1 z1"` locais: desenhadas como caixas coloridas por `classname`.

## Personagens (`data/npcstat.xmlb`, `data/herostat.xmlb`)
`stats name="Namor" skin="6301" characteranims="63_namor"`: `skin` = arquivo de malha em `actors.bin` (`6301.igb`), `characteranims` = arquivo com esqueleto+animações (`63_namor.igb`; combate em `*_4_combat`).
`monsterspawnerent` tem `character="Namor"` (nome em npcstat); `instantspawn="true"` nasce ao carregar; `act(spawner)` também cria. Entidade criada se chama `monster_name` ou o personagem em minúsculas.
Assinatura de `spawn(ondeNascer, tipoDeEntidade, nome, offset, angulos)`.

## Movimento (src/player.js)
Chão = raycast vertical contra triângulos com |nz|/|n| >= 0.5 do mapa e das entidades (grade 2D de 96 u). Paredes = triângulos verticais (altura >= 6) numa 2a grade; colisão cilíndrica (raio 16) entre z+34 e z+64.
Passo máximo 36 u; queda máxima 240 u; corrida 300 u/s, andar 130 u/s. Animação de raiz travada em XY (Bip01): o deslocamento vem do jogo.

## Combate (src/combat.js)
Animações por personagem: base (`NN_nome.igb`: idle, walk, run) + combate (`NN_nome_4_combat.igb`: attack_light1-3, attack_heavy1, attack_knockback1/2, attack_stun1/2, blocking, pain_blocking, attack_popup1, power_N, death_gen...). Mais comuns no jogo: idle 185, power_1/2 120, run 84, walk 74, attack_light1 56, attack_heavy1 50, death_gen 18.
Regras: ataque tem instante de acerto (42% leve, 50% pesado) -> alvos a <= 105 u, dentro de +-72 graus da frente e |dz| <= 70; dano base 16/20/24 (leve 1-3), 34 (pesado); knockback 55/90 u; golpes > 25 interrompem ataque do alvo; heróis ignoram reação a golpes < 14.
Morte: toca `death_gen` (ou knockback), executa `monster_deathscript` da entidade, some após 2.5 s (heróis ressuscitam). IA: inimigo mira o herói mais próximo (<= 800 u), corre até 0.75*alcance, ataca com cooldown 1.2-2.4 s.

## Efeitos (`effects.bin`, `src/effects.js`)
`<Effect looptime randlooptime persistloop>` com primitivas filhas: Cylinder 3331, Sprite 2960, ParticleCloud 1713, Trail 1466, OrientedSprite 1404, Line 1087, Model 365, Lightning 343, CameraShake 214, ScreenFlash 127, Spark 110, Light 68...
Atributos (faixas "min max" ou "minx miny minz maxx maxy maxz"): `count`, `delay`, `interval`, `life`, `origin`, `velocity`, `acceleration`, `gravity`, `drag`, `size` (x, tamanho inicial, final), `radius`, `startcolor1/2 midcolor1/2 endcolor1/2` (ARGB u32), `blend` (`alphaadditive` = aditivo), `texture` ("textures/nextgen/fire4.png" -> `nextgen/fire4.igb` em textures.bin; 99,8% resolvem).
Convenções de nome: golpes `base/hit/hit_{default,fire,cold,energy,knockback,...}`; poderes `char/<código>/pN_power` (wolv, storm, spider, captam, iron, thor, blade...).

## HUD (`hud.bin`, `src/hud.js`)
`hud_head_<skin>.igb` = retrato 128x128 (DXT, mips menores) do personagem cujo `skin` (herostat/npcstat) é `<skin>` (ex.: 0301 = Wolverine traje 1). Alguns arquivos não têm igTextureAttr: usar o igImage maior. Texturas bottom-up (inverter verticalmente no canvas).

## Conversas (`conversations.bin`, `src/conversation.js`)
Cada conversa = 3 XMLB: `.xmlb` (chaves `@AUTOGEN_...@NOME`), `.engb` (inglês), `.itab` (italiano). Árvore `conversation > startCondition > participant > line(text, soundtoplay) > response(text, chosenscriptfile, conversationend) > line...`.
Texto `"%PLAYER%: fala"` / `"%NICKFURY%: fala"`: `%PLAYER%` = herói ativo. `response text="%BLANK%"` = avanço automático; respostas com texto = escolhas. `chosenscriptfile` = script a executar ao escolher. Todas as 1666 conversas percorrem até o fim.

## Objetivos (`data/missions/*.engb`)
`<OBJECTIVE name descname description parentname optional zone rep>`; comandos `EOBJCMD_SHOW/COMPLETE/INCREMENT/HIDE/INCOMPLETE`. 93 definições, mas os scripts usam 334 nomes (1504 usos): só 542 usos têm texto nos dados extraídos.

## Câmera dos scripts (`src/director.js`)
`lockControls(-1)` trava, `0` libera, `n>0` trava n s. `cameraFade(alvo, s)`. `cameraToLocationAngles(olho, mira, s)` / `cameraMove(olho, s)` -> câmera orbital (target, yaw, pitch, dist). `cameraFocusToEntity(ent, dist, pitchGraus, yawGraus, s)`. `cameraPan("a pitchGraus dist", s)`. `cameraFOV(graus, s)`. `cameraShake(amp, s)`. Cutscene esconde o HUD e trava controles.

## Áudio (`sounds/eng/<c1>/<c2>/<zona>_m.pak/<categoria>.<sub>.<nome>.fsb`, `src/audio.js`)
12.787 arquivos, todos **FSB5**, modo 11 (MPEG) e na prática **MPEG-1 Layer II (MP2)** a 44,1 kHz (219 estéreo); 24.457 amostras (5.052 bancos com várias variações, tocadas ao acaso); 293 pacotes de zona.
Header FSB5: `FSB5, ver, nAmostras, tamHeadersAmostra, tamNomes, tamDados, modo, 8B zero, 16B hash, 8B` (60 bytes); header de amostra u64: `next(1) freq(4) estéreo(1) offsetDados/16(28) amostras(30)`. Dados em `60 + headers + nomes + offset`.
Scripts usam `categoria/sub/nome` -> arquivo `categoria.sub.nome.fsb` em qualquer pacote (os comuns se repetem; busca prioriza o pacote parecido com o nome da zona). Vozes de conversa: `soundtoplay="voice/Fury/..."`. Sons úteis: `common/melee/hit_*`, `woosh_punch`, `common/game/levelup`, `pickup_item`.
`decodeAudioData` não lê MP2: usa-se `vendor/jsmpeg.min.js` (MIT). Validado: 585 de 588 amostras com duração exata.

## Itens e save
`item_ents.xmlb`: `orbent` (`instanthealthorb`, `instantenergyorb`; `orbtype`, `lifetime` 15, coleta por toque, efeito `base/item/item_pickup`). `items.xmlb`: HEALTH_ITEM/ENERGY_ITEM (potions), itens com `affecter_entry`.
Save (`mua-save-v1`): `{v, at, map, team[], heroes{nome:{level,xp,maxhp,dmg}}, kills, flags[], zone[], objectives{shown,done,progress}}`.
