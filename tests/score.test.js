import test from "node:test";
import assert from "node:assert/strict";
import { scoreProspect } from "../src/score/scoreProspect.js";

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
