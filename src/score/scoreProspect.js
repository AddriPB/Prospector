import { normalizeKey } from "../utils/text.js";
import { getCampaignSector } from "../sectors.js";

export function scoreProspect(prospect, campaign) {
  const sector = getCampaignSector(campaign);
  const baseReasons = [];
  const webNeedReasons = [];
  const commercialPotentialReasons = [];
  const actionabilityReasons = [];
  const reasons = [];
  const nameKey = normalizeKey(`${prospect.name} ${prospect.evidence?.join(" ")}`);
  const evidenceKey = normalizeKey((prospect.evidence || []).join(" "));
  const sourceKey = normalizeKey([...(prospect.sources || []), prospect.source].filter(Boolean).join(" "));
  const socialKey = normalizeKey((prospect.social || []).join(" "));

  let base = 0;
  let webNeed = 0;
  let commercialPotential = 0;
  let actionabilityContact = 0;
  let actionabilityConfidence = 0;

  if (sector.targetTerms.some((term) => nameKey.includes(normalizeKey(term)))) {
    base += 10;
    baseReasons.push(`${sector.businessMatchLabel} confirme par le nom ou les preuves.`);
  } else {
    baseReasons.push(`${sector.ambiguousLabel} encore ambigu.`);
  }

  if (campaign.cities.some((city) => normalizeKey(city) === normalizeKey(prospect.city))) {
    base += 5;
    baseReasons.push("Commune dans la zone cible.");
  } else if (prospect.address) {
    reasons.push("Adresse disponible, zone a confirmer.");
  } else {
    reasons.push("Zone geographique insuffisamment prouvee.");
  }

  if (hasWebsiteProblemSignal(evidenceKey)) {
    webNeed += 25;
    webNeedReasons.push("Site casse ou inaccessible.");
  } else if (hasWeakWebsiteSignal(evidenceKey)) {
    webNeed += 15;
    webNeedReasons.push("Site date, non mobile ou peu exploitable.");
  } else if (!prospect.website && hasSocialOrDirectorySignal({ sourceKey, socialKey, evidenceKey })) {
    webNeed += 20;
    webNeedReasons.push("Presence limitee a Facebook, Instagram, Google Business ou annuaire.");
  } else if (!prospect.website) {
    webNeed += 30;
    webNeedReasons.push("Aucun site web public identifie.");
  } else {
    webNeedReasons.push("Site web public deja identifie.");
  }
  if (!prospect.website && hasIncompleteSearchSignal(evidenceKey)) {
    webNeed -= hasVeryIncompleteSearchSignal(evidenceKey) ? 10 : 5;
    webNeedReasons.push("Absence de site incertaine ou recherche incomplete.");
  }

  if (hasVisibleActivitySignal(prospect, evidenceKey)) {
    commercialPotential += 10;
    commercialPotentialReasons.push("Activite visible : avis, horaires, photos ou presence locale.");
  }
  if (hasOfferSignal(evidenceKey)) {
    commercialPotential += 5;
    commercialPotentialReasons.push("Offre lisible ou differenciante.");
  }
  if (hasLikelyNeedSignal(prospect, sector, evidenceKey)) {
    commercialPotential += 5;
    commercialPotentialReasons.push("Besoin probable : menu, reservation, livraison, privatisation ou service a presenter.");
  }
  if (hasAttractivenessSignal(prospect, evidenceKey)) {
    commercialPotential += 5;
    commercialPotentialReasons.push("Volume ou attractivite apparente.");
  }
  if (hasWeakActivitySignal(evidenceKey)) {
    commercialPotential -= 5;
    commercialPotentialReasons.push("Activite faible, peu d'avis ou peu de signaux recents.");
  }
  if (hasClosedOrUncertainSignal(evidenceKey)) {
    commercialPotential -= 10;
    commercialPotentialReasons.push("Commerce possiblement ferme, temporaire ou tres incertain.");
  }

  if (prospect.phone) {
    actionabilityContact += 7;
    actionabilityReasons.push("Telephone public disponible.");
  }
  if (prospect.email) {
    actionabilityContact += 5;
    actionabilityReasons.push("Email public disponible.");
  }
  if ((prospect.social || []).length || hasOtherContactChannelSignal(evidenceKey)) {
    actionabilityContact += 3;
    actionabilityReasons.push("Formulaire, reseau social actif ou autre canal exploitable.");
  }
  if (!prospect.phone && !prospect.email && (prospect.social || []).length) {
    actionabilityContact -= 5;
    actionabilityReasons.push("Contact uniquement indirect ou peu fiable.");
  }
  if (!prospect.phone && !prospect.email && !(prospect.social || []).length) {
    actionabilityContact -= 10;
    actionabilityReasons.push("Aucun contact exploitable.");
  }

  if (hasPrimarySourceSignal(prospect, sourceKey, evidenceKey)) {
    actionabilityConfidence += 4;
    actionabilityReasons.push("Source primaire ou fiche officielle claire.");
  }
  if (prospect.address && hasHoursSignal(evidenceKey)) {
    actionabilityConfidence += 3;
    actionabilityReasons.push("Adresse et horaires coherents.");
  } else if (prospect.address && prospect.city) {
    actionabilityConfidence += 2;
    actionabilityReasons.push("Adresse et commune coherentes.");
  }
  if ((prospect.sources || []).length > 1 || (prospect.evidence || []).length >= 2) {
    actionabilityConfidence += 3;
    actionabilityReasons.push("Plusieurs sources concordantes.");
  }
  if (hasContradictorySourceSignal(evidenceKey)) {
    actionabilityConfidence -= 5;
    actionabilityReasons.push("Sources contradictoires.");
  }
  if (hasUncertainIdentitySignal(evidenceKey)) {
    actionabilityConfidence -= 10;
    actionabilityReasons.push("Identite du commerce incertaine ou doublon probable.");
  }

  const subscores = {
    base: clampScore(base, 15),
    webNeed: clampScore(webNeed, 35),
    commercialPotential: clampScore(commercialPotential, 25),
    actionability: clampScore(actionabilityContact, 15) + clampScore(actionabilityConfidence, 10)
  };
  const score = clampScore(
    subscores.base + subscores.webNeed + subscores.commercialPotential + subscores.actionability,
    100
  );

  reasons.push(...baseReasons);
  reasons.push(...webNeedReasons);
  reasons.push(...commercialPotentialReasons);
  reasons.push(...actionabilityReasons);

  return {
    score,
    subscores,
    scoreBreakdown: {
      base: { score: subscores.base, max: 15, reasons: baseReasons },
      webNeed: { score: subscores.webNeed, max: 35, reasons: webNeedReasons },
      commercialPotential: {
        score: subscores.commercialPotential,
        max: 25,
        reasons: commercialPotentialReasons
      },
      actionability: { score: subscores.actionability, max: 25, reasons: actionabilityReasons }
    },
    reasons
  };
}

