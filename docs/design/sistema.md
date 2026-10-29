# Design system do AgendaFácil

Um só sistema com duas **superfícies**. A página pública segue a Direção B (Vitrine) e o painel
segue a Direção A (Calmo). Os protótipos estão em [`index.html`](index.html) e a comparação em
[`README.md`](README.md).

| Superfície | Classe na raiz | Onde | Sensação |
|---|---|---|---|
| Vitrine | `.sup-vitrine` | `/<slug>` (cliente final) | Foto grande, pílulas, sombras macias |
| Painel | `.sup-painel` (padrão) | `/dashboard/*`, login, cadastro | Denso, linhas de 1 px, nada flutua em repouso |

Cores, tipografia, espaço, estados e movimento são **compartilhados**. A superfície só troca os
tokens de forma.

## Arquivos

| Arquivo | O que tem |
|---|---|
| `frontend/src/styles/tokens.css` | Todos os tokens, os temas claro e escuro e a superfície Vitrine |
| `frontend/src/styles/base.css` | Reset, foco, `.sr-only`, animações e "reduzir movimento" |
| `frontend/src/styles/componentes.css` | Botão, campo, cartão, selo, avatar, chip de horário, modal, toast, skeleton, vazio, tabela, abas |
| `frontend/src/components/ui/` | Componentes React (`import { Campo, Avatar, … } from 'components/ui'`) |
| `frontend/src/utils/cor.ts` | Contraste WCAG e as quatro variáveis da cor da empresa |
| `frontend/src/hooks/useCorEmpresa.ts` | Aplica a cor da empresa no `<html>` e recalcula a cada troca de tema |

**Catálogo:** `npm run dev` e abra `http://localhost:5173/_catalogo`. Dá para trocar superfície,
cor da empresa e tema. A rota só existe em desenvolvimento: `import.meta.env.DEV` é falso no build, e
o Vite remove a rota e o chunk.

## Tokens

### Cor

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--bg` | `#F7F8FA` | `#0F1013` | Fundo da página |
| `--surface` | `#FFFFFF` | `#16181C` | Blocos, cartões, campos |
| `--surface-2` | `#F0F2F5` | `#1D2025` | Rebaixado, hover, trilho do segmento |
| `--border` | `#E3E6EB` | `#2A2E35` | Linhas de 1 px |
| `--border-strong` | `#8A909C` | `#6B7280` | Contorno de campo (3:1) |
| `--text` | `#16181D` | `#ECEDF0` | Texto |
| `--text-muted` | `#565C68` | `#A3A8B2` | Secundário |
| `--text-subtle` | `#676D79` | `#8E94A0` | Terciário (ainda 4,5:1) |
| `--acao` / `--sobre-acao` | tinta / branco | claro / tinta | Ação neutra do produto (botão primário do painel) |
| `--ok`, `--aviso`, `--perigo` (+ `-soft`) | | | Confirmado, aguardando, cancelado/erro |

### Cor da empresa

`Empresa.cor_destaque` vira quatro variáveis, recalculadas para o tema atual por
`variaveisDestaque(hex, tema)`:

| Variável | Regra | Uso |
|---|---|---|
| `--destaque` | 3:1 contra a superfície **e** 4,5:1 com o texto sobre ela | Botão principal da vitrine, seleção, horário escolhido |
| `--sobre-destaque` | Branco ou tinta, o que contrastar mais | Texto sobre `--destaque` |
| `--destaque-suave` | `--destaque` misturado à superfície (86% no claro, 80% no escuro) | Fundo de seleção, avatar sem foto, "agora" |
| `--destaque-texto` | 4,5:1 sobre o fundo **e** sobre o tom suave | Links, preço em destaque, foco |

Se a cor não alcança a meta, ela é escurecida no tema claro e clareada no escuro, em passos de 8%,
até passar. Os testes (`utils/__tests__/cor.test.ts`) cobrem as sugestões e casos extremos (cinza
médio, branco, preto, vermelho puro) nos dois temas. O servidor continua recusando cores sem
texto legível (`corLegivel`).

**Onde a cor aparece:**

