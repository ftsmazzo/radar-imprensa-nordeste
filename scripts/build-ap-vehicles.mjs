import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Desk research público (Atlas da Imprensa, Guia de Mídia, sites oficiais, IBGE). Sem inventar contato. */
const raw = [
  // —— Macapá TV ——
  { city: "Macapá", type: "TV", name: "REDE AMAZÔNICA AMAPÁ (GLOBO)", phone: "+55 (96) 3242-1330", email: "jornaldoamapa@gruporedeamazonica.com.br", website: "https://g1.globo.com/ap/amapa/", address: "Avenida Diógenes Silva, 2221 — Buritizal, Macapá-AP", sources: ["atlas-imprensa", "encontramacapa"] },
  { city: "Macapá", type: "TV", name: "TV AMAZÔNIA (SBT)", phone: "+55 (96) 3217-1051", whatsapp: "+55 (96) 99199-5810", website: "https://www.sbt.com.br/", address: "Rua Hildemar Maia, 2135 — Buritizal, CEP 68902-901, Macapá-AP", sources: ["atlas-imprensa", "listatudo"] },
  { city: "Macapá", type: "TV", name: "TV EQUINÓCIO (RECORD)", phone: "+55 (96) 99173-2040", website: "https://equinocioplay.com.br/", sources: ["atlas-imprensa", "wikipedia"] },
  { city: "Macapá", type: "TV", name: "NC TV AMAPÁ (BAND)", phone: "+55 (96) 3242-5068", email: "tvmacapaband@gmail.com", sources: ["atlas-imprensa", "wikipedia"] },
  { city: "Macapá", type: "TV", name: "TV CIDADE MACAPÁ", phone: "+55 (96) 99110-2225", email: "redeeldoradoap@gmail.com", sources: ["atlas-imprensa"] },
  { city: "Macapá", type: "TV", name: "TV UNIFAP (EBC)", email: "tvunifap@gmail.com", website: "https://www2.unifap.br/", sources: ["atlas-imprensa"] },

  // —— Macapá rádio ——
  { city: "Macapá", type: "Rádio", name: "RÁDIO DIÁRIO FM 90,9", phone: "+55 (96) 3084-2216", whatsapp: "+55 (96) 98127-0629", email: "diariofmmacapa@hotmail.com", website: "https://www.diariofmmacapa.com.br/", address: "Avenida Coriolano Jucá, 456 — Centro, CEP 68900-101, Macapá-AP", sources: ["site-oficial", "atlas-imprensa"] },
  { city: "Macapá", type: "Rádio", name: "CBN AMAZÔNIA MACAPÁ 93,3 FM", phone: "+55 (96) 99114-6676", email: "jornalismo@cbnamazonia.com.br", website: "https://www.cbnamazonia.com.br/", sources: ["atlas-imprensa", "cbn"] },
  { city: "Macapá", type: "Rádio", name: "RÁDIO ASSEMBLEIA 93,9 FM", website: "https://al.ap.gov.br/", sources: ["aleap", "tudoradio"] },
  { city: "Macapá", type: "Rádio", name: "EQUATORIAL FM 94,5", sources: ["tudoradio"] },
  { city: "Macapá", type: "Rádio", name: "RÁDIO UNIVERSITÁRIA UNIFAP 96,9 FM", website: "https://www2.unifap.br/", sources: ["tudoradio"] },
  { city: "Macapá", type: "Rádio", name: "EQUINÓCIO FM 99,1", phone: "+55 (96) 99173-2040", website: "https://equinocioplay.com.br/", sources: ["atlas-imprensa"] },
  { city: "Macapá", type: "Rádio", name: "RÁDIO FORTE 99,9 FM", phone: "+55 (96) 99180-1999", email: "contato@fortefm.com.br", sources: ["atlas-imprensa"] },
  { city: "Macapá", type: "Rádio", name: "RÁDIO SÃO JOSÉ 100,5 FM", phone: "+55 (96) 99187-5263", email: "rsjfm100@gmail.com", sources: ["atlas-imprensa"] },
  { city: "Macapá", type: "Rádio", name: "RÁDIO 101 FM", phone: "+55 (96) 98129-1101", email: "radiocidade101fm@hotmail.com", sources: ["atlas-imprensa"] },
  { city: "Macapá", type: "Rádio", name: "RÁDIO 102 FM", phone: "+55 (96) 99100-2102", email: "contato@102fmmacapa.com.br", sources: ["atlas-imprensa"] },
  { city: "Macapá", type: "Rádio", name: "RÁDIO RBN 104,9 FM", email: "radiorbnmacapa@hotmail.com", sources: ["atlas-imprensa"] },
  { city: "Macapá", type: "Rádio", name: "REDE ALELUIA 107,9 FM MACAPÁ", email: "ouvintes@redealeluia.com.br", website: "https://www.redealeluia.com.br/", sources: ["atlas-imprensa"] },
  { city: "Macapá", type: "Rádio", name: "RÁDIO DIFUSORA DE MACAPÁ 630 AM", sources: ["tudoradio"] },

  // —— Macapá jornal / portal / blog ——
  { city: "Macapá", type: "Jornal", name: "DIÁRIO DO AMAPÁ", phone: "+55 (96) 3084-2216", whatsapp: "+55 (96) 98127-0629", email: "diario-ap@uol.com.br", website: "https://www.diariodoamapa.com.br/", address: "Avenida Coriolano Jucá, 456 — Centro, entre Tiradentes e General Rondon, CEP 68900-101, Macapá-AP", instagram: "https://www.instagram.com/diariodoamapa/", sources: ["site-oficial", "atlas-imprensa"] },
  { city: "Macapá", type: "Jornal", name: "JORNAL DO DIA", phone: "+55 (96) 3217-1100", email: "comercialjd.2011@gmail.com", website: "https://www.jdia.com.br/", sources: ["atlas-imprensa"] },
  { city: "Macapá", type: "Jornal", name: "JORNAL O AMAPÁ", phone: "+55 (96) 99115-9464", email: "oamapa@hotmail.com", website: "https://jornaloamapa.com/", sources: ["atlas-imprensa"] },
  { city: "Macapá", type: "Jornal", name: "JORNAL O GUARANI", phone: "+55 (96) 98112-0161", email: "redacaojornaloguarani@gmail.com", website: "https://jornaloguarani.com/", instagram: "https://www.instagram.com/redacaojornaloguarani/", sources: ["atlas-imprensa"] },
  { city: "Macapá", type: "Portal", name: "G1 AMAPÁ", phone: "+55 (96) 3242-1599", email: "jornaldoamapa@gruporedeamazonica.com.br", website: "https://g1.globo.com/ap/amapa/", sources: ["atlas-imprensa", "g1"] },
  { city: "Macapá", type: "Portal", name: "AQUI AMAPÁ", phone: "+55 (96) 3242-5068", website: "https://aquiamapa.com.br/", sources: ["atlas-imprensa"] },
  { city: "Macapá", type: "Portal", name: "A GAZETA DO AMAPÁ", phone: "+55 (96) 99115-2580", email: "contato@agazetadoamapa.com.br", website: "https://agazetadoamapa.com.br/", sources: ["atlas-imprensa"] },
  { city: "Macapá", type: "Portal", name: "FOLHA DO AMAPÁ", phone: "+55 (96) 99181-8588", email: "contato@folhadoamapa.com", website: "https://www.folhadoamapa.com/", sources: ["atlas-imprensa"] },
  { city: "Macapá", type: "Portal", name: "AMAPÁ DIGITAL", phone: "+55 (96) 98114-5711", email: "comercialamapadigital@gmail.com", website: "https://amapadigital.net/", instagram: "https://www.instagram.com/amapadigital/", sources: ["atlas-imprensa"] },
  { city: "Macapá", type: "Portal", name: "O AMAPÁ NEWS", phone: "+55 (96) 98143-8875", email: "oamapanews.adm@gmail.com", website: "https://www.oamapanews.com/", sources: ["atlas-imprensa"] },
  { city: "Macapá", type: "Portal", name: "SELES NAFES", email: "selesnafes@gmail.com", website: "https://selesnafes.com/", sources: ["atlas-imprensa"] },
  { city: "Macapá", type: "Portal", name: "AMAPÁ ON-LINE", phone: "+55 (96) 98406-8040", email: "amapaonline@gmail.com", website: "https://amapaonline.com/", instagram: "https://www.instagram.com/amapaonline/", sources: ["atlas-imprensa"] },
  { city: "Macapá", type: "Portal", name: "AGÊNCIA AMAPÁ", email: "suporteapp@prodap.ap.gov.br", website: "https://agenciaamapa.com.br/", instagram: "https://www.instagram.com/governoamapa/", sources: ["atlas-imprensa"] },
  { city: "Macapá", type: "Portal", name: "CONECTA AMAPÁ", website: "https://conectamapa.com/", sources: ["atlas-imprensa"] },
  { city: "Macapá", type: "Portal", name: "CAFÉ COM NOTÍCIA", phone: "+55 (96) 99110-5122", email: "redacaoccn@gmail.com", website: "https://cafecomnoticia.com.br/", instagram: "https://www.instagram.com/cafecomnoticia_/", sources: ["atlas-imprensa"] },
  { city: "Macapá", type: "Portal", name: "CORREIO AMAPAENSE", phone: "+55 (21) 97381-7494", email: "redacao@correioamapaense.com.br", website: "https://correioamapaense.com.br/", instagram: "https://www.instagram.com/revistacorreioamapaense/", sources: ["atlas-imprensa"] },
  { city: "Macapá", type: "Portal", name: "PORTAL ALYNE KAISER", phone: "+55 (96) 99111-1916", email: "contato@alynekaiser.com.br", website: "https://alynekaiser.com.br/", sources: ["atlas-imprensa"] },
  { city: "Macapá", type: "Blog", name: "BLOG ALCINÉA CAVALCANTE", phone: "+55 (96) 98111-0807", email: "contato@alcilenecavalcante.com.br", website: "https://www.alcilenecavalcante.com.br/", sources: ["atlas-imprensa"] },
  { city: "Macapá", type: "Blog", name: "BLOG DO ROCHA", phone: "+55 (96) 99147-4038", email: "elton_vt@yahoo.com.br", website: "https://www.blogderocha.com.br/", sources: ["atlas-imprensa"] },
  { city: "Macapá", type: "Blog", name: "BLOG CLEIDE FREIRES", phone: "+55 (96) 98133-0721", email: "cleidefreiresjornalista@gmail.com", website: "https://www.cleidefreires.com.br/", instagram: "https://www.instagram.com/cleide_freires09/", sources: ["atlas-imprensa"] },
  { city: "Macapá", type: "Blog", name: "BLOG CLEBER BARBOSA", phone: "+55 (96) 99157-0022", email: "contato@cleberbarbosa.net", website: "https://www.cleberbarbosa.net/", instagram: "https://www.instagram.com/CleberBarbosaAP/", sources: ["atlas-imprensa"] },

  // —— Santana ——
  { city: "Santana", type: "Rádio", name: "RÁDIO TUCUJU FM 105,3", website: "https://tucujufm.com.br/", sources: ["tudoradio", "blog-do-rocha"] },
  { city: "Santana", type: "Rádio", name: "RÁDIO ONDA LIVRE 105,9 FM", phone: "+55 (96) 99144-0832", email: "edson.fernandes.stn@gmail.com", sources: ["atlas-imprensa"] },
  { city: "Santana", type: "Rádio", name: "RÁDIO TARUMÃ 104,3 FM", email: "radiotaruma.104@gmail.com", sources: ["atlas-imprensa"] },
  { city: "Santana", type: "Blog", name: "BLOG SANTANA DO AMAPÁ", email: "santana.amapa@bol.com.br", website: "https://santanadoamapa.blogspot.com/", sources: ["atlas-imprensa"] },
  { city: "Santana", type: "Portal", name: "CONEXÃO BRASÍLIA AMAPÁ", phone: "+55 (96) 99157-0022", email: "contato@conexaobrasilia.com", website: "https://www.conexaobrasilia.com/", sources: ["atlas-imprensa"] },

  // —— Laranjal do Jari ——
  { city: "Laranjal do Jari", type: "Portal", name: "JARI NOTÍCIAS", email: "jarinoticias@gmail.com", website: "https://www.jarinoticias.com.br/", sources: ["site-oficial", "guia-de-midia"] },
  { city: "Laranjal do Jari", type: "Rádio", name: "VALE FM 87,9", email: "contato@valefm.com.br", website: "https://www.valefm.com.br/", sources: ["site-oficial"] },
  { city: "Laranjal do Jari", type: "Rádio", name: "RÁDIO VERDADE 97,9 FM", phone: "+55 (96) 99163-1749", email: "missinarioramalho@gmail.com", sources: ["atlas-imprensa"] },
  { city: "Laranjal do Jari", type: "TV", name: "TV VERDADE (SBT) LARANJAL DO JARI", phone: "+55 (96) 99163-1749", email: "ministerioverdadejari@gmail.com", sources: ["atlas-imprensa"] },
  { city: "Laranjal do Jari", type: "Rádio", name: "RÁDIO NBR JARI", sources: ["radios.com.br"] },

  // —— Oiapoque ——
  { city: "Oiapoque", type: "Jornal", name: "JORNAL DOS MUNICÍPIOS DO AMAPÁ", phone: "+55 (96) 98400-2809", email: "jornaldosmunicipios2022@gmail.com", website: "https://www.jornaldosmunicipiosap.com.br/", sources: ["atlas-imprensa"] },
  { city: "Oiapoque", type: "Rádio", name: "RÁDIO OIAPOQUE 91,9 FM", phone: "+55 (96) 98116-4559", sources: ["atlas-imprensa"] },
  { city: "Oiapoque", type: "Rádio", name: "EQUINÓCIO FM 100,9 OIAPOQUE", phone: "+55 (96) 98805-1596", email: "radiomarcozerofmdeoiapoque@hotmail.com", sources: ["atlas-imprensa"] },
  { city: "Oiapoque", type: "Rádio", name: "RÁDIO FRONTEIRA 104,9 FM", phone: "+55 (96) 98805-1596", email: "ronaldotvcidade104@hotmail.com", sources: ["atlas-imprensa"] },

  // —— Santana extras ——
  { city: "Santana", type: "Rádio", name: "RÁDIO AÇÃO 92,3 FM", phone: "+55 (96) 3281-2550", whatsapp: "+55 (96) 99100-0642", email: "contato@jovemsantanafm.com.br", address: "Avenida Rio Branco, 3748 — Fonte Nova, Santana-AP", sources: ["tudoradio", "radios.com.br"], note: "Antes Rádio Inorte / Jovem Santana FM" },

  // —— Interior ——
  { city: "Porto Grande", type: "Rádio", name: "RÁDIO PIUARA 100,1 FM", phone: "+55 (96) 98801-6607", sources: ["atlas-imprensa"] },
  { city: "Pedra Branca do Amapari", type: "Rádio", name: "RÁDIO AMAPARI 87,9 FM", email: "contato@amaparifm.com.br", website: "https://amaparifm.com.br/", sources: ["atlas-imprensa"] },
  { city: "Calçoene", type: "Rádio", name: "RÁDIO CALÇOENE 87,9 FM", phone: "+55 (96) 98119-8391", sources: ["atlas-imprensa"] },
  { city: "Calçoene", type: "Rádio", name: "RÁDIO LOURENÇO 87,9 FM", sources: ["atlas-imprensa"] },
  { city: "Cutias", type: "Rádio", name: "RÁDIO CUTIAS 87,9 FM", email: "contato@radiocutiasfm.com.br", website: "https://radiocutiasfm.com.br/", sources: ["atlas-imprensa"] },
  { city: "Amapá", type: "Rádio", name: "RÁDIO VERDADE AMAPÁ 92,7 FM", phone: "+55 (96) 98407-8879", email: "missionarioramalhobomjardim@gmail.com", sources: ["atlas-imprensa"] },
  { city: "Ferreira Gomes", type: "TV", name: "TV FERREIRA GOMES (SBT)", sources: ["atlas-imprensa"] },
  { city: "Vitória do Jari", type: "Rádio", name: "RÁDIO VITÓRIA 87,9 FM", phone: "+55 (96) 99127-1387", sources: ["atlas-imprensa"] },
  { city: "Tartarugalzinho", type: "Rádio", name: "TUMUCUMAQUE FM", phone: "+55 (96) 3283-1150", address: "Avenida Mãe Verônica, 392 — Central, CEP 68990-000, Tartarugalzinho-AP", sources: ["cnpj", "desk-2026-09"], note: "Associada à Associação Comunitária dos Moradores de Tartarugalzinho — confirmar se ainda no ar" },
  { city: "Macapá", type: "Rádio", name: "RÁDIO MARESOL WEB", website: "https://www.radiomaresol.com.br/", sources: ["radio-browser", "zeno"], note: "Web rádio com sede/stream em Macapá" },

  // Cidades sem emissora comercial mapeada: portal institucional (canal local público)
  { city: "Mazagão", type: "Portal", name: "PORTAL PREFEITURA DE MAZAGÃO", email: "pmmzmazagao@gmail.com", website: "http://www.mazagao.ap.gov.br/", sources: ["atlas-imprensa"], note: "Canal institucional" },
  { city: "Tartarugalzinho", type: "Portal", name: "PORTAL PREFEITURA DE TARTARUGALZINHO", phone: "+55 (96) 98410-0607", email: "gabinete@tartarugalzinho.ap.gov.br", website: "https://www.tartarugalzinho.ap.gov.br/", instagram: "https://www.instagram.com/pmt_tartarugal/", sources: ["atlas-imprensa"], note: "Canal institucional" },
  { city: "Itaubal", type: "Rádio", name: "ITAUBAL FM 87,9", phone: "+55 (96) 98433-9488", whatsapp: "+5596984339488", email: "itaubalfm879@gmail.com", address: "Rua Orival C. Palmerim, 567, Itaubal - AP", sources: ["websearch-2026-09"], note: "Levantamento complementar 2026-09" },
  { city: "Itaubal", type: "Portal", name: "PORTAL PREFEITURA DE ITAUBAL", website: "https://www.itaubal.ap.gov.br/", sources: ["atlas-imprensa"], note: "Canal institucional" },
  { city: "Serra do Navio", type: "Portal", name: "PORTAL PREFEITURA DE SERRA DO NAVIO", website: "https://www.serradonavio.ap.gov.br/", sources: ["atlas-imprensa"], note: "Canal institucional" },
  { city: "Pracuúba", type: "Portal", name: "PORTAL PREFEITURA DE PRACUÚBA", email: "prefeiturapracuubaoficial@gmail.com", website: "https://pracuuba.portal.ap.gov.br/", sources: ["atlas-imprensa"], note: "Canal institucional" },
  { city: "Ferreira Gomes", type: "Portal", name: "PORTAL PREFEITURA DE FERREIRA GOMES", phone: "+55 (96) 3326-1228", email: "gabpmfg@gmail.com", website: "http://www.ferreiragomes.ap.gov.br/", sources: ["atlas-imprensa"] },
];

