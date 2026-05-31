import test from "node:test";
import assert from "node:assert/strict";
import { toCsv, toMarkdown } from "../src/exports/exportCampaign.js";

test("genere un CSV echappe et un rapport markdown", () => {
  const rows = [
    {
      score: 92,
      name: "Garage \"Central\"",
      city: "Pantin",
      address: "1 rue Test",
      website: "",
      phone: "0102030405",
      email: "contact@example.com",
      social: [],
      sources: ["overpass"],
      scoreReasons: ["Aucun site web public identifie."],
      message: "Bonjour"
    }
  ];

  const csv = toCsv(rows);
  const markdown = toMarkdown({ name: "Campagne", targetCount: 50 }, rows);

  assert.match(csv, /"Garage ""Central"""/);
  assert.match(markdown, /# Campagne/);
  assert.match(markdown, /Message propose/);
});