- **Vitrine:** é a cor principal (botões, seleção, carrinho).
- **Painel:** só onde há escolha ou "agora" (linha atual da agenda, item em andamento). Ali a ação
  é a tinta neutra (`--acao`).

### Tipografia

- **Uma família:** Figtree variável, auto-hospedada (`src/assets/fontes/figtree.woff2`). São 20 KB,
  subconjunto latino, `font-display: swap` e `unicode-range`.
- **Escala** (`--t-12` … `--t-44`): 12 · 13 · 14 · 15 · 16 · 17 · 20 · 22 · 26 · 32 · 44.
- **Corpo** (`--t-corpo`): 14 px no painel, 15 px na vitrine. Campos usam 16 px (evita zoom no iPhone).
- **Pesos:**
  - **Painel:** 400, 500 e 600.
  - **Vitrine:** títulos de 700 a 800, com `letter-spacing` de −0,02 em.
- **Números:** horários e dinheiro usam `.num` (números tabulares).

### Espaço, forma e sombra

| Token | Painel (A) | Vitrine (B) |
|---|---|---|
| Espaço | base 4: `--e-1` (4) … `--e-12` (48) | igual |
| `--r-controle` | 6 px | 12 px |
| `--r-bloco` | 10 px | 20 px |
| `--r-destaque` | 14 px | 28 px |
| `--r-botao` | 6 px | pílula |
| `--altura-botao` | 36 px | 44 px |
| `--sombra-bloco` | nenhuma (borda de 1 px) | `0 1px 2px` 5% + `0 6px 20px` 7% |
| `--sombra-flutuante` | `0 8px 24px` 12% | `0 16px 40px` 14% |

O alvo de toque é de 44 px no celular, nas duas superfícies.

### Movimento

| Token | Valor | Uso |
|---|---|---|
| `--t-rapida` | 120 ms ease | Hover, fundo, borda |
| `--t-media` | 180 ms | Entrada de modal e toast |
| `--t-lenta` | 300 ms | Carrinho e sheet subindo do rodapé |

Com `prefers-reduced-motion: reduce`, toda animação e transição cai para 0,01 ms (`base.css`).

## Componentes

| Componente | Classe | Notas |
|---|---|---|
| `Button` | `.btn .btn-{primary,destaque,secondary,ghost,danger,whatsapp}` | `loading` mostra spinner e desabilita |
| `Campo` | `.campo-grupo .campo` | Liga rótulo, dica e erro (`aria-describedby`, `aria-invalid`) |
| `Cartao` | `.bloco` (+ `.bloco-cab`) | Borda no painel, sombra na vitrine |
| `Modal` | `.modal` | Portal, Esc fecha, devolve o foco; `sheet` no celular |
| Toast | `.toast` | `useFeedback().toast(texto, tipo)`; erro usa `role="alert"` |
| `Skeleton` | `.skeleton` | `aria-hidden`; anuncie `aria-busy` no contêiner |
| `EstadoVazio` | `.empty-state` | Título, orientação e ação ("Cadastre seu primeiro serviço") |
| `Avatar` | `.avatar` | Foto ou iniciais no tom suave da empresa; `neutro` para "qualquer profissional" |
| `ChipHorario` | `.chip-horario` | `aria-pressed`; ocupado = desabilitado, riscado e anunciado como "ocupado" |
| `Selo` / `Badge` | `.selo` / `.badge` | Estados e status do agendamento |
| `Segmento` | `.segmento` | Grupo rotulado de botões com `aria-pressed` (Dia/Semana) |

## Regras

- **Nada de cor fixa nas telas.** Use os tokens; a cor da empresa só por `--destaque*`.
- **Foco visível em tudo:** `outline` de 2 px em `--foco` (a cor da empresa como texto).
- **Fotos:** vêm do Cloudinary de cada empresa. As fotos de exemplo do Unsplash ficam em
  `docs/design/comum/fotos/` e só entram no **modo demonstração** (`popular_demo`), nunca no bundle.
- **Aliases legados** (`--pinho`, `--marca`, `--r-sm`…) existem no fim de `tokens.css` para as telas
  ainda não migradas. Não use em código novo.
