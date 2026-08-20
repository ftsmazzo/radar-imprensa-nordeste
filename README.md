# Radar Imprensa Nordeste v2

Evolução do [Radar v1](https://radarimprensanordeste.manus.space/) com ranking Top 20 por estado/categoria e caminho para automação de disparo (Apify + n8n).

## Estrutura

```
radar-imprensa-nordeste-v2/
  docs/PLANO-ESTRATEGICO.md   # plano estratégico
  docs/SPEC-APIFY.md          # especificação de enrichment
  data/                       # base extraída + ranking
  scripts/                    # extract + score
  web/                        # app Vite + React (painel Top 20)
```

## Como rodar o painel

```bash
cd web
npm install
npm run dev
```

## Regenerar dados a partir da v1

1. Baixe o bundle JS do site v1 para `%TEMP%\radar.js` (ou rode o fluxo de extract após download).
2. `node scripts/extract-v1.mjs`
3. `node scripts/score-v0.mjs`
4. Copie `data/top20-v0.json` e meta para `web/public/data/`

## Status atual

- [x] Snapshot da base v1 (3.664 veículos)
- [x] Score provisional v0 + Top 20 por UF × tipo
- [x] Painel web com filtro, busca e export CSV
- [ ] Enrichment Apify (métricas reais)
- [ ] Automação n8n (e-mail / WhatsApp)

## Aviso

O ranking atual é **provisional** (sem audiência/tiragem/seguidores reais). Serve para operação imediata e validação com o cliente até o enrichment.
