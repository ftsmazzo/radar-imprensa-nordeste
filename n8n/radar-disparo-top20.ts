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

const formDisparo = trigger({
  type: 'n8n-nodes-base.formTrigger',
  version: 2.6,
  config: {
    name: 'Form Disparo',
    parameters: {
      formTitle: 'Radar Nordeste — Disparo',
      formDescription:
        'Envia material para o Top 20 do Radar. Use Modo=simulacao para testar sem enviar.',
      appendAttribution: false,
      formFields: {
        values: [
          {
            fieldLabel: 'Estado (UF)',
            fieldName: 'uf',
            fieldType: 'dropdown',
            requiredField: true,
            defaultValue: 'PE',
            fieldOptions: {
              values: [
                { option: 'AL' },
                { option: 'BA' },
                { option: 'CE' },
                { option: 'MA' },
                { option: 'PB' },
                { option: 'PE' },
                { option: 'PI' },
                { option: 'RN' },
                { option: 'SE' },
              ],
            },
          },
          {
            fieldLabel: 'Categoria',
            fieldName: 'tipo',
            fieldType: 'dropdown',
            requiredField: true,
            defaultValue: 'Portal',
            fieldOptions: {
              values: [
                { option: 'Portal' },
                { option: 'Blog' },
                { option: 'TV' },
                { option: 'Rádio' },
                { option: 'Jornal' },
              ],
            },
          },
          {
            fieldLabel: 'Assunto',
            fieldName: 'assunto',
            fieldType: 'text',
            requiredField: true,
            placeholder: 'Release / pauta',
          },
          {
            fieldLabel: 'Texto do material',
            fieldName: 'texto',
            fieldType: 'textarea',
            requiredField: true,
          },
          {
            fieldLabel: 'Link opcional',
            fieldName: 'link',
            fieldType: 'text',
            placeholder: 'https://...',
          },
          {
            fieldLabel: 'Canal',
            fieldName: 'canal',
            fieldType: 'dropdown',
            requiredField: true,
            defaultValue: 'whatsapp',
            fieldOptions: {
              values: [
                { option: 'whatsapp' },
                { option: 'email' },
                { option: 'ambos' },
              ],
            },
          },
          {
            fieldLabel: 'Modo',
            fieldName: 'modo',
            fieldType: 'dropdown',
            requiredField: true,
            defaultValue: 'simulacao',
            fieldOptions: {
              values: [{ option: 'simulacao' }, { option: 'enviar' }],
            },
          },
          {
            fieldLabel: 'Instancia Evolution',
            fieldName: 'instancia',
            fieldType: 'text',
            requiredField: true,
            placeholder: 'nome da instancia WhatsApp',
          },
          {
            fieldLabel: 'Email remetente',
            fieldName: 'fromEmail',
            fieldType: 'email',
            placeholder: 'assessoria@empresa.com',
          },
        ],
      },
    },
    output: [
      {
        uf: 'PE',
        tipo: 'Portal',
        assunto: 'Release teste',
        texto: 'Olá, segue material.',
        link: 'https://exemplo.com',
        canal: 'whatsapp',
        modo: 'simulacao',
        instancia: 'pazotti',
        fromEmail: 'assessoria@empresa.com',
      },
    ],
  },
});

const normalizeForm = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Normalize Form',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'uf', name: 'uf', type: 'string', value: expr('{{ $json.uf }}') },
          { id: 'tipo', name: 'tipo', type: 'string', value: expr('{{ $json.tipo }}') },
          { id: 'assunto', name: 'assunto', type: 'string', value: expr('{{ $json.assunto }}') },
          { id: 'texto', name: 'texto', type: 'string', value: expr('{{ $json.texto }}') },
          { id: 'link', name: 'link', type: 'string', value: expr('{{ $json.link || "" }}') },
          { id: 'canal', name: 'canal', type: 'string', value: expr('{{ $json.canal }}') },
          { id: 'modo', name: 'modo', type: 'string', value: expr('{{ $json.modo }}') },
          {
            id: 'instancia',
            name: 'instancia',
            type: 'string',
            value: expr('{{ $json.instancia }}'),
          },
          {
            id: 'fromEmail',
            name: 'fromEmail',
            type: 'string',
            value: expr('{{ $json.fromEmail || "" }}'),
          },
        ],
      },
    },
    output: [
      {
        uf: 'PE',
        tipo: 'Portal',
        assunto: 'Release teste',
        texto: 'Olá, segue material.',
        link: 'https://exemplo.com',
        canal: 'whatsapp',
        modo: 'simulacao',
        instancia: 'pazotti',
        fromEmail: 'assessoria@empresa.com',
      },
    ],
  },
});

