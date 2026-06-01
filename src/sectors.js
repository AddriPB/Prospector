export const DEFAULT_SECTOR = "automotive";

export const SECTORS = {
  automotive: {
    id: "automotive",
    label: "Automobile",
    businessMatchLabel: "Metier automobile",
    ambiguousLabel: "Metier automobile",
    targetTerms: [
      "garage",
      "auto",
      "automobile",
      "carrosserie",
      "mecanique",
      "pneu",
      "controle-technique",
      "car-repair",
      "mechanic"
    ],
    overpassQueries: [
      { key: "shop", regex: "^(car|car_repair|tyres)$" },
      { key: "craft", regex: "^(car_repair|mechanic)$" },
      { key: "amenity", value: "car_wash" }
    ],
    noWebsiteAngle:
      "Je n'ai pas trouve de site web clair pour votre garage, ce qui peut faire perdre des demandes locales a des clients qui cherchent rapidement un professionnel auto."
  },
  restaurants: {
    id: "restaurants",
    label: "Restaurants",
    businessMatchLabel: "Restaurant",
    ambiguousLabel: "Activite de restauration",
    targetTerms: [
      "restaurant",
      "brasserie",
      "bistro",
      "bistrot",
      "cafe",
      "pizzeria",
      "pizza",
      "traiteur",
      "sushi",
      "food"
    ],
    overpassQueries: [
      { key: "amenity", regex: "^(restaurant|fast_food|cafe|bar|pub)$" },
      { key: "shop", regex: "^(bakery|pastry|deli)$" },
      { key: "tourism", value: "restaurant" }
    ],
    noWebsiteAngle:
      "Je n'ai pas trouve de site web clair pour votre restaurant, ce qui peut faire perdre des reservations et des demandes locales."
  },
  building_trades: {
    id: "building_trades",
    label: "Artisans batiment",
    businessMatchLabel: "Metier du batiment",
    ambiguousLabel: "Metier du batiment",
    targetTerms: [
      "artisan",
      "batiment",
      "plombier",
      "plomberie",
      "electricien",
      "electricite",
      "macon",
      "maconnerie",
      "peintre",
      "peinture",
      "menuisier",
      "menuiserie",
      "couvreur",
      "toiture",
      "chauffagiste",
      "renovation"
    ],
    overpassQueries: [
      {
        key: "craft",
        regex:
          "^(builder|carpenter|electrician|glaziery|handicraft|hvac|insulation|joiner|locksmith|mason|painter|plasterer|plumber|roofer|tiler|window_construction)$"
      },
      { key: "shop", regex: "^(doityourself|electrical|hardware|paint|trade)$" },
      { key: "office", regex: "^(architect|construction_company|electrician|estate_agent)$" }
    ],
    noWebsiteAngle:
      "Je n'ai pas trouve de site web clair pour votre activite, ce qui peut faire perdre des demandes locales de chantiers ou depannages."
  }
};

export function getCampaignSector(campaign = {}) {
  const sectorId = campaign.sector || DEFAULT_SECTOR;
  return SECTORS[sectorId] || SECTORS[DEFAULT_SECTOR];
}

export function sectorOptions() {
  return Object.values(SECTORS).map(({ id, label }) => ({ id, label }));
}
