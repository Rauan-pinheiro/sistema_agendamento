# Direções visuais (fase 10)

Três propostas para a nova interface, em protótipos estáticos de HTML e CSS (sem backend). Nada
disso está no app ainda: **escolha uma direção** (ou uma combinação) e ela será implementada no React.

- **Abrir os protótipos:** `docs/design/index.html` no navegador. Estreite a janela para ver o
  celular. O botão de lua/sol troca o tema; serviços, profissional e horário são clicáveis.
- **Regerar os screenshots e a checagem de acessibilidade:** `node docs/design/capturar.cjs`
  (usa o Playwright e o axe já instalados em `frontend/`).
- **Dados de exemplo:** "hoje" é quinta, 29/10/2026, 13:40. A *Barbearia Canto do Corte* (Aldeota,
  cor azul-marinho `#1F4E8C`) e o *Studio Lume* (Meireles, bordô `#7A2238` na B, roxo `#5B3A8C` na C).
- **Fotos:** Unsplash (licença livre), só de exemplo. No app, as fotos vêm do Cloudinary de cada
  empresa (o "Ver mais" dos serviços já guarda fotos).

## Lado a lado

### Página pública: desktop

| A · Calmo | B · Vitrine | C · Marca-texto |
|---|---|---|
| ![](screenshots/a-publica-desktop-claro.png) | ![](screenshots/b-publica-desktop-claro.png) | ![](screenshots/c-publica-desktop-claro.png) |

### Página pública: celular (360 px), claro e escuro

| A claro | A escuro | B claro | B escuro | C claro | C escuro |
|---|---|---|---|---|---|
| ![](screenshots/a-publica-celular-claro.png) | ![](screenshots/a-publica-celular-escuro.png) | ![](screenshots/b-publica-celular-claro.png) | ![](screenshots/b-publica-celular-escuro.png) | ![](screenshots/c-publica-celular-claro.png) | ![](screenshots/c-publica-celular-escuro.png) |

### Painel "Hoje"

| A · Calmo | B · Vitrine | C · Marca-texto |
|---|---|---|
| ![](screenshots/a-hoje-desktop-claro.png) | ![](screenshots/b-hoje-desktop-claro.png) | ![](screenshots/c-hoje-desktop-claro.png) |
| ![](screenshots/a-hoje-desktop-escuro.png) | ![](screenshots/b-hoje-desktop-escuro.png) | ![](screenshots/c-hoje-desktop-escuro.png) |

### Agenda (uma coluna por profissional)

| A · Calmo | B · Vitrine | C · Marca-texto |
|---|---|---|
| ![](screenshots/a-agenda-desktop-claro.png) | ![](screenshots/b-agenda-desktop-claro.png) | ![](screenshots/c-agenda-desktop-claro.png) |
| ![](screenshots/a-agenda-celular-escuro.png) | ![](screenshots/b-agenda-celular-escuro.png) | ![](screenshots/c-agenda-celular-escuro.png) |

### Financeiro

| A · Calmo | B · Vitrine | C · Marca-texto |
|---|---|---|
| ![](screenshots/a-financeiro-desktop-claro.png) | ![](screenshots/b-financeiro-desktop-claro.png) | ![](screenshots/c-financeiro-desktop-claro.png) |
| ![](screenshots/a-financeiro-celular-claro.png) | ![](screenshots/b-financeiro-celular-claro.png) | ![](screenshots/c-financeiro-celular-claro.png) |

Os 48 screenshots (3 direções × 4 telas × celular/desktop × claro/escuro) estão em
[`screenshots/`](screenshots/).

## Comparação

| | A · Calmo | B · Vitrine | C · Marca-texto |
|---|---|---|---|
| **Sensação** | Ferramenta tranquila e precisa | Salão de revista, desejo | Agenda de papel bem cuidada |
| **O que vende** | A frase da reserva que se monta sozinha | A foto: capa e cartões grandes | Tabela de preços e comanda, familiar ao balcão |
| **Fonte baixada** | 0 KB (fonte do sistema) | 20 KB (Figtree, uma família) | 66 KB (Bricolage + Atkinson, as de hoje) |
| **Depende de fotos boas** | Pouco (miniaturas de 64 px) | Muito (sem foto, perde a graça) | Médio (miniaturas de 72 px e galeria) |
| **Densidade do painel** | Alta (cabe mais na tela) | Média (mais respiro, mais rolagem) | Média-alta |
| **Esforço para implementar** | Médio (tokens novos, mesma estrutura) | Alto (componentes novos, fallback sem foto, LCP da capa) | Baixo (mesmos tokens e fontes; refina componentes) |
| **Risco** | Parecer genérico, "mais um SaaS" | Página pública fraca se a empresa não tiver fotos | Personalidade forte demais para quem quer luxo |
| **Axe (WCAG 2.1 AA), 16 telas** | 0 violações | 0 violações | 0 violações |

