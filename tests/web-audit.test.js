import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { auditWebsite, buildMissingWebsiteAudit } from "../src/web-audit/auditWebsite.js";

test("audit web classe absence de site et presence tierce sans requete externe", async () => {
  const missing = buildMissingWebsiteAudit();
  assert.equal(missing.sitePresent, false);
  assert.equal(missing.webPresenceKind, "missing_official_site");

  const { audit } = await auditWebsite("https://www.facebook.com/garage-test");
  assert.equal(audit.sitePresent, false);
  assert.equal(audit.siteAccessible, true);
  assert.equal(audit.webPresenceKind, "third_party_only");
  assert.equal(audit.socialOrDirectoryOnly, true);
  assert.equal(audit.visibleSocial, true);
  assert.equal(audit.exploitableContacts[0].type, "social");
});

test("audit web extrait title, meta, viewport, contacts et cache le resultat", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "prospector-web-audit-cache-"));
  let hits = 0;
  const server = http.createServer((_req, res) => {
    hits += 1;
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html>
      <html>
        <head>
          <title>Garage Test</title>
          <meta name="description" content="Garage local a Pantin">
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body>
          <a href="/contact">Contact</a>
          <form></form>
          contact@garage-test.example
          01 02 03 04 05
          https://www.instagram.com/garage_test
        </body>
      </html>`);
  });
  await listen(server);
  try {
    const url = `http://127.0.0.1:${server.address().port}/`;
    const first = await auditWebsite(url, { cacheDir: tmp, timeoutMs: 1000 });
    const second = await auditWebsite(url, { cacheDir: tmp, timeoutMs: 1000 });

    assert.equal(first.audit.webPresenceKind, "official_site");
    assert.equal(first.audit.sitePresent, true);
    assert.equal(first.audit.siteAccessible, true);
    assert.equal(first.audit.https, false);
    assert.equal(first.audit.title, "Garage Test");
    assert.equal(first.audit.metaDescription, "Garage local a Pantin");
    assert.equal(first.audit.viewportPresent, true);
    assert.equal(first.audit.visibleEmail, true);
    assert.equal(first.audit.visiblePhone, true);
    assert.equal(first.audit.visibleSocial, true);
    assert.equal(first.audit.contactPageOrFormDetected, true);
    assert.equal(second.cacheHit, true);
    assert.equal(hits, 1);
  } finally {
    await close(server);
  }
});

test("audit web classe un site officiel non OK comme inaccessible", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(500, { "content-type": "text/html" });
    res.end("<title>Erreur</title>");
  });
  await listen(server);
  try {
    const { audit } = await auditWebsite(`http://127.0.0.1:${server.address().port}/`, {
      timeoutMs: 1000
    });
    assert.equal(audit.sitePresent, true);
    assert.equal(audit.siteAccessible, false);
    assert.equal(audit.webPresenceKind, "inaccessible");
    assert.equal(audit.httpStatus, 500);
  } finally {
    await close(server);
  }
});

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}
