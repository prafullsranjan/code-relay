'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiUrl } from '../lib/api';

type WorkspaceItem = {
  id: string;
  title: string;
  mode: 'LOCAL' | 'GHE_BOUND';
  createdAt: string;
};

const LANG_DISPLAY = [
  { label: 'HTML',       icon: 'fa-brands fa-html5',   color: '#e34f26' },
  { label: 'Python',     icon: 'fa-brands fa-python',  color: '#3776ab' },
  { label: 'JavaScript', icon: 'fa-brands fa-js',      color: '#f0db4f', bg: '#323330' },
  { label: 'Java',       icon: 'fa-brands fa-java',    color: '#f89820' },
  { label: 'PHP',        icon: 'fa-brands fa-php',     color: '#8892be' },
  { label: 'Node.js',    icon: 'fa-brands fa-node-js', color: '#68a063' },
  { label: 'Ruby',       icon: 'fa-solid fa-gem',      color: '#cc342d' },
  { label: 'C',          icon: null, color: '#03599c', abbr: 'C'    },
  { label: 'C++',        icon: null, color: '#00599c', abbr: 'C++'  },
  { label: 'C#',         icon: null, color: '#239120', abbr: 'C#'   },
  { label: 'Lua',        icon: null, color: '#000080', abbr: 'Lua'  },
  { label: 'Groovy',     icon: null, color: '#4298b8', abbr: 'G'    },
  { label: 'Assembly',   icon: 'fa-solid fa-microchip', color: '#5c6bc0' },
  { label: 'JSON',       icon: null, color: '#6b7280', abbr: '{ }' },
  { label: 'XML',        icon: null, color: '#e44d26', abbr: 'XML' },
] as const;

type GuestLangId = 'javascript' | 'python' | 'java' | 'html' | 'nodejs' | 'c' | 'cpp' | 'csharp' | 'ruby' | 'php' | 'lua' | 'groovy' | 'assembly' | 'json' | 'xml';

const HOW_STEPS = [
  { icon: 'fa-solid fa-laptop-code',  num: '1', title: 'Create Workspace',  desc: 'Set up a shared coding space in seconds, name it and choose a type.' },
  { icon: 'fa-solid fa-user-plus',    num: '2', title: 'Invite & Join',      desc: 'Share a link. Collaborators join instantly, no signups.' },
  { icon: 'fa-solid fa-code',         num: '3', title: 'Code Together',      desc: 'Every keystroke syncs live across all connected sessions.' },
  { icon: 'fa-solid fa-square-caret-right',  num: '4', title: 'Run & Share',        desc: 'Execute code, stream real-time output, and share results.' },
] as const;

const GUEST_LANGS: { id: GuestLangId; label: string }[] = [
  { id: 'javascript', label: 'JavaScript' },
  { id: 'python',     label: 'Python' },
  { id: 'java',       label: 'Java' },
  { id: 'html',       label: 'HTML' },
  { id: 'nodejs',     label: 'Node.js' },
  { id: 'c',          label: 'C' },
  { id: 'cpp',        label: 'C++' },
  { id: 'csharp',     label: 'C#' },
  { id: 'ruby',       label: 'Ruby' },
  { id: 'php',        label: 'PHP' },
  { id: 'lua',        label: 'Lua' },
  { id: 'groovy',     label: 'Groovy' },
  { id: 'assembly',   label: 'Assembly' },
  { id: 'json',       label: 'JSON' },
  { id: 'xml',        label: 'XML' },
];

