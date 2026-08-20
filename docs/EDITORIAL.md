# Ranking editorial humano × score automático

Fonte: `Imprensa/ranking_imprensa_nordeste_2026.xlsx` (levantamento desk research, 20/08/2026).  
Enriquecido: `Imprensa/ranking_imprensa_nordeste_2026_enriquecido.xlsx` (aba `Score_Quantitativo`).

## O que o levantamento traz de bom

| Ponto | Por que importa | Como incorporamos |
|-------|-----------------|-------------------|
| Top 20 **misto** por estado (não-TV) | Reflete prioridade editorial real de assessoria, não silos por tipo | Modo **Editorial** no painel + `GET /api/top20/editorial` |
| TV fora do quantitativo de 20 | Evita poluir o Top 20 com centenas de TVs municipais | Mantemos TV no modo **Por categoria** |
| Critérios compostos (audiência, alcance estadual, tradição/marca, capacidade de pautar) | Completa o que só seguidores IG não capturam | Peso editorial no `computeScore` |
| Faixas A / A/B / B / B/C + confiança | Transparência do julgamento | Campos `editorial_band`, `editorial_confidence` |
| Justificativa + fontes desk | Auditabilidade | Persistidos e exibidos no detalhe |
| Score quantitativo (0–100) com componentes | Quando há métrica pública, reordena com evidência | Modo **Quantitativo** + `GET /api/top20/quantitative` |
| Seguidores / alcance / qualidade da evidência | Preenche lacunas e calibra o score | `data/desk-score-v1.json` + colunas `desk_*` |

## Diferença vs nosso ajuste anterior

- **Antes:** Top 20 por `UF × tipo`, score provisional/Apify.
- **Agora:** modos **Quantitativo**, **Editorial** e **Por categoria**.

## Pipeline

```bash
npm run import:editorial   # gera data/editorial-ranking-v1.json
npm run import:desk        # gera data/desk-score-v1.json a partir do Excel enriquecido
# no boot da API: applyEditorialRanking() + applyDeskScore()
```

Match editorial: 180/180. Match desk score: 180/180.
