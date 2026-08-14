# Brand IBMEC · Pasta de aplicação white-label

Estrutura organizada a partir do **Toolkit de Marca IBMEC V1** (Brandbook oficial fornecido pela cliente).

## Estrutura

```
brand-ibmec/
├── README.md                              (este arquivo)
├── palette.json                           (spec completa — paleta, tipografia, regras)
├── css/
│   └── brand.css                          (CSS variables prontas para usar no protótipo)
├── logos/
│   ├── ibmec-primary-on-white.png         (versão preferencial — usar em headers, capa)
│   ├── ibmec-negative-on-navy.png         (versão negativa para fundos escuros)
│   ├── ibmec-on-yellow.png                (versão sobre fundo amarelo)
│   ├── ibmec-on-royal-blue.png            (versão sobre fundo royal blue)
│   └── ibmec-symbol-i.png                 (símbolo "i" isolado — favicon, avatar)
└── raw/                                   (arquivos extraídos do brandbook — descartável)
```

## Paleta oficial (3 cores)

| Nome | Hex | Pantone | Papel |
|------|-----|---------|-------|
| **Azul Marinho** | `#002555` | 655 C | Cor institucional dominante (fundos, headers, tipografia) |
| **Amarelo** | `#F5AC00` | 1235 C | Destaque, ponto do "i", chamadas |
| **Azul Royal** | `#1245FF` | 2387 C | Auxiliar, acentos, hover, blocos secundários |

## Tipografia

- **Principal:** Krub (Google Fonts — disponível gratuitamente)
- **Sistema (fallback):** Tahoma
- **Importante:** Krub é a fonte do produto, **não** do logotipo. O wordmark "ibmec" é desenho próprio — não reescrever em Krub.

## Personalidade & voz

- **Atributos:** Especialista · Inspiradora · Próxima · Curiosa
- **Propósito:** "Solucionadores do amanhã"
- **Arquétipo:** Mago
- **Tagline:** "A direção do amanhã"
- **Tons de voz:** "Pode confiar" · "Lado a Lado" · "Ouvir para Crescer"

## Regras de uso (resumo do brandbook)

1. Logo é construído com forte base estratégica — não distorcer, cortar ou alterar
2. Versão positiva preferencial (navy sobre branco) é a principal para a maioria das aplicações
3. Versão negativa (branco sobre navy) usada quando o fundo for escuro
4. Sobre fundos amarelo ou azul royal usar variantes específicas
5. Não variar tons das cores da paleta no logo nem nos grafismos
6. Não aplicar contorno, sombra ou textura sobre o logo
7. Não usar grafismos excessivamente leves ou pesados
8. Área de respiro mínima: 1× a altura do ponto do "i" em todas as bordas
9. **Krub é a tipografia da marca, mas não substitui o desenho do logotipo**

## White-label · 100% IBMEC

- **Marca única:** IBMEC. Nenhuma marca operadora visível em interface, relatório, footer ou email.
- **Email "from":** endereço IBMEC (a confirmar antes do deploy).

## Como aplicar no protótipo

Importar `css/brand.css` antes do estilo do app. Usar as variáveis `--ibmec-*` para todas as cores. Usar `logos/ibmec-primary-on-white.png` no header e na capa do relatório; `logos/ibmec-negative-on-navy.png` em fundos escuros.

---

*Pasta gerada a partir do upload do brandbook IBMEC para aplicação white-label.*
