import { useEffect, useMemo, useState } from "react";
import { OUTREACH_STATUSES } from "./outreachStatus.js";
import { sectorOptions } from "./sectors.js";

const SESSION_TOKEN_KEY = "prospector_session_token";
const DEFAULT_API_BASE = String(import.meta.env.VITE_PUBLIC_API_BASE || "").replace(
  /\/$/,
  ""
);

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [runLoading, setRunLoading] = useState(false);
  const [statusSaving, setStatusSaving] = useState({});
  const [sectorFilter, setSectorFilter] = useState("all");
  const [outreachStatusFilter, setOutreachStatusFilter] = useState("all");

  const api = useMemo(() => createApi(DEFAULT_API_BASE), []);
  const prospects = dashboard?.prospects || [];
  const sectors = dashboard?.filters?.sectors || sectorOptions();
  const outreachStatuses = dashboard?.filters?.outreachStatuses || OUTREACH_STATUSES;
  const filteredProspects = prospects.filter((prospect) => {
    const matchesSector = sectorFilter === "all" || prospect.sector === sectorFilter;
    const matchesOutreachStatus =
      outreachStatusFilter === "all" ||
      (prospect.outreachStatus || "A contacter") === outreachStatusFilter;
    return matchesSector && matchesOutreachStatus;
  });

  useEffect(() => {
    api("/api/auth/me")
      .then((data) => setAuthenticated(Boolean(data.authenticated)))
      .catch(() => {
        clearSessionToken();
        setAuthenticated(false);
      })
      .finally(() => setLoading(false));
  }, [api]);

  useEffect(() => {
    if (!authenticated) return;
    loadDashboard();
  }, [authenticated, api]);

  async function login(event) {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: String(form.get("username") || "").trim(),
          password: form.get("password")
        })
      });
      saveSessionToken(data.token);
      setAuthenticated(true);
      setMessage("Connexion active.");
    } catch (error) {
      setMessage(loginErrorMessage(error));
    }
  }

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // Token removal below is enough for the static dashboard.
    }
    clearSessionToken();
    setAuthenticated(false);
    setDashboard(null);
  }

  async function loadDashboard() {
    setDashboardLoading(true);
    setMessage("");
    try {
      setDashboard(await api("/api/dashboard"));
    } catch (error) {
      if (error.status === 401) {
        clearSessionToken();
        setAuthenticated(false);
        return;
      }
      setMessage(apiErrorMessage(error, "Impossible de charger le dashboard."));
    } finally {
      setDashboardLoading(false);
    }
  }

  async function runCampaign() {
    setRunLoading(true);
    setMessage("");
    try {
      const result = await api("/api/campaign/run", { method: "POST" });
      const warnings = result.collectionErrors?.length
        ? ` Sources ignorees : ${result.collectionErrors
            .map((error) => error.source)
            .join(", ")}.`
        : "";
      setMessage(`Collecte terminee : ${result.qualified} prospects qualifies.${warnings}`);
      await loadDashboard();
    } catch (error) {
      setMessage(apiErrorMessage(error, "Impossible de lancer la collecte."));
    } finally {
      setRunLoading(false);
    }
  }

  async function updateOutreachStatus(prospectId, outreachStatus) {
    const previousStatus = prospects.find((prospect) => prospect.id === prospectId)?.outreachStatus;
    setDashboard((current) => updateDashboardProspectStatus(current, prospectId, outreachStatus));
    setStatusSaving((current) => ({ ...current, [prospectId]: true }));
    setMessage("");

    try {
      await api(`/api/prospects/${prospectId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ outreachStatus })
      });
    } catch (error) {
      if (previousStatus) {
        setDashboard((current) => updateDashboardProspectStatus(current, prospectId, previousStatus));
      }
      setMessage(apiErrorMessage(error, "Impossible de modifier l'etat."));
    } finally {
      setStatusSaving((current) => {
        const next = { ...current };
        delete next[prospectId];
        return next;
      });
    }
  }

  if (loading) {
    return (
      <main className="page">
        <section className="panel">Chargement...</section>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="page">
        <form className="panel login-panel" onSubmit={login}>
          <p className="eyebrow">Acces prive</p>
          <h1>Prospector</h1>
          <label>
            Identifiant
            <input name="username" autoComplete="username" required />
          </label>
          <label>
            Mot de passe
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button type="submit">Se connecter</button>
          {message ? <p className="message">{message}</p> : null}
        </form>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1>Prospector</h1>
          <p className="muted">
            Derniere collecte : {formatDate(dashboard?.summary?.latestRunAt)}
          </p>
        </div>
        <div className="actions">
          <button onClick={loadDashboard} disabled={dashboardLoading}>
            Actualiser
          </button>
          <button onClick={runCampaign} disabled={runLoading}>
            Lancer collecte
          </button>
          <button className="secondary" onClick={logout}>
            Deconnexion
          </button>
        </div>
      </header>

      {message ? <p className="message">{message}</p> : null}

      <section className="metrics">
        <Metric label="Prospects en BDD" value={dashboard?.summary?.totalProspects ?? "-"} />
        <Metric label="Nouveaux aujourd'hui" value={dashboard?.summary?.newToday ?? "-"} />
      </section>

      <section className="content-grid">
        <article className="panel">
          <h2>Nouveaux prospects par jour</h2>
          <div className="daily-list">
            {(dashboard?.newByDay || []).map((row) => (
              <div className="daily-row" key={row.day}>
                <span>{row.day}</span>
                <strong>{row.count}</strong>
              </div>
            ))}
            {!dashboard?.newByDay?.length ? <p className="muted">Aucun historique.</p> : null}
          </div>
        </article>

        <article className="panel prospects-panel">
          <div className="section-header">
            <h2>Prospects et contacts</h2>
            <span>
              {filteredProspects.length} / {prospects.length} lignes
            </span>
          </div>
          <div className="filters">
            <label>
              Secteur
              <select
                value={sectorFilter}
                onChange={(event) => setSectorFilter(event.target.value)}
              >
                <option value="all">Tous les secteurs</option>
                {sectors.map((sector) => (
                  <option key={sector.id} value={sector.id}>
                    {sector.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Etat commercial
              <select
                value={outreachStatusFilter}
                onChange={(event) => setOutreachStatusFilter(event.target.value)}
              >
                <option value="all">Tous les etats</option>
                {outreachStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Score</th>
                  <th>Secteur</th>
                  <th>Prospect</th>
                  <th>Contacts</th>
                  <th>Sources</th>
                  <th>Etat</th>
                </tr>
              </thead>
              <tbody>
                {filteredProspects.map((prospect) => (
                  <tr key={prospect.id}>
                    <td className="score">{prospect.score}</td>
                    <td>{sectorLabel(prospect.sector, sectors)}</td>
                    <td className="prospect-cell">
                      <strong>{prospect.name}</strong>
                      <span>{[prospect.address, prospect.city].filter(Boolean).join(" - ")}</span>
                      {prospect.website ? (
                        <a className="prospect-site" href={normalizeHref(prospect.website)} target="_blank" rel="noreferrer">
                          {prospect.website}
                        </a>
                      ) : null}
                    </td>
                    <td>
                      <ContactList prospect={prospect} />
                    </td>
                    <td className="compact-text">{(prospect.sources || []).join(", ") || "-"}</td>
                    <td>
                      <select
                        className="status-select"
                        value={prospect.outreachStatus || "A contacter"}
                        disabled={Boolean(statusSaving[prospect.id])}
                        onChange={(event) =>
                          updateOutreachStatus(prospect.id, event.target.value)
                        }
                      >
                        {outreachStatuses.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filteredProspects.length ? <p className="muted empty">Aucun prospect.</p> : null}
          </div>
        </article>
      </section>
    </main>
  );
}

function Metric({ label, value }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function ContactList({ prospect }) {
  const contacts = [
    prospect.email ? { label: "Email", value: prospect.email, href: `mailto:${prospect.email}` } : null,
    prospect.phone ? { label: "Tel", value: prospect.phone, href: `tel:${prospect.phone}` } : null,
    prospect.website ? { label: "Site", value: prospect.website, href: normalizeHref(prospect.website) } : null,
    ...(prospect.social || []).map((url) => ({ label: "Social", value: url, href: url }))
  ].filter(Boolean);

  if (!contacts.length) return <span className="muted">Aucun contact</span>;
  return (
    <ul className="contacts">
      {contacts.map((contact) => (
        <li key={`${contact.label}:${contact.value}`}>
          <a href={contact.href} target="_blank" rel="noreferrer">
            {contact.label}
          </a>
          <span>{contact.value}</span>
        </li>
      ))}
    </ul>
  );
}

function updateDashboardProspectStatus(dashboard, prospectId, outreachStatus) {
  if (!dashboard) return dashboard;
  return {
    ...dashboard,
    prospects: (dashboard.prospects || []).map((prospect) =>
      prospect.id === prospectId ? { ...prospect, outreachStatus } : prospect
    )
  };
}

function sectorLabel(sectorId, sectors) {
  return sectors.find((sector) => sector.id === sectorId)?.label || sectorId || "-";
}

function normalizeHref(url) {
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function createApi(apiBase) {
  return async function api(path, options = {}) {
    const token = readSessionToken();
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;

    let response;
    try {
      response = await fetch(`${apiBase}${path}`, {
        ...options,
        credentials: "include",
        headers
      });
    } catch (error) {
      throw new ApiError("network", { cause: error });
    }

    const data = await readResponseBody(response);
    if (!response.ok) {
      throw new ApiError("http", {
        status: response.status,
        statusText: response.statusText,
        data
      });
    }
    return data;
  };
}

function saveSessionToken(token) {
  if (!token) return;
  try {
    window.localStorage.setItem(SESSION_TOKEN_KEY, token);
  } catch {
    // The HttpOnly cookie remains the fallback when localStorage is unavailable.
  }
}

function readSessionToken() {
  try {
    return window.localStorage.getItem(SESSION_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function clearSessionToken() {
  try {
    window.localStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    // Nothing to clear.
  }
}

async function readResponseBody(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return response.json();
  const text = await response.text();
  return text ? { message: text } : null;
}

function formatDate(value) {
  if (!value) return "jamais";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function loginErrorMessage(error) {
  if (error.status === 503) return "Authentification non configuree sur le serveur.";
  if (error.status === 401) return "Identifiant ou mot de passe incorrect.";
  return apiErrorMessage(error, "Connexion impossible.");
}

function apiErrorMessage(error, fallback) {
  if (error.kind === "network") {
    return "API injoignable. Verifie VITE_PUBLIC_API_BASE dans .env puis rebuild le dashboard.";
  }
  const errorCode = error.data?.error;
  if (errorCode === "internal_error") {
    return "Erreur serveur. Regarde les logs du process Prospector pour le detail.";
  }
  return errorCode || error.data?.message || fallback;
}

class ApiError extends Error {
  constructor(kind, details = {}) {
    super(kind);
    this.kind = kind;
    Object.assign(this, details);
  }
}
