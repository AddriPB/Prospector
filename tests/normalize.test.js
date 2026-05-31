import test from "node:test";
import assert from "node:assert/strict";
import { mergeDuplicateProspects, normalizeSourceRecord } from "../src/normalize/prospect.js";

test("normalise et fusionne les doublons par nom et ville", () => {
  const records = [
    normalizeSourceRecord({
      source: "overpass",
      sourceId: "node/1",
      name: "Garage Central",
      city: "Pantin",
      phone: "0102030405",
      evidence: ["OSM"]
    }),
    normalizeSourceRecord({
      source: "pagesjaunes-assisted",
      sourceId: "pj/1",
      name: "Garage Central",
      city: "Pantin",
      website: "garage-central.fr",
      evidence: ["PagesJaunes"]
    })
  ];

  const merged = mergeDuplicateProspects(records);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].phone, "0102030405");
  assert.equal(merged[0].website, "https://garage-central.fr/");
  assert.deepEqual(merged[0].sources, ["overpass", "pagesjaunes-assisted"]);
});
