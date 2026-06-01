import { useEffect, useMemo, useState } from "react";
import { COMMERCIAL_SCRIPT_FIELDS } from "./commercialScripts.js";
import { OUTREACH_STATUSES } from "./outreachStatus.js";
import { REJECTION_REASONS } from "./rejectionReasons.js";
import { sectorOptions } from "./sectors.js";

const SESSION_TOKEN_KEY = "prospector_session_token";
const DEFAULT_PAGE_SIZE = 100;
const PAGE_SIZE_OPTIONS = [100, 250, 500];
const DEFAULT_API_BASE = String(import.meta.env.VITE_PUBLIC_API_BASE || "").replace(
  /\/$/,
  ""
);

function resizeTextarea(textarea) {
  if (!textarea) return;
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [prospectsPage, setProspectsPage] = useState({
    items: [],
    total: 0,
    limit: DEFAULT_PAGE_SIZE,
    offset: 0
  });
  const [prospectsLoading, setProspectsLoading] = useState(false);
  const [prospectsCache, setProspectsCache] = useState({});
  const [followUpPage, setFollowUpPage] = useState({
    items: [],
    total: 0,
    limit: DEFAULT_PAGE_SIZE,
    offset: 0
  });
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpCache, setFollowUpCache] = useState({});
  const [followUpStatusFilter, setFollowUpStatusFilter] = useState("all");
  const [followUpPageSize, setFollowUpPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [followUpPageIndex, setFollowUpPageIndex] = useState(0);
  const [followUpSaving, setFollowUpSaving] = useState({});
  const [showFollowUpNotes, setShowFollowUpNotes] = useState(true);
  const [runLoading, setRunLoading] = useState(false);
  const [statusSaving, setStatusSaving] = useState({});
  const [sectorFilter, setSectorFilter] = useState("all");
  const [outreachStatusFilter, setOutreachStatusFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("priority");
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [pageIndex, setPageIndex] = useState(0);
  const [activeTab, setActiveTab] = useState("prospects");
  const [scriptSectorId, setScriptSectorId] = useState("");
  const [scriptDraft, setScriptDraft] = useState(null);
  const [scriptSaving, setScriptSaving] = useState(false);

  const api = useMemo(() => createApi(DEFAULT_API_BASE), []);
  const prospects = prospectsPage.items || [];
  const followUpProspects = followUpPage.items || [];
  const sectors = dashboard?.filters?.sectors || sectorOptions();
  const outreachStatuses = dashboard?.filters?.outreachStatuses || OUTREACH_STATUSES;
  const rejectionReasons = dashboard?.filters?.rejectionReasons || REJECTION_REASONS;
  const commercialScripts = dashboard?.commercialScripts || [];
  const totalProspects = prospectsPage.total || 0;
  const pageCount = Math.max(1, Math.ceil(totalProspects / pageSize));
  const pageStart = totalProspects ? prospectsPage.offset + 1 : 0;
  const pageEnd = Math.min(prospectsPage.offset + prospects.length, totalProspects);
  const totalFollowUpProspects = followUpPage.total || 0;
  const followUpPageCount = Math.max(1, Math.ceil(totalFollowUpProspects / followUpPageSize));
  const followUpPageStart = totalFollowUpProspects ? followUpPage.offset + 1 : 0;
  const followUpPageEnd = Math.min(
    followUpPage.offset + followUpProspects.length,
    totalFollowUpProspects
  );

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

  useEffect(() => {
    setPageIndex(0);
  }, [sectorFilter, outreachStatusFilter, sortOrder, pageSize]);

  useEffect(() => {
    setFollowUpPageIndex(0);
  }, [followUpStatusFilter, followUpPageSize]);

  useEffect(() => {
    if (!authenticated) return;
    loadProspects();
  }, [authenticated, sectorFilter, outreachStatusFilter, sortOrder, pageSize, pageIndex]);

  useEffect(() => {
    if (!authenticated || activeTab !== "follow-up") return;
    loadFollowUpProspects();
  }, [authenticated, activeTab, followUpStatusFilter, followUpPageSize, followUpPageIndex]);

  useEffect(() => {
    if (!commercialScripts.length) return;
    const current =
      commercialScripts.find((script) => script.sectorId === scriptSectorId) ||
      commercialScripts[0];
    setScriptSectorId(current.sectorId);
    setScriptDraft(current);
  }, [commercialScripts, scriptSectorId]);

  useEffect(() => {
    if (activeTab !== "scripts") return;
    document.querySelectorAll(".script-grid textarea").forEach(resizeTextarea);
  }, [activeTab, scriptDraft]);

  useEffect(() => {
    if (activeTab !== "follow-up") return;
    document.querySelectorAll(".follow-up-notes").forEach(resizeTextarea);
  }, [activeTab, followUpProspects, showFollowUpNotes]);

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
    setProspectsPage({ items: [], total: 0, limit: DEFAULT_PAGE_SIZE, offset: 0 });
    setProspectsCache({});
    setFollowUpPage({ items: [], total: 0, limit: DEFAULT_PAGE_SIZE, offset: 0 });
    setFollowUpCache({});
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

  async function loadProspects(options = {}) {
    const requestedPageIndex = options.pageIndex ?? pageIndex;
    const offset = requestedPageIndex * pageSize;
    const params = new URLSearchParams({
      sector: sectorFilter,
      outreachStatus: outreachStatusFilter,
      sort: sortOrder,
      limit: String(pageSize),
      offset: String(offset)
    });
    const cacheKey = params.toString();

    if (!options.force && prospectsCache[cacheKey]) {
      setProspectsPage(prospectsCache[cacheKey]);
      return;
    }

    setProspectsLoading(true);
    setMessage("");
    try {
      const page = await api(`/api/prospects?${cacheKey}`);
      setProspectsPage(page);
      setProspectsCache((current) => ({ ...current, [cacheKey]: page }));
      if (page.total > 0 && offset >= page.total && requestedPageIndex > 0) {
        setPageIndex(Math.max(0, Math.ceil(page.total / pageSize) - 1));
      }
    } catch (error) {
      if (error.status === 401) {
        clearSessionToken();
        setAuthenticated(false);
        return;
      }
      setMessage(apiErrorMessage(error, "Impossible de charger les prospects."));
    } finally {
      setProspectsLoading(false);
    }
  }

  async function loadFollowUpProspects(options = {}) {
    const requestedPageIndex = options.pageIndex ?? followUpPageIndex;
    const offset = requestedPageIndex * followUpPageSize;
    const params = new URLSearchParams({
      outreachStatus: followUpStatusFilter,
      limit: String(followUpPageSize),
      offset: String(offset)
    });
    const cacheKey = params.toString();

    if (!options.force && followUpCache[cacheKey]) {
      setFollowUpPage(followUpCache[cacheKey]);
      return;
    }

    setFollowUpLoading(true);
    setMessage("");
    try {
      const page = await api(`/api/prospects/follow-up?${cacheKey}`);
      setFollowUpPage(page);
      setFollowUpCache((current) => ({ ...current, [cacheKey]: page }));
      if (page.total > 0 && offset >= page.total && requestedPageIndex > 0) {
        setFollowUpPageIndex(Math.max(0, Math.ceil(page.total / followUpPageSize) - 1));
      }
    } catch (error) {
      if (error.status === 401) {
        clearSessionToken();
        setAuthenticated(false);
        return;
      }
      setMessage(apiErrorMessage(error, "Impossible de charger le suivi."));
    } finally {
      setFollowUpLoading(false);
    }
  }

  async function refreshDashboard() {
    setProspectsCache({});
    setFollowUpCache({});
    await loadDashboard();
    await loadProspects({ force: true });
    if (activeTab === "follow-up") {
      await loadFollowUpProspects({ force: true });
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
      setProspectsCache({});
      setFollowUpCache({});
      setPageIndex(0);
      await loadProspects({ force: true, pageIndex: 0 });
      if (activeTab === "follow-up") {
        setFollowUpPageIndex(0);
        await loadFollowUpProspects({ force: true, pageIndex: 0 });
      }
    } catch (error) {
      setMessage(apiErrorMessage(error, "Impossible de lancer la collecte."));
    } finally {
      setRunLoading(false);
    }
  }

  async function updateOutreachStatus(prospectId, outreachStatus) {
    const prospect =
      prospects.find((item) => item.id === prospectId) ||
      followUpProspects.find((item) => item.id === prospectId);
    const previousStatus = prospect?.outreachStatus;
    const previousReason = prospect?.rejectionReason || "";
    const rejectionReason = outreachStatus === "Décliné" ? previousReason : "";
    if (outreachStatus === "Décliné" && !rejectionReason) {
      setMessage("Choisis un motif de rejet avant de passer le prospect en decline.");
      return;
    }
    setProspectsPage((current) =>
      updateProspectPageStatus(current, prospectId, outreachStatus, rejectionReason)
    );
    setProspectsCache((current) =>
      updateProspectsCacheStatus(current, prospectId, outreachStatus, rejectionReason)
    );
    setFollowUpPage((current) =>
      updateProspectPageStatus(current, prospectId, outreachStatus, rejectionReason)
    );
    setFollowUpCache((current) =>
      updateProspectsCacheStatus(current, prospectId, outreachStatus, rejectionReason)
    );
    setStatusSaving((current) => ({ ...current, [prospectId]: true }));
    setMessage("");

    try {
      await api(`/api/prospects/${prospectId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ outreachStatus, rejectionReason })
      });
      setFollowUpCache({});
      if (activeTab === "follow-up") {
        await loadFollowUpProspects({ force: true });
      }
    } catch (error) {
      if (previousStatus) {
        setProspectsPage((current) =>
          updateProspectPageStatus(current, prospectId, previousStatus, previousReason)
        );
        setProspectsCache((current) =>
          updateProspectsCacheStatus(current, prospectId, previousStatus, previousReason)
        );
        setFollowUpPage((current) =>
          updateProspectPageStatus(current, prospectId, previousStatus, previousReason)
        );
        setFollowUpCache((current) =>
          updateProspectsCacheStatus(current, prospectId, previousStatus, previousReason)
        );
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

  async function updateRejectionReason(prospectId, rejectionReason) {
    const prospect =
      prospects.find((item) => item.id === prospectId) ||
      followUpProspects.find((item) => item.id === prospectId);
    const previousReason = prospect?.rejectionReason || "";
    setProspectsPage((current) =>
      updateProspectPageRejectionReason(current, prospectId, rejectionReason)
    );
    setProspectsCache((current) =>
      updateProspectsCacheRejectionReason(current, prospectId, rejectionReason)
    );
    setFollowUpPage((current) =>
      updateProspectPageRejectionReason(current, prospectId, rejectionReason)
    );
    setFollowUpCache((current) =>
      updateProspectsCacheRejectionReason(current, prospectId, rejectionReason)
    );
    setStatusSaving((current) => ({ ...current, [prospectId]: true }));
    setMessage("");

    try {
      await api(`/api/prospects/${prospectId}/rejection-reason`, {
        method: "PATCH",
        body: JSON.stringify({ rejectionReason })
      });
    } catch (error) {
      setProspectsPage((current) =>
        updateProspectPageRejectionReason(current, prospectId, previousReason)
      );
      setProspectsCache((current) =>
        updateProspectsCacheRejectionReason(current, prospectId, previousReason)
      );
      setFollowUpPage((current) =>
        updateProspectPageRejectionReason(current, prospectId, previousReason)
      );
      setFollowUpCache((current) =>
        updateProspectsCacheRejectionReason(current, prospectId, previousReason)
      );
      setMessage(apiErrorMessage(error, "Impossible de modifier le motif de rejet."));
    } finally {
      setStatusSaving((current) => {
        const next = { ...current };
        delete next[prospectId];
        return next;
      });
    }
  }

  async function updateFollowUp(prospectId, updates) {
    const prospect = followUpProspects.find((item) => item.id === prospectId);
    const previous = prospect
      ? {
          lastContactedAt: prospect.lastContactedAt || "",
          followUpNotes: prospect.followUpNotes || ""
        }
      : null;
    setFollowUpPage((current) => updateProspectPageFollowUp(current, prospectId, updates));
    setFollowUpCache((current) => updateProspectsCacheFollowUp(current, prospectId, updates));
    setProspectsPage((current) => updateProspectPageFollowUp(current, prospectId, updates));
    setProspectsCache((current) => updateProspectsCacheFollowUp(current, prospectId, updates));
    setFollowUpSaving((current) => ({ ...current, [prospectId]: true }));
    setMessage("");

    try {
      const data = await api(`/api/prospects/${prospectId}/follow-up`, {
        method: "PATCH",
        body: JSON.stringify(updates)
      });
      if (data.prospect) {
        setFollowUpPage((current) =>
          updateProspectPageFollowUp(current, prospectId, {
            lastContactedAt: data.prospect.lastContactedAt || "",
            followUpNotes: data.prospect.followUpNotes || ""
          })
        );
      }
    } catch (error) {
      if (previous) {
        setFollowUpPage((current) => updateProspectPageFollowUp(current, prospectId, previous));
        setFollowUpCache((current) => updateProspectsCacheFollowUp(current, prospectId, previous));
        setProspectsPage((current) => updateProspectPageFollowUp(current, prospectId, previous));
        setProspectsCache((current) => updateProspectsCacheFollowUp(current, prospectId, previous));
      }
      setMessage(apiErrorMessage(error, "Impossible d'enregistrer le suivi."));
    } finally {
      setFollowUpSaving((current) => {
        const next = { ...current };
        delete next[prospectId];
        return next;
      });
    }
  }

  async function saveCommercialScript() {
    if (!scriptDraft?.sectorId) return;
    setScriptSaving(true);
    setMessage("");
    try {
      const data = await api(`/api/commercial-scripts/${scriptDraft.sectorId}`, {
        method: "PATCH",
        body: JSON.stringify(scriptDraft)
      });
      setDashboard((current) => ({
        ...current,
        commercialScripts: (current?.commercialScripts || []).map((script) =>
          script.sectorId === data.script.sectorId ? data.script : script
        )
      }));
      setScriptDraft(data.script);
      setMessage("Script commercial enregistre.");
    } catch (error) {
      setMessage(apiErrorMessage(error, "Impossible d'enregistrer le script commercial."));
    } finally {
      setScriptSaving(false);
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
          <button onClick={refreshDashboard} disabled={dashboardLoading || prospectsLoading}>
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

      <nav className="tabs" aria-label="Navigation dashboard">
        <button
          className={activeTab === "prospects" ? "tab active" : "tab"}
          type="button"
          onClick={() => setActiveTab("prospects")}
        >
          Prospects
        </button>
        <button
          className={activeTab === "follow-up" ? "tab active" : "tab"}
          type="button"
          onClick={() => setActiveTab("follow-up")}
        >
          Suivi
        </button>
        <button
          className={activeTab === "stats" ? "tab active" : "tab"}
          type="button"
          onClick={() => setActiveTab("stats")}
        >
          Statistiques
        </button>
        <button
          className={activeTab === "scripts" ? "tab active" : "tab"}
          type="button"
          onClick={() => setActiveTab("scripts")}
        >
          Script commercial
        </button>
      </nav>

      {activeTab === "stats" ? (
        <section className="stats-view">
          <section className="metrics">
            <Metric label="Prospects en BDD" value={dashboard?.summary?.totalProspects ?? "-"} />
            <Metric label="Nouveaux aujourd'hui" value={dashboard?.summary?.newToday ?? "-"} />
          </section>
          <article className="panel">
            <h2>Resultats quotidiens des collectes</h2>
            <div className="table-wrap">
              <table className="stats-table daily-runs-table">
                <thead>
                  <tr>
                    <th>Jour</th>
                    <th>Collectes</th>
                    <th>Bruts</th>
                    <th>Qualifies</th>
                    <th>Meilleur score</th>
                    <th>Alertes sources</th>
                  </tr>
                </thead>
                <tbody>
                  {(dashboard?.dailyRuns || []).map((row) => (
                    <tr key={row.day}>
                      <td>{formatDateOnly(row.day)}</td>
                      <td>{row.runs}</td>
                      <td>{row.collected}</td>
                      <td>{row.qualified}</td>
                      <td>{row.topScore ?? "-"}</td>
                      <td>{row.runsWithErrors || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!dashboard?.dailyRuns?.length ? <p className="muted empty">Aucun historique.</p> : null}
            </div>
          </article>
          <article className="panel">
            <h2>Dernieres collectes</h2>
            <div className="table-wrap">
              <table className="stats-table recent-runs-table">
                <thead>
                  <tr>
                    <th>Fin</th>
                    <th>Campagne</th>
                    <th>Bruts</th>
                    <th>Qualifies</th>
                    <th>Meilleur score</th>
                    <th>Sources ignorees</th>
                  </tr>
                </thead>
                <tbody>
                  {(dashboard?.recentRuns || []).map((run) => (
                    <tr key={run.id}>
                      <td>{formatDate(run.finishedAt)}</td>
                      <td>{run.campaignName}</td>
                      <td>{run.collected}</td>
                      <td>{run.qualified}</td>
                      <td>{run.topScore ?? "-"}</td>
                      <td>{formatCollectionErrors(run.collectionErrors)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!dashboard?.recentRuns?.length ? <p className="muted empty">Aucune collecte journalisee.</p> : null}
            </div>
          </article>
          <article className="panel">
            <h2>Nouveaux prospects par jour</h2>
            <div className="daily-list">
              {(dashboard?.newByDay || []).map((row) => (
                <div className="daily-row" key={row.day}>
                  <span>{formatDateOnly(row.day)}</span>
                  <strong>{row.count}</strong>
                </div>
              ))}
              {!dashboard?.newByDay?.length ? <p className="muted">Aucun historique.</p> : null}
            </div>
          </article>
          <article className="panel">
            <h2>Segmentation par commune</h2>
            <div className="table-wrap">
              <table className="stats-table">
                <thead>
                  <tr>
                    <th>Commune</th>
                    <th>Prospects</th>
                    <th>Score moyen</th>
                    <th>Contactables</th>
                    <th>Sans site</th>
                    <th>Rejetes</th>
                  </tr>
                </thead>
                <tbody>
                  {(dashboard?.citySegments || []).map((row) => (
                    <tr key={row.city}>
                      <td>{row.city}</td>
                      <td>{row.prospects}</td>
                      <td>{formatNumber(row.averageScore)}</td>
                      <td>{row.contactable}</td>
                      <td>{row.withoutSite}</td>
                      <td>{row.rejected}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!dashboard?.citySegments?.length ? <p className="muted empty">Aucune commune.</p> : null}
            </div>
          </article>
        </section>
      ) : activeTab === "scripts" ? (
        <article className="panel script-panel">
          <div className="section-header">
            <h2>Script commercial</h2>
            <button type="button" onClick={saveCommercialScript} disabled={scriptSaving || !scriptDraft}>
              Enregistrer
            </button>
          </div>
          <label className="script-sector">
            Secteur
            <select
              value={scriptSectorId}
              onChange={(event) => {
                const next = commercialScripts.find((script) => script.sectorId === event.target.value);
                setScriptSectorId(event.target.value);
                setScriptDraft(next || null);
              }}
            >
              {commercialScripts.map((script) => (
                <option key={script.sectorId} value={script.sectorId}>
                  {script.sectorLabel}
                </option>
              ))}
            </select>
          </label>
          {scriptDraft ? (
            <div className="script-grid">
              {COMMERCIAL_SCRIPT_FIELDS.map((field) => (
                <label key={field.key}>
                  {field.label}
                  <textarea
                    ref={resizeTextarea}
                    value={scriptDraft[field.key] || ""}
                    onChange={(event) => {
                      resizeTextarea(event.currentTarget);
                      setScriptDraft((current) => ({
                        ...current,
                        [field.key]: event.target.value
                      }));
                    }}
                    rows={3}
                  />
                </label>
              ))}
            </div>
          ) : (
            <p className="muted">Aucun script disponible.</p>
          )}
        </article>
      ) : activeTab === "follow-up" ? (
        <article className="panel prospects-panel follow-up-panel">
          <div className="section-header">
            <h2>Suivi commercial</h2>
            <div className="section-meta">
              {!showFollowUpNotes ? (
                <button
                  className="secondary table-toggle"
                  type="button"
                  onClick={() => setShowFollowUpNotes(true)}
                >
                  Afficher observations
                </button>
              ) : null}
              <span>
                {followUpPageStart}-{followUpPageEnd} / {totalFollowUpProspects} lignes
              </span>
            </div>
          </div>
          <div className="filters">
            <label>
              Etat commercial
              <select
                value={followUpStatusFilter}
                onChange={(event) => setFollowUpStatusFilter(event.target.value)}
              >
                <option value="all">Tous les etats</option>
                {outreachStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Lignes
              <select
                value={followUpPageSize}
                onChange={(event) => setFollowUpPageSize(Number(event.target.value))}
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size} par page
                  </option>
                ))}
              </select>
            </label>
          </div>
          <PaginationControls
            pageIndex={followUpPageIndex}
            pageCount={followUpPageCount}
            loading={followUpLoading}
            onPageChange={setFollowUpPageIndex}
          />
          <div className="table-wrap follow-up-table-wrap">
            <table className={showFollowUpNotes ? "follow-up-table" : "follow-up-table notes-hidden"}>
              <thead>
                <tr>
                  <th>Entreprise</th>
                  <th>Etat commercial</th>
                  <th>Dernier contact</th>
                  {showFollowUpNotes ? (
                    <th>
                      <span>Observations</span>
                      <button
                        className="secondary table-toggle"
                        type="button"
                        onClick={() => setShowFollowUpNotes(false)}
                      >
                        Masquer
                      </button>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {followUpProspects.map((prospect) => (
                  <tr key={prospect.id}>
                    <td className="prospect-cell">
                      <strong>{prospect.name}</strong>
                      <ProspectAddressLink prospect={prospect} />
                    </td>
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
                    <td>
                      <input
                        type="date"
                        value={prospect.lastContactedAt || ""}
                        disabled={Boolean(followUpSaving[prospect.id])}
                        onChange={(event) =>
                          updateFollowUp(prospect.id, {
                            lastContactedAt: event.target.value
                          })
                        }
                      />
                    </td>
                    {showFollowUpNotes ? (
                      <td>
                        <textarea
                          className="follow-up-notes"
                          ref={resizeTextarea}
                          value={prospect.followUpNotes || ""}
                          disabled={Boolean(followUpSaving[prospect.id])}
                          rows={1}
                          onChange={(event) => {
                            resizeTextarea(event.currentTarget);
                            setFollowUpPage((current) =>
                              updateProspectPageFollowUp(current, prospect.id, {
                                followUpNotes: event.target.value
                              })
                            );
                          }}
                          onBlur={(event) =>
                            updateFollowUp(prospect.id, {
                              followUpNotes: event.target.value
                            })
                          }
                        />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
            {!followUpProspects.length ? (
              <p className="muted empty">Aucun prospect en suivi.</p>
            ) : null}
          </div>
          <PaginationControls
            pageIndex={followUpPageIndex}
            pageCount={followUpPageCount}
            loading={followUpLoading}
            onPageChange={setFollowUpPageIndex}
          />
        </article>
      ) : (
        <article className="panel prospects-panel">
          <div className="section-header">
            <h2>Prospects et contacts</h2>
            <span>
              {pageStart}-{pageEnd} / {totalProspects} lignes
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
            <label>
              Tri
              <select
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value)}
              >
                <option value="priority">Score prioritaire</option>
                <option value="newest">Nouveaux d'abord</option>
                <option value="name">Nom A-Z</option>
              </select>
            </label>
            <label>
              Lignes
              <select
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size} par page
                  </option>
                ))}
              </select>
            </label>
          </div>
          <PaginationControls
            pageIndex={pageIndex}
            pageCount={pageCount}
            loading={prospectsLoading}
            onPageChange={setPageIndex}
          />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Score</th>
                  <th>Sous-scores</th>
                  <th>Secteur</th>
                  <th>Prospect</th>
                  <th>Contacts</th>
                  <th>Site</th>
                  <th>Doublon</th>
                  <th>Etat</th>
                  <th>Motif rejet</th>
                </tr>
              </thead>
              <tbody>
                {prospects.map((prospect) => (
                  <tr key={prospect.id}>
                    <td className="score">Score : {prospect.score}/100</td>
                    <td>
                      <ScoreBreakdown breakdown={prospect.scoreBreakdown} />
                    </td>
                    <td>{sectorLabel(prospect.sector, sectors)}</td>
                    <td className="prospect-cell">
                      <strong>{prospect.name}</strong>
                      <ProspectAddressLink prospect={prospect} />
                      {prospect.website ? (
                        <a className="prospect-site" href={normalizeHref(prospect.website)} target="_blank" rel="noreferrer">
                          {prospect.website}
                        </a>
                      ) : null}
                    </td>
                    <td>
                      <ContactList prospect={prospect} />
                    </td>
                    <td className="compact-text">
                      {prospect.website ? (
                        <a href={normalizeHref(prospect.website)} target="_blank" rel="noreferrer">
                          {prospect.website}
                        </a>
                      ) : (
                        <span className="muted">-</span>
                      )}
                    </td>
                    <td>
                      {prospect.duplicateSuspected ? (
                        <span className="duplicate-flag">Suspect #{prospect.duplicateOf}</span>
                      ) : (
                        <span className="muted">-</span>
                      )}
                    </td>
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
                    <td>
                      <select
                        className="status-select"
                        value={prospect.rejectionReason || ""}
                        disabled={Boolean(statusSaving[prospect.id])}
                        onChange={(event) =>
                          updateRejectionReason(prospect.id, event.target.value)
                        }
                      >
                        <option value="">Aucun</option>
                        {rejectionReasons.map((reason) => (
                          <option key={reason.id} value={reason.id}>
                            {reason.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!prospects.length ? <p className="muted empty">Aucun prospect.</p> : null}
          </div>
          <PaginationControls
            pageIndex={pageIndex}
            pageCount={pageCount}
            loading={prospectsLoading}
            onPageChange={setPageIndex}
          />
        </article>
      )}
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

function PaginationControls({ pageIndex, pageCount, loading, onPageChange }) {
  return (
    <nav className="pagination" aria-label="Pagination prospects">
      <button
        className="secondary"
        type="button"
        disabled={loading || pageIndex <= 0}
        onClick={() => onPageChange(0)}
      >
        Debut
      </button>
      <button
        className="secondary"
        type="button"
        disabled={loading || pageIndex <= 0}
        onClick={() => onPageChange(Math.max(0, pageIndex - 1))}
      >
        Precedent
      </button>
      <span>
        Page {pageIndex + 1} / {pageCount}
      </span>
      <button
        className="secondary"
        type="button"
        disabled={loading || pageIndex >= pageCount - 1}
        onClick={() => onPageChange(Math.min(pageCount - 1, pageIndex + 1))}
      >
        Suivant
      </button>
      <button
        className="secondary"
        type="button"
        disabled={loading || pageIndex >= pageCount - 1}
        onClick={() => onPageChange(pageCount - 1)}
      >
        Fin
      </button>
    </nav>
  );
}

function ScoreBreakdown({ breakdown }) {
  const items = [
    ["Besoin web", scorePart(breakdown, "webNeed", 35)],
    ["Potentiel commercial", scorePart(breakdown, "commercialPotential", 25)],
    ["Actionnabilite", scorePart(breakdown, "actionability", 25)]
  ];
  return (
    <ul className="score-breakdown">
      {items.map(([label, part]) => (
        <li key={label}>
          <span>{label} :</span>
          <strong>
            {part.score}/{part.max}
          </strong>
        </li>
      ))}
    </ul>
  );
}

function scorePart(breakdown, key, max) {
  const score = Math.max(0, Math.min(max, Number(breakdown?.[key]?.score) || 0));
  return { score, max: breakdown?.[key]?.max || max };
}

function ContactList({ prospect }) {
  const contacts = [
    prospect.email ? { label: "Email", value: prospect.email, href: `mailto:${prospect.email}` } : null,
    prospect.phone ? { label: "Tel", value: prospect.phone, href: `tel:${prospect.phone}` } : null,
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

function updateProspectPageStatus(page, prospectId, outreachStatus, rejectionReason = "") {
  if (!page) return page;
  return {
    ...page,
    items: (page.items || []).map((prospect) =>
      prospect.id === prospectId ? { ...prospect, outreachStatus, rejectionReason } : prospect
    )
  };
}

function updateProspectsCacheStatus(cache, prospectId, outreachStatus, rejectionReason = "") {
  return Object.fromEntries(
    Object.entries(cache).map(([key, page]) => [
      key,
      updateProspectPageStatus(page, prospectId, outreachStatus, rejectionReason)
    ])
  );
}

function updateProspectPageRejectionReason(page, prospectId, rejectionReason) {
  if (!page) return page;
  return {
    ...page,
    items: (page.items || []).map((prospect) =>
      prospect.id === prospectId ? { ...prospect, rejectionReason } : prospect
    )
  };
}

function updateProspectsCacheRejectionReason(cache, prospectId, rejectionReason) {
  return Object.fromEntries(
    Object.entries(cache).map(([key, page]) => [
      key,
      updateProspectPageRejectionReason(page, prospectId, rejectionReason)
    ])
  );
}

function updateProspectPageFollowUp(page, prospectId, updates) {
  if (!page) return page;
  return {
    ...page,
    items: (page.items || []).map((prospect) =>
      prospect.id === prospectId ? { ...prospect, ...updates } : prospect
    )
  };
}

function updateProspectsCacheFollowUp(cache, prospectId, updates) {
  return Object.fromEntries(
    Object.entries(cache).map(([key, page]) => [
      key,
      updateProspectPageFollowUp(page, prospectId, updates)
    ])
  );
}

function sectorLabel(sectorId, sectors) {
  return sectors.find((sector) => sector.id === sectorId)?.label || sectorId || "-";
}

function ProspectAddressLink({ prospect }) {
  const address = formatProspectAddress(prospect);
  if (!address) return null;

  return (
    <a
      className="prospect-address"
      href={googleMapsHref(address)}
      target="_blank"
      rel="noreferrer"
      title="Ouvrir dans Google Maps"
    >
      {address}
    </a>
  );
}

function formatProspectAddress(prospect) {
  return [prospect.address, prospect.city].filter(Boolean).join(" - ");
}

function googleMapsHref(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
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

function formatDateOnly(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

function formatNumber(value) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(Number(value) || 0);
}

function formatCollectionErrors(errors) {
  if (!errors?.length) return "-";
  return errors.map((error) => error.source || "source").join(", ");
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
