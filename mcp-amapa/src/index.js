/**
 * MCP HTTP do Radar Imprensa Amapá.
 * - GET  /mcp  → discovery (estilo catálogo Ary)
 * - POST /mcp  → JSON-RPC MCP (initialize | tools/list | tools/call)
 * Fonte: API Radar com uf=AP fixo.
 */
import express from "express";

const PORT = Number(process.env.PORT || 3100);
const RADAR_API_BASE = (
  process.env.RADAR_API_BASE || "https://radar-imprensa-amapa.kxryyk.easypanel.host"
).replace(/\/$/, "");
const PUBLIC_URL =
  process.env.PUBLIC_MCP_URL || `http://localhost:${PORT}/mcp`;

const TOOL_NAMES = [
  "radar_amapa",
  "radar_amapa_buscar",
  "radar_amapa_cidades",
  "radar_amapa_top",
  "radar_amapa_veiculo",
  "radar_amapa_facetas",
];

async function radarGet(pathAndQuery) {
  const url = `${RADAR_API_BASE}${pathAndQuery}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    return { ok: false, status: res.status, url, error: data.error || data };
  }
  return { ok: true, url, data };
}

function qs(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    p.set(k, String(v));
  }
  return p.toString();
}

function textResult(payload) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

function errorResult(msg) {
  return {
    isError: true,
    content: [{ type: "text", text: String(msg) }],
  };
}

const TOOL_DEFS = [
  {
    name: "radar_amapa",
    description:
      "Visão geral do Radar Imprensa Amapá: catálogo da API, meta (totais/contatos) e config da instância. Use no início para saber o que existe.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "radar_amapa_buscar",
    description:
      "Busca cruzada de veículos de imprensa do Amapá (sempre UF=AP). Filtros: q, type, city, hasPhone, hasEmail, hasContact, hasWhatsapp via hasPhone/hasContact, sort, limit, offset, fields.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Nome, cidade, site, e-mail ou telefone" },
        type: {
          type: "string",
          description: "Portal | Rádio | TV | Jornal | Blog (ou lista Portal,Rádio)",
        },
        city: { type: "string", description: "Município (ex.: Macapá, Santana)" },
        hasPhone: { type: "boolean" },
        hasEmail: { type: "boolean" },
        hasContact: { type: "boolean", description: "telefone OU e-mail" },
        hasWebsite: { type: "boolean" },
        hasInstagram: { type: "boolean" },
        sort: {
          type: "string",
          enum: ["score", "followers", "name", "city", "contacts"],
        },
        fields: { type: "string", enum: ["summary", "full"] },
        limit: { type: "number", minimum: 1, maximum: 100 },
        offset: { type: "number", minimum: 0 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "radar_amapa_cidades",
    description:
      "Lista os 16 municípios do Amapá com contagem de veículos e cobertura de contato. Se city for passado, também lista veículos daquela cidade.",
    inputSchema: {
      type: "object",
      properties: {
        city: { type: "string" },
        comVeiculos: {
          type: "boolean",
          description: "true = inclui até 5 principais por cidade (IBGE/população)",
        },
        limitPerCity: { type: "number", minimum: 1, maximum: 20 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "radar_amapa_top",
    description:
      "Ranking por categoria no Amapá (Top 20 por type) ou listagem completa (modo=todos).",
    inputSchema: {
      type: "object",
      properties: {
        modo: {
          type: "string",
          enum: ["categoria", "todos"],
          description: "categoria exige type; todos lista a base AP",
        },
        type: {
          type: "string",
          description: "Obrigatório se modo=categoria: Portal|Rádio|TV|Jornal|Blog",
        },
        limit: { type: "number", minimum: 1, maximum: 100 },
      },
      required: ["modo"],
      additionalProperties: false,
    },
  },
  {
    name: "radar_amapa_veiculo",
    description: "Ficha completa de um veículo pelo id (ex.: ap-001).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "ID do veículo, ex. ap-021" },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "radar_amapa_facetas",
    description:
      "Contagens agregadas do Amapá (por tipo, contatos, totais) com os mesmos filtros da busca.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string" },
        city: { type: "string" },
        hasPhone: { type: "boolean" },
        hasEmail: { type: "boolean" },
        hasContact: { type: "boolean" },
        q: { type: "string" },
      },
      additionalProperties: false,
    },
  },
];

async function callTool(name, args = {}) {
  switch (name) {
    case "radar_amapa": {
      const [catalog, meta, config] = await Promise.all([
        radarGet("/api/catalog"),
        radarGet("/api/meta?uf=AP"),
        radarGet("/api/config"),
      ]);
      return textResult({
        produto: "Radar Imprensa Amapá",
        api: RADAR_API_BASE,
        catalog: catalog.data,
        meta: meta.data,
        config: config.data,
        tools: TOOL_NAMES,
      });
    }
    case "radar_amapa_buscar": {
      const query = qs({
        uf: "AP",
        q: args.q,
        type: args.type,
        city: args.city,
        hasPhone: args.hasPhone,
        hasEmail: args.hasEmail,
        hasContact: args.hasContact,
        hasWebsite: args.hasWebsite,
        hasInstagram: args.hasInstagram,
        sort: args.sort || "score",
        fields: args.fields || "summary",
        limit: args.limit || 20,
        offset: args.offset || 0,
      });
      const r = await radarGet(`/api/search?${query}`);
      if (!r.ok) return errorResult(JSON.stringify(r));
      return textResult(r.data);
    }
    case "radar_amapa_cidades": {
      if (args.comVeiculos) {
        const r = await radarGet(
          `/api/cities/top10?uf=AP&limitPerCity=${Math.min(20, Number(args.limitPerCity) || 5)}`
        );
        if (!r.ok) return errorResult(JSON.stringify(r));
        return textResult(r.data);
      }
      const query = qs({ uf: "AP", city: args.city, q: args.city || undefined });
      const r = await radarGet(`/api/cities?${query}`);
      if (!r.ok) return errorResult(JSON.stringify(r));
      if (args.city) {
        const vehicles = await radarGet(
          `/api/search?${qs({ uf: "AP", city: args.city, limit: 50, fields: "summary" })}`
        );
        return textResult({ ...r.data, veiculos: vehicles.data });
      }
      return textResult(r.data);
    }
    case "radar_amapa_top": {
      if (args.modo === "todos") {
        const r = await radarGet(
          `/api/search?${qs({ uf: "AP", limit: args.limit || 100, fields: "summary" })}`
        );
        if (!r.ok) return errorResult(JSON.stringify(r));
        return textResult(r.data);
      }
      const type = args.type;
      if (!type) return errorResult("type é obrigatório quando modo=categoria");
      const r = await radarGet(`/api/top20?uf=AP&type=${encodeURIComponent(type)}`);
      if (!r.ok) return errorResult(JSON.stringify(r));
      return textResult(r.data);
    }
    case "radar_amapa_veiculo": {
      if (!args.id) return errorResult("id é obrigatório");
      const r = await radarGet(`/api/vehicle/${encodeURIComponent(args.id)}`);
      if (!r.ok) return errorResult(JSON.stringify(r));
      if (r.data?.uf && r.data.uf !== "AP") {
        return errorResult("Veículo fora do Amapá");
      }
      return textResult(r.data);
    }
    case "radar_amapa_facetas": {
      const query = qs({
        uf: "AP",
        type: args.type,
        city: args.city,
        hasPhone: args.hasPhone,
        hasEmail: args.hasEmail,
        hasContact: args.hasContact,
        q: args.q,
      });
      const r = await radarGet(`/api/facets?${query}`);
      if (!r.ok) return errorResult(JSON.stringify(r));
      return textResult(r.data);
    }
    default:
      return errorResult(`Tool desconhecida: ${name}`);
  }
}

function discovery() {
  return {
    ok: true,
    produto: "Radar Imprensa Amapá (MCP isolado)",
    mensagem: "Cole esta URL no conector MCP do Cursor (type: streamableHttp ou url).",
    url: PUBLIC_URL,
    servico: "mcp-amapa",
    api: RADAR_API_BASE,
    uf: "AP",
    tools: TOOL_NAMES,
  };
}

function jsonRpcResult(id, result) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function jsonRpcError(id, code, message) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

async function handleRpc(body) {
  const { id, method, params } = body || {};
  switch (method) {
    case "initialize":
      return jsonRpcResult(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: {
          name: "radar-imprensa-mcp-amapa",
          version: "1.0.0",
        },
      });
    case "notifications/initialized":
      return null;
    case "ping":
      return jsonRpcResult(id, {});
    case "tools/list":
      return jsonRpcResult(id, { tools: TOOL_DEFS });
    case "tools/call": {
      const name = params?.name;
      const args = params?.arguments || {};
      if (!name) return jsonRpcError(id, -32602, "name obrigatório");
      try {
        const result = await callTool(name, args);
        return jsonRpcResult(id, result);
      } catch (err) {
        return jsonRpcResult(id, errorResult(err.message || String(err)));
      }
    }
    default:
      return jsonRpcError(id, -32601, `Método não suportado: ${method}`);
  }
}

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => res.json(discovery()));
app.get("/mcp", (_req, res) => res.json(discovery()));
app.get("/health", async (_req, res) => {
  const h = await radarGet("/api/health");
  res.status(h.ok ? 200 : 502).json({
    ok: h.ok,
    mcp: "radar-imprensa-mcp-amapa",
    radar: h.data,
  });
});

app.post("/mcp", async (req, res) => {
  try {
    const messages = Array.isArray(req.body) ? req.body : [req.body];
    const out = [];
    for (const msg of messages) {
      if (!msg || typeof msg !== "object") continue;
      if (msg.method && String(msg.method).startsWith("notifications/")) {
        await handleRpc(msg);
        continue;
      }
      const reply = await handleRpc(msg);
      if (reply) out.push(reply);
    }
    if (out.length === 0) {
      res.status(202).end();
      return;
    }
    res.json(out.length === 1 ? out[0] : out);
  } catch (err) {
    res.status(500).json(jsonRpcError(null, -32603, String(err.message || err)));
  }
});

/** Atalho REST para agentes que não falam MCP (tools/call direto). */
app.post("/tools/:name", async (req, res) => {
  try {
    const result = await callTool(req.params.name, req.body || {});
    res.status(result.isError ? 400 : 200).json(result);
  } catch (err) {
    res.status(500).json(errorResult(err.message || String(err)));
  }
});

app.listen(PORT, () => {
  console.log(`MCP Amapá on :${PORT} · ${PUBLIC_URL}`);
  console.log(`Radar API: ${RADAR_API_BASE}`);
});
