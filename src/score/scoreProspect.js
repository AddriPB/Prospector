import { normalizeKey } from "../utils/text.js";
import { getCampaignSector } from "../sectors.js";

export function scoreProspect(prospect, campaign) {
  const sector = getCampaignSector(campaign);
  const baseReasons = [];
  const webNeedReasons = [];
  const webNeedProofs = [];
  const commercialPotentialReasons = [];
  const commercialPotentialProofs = [];
  const actionabilityReasons = [];
  const actionabilityProofs = [];
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

  const webAudit = prospect.webAudit || null;
  const webPresenceKind = webAudit?.webPresenceKind || legacyWebPresenceKind(prospect, {
    sourceKey,
    socialKey,
    evidenceKey
  });

  if (webPresenceKind === "inaccessible" || hasWebsiteProblemSignal(evidenceKey)) {
    webNeed += 25;
    webNeedReasons.push("Site casse ou inaccessible.");
    webNeedProofs.push(webProof("Site casse ou inaccessible", "problem", webAudit, prospect.website));
  } else if (webPresenceKind === "third_party_only") {
    webNeed += 20;
    webNeedReasons.push("Presence limitee a Facebook, Instagram, Google Business ou annuaire.");
    webNeedProofs.push(webProof("Presence web limitee a une plateforme tierce", "problem", webAudit, prospect.website));
  } else if (webPresenceKind === "missing_official_site") {
    webNeed += 30;
    webNeedReasons.push("Aucun site web officiel identifie.");
    webNeedProofs.push(webProof("Aucun site officiel identifie", "problem", webAudit, prospect.website));
  } else if (hasWeakWebsiteSignal(evidenceKey)) {
    webNeed += 15;
    webNeedReasons.push("Site date, non mobile ou peu exploitable.");
    webNeedProofs.push(textProof("Site faible signale par les preuves", "warning", prospect.evidence));
  } else if (!prospect.website && hasSocialOrDirectorySignal({ sourceKey, socialKey, evidenceKey })) {
    webNeed += 20;
    webNeedReasons.push("Presence limitee a Facebook, Instagram, Google Business ou annuaire.");
    webNeedProofs.push(textProof("Presence tierce probable", "uncertain", prospect.evidence));
  } else if (!prospect.website) {
    webNeed += 30;
    webNeedReasons.push("Aucun site web officiel identifie.");
    webNeedProofs.push(textProof("Aucun site officiel dans les sources", "uncertain", prospect.evidence));
  } else {
    webNeedReasons.push("Site web officiel deja identifie.");
    webNeedProofs.push(webProof("Site officiel identifie", "ok", webAudit, prospect.website));
  }
  if (webAudit?.sitePresent && webAudit.siteAccessible) {
    if (!webAudit.viewportPresent || !webAudit.metaDescriptionPresent) {
      webNeed += 5;
      webNeedReasons.push("Audit web leger: SEO/mobile perfectible.");
      webNeedProofs.push(webProof("SEO/mobile perfectible", "warning", webAudit, prospect.website));
    }
    if (!webAudit.visibleContact && !webAudit.contactPageOrFormDetected) {
      actionabilityContact -= 2;
      actionabilityReasons.push("Audit web leger: canal de contact peu visible sur le site.");
      actionabilityProofs.push(webProof("Canal de contact peu visible sur le site", "warning", webAudit, prospect.website));
    }
  }
  if (!prospect.website && hasIncompleteSearchSignal(evidenceKey)) {
    webNeed -= hasVeryIncompleteSearchSignal(evidenceKey) ? 10 : 5;
    webNeedReasons.push("Absence de site incertaine ou recherche incomplete.");
    webNeedProofs.push(textProof("Absence de site incertaine", "uncertain", prospect.evidence));
  }

  if (hasVisibleActivitySignal(prospect, evidenceKey)) {
    commercialPotential += 10;
    commercialPotentialReasons.push("Activite visible : avis, horaires, photos ou presence locale.");
    commercialPotentialProofs.push(textProof("Activite visible dans les sources", "ok", prospect.evidence));
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
    actionabilityProofs.push({ label: "Telephone public disponible", status: "ok", evidence: prospect.phone });
  }
  if (prospect.email) {
    actionabilityContact += 5;
    actionabilityReasons.push("Email public disponible.");
    actionabilityProofs.push({ label: "Email public disponible", status: "ok", evidence: prospect.email });
  }
  if ((prospect.social || []).length || hasOtherContactChannelSignal(evidenceKey)) {
    actionabilityContact += 3;
    actionabilityReasons.push("Formulaire, reseau social actif ou autre canal exploitable.");
    actionabilityProofs.push(textProof("Canal exploitable identifie", "ok", [
      ...(prospect.social || []),
      ...(webAudit?.exploitableContacts || []).map((contact) => contact.value),
      ...(prospect.evidence || [])
    ]));
  }
  if (!prospect.phone && !prospect.email && (prospect.social || []).length) {
    actionabilityContact -= 5;
    actionabilityReasons.push("Contact uniquement indirect ou peu fiable.");
  }
  if (!prospect.phone && !prospect.email && !(prospect.social || []).length) {
    actionabilityContact -= 10;
    actionabilityReasons.push("Aucun contact exploitable.");
    actionabilityProofs.push(webProof("Aucun contact exploitable confirme", "problem", webAudit, prospect.website));
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
      webNeed: { score: subscores.webNeed, max: 35, reasons: webNeedReasons, proofs: webNeedProofs },
      commercialPotential: {
        score: subscores.commercialPotential,
        max: 25,
        reasons: commercialPotentialReasons,
        proofs: commercialPotentialProofs
      },
      actionability: {
        score: subscores.actionability,
        max: 25,
        reasons: actionabilityReasons,
        proofs: actionabilityProofs
      }
    },
    reasons
  };
}

