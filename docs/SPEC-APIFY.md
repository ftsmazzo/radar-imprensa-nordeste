# Spec Apify — Enrichment Radar Nordeste v2

## Ranking dinâmico
Quando o enrichment grava `instagram_followers` e recalcula `score`, a próxima leitura da API já reflete o ranking novo — sem rebuild do front.

## Modos
| Mode | O que faz |
|------|-----------|
| `instagram` | Apify perfil IG (seguidores, bio, engajamento) |
| `website` | Ping HTTP `website_alive` |
| `contacts` | E-mail/telefone: bio IG salva → scrape site (`/contato`) → Google Places (se key) → Apify contact actor (opcional) |
| `full` | website + instagram |

## Env
| Var | Uso |
|-----|-----|
| `APIFY_TOKEN` | Instagram (+ contact actor opcional) |
| `APIFY_IG_ACTOR` | default `apify/instagram-profile-scraper` |
| `APIFY_CONTACT_ACTOR` | opcional |
| `GOOGLE_PLACES_API_KEY` | opcional — telefone/site via Maps |
| `ENRICH_TOKEN` | Protege `POST /api/enrich/run` |
| `ENRICH_BATCH_SIZE` | default 25 |

## Endpoints
- `POST /api/enrich/run` `{ "uf", "type", "limit", "mode", "force" }`
- `GET /api/enrich/status?id=job_...`
- `GET /api/contacts/coverage` — % Top 20 com e-mail ou telefone (meta 70%)

## Regras
- Re-enriquece IG se `last_enriched_at` > 3 dias
- `contacts` prioriza veículos sem e-mail ou telefone, ordenados por score (Top 20 primeiro)