const buscarTop20 = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Buscar Top 20',
    executeOnce: true,
    parameters: {
      method: 'GET',
      url: expr(
        '{{ "https://radar-imprensa-web.kxryyk.easypanel.host/api/top20?uf=" + $json.uf + "&type=" + encodeURIComponent($json.tipo) }}'
      ),
      options: {
        response: {
          response: {
            responseFormat: 'json',
          },
        },
      },
    },
    output: [
      {
        rank: 1,
        name: 'JC ONLINE',
        email: 'redacao@exemplo.com',
        phone: '+55 (81) 99999-0000',
        instagramFollowers: 1000000,
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
        "const form = $('Normalize Form').first().json;\n" +
        "let raw = $input.all().map(i => i.json);\n" +
        "if (raw.length === 1 && Array.isArray(raw[0])) raw = raw[0];\n" +
        "if (raw.length === 1 && Array.isArray(raw[0].data)) raw = raw[0].data;\n" +
        "if (raw.length === 1 && Array.isArray(raw[0].body)) raw = raw[0].body;\n" +
        "function cleanPhone(p) {\n" +
        "  if (!p) return null;\n" +
        "  let d = String(p).replace(/\\D/g, '');\n" +
        "  if (!d) return null;\n" +
        "  if (d.startsWith('55') && d.length >= 12) return d;\n" +
        "  if (d.length >= 10 && d.length <= 11) return '55' + d;\n" +
        "  return d.length >= 12 ? d : null;\n" +
        "}\n" +
        "const msg = [form.texto, form.link].filter(Boolean).join('\\n\\n');\n" +
        "const out = [];\n" +
        "for (const v of raw) {\n" +
        "  const phone = cleanPhone(v.phone);\n" +
        "  const email = v.email || null;\n" +
        "  const base = {\n" +
        "    uf: form.uf,\n" +
        "    tipo: form.tipo,\n" +
        "    assunto: form.assunto,\n" +
        "    texto: form.texto,\n" +
        "    link: form.link || '',\n" +
        "    canal: form.canal,\n" +
        "    modo: form.modo,\n" +
        "    instancia: form.instancia,\n" +
        "    fromEmail: form.fromEmail || '',\n" +
        "    messageText: `*${form.assunto}*\\n\\n${msg}`,\n" +
        "    emailSubject: form.assunto,\n" +
        "    emailBody: msg,\n" +
        "    veiculo: v.name,\n" +
        "    rank: v.rank,\n" +
        "    followers: v.instagramFollowers || null,\n" +
        "  };\n" +
        "  const wantWa = form.canal === 'whatsapp' || form.canal === 'ambos';\n" +
        "  const wantMail = form.canal === 'email' || form.canal === 'ambos';\n" +
        "  if (wantWa && phone) {\n" +
        "    out.push({ json: { ...base, channelType: 'whatsapp', destinatario: phone, contato: phone } });\n" +
        "  }\n" +
        "  if (wantMail && email) {\n" +
        "    out.push({ json: { ...base, channelType: 'email', destinatario: email, contato: email } });\n" +
        "  }\n" +
        "  if ((wantWa && !phone) && (wantMail && !email)) {\n" +
        "    out.push({ json: { ...base, channelType: 'sem_contato', destinatario: '', contato: '', statusHint: 'sem email/telefone' } });\n" +
        "  }\n" +
        "}\n" +
        "if (!out.length) {\n" +
        "  return [{ json: { ...form, channelType: 'vazio', destinatario: '', veiculo: '-', contato: '', statusHint: 'nenhum destino no Top 20' } }];\n" +
        "}\n" +
        "return out;",
    },
    output: [
      {
        uf: 'PE',
        tipo: 'Portal',
        assunto: 'Release teste',
        canal: 'whatsapp',
        modo: 'simulacao',
        instancia: 'pazotti',
        channelType: 'whatsapp',
        destinatario: '5581999999999',
        contato: '5581999999999',
        veiculo: 'JC ONLINE',
        messageText: '*Release teste*\n\nOlá',
        emailSubject: 'Release teste',
        emailBody: 'Olá',
        fromEmail: 'assessoria@empresa.com',
      },
    ],
  },
});

