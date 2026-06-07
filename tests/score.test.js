import test from "node:test";
import assert from "node:assert/strict";
import { scoreProspect } from "../src/score/scoreProspect.js";
import { buildOverpassQuery } from "../src/sources/overpass.js";

const campaign = {
  cities: ["Pantin"],
  targetCount: 50
};

test("score haut pour garage local sans site avec contact", () => {
  const result = scoreProspect(
    {
      name: "Garage Auto Pantin",
      city: "Pantin",
      phone: "0102030405",
      evidence: ["shop=car_repair", "Fiche OSM"]
    },
    campaign
  );

  assert.equal(result.score >= 80, true);
  assert.equal(result.score <= 100, true);
  assert.equal(result.scoreBreakdown.webNeed.max, 35);
  assert.equal(result.scoreBreakdown.commercialPotential.max, 25);
  assert.equal(result.scoreBreakdown.actionability.max, 25);
  assert.equal(result.scoreBreakdown.webNeed.score <= 35, true);
  assert.equal(result.reasons.some((reason) => reason.includes("Aucun site")), true);
});

test("score plus bas si metier ambigu et site deja present", () => {
  const result = scoreProspect(
    {
      name: "Commerce General",
      city: "Ailleurs",
      website: "https://example.com",
      evidence: []
    },
    campaign
  );

  assert.equal(result.score < 40, true);
});

test("score distingue site officiel, presence tierce et site inaccessible", () => {
  const official = scoreProspect(
    {
      name: "Garage Web Pantin",
      city: "Pantin",
      website: "https://garage-web.example",
      evidence: ["shop=car_repair"],
      webAudit: {
        checkedAt: "2026-06-01T10:00:00.000Z",
        sitePresent: true,
        siteAccessible: true,
        webPresenceKind: "official_site",
        https: true,
        title: "Garage Web",
        metaDescription: "Garage local",
        viewportPresent: true,
        visibleContact: true
      }
    },
    campaign
  );
  const thirdPartyOnly = scoreProspect(
    {
      name: "Garage Social Pantin",
      city: "Pantin",
      website: "https://www.facebook.com/garage-social",
      evidence: ["shop=car_repair"],
      webAudit: {
        checkedAt: "2026-06-01T10:00:00.000Z",
        sitePresent: false,
        siteAccessible: true,
        webPresenceKind: "third_party_only",
        socialOrDirectoryOnly: true,
        visibleSocial: true
      }
    },
    campaign
  );
  const inaccessible = scoreProspect(
    {
      name: "Garage Casse Pantin",
      city: "Pantin",
      website: "https://garage-casse.example",
      evidence: ["shop=car_repair"],
      webAudit: {
        checkedAt: "2026-06-01T10:00:00.000Z",
        sitePresent: true,
        siteAccessible: false,
        webPresenceKind: "inaccessible",
        httpStatus: 500
      }
    },
    campaign
  );

  assert.equal(official.scoreBreakdown.webNeed.reasons.includes("Site web officiel deja identifie."), true);
  assert.equal(thirdPartyOnly.scoreBreakdown.webNeed.score > official.scoreBreakdown.webNeed.score, true);
  assert.equal(
    thirdPartyOnly.scoreBreakdown.webNeed.reasons.some((reason) => reason.includes("Presence limitee")),
    true
  );
  assert.equal(
    inaccessible.scoreBreakdown.webNeed.reasons.some((reason) => reason.includes("casse")),
    true
  );
  assert.equal(inaccessible.scoreBreakdown.webNeed.proofs.length > 0, true);
  assert.equal(inaccessible.scoreBreakdown.webNeed.score <= 35, true);
});

test("score utilise le secteur configure", () => {
  const result = scoreProspect(
    {
      name: "Restaurant Pantin",
      city: "Pantin",
      phone: "0102030405",
      evidence: ["amenity=restaurant", "Fiche OSM"]
    },
    { ...campaign, sector: "restaurants" }
  );

  assert.equal(result.score >= 80, true);
  assert.equal(result.reasons[0].includes("Restaurant confirme"), true);
});

test("requete Overpass utilise le secteur configure", () => {
  const query = buildOverpassQuery({
    ...campaign,
    sector: "building_trades",
    center: { lat: 48.8847, lon: 2.4046 },
    radiusMeters: 9000
  });

  assert.equal(query.includes('"craft"~"^(builder|carpenter|electrician'), true);
  assert.equal(query.includes('"shop"~"^(car|car_repair|tyres)$"'), false);
});