**Minha recomendação: B na página pública e A no painel**, com os tokens e componentes num só
design system:

- **Página pública é vitrine.** O cliente final do salão compra pela foto, e a B é a que mais
  transmite "premium" no celular.
- **Painel é ferramenta.** O dono abre dezenas de vezes por dia. A densidade calma da A cabe mais
  na tela e cansa menos.

As duas já usam a mesma lógica de cor da empresa, a mesma estrutura de agenda e o mesmo menu.
Juntá-las significa a B usando a fonte Figtree no painel da A (ou o inverso, a fonte do sistema em tudo).

Se a prioridade for prazo e risco baixo, **C** é a escolha segura: sai mais rápido porque reaproveita
tokens, fontes e testes visuais do app atual.

---

## Direção A · Calmo (Linear, Cal.com)

**Ideia:** um passo por vez, sem ruído. A cor da empresa só aparece onde há escolha ou ação.

**A frase da reserva (o elemento marcante):** no topo da página pública, ela se monta enquanto a
pessoa escolhe. Por exemplo, *"Corte + barba e Pezinho e desenho com Davi Holanda, hoje às
15:30."* As partes que faltam aparecem pontilhadas.

| Token | Valor |
|---|---|
| Paleta (claro) | fundo `#F7F8FA`, superfície `#FFFFFF`, tinta `#16181D`, texto secundário `#565C68`, linha `#E3E6EB`, ação neutra `#16181D` |
| Paleta (escuro) | fundo `#0F1013`, superfície `#16181C`, tinta `#ECEDF0`, secundário `#A3A8B2`, linha `#2A2E35` |
| Estados | ok `#1F7A4D`, aguardando `#8A5A00`, perigo `#B3261E` (cada um com fundo suave) |
| Tipografia | Fonte do sistema (Segoe UI no Windows, SF no iPhone, Roboto no Android). Escala 12 · 13 · 14 · 16 · 20 · 22 · 32, pesos 400/500/600, números tabulares |
| Espaçamento | Base 4 px; linhas de lista de 44–56 px; páginas com 16 px (celular) e 32 px (desktop) |
| Raios | 6 px nos controles, 10 px em blocos, 14 px no resumo |
| Sombras | Nenhuma em repouso: tudo é borda de 1 px. Só o carrinho fixo flutua (`0 8px 24px` a 12%) |
| Microinterações | 120 ms de transição de fundo; o check do serviço preenche; o horário escolhido "afunda" 2% ao toque; passos concluídos ganham o número preenchido |

**Por que serve ao dono de salão:**

- **Painel que se lê de relance.** "A seguir" mostra hora, quanto falta, o cliente e um botão de
  WhatsApp. "Esperando sua confirmação" fica sempre visível.
- **Página pública que o dono entende sem treinamento.** É uma pergunta por vez, e a frase confirma
  o que foi escolhido.
- **Carrega instantâneo,** porque não baixa fonte nenhuma.

## Direção B · Vitrine (Fresha, Booksy)

**Ideia:** a foto vende.

- **Página pública:** capa de ponta a ponta com nome, nota e bairro sobre a imagem. Os serviços são
  cartões com foto grande (2 colunas no celular, 3 no desktop) e a equipe aparece em retratos.
- **Painel:** a próxima cliente ganha destaque, com a foto do serviço e o horário em 32 px.

| Token | Valor |
|---|---|
| Paleta (claro) | fundo `#FBFAFB`, superfície `#FFFFFF`, rebaixado `#F3F0F3`, tinta `#1D1720`, secundário `#5E5562`, linha `#E8E3E8` |
| Paleta (escuro) | fundo `#141016`, superfície `#1D181F`, tinta `#F4EFF5`, secundário `#B7ADBA`, linha `#352D37` |
| Cor da empresa | É a cor principal: botões, seleção, menu ativo, barras do gráfico. Bordô `#7A2238` no exemplo |
| Tipografia | Figtree variável (20 KB, subconjunto latino, `font-display: swap`). Títulos 700–800 com espaçamento −0,02 em; corpo 15 px; escala 12 · 13 · 15 · 17 · 22 · 30/44 (capa) · 40 (receita) |
| Espaçamento | Base 4 px, mais generoso: cartões com 16 px internos e 20 px entre si; seções com 28 px |
| Raios | 12 px em controles pequenos, pílula em botões e horários, 20 px nos cartões, 28 px no destaque do dia |
| Sombras | Em camadas e macias: `0 1px 2px` a 5% + `0 6px 20px` a 7%; flutuantes com `0 16px 40px` a 14% |
| Microinterações | A foto dá zoom de 4% sob o cursor (400 ms); "Adicionar" vira "✓ Adicionado" preenchido; a barra do carrinho sobe do rodapé (300 ms); o cartão escolhido ganha contorno na cor da empresa. Tudo some com "reduzir movimento" |

