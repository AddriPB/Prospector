export const REJECTION_REASONS = [
  { id: "doublon", label: "Doublon" },
  { id: "hors_zone", label: "Hors zone" },
  { id: "pas_restaurant", label: "Pas restaurant" },
  { id: "ferme_incertain", label: "Ferme/incertain" },
  { id: "deja_bien_equipe", label: "Deja bien equipe" },
  { id: "chaine_franchise", label: "Chaine/franchise" },
  { id: "contact_impossible", label: "Contact impossible" },
  { id: "autre", label: "Autre" }
];

export function rejectionReasonLabel(reasonId) {
  return REJECTION_REASONS.find((reason) => reason.id === reasonId)?.label || reasonId || "";
}