function legacyWebPresenceKind(prospect, { sourceKey, socialKey, evidenceKey }) {
  if (prospect.website && hasSocialOrDirectorySignal({ sourceKey: "", socialKey: prospect.website, evidenceKey: "" })) {
    return "third_party_only";
  }
  if (prospect.website) return "official_site";
  if (hasSocialOrDirectorySignal({ sourceKey, socialKey, evidenceKey })) return "third_party_only";
  return "missing_official_site";
}

function webProof(label, status, audit, website) {
  return {
    label,
    status,
    evidence: auditEvidence(audit, website),
    sourceUrl: audit?.finalUrl || audit?.checkedUrl || website || "",
    checkedAt: audit?.checkedAt || ""
  };
}

function textProof(label, status, evidence = []) {
  return {
    label,
    status,
    evidence: (evidence || []).filter(Boolean).slice(0, 3).join(" | ") || "Incertitude explicite: preuve insuffisante.",
    sourceUrl: "",
    checkedAt: ""
  };
}

function auditEvidence(audit, website) {
  if (!audit) return website || "Incertitude explicite: audit web non disponible.";
  if (audit.webPresenceKind === "third_party_only") return audit.finalUrl || audit.checkedUrl || website || "Plateforme tierce.";
  if (audit.webPresenceKind === "missing_official_site") return "Aucun site officiel detecte dans les sources.";
  const parts = [
    audit.httpStatus ? `HTTP ${audit.httpStatus}` : null,
    audit.https ? "HTTPS" : "sans HTTPS",
    audit.title ? `title: ${audit.title}` : null,
    audit.metaDescription ? "meta presente" : null,
    audit.viewportPresent ? "viewport mobile" : "viewport absent",
    audit.visibleContact || audit.contactPageOrFormDetected ? "contact visible" : "contact absent"
  ].filter(Boolean);
  return parts.join(" | ") || audit.error || website || "Audit web disponible.";
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
