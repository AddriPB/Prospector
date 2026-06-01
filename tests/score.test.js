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