function clampScore(value, max) {
  return Math.max(0, Math.min(max, Math.round(Number(value) || 0)));
}

function hasWebsiteProblemSignal(evidenceKey) {
  return includesAny(evidenceKey, ["casse", "inaccessible", "erreur", "non verifie", "broken", "timeout", "404", "http 5"]);
}

function hasWeakWebsiteSignal(evidenceKey) {
  return includesAny(evidenceKey, ["date", "non mobile", "pas mobile", "peu exploitable", "obsolete"]);
}

function hasSocialOrDirectorySignal({ sourceKey, socialKey, evidenceKey }) {
  return includesAny(`${sourceKey} ${socialKey} ${evidenceKey}`, [
    "facebook",
    "instagram",
    "google",
    "business",
    "annuaire",
    "pagesjaunes"
  ]);
}

function hasIncompleteSearchSignal(evidenceKey) {
  return includesAny(evidenceKey, ["incomplete", "a confirmer", "incertain", "non verifie"]);
}

function hasVeryIncompleteSearchSignal(evidenceKey) {
  return includesAny(evidenceKey, ["tres incertain", "recherche incomplete", "identite incertaine"]);
}

function hasVisibleActivitySignal(prospect, evidenceKey) {
  return Boolean(
    prospect.address ||
      prospect.city ||
      includesAny(evidenceKey, ["avis", "horaire", "photo", "ouvert", "local", "osm", "fiche"])
  );
}

function hasOfferSignal(evidenceKey) {
  return includesAny(evidenceKey, [
    "menu",
    "reservation",
    "livraison",
    "privatisation",
    "service",
    "specialite",
    "devis",
    "urgence",
    "car repair",
    "restaurant",
    "amenity",
    "shop",
    "craft"
  ]);
}

function hasLikelyNeedSignal(prospect, sector, evidenceKey) {
  if (sector.id === "restaurants") return true;
  return Boolean(!prospect.website || includesAny(evidenceKey, ["menu", "reservation", "livraison", "privatisation", "devis", "depannage"]));
}

function hasAttractivenessSignal(prospect, evidenceKey) {
  return Boolean(
    (prospect.sources || []).length > 1 ||
      (prospect.evidence || []).length >= 2 ||
      includesAny(evidenceKey, ["nombreux avis", "attractif", "populaire", "photos", "note"])
  );
}

function hasWeakActivitySignal(evidenceKey) {
  return includesAny(evidenceKey, ["peu d'avis", "peu de signaux", "activite faible", "faible activite"]);
}

function hasClosedOrUncertainSignal(evidenceKey) {
  return includesAny(evidenceKey, ["ferme", "fermee", "temporaire", "cessation", "tres incertain"]);
}

function hasOtherContactChannelSignal(evidenceKey) {
  return includesAny(evidenceKey, ["formulaire", "contact", "messenger", "whatsapp"]);
}

function hasPrimarySourceSignal(prospect, sourceKey, evidenceKey) {
  return Boolean(
    prospect.sourceUrl ||
      includesAny(`${sourceKey} ${evidenceKey}`, ["osm", "overpass", "fiche officielle", "site officiel", "google business", "pagesjaunes"])
  );
}

function hasHoursSignal(evidenceKey) {
  return includesAny(evidenceKey, ["horaire", "horaires", "ouvert"]);
}

function hasContradictorySourceSignal(evidenceKey) {
  return includesAny(evidenceKey, ["contradictoire", "contradiction", "sources divergentes"]);
}

function hasUncertainIdentitySignal(evidenceKey) {
  return includesAny(evidenceKey, ["identite incertaine", "doublon", "homonyme"]);
}

function includesAny(value, terms) {
  return terms.some((term) => value.includes(normalizeKey(term)));
}
