import test from "node:test";
import assert from "node:assert/strict";
import {
  computeDedupeCandidates,
  mergeDuplicateProspects,
  normalizeDomain,
  normalizePhone,
  normalizeSourceRecord
} from "../src/normalize/prospect.js";

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
  assert.equal(merged[0].confidence, "high");
  assert.equal(merged[0].contactability, "good");
  assert.equal(merged[0].qualificationState, "contactable");
});

test("normalise les signaux de deduplication forts", () => {
  assert.equal(normalizePhone("01 02 03 04 05"), "+33102030405");
  assert.equal(normalizePhone("+33 1 02 03 04 05"), "+33102030405");
  assert.equal(normalizeDomain("https://www.Example.fr/contact"), "example.fr");

  const record = normalizeSourceRecord({
    source: "manual",
    sourceId: "maps/1",
    name: "Atelier Test",
    city: "Pantin",
    phone: "01 02 03 04 05",
    website: "www.example.fr",
    email: "CONTACT@EXAMPLE.FR",
    evidence: ["Verification manuelle"]
  });

  assert.deepEqual(
    computeDedupeCandidates(record).map((candidate) => candidate.type),
    ["sourceId", "phone", "domain", "email", "nameLocation"]
  );
});

test("fusionne les doublons par telephone, domaine ou email sans perdre les preuves", () => {
  const records = [
    normalizeSourceRecord({
      source: "overpass",
      sourceId: "node/1",
      name: "Garage A",
      city: "Pantin",
      phone: "01 02 03 04 05",
      evidence: ["OSM"]
    }),
    normalizeSourceRecord({
      source: "manual",
      sourceId: "manual/1",
      name: "Nom legerement different",
      city: "Pantin",
      phone: "+33 1 02 03 04 05",
      evidence: ["Verification terrain"]
    }),
    normalizeSourceRecord({
      source: "pagesjaunes-assisted",
      sourceId: "pj/1",
      name: "Garage B",
      city: "Pantin",
      website: "https://garage-b.fr",
      email: "contact@garage-b.fr",
      evidence: ["PagesJaunes"]
    }),
    normalizeSourceRecord({
      source: "manual",
      sourceId: "manual/2",
      name: "Garage B Pantin",
      city: "Pantin",
      website: "https://www.garage-b.fr/contact",
      evidence: ["Site officiel"]
    })
  ];

  const merged = mergeDuplicateProspects(records);

  assert.equal(merged.length, 2);
  assert.deepEqual(merged[0].sources, ["overpass", "manual"]);
  assert.deepEqual(merged[0].evidence, ["OSM", "Verification terrain"]);
  assert.deepEqual(merged[1].sources, ["pagesjaunes-assisted", "manual"]);
  assert.deepEqual(merged[1].evidence, ["PagesJaunes", "Site officiel"]);
});
