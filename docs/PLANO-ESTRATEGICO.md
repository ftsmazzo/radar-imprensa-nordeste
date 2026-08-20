# Plano Estratégico — Radar de Imprensa Nordeste v2

**Produto base:** [Radar de Imprensa Nordeste (v1)](https://radarimprensanordeste.manus.space/)  
**Objetivo:** evoluir o inventário existente para um ranking operacional Top 20 + automação de disparo.  
**Dono técnico:** Fabria IA  
**Data:** 2026-08-20

---

## 1. Visão

Transformar o levantamento completo de veículos do Nordeste em uma **ferramenta de assessoria**:

1. Saber **quais são os 20 principais** por estado e categoria  
2. Ter **contatos acionáveis** (e-mail / WhatsApp)  
3. **Disparar materiais** com controle, rastreio e conformidade  

Não recomeçamos do zero: a v1 já é o inventário. A v2 é ranking + operação.

---

## 2. Problema do cliente

- Precisam segmentar veículos do Nordeste **por estado**  
- Elencar os **20 principais** por critérios: TV, rádio (audiência), jornal (tiragem), colunistas (mais lidos), portais e blogs (seguidores)  
- Em seguida, **automatizar envio** de materiais (e-mail / WhatsApp)

---

## 3. Princípios

| Princípio | Decisão |
|-----------|---------|
| Reuso | Partir da base v1 (~3.6k veículos) |
| Transparência | Cada score tem fonte + nível de confiança |
| Operação > catálogo | Ranking só vale se gerar lista disparável |
| Humano no loop | Aprovação antes de todo disparo em massa |
| LGPD | Opt-out, finalidade clara, sem comprar lista ilegal |

---

## 4. Arquitetura alvo

```
[Base v1] → [Apify enrichment] → [Score engine] → [Top 20 / painel]
                                                      ↓
                                            [n8n disparo]
                                         e-mail / WhatsApp API
```

### Componentes

| Camada | Ferramenta | Papel |
|--------|------------|-------|
| Inventário | `data/vehicles-v1.json` | Snapshot da v1 |
| Enriquecimento | Apify actors | Seguidores, contatos, proxies de audiência |
| Ranking | Score engine (neste repo) | Top 20 por UF × tipo |
| Interface | App web (Vite/React) | Consulta, filtros, export |
| Disparo | n8n | Filas, templates, logs |
| Canais | E-mail + WhatsApp Business API | Entrega |

---

## 5. Fases

### Fase 0 — Fundação (agora)
- Repo e plano estratégico  
- Extração da base v1  
- App v2 com filtros + ranking provisional  
- Modelo de score documentado  

### Fase 1 — Ranking confiável
- Definir pesos com o cliente  
- Apify: Instagram/followers, sites, contatos faltantes  
- Fontes setoriais (Atlas, Kantar/Ibope proxies, IVC quando houver)  
- Colunistas (nova categoria)  
- Entrega: Top 20 por estado × categoria + relatório de lacunas  

### Fase 2 — Automação de disparo
- MVP e-mail (segmento → preview → aprovação → envio → log)  
- WhatsApp Business API  
- Templates por tipo de veículo  
- Export CSV / integração n8n  

### Fase 3 — Recorrência (opcional)
- Atualização mensal do ranking  
- Monitoramento de contatos quebrados  
- Clipping / retorno de pauta (fora do escopo inicial)

---

## 6. Modelo de score (v0 — provisional)

Enquanto métricas oficiais não estão 100% disponíveis, usamos score composto auditável:

| Sinal | Peso sugerido | Observação |
|-------|---------------|------------|
| Completude do cadastro | 15% | Já existe na v1 |
| Tem e-mail / WhatsApp | 15% | Acionabilidade |
| Instagram (seguidores) | 25% | Portais/blogs/colunistas |
| Website ativo | 10% | Proxy de operação |
| Tipo prioritário (TV/jornal capital) | 15% | Regra editorial |
| Fonte Atlas / reputação | 20% | Confiança da origem |

**Regra Top 20:** por `UF` + `type`, ordenar por `score` desc, empate por completude e nome.

> Scores v0 são **provisórios** e devem ser recalibrados após o enriquecimento Apify e validação do cliente.

---

## 7. Escopo por estado e categoria

**UFs:** AL, BA, CE, MA, PB, PE, PI, RN, SE  

**Categorias:**
- TV (todas + ordenação por relevância)  
- Rádio (audiência / proxy)  
- Jornal (tiragem / proxy)  
- Portal (seguidores)  
- Blog (seguidores)  
- Colunista (fase 1 — ainda não existe na v1)

---

## 8. Entregáveis

1. Painel Radar v2 (este projeto)  
2. Base enriquecida + ranking exportável (JSON/CSV)  
3. Metodologia documentada  
4. Workflow n8n de disparo (fase 2)  
5. Manual operacional para o time do cliente  

---

## 9. Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| Métrica oficial indisponível | Proxy transparente + flag de confiança |
| Contato desatualizado | Enrichment + bounce handling |
| Bloqueio WhatsApp | API oficial + templates aprovados |
| Site Manus fora do ar | Snapshot local `vehicles-v1.json` |
| Expectativa de “Top 20 absoluto” | Alinhar: Top 20 **com evidência disponível** |

---

## 10. Próximas ações imediatas

1. [x] Criar diretório do projeto  
2. [x] Extrair base v1  
3. [ ] App v2 com Top 20 provisional  
4. [ ] Script de score v0  
5. [ ] Spec Apify (actors + campos)  
6. [ ] Proposta comercial alinhada a este plano  

---

## 11. Critério de sucesso

- Cliente consulta Top 20 por estado/categoria em &lt; 10s  
- ≥ 70% dos Top 20 com pelo menos um canal de contato  
- Disparo piloto (e-mail) para 1 estado com aprovação e log  
- Metodologia aceita formalmente pelo cliente
