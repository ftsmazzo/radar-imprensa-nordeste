# Ranking editorial humano × score automático

Fonte: `Imprensa/ranking_imprensa_nordeste_2026.xlsx` (levantamento desk research, 20/08/2026).

## O que o levantamento traz de bom

| Ponto | Por que importa | Como incorporamos |
|-------|-----------------|-------------------|
| Top 20 **misto** por estado (não-TV) | Reflete prioridade editorial real de assessoria, não silos por tipo | Modo **Editorial** no painel + `GET /api/top20/editorial` |
| TV fora do quantitativo de 20 | Evita poluir o Top 20 com centenas de TVs municipais | Mantemos TV no modo **Por categoria** |
| Critérios compostos (audiência, alcance estadual, tradição/marca, capacidade de pautar) | Completa o que só seguidores IG não capturam | Peso editorial no `computeScore` |
| Faixas A / A/B / B / B/C + confiança | Transparência do julgamento | Campos `editorial_band`, `editorial_confidence` |
| Justificativa + fontes desk | Auditabilidade | Persistidos e exibidos no detalhe |
| Blogs/colunistas influentes | Já entram no Top 20 quando pautam o debate | Mantidos no ranking misto |

## Diferença vs nosso ajuste anterior

- **Antes:** Top 20 por `UF × tipo`, score provisional/Apify.
- **Agora:** mesmos modos por categoria **e** ranking editorial humano como fonte de verdade operacional para disparo estadual.

## Pipeline

```bash
npm run import:editorial   # gera data/editorial-ranking-v1.json
# no boot da API: applyEditorialRanking() grava no Postgres e recalcula score
```

Match: 180/180 veículos cruzados com `vehicles-v1.json` (0 unmatched).
