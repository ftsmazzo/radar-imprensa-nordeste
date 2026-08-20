# Spec Apify — Enrichment Radar Nordeste v2

## Objetivo
Enriquecer `data/vehicles-v1.json` com métricas reais para recalibrar o Top 20.

## Inputs
- `id`, `name`, `uf`, `type`, `website`, `instagram`, `email`, `phone`

## Outputs desejados (por veículo)
| Campo | Fonte sugerida | Uso |
|-------|----------------|-----|
| `instagramFollowers` | Perfil IG / Apify IG scraper | Portais, blogs, colunistas |
| `facebookFollowers` | Página FB | Proxy adicional |
| `websiteAlive` | HTTP check | Confiança |
| `emailsFound` | Site crawl / contato | Disparo |
| `phonesFound` | Site crawl | WhatsApp lead |
| `whatsappCandidates` | wa.me / texto no site | Fase 2 |
| `audienceProxy` | Rankings setoriais / Atlas | Rádio/TV |
| `circulationProxy` | IVC / menções | Jornais |
| `lastEnrichedAt` | ISO date | Auditoria |

## Actors (rascunho)
1. **website-contact-crawler** — homepage + /contato  
2. **instagram-followers** — a partir de URL/handle  
3. **http-status-check** — websiteAlive  
4. **manual-seed-sheet** — overrides do cliente (CSV)

## Regras
- Não inventar métrica: null + `confidence=baixa`  
- Rate limit e cache por `id`  
- Rodar por lote (UF) para controlar custo  
- Merge em `vehicles-enriched.json` sem sobrescrever contato humano validado

## Próximo passo técnico
Criar actor mínimo de contato+followers para BA e PE como piloto.
