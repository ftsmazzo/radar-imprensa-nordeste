/** Região do frontend/API: NE = Nordeste, AP = Amapá. */
export function resolveRadarRegion(raw = process.env.RADAR_REGION) {
  const v = String(raw || "NE").toUpperCase();
  if (v === "AP" || v === "AMAPA" || v === "AMAPÁ") return "AP";
  return "NE";
}

export const REGION_META = {
  NE: {
    code: "NE",
    brand: "Radar Imprensa Nordeste",
    tag: "Mapa vivo dos veículos que realmente alcançam audiência",
    ufs: ["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"],
    defaultUf: "PE",
    defaultMode: "quantitativo",
    limitPerCity: 8,
    footer: "Inventário Nordeste · Enrichment Apify · ranking editorial · disparo WhatsApp/e-mail",
  },
  AP: {
    code: "AP",
    brand: "Radar Imprensa Amapá",
    tag: "16 municípios · rádio, TV, jornal, portal e blog · disparo WhatsApp e e-mail",
    ufs: ["AP"],
    defaultUf: "AP",
    defaultMode: "cidades",
    limitPerCity: 5,
    footer: "Inventário Amapá (desk research) · CSV clicável · disparo WhatsApp/e-mail via n8n",
  },
};
