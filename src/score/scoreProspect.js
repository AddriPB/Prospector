import { normalizeKey } from "../utils/text.js";
import { getCampaignSector } from "../sectors.js";

export function scoreProspect(prospect, campaign) {
  const sector = getCampaignSector(campaign);
  let score = 0;
  const reasons = [];
  const nameKey = normalizeKey(`${prospect.name} ${prospect.evidence?.join(" ")}`);

  if (sector.targetTerms.some((term) => nameKey.includes(normalizeKey(term)))) {
    score += 25;
    reasons.push(`${sector.businessMatchLabel} confirme par le nom ou les preuves.`);
  } else {
    score -= 20;
    reasons.push(`${sector.ambiguousLabel} encore ambigu.`);
  }

  if (campaign.cities.some((city) => normalizeKey(city) === normalizeKey(prospect.city))) {
    score += 20;
    reasons.push("Commune dans la zone cible.");
  } else if (prospect.address) {
    score += 8;
    reasons.push("Adresse disponible, zone a confirmer.");
  } else {
    score -= 10;
    reasons.push("Zone geographique insuffisamment prouvee.");
  }

  if (!prospect.website) {
    score += 30;
    reasons.push("Aucun site web public identifie.");
  } else if (prospect.evidence?.some((item) => item.includes("non verifie"))) {
    score += 15;
    reasons.push("Site declare mais verification incomplete ou en erreur.");
  } else {
    score -= 10;
    reasons.push("Site web public deja identifie.");
  }

  const contactCount = [prospect.phone, prospect.email, prospect.website]
    .filter(Boolean).length + (prospect.social?.length || 0);
  if (contactCount >= 2) {
    score += 15;
    reasons.push("Plusieurs moyens de contact publics disponibles.");
  } else if (contactCount === 1) {
    score += 7;
    reasons.push("Un moyen de contact public disponible.");
  } else {
    score -= 12;
    reasons.push("Aucun moyen de contact public fiable detecte.");
  }

  if ((prospect.evidence || []).length >= 2) {
    score += 10;
    reasons.push("Plusieurs preuves tracables.");
  } else {
    score -= 8;
    reasons.push("Preuves encore limitees.");
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    reasons
  };
}
