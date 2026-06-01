import { getCampaignSector } from "../sectors.js";

export function buildContactMessage(prospect, campaign, scoreResult) {
  const sector = getCampaignSector(campaign);
  const webAngle = prospect.website
    ? "J'ai vu votre presence en ligne et je pense qu'un site plus simple a comprendre peut aider vos clients a trouver rapidement vos services, horaires et moyens de contact."
    : sector.noWebsiteAngle;

  return [
    `Bonjour ${prospect.name},`,
    "",
    campaign.localAngle,
    "",
    webAngle,
    "",
    `Ce que j'ai observe : ${scoreResult.reasons.slice(0, 2).join(" ")}`,
    "",
    "Je peux vous proposer une page simple avec vos services, votre zone, vos horaires et un moyen de contact direct.",
    "",
    "Bonne journee,"
  ].join("\n");
}