const registrarDisparo = node({
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
        value: 'e38pbAUwSPojNetb',
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
          status: expr('{{ $json.modo === "simulacao" ? "simulado" : "processando" }}'),
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
  version: 2.2,
  config: {
    name: 'Deve Enviar?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        combinator: 'and',
        conditions: [
          {
            id: 'modo-enviar',
            leftValue: expr('{{ $("Montar Destinos").item.json.modo }}'),
            rightValue: 'enviar',
            operator: { type: 'string', operation: 'equals' },
          },
        ],
      },
    },
  },
});

const ehWhatsapp = ifElse({
  version: 2.2,
  config: {
    name: 'Eh WhatsApp?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        combinator: 'and',
        conditions: [
          {
            id: 'ch-wa',
            leftValue: expr('{{ $("Montar Destinos").item.json.channelType }}'),
            rightValue: 'whatsapp',
            operator: { type: 'string', operation: 'equals' },
          },
        ],
      },
    },
  },
});

const ehEmail = ifElse({
  version: 2.2,
  config: {
    name: 'Eh Email?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        combinator: 'and',
        conditions: [
          {
            id: 'ch-mail',
            leftValue: expr('{{ $("Montar Destinos").item.json.channelType }}'),
            rightValue: 'email',
            operator: { type: 'string', operation: 'equals' },
          },
        ],
      },
    },
  },
});

const enviarWhatsApp = node({
  type: 'n8n-nodes-evolution-api.evolutionApi',
  version: 1,
  config: {
    name: 'Enviar WhatsApp',
    credentials: { evolutionApi: newCredential('Evolution Pazotti') },
    onError: 'continueRegularOutput',
    parameters: {
      resource: 'messages-api',
      operation: 'send-text',
      instanceName: expr('{{ $("Montar Destinos").item.json.instancia }}'),
      remoteJid: expr('{{ $("Montar Destinos").item.json.destinatario }}'),
      messageText: expr('{{ $("Montar Destinos").item.json.messageText }}'),
      options_message: {
        delay: 1500,
        linkPreview: true,
      },
    },
    output: [{ success: true }],
  },
});

const enviarEmail = node({
  type: 'n8n-nodes-base.emailSend',
  version: 2.1,
  config: {
    name: 'Enviar Email',
    credentials: { smtp: newCredential('SMTP Radar') },
    onError: 'continueRegularOutput',
    parameters: {
      operation: 'send',
      fromEmail: expr('{{ $("Montar Destinos").item.json.fromEmail }}'),
      toEmail: expr('{{ $("Montar Destinos").item.json.destinatario }}'),
      subject: expr('{{ $("Montar Destinos").item.json.emailSubject }}'),
      emailFormat: 'text',
      text: expr('{{ $("Montar Destinos").item.json.emailBody }}'),
      options: { appendAttribution: false },
    },
    output: [{ accepted: true }],
  },
});

const fimForm = node({
  type: 'n8n-nodes-base.form',
  version: 2.3,
  config: {
    name: 'Fim Disparo',
    parameters: {
      operation: 'completion',
      respondWith: 'text',
      completionTitle: 'Disparo processado',
      completionMessage: expr(
        '{{ "UF " + $("Normalize Form").first().json.uf + " · " + $("Normalize Form").first().json.tipo + " · modo " + $("Normalize Form").first().json.modo + ". Destinos montados e registrados na tabela radar_disparos." }}'
      ),
    },
    output: [{}],
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
  '1) Preencha Instancia Evolution.\n2) Modo simulacao = só loga na tabela.\n3) Email exige credencial SMTP Radar.\n4) WhatsApp usa Evolution Pazotti.'
);

export default workflow(
  'radar-disparo-top20',
  'Radar Nordeste — Disparo Top 20'
)
  .add(hint)
  .add(formDisparo)
  .to(normalizeForm)
  .to(buscarTop20)
  .to(montarDestinos)
  .to(
    lote
      .onEachBatch(
        registrarDisparo.to(
          deveEnviar
            .onTrue(
              ehWhatsapp
                .onTrue(enviarWhatsApp.to(nextBatch(lote)))
                .onFalse(
                  ehEmail
                    .onTrue(enviarEmail.to(nextBatch(lote)))
                    .onFalse(nextBatch(lote))
                )
            )
            .onFalse(nextBatch(lote))
        )
      )
      .onDone(fimForm)
  );