export default function HomePage() {
  const [wsName, setWsName] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestLang, setGuestLang] = useState<GuestLangId>('javascript');
  const [mode, setMode] = useState<'LOCAL' | 'GHE_BOUND'>('LOCAL');
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [error, setError] = useState('');
  const [guestSession, setGuestSession] = useState<{ link: string; workspaceId: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [myWorkspaces, setMyWorkspaces] = useState<WorkspaceItem[]>([]);
  const [wsLoading, setWsLoading] = useState(true);
  const [wsExpanded, setWsExpanded] = useState(false);

  // Force home page to always render in light mode
  useEffect(() => {
    document.documentElement.classList.add('page-home');
    return () => { document.documentElement.classList.remove('page-home'); };
  }, []);

  const [wsTab, setWsTab] = useState<'all' | 'team' | 'personal' | 'guest'>('all');
  const [guestWsIds, setGuestWsIds] = useState<Set<string>>(new Set());

  // Load guest workspace IDs from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('cr-guest-ws-ids');
      if (stored) setGuestWsIds(new Set(JSON.parse(stored) as string[]));
    } catch { /* ignore */ }
  }, []);
  const [wsSearch, setWsSearch] = useState('');
  const [wsSort, setWsSort] = useState<'newest' | 'oldest' | 'az' | 'za'>('newest');
  const [wsPage, setWsPage] = useState(1);
  const [confirmEndWs, setConfirmEndWs] = useState<string | null>(null);
  const [endingWs, setEndingWs] = useState<string | null>(null);
  const router = useRouter();

  async function createWorkspace() {
    setLoading(true);
    setError('');
    const res = await fetch(apiUrl('/workspaces'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ title: wsName.trim() || 'My Workspace', mode }),
    });
    if (!res.ok) {
      setError('Could not create workspace. Please try again.');
      setLoading(false);
      return;
    }
    const data = await res.json();
    router.push(`/w/${data.id}`);
  }

  async function startGuestSession() {
    setGuestLoading(true);
    setError('');
    const wsRes = await fetch(apiUrl('/workspaces'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ title: guestName.trim() || 'Guest Session', mode: 'LOCAL' }),
    });
    if (!wsRes.ok) {
      setError('Could not start a guest session. Please try again.');
      setGuestLoading(false);
      return;
    }
    const ws = await wsRes.json();
    // Pre-select language so the workspace opens with the chosen runtime
    localStorage.setItem(`cr-lang-${ws.id}`, guestLang);
    const invRes = await fetch(apiUrl(`/workspaces/${ws.id}/invites`), {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        capabilities: { edit: true, run: true },
      }),
    });
    const invData = invRes.ok ? await invRes.json() : null;
    // Tag this workspace as a guest session in localStorage
    try {
      const existing: string[] = JSON.parse(localStorage.getItem('cr-guest-ws-ids') || '[]');
      if (!existing.includes(ws.id)) {
        const updated = [...existing, ws.id];
        localStorage.setItem('cr-guest-ws-ids', JSON.stringify(updated));
        setGuestWsIds(new Set(updated));
      }
    } catch { /* ignore */ }
    setGuestSession({
      link: invData?.url
        ? `${window.location.origin}${invData.url}`
        : `${window.location.origin}/w/${ws.id}`,
      workspaceId: ws.id,
    });
    setGuestLoading(false);
  }

  function copyLink(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  useEffect(() => {
    fetch(apiUrl('/workspaces'), { credentials: 'include' })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => { setMyWorkspaces(Array.isArray(data) ? data : []); })
      .catch(() => setMyWorkspaces([]))
      .finally(() => setWsLoading(false));
  }, []);

  async function endWorkspace(wsId: string) {
    setEndingWs(wsId);
    await fetch(apiUrl(`/workspaces/${wsId}`), {
      method: 'DELETE',
      credentials: 'include',
    });
    setMyWorkspaces((prev) => prev.filter((w) => w.id !== wsId));
    setEndingWs(null);
    setConfirmEndWs(null);
  }

  const WS_PAGE_SIZE = 5;
  const filteredWs = myWorkspaces
    .filter((w) => {
      if (wsTab === 'all')      return true;
      if (wsTab === 'team')     return w.mode === 'GHE_BOUND';
      if (wsTab === 'guest')    return w.mode === 'LOCAL' && guestWsIds.has(w.id);
      return w.mode === 'LOCAL' && !guestWsIds.has(w.id); // 'personal'
    })
    .filter((w) => w.title.toLowerCase().includes(wsSearch.toLowerCase()))
    .sort((a, b) => {
      if (wsSort === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (wsSort === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (wsSort === 'az')     return a.title.localeCompare(b.title);
      return b.title.localeCompare(a.title);
    });
  const wsTotalPages = Math.max(1, Math.ceil(filteredWs.length / WS_PAGE_SIZE));
  const wsPagedItems = filteredWs.slice((wsPage - 1) * WS_PAGE_SIZE, wsPage * WS_PAGE_SIZE);

  return (
    <div className="home-page">

      {/* ── Hero image ──────────────────────────────────────────────── */}
      <div className="home-hero-img">
        <img src="/hero.png" alt="CodeRelay — real-time collaborative coding" />
      </div>

      {/* ── How It Works ────────────────────────────────────────────── */}
      <div className="home-hiw">
        <div className="hiw-header">
          <span className="hiw-header-title">How It Works</span>
          <span className="hiw-header-line" />
        </div>
        <div className="hiw-steps">
          {HOW_STEPS.map((s) => (
            <div className="hiw-step" key={s.title}>
              <div className="hiw-step-icon-wrap">
                <i className={s.icon} />
              </div>
              <div className="hiw-step-body">
                <h3 className="hiw-step-title">{s.title}</h3>
                <p className="hiw-step-desc">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Action cards ─────────────────────────────────────────────── */}
      <div className="home-cards">

        {/* Languages card — spans full width */}
        <div className="home-card home-card-langs">
          <div className="home-card-eyebrow home-card-eyebrow-langs">
            <i className="fa-solid fa-terminal" /> Runtimes
          </div>
          <h2>Languages Supported</h2>
          <p>
            Execute code in any of the runtimes below, no environment setup, no installs.
            Output streams back to your browser in real time.
          </p>
          <div className="home-langs-grid">
            {LANG_DISPLAY.map((l) => (
              <div className="lang-chip" key={l.label} title={l.label}>
                {l.icon
                  ? <i className={l.icon} style={{ color: l.color }} />
                  : <span className="lang-chip-abbr" style={{ background: l.color }}>{(l as any).abbr}</span>}
                <span>{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Create workspace */}
        <div className="home-card">
          <div className="home-card-eyebrow">
            <i className="fa-solid fa-laptop-code" /> Create Team Workspace
          </div>
          <p>
            Create a coding workspace for your team.
          </p>
          <div className="home-form">
            <label className="home-label">
              Workspace name
              <input
                className="home-input"
                value={wsName}
                onChange={(e) => setWsName(e.target.value)}
                placeholder="e.g. Prafull's Workspace"
                onKeyDown={(e) => e.key === 'Enter' && createWorkspace()}
              />
            </label>
            <label className="home-label">
              Type
              <select
                className="home-input"
                value={mode}
                onChange={(e) => setMode(e.target.value as 'LOCAL' | 'GHE_BOUND')}
              >
                <option value="LOCAL">Personal - open sharing</option>
                <option value="GHE_BOUND">Team - organization only</option>
              </select>
            </label>
            <button className="btn-primary" onClick={createWorkspace} disabled={loading}>
              {loading
                ? <><i className="fa-solid fa-spinner fa-spin" /> Creating…</>
                : <><i className="fa-solid fa-plus" /> Create Workspace</>}
            </button>
          </div>
        </div>

        {/* Guest invite */}
        <div className="home-card home-card-guest">
          <div className="home-card-eyebrow home-card-eyebrow-guest">
            <i className="fa-solid fa-user-clock" /> Create Guest Session
          </div>
          <p>
            Start a session and get a shareable link instantly.
          </p>

          {!guestSession ? (
            <div className="home-form">
              <label className="home-label">
                Session name
                <input
                  className="home-input"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="e.g. Interview — Jane Doe"
                  onKeyDown={(e) => e.key === 'Enter' && startGuestSession()}
                />
              </label>
              <label className="home-label">
                Language
                <select
                  className="home-input"
                  value={guestLang}
                  onChange={(e) => setGuestLang(e.target.value as GuestLangId)}
                >
                  {GUEST_LANGS.map((l) => (
                    <option key={l.id} value={l.id}>{l.label}</option>
                  ))}
                </select>
              </label>
              <button className="btn-guest" onClick={startGuestSession} disabled={guestLoading}>
                {guestLoading
                  ? <><i className="fa-solid fa-spinner fa-spin" /> Setting up…</>
                  : <><i className="fa-solid fa-link" /> Create Guest Session</>}
              </button>
            </div>
          ) : (
            <div className="guest-result">
              <p className="guest-result-label">
                <i className="fa-solid fa-circle-check icon-success" /> Share this link with your guest:
              </p>
              <div className="share-row-home">
                <input readOnly className="home-input share-link-input" title="Guest session link" value={guestSession.link} />
                <button className="btn-copy" onClick={() => copyLink(guestSession.link)}>
                  {copied
                    ? <><i className="fa-solid fa-check" /> Copied!</>
                    : <><i className="fa-solid fa-copy" /> Copy</>}
                </button>
              </div>
              <a href={`/w/${guestSession.workspaceId}`} className="btn-join">
                <i className="fa-solid fa-arrow-right-to-bracket" /> Open Workspace
              </a>
              <button
                className="btn-text-link"
                onClick={() => { setGuestSession(null); setGuestName(''); setCopied(false); }}
              >
                Create another session
              </button>
            </div>
          )}
        </div>

      </div>

      {error && (
        <p className="home-error">
          <i className="fa-solid fa-triangle-exclamation" /> {error}
        </p>
      )}

      {/* ── My Workspaces (expandable) ─────────────────────────────── */}

      <div className="my-workspaces">
        <button
          className="my-ws-toggle"
          onClick={() => setWsExpanded((v) => !v)}
          aria-expanded={wsExpanded}
        >
          <i className="fa-solid fa-folder-open" />
          My Workspaces
          {!wsLoading && <span className="my-ws-count">{myWorkspaces.length}</span>}
          <i className={`fa-solid ${wsExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} my-ws-chevron`} />
        </button>

        {wsExpanded && (
          <div className="my-ws-panel">
            {wsLoading ? (
              <p className="my-ws-empty">
                <i className="fa-solid fa-spinner fa-spin" /> Loading…
              </p>
            ) : myWorkspaces.length === 0 ? (
              <p className="my-ws-empty">
                <i className="fa-regular fa-folder-open" /> No workspaces yet. Create one above.
              </p>
            ) : (
              <>
                {/* Tabs */}
                <div className="my-ws-tabs">
                  <button
                    className={`my-ws-tab${wsTab === 'all' ? ' my-ws-tab-active' : ''}`}
                    onClick={() => { setWsTab('all'); setWsPage(1); }}
                  >
                    All
                    <span className="my-ws-tab-count">{myWorkspaces.length}</span>
                  </button>
                  <button
                    className={`my-ws-tab${wsTab === 'team' ? ' my-ws-tab-active' : ''}`}
                    onClick={() => { setWsTab('team'); setWsPage(1); }}
                  >
                    <span className="my-ws-type-dot my-ws-type-dot-team" />
                    Team
                    <span className="my-ws-tab-count">{myWorkspaces.filter((w) => w.mode === 'GHE_BOUND').length}</span>
                  </button>
                  <button
                    className={`my-ws-tab${wsTab === 'personal' ? ' my-ws-tab-active' : ''}`}
                    onClick={() => { setWsTab('personal'); setWsPage(1); }}
                  >
                    <span className="my-ws-type-dot my-ws-type-dot-personal" />
                    Personal
                    <span className="my-ws-tab-count">{myWorkspaces.filter((w) => w.mode === 'LOCAL' && !guestWsIds.has(w.id)).length}</span>
                  </button>
                  <button
                    className={`my-ws-tab${wsTab === 'guest' ? ' my-ws-tab-active' : ''}`}
                    onClick={() => { setWsTab('guest'); setWsPage(1); }}
                  >
                    <span className="my-ws-type-dot my-ws-type-dot-guest" />
                    Guest
                    <span className="my-ws-tab-count">{myWorkspaces.filter((w) => w.mode === 'LOCAL' && guestWsIds.has(w.id)).length}</span>
                  </button>
                </div>

                {/* Filter + sort */}
                <div className="my-ws-filter-row">
                  <div className="my-ws-search-wrap">
                    <i className="fa-solid fa-magnifying-glass" />
                    <input
                      className="my-ws-search"
                      placeholder="Filter workspaces…"
                      value={wsSearch}
                      onChange={(e) => { setWsSearch(e.target.value); setWsPage(1); }}
                    />
                  </div>
                  <select
                    className="my-ws-sort"
                    title="Sort workspaces"
                    value={wsSort}
                    onChange={(e) => { setWsSort(e.target.value as 'newest' | 'oldest' | 'az' | 'za'); setWsPage(1); }}
                  >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="az">Name A→Z</option>
                    <option value="za">Name Z→A</option>
                  </select>
                </div>

                {/* List */}
                {wsPagedItems.length === 0 ? (
                  <p className="my-ws-empty">
                    <i className="fa-solid fa-magnifying-glass" /> No workspaces match.
                  </p>
                ) : (
                  <ul className="my-ws-list">
                    {wsPagedItems.map((ws) => {
                      const wsType = ws.mode === 'GHE_BOUND' ? 'team'
                        : guestWsIds.has(ws.id) ? 'guest' : 'personal';
                      const wsIcon = ws.mode === 'GHE_BOUND' ? 'fa-users'
                        : guestWsIds.has(ws.id) ? 'fa-user-secret' : 'fa-user';
                      const wsLabel = ws.mode === 'GHE_BOUND' ? 'Team'
                        : guestWsIds.has(ws.id) ? 'Guest' : 'Personal';
                      return (
                        <li key={ws.id} className={`my-ws-item my-ws-item-${wsType}`}>
                          <div className="my-ws-info">
                            <span className="my-ws-title">
                              <i className={`fa-solid ${wsIcon}`} />
                              {ws.title}
                            </span>
                            <span className="my-ws-meta">
                              <span className={`my-ws-type-badge my-ws-type-${wsType}`}>{wsLabel}</span>
                              {new Date(ws.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          </div>
                          <div className="my-ws-actions">
                            <button
                              className="btn-end-session"
                              title="End workspace session"
                              onClick={() => setConfirmEndWs(ws.id)}
                            >
                              <i className="fa-solid fa-power-off" /> End Session
                            </button>
                            <a href={`/w/${ws.id}`} className="btn-join-ws">
                              <i className="fa-solid fa-arrow-right-to-bracket" /> Join
                            </a>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {/* Pagination */}
                {wsTotalPages > 1 && (
                  <div className="my-ws-pagination">
                    <button
                      className="my-ws-page-btn"
                      title="Previous page"
                      onClick={() => setWsPage((p) => Math.max(1, p - 1))}
                      disabled={wsPage === 1}
                    >
                      <i className="fa-solid fa-chevron-left" />
                    </button>
                    {Array.from({ length: wsTotalPages }, (_, i) => (
                      <button
                        key={i}
                        className={`my-ws-page-btn${wsPage === i + 1 ? ' my-ws-page-active' : ''}`}
                        onClick={() => setWsPage(i + 1)}
                      >
                        {i + 1}
                      </button>
                    ))}
                    <button
                      className="my-ws-page-btn"
                      title="Next page"
                      onClick={() => setWsPage((p) => Math.min(wsTotalPages, p + 1))}
                      disabled={wsPage === wsTotalPages}
                    >
                      <i className="fa-solid fa-chevron-right" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── End Session confirm modal (same design as workspace page) ────── */}
      {confirmEndWs !== null && (
        <div className="confirm-overlay" onClick={() => setConfirmEndWs(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-dialog-icon">
              <i className="fa-solid fa-triangle-exclamation" />
            </div>
            <h3>End Workspace Session?</h3>
            <p>
              <strong>{myWorkspaces.find((w) => w.id === confirmEndWs)?.title}</strong>{' '}
              will be permanently deleted and all collaborators disconnected. This cannot be undone.
            </p>
            <div className="confirm-actions">
              <button className="btn-confirm-cancel" onClick={() => setConfirmEndWs(null)}>
                Cancel
              </button>
              <button
                className="btn-confirm-danger"
                onClick={() => { if (confirmEndWs) endWorkspace(confirmEndWs); }}
                disabled={endingWs === confirmEndWs}
              >
                {endingWs === confirmEndWs
                  ? <><i className="fa-solid fa-spinner fa-spin" /> Ending…</>
                  : <><i className="fa-solid fa-power-off" /> End Session</>}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