**Por que serve ao dono de salão:**

- **A página se parece com o Instagram do salão.** É o que o cliente final espera e o que faz o
  dono ter orgulho de compartilhar o link.
- **O painel mostra rostos e serviços, não só texto.** Isso ajuda equipes com várias profissionais.

**Cuidados na implementação:**

- **Serviço sem foto:** precisa de um padrão elegante, uma cor da empresa com ícone.
- **Capa:** deve sair em `srcset` pelo Cloudinary para manter o LCP abaixo de 2,5 s.

## Direção C · Marca-texto refinado (evolução do atual)

**Ideia:** levar a "agenda de papel bem cuidada" ao pé da letra.

- **Serviços como tabela de preços impressa:** o pontilhado liga o nome ao preço.
- **Carrinho como comanda:** com o picote no rodapé.
- **"Hoje" como folha do dia:** dividida em manhã, tarde e noite.
- **Agenda como caderno pautado:** com margem vermelha e linhas de meia em meia hora.
- **Marca-texto amarelo:** pinta **só** a escolha da pessoa (serviço, profissional, horário, item do
  menu, a linha "agora"), com um traço que entra da esquerda para a direita.

| Token | Valor |
|---|---|
| Paleta | A de hoje, sem mudança (`frontend/src/styles/tokens.css`): fundo `#F6F7F4`, tinta `#17262A`, pinho `#165C50`, marca-texto `#FFD25E`, tijolo `#A93C33`; escuro `#0F1A1C` / `#E6EEEC` / `#5CC2AA` / `#E7B93E` |
| Cor da empresa | Logo e botão principal da página pública (roxo `#5B3A8C` no exemplo). No painel, o pinho continua sendo a cor do produto |
| Tipografia | As de hoje, já auto-hospedadas: Bricolage Grotesque (títulos, horários, preços e totais) + Atkinson Hyperlegible Next 400/700 (texto). Escala 13 · 14 · 16 · 18 · 20 · 23 · 30/41 · 46 |
| Espaçamento | Base 4 px; listas com separador tracejado em vez de cartões; regra de 2 px em tinta sob o cabeçalho |
| Raios | Por hierarquia, como hoje: 8 px controles, 12 px folhas, 20 px na folha do carrinho do celular |
| Sombras | Só no que flutua (folha do carrinho); o resto é linha |
| Microinterações | O traço do marca-texto se pinta em 260 ms ao escolher; "✓ Escolhido" aparece na linha do serviço; o dia escolhido ganha um sublinhado grosso; o botão desce 1 px ao toque |

**Por que serve ao dono de salão:**

- **Fala a língua do balcão:** tabela de preços, comanda, folha do dia. É o que o dono já usa no
  papel, então a transição é natural.
- **Prazo menor:** é a evolução mais barata e não muda a identidade que os primeiros clientes já
  viram.

## Acessibilidade e desempenho (as três)

- **Axe, WCAG 2.1 A/AA:** 0 violações nas 48 capturas. O relatório fica em
  [`screenshots/axe.json`](screenshots/axe.json).
- **Cor de cada empresa com contraste garantido** ([`comum/proto.js`](comum/proto.js), função
  `aplicarDestaque`), recalculada a cada troca de tema. Ela gera quatro variáveis seguras:
  - **Preenchimento:** 3:1 contra a superfície.
  - **Texto sobre a cor:** branco ou tinta, o que der mais contraste.
  - **Cor como texto:** 4,5:1 sobre o fundo *e* sobre o tom suave. Clareia no escuro e escurece no
    claro até passar.
  - **Tom suave:** usado em fundos de seleção.
- **Toque e foco:**
  - **Alvos de toque:** 44 px no celular.
  - **Foco visível** em tudo.
  - **"Reduzir movimento"** desliga as animações.
  - **Agenda no celular:** as colunas rolam dentro do quadro, sem rolagem lateral da página.
- **Fontes rápidas:**
  - **woff2 auto-hospedado**, só o subconjunto latino, com `font-display: swap`.
  - **A** não baixa nada.
  - **B** baixa 20 KB.
  - **C** baixa 66 KB (as mesmas fontes do app).
- **Lighthouse:** os protótipos não foram medidos. A meta acima de 90 vale para a implementação no
  React e será medida lá.

## O que estes protótipos não decidem

- **Telas fora do escopo:** serviços, equipe, ajustes e o passo "seus dados" da reserva. Seguem a
  direção escolhida na implementação.
- **Menu do painel reorganizado:** Hoje, Agenda, Serviços, Equipe, Financeiro, Ajustes. "Equipe"
  junta profissionais e horários; no celular ficam 4 abas mais "Mais". É uma proposta, não
  obrigatória.
- **Visão "Semana" da agenda:** funciona nos protótipos (botão Dia/Semana), com cada dia dividido em
  faixas, uma por profissional. Não tem screenshot.
