import crypto from "node:crypto";

const COOKIE_NAME = "prospector_session";

export function requireAuth(req, res, next) {
  if (verifySession(readSessionToken(req))) return next();
  res.status(401).json({ error: "unauthorized" });
}

export function loginHandler(req, res) {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");

  if (!hasAuthConfig()) {
    return res.status(503).json({ error: "auth_not_configured" });
  }

  if (!isValidLogin(username, password)) {
    return res.status(401).json({ error: "invalid_credentials" });
  }

  const token = createSessionToken();
  res.setHeader("Set-Cookie", buildCookie(req, token));
  res.json({ ok: true, token });
}

export function logoutHandler(req, res) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; HttpOnly; SameSite=${sameSite()}; Path=/; Max-Age=0${secureFlag(req)}`
  );
  res.json({ ok: true });
}

export function meHandler(req, res) {
  res.json({
    authenticated: verifySession(readSessionToken(req)),
    configured: hasAuthConfig()
  });
}

function isValidLogin(username, password) {
  return (
    timingSafe(username, process.env.PROSPECTOR_AUTH_USERNAME || "") &&
    timingSafe(password, process.env.PROSPECTOR_AUTH_PASSWORD || "")
  );
}

function hasAuthConfig() {
  return Boolean(
    process.env.PROSPECTOR_AUTH_USERNAME &&
      process.env.PROSPECTOR_AUTH_PASSWORD &&
      process.env.PROSPECTOR_AUTH_SESSION_SECRET
  );
}

function createSessionToken() {
  const expires =
    Date.now() +
    Number(process.env.PROSPECTOR_SESSION_MAX_AGE_DAYS || 30) *
      24 *
      60 *
      60 *
      1000;
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload = `${expires}.${nonce}`;
  return `${payload}.${sign(payload)}`;
}

function verifySession(token) {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [expires, nonce, sig] = parts;
  if (Number(expires) < Date.now()) return false;
  return timingSafe(sign(`${expires}.${nonce}`), sig);
}

function buildCookie(req, token) {
  const maxAge =
    Number(process.env.PROSPECTOR_SESSION_MAX_AGE_DAYS || 30) * 24 * 60 * 60;
  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=${sameSite()}; Path=/; Max-Age=${maxAge}${secureFlag(req)}`;
}

function sameSite() {
  const value = process.env.PROSPECTOR_AUTH_COOKIE_SAMESITE || "Lax";
  return ["Strict", "Lax", "None"].includes(value) ? value : "Lax";
}

function secureFlag(req) {
  if (process.env.PROSPECTOR_AUTH_COOKIE_SECURE === "true") return "; Secure";
  if (process.env.PROSPECTOR_AUTH_COOKIE_SECURE === "false") return "";
  return sameSite() === "None" || isSecureRequest(req) ? "; Secure" : "";
}

function isSecureRequest(req) {
  return (
    req.secure ||
    String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() ===
      "https"
  );
}

function sign(payload) {
  return crypto
    .createHmac("sha256", process.env.PROSPECTOR_AUTH_SESSION_SECRET || "")
    .update(payload)
    .digest("hex");
}

function readCookie(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function readBearerToken(req) {
  const authorization = String(req.headers.authorization || "");
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function readSessionToken(req) {
  return readCookie(req) || readBearerToken(req);
}

function timingSafe(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
