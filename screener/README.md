# Screener Empresa + IA — módulo (corte 1)

Módulo reutilizável do `wsdegust` para o **Screener Pessoa, Empresa e Capacidade de IA**
(`SCREENER_EMPRESA_IA_V1`). Decisões de arquitetura e método no histórico de grilling
(01–02/09/2026) e no parecer/spec que originaram este código.

> **Corte 1 = só o núcleo provável.** Sem migration, sem edge, sem tabela, sem tela,
> sem vínculo com evento real. É o que se revisa antes de tocar no banco.

## O que já existe

```
screener/
├── instrumento/
│   └── SCREENER_EMPRESA_IA_V1.json   definição PRIVADA, versionada (verbatim do seed)
└── motor/
    ├── definicao.mjs                 carrega a definição, checksum e projeção pública
    ├── motor.mjs                     motor determinístico puro → ScoreResultV1
    ├── conteudo.test.mjs             catracas de conteúdo (30 itens, 5 opções, pontos…)
    ├── definicao.test.mjs            checksum + projeção sanitizada
    └── motor.test.mjs                pontuação, cobertura, gaps, governança, matriz, prioridades
```

Rodar os testes:

```bash
cd screener/motor && node --test
```

Sem dependências: `node --test` nativo (Node ≥ 22). Motor em `.mjs` com JSDoc — o
`wsdegust` não tem toolchain TypeScript.

## Duas representações do instrumento

1. **Definição privada** (`instrumento`): textos, estágios E1–E4, pontos, dimensões,
   pesos e regras. **Só a edge lê.** Nunca vai ao navegador.
2. **Projeção pública** (`projecaoPublica`): `id` opaco + enunciado + opções `{id,text}`.
   Sem pontos, sem E1–E4, sem resposta ideal, sem pesos, sem dimensão, sem regra. O
   `mapping` (id opaco → item/estágio) é **edge-only** — é como a edge traduz a resposta
   de volta para o estágio.

## Regras do motor (congeladas)

- Pessoa, Empresa e IA **nunca** somam numa nota geral.
- **N/A** fica fora do numerador e do denominador (nunca vira zero).
- Dimensão só pontua com seus **dois** itens válidos.
- Índice de bloco = média das dimensões válidas (**≥ 4**), peso igual.
- **Governança é condição separada** (`blocked/conditioned/eligible/insufficient`);
  não entra como penalidade no índice de IA.
- Matriz Empresa × IA com corte **provisório** 5000 bp; só existe com cobertura ≥ 80%
  nos dois blocos.
- Nenhuma saída de **risco %, CDL, arquétipo ou score combinado**.
- Pontos em basis points (0 / 3333 / 6667 / 10000 / null); arredonda só na exibição.
- Indivíduo **não tem nota geral** — só o perfil das cinco dimensões.

## Decisão em aberto (registrada)

**Embaralhamento das opções.** `projecaoPublica` suporta embaralhamento determinístico
por semente de sessão (`{ sessionSeed, shuffle:true }`), mas o **default é ordem fixa**
(E1→E4). A spec §5.5 e o parecer P0.7 pedem ordem fixa até o piloto analisar efeito de
ordem. A capacidade existe; a política (ligar ou não) é decisão da Miriam pós-piloto.

## Próximos cortes (ainda não feitos)

Migration `screener_*` (inativa) → edge roteadora (5 rotas) → `screener.html`
(30 itens, autosave, retomada) → devolutiva → captura de lead → vínculo do evento
técnico `preview-interno-ia-v1` em `internal_preview`. Nada disso toca o protótipo
legado (`ia.html`, evento `boomit-degustacao-ia`, coluna `ia_resultado`), que fica
**congelado** até a substituição estar em `public_pilot`.
