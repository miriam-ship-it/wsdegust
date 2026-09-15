// GERADO por scripts/gerar-estilo-documento.mjs — NÃO EDITE À MÃO.
//
// O CSS do produto como string, para a edge montar o documento imprimível com o
// mesmo estilo da tela. A fonte de verdade são os .css em frontend/; rode o
// gerador depois de mexer em qualquer um deles. Há teste que reprova este
// arquivo se ele ficar velho.
//
// Fontes, nesta ordem: tokens.css, screener.css, rhia.css
export const ESTILO_DOCUMENTO = `/* tokens.css */
/* ==========================================================================
   Boomit — tokens de cor, tipografia, espaço e raio
   Gerado por scripts/generate_tokens.py. Todos os pares texto/fundo abaixo
   foram auditados contra a WCAG 2.1 AA.

   Regra de ouro: componentes consomem os tokens SEMÂNTICOS (--bg-*, --text-*,
   --border-*, --action-*, --status-*). As escalas cruas (--ink-*, --moss-*,
   --clay-*, --terra-*) existem só para alimentar os semânticos. Usar uma
   escala crua direto num componente é o que faz um design system apodrecer:
   quando a marca mudar, ninguém consegue achar todos os lugares.
   ========================================================================== */

:root {
  /* --- Cores oficiais do manual — imutáveis ----------------------------- */
  --boomit-preto: #1B1B1C;   /* Pantone 419 C  — principal */
  --boomit-verde: #545E54;   /* Pantone 4199 C — principal */
  --boomit-apoio-01: #F2F2F2; /* Pantone 9062 C */
  --boomit-apoio-02: #C6CFD1; /* Pantone 5455 C */
  --boomit-apoio-03: #EDE9E4; /* Pantone Cool Gray 1 C */
  --boomit-apoio-04: #9D9482; /* Pantone 6205 C */

  /* --- Escalas derivadas (OKLCH, luminância ancorada nas cores oficiais) - */
  --ink-50:  #F2F2F3;  --ink-100: #EAEAEB;  --ink-200: #CDCDCE;
  --ink-300: #B7B7B8;  --ink-400: #959596;  --ink-500: #7A7A7B;
  --ink-600: #5B5B5C;  --ink-700: #424243;  --ink-800: #2E2E2F;
  --ink-900: #242425;  --ink-950: #1B1B1C;

  --moss-50:  #EBF5EB; --moss-100: #E3EDE3; --moss-200: #C6D0C6;
  --moss-300: #B1BBB0; --moss-400: #8E988E; --moss-500: #737E73;
  --moss-600: #545E54; --moss-700: #3C453C; --moss-800: #283028;
  --moss-900: #1E271F; --moss-950: #161E16;

  --clay-50:  #FAF1E0; --clay-100: #F2E9D7; --clay-200: #D5CCBA;
  --clay-300: #BFB6A4; --clay-400: #9D9482; --clay-500: #827968;
  --clay-600: #625A4A; --clay-700: #494133; --clay-800: #332D20;
  --clay-900: #292317; --clay-950: #201A0E;

  --terra-50:  #FFE4E7; --terra-100: #FFDCDE; --terra-200: #F0BFC1;
  --terra-300: #DAA9AC; --terra-400: #B78689; --terra-500: #9A6C6F;
  --terra-600: #774E51; --terra-700: #5C3639; --terra-800: #442225;
  --terra-900: #39181C; --terra-950: #2F1014;

  /* --- Tipografia ------------------------------------------------------- */
  --font-sans: "PP Mori", "Inter", ui-sans-serif, system-ui, -apple-system,
               "Segoe UI", Roboto, sans-serif;
  --font-mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace;

  --weight-regular: 400;   /* PPMori-Regular  — corpo de texto */
  --weight-medium: 500;    /* PPMori-Medium   — rótulos, botões, dados */
  --weight-semibold: 600;  /* PPMori-SemiBold — títulos. É o peso mais forte
                              que a marca tem: não existe bold/800 na Boomit. */

  /* Escala tipográfica — razão 1.2, ancorada em 16px */
  --text-xs:   0.75rem;  --leading-xs:   1.125rem;
  --text-sm:   0.875rem; --leading-sm:   1.25rem;
  --text-base: 1rem;     --leading-base: 1.5rem;
  --text-lg:   1.125rem; --leading-lg:   1.75rem;
  --text-xl:   1.375rem; --leading-xl:   1.875rem;
  --text-2xl:  1.75rem;  --leading-2xl:  2.125rem;
  --text-3xl:  2.25rem;  --leading-3xl:  2.5rem;
  --text-4xl:  3rem;     --leading-4xl:  3.25rem;

  /* A logo é desenhada com muito espaço entre letras. Títulos grandes em
     caixa alta ecoam isso; texto corrido nunca leva tracking. */
  --tracking-display: 0.08em;
  --tracking-normal: 0;

  /* --- Espaço — grade de 4px -------------------------------------------- */
  --space-1: 0.25rem; --space-2: 0.5rem;  --space-3: 0.75rem;
  --space-4: 1rem;    --space-5: 1.25rem; --space-6: 1.5rem;
  --space-8: 2rem;    --space-10: 2.5rem; --space-12: 3rem;
  --space-16: 4rem;   --space-20: 5rem;   --space-24: 6rem;

  /* --- Raio — o "B" e o elemento 3D são cantos generosos, nunca vivos --- */
  --radius-sm: 0.375rem;
  --radius-md: 0.625rem;   /* padrão de inputs e botões */
  --radius-lg: 1rem;       /* cards */
  --radius-xl: 1.5rem;     /* painéis e modais */
  --radius-full: 9999px;   /* badges e avatares */

  /* --- Elevação — sombra neutra e discreta, nunca colorida -------------- */
  --shadow-sm: 0 1px 2px rgba(27, 27, 28, 0.06);
  --shadow-md: 0 2px 8px rgba(27, 27, 28, 0.08);
  --shadow-lg: 0 8px 24px rgba(27, 27, 28, 0.10);

  --duration-fast: 120ms;
  --duration-base: 200ms;
  --ease-out: cubic-bezier(0.2, 0, 0, 1);
}

/* ==========================================================================
   MODO CLARO (padrão)
   ========================================================================== */
:root,
[data-theme="light"] {
  --bg-canvas: var(--boomit-apoio-01);   /* fundo da página */
  --bg-surface: #FFFFFF;                 /* cards, tabelas, modais */
  --bg-surface-warm: var(--boomit-apoio-03); /* blocos editoriais, vazios */
  --bg-muted: var(--ink-100);            /* linhas zebradas, skeletons */
  --bg-inverse: var(--ink-950);
  --bg-brand: var(--boomit-verde);
  --bg-brand-subtle: var(--moss-100);

  --text-primary: var(--ink-950);        /* 15.4:1 */
  --text-secondary: var(--ink-700);      /*  9.0:1 */
  --text-tertiary: var(--ink-600);       /*  6.1:1 — mínimo aceitável */
  --text-inverse: var(--boomit-apoio-03);
  --text-brand: var(--boomit-verde);     /*  6.0:1 */
  --text-on-brand: #FFFFFF;              /*  6.8:1 sobre o verde */

  --border-subtle: var(--ink-200);       /* divisores, sem função semântica */
  --border-default: var(--ink-300);      /* contorno de card */
  --border-strong: var(--ink-500);       /* contorno de input — 4.3:1 */
  --focus-ring: var(--boomit-verde);

  --action-primary-bg: var(--ink-950);
  --action-primary-bg-hover: var(--ink-800);
  --action-primary-fg: #FFFFFF;
  --action-brand-bg: var(--boomit-verde);
  --action-brand-bg-hover: var(--moss-700);
  --action-brand-fg: #FFFFFF;
  --action-ghost-hover: var(--ink-100);
  --action-disabled-bg: var(--ink-200);
  --action-disabled-fg: var(--ink-500);

  --status-success-fg: var(--moss-700);
  --status-success-bg: var(--moss-100);
  --status-success-border: var(--moss-200);
  --status-warning-fg: var(--clay-700);
  --status-warning-bg: var(--clay-100);
  --status-warning-border: var(--clay-200);
  --status-danger-fg: var(--terra-700);
  --status-danger-bg: var(--terra-100);
  --status-danger-border: var(--terra-200);
  --status-info-fg: var(--ink-700);
  --status-info-bg: var(--boomit-apoio-02);
  --status-info-border: var(--ink-200);
  --status-neutral-fg: var(--ink-700);
  --status-neutral-bg: var(--ink-100);
  --status-neutral-border: var(--ink-200);
}

/* ==========================================================================
   MODO ESCURO
   O manual já prevê fundo escuro (logo e grafismo têm versão clara). O canvas
   é o preto oficial; as superfícies sobem em luminância, nunca descem.
   ========================================================================== */
[data-theme="dark"] {
  --bg-canvas: var(--ink-950);
  --bg-surface: var(--ink-900);
  --bg-surface-warm: var(--ink-800);
  --bg-muted: var(--ink-800);
  --bg-inverse: var(--boomit-apoio-03);
  --bg-brand: var(--boomit-verde);
  --bg-brand-subtle: var(--moss-900);

  --text-primary: var(--boomit-apoio-03); /* 14.2:1 */
  --text-secondary: var(--ink-300);       /*  8.6:1 */
  --text-tertiary: var(--ink-400);        /*  5.8:1 */
  --text-inverse: var(--ink-950);
  --text-brand: var(--moss-300);          /*  8.7:1 — o verde oficial não tem
                                             contraste no escuro; use o 300 */
  --text-on-brand: #FFFFFF;

  --border-subtle: var(--ink-800);
  --border-default: var(--ink-700);
  --border-strong: var(--ink-500);        /*  3.6:1 sobre a superfície */
  --focus-ring: var(--moss-300);

  --action-primary-bg: var(--boomit-apoio-03);
  --action-primary-bg-hover: #FFFFFF;
  --action-primary-fg: var(--ink-950);
  --action-brand-bg: var(--boomit-verde);
  --action-brand-bg-hover: var(--moss-500);
  --action-brand-fg: #FFFFFF;
  --action-ghost-hover: var(--ink-800);
  --action-disabled-bg: var(--ink-800);
  --action-disabled-fg: var(--ink-600);

  --status-success-fg: var(--moss-300);
  --status-success-bg: var(--moss-900);
  --status-success-border: var(--moss-700);
  --status-warning-fg: var(--clay-300);
  --status-warning-bg: var(--clay-900);
  --status-warning-border: var(--clay-700);
  --status-danger-fg: var(--terra-300);
  --status-danger-bg: var(--terra-900);
  --status-danger-border: var(--terra-700);
  --status-info-fg: var(--ink-300);
  --status-info-bg: var(--ink-800);
  --status-info-border: var(--ink-700);
  --status-neutral-fg: var(--ink-300);
  --status-neutral-bg: var(--ink-800);
  --status-neutral-border: var(--ink-700);

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.5);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.6);
}

/* --- Base ---------------------------------------------------------------- */
html {
  background-color: var(--bg-canvas);
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-weight: var(--weight-regular);
  font-size: 16px;
  -webkit-font-smoothing: antialiased;
}

/* O anel de foco é a única coisa no sistema que nunca pode ser removida:
   parte dos avaliados navega por teclado. */
:where(a, button, input, select, textarea, [tabindex]):focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

/* screener.css */
/* =============================================================
   SCREENER — homologação do gestor. Estilo.

   Consome SÓ os tokens semânticos de tokens.css. Nenhum hex solto (exceto o
   creme do grafismo da marca, que é constante de marca). Claro/escuro vêm de
   tokens.css. A estética é a da casa: quieta, monocromática, com respiro. A cor
   entra só onde diz algo — preto na ação principal, verde no momento de
   confirmar/concluir. Nada compete com o conteúdo (enunciados e devolutiva).
   Impacto visual vem de tamanho, espaço e composição, não de cor chapada.
   ============================================================= */

*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; background: var(--bg-canvas); color: var(--text-primary); }

/* Fonte definitiva: INTER. A PP Mori (fonte da marca) é licenciada e não é
   webfont pública; o produto Boomit no ar usa Inter, e a decisão aqui é a mesma
   (largura aparente próxima, pesos 400/500/600 — sem bold). Sobrescreve o
   --font-sans do design system na camada do projeto, sem tocar o tokens.css
   auditado. Os arquivos da Inter são carregados no <head> (Google Fonts). */
:root { --font-sans: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
.sc-shell { max-width: 46rem; margin: 0 auto; padding: 0 var(--space-4) var(--space-24); }
.sc-muted { color: var(--text-tertiary); }
.sc-center { text-align: center; }

/* --- Tarja de homologação (sempre no topo) -------------------------------- */
.sc-homolog { background: var(--status-warning-bg); color: var(--status-warning-fg); border-bottom: 1px solid var(--status-warning-border); }
.sc-homolog__in { max-width: 46rem; margin: 0 auto; padding: var(--space-3) var(--space-4); display: flex; gap: var(--space-3); align-items: flex-start; font-size: var(--text-sm); line-height: var(--leading-sm); }
.sc-homolog__ic { flex: none; width: 1.25rem; height: 1.25rem; margin-top: 1px; }
.sc-homolog b { font-weight: var(--weight-medium); }

/* --- Cabeçalho ------------------------------------------------------------ */
.sc-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); padding: var(--space-6) 0 var(--space-4); }
.sc-brand { display: flex; align-items: center; gap: var(--space-3); min-width: 0; }
.sc-brand__mark { width: 2rem; height: 2rem; flex: none; }
/* Wordmark institucional real (logo-boomit.png é a versão CLARA/creme, para fundo
   escuro). No claro, brightness(0) a torna preta; no escuro, fica creme. */
.sc-logo { height: 1.375rem; width: auto; display: block; flex: none; filter: brightness(0); }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .sc-logo { filter: none; } }
:root[data-theme="dark"] .sc-logo { filter: none; }
.sc-brand__divisor { width: 1px; height: 1.1rem; background: var(--border-default); flex: none; }
.sc-brand__sub { font-size: var(--text-xs); color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sc-theme { border: 1px solid var(--border-default); background: var(--bg-surface); color: var(--text-secondary); border-radius: var(--radius-full); width: 2.25rem; height: 2.25rem; display: grid; place-items: center; cursor: pointer; transition: background var(--duration-fast) var(--ease-out); }
.sc-theme:hover { background: var(--action-ghost-hover); }
.sc-theme svg { width: 1.125rem; height: 1.125rem; }

/* --- Tipos base ----------------------------------------------------------- */
.sc-eyebrow { font-size: var(--text-xs); letter-spacing: var(--tracking-display); text-transform: uppercase; color: var(--text-tertiary); font-weight: var(--weight-medium); margin: 0 0 var(--space-2); }
.sc-title { font-size: var(--text-2xl); line-height: var(--leading-2xl); font-weight: var(--weight-semibold); text-wrap: balance; margin: 0; }
.sc-title--lg { font-size: var(--text-3xl); line-height: var(--leading-3xl); }
.sc-title--xl { font-size: var(--text-4xl); line-height: var(--leading-4xl); }
.sc-lead { margin: var(--space-3) 0 0; color: var(--text-secondary); font-size: var(--text-base); line-height: var(--leading-lg); }
.sc-lead b, .sc-item__prompt b { font-weight: var(--weight-medium); }
.sc-prosa { margin: 0; font-size: var(--text-base); line-height: var(--leading-lg); color: var(--text-secondary); }
.sc-help { font-size: var(--text-sm); line-height: var(--leading-sm); color: var(--text-tertiary); }

/* --- Cartão --------------------------------------------------------------- */
.sc-card { background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: var(--space-8); }
.sc-card--quiet { background: var(--bg-muted); }
@media (max-width: 30rem) { .sc-card { padding: var(--space-5); } }

/* --- Abertura institucional ----------------------------------------------- */
.sc-hero { text-align: center; padding: var(--space-12) var(--space-2) var(--space-16); }
.sc-hero__logo { display: flex; justify-content: center; margin: 0 auto var(--space-8); }
.sc-hero__logo .sc-logo { height: 2.5rem; max-width: 70vw; }
@media (max-width: 30rem) { .sc-hero__logo .sc-logo { height: 2rem; } }
.sc-hero__title { font-size: var(--text-4xl); line-height: var(--leading-4xl); font-weight: var(--weight-semibold); text-wrap: balance; margin: var(--space-2) 0 0; }
.sc-hero__lead { max-width: 34rem; margin: var(--space-4) auto 0; color: var(--text-secondary); font-size: var(--text-lg); line-height: var(--leading-lg); }
.sc-hero .sc-actions { justify-content: center; margin-top: var(--space-8); }
.sc-hero__foot { max-width: 32rem; margin: var(--space-8) auto 0; font-size: var(--text-sm); color: var(--text-tertiary); }

/* --- Campos --------------------------------------------------------------- */
.sc-field { display: flex; flex-direction: column; gap: var(--space-2); }
.sc-label { font-size: var(--text-sm); font-weight: var(--weight-medium); }
.sc-input { height: 2.75rem; border: 1px solid var(--border-strong); background: var(--bg-surface); color: var(--text-primary); border-radius: var(--radius-md); padding: 0 var(--space-3); font-family: var(--font-sans); font-size: var(--text-base); letter-spacing: 0.02em; }
.sc-input::placeholder { color: var(--text-tertiary); letter-spacing: 0; }
.sc-input[aria-invalid="true"] { border-color: var(--status-danger-border); }

/* --- Botões --------------------------------------------------------------- */
.sc-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); min-height: 2.75rem; padding: 0 var(--space-5); border-radius: var(--radius-md); border: 1px solid transparent; font-family: var(--font-sans); font-size: var(--text-sm); font-weight: var(--weight-medium); cursor: pointer; transition: background var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out); }
.sc-btn svg { width: 1.05rem; height: 1.05rem; flex: none; }
.sc-btn:disabled { cursor: not-allowed; background: var(--action-disabled-bg); color: var(--action-disabled-fg); }
.sc-btn--primary { background: var(--action-primary-bg); color: var(--action-primary-fg); }
.sc-btn--primary:not(:disabled):hover { background: var(--action-primary-bg-hover); }
.sc-btn--brand { background: var(--action-brand-bg); color: var(--action-brand-fg); }
.sc-btn--brand:not(:disabled):hover { background: var(--action-brand-bg-hover); }
.sc-btn--ghost { background: var(--bg-surface); color: var(--text-primary); border-color: var(--border-default); }
.sc-btn--ghost:not(:disabled):hover { background: var(--action-ghost-hover); }
.sc-btn--block { width: 100%; }
.sc-btn--sm { min-height: 2.25rem; padding: 0 var(--space-3); font-size: var(--text-xs); }
.sc-actions { display: flex; gap: var(--space-3); flex-wrap: wrap; margin-top: var(--space-6); }
.sc-actions--split { justify-content: space-between; }
.sc-center-actions { justify-content: center; margin-top: var(--space-10); }

/* --- Consentimento -------------------------------------------------------- */
.sc-consent { margin-top: var(--space-6); display: grid; gap: var(--space-5); }
.sc-usebox { border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--bg-muted); padding: var(--space-4) var(--space-5); }
.sc-usebox h3 { margin: 0 0 var(--space-2); font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-secondary); }
.sc-usebox p, .sc-usebox li { font-size: var(--text-sm); line-height: var(--leading-sm); color: var(--text-secondary); }
.sc-usebox ul { margin: var(--space-2) 0 0; padding-left: var(--space-5); }
.sc-usebox b { font-weight: var(--weight-medium); }
.sc-ack { display: flex; gap: var(--space-3); align-items: flex-start; cursor: pointer; }
.sc-ack input { margin-top: 0.2rem; width: 1.1rem; height: 1.1rem; accent-color: var(--text-brand); flex: none; }
.sc-ack span { font-size: var(--text-sm); line-height: var(--leading-sm); }

/* --- Transição de bloco --------------------------------------------------- */
.sc-transicao { padding: var(--space-16) 0 var(--space-8); }
.sc-transicao__periodo { display: inline-block; margin-top: var(--space-2); font-size: var(--text-xs); letter-spacing: 0.03em; text-transform: uppercase; color: var(--text-tertiary); font-weight: var(--weight-medium); }

/* --- Progresso ------------------------------------------------------------ */
.sc-progress { position: sticky; top: 0; z-index: 5; background: var(--bg-canvas); padding: var(--space-4) 0 var(--space-3); }
.sc-progress__row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-2); }
.sc-progress__label { font-size: var(--text-sm); font-weight: var(--weight-medium); }
.sc-progress__count { font-size: var(--text-sm); color: var(--text-tertiary); font-variant-numeric: tabular-nums; white-space: nowrap; }
.sc-track { height: 0.375rem; border-radius: var(--radius-full); background: var(--bg-muted); overflow: hidden; }
.sc-track__fill { height: 100%; background: var(--text-brand); border-radius: inherit; transition: width var(--duration-base) var(--ease-out); }

/* --- Item (uma questão por tela) ------------------------------------------ */
.sc-item { background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: var(--space-8); margin-top: var(--space-5); }
@media (max-width: 30rem) { .sc-item { padding: var(--space-5); } }
/* Contêiner da questão recebe foco por programa (leitor de tela/teclado); não é
   controle, então não mostra anel — as alternativas mantêm o seu. */
#sc-questao:focus { outline: none; }
.sc-item__prompt { font-size: var(--text-xl); line-height: var(--leading-xl); font-weight: var(--weight-medium); margin: 0 0 var(--space-6); text-wrap: balance; }
.sc-opts { display: grid; gap: var(--space-3); }
.sc-opt { display: flex; gap: var(--space-3); align-items: flex-start; border: 1px solid var(--border-default); border-radius: var(--radius-md); padding: var(--space-4); cursor: pointer; transition: border-color var(--duration-fast) var(--ease-out), background var(--duration-fast) var(--ease-out); }
.sc-opt:hover { background: var(--action-ghost-hover); }
.sc-opt input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.sc-opt__dot { flex: none; width: 1.2rem; height: 1.2rem; margin-top: 0.1rem; border-radius: var(--radius-full); border: 1.5px solid var(--border-strong); display: grid; place-items: center; transition: border-color var(--duration-fast) var(--ease-out); }
.sc-opt__dot::after { content: ""; width: 0.62rem; height: 0.62rem; border-radius: var(--radius-full); background: var(--text-brand); transform: scale(0); transition: transform var(--duration-fast) var(--ease-out); }
.sc-opt__txt { font-size: var(--text-base); line-height: var(--leading-lg); color: var(--text-secondary); }
.sc-opt.is-checked, .sc-opt:has(input:checked) { border-color: var(--text-brand); background: var(--bg-brand-subtle); }
.sc-opt.is-checked .sc-opt__dot, .sc-opt:has(input:checked) .sc-opt__dot { border-color: var(--text-brand); }
.sc-opt.is-checked .sc-opt__dot::after, .sc-opt:has(input:checked) .sc-opt__dot::after { transform: scale(1); }
.sc-opt.is-checked .sc-opt__txt, .sc-opt:has(input:checked) .sc-opt__txt { color: var(--text-primary); }
.sc-opt:has(input:focus-visible) { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
/* "Não se aplica": neutra, sem alarme. Levemente recuada. */
.sc-opt--na .sc-opt__txt { color: var(--text-tertiary); }

/* Navegação voltar / autosave / avançar */
.sc-nav { position: sticky; bottom: 0; background: linear-gradient(to top, var(--bg-canvas) 62%, transparent); display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-5) 0 var(--space-6); margin-top: var(--space-6); }
.sc-save { font-size: var(--text-xs); color: var(--text-tertiary); display: inline-flex; align-items: center; gap: var(--space-1); text-align: center; }
.sc-save svg { width: 0.95rem; height: 0.95rem; }
.sc-save--ativo { color: var(--text-secondary); }
.sc-save--ok { color: var(--text-brand); }
@media (max-width: 26rem) { .sc-save { display: none; } }

/* --- Revisão -------------------------------------------------------------- */
.sc-rev { padding-top: var(--space-2); }
.sc-rev__bloco { margin-top: var(--space-6); }
.sc-rev__bnome { font-size: var(--text-lg); font-weight: var(--weight-semibold); margin: 0 0 var(--space-3); }
.sc-rev__linha { display: grid; grid-template-columns: 1fr auto; gap: var(--space-2) var(--space-4); align-items: start; padding: var(--space-4) 0; border-bottom: 1px solid var(--border-subtle); }
.sc-rev__q { grid-column: 1 / -1; display: flex; gap: var(--space-3); font-size: var(--text-sm); font-weight: var(--weight-medium); }
.sc-rev__n { flex: none; color: var(--text-tertiary); font-variant-numeric: tabular-nums; min-width: 1.5rem; }
.sc-rev__a { font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--leading-sm); }
.sc-rev__vazio { color: var(--status-danger-fg); }
.sc-rev__linha.is-vazio { background: var(--status-danger-bg); border-radius: var(--radius-md); padding-left: var(--space-3); padding-right: var(--space-3); }
.sc-rev__linha .sc-btn { align-self: center; }

/* Barra fixa de rodapé (revisão) */
.sc-footbar { position: sticky; bottom: 0; background: linear-gradient(to top, var(--bg-canvas) 60%, transparent); padding: var(--space-5) 0 var(--space-6); margin-top: var(--space-8); display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); flex-wrap: wrap; }

/* --- Notas inline --------------------------------------------------------- */
.sc-note { display: flex; gap: var(--space-3); align-items: flex-start; border-radius: var(--radius-md); padding: var(--space-3) var(--space-4); font-size: var(--text-sm); line-height: var(--leading-sm); margin-top: var(--space-4); }
.sc-note svg { flex: none; width: 1.1rem; height: 1.1rem; margin-top: 1px; }
.sc-note--danger { background: var(--status-danger-bg); color: var(--status-danger-fg); border: 1px solid var(--status-danger-border); }
.sc-note--ok { background: var(--status-success-bg); color: var(--status-success-fg); border: 1px solid var(--status-success-border); }

/* --- Captura de lead (degustação pública) --------------------------------- */
.sc-leadform { display: grid; gap: var(--space-4); }
.sc-leadform__sub { margin: 0; font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--leading-sm); }
.sc-card--lead { background: var(--bg-brand-subtle); border-color: var(--border-default); }

/* =========================================================================
   DEVOLUTIVA
   ========================================================================= */
.sc-result__head { text-align: center; padding: var(--space-10) 0 var(--space-6); }

/* Seção numerada */
.sc-sec { margin-top: var(--space-12); }
.sc-sec__head { display: flex; gap: var(--space-4); align-items: baseline; margin-bottom: var(--space-5); }
.sc-sec__num { flex: none; font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-tertiary); font-variant-numeric: tabular-nums; width: 1.75rem; height: 1.75rem; border-radius: var(--radius-full); border: 1px solid var(--border-default); display: grid; place-items: center; }
.sc-sec__title { font-size: var(--text-2xl); line-height: var(--leading-2xl); font-weight: var(--weight-semibold); margin: 0; text-wrap: balance; }
.sc-sec__sub { margin: var(--space-1) 0 0; font-size: var(--text-sm); color: var(--text-tertiary); }

/* Anel de índice (número grande em círculo) */
.sc-idx { display: grid; grid-template-columns: auto 1fr; gap: var(--space-6); align-items: start; }
@media (max-width: 34rem) { .sc-idx { grid-template-columns: 1fr; } }
.sc-anel { display: flex; flex-direction: column; align-items: center; gap: var(--space-2); }
.sc-anel__circ { width: 6.5rem; height: 6.5rem; border-radius: var(--radius-full); border: 2px solid var(--border-strong); display: flex; flex-direction: column; align-items: center; justify-content: center; background: var(--bg-surface); }
.sc-anel__num { font-size: var(--text-4xl); line-height: 1; font-weight: var(--weight-medium); font-variant-numeric: tabular-nums; }
.sc-anel__den { font-size: var(--text-xs); color: var(--text-tertiary); }
.sc-anel__band { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-secondary); text-align: center; max-width: 8rem; }

/* Dimensões (barra + leitura por faixa) */
.sc-dims { display: grid; gap: var(--space-5); }
.sc-idx__dims { min-width: 0; }
.sc-dim { display: grid; gap: var(--space-2); }
.sc-dim__top { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); }
.sc-dim__name { font-size: var(--text-sm); font-weight: var(--weight-medium); }
.sc-dim__score { font-size: var(--text-lg); font-weight: var(--weight-medium); font-variant-numeric: tabular-nums; white-space: nowrap; }
.sc-dim__den { font-size: var(--text-xs); color: var(--text-tertiary); font-weight: var(--weight-regular); }
.sc-dim__bar { height: 0.5rem; border-radius: var(--radius-full); background: var(--bg-muted); overflow: hidden; }
.sc-dim__fill { height: 100%; background: var(--text-secondary); border-radius: inherit; }
.sc-dim__read { margin: 0; font-size: var(--text-sm); line-height: var(--leading-sm); color: var(--text-tertiary); }
.sc-dim__read b { color: var(--text-secondary); font-weight: var(--weight-medium); }

/* Gate de governança (à parte) */
.sc-gate { margin-top: var(--space-6); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--bg-muted); padding: var(--space-4) var(--space-5); }
.sc-gate__k { font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-tertiary); font-weight: var(--weight-medium); }
.sc-gate__v { display: block; font-size: var(--text-lg); font-weight: var(--weight-semibold); margin-top: var(--space-1); }
.sc-gate__n { margin: var(--space-1) 0 0; font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--leading-sm); }

/* Matriz Empresa × IA */
.sc-matriz { display: grid; grid-template-columns: 16rem 1fr; gap: var(--space-6); align-items: center; }
@media (max-width: 34rem) { .sc-matriz { grid-template-columns: 1fr; } }
.sc-matriz__plot { width: 100%; }
.sc-matriz__plot svg { width: 100%; height: auto; }
.sc-mq { fill: var(--bg-muted); }
.sc-mq--alt { fill: var(--bg-surface); }
.sc-mx { stroke: var(--border-default); stroke-width: 0.6; stroke-dasharray: 2 2; }
.sc-maxis { stroke: var(--border-strong); stroke-width: 0.8; }
.sc-mdot { fill: var(--text-brand); stroke: var(--bg-surface); stroke-width: 1.5; }
.sc-mlabel { fill: var(--text-tertiary); font-size: 6px; font-family: var(--font-sans); font-weight: 500; }
.sc-matriz__quad { font-size: var(--text-lg); font-weight: var(--weight-semibold); margin: 0; }
.sc-matriz__msg { margin: var(--space-2) 0 0; font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--leading-sm); }

/* Alinhamento Pessoa × Empresa (divergente, neutro) */
.sc-als { display: grid; gap: var(--space-4); }
.sc-al { display: grid; gap: var(--space-2); }
.sc-al__top { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); }
.sc-al__name { font-size: var(--text-sm); font-weight: var(--weight-medium); }
.sc-al__dir { font-size: var(--text-xs); color: var(--text-tertiary); }
.sc-al__track { position: relative; height: 0.5rem; background: var(--bg-muted); border-radius: var(--radius-full); }
.sc-al__center { position: absolute; left: 50%; top: -3px; bottom: -3px; width: 1px; background: var(--border-strong); }
.sc-al__mark { position: absolute; top: 0; bottom: 0; border-radius: var(--radius-full); background: var(--text-secondary); }
.sc-al__mark--c { width: 6px !important; border-radius: var(--radius-full); }
.sc-al__leg { display: flex; justify-content: space-between; margin-top: var(--space-2); font-size: var(--text-xs); color: var(--text-tertiary); }

/* Prioridades */
.sc-prio { display: grid; gap: var(--space-3); }
.sc-prio__item { display: flex; gap: var(--space-4); background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: var(--space-5); }
.sc-prio__rank { flex: none; width: 2rem; height: 2rem; border-radius: var(--radius-full); background: var(--bg-inverse); color: var(--text-inverse); display: grid; place-items: center; font-size: var(--text-sm); font-weight: var(--weight-medium); }
.sc-prio__body { display: grid; gap: var(--space-2); }
.sc-prio__scope { font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-tertiary); font-weight: var(--weight-medium); }
.sc-prio__mv { font-size: var(--text-sm); line-height: var(--leading-lg); color: var(--text-secondary); }
.sc-prio__mv b { color: var(--text-primary); font-weight: var(--weight-medium); }

/* Plano de 30 dias */
.sc-plano { display: grid; gap: var(--space-3); grid-template-columns: repeat(3, 1fr); }
@media (max-width: 40rem) { .sc-plano { grid-template-columns: 1fr; } }
.sc-plano__item { border: 1px solid var(--border-subtle); border-top: 2px solid var(--text-brand); border-radius: var(--radius-md); background: var(--bg-surface); padding: var(--space-5); }
.sc-plano__k { font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-tertiary); font-weight: var(--weight-medium); }
.sc-plano__a { margin: var(--space-2) 0 0; font-size: var(--text-sm); line-height: var(--leading-lg); color: var(--text-secondary); }

/* Nota metodológica */
.sc-meta { margin: 0; padding-left: var(--space-5); display: grid; gap: var(--space-2); }
.sc-meta li { font-size: var(--text-sm); line-height: var(--leading-lg); color: var(--text-secondary); }
.sc-meta b { font-weight: var(--weight-medium); color: var(--text-primary); }

/* --- Tela de erro (estados terminais) ------------------------------------- */
/* Estado vazio: a marca aparece como textura (grafismo em baixa opacidade) sobre
   superfície quente — orientação do design system para estes momentos. */
.sc-erro { max-width: 34rem; margin: 0 auto; padding: var(--space-12) var(--space-2); }
.sc-erro__card { position: relative; overflow: hidden; background: var(--bg-surface-warm); border: 1px solid var(--border-subtle); border-radius: var(--radius-xl); padding: var(--space-16) var(--space-8); text-align: center; box-shadow: var(--shadow-md); }
@media (max-width: 30rem) { .sc-erro__card { padding: var(--space-12) var(--space-5); } }
.sc-erro__grafismo { position: absolute; width: 24rem; height: auto; right: -6rem; top: -5rem; opacity: 0.06; pointer-events: none; user-select: none; }
:root[data-theme="dark"] .sc-erro__grafismo { filter: invert(1); opacity: 0.08; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .sc-erro__grafismo { filter: invert(1); opacity: 0.08; } }
.sc-erro__corpo { position: relative; }
.sc-erro__ic { width: 3.75rem; height: 3.75rem; margin: 0 auto var(--space-6); border-radius: var(--radius-full); display: grid; place-items: center; }
.sc-erro__ic svg { width: 1.85rem; height: 1.85rem; }
.sc-erro__ic--warning { background: var(--status-warning-bg); color: var(--status-warning-fg); border: 1px solid var(--status-warning-border); }
.sc-erro__ic--neutral { background: var(--status-neutral-bg); color: var(--status-neutral-fg); border: 1px solid var(--status-neutral-border); }
.sc-erro__ic--danger { background: var(--status-danger-bg); color: var(--status-danger-fg); border: 1px solid var(--status-danger-border); }
.sc-erro .sc-lead { margin-top: var(--space-3); }
.sc-erro .sc-actions { justify-content: center; margin-top: var(--space-8); }

/* --- Carregamento --------------------------------------------------------- */
.sc-loading { display: flex; gap: var(--space-3); align-items: center; justify-content: center; padding: var(--space-16) 0; color: var(--text-tertiary); font-size: var(--text-sm); }
.sc-spin { width: 1.25rem; height: 1.25rem; border: 2px solid var(--border-default); border-top-color: var(--text-brand); border-radius: var(--radius-full); animation: sc-rot 0.7s linear infinite; }
@keyframes sc-rot { to { transform: rotate(360deg); } }
/* Transição suave ao trocar de questão / bloco. */
@keyframes sc-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.sc-item, .sc-transicao, .sc-hero { animation: sc-fade var(--duration-base) var(--ease-out); }
/* Atalho de teclado da alternativa (1–5) — dica discreta no canto da opção. */
.sc-opt__num { flex: none; margin-left: auto; align-self: center; font-size: var(--text-xs); color: var(--text-tertiary); font-variant-numeric: tabular-nums; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); min-width: 1.25rem; height: 1.25rem; display: grid; place-items: center; }
@media (max-width: 26rem) { .sc-opt__num { display: none; } }
.sc-opt:has(input:checked) .sc-opt__num { border-color: var(--text-brand); color: var(--text-brand); }
.sc-kbd { text-align: center; margin-top: var(--space-3); font-size: var(--text-xs); color: var(--text-tertiary); }
.sc-kbd kbd { font-family: var(--font-mono); border: 1px solid var(--border-default); border-radius: var(--radius-sm); padding: 0 0.3rem; font-size: 0.7rem; }
@media (max-width: 30rem) { .sc-kbd { display: none; } }

@media (prefers-reduced-motion: reduce) {
  .sc-spin { animation: none; }
  .sc-item, .sc-transicao, .sc-hero { animation: none; }
  .sc-track__fill, .sc-opt, .sc-btn, .sc-theme { transition: none; }
}

/* rhia.css */
/* =============================================================
   DIAGNÓSTICO BOOMIT — RH, Desenvolvimento e IA ("rhia"). Estilo.

   Carregado DEPOIS de tokens.css e screener.css: reaproveita a base sc-* da
   casa (shell, cabeçalho, botões, cartão, opções, progresso, revisão, notas,
   erro) e acrescenta só o que este instrumento pede, com prefixo rh-*.

   DECISÕES DE UI (rastreadas às skills Boomit Design / Boomit UI):
   1. Tokens — só tokens semânticos de tokens.css (--bg-*, --text-*, --border-*,
      --action-*, --status-*). Nenhum hex. Os únicos tokens "de escala" usados
      são os oficiais do manual, e só na impressão (ver 8).
   2. Tipografia — Inter (o head carrega 400/500/600; screener.css fixa a
      --font-sans). Sem bold: títulos em 600, rótulos/números em 500, corpo 400.
      Linha de leitura da devolutiva limitada a ~65ch (Modo 3, relatório).
   3. Hierarquia sem cor — título é título por tamanho e peso; cartões são
      superfície branca com borda sutil, sem sombra em repouso. O verde só na
      ação de marca (enviar/ver leitura) e no traço de foco; o preto na ação
      principal. Nenhuma seção da devolutiva é colorida "para destacar".
   4. Estados semânticos — o gate de governança usa os tokens de estado
      (danger para crítico, warning para atenção/insuficiente, neutral para
      monitorado, success para estabelecido) SEMPRE com ícone + rótulo + texto:
      cor nunca é o único sinal. Crítico/insuficiente ganham borda 2px e
      escala maior (prioridade visual), não um bloco chapado.
   5. Escada — o gráfico da devolutiva. Cinco degraus subindo da esquerda para
      a direita, nome acima do bloco, tamanho crescendo com a posição —
      estrutura inspirada na escada do deck do curso. O 3D, o degradê e a
      sombra do deck NÃO vieram: a skill os proíbe em gráfico. No lugar do
      degradê, a rampa SEQUENCIAL sancionada (família moss, claro → escuro),
      chapada. UM ÚNICO destaque: o degrau atual sai da rampa, recebe o preto
      oficial, faixa quente atrás da coluna e a etiqueta contornada "Degrau
      atual" — nunca só por cor (etiqueta + posição + aria-current). A
      referência de atuação não é marcada aqui (é dita em prosa no bloco 3):
      dois destaques leriam como "onde você deveria estar". Abaixo de 40rem a
      escada gira e a altura vira largura de barra. Nota fixa sob a escada: o
      quinto degrau não exige tecnologia proprietária, modelo próprio nem
      agentes.
   6. Rota NIST — lista ordenada com ícone de ciclo e frase explícita "funções
      complementares e recorrentes, não estágios"; nada de setas de progresso.
   7. Plano 30–60–90 — tabela com divisor (sem zebra), cabeçalho 500; em tela
      estreita cada linha vira cartão com o rótulo da coluna (data-col), como
      manda o padrão de tabela da casa.
   8. Impressão — @media print: fundo branco (o app troca para o tema claro em
      beforeprint, então os tokens semânticos já são os claros), sem sombra,
      sem botões/controles, cartões com break-inside: avoid, cabeçalho com data
      e versão (.rh-print-head), disclaimer sempre presente e a MEDIDA DE
      LEITURA preservada (40em centralizados; sem ela a linha em A4 chega a
      ~110 caracteres). Cores oficiais
      (--boomit-preto / --boomit-apoio-02) só como rede de segurança de texto e
      borda no papel.
   9. A11y — anel de foco de 2px/offset 2px (herdado de tokens.css) em tudo que
      é clicável; alvo mínimo 44px (2.75rem) em botões e opções; radiogroup +
      fieldset/legend no contexto; erro de campo abaixo, com ícone e
      aria-describedby; prefers-reduced-motion desliga animações; 320px sem
      overflow horizontal (grids colapsam, tabela vira cartão).
   10. Movimento — só a entrada suave da tela (200ms, ease da casa); nada de
      bounce; progresso com transição de largura.
   11. Devolutiva como DOCUMENTO (Modo 3 da skill): capa em superfície quente
      com respiro largo, mapa de leitura em duas colunas logo abaixo, seções
      numeradas (o numeral é informação — a ordem de leitura é real), a
      assinatura como citação com filete, e colofão com data e versões no pé.
      O "encantador" pedido veio de escala, respiro e hierarquia tipográfica —
      não de cor, ornamento ou métrica nova.
   12. Escalas cruas — a rampa da escada (--moss-*) é a ÚNICA exceção à regra
      "só tokens semânticos", confinada a variáveis locais de .rh-escada-fig.
      A skill prevê exatamente este caso: série de gráfico.
   ============================================================= */

.rh-shell { max-width: 46rem; }
.rh-k { font-weight: var(--weight-medium); color: var(--text-primary); }

/* --- Abertura ------------------------------------------------------------- */
/* A marca aparecia DUAS vezes na primeira dobra: pequena no cabeçalho e grande
   no hero, uma logo abaixo da outra. Na abertura vale a grande — é a única tela
   em que a marca tem espaço para respirar. O cabeçalho fica só com o botão de
   tema, empurrado para a direita (sem a marca, o \`space-between\` levaria o
   botão para a esquerda). Nas demais telas o cabeçalho segue com a marca. */
.rh-tela--abertura .sc-head .sc-brand { display: none; }
.rh-tela--abertura .sc-head .sc-theme { margin-left: auto; }

/* O título deste diagnóstico é longo ("Diagnóstico Boomit — RH, Desenvolvimento
   e IA") e a regra do V1 (.sc-hero__title, 48px fixos) estourava a largura em
   320px: só a palavra "Desenvolvimento" mede mais que a caixa. Sobrescrito
   APENAS no rhia (o V1 é intocável), com escala fluida e quebra em último caso. */
.rh-hero .sc-hero__title { font-size: clamp(var(--text-2xl), 8.5vw, var(--text-4xl)); line-height: 1.1; overflow-wrap: anywhere; }
.rh-hero .sc-hero__lead { max-width: 38rem; }
.rh-hero__fatos { list-style: none; margin: var(--space-8) auto 0; padding: 0; max-width: 34rem; display: grid; gap: var(--space-3); text-align: left; }
.rh-hero__fatos li { display: flex; gap: var(--space-3); align-items: flex-start; font-size: var(--text-sm); line-height: var(--leading-sm); color: var(--text-secondary); }
.rh-hero__fatos svg { flex: none; width: 1.1rem; height: 1.1rem; margin-top: 1px; color: var(--text-tertiary); }
.rh-hero .sc-note { text-align: left; max-width: 34rem; margin-left: auto; margin-right: auto; }

/* --- Contexto (3 itens numa tela) ---------------------------------------- */
.rh-ctx-card { margin-top: var(--space-5); }
.rh-ctx { border: 0; margin: var(--space-8) 0 0; padding: 0; min-width: 0; }
.rh-ctx__prompt { padding: 0; margin: 0 0 var(--space-4); font-size: var(--text-lg); line-height: var(--leading-lg); font-weight: var(--weight-medium); text-wrap: balance; }
.rh-ctx__opts .sc-opt { min-height: 2.75rem; }
.rh-texto { margin-top: var(--space-4); }
.rh-field__erro { display: flex; gap: var(--space-2); align-items: flex-start; margin: 0; font-size: var(--text-sm); line-height: var(--leading-sm); color: var(--status-danger-fg); }
.rh-field__erro svg { flex: none; width: 1rem; height: 1rem; margin-top: 2px; }
.sc-btn[aria-disabled="true"] { background: var(--action-disabled-bg); color: var(--action-disabled-fg); cursor: not-allowed; }
.rh-note--warning { background: var(--status-warning-bg); color: var(--status-warning-fg); border: 1px solid var(--status-warning-border); }
.rh-progress__txt { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; margin: 0; }
.sc-opt { position: relative; }

/* --- Questões: pilha com vizinhos esmaecidos ------------------------------
   Uma questão por vez, com a anterior e a próxima visíveis e apagadas. Dá
   sentido de percurso — quanto já andou, o que vem — sem competir com a
   pergunta que está sendo respondida. Escolher já avança, então não há botão
   de "Avançar": o único controle é o caminho de volta, que é o vizinho de
   cima (a seta ← faz o mesmo).

   O vizinho de baixo NÃO é clicável e sai da árvore de acessibilidade: ver o
   que vem não pode virar pular sem responder. O de cima é um <button> de
   verdade, com rótulo próprio para quem usa leitor de tela. */
.rh-pilha { display: grid; gap: var(--space-4); margin-top: var(--space-5); }
.rh-viz { display: block; width: 100%; text-align: left; margin: 0; border: 0; background: none;
  padding: var(--space-4) var(--space-5); border-radius: var(--radius-lg); color: var(--text-tertiary);
  font: inherit; opacity: 0.55; transition: opacity var(--duration-base) var(--ease-out); }
.rh-viz__k { display: block; font-size: var(--text-xs); letter-spacing: var(--tracking-display); text-transform: uppercase; font-weight: var(--weight-medium); }
.rh-viz__t { display: block; margin-top: var(--space-1); font-size: var(--text-sm); line-height: var(--leading-sm);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.rh-viz--antes { cursor: pointer; border: 1px solid transparent; }
.rh-viz--antes:hover { opacity: 0.9; background: var(--bg-muted); }
.rh-viz--antes:focus-visible { opacity: 1; border-color: var(--border-default); }
.rh-viz--depois { pointer-events: none; user-select: none; }
.rh-pilha__atual { margin: 0; }
/* O botão de avançar sumiu; a barra fica só com o indicador de salvamento. */
.rh-nav--simples { justify-content: flex-end; }
@media (max-width: 30rem) {
  .rh-viz { padding: var(--space-3) var(--space-4); }
  .rh-viz__t { -webkit-line-clamp: 1; }
}
/* Quem pediu menos movimento não recebe a transição de opacidade. */
@media (prefers-reduced-motion: reduce) { .rh-viz { transition: none; } }

/* --- Uma questão cabe numa tela ------------------------------------------
   Pedido: a pergunta e as alternativas devem caber sem rolar; só as de
   alternativas muito longas podem exigir rolagem.

   Medido antes de escrever: num aparelho de 390x844 a tela de pergunta pedia
   cerca de 1100px, sobrando ~290px para fora. A altura vinha de cinco lugares,
   e os cinco foram tratados — pela ordem do que mais ocupava:
     1. as cinco alternativas, que sozinhas passavam de 480px;
     2. o cartão em volta da pergunta (borda + 40px de recheio);
     3. o cabeçalho com marca e botão de tema, que no meio do questionário não
        serve para nada;
     4. o enunciado;
     5. os vizinhos esmaecidos.

   O piso que NÃO foi cruzado: corpo de 14px, altura de linha 1.4 e alvo de
   toque de 44px. Caber não pode custar legibilidade nem precisão do dedo —
   por isso as perguntas de alternativa muito longa ainda rolam, e isso é o
   comportamento pedido, não uma falha. */
.rh-tela--questoes .sc-item, .rh-tela--contexto .sc-item { padding: var(--space-4) var(--space-5); margin-top: var(--space-2); }
.rh-tela--questoes .sc-item__prompt, .rh-tela--contexto .sc-item__prompt {
  font-size: var(--text-lg); line-height: var(--leading-lg); margin-bottom: var(--space-4); }
.rh-tela--questoes .sc-opts, .rh-tela--contexto .sc-opts { gap: var(--space-2); }
.rh-tela--questoes .sc-opt, .rh-tela--contexto .sc-opt { padding: var(--space-3) var(--space-4); min-height: 2.75rem; }
.rh-tela--questoes .sc-opt__txt, .rh-tela--contexto .sc-opt__txt { font-size: 0.9375rem; line-height: 1.375rem; }
.rh-tela--questoes .rh-pilha, .rh-tela--contexto .rh-pilha { gap: var(--space-2); margin-top: var(--space-2); }
.rh-tela--questoes .rh-viz, .rh-tela--contexto .rh-viz { padding: var(--space-2) var(--space-4); }
.rh-tela--questoes .rh-viz__t, .rh-tela--contexto .rh-viz__t { -webkit-line-clamp: 1; font-size: var(--text-xs); }
.rh-tela--questoes .sc-progress, .rh-tela--contexto .sc-progress { padding: var(--space-2) 0; }
.rh-tela--questoes .sc-nav, .rh-tela--contexto .sc-nav { padding: var(--space-1) 0 var(--space-2); margin-top: 0; }

/* No aparelho de toque o aperto é maior, e o cabeçalho sai: a marca e o botão
   de tema não fazem falta no meio de 30 perguntas, e custam ~70px de altura. */
@media (max-width: 48rem) {
  .rh-tela--questoes .sc-head, .rh-tela--contexto .sc-head { display: none; }
  .rh-tela--questoes .sc-kbd, .rh-tela--contexto .sc-kbd { display: none; }
  /* Sem cartão: a moldura custa 40px de recheio mais a borda, e a pergunta não
     precisa de moldura quando é a única coisa na tela. */
  .rh-tela--questoes .sc-item, .rh-tela--contexto .sc-item {
    background: none; border: 0; border-radius: 0; padding: var(--space-2) 0; }
  .rh-tela--questoes .sc-item__prompt, .rh-tela--contexto .sc-item__prompt {
    font-size: var(--text-base); line-height: var(--leading-base); margin-bottom: var(--space-3); }
  .rh-tela--questoes .sc-opt, .rh-tela--contexto .sc-opt { padding: var(--space-2) var(--space-3); gap: var(--space-2); }
  .rh-tela--questoes .sc-opt__txt, .rh-tela--contexto .sc-opt__txt { font-size: 0.875rem; line-height: 1.25rem; }
  .rh-tela--questoes .rh-viz, .rh-tela--contexto .rh-viz { padding: var(--space-1) var(--space-3); }
  .rh-tela--questoes .rh-viz__k, .rh-tela--contexto .rh-viz__k { font-size: 0.625rem; }
}

/* Tela baixa (Android menor, 360x740, ou celular deitado): aperta o que ainda
   dá sem cruzar o piso. O vizinho de baixo sai — dos dois, é o que menos serve,
   porque não é clicável; o de cima fica, que é o caminho de volta. Mesmo assim
   as perguntas de alternativa mais longa continuam rolando, e é o combinado. */
@media (max-width: 48rem) and (max-height: 800px) {
  .rh-tela--questoes .rh-viz--depois, .rh-tela--contexto .rh-viz--depois { display: none; }
  .rh-tela--questoes .sc-opts, .rh-tela--contexto .sc-opts { gap: 0.375rem; }
  .rh-tela--questoes .sc-opt, .rh-tela--contexto .sc-opt { padding: 0.375rem var(--space-3); }
  .rh-tela--questoes .sc-opt__txt, .rh-tela--contexto .sc-opt__txt { line-height: 1.2rem; }
  .rh-tela--questoes .sc-item__prompt, .rh-tela--contexto .sc-item__prompt { margin-bottom: var(--space-2); }
  .rh-tela--questoes .sc-progress, .rh-tela--contexto .sc-progress { padding: var(--space-1) 0; }
}

/* --- Revisão -------------------------------------------------------------- */
.rh-rev__texto { color: var(--text-primary); }
.rh-tela--revisao .sc-rev__linha .sc-btn { min-height: 2.75rem; }

/* --- Portão de lead ------------------------------------------------------- */
.rh-gate-head { padding: var(--space-2) 0 var(--space-5); }

/* =========================================================================
   DEVOLUTIVA (documento, não dashboard)
   ========================================================================= */
.rh-result { max-width: 65ch; margin: 0 auto; }

/* --- Capa ------------------------------------------------------------------
   O documento abre como documento: respiro generoso, título grande, o que a
   leitura é dita em prosa acolhedora e só então a ressalva metodológica. A
   superfície quente separa a capa do miolo sem usar cor de marca. */
.rh-capa { background: var(--bg-surface-warm); border-radius: var(--radius-xl); padding: var(--space-12) var(--space-10) var(--space-10); margin-top: var(--space-6); }
.rh-capa__t { margin-top: var(--space-2); text-wrap: balance; }
.rh-capa__lead { max-width: 34rem; }
.rh-capa__nota { margin: var(--space-4) 0 0; max-width: 34rem; font-size: var(--text-sm); line-height: var(--leading-lg); color: var(--text-tertiary); }
.rh-capa__data { margin: var(--space-6) 0 0; font-size: var(--text-xs); letter-spacing: var(--tracking-display); text-transform: uppercase; color: var(--text-tertiary); font-weight: var(--weight-medium); }
.rh-evid { margin: var(--space-8) 0 0; padding-top: var(--space-5); border-top: 1px solid var(--border-subtle); }
.rh-evid__k { font-size: var(--text-xs); letter-spacing: var(--tracking-display); text-transform: uppercase; color: var(--text-tertiary); font-weight: var(--weight-medium); }
.rh-evid__v { margin: var(--space-1) 0 0; font-size: var(--text-2xl); line-height: var(--leading-2xl); font-weight: var(--weight-medium); }
.rh-evid dd { margin-inline-start: 0; }
.rh-evid__t { margin: var(--space-2) 0 0; max-width: 34rem; font-size: var(--text-sm); line-height: var(--leading-lg); color: var(--text-secondary); }
@media (max-width: 40rem) { .rh-capa { padding: var(--space-8) var(--space-5); border-radius: var(--radius-lg); } }

.rh-lente { margin-top: var(--space-6); background: var(--bg-surface); border: 1px solid var(--border-subtle); border-left: 2px solid var(--bg-brand); border-radius: 0 var(--radius-md) var(--radius-md) 0; padding: var(--space-4) var(--space-5); }
.rh-lente__k { display: block; font-size: var(--text-xs); letter-spacing: var(--tracking-display); text-transform: uppercase; color: var(--text-tertiary); font-weight: var(--weight-medium); }
.rh-lente__t { margin: var(--space-2) 0 0; font-size: var(--text-sm); line-height: var(--leading-lg); color: var(--text-secondary); }

/* --- Síntese executiva -----------------------------------------------------
   A leitura inteira num parágrafo, logo depois da capa. Escala de leitura
   maior que o corpo e filete à esquerda: é o único bloco que alguém com pressa
   vai ler, então tem de se anunciar sem virar caixa colorida. */
.rh-sintese { margin-top: var(--space-10); border-left: 2px solid var(--border-strong); padding: var(--space-1) 0 var(--space-1) var(--space-6); }
.rh-sintese__k { margin: 0; font-size: var(--text-xs); letter-spacing: var(--tracking-display); text-transform: uppercase; color: var(--text-tertiary); font-weight: var(--weight-medium); }
.rh-sintese__p { margin: var(--space-3) 0 0; max-width: 40rem; font-size: var(--text-lg); line-height: var(--leading-lg); color: var(--text-primary); }
@media (max-width: 40rem) { .rh-sintese { padding-left: var(--space-4); } .rh-sintese__p { font-size: var(--text-base); } }

/* --- Mapa de leitura -------------------------------------------------------
   Duas colunas de itens numerados: diz de cara o tamanho e a ordem do que
   vem. Não são links — a tela é roteada por hash, e um âncora mudaria a rota. */
.rh-mapa { margin-top: var(--space-10); padding-top: var(--space-6); border-top: 1px solid var(--border-subtle); }
.rh-mapa__k { margin: 0 0 var(--space-2); font-size: var(--text-xs); letter-spacing: var(--tracking-display); text-transform: uppercase; color: var(--text-tertiary); font-weight: var(--weight-medium); }
.rh-mapa__l { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2) var(--space-6); }
.rh-mapa__i { display: flex; gap: var(--space-3); align-items: baseline; min-width: 0; font-size: var(--text-sm); line-height: var(--leading-sm); }
.rh-mapa__n { flex: none; color: var(--text-tertiary); font-variant-numeric: tabular-nums; font-size: var(--text-xs); }
.rh-mapa__t { color: var(--text-secondary); min-width: 0; }
@media (max-width: 40rem) { .rh-mapa__l { grid-template-columns: 1fr; } }

/* --- Seções ---------------------------------------------------------------- */
.rh-sec { margin-top: var(--space-16); }
.rh-sec__head { margin-bottom: var(--space-6); }
.rh-sec__n { display: block; margin-bottom: var(--space-2); font-size: var(--text-xs); letter-spacing: var(--tracking-display); color: var(--text-tertiary); font-weight: var(--weight-medium); font-variant-numeric: tabular-nums; }
.rh-sec__title { font-size: var(--text-2xl); line-height: var(--leading-2xl); font-weight: var(--weight-semibold); margin: 0; text-wrap: balance; }
.rh-sec__sub { margin: var(--space-2) 0 0; max-width: 42rem; font-size: var(--text-sm); line-height: var(--leading-sm); color: var(--text-tertiary); }
.rh-prosa { margin: 0 0 var(--space-3); font-size: var(--text-base); line-height: var(--leading-lg); color: var(--text-secondary); }
.rh-prosa:last-child { margin-bottom: 0; }

.rh-card { background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: var(--space-6); }
.rh-card--quiet { background: var(--bg-muted); }
.rh-card--info { display: flex; gap: var(--space-4); background: var(--status-info-bg); border-color: var(--status-info-border); color: var(--status-info-fg); }
.rh-card__ic { flex: none; width: 1.25rem; height: 1.25rem; margin-top: 2px; }
.rh-card__ic svg { width: 100%; height: 100%; }
.rh-card__t { margin: 0; font-size: var(--text-lg); line-height: var(--leading-lg); font-weight: var(--weight-medium); }
.rh-card__p { margin: var(--space-2) 0 0; font-size: var(--text-sm); line-height: var(--leading-lg); color: var(--text-secondary); }
.rh-card--info .rh-card__p { color: inherit; }
.rh-lista { display: grid; gap: var(--space-3); }
@media (max-width: 30rem) { .rh-card { padding: var(--space-5); } }

/* --- Escada de cinco referências (o gráfico da devolutiva) -----------------
   Inspirada na escada do deck do curso: cinco degraus subindo da esquerda para
   a direita, cada um com o nome acima do bloco. Três coisas do deck NÃO vieram,
   porque o design system da casa as proíbe em gráfico: o 3D isométrico, o
   degradê e a sombra. No lugar do degradê, a rampa SEQUENCIAL sancionada
   (família moss, do claro ao escuro) — cinco preenchimentos chapados.
   O degrau atual não entra na rampa: recebe o preto oficial, a faixa quente
   atrás da coluna e a etiqueta "Degrau atual". Continua UM único destaque, e
   nunca só por cor (etiqueta + posição + \`aria-current\`). A referência de
   atuação segue fora daqui, em prosa, no bloco seguinte. */
.rh-escada-fig {
  margin: 0;
  /* Rampa sequencial do gráfico. São escalas cruas de propósito: é a única
     exceção prevista pelo design system (série de gráfico), não tem token
     semântico equivalente e está confinada a este componente. */
  --rh-passo-1: var(--moss-200); --rh-passo-2: var(--moss-300); --rh-passo-3: var(--moss-400);
  --rh-passo-4: var(--moss-500); --rh-passo-5: var(--moss-600);
  --rh-passo-atual: var(--boomit-preto);
}
/* No escuro a rampa sobe em vez de descer: o canvas é o preto oficial, e um
   moss-800 sobre ele seria um degrau invisível. Começa no moss-700 e clareia. */
[data-theme="dark"] .rh-escada-fig {
  --rh-passo-1: var(--moss-700); --rh-passo-2: var(--moss-600); --rh-passo-3: var(--moss-500);
  --rh-passo-4: var(--moss-400); --rh-passo-5: var(--moss-300);
  --rh-passo-atual: var(--boomit-apoio-03);
}
.rh-escada { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--space-2); align-items: end; border-bottom: 1px solid var(--border-default); }
.rh-escada__degrau { display: flex; flex-direction: column; justify-content: flex-end; gap: var(--space-3); min-width: 0; padding: var(--space-4) var(--space-2) 0; }
.rh-escada__rot { display: block; min-width: 0; }
.rh-escada__num { display: block; font-size: var(--text-xs); letter-spacing: var(--tracking-display); text-transform: uppercase; color: var(--text-tertiary); font-weight: var(--weight-medium); font-variant-numeric: tabular-nums; }
.rh-escada__nome { display: block; margin-top: var(--space-1); font-size: var(--text-sm); line-height: var(--leading-sm); color: var(--text-secondary); overflow-wrap: anywhere; text-wrap: balance; }
/* Etiqueta contornada, não chapada: sobre o degrau atual o bloco já é preto, e
   uma pílula preta encostada nele vira uma mancha só. Também não quebra em
   duas linhas — "Degrau atual" numa linha é o que identifica a coluna. */
.rh-escada__tag { display: inline-block; margin-top: var(--space-2); padding: 2px var(--space-2); border: 1px solid var(--border-strong); border-radius: var(--radius-full); color: var(--text-primary); font-size: var(--text-xs); line-height: var(--leading-xs); letter-spacing: 0.03em; text-transform: uppercase; font-weight: var(--weight-medium); white-space: nowrap; }
.rh-escada__face { display: block; border-radius: var(--radius-sm) var(--radius-sm) 0 0; background: var(--rh-passo-1); print-color-adjust: exact; -webkit-print-color-adjust: exact; }
.rh-escada__degrau:nth-child(1) .rh-escada__face { height: 2.5rem;  background: var(--rh-passo-1); }
.rh-escada__degrau:nth-child(2) .rh-escada__face { height: 3.75rem; background: var(--rh-passo-2); }
.rh-escada__degrau:nth-child(3) .rh-escada__face { height: 5rem;    background: var(--rh-passo-3); }
.rh-escada__degrau:nth-child(4) .rh-escada__face { height: 6.25rem; background: var(--rh-passo-4); }
.rh-escada__degrau:nth-child(5) .rh-escada__face { height: 7.5rem;  background: var(--rh-passo-5); }
.rh-escada__degrau.is-atual { background: var(--bg-surface-warm); border-radius: var(--radius-md) var(--radius-md) 0 0; }
.rh-escada__degrau.is-atual .rh-escada__num { color: var(--text-secondary); }
.rh-escada__degrau.is-atual .rh-escada__nome { color: var(--text-primary); font-weight: var(--weight-medium); }
.rh-escada__degrau.is-atual:nth-child(n) .rh-escada__face { background: var(--rh-passo-atual); }
.rh-escada__cap { margin-top: var(--space-4); display: grid; gap: var(--space-2); }
.rh-escada__nota { margin: 0; font-size: var(--text-xs); line-height: var(--leading-sm); color: var(--text-tertiary); }

/* Abaixo de 40rem cinco colunas não cabem sem picotar os nomes: a escada gira,
   e a altura do degrau vira a largura da barra. A leitura de ascensão fica. */
@media (max-width: 40rem) {
  .rh-escada { grid-template-columns: 1fr; align-items: stretch; gap: 0; border-bottom: 0; }
  .rh-escada__degrau { flex-direction: column; align-items: stretch; gap: var(--space-2); padding: var(--space-3) var(--space-3) var(--space-4); border-bottom: 1px solid var(--border-subtle); }
  .rh-escada__degrau:last-child { border-bottom: 0; }
  .rh-escada__degrau:nth-child(n) .rh-escada__face { height: 0.5rem; border-radius: var(--radius-full); }
  .rh-escada__degrau:nth-child(1) .rh-escada__face { width: 20%; }
  .rh-escada__degrau:nth-child(2) .rh-escada__face { width: 40%; }
  .rh-escada__degrau:nth-child(3) .rh-escada__face { width: 60%; }
  .rh-escada__degrau:nth-child(4) .rh-escada__face { width: 80%; }
  .rh-escada__degrau:nth-child(5) .rh-escada__face { width: 100%; }
  .rh-escada__degrau.is-atual { border-radius: var(--radius-md); }
  .rh-escada__nome { font-size: var(--text-base); }
}

/* --- O degrau atual, por extenso ------------------------------------------ */
.rh-degrau { margin-top: var(--space-10); padding-top: var(--space-8); border-top: 1px solid var(--border-subtle); }
.rh-degrau__k { margin: 0; font-size: var(--text-xs); letter-spacing: var(--tracking-display); text-transform: uppercase; color: var(--text-tertiary); font-weight: var(--weight-medium); }
.rh-degrau__nome { margin: var(--space-2) 0 0; font-size: var(--text-3xl); line-height: var(--leading-3xl); font-weight: var(--weight-semibold); text-wrap: balance; }
.rh-degrau__headline { margin: var(--space-3) 0 var(--space-5); font-size: var(--text-lg); line-height: var(--leading-lg); font-weight: var(--weight-medium); color: var(--text-primary); text-wrap: balance; }

/* --- Assinatura como citação ----------------------------------------------
   É a frase mais densa do documento; ganha escala de citação em vez de virar
   mais um cartão igual aos outros. Filete à esquerda, sem aspas decorativas. */
.rh-cite { margin: 0; border-left: 2px solid var(--border-strong); padding: var(--space-2) 0 var(--space-2) var(--space-6); }
.rh-cite__t { margin: 0; font-size: var(--text-xl); line-height: var(--leading-xl); font-weight: var(--weight-medium); text-wrap: balance; }
.rh-cite__p { margin: var(--space-3) 0 0; font-size: var(--text-base); line-height: var(--leading-lg); color: var(--text-secondary); }

/* --- Números (decisão de 14/09) -------------------------------------------
   A devolutiva passou a quantificar. Barra CHAPADA: o design system permite
   barra em gráfico e proíbe degradê, 3D e sombra — as três coisas que o deck
   antigo usava. Sem radar, que além de proibido esconde ordem, e ordem é o que
   a pessoa procura ao ver seis dimensões.

   Hierarquia sem cor, como manda a casa: o índice é grande, os eixos levam a
   barra mais escura por serem a composição, e as dimensões ficam um tom
   abaixo. Nada aqui é verde "porque é bom" nem vermelho "porque é ruim" — a
   escala não julga, descreve. */
.rh-indice { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-5) var(--space-8); padding-bottom: var(--space-6); border-bottom: 1px solid var(--border-subtle); }
.rh-indice__n { margin: 0; display: flex; align-items: baseline; gap: var(--space-2); }
.rh-indice__v { font-size: var(--text-4xl); line-height: 1; font-weight: var(--weight-semibold); font-variant-numeric: tabular-nums; }
.rh-indice__d { font-size: var(--text-sm); color: var(--text-tertiary); }
.rh-indice__t { flex: 1 1 18rem; min-width: 0; }
.rh-indice__degrau { margin: 0; font-size: var(--text-xl); line-height: var(--leading-xl); font-weight: var(--weight-medium); }
.rh-indice__faixa { margin: var(--space-2) 0 0; font-size: var(--text-sm); line-height: var(--leading-sm); color: var(--text-secondary); }

.rh-metricas__t { margin: var(--space-8) 0 var(--space-3); font-size: var(--text-sm); letter-spacing: 0.03em; text-transform: uppercase; color: var(--text-tertiary); font-weight: var(--weight-medium); }
.rh-metricas { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-3); }
.rh-metrica { display: grid; grid-template-columns: minmax(0, 15rem) 1fr auto; align-items: center; gap: var(--space-3) var(--space-4); }
.rh-metrica__n { font-size: var(--text-sm); line-height: var(--leading-sm); color: var(--text-primary); min-width: 0; }
.rh-metrica__x { display: block; font-size: var(--text-xs); color: var(--text-tertiary); }
.rh-metrica__v { font-size: var(--text-base); font-weight: var(--weight-medium); font-variant-numeric: tabular-nums; min-width: 2.25rem; text-align: right; }
.rh-barra { display: block; height: 0.5rem; border-radius: var(--radius-full); background: var(--bg-muted); overflow: hidden; }
.rh-barra__fill { display: block; height: 100%; border-radius: var(--radius-full); background: var(--moss-400);
  print-color-adjust: exact; -webkit-print-color-adjust: exact; }
.rh-barra__fill.is-forte { background: var(--moss-600); }
[data-theme="dark"] .rh-barra__fill { background: var(--moss-500); }
[data-theme="dark"] .rh-barra__fill.is-forte { background: var(--moss-300); }
@media (max-width: 40rem) {
  .rh-metrica { grid-template-columns: 1fr auto; }
  .rh-metrica__n { grid-column: 1 / -1; }
  .rh-indice__v { font-size: var(--text-3xl); }
}

/* --- Sustentadores / limitadores ------------------------------------------ */
.rh-cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); }
@media (max-width: 40rem) { .rh-cols { grid-template-columns: 1fr; } }
.rh-col { display: grid; gap: var(--space-3); align-content: start; }
.rh-col__t { margin: 0 0 var(--space-1); font-size: var(--text-sm); letter-spacing: 0.03em; text-transform: uppercase; color: var(--text-tertiary); font-weight: var(--weight-medium); }
.rh-evc { border: 1px solid var(--border-subtle); border-left: 3px solid var(--border-default); border-radius: var(--radius-md); background: var(--bg-surface); padding: var(--space-4) var(--space-5); }
.rh-evc--lim { border-left-color: var(--border-strong); }
.rh-evc__n { font-size: var(--text-base); font-weight: var(--weight-medium); }
.rh-evc__p { margin: var(--space-1) 0 0; font-size: var(--text-sm); line-height: var(--leading-sm); color: var(--text-secondary); }
.rh-evc__a { margin: var(--space-2) 0 0; font-size: var(--text-sm); line-height: var(--leading-sm); color: var(--text-secondary); }

/* --- Gate de governança --------------------------------------------------- */
.rh-gate { display: flex; gap: var(--space-4); align-items: flex-start; border: 1px solid var(--border-default); border-radius: var(--radius-lg); background: var(--bg-surface); padding: var(--space-5) var(--space-6); }
.rh-gate__ic { flex: none; width: 1.5rem; height: 1.5rem; margin-top: 2px; }
.rh-gate__ic svg { width: 100%; height: 100%; }
.rh-gate__body { min-width: 0; }
.rh-gate__k { margin: 0; font-size: var(--text-xs); letter-spacing: var(--tracking-display); text-transform: uppercase; font-weight: var(--weight-medium); opacity: 0.85; }
.rh-gate__v { margin: var(--space-1) 0 0; font-size: var(--text-xl); line-height: var(--leading-xl); font-weight: var(--weight-semibold); }
.rh-gate__t { margin: var(--space-2) 0 0; font-size: var(--text-sm); line-height: var(--leading-lg); }
.rh-gate__r { margin: var(--space-3) 0 0; padding-top: var(--space-3); border-top: 1px solid currentColor; font-size: var(--text-sm); line-height: var(--leading-sm); }
.rh-gate__rk { font-weight: var(--weight-medium); }
.rh-gate--danger { background: var(--status-danger-bg); color: var(--status-danger-fg); border-color: var(--status-danger-border); }
.rh-gate--warning { background: var(--status-warning-bg); color: var(--status-warning-fg); border-color: var(--status-warning-border); }
.rh-gate--success { background: var(--status-success-bg); color: var(--status-success-fg); border-color: var(--status-success-border); }
.rh-gate--neutral { background: var(--status-neutral-bg); color: var(--status-neutral-fg); border-color: var(--status-neutral-border); }
.rh-gate--prioridade { border-width: 2px; padding: var(--space-6) var(--space-6); }
.rh-gate--prioridade .rh-gate__v { font-size: var(--text-2xl); line-height: var(--leading-2xl); }
.rh-gate--prioridade .rh-gate__ic { width: 2rem; height: 2rem; }
@media (max-width: 30rem) { .rh-gate { padding: var(--space-4) var(--space-5); } }

/* --- Rota NIST como ciclo ------------------------------------------------- */
.rh-ciclo { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-3); }
.rh-ciclo__f { display: flex; gap: var(--space-3); align-items: flex-start; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--bg-surface); padding: var(--space-4) var(--space-5); }
.rh-ciclo__ic { flex: none; width: 1.25rem; height: 1.25rem; margin-top: 2px; color: var(--text-brand); }
.rh-ciclo__ic svg { width: 100%; height: 100%; }
.rh-ciclo__n { font-size: var(--text-base); font-weight: var(--weight-medium); }
.rh-ciclo__t { margin: var(--space-1) 0 0; font-size: var(--text-sm); line-height: var(--leading-sm); color: var(--text-secondary); }

/* --- Plano 30–60–90 (tabela; vira cartão em tela estreita) ---------------- */
.rh-tabela-wrap { overflow-x: auto; }
.rh-tabela { width: 100%; border-collapse: collapse; font-size: var(--text-sm); line-height: var(--leading-sm); }
.rh-tabela th, .rh-tabela td { text-align: left; vertical-align: top; padding: var(--space-3) var(--space-3); border-bottom: 1px solid var(--border-subtle); }
.rh-tabela thead th { font-weight: var(--weight-medium); color: var(--text-secondary); border-bottom-color: var(--border-default); }
.rh-tabela tbody th { font-weight: var(--weight-medium); white-space: nowrap; font-variant-numeric: tabular-nums; }
.rh-tabela td { color: var(--text-secondary); }
@media (max-width: 40rem) {
  .rh-tabela thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .rh-tabela, .rh-tabela tbody, .rh-tabela tr, .rh-tabela th, .rh-tabela td { display: block; }
  .rh-tabela tr { border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--bg-surface); padding: var(--space-3) var(--space-4); margin-bottom: var(--space-3); }
  .rh-tabela th, .rh-tabela td { border: 0; padding: var(--space-1) 0; white-space: normal; }
  .rh-tabela td::before { content: attr(data-col); display: block; font-size: var(--text-xs); letter-spacing: 0.03em; text-transform: uppercase; color: var(--text-tertiary); font-weight: var(--weight-medium); margin-top: var(--space-2); }
}

/* --- Indicadores / perguntas / disclaimer --------------------------------- */
.rh-bullets, .rh-perguntas { margin: 0; padding-left: var(--space-5); display: grid; gap: var(--space-2); }
.rh-bullets li, .rh-perguntas li { font-size: var(--text-base); line-height: var(--leading-lg); color: var(--text-secondary); }
.rh-perguntas li::marker { font-weight: var(--weight-medium); color: var(--text-primary); }
.rh-disclaimer { margin-top: var(--space-4); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--bg-surface-warm); padding: var(--space-4) var(--space-5); font-size: var(--text-sm); line-height: var(--leading-lg); color: var(--text-secondary); }

/* --- Fecho da oferta -------------------------------------------------------
   O documento fecha dizendo o que ele é (o primeiro dos quatro blocos do
   workshop) e o que vem depois. Superfície quente, como a capa: abre e fecha
   pelo mesmo tom, e o miolo — que é o diagnóstico — fica visualmente entre os
   dois. Sem botão e sem cor de ação: é informação, não anúncio. */
.rh-oferta { margin-top: var(--space-16); background: var(--bg-surface-warm); border-radius: var(--radius-xl); padding: var(--space-10); }
.rh-oferta__k { margin: 0; font-size: var(--text-xs); letter-spacing: var(--tracking-display); text-transform: uppercase; color: var(--text-tertiary); font-weight: var(--weight-medium); }
.rh-oferta__t { margin: var(--space-3) 0 0; font-size: var(--text-xl); line-height: var(--leading-xl); font-weight: var(--weight-semibold); text-wrap: balance; }
.rh-oferta__p { margin: var(--space-4) 0 0; max-width: 34rem; font-size: var(--text-base); line-height: var(--leading-lg); color: var(--text-secondary); }
.rh-oferta__f { margin: var(--space-6) 0 0; padding-top: var(--space-5); border-top: 1px solid var(--border-subtle); font-size: var(--text-sm); line-height: var(--leading-sm); color: var(--text-primary); font-weight: var(--weight-medium); }
@media (max-width: 40rem) { .rh-oferta { padding: var(--space-8) var(--space-5); border-radius: var(--radius-lg); } }
.rh-mapa__arco { margin: 0 0 var(--space-5); font-size: var(--text-sm); line-height: var(--leading-sm); color: var(--text-secondary); }

/* --- Colofão + CTAs -------------------------------------------------------- */
.rh-colofao { margin: var(--space-16) 0 0; padding-top: var(--space-5); border-top: 1px solid var(--border-subtle); font-size: var(--text-xs); line-height: var(--leading-sm); letter-spacing: 0.02em; color: var(--text-tertiary); font-variant-numeric: tabular-nums; }

.rh-ctas { display: flex; flex-wrap: wrap; gap: var(--space-3); justify-content: center; margin-top: var(--space-12); }
.rh-sec--lead { margin-top: var(--space-12); }

/* --- Cabeçalho de impressão (só no papel) --------------------------------- */
.rh-print-head { display: none; }

/* --- Movimento ------------------------------------------------------------- */
@keyframes rh-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.rh-ctx-card, .rh-result { animation: rh-fade var(--duration-base) var(--ease-out); }
@media (prefers-reduced-motion: reduce) {
  .rh-ctx-card, .rh-result { animation: none; }
}

/* =========================================================================
   IMPRESSÃO — o app troca para o tema claro em beforeprint; aqui só limpamos.
   ========================================================================= */
@media print {
  html, body { background: var(--bg-surface); color: var(--boomit-preto); }
  .sc-shell, .rh-shell { max-width: none; padding: 0; }
  .sc-head, .sc-theme, .rh-ctas, .sc-btn, .sc-note, .rh-sec--lead, .sc-nav, .sc-footbar { display: none !important; }
  /* A medida de leitura vale no papel também (Modo 3 — relatório): sem limite,
     a linha em A4 passa de ~65 para ~110 caracteres. \`ch\` depende da fonte do
     papel, então aqui a medida é em \`em\`, que o navegador resolve na impressão. */
  .rh-result { max-width: 40em; margin: 0 auto; animation: none; }
  .rh-print-head { display: block; font-size: var(--text-xs); color: var(--boomit-preto); border-bottom: 1px solid var(--boomit-apoio-02); padding-bottom: var(--space-2); margin-bottom: var(--space-4); }
  .rh-sec, .rh-card, .rh-evc, .rh-gate, .rh-ciclo__f, .rh-escada-fig, .rh-tabela tr, .rh-disclaimer, .rh-lente, .rh-cite, .rh-mapa, .rh-oferta, .rh-sintese, .rh-indice { break-inside: avoid; page-break-inside: avoid; }
  .rh-sec { margin-top: var(--space-10); }
  .rh-card, .rh-evc, .rh-gate, .rh-ciclo__f, .rh-disclaimer, .rh-lente { box-shadow: none; }
  /* A capa é a primeira página: o miolo começa numa folha nova. */
  .rh-capa { background: var(--bg-surface); border: 1px solid var(--boomit-apoio-02); border-radius: 0; padding: var(--space-8) 0; }
  .rh-capa { border-left: 0; border-right: 0; border-top: 0; }
  .rh-mapa { break-after: page; page-break-after: always; }
  /* O gráfico da escada só vale impresso se os preenchimentos forem impressos;
     se o navegador ainda assim descartar o fundo, o degrau atual continua
     identificado pela etiqueta e pelo contorno. */
  .rh-escada__face { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .rh-escada__degrau.is-atual { outline: 1px solid var(--boomit-preto); }
  .rh-escada__tag { border: 1px solid var(--boomit-preto); }
  .rh-tabela-wrap { overflow: visible; }
  a[href]::after { content: ""; }
}

/* --- Foco programático do título ao trocar de tela -------------------------
   \`pintar()\` leva o foco ao <h1> quando a tela muda, para que o leitor de tela
   anuncie a tela nova (o <main> não é live region, de propósito). O título não
   é um controle operável por teclado, então não leva anel de foco: o indicador
   visível continua obrigatório em tudo que se clica ou tabula. */
.rh-shell h1[tabindex="-1"]:focus { outline: none; }`;
