# MCP Radar Imprensa Amapá

Serviço isolado para o agente Cursor acessar **todos os dados de imprensa do Amapá**.

## URL (produção)

```
https://radar-imprensa-mcp-amapa.kxryyk.easypanel.host/mcp
```

## Conectar no Cursor

Em `~/.cursor/mcp.json` ou `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "radar-amapa": {
      "url": "https://radar-imprensa-mcp-amapa.kxryyk.easypanel.host/mcp"
    }
  }
}
```

Reinicie o Cursor depois de salvar.

## Tools

| Tool | Uso |
|------|-----|
| `radar_amapa` | Meta + catálogo + config |
| `radar_amapa_buscar` | Busca (cidade, tipo, contato, q…) |
| `radar_amapa_cidades` | 16 municípios (+ veículos opcional) |
| `radar_amapa_top` | Top por categoria ou todos |
| `radar_amapa_veiculo` | Ficha por id (`ap-021`) |
| `radar_amapa_facetas` | Contagens / cobertura de contato |

Fonte HTTP: `RADAR_API_BASE` (default = frontend Amapá). Só leitura; UF sempre `AP`.

## Local

```bash
cd mcp-amapa
npm install
RADAR_API_BASE=https://radar-imprensa-amapa.kxryyk.easypanel.host npm start
```
