import {
  workflow,
  trigger,
  node,
  sticky,
  expr,
  newCredential,
  ifElse,
  splitInBatches,
  nextBatch,
} from '@n8n/workflow-sdk';

/**
 * Radar Nordeste — Disparo via webhook (n8n Cursor / infra-core).
 * Payload esperado (body):
 * {
 *   uf, tipo, assunto, texto, link?, canal, modo, instancia,
 *   destinos: [{ veiculo, phone?, email?, rank? }]
 * }
 * Evolution base: https://infra-core-whatsapp-core.kxryyk.easypanel.host/message/sendText/{instancia}
 */

const webhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Webhook Disparo',
    parameters: {
      httpMethod: 'POST',
      path: 'radar-disparo',
      responseMode: 'responseNode',
      options: { allowedOrigins: '*' },
    },
    output: [
      {
        body: {
          uf: 'PE',
          tipo: 'Portal',
          assunto: 'Release teste',
          texto: 'Olá, segue material.',
          link: 'https://exemplo.com',
          canal: 'whatsapp',
          modo: 'simulacao',
          instancia: 'Agente',
          destinos: [
            {
              veiculo: 'JC ONLINE',
              phone: '5581999999999',
              email: 'redacao@exemplo.com',
              rank: 1,
            },
          ],
        },
      },
    ],
  },
});

const montarDestinos = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Montar Destinos',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const raw = $input.first().json;\n" +
        "const body = raw.body || raw;\n" +
        "function cleanPhone(p) {\n" +
        "  if (!p) return null;\n" +
        "  let d = String(p).replace(/\\D/g, '');\n" +
        "  if (!d) return null;\n" +
        "  if (d.startsWith('55') && d.length >= 12) return d;\n" +
        "  if (d.length >= 10 && d.length <= 11) return '55' + d;\n" +
        "  return d.length >= 12 ? d : null;\n" +
        "}\n" +
        "const msg = [body.texto, body.link].filter(Boolean).join('\\n\\n');\n" +
        "const wantWa = body.canal === 'whatsapp' || body.canal === 'ambos';\n" +
        "const wantMail = body.canal === 'email' || body.canal === 'ambos';\n" +
        "const list = Array.isArray(body.destinos) ? body.destinos : [];\n" +
        "const out = [];\n" +
        "for (const v of list) {\n" +
        "  const phone = cleanPhone(v.phone);\n" +
        "  const email = v.email || null;\n" +
        "  const base = {\n" +
        "    uf: body.uf,\n" +
        "    tipo: body.tipo,\n" +
        "    assunto: body.assunto,\n" +
        "    texto: body.texto,\n" +
        "    link: body.link || '',\n" +
        "    canal: body.canal,\n" +
        "    modo: body.modo || 'simulacao',\n" +
        "    instancia: body.instancia || 'Agente',\n" +
        "    messageText: (body.assunto ? body.assunto + '\\n\\n' : '') + msg,\n" +
        "    veiculo: v.veiculo || v.name || '-',\n" +
        "    rank: v.rank || null,\n" +
        "  };\n" +
        "  if (wantWa && phone) {\n" +
        "    out.push({ json: { ...base, channelType: 'whatsapp', destinatario: phone, contato: phone } });\n" +
        "  }\n" +
        "  if (wantMail && email) {\n" +
        "    out.push({ json: { ...base, channelType: 'email', destinatario: email, contato: email } });\n" +
        "  }\n" +
        "  if ((wantWa && !phone) && (wantMail && !email)) {\n" +
        "    out.push({ json: { ...base, channelType: 'sem_contato', destinatario: '', contato: '', statusHint: 'sem contato' } });\n" +
        "  }\n" +
        "}\n" +
        "if (!out.length) {\n" +
        "  return [{ json: {\n" +
        "    uf: body.uf, tipo: body.tipo, assunto: body.assunto, modo: body.modo || 'simulacao',\n" +
        "    canal: body.canal, instancia: body.instancia || 'Agente',\n" +
        "    channelType: 'vazio', destinatario: '', veiculo: '-', contato: '',\n" +
        "    messageText: '', statusHint: 'nenhum destino',\n" +
        "    summaryOnly: true,\n" +
        "  }}];\n" +
        "}\n" +
        "return out;",
    },
    output: [
      {
        uf: 'PE',
        tipo: 'Portal',
        assunto: 'Release teste',
        modo: 'simulacao',
        canal: 'whatsapp',
        instancia: 'Agente',
        channelType: 'whatsapp',
        destinatario: '5581999999999',
        contato: '5581999999999',
        veiculo: 'JC ONLINE',
        messageText: 'Release teste\n\nOlá',
      },
    ],
  },
});

const resumir = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Resumo Resposta',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const items = $input.all().map(i => i.json);\n" +
        "const modo = items[0]?.modo || 'simulacao';\n" +
        "const wa = items.filter(i => i.channelType === 'whatsapp').length;\n" +
        "const mail = items.filter(i => i.channelType === 'email').length;\n" +
        "const sem = items.filter(i => i.channelType === 'sem_contato' || i.channelType === 'vazio').length;\n" +
        "return [{ json: {\n" +
        "  ok: true,\n" +
        "  modo,\n" +
        "  uf: items[0]?.uf || null,\n" +
        "  tipo: items[0]?.tipo || null,\n" +
        "  assunto: items[0]?.assunto || null,\n" +
        "  total: items.length,\n" +
        "  whatsapp: wa,\n" +
        "  email: mail,\n" +
        "  semContato: sem,\n" +
        "  message: modo === 'enviar'\n" +
        "    ? `Disparo iniciado: ${wa} WhatsApp` + (mail ? `, ${mail} e-mail` : '')\n" +
        "    : `Simulação: ${items.length} destino(s) registrados (nada enviado).`,\n" +
        "  _items: items,\n" +
        "}}];",
    },
    output: [
      {
        ok: true,
        modo: 'simulacao',
        total: 1,
        whatsapp: 1,
        email: 0,
        message: 'Simulação ok',
        _items: [],
      },
    ],
  },
});

