# Spec Apify — Enrichment Radar Nordeste v2

## Resposta direta: atualização dinâmica?

**Sim.** O Top 20 é calculado ao vivo no Postgres (`ORDER BY score DESC`).  
Quando o enrichment grava `instagram_followers` e recalcula `score`, a próxima leitura da API já reflete o ranking novo — sem rebuild do front.

Fluxo:
```
Apify (IG followers / checks) → UPDATE vehicles → score recalculado → GET /api/top20
```

Agendamento sugerido: job semanal por UF (Easypanel script / n8n) chamando `POST /api/enrich/run`.

---

## Objetivo
Enriquecer veículos com métricas reais e recalibrar o Top 20 automaticamente.

## Env
| Var | Uso |
|-----|-----|
| `APIFY_TOKEN` | Token da conta Apify |
| `APIFY_IG_ACTOR` | default `apify/instagram-profile-scraper` |
| `ENRICH_TOKEN` | Protege `POST /api/enrich/run` (opcional) |
| `ENRICH_BATCH_SIZE` | default 25 |

## Endpoints
- `POST /api/enrich/run` `{ "uf": "PE", "limit": 20, "mode": "full|website|instagram" }`
- `GET /api/enrich/status?id=job_...`
- `GET /api/meta` → `withFollowers`, `dynamicRanking`, `apifyConfigured`

## Outputs por veículo
| Campo | Fonte |
|-------|--------|
| `instagram_followers` | Apify Instagram Profile Scraper |
| `website_alive` | HTTP check (sem custo Apify) |
| `score` / `confidence` | recalculados na hora |
| `last_enriched_at` | auditoria |

## Regras
- Não inventar métrica: null permanece null  
- Lotes por UF para controlar custo  
- Re-enriquece se `last_enriched_at` > 7 dias  
- Ranking sempre dinâmico na API