function digits(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function waDigits(whatsapp, phone) {
  const w = digits(whatsapp);
  if (w.length >= 12) return w.startsWith("55") ? w : `55${w}`;
  const p = digits(phone);
  // celular: DDD + 9 + 8 dígitos
  if (/^55\d{2}9\d{8}$/.test(p) || /^\d{2}9\d{8}$/.test(p)) {
    return p.startsWith("55") ? p : `55${p}`;
  }
  return w || null;
}

function completeness(v) {
  const bits = [v.phone, v.email, v.website, v.address].filter(Boolean).length;
  if (bits >= 3) return "complete";
  if (bits >= 1) return "partial";
  return "minimal";
}

const TYPE_SCORE = { TV: 0.95, Jornal: 0.88, Portal: 0.78, Rádio: 0.72, Blog: 0.55 };

const vehicles = raw.map((v, i) => {
  const whatsapp = waDigits(v.whatsapp, v.phone);
  const comp = completeness(v);
  const contactBoost = (v.email ? 0.08 : 0) + (v.phone ? 0.08 : 0) + (v.website ? 0.05 : 0);
  const score = Math.round(Math.min(0.99, (TYPE_SCORE[v.type] ?? 0.5) + contactBoost) * 1000) / 1000;
  return {
    id: `ap-${String(i + 1).padStart(3, "0")}`,
    name: v.name,
    uf: "AP",
    state: "Amapá",
    city: v.city,
    type: v.type,
    phone: v.phone || null,
    whatsapp: whatsapp ? `+${whatsapp}` : null,
    email: v.email || null,
    website: v.website || null,
    instagram: v.instagram || null,
    address: v.address || null,
    completeness: comp,
    score,
    confidence: comp === "complete" ? "média-alta" : comp === "partial" ? "média" : "baixa",
    scoreVersion: "ap-desk-v1",
    sources: v.sources || [],
    metrics: { note: v.note || null, region: "amapa" },
  };
});

const byCity = {};
for (const v of vehicles) {
  byCity[v.city] = (byCity[v.city] || 0) + 1;
}

const out = {
  version: "ap-desk-v1",
  importedAt: new Date().toISOString(),
  methodology: [
    "Levantamento web público (Atlas da Imprensa, Guia de Mídia, sites oficiais, IBGE 2026).",
    "Não há a base v1 do Nordeste para o Amapá; contatos só entram se publicados.",
    "Municípios sem emissora/portal independente: portal institucional da prefeitura, marcado nas métricas.",
    "WhatsApp preenchido quando o telefone público é celular ou quando a fonte cita WhatsApp.",
  ],
  count: vehicles.length,
  byType: vehicles.reduce((a, v) => ((a[v.type] = (a[v.type] || 0) + 1), a), {}),
  byCity,
  items: vehicles,
};

const dest = path.join(__dirname, "../data/vehicles-ap-v1.json");
fs.writeFileSync(dest, JSON.stringify(out, null, 2));
console.log(`Wrote ${vehicles.length} vehicles → ${dest}`);
console.log("cities", Object.keys(byCity).length, byCity);