const responder = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Responder API',
    parameters: {
      enableResponseOutput: true,
      respondWith: 'json',
      responseBody: expr('{{ JSON.stringify({ ok: $json.ok, modo: $json.modo, uf: $json.uf, tipo: $json.tipo, assunto: $json.assunto, total: $json.total, whatsapp: $json.whatsapp, email: $json.email, semContato: $json.semContato, message: $json.message }) }}'),
      options: { responseCode: 200 },
    },
  },
});

const expandirItens = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Expandir Itens',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const summary = $input.first().json;\n" +
        "const items = Array.isArray(summary._items) ? summary._items : [];\n" +
        "if (!items.length) return [{ json: { ...summary, channelType: 'vazio', skip: true } }];\n" +
        "return items.map(j => ({ json: j }));",
    },
    output: [
      {
        modo: 'simulacao',
        channelType: 'whatsapp',
        destinatario: '5581999999999',
        veiculo: 'JC ONLINE',
        messageText: 'oi',
        instancia: 'Agente',
        uf: 'PE',
        tipo: 'Portal',
        assunto: 'x',
        contato: '5581999999999',
      },
    ],
  },
});

const registrar = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Registrar Disparo',
    parameters: {
      resource: 'row',
      operation: 'insert',
      dataTableId: {
        __rl: true,
        mode: 'id',
        value: 'cO2dV9O1NivBel90',
        cachedResultName: 'radar_disparos',
      },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          created_at: expr('{{ $now.toISO() }}'),
          uf: expr('{{ $json.uf }}'),
          tipo: expr('{{ $json.tipo }}'),
          assunto: expr('{{ $json.assunto }}'),
          canal: expr('{{ $json.channelType }}'),
          destinatario: expr('{{ $json.destinatario }}'),
          veiculo: expr('{{ $json.veiculo }}'),
          contato: expr('{{ $json.contato }}'),
          status: expr('{{ $json.modo === "simulacao" ? "simulado" : "enviando" }}'),
          modo: expr('{{ $json.modo }}'),
          detalhe: expr('{{ $json.statusHint || $json.messageText || "" }}'),
        },
        schema: [
          { id: 'created_at', displayName: 'created_at', required: false, display: true, type: 'date', canBeUsedToMatch: true },
          { id: 'uf', displayName: 'uf', required: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'tipo', displayName: 'tipo', required: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'assunto', displayName: 'assunto', required: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'canal', displayName: 'canal', required: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'destinatario', displayName: 'destinatario', required: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'veiculo', displayName: 'veiculo', required: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'contato', displayName: 'contato', required: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'status', displayName: 'status', required: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'modo', displayName: 'modo', required: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'detalhe', displayName: 'detalhe', required: false, display: true, type: 'string', canBeUsedToMatch: true },
        ],
      },
    },
    output: [{ id: 1 }],
  },
});

const deveEnviar = ifElse({
  version: 2.3,
  config: {
    name: 'Deve Enviar WhatsApp?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        combinator: 'and',
        conditions: [
          {
            id: 'modo',
            leftValue: expr('{{ $("Expandir Itens").item.json.modo }}'),
            rightValue: 'enviar',
            operator: { type: 'string', operation: 'equals' },
          },
          {
            id: 'wa',
            leftValue: expr('{{ $("Expandir Itens").item.json.channelType }}'),
            rightValue: 'whatsapp',
            operator: { type: 'string', operation: 'equals' },
          },
        ],
      },
    },
  },
});

const enviarZap = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Enviar Zap Evolution',
    credentials: { httpHeaderAuth: newCredential('Evolution') },
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: expr(
        '{{ "https://infra-core-whatsapp-core.kxryyk.easypanel.host/message/sendText/" + $("Expandir Itens").item.json.instancia }}'
      ),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr(
        '{{ JSON.stringify({ number: $("Expandir Itens").item.json.destinatario, text: $("Expandir Itens").item.json.messageText }) }}'
      ),
      options: {
        response: { response: { neverError: true } },
        timeout: 20000,
      },
    },
    output: [{ key: { id: 'ok' } }],
  },
});

const lote = splitInBatches({
  version: 3,
  config: {
    name: 'Lote Destinos',
    parameters: { batchSize: 1 },
  },
});

const hint = sticky(
  'Radar → POST /webhook/radar-disparo\nApp monta destinos; n8n registra + envia WhatsApp via Evolution (credencial Evolution).\nModo simulacao = só loga.'
);

export default workflow('radar-disparo-webhook', 'Radar Nordeste — Disparo Webhook')
  .add(hint)
  .add(webhook)
  .to(montarDestinos)
  .to(resumir)
  .to(responder)
  .to(expandirItens)
  .to(
    lote
      .onEachBatch(
        registrar.to(
          deveEnviar
            .onTrue(enviarZap.to(nextBatch(lote)))
            .onFalse(nextBatch(lote))
        )
      )
      .onDone()
  );
