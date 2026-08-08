/**
 * The Chariot Control Panel — offline habit tracker.
 * Everything lives in localStorage; nothing ever leaves the device.
 */
(() => {
  "use strict";

  const APP_VERSION = "4.0.0";

  const KEYS = {
    logs: "chariot_logs_v1",
    legacyShield: "chariot_shield_v1",
    shield: "chariot_shield_v2",
    shieldHistory: "chariot_shield_history_v1",
    rituals: "chariot_rituals_v1",
    anchors: "chariot_anchors_v1",
    settings: "chariot_settings_v1",
    deploys: "chariot_firewall_deploys_v1",
    sessions: "chariot_firewall_sessions_v1",
    active: "chariot_active_firewall_v1"
  };

  const CLEAN_SLIP_VALUE = "None (Flawless Victory)";
  const RING_CIRCUMFERENCE = 326.726;
  const LOGS_PER_PAGE = 12;
  const MAX_STORED_SESSIONS = 200;
  const MAX_SHIELD_HISTORY_DAYS = 400;
  const MILESTONES = [3, 7, 14, 30, 60, 100, 180, 365];
  const MOOD_LABELS = ["Drained", "Foggy", "Steady", "Sharp", "Radiant"];
  const INTENSITY_LABELS = ["Ripple", "Wave", "Surge", "Tsunami"];
  const ACCENTS = [
    { id: "emerald", label: "Emerald", swatch: "#10B981" },
    { id: "violet", label: "Violet", swatch: "#8B5CF6" },
    { id: "amber", label: "Amber", swatch: "#F59E0B" },
    { id: "cyan", label: "Cyan", swatch: "#22D3EE" }
  ];
  const ACCENT_THEME_COLOR = "#0B1120";

  const BREATH_PATTERNS = {
    box: { label: "Box breathing", phases: [["Inhale", 4, "in"], ["Hold", 4, "high"], ["Exhale", 4, "out"], ["Hold", 4, "low"]] },
    calm: { label: "4-7-8 breathing", phases: [["Inhale", 4, "in"], ["Hold", 7, "high"], ["Exhale", 8, "out"]] },
    even: { label: "Coherent breathing", phases: [["Inhale", 5, "in"], ["Exhale", 5, "out"]] }
  };

  const DEFAULT_SETTINGS = {
    accent: "emerald",
    timerSeconds: 180,
    breath: "box",
    haptics: true,
    privacy: false,
    guardExit: true
  };

  const DEFAULT_RITUALS = [
    {
      id: "brahma",
      title: "Brahma Muhurta Protocol",
      detail: "Grounded consciousness in stillness before digital stimulation or checking devices."
    },
    {
      id: "intention",
      title: "Intention Activation",
      detail: "Deliberately affirming identity as an eternal spiritual soul (Atman), detached from passing chemical cravings."
    }
  ];

  const DEFAULT_ANCHORS = [
    "My energy tomorrow morning belongs to me, not to a five-minute chemical loop.",
    "Every intercept rewires the pathway. I am literally rebuilding the machine.",
    "The soul is the charioteer. The senses are horses. I hold the reins."
  ];

  const SHORT_TRIGGERS = {
    "Work/Life Stress": "Stress",
    "Fatigue/Exhaustion": "Fatigue",
    "Environmental Cue": "Env. cue",
    "Celebration/Reward": "Reward"
  };

  /* ------------------------------------------------------------------ *
   * Small helpers
   * ------------------------------------------------------------------ */

  const $ = (id) => document.getElementById(id);

  const escapeHTML = (value) => String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  const safeParse = (raw, fallback) => {
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch {
      return fallback;
    }
  };

  const read = (key, fallback) => safeParse(localStorage.getItem(key), fallback);

  const write = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      showToast("⚠️ Device storage is full — export a backup and clear old data.", { alert: true });
      return false;
    }
  };

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const dateToISO = (date) => {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
  };

  const todayISO = () => dateToISO(new Date());

  const isoToDate = (iso) => {
    const [year, month, day] = iso.split("-").map(Number);
    return new Date(year, month - 1, day);
  };

  const shiftISO = (iso, deltaDays) => {
    const date = isoToDate(iso);
    date.setDate(date.getDate() + deltaDays);
    return dateToISO(date);
  };

  const formatDisplayDate = (iso) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
    return isoToDate(iso).toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
  };

  const formatClock = (totalSeconds) => {
    const safe = Math.max(0, Math.round(totalSeconds));
    return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
  };

  const formatRelative = (timestamp) => {
    const minutes = Math.floor((Date.now() - timestamp) / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const plural = (count, singular, pluralForm) => `${count} ${count === 1 ? singular : pluralForm || `${singular}s`}`;

  const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------------ *
   * State
   * ------------------------------------------------------------------ */

  const readSettings = () => ({ ...DEFAULT_SETTINGS, ...(read(KEYS.settings, {}) || {}) });
  const writeSettings = (settings) => write(KEYS.settings, settings);

  const readRituals = () => {
    const stored = read(KEYS.rituals, null);
    if (!Array.isArray(stored) || stored.length === 0) return DEFAULT_RITUALS.map((ritual) => ({ ...ritual }));
    return stored.filter((ritual) => ritual && typeof ritual.id === "string" && typeof ritual.title === "string");
  };
  const writeRituals = (rituals) => write(KEYS.rituals, rituals);

  const readAnchors = () => {
    const stored = read(KEYS.anchors, null);
    if (!Array.isArray(stored)) return DEFAULT_ANCHORS.slice();
    return stored.filter((anchor) => typeof anchor === "string" && anchor.trim().length > 0);
  };
  const writeAnchors = (anchors) => write(KEYS.anchors, anchors);

  const readLogs = () => {
    const logs = read(KEYS.logs, []);
    return Array.isArray(logs) ? logs : [];
  };
  const writeLogs = (logs) => write(KEYS.logs, logs);

  const readShield = () => {
    const state = read(KEYS.shield, null);
    if (!state || state.date !== todayISO() || !Array.isArray(state.done)) {
      return { date: todayISO(), done: [] };
    }
    return state;
  };

  const readShieldHistory = () => {
    const history = read(KEYS.shieldHistory, {});
    return history && typeof history === "object" && !Array.isArray(history) ? history : {};
  };

  const writeShield = (doneIds) => {
    const today = todayISO();
    write(KEYS.shield, { date: today, done: doneIds });
    const history = readShieldHistory();
    history[today] = doneIds;
    const cutoff = shiftISO(today, -MAX_SHIELD_HISTORY_DAYS);
    Object.keys(history).forEach((date) => {
      if (date < cutoff) delete history[date];
    });
    write(KEYS.shieldHistory, history);
  };

  const readDeploys = () => {
    const count = parseInt(localStorage.getItem(KEYS.deploys), 10);
    return Number.isNaN(count) ? 0 : count;
  };

  const readSessions = () => {
    const sessions = read(KEYS.sessions, []);
    return Array.isArray(sessions) ? sessions : [];
  };

  const writeSessions = (sessions) => write(KEYS.sessions, sessions.slice(-MAX_STORED_SESSIONS));

  const isCleanLog = (log) => log.slipType === CLEAN_SLIP_VALUE;

  /** One-time migration from the v3 storage shape. */
  const migrate = () => {
    if (!localStorage.getItem(KEYS.rituals)) {
      writeRituals(DEFAULT_RITUALS.map((ritual) => ({ ...ritual })));
    }
    const legacy = read(KEYS.legacyShield, null);
    if (legacy && !localStorage.getItem(KEYS.shield)) {
      const done = [];
      if (legacy.brahma) done.push("brahma");
      if (legacy.intention) done.push("intention");
      write(KEYS.shield, { date: legacy.date || todayISO(), done });
      if (legacy.date) {
        const history = readShieldHistory();
        history[legacy.date] = done;
        write(KEYS.shieldHistory, history);
      }
      localStorage.removeItem(KEYS.legacyShield);
    }
  };

  /* ------------------------------------------------------------------ *
   * Element handles
   * ------------------------------------------------------------------ */

  const el = {};
  [
    "appShell", "viewport", "streakChip", "streakChipValue", "settingsButton",
    "streakRing", "streakValue", "todayGreeting", "todayDate", "milestoneLabel", "todayStatus",
    "ritualList", "shieldStatus", "addRitualButton", "manageRitualsButton",
    "quickCleanButton", "quickFirewallButton", "quickAuditButton",
    "deployFirewall", "firewallSummary", "fwTotal", "fwHeld", "fwAvg", "fwWeek",
    "anchorList", "addAnchorButton", "sessionList",
    "auditForm", "auditFormTitle", "auditDate", "slipType", "rootTrigger", "customTriggerWrap",
    "customTrigger", "reactionTime", "moodChips", "gearNotes", "auditSubmit", "cancelEditButton",
    "searchInput", "filterChips", "historyFeed", "loadMoreWrap", "loadMoreButton", "repoStats",
    "insightsEmpty", "insightsBody", "statCurrentStreak", "statBestStreak", "statSuccessRate",
    "statTopTrigger", "calPrev", "calNext", "calendarLabel", "calendarGrid", "weeklyBars",
    "triggerBars", "reactionBars", "moodSpark", "moodAverage", "ritualAdherence", "milestoneRow",
    "firewallModal", "firewallScroll", "firewallStage", "firewallAftermath", "timerDisplay",
    "timerRing", "timerComplete", "pacerOrb", "pacerLabel", "pacerCount", "pacerPattern",
    "anchorsInModal", "closeFirewall", "aftermathHold", "intensityChips", "heldButton",
    "slippedButton", "skipAftermath",
    "settingsSheet", "settingsScrim", "closeSettings", "accentChoices", "timerLength",
    "breathPattern", "hapticsToggle", "privacyToggle", "confirmCloseToggle",
    "exportRepo", "importRepo", "importInput", "clearRepo", "installWrap", "installButton", "appVersion",
    "confirmModal", "confirmTitle", "confirmMessage", "confirmAccept", "confirmCancel",
    "promptModal", "promptForm", "promptTitle", "promptLabel", "promptInput", "promptDetailWrap",
    "promptDetail", "promptDetailLabel", "promptAccept", "promptCancel",
    "toast", "toastBody", "toastText", "toastAction"
  ].forEach((id) => { el[id] = $(id); });

  /* ------------------------------------------------------------------ *
   * Session-scoped UI state
   * ------------------------------------------------------------------ */

  let settings = readSettings();
  let activeTab = "today";
  let ritualsManageMode = false;
  let visibleLogCount = LOGS_PER_PAGE;
  let searchTerm = "";
  let statusFilter = "all";
  let editingId = null;
  let selectedMood = 0;
  let selectedIntensity = 0;
  let calendarCursor = new Date();
  let pendingConfirm = null;
  let pendingPrompt = null;
  let toastTimeout = null;
  let pendingUndo = null;
  let animationFrame = null;
  let firewallStartedAt = null;
  let firewallDuration = settings.timerSeconds;
  let firewallComplete = false;
  let lastPacerPhase = -1;
  let deferredInstallPrompt = null;

  const haptic = (pattern) => {
    if (!settings.haptics) return;
    if (typeof navigator.vibrate === "function") navigator.vibrate(pattern);
  };

  /* ------------------------------------------------------------------ *
   * Overlays: toast, confirm, prompt
   * ------------------------------------------------------------------ */

  const isOpen = (node) => !node.classList.contains("hidden");

  const anyOverlayOpen = () =>
    isOpen(el.firewallModal) || isOpen(el.settingsSheet) || isOpen(el.confirmModal) || isOpen(el.promptModal);

  const syncShell = () => {
    const locked = anyOverlayOpen();
    el.appShell.inert = locked;
    document.body.classList.toggle("overlay-open", locked);
  };

  function showToast(message, options) {
    const config = options || {};
    if (toastTimeout) clearTimeout(toastTimeout);
    el.toastText.textContent = message;
    el.toastBody.className = `pop-in pointer-events-auto flex max-w-md items-center gap-3 rounded-xl border bg-surface px-5 py-3.5 text-sm font-semibold shadow-2xl shadow-black/50 ${config.alert ? "border-danger/50" : "border-accent/40"}`;
    if (config.actionLabel && typeof config.onAction === "function") {
      el.toastAction.textContent = config.actionLabel;
      el.toastAction.classList.remove("hidden");
      el.toastAction.onclick = () => {
        hideToast();
        config.onAction();
      };
    } else {
      el.toastAction.classList.add("hidden");
      el.toastAction.onclick = null;
    }
    el.toast.classList.remove("hidden");
    toastTimeout = setTimeout(hideToast, config.duration || 3200);
  }

  const hideToast = () => {
    el.toast.classList.add("hidden");
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = null;
  };

  const showConfirm = ({ title, message, acceptLabel, danger, onAccept }) => {
    el.confirmTitle.textContent = title;
    el.confirmMessage.textContent = message;
    el.confirmAccept.textContent = acceptLabel;
    el.confirmAccept.className = `btn flex-1 ${danger ? "btn-danger" : "btn-primary"}`;
    pendingConfirm = onAccept;
    el.confirmModal.classList.remove("hidden");
    syncShell();
    el.confirmCancel.focus();
  };

  const closeConfirm = () => {
    el.confirmModal.classList.add("hidden");
    pendingConfirm = null;
    syncShell();
  };

  const showPrompt = ({ title, label, value, detailLabel, detailValue, withDetail, acceptLabel, onAccept }) => {
    el.promptTitle.textContent = title;
    el.promptLabel.textContent = label;
    el.promptInput.value = value || "";
    el.promptDetailWrap.classList.toggle("hidden", !withDetail);
    el.promptDetailLabel.textContent = detailLabel || "Detail (optional)";
    el.promptDetail.value = detailValue || "";
    el.promptAccept.textContent = acceptLabel || "Save";
    pendingPrompt = onAccept;
    el.promptModal.classList.remove("hidden");
    syncShell();
    el.promptInput.focus();
    el.promptInput.select();
  };

  const closePrompt = () => {
    el.promptModal.classList.add("hidden");
    pendingPrompt = null;
    syncShell();
  };

  /* ------------------------------------------------------------------ *
   * Navigation
   * ------------------------------------------------------------------ */

  const setTab = (tab, options) => {
    activeTab = tab;
    ["today", "firewall", "log", "insights"].forEach((name) => {
      $(`view-${name}`).classList.toggle("hidden", name !== tab);
      const button = $(`tab-${name}`);
      button.setAttribute("aria-selected", String(name === tab));
    });
    if (!options || options.scroll !== false) window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };

  /* ------------------------------------------------------------------ *
   * Statistics
   * ------------------------------------------------------------------ */

  const computeStats = (logs) => {
    const dayMap = new Map();
    logs.forEach((log) => {
      const clean = isCleanLog(log);
      dayMap.set(log.date, dayMap.has(log.date) ? dayMap.get(log.date) && clean : clean);
    });

    let currentStreak = 0;
    let cursor = todayISO();
    if (!dayMap.has(cursor)) cursor = shiftISO(cursor, -1);
    while (dayMap.get(cursor) === true) {
      currentStreak += 1;
      cursor = shiftISO(cursor, -1);
    }

    let bestStreak = 0;
    let run = 0;
    let previousDate = null;
    [...dayMap.keys()].sort().forEach((date) => {
      if (!dayMap.get(date)) {
        run = 0;
      } else if (previousDate !== null && run > 0 && shiftISO(previousDate, 1) === date) {
        run += 1;
      } else {
        run = 1;
      }
      bestStreak = Math.max(bestStreak, run);
      previousDate = date;
    });

    const total = logs.length;
    const clean = logs.filter(isCleanLog).length;
    const successRate = total === 0 ? 0 : Math.round((clean / total) * 100);

    const triggerCounts = {};
    logs.filter((log) => !isCleanLog(log)).forEach((log) => {
      const key = log.trigger || "Unspecified";
      triggerCounts[key] = (triggerCounts[key] || 0) + 1;
    });
    const rankedTriggers = Object.entries(triggerCounts).sort((a, b) => b[1] - a[1]);

    return {
      dayMap,
      currentStreak,
      bestStreak,
      successRate,
      total,
      clean,
      rankedTriggers,
      topTrigger: rankedTriggers.length > 0 ? rankedTriggers[0][0] : null
    };
  };

  const nextMilestone = (streak) => MILESTONES.find((milestone) => milestone > streak) || null;

  /* ------------------------------------------------------------------ *
   * Today view
   * ------------------------------------------------------------------ */

  const greetingFor = (hour) => {
    if (hour < 5) return "Still awake, observer";
    if (hour < 12) return "Good morning, charioteer";
    if (hour < 17) return "Steady on, charioteer";
    if (hour < 22) return "Good evening, observer";
    return "Winding down, observer";
  };

  const renderRituals = () => {
    const rituals = readRituals();
    const done = new Set(readShield().done);

    if (rituals.length === 0) {
      el.ritualList.innerHTML = `<p class="rounded-xl border border-dashed border-line py-6 text-center text-sm text-silver">No rituals yet. Add the first protocol you want to run every morning.</p>`;
    } else {
      el.ritualList.innerHTML = rituals.map((ritual) => {
        const checked = done.has(ritual.id) ? " checked" : "";
        const manageButtons = ritualsManageMode
          ? `<div class="flex shrink-0 flex-col gap-2">
               <button type="button" class="icon-btn h-9 w-9" data-edit-ritual="${escapeHTML(ritual.id)}" aria-label="Rename ${escapeHTML(ritual.title)}">✎</button>
               <button type="button" class="icon-btn h-9 w-9 border-danger/40 text-danger" data-delete-ritual="${escapeHTML(ritual.id)}" aria-label="Remove ${escapeHTML(ritual.title)}">✕</button>
             </div>`
          : "";
        const detail = ritual.detail
          ? `<span class="mt-1 block text-xs leading-relaxed text-silver sm:text-sm">${escapeHTML(ritual.detail)}</span>`
          : "";
        return `<div class="flex items-stretch gap-2">
          <label class="relative block flex-1 cursor-pointer">
            <input type="checkbox" class="check-input" data-ritual="${escapeHTML(ritual.id)}"${checked}>
            <div class="check-row h-full">
              <span class="check-box">
                <svg class="check-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </span>
              <span>
                <span class="check-title block text-sm font-semibold text-snow transition-colors sm:text-base">${escapeHTML(ritual.title)}</span>
                ${detail}
              </span>
            </div>
          </label>
          ${manageButtons}
        </div>`;
      }).join("");
    }

    const armed = rituals.filter((ritual) => done.has(ritual.id)).length;
    const fullyArmed = rituals.length > 0 && armed === rituals.length;
    el.shieldStatus.className = fullyArmed ? "chip chip-accent" : "chip";
    el.shieldStatus.textContent = fullyArmed ? "Shield fully armed" : `${armed} / ${rituals.length} armed`;
    el.manageRitualsButton.textContent = ritualsManageMode ? "Done" : "Manage";
  };

  const renderToday = () => {
    const now = new Date();
    const logs = readLogs();
    const stats = computeStats(logs);

    el.todayGreeting.textContent = greetingFor(now.getHours());
    el.todayDate.textContent = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    el.streakValue.textContent = String(stats.currentStreak);

    const target = nextMilestone(stats.currentStreak);
    const progress = target ? Math.min(1, stats.currentStreak / target) : 1;
    el.streakRing.setAttribute("stroke-dashoffset", String(RING_CIRCUMFERENCE * (1 - progress)));
    el.milestoneLabel.textContent = target
      ? `${plural(target - stats.currentStreak, "day")} to the ${target}-day milestone`
      : "Every milestone cleared. Keep the reins.";

    const todaysLog = logs.find((log) => log.date === todayISO());
    if (todaysLog) {
      const clean = isCleanLog(todaysLog);
      el.todayStatus.innerHTML = `<span class="chip ${clean ? "chip-accent" : "chip-danger"}">${clean ? "Clean day logged" : escapeHTML(todaysLog.slipType)}</span>
        <button type="button" class="btn btn-ghost btn-sm ml-auto shrink-0" data-edit-log="${escapeHTML(todaysLog.id)}">Edit</button>
        <p class="w-full text-xs text-silver">Tonight's audit is already mounted.</p>`;
    } else {
      el.todayStatus.innerHTML = `<span class="chip">Audit pending</span>
        <button type="button" class="btn btn-primary btn-sm ml-auto shrink-0" data-goto="log">Log now</button>
        <p class="w-full text-xs text-silver">No observation logged for today yet.</p>`;
    }

    renderRituals();
  };

  const renderStreakChip = () => {
    const stats = computeStats(readLogs());
    el.streakChipValue.textContent = `${stats.currentStreak}d`;
  };

  /* ------------------------------------------------------------------ *
   * Firewall
   * ------------------------------------------------------------------ */

  const renderAnchors = () => {
    const anchors = readAnchors();
    if (anchors.length === 0) {
      el.anchorList.innerHTML = `<p class="rounded-xl border border-dashed border-line py-6 text-center text-sm text-silver">No anchors yet. Write down the reasons that survive the urge.</p>`;
    } else {
      el.anchorList.innerHTML = anchors.map((anchor, index) => `<div class="flex items-start gap-3 rounded-xl border border-line/70 bg-canvas/60 p-4">
        <span class="mt-0.5 text-accent">⚓</span>
        <p class="flex-1 text-sm leading-relaxed text-slate-300">${escapeHTML(anchor)}</p>
        <button type="button" class="icon-btn h-8 w-8 shrink-0 border-danger/40 text-danger" data-delete-anchor="${index}" aria-label="Remove anchor">✕</button>
      </div>`).join("");
    }

    el.anchorsInModal.innerHTML = anchors.length === 0
      ? ""
      : `<div class="glass-card space-y-3 rounded-2xl border border-accent/25 p-6 sm:p-8">
          <p class="eyebrow text-accent">Your own words</p>
          ${anchors.map((anchor) => `<p class="text-sm leading-relaxed text-snow sm:text-base">⚓ ${escapeHTML(anchor)}</p>`).join("")}
        </div>`;
  };

  const renderFirewallStats = () => {
    const deploys = readDeploys();
    const sessions = readSessions();

    el.fwTotal.textContent = String(deploys);

    const rated = sessions.filter((session) => typeof session.held === "boolean");
    const heldRate = rated.length === 0 ? 0 : Math.round((rated.filter((session) => session.held).length / rated.length) * 100);
    el.fwHeld.innerHTML = `${heldRate}<span class="ml-0.5 text-xs font-bold text-muted">%</span>`;

    const averageHold = sessions.length === 0
      ? 0
      : sessions.reduce((sum, session) => sum + (session.heldSeconds || 0), 0) / sessions.length;
    el.fwAvg.textContent = formatClock(averageHold);

    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    el.fwWeek.textContent = String(sessions.filter((session) => session.at >= weekAgo).length);

    if (deploys === 0) {
      el.firewallSummary.textContent = "No emergency deployments recorded yet.";
    } else {
      const last = sessions[sessions.length - 1];
      el.firewallSummary.textContent = `Deployed ${plural(deploys, "time")} — every deployment is a victory of awareness.${last ? ` Last intercept ${formatRelative(last.at)}.` : ""}`;
    }

    if (sessions.length === 0) {
      el.sessionList.innerHTML = `<p class="py-4 text-center text-sm text-silver">Intercepts you run will be logged here with hold time and outcome.</p>`;
      return;
    }
    el.sessionList.innerHTML = sessions.slice(-8).reverse().map((session) => {
      const outcome = session.held === true
        ? `<span class="chip chip-accent">Held</span>`
        : session.held === false
          ? `<span class="chip chip-danger">Slipped</span>`
          : `<span class="chip">Unlogged</span>`;
      const intensity = session.intensity ? `<span class="chip">${escapeHTML(INTENSITY_LABELS[session.intensity - 1] || "")}</span>` : "";
      return `<div class="flex flex-wrap items-center gap-2 rounded-xl border border-line/70 bg-canvas/60 px-4 py-3">
        <span class="font-display text-sm font-bold text-snow">${formatClock(session.heldSeconds || 0)}</span>
        <span class="min-w-0 flex-1 truncate text-xs text-silver">${escapeHTML(formatRelative(session.at))}${session.completed ? " · full hold" : ""}</span>
        ${intensity}
        ${outcome}
      </div>`;
    }).join("");
  };

  const pacerScaleFor = (kind, progress) => {
    if (prefersReducedMotion()) return 1;
    if (kind === "in") return 0.55 + 0.45 * progress;
    if (kind === "out") return 1 - 0.45 * progress;
    return kind === "low" ? 0.55 : 1;
  };

  const updatePacer = (elapsedMs) => {
    const pattern = BREATH_PATTERNS[settings.breath] || BREATH_PATTERNS.box;
    const cycleSeconds = pattern.phases.reduce((sum, phase) => sum + phase[1], 0);
    let offset = (elapsedMs / 1000) % cycleSeconds;
    let index = 0;
    while (index < pattern.phases.length && offset >= pattern.phases[index][1]) {
      offset -= pattern.phases[index][1];
      index += 1;
    }
    const [label, seconds, kind] = pattern.phases[Math.min(index, pattern.phases.length - 1)];
    el.pacerLabel.textContent = label;
    el.pacerCount.textContent = String(Math.max(1, Math.ceil(seconds - offset)));
    el.pacerOrb.style.transform = `scale(${pacerScaleFor(kind, offset / seconds).toFixed(3)})`;
    if (index !== lastPacerPhase) {
      lastPacerPhase = index;
      haptic(18);
    }
  };

  const updateTimer = (elapsedMs) => {
    const remaining = Math.max(0, Math.ceil((firewallDuration * 1000 - elapsedMs) / 1000));
    el.timerDisplay.textContent = formatClock(remaining);
    const progress = firewallDuration === 0 ? 0 : remaining / firewallDuration;
    el.timerRing.setAttribute("stroke-dashoffset", String(RING_CIRCUMFERENCE * (1 - progress)));
    el.timerRing.setAttribute("stroke", remaining <= 30 && remaining > 0 ? "#EF4444" : "rgb(var(--accent))");
    if (remaining <= 0 && !firewallComplete) {
      firewallComplete = true;
      el.timerComplete.classList.remove("hidden");
      haptic([60, 40, 60]);
    }
  };

  const runFirewallLoop = () => {
    if (firewallStartedAt === null) return;
    const elapsed = Date.now() - firewallStartedAt;
    updateTimer(elapsed);
    updatePacer(elapsed);
    animationFrame = requestAnimationFrame(runFirewallLoop);
  };

  const stopFirewallLoop = () => {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null;
  };

  const openFirewall = (resumeFrom) => {
    const resuming = typeof resumeFrom === "number";
    firewallDuration = settings.timerSeconds;
    firewallStartedAt = resuming ? resumeFrom : Date.now();
    firewallComplete = false;
    lastPacerPhase = -1;

    if (!resuming) {
      localStorage.setItem(KEYS.deploys, String(readDeploys() + 1));
      write(KEYS.active, { startedAt: firewallStartedAt, duration: firewallDuration });
      haptic([30, 30, 30]);
    }

    el.pacerPattern.textContent = (BREATH_PATTERNS[settings.breath] || BREATH_PATTERNS.box).label;
    el.timerComplete.classList.add("hidden");
    el.firewallStage.classList.remove("hidden");
    el.firewallAftermath.classList.add("hidden");
    el.firewallModal.classList.remove("hidden");
    el.firewallScroll.scrollTop = 0;
    syncShell();
    renderFirewallStats();
    runFirewallLoop();
    el.closeFirewall.focus({ preventScroll: true });
  };

  const enterAftermath = () => {
    const heldSeconds = firewallStartedAt ? Math.round((Date.now() - firewallStartedAt) / 1000) : 0;
    stopFirewallLoop();
    selectedIntensity = 0;
    renderIntensityChips();
    el.aftermathHold.textContent = firewallComplete
      ? `You held the full ${formatClock(firewallDuration)}. The wave broke against you.`
      : `You held for ${formatClock(heldSeconds)}.`;
    el.firewallStage.classList.add("hidden");
    el.firewallAftermath.classList.remove("hidden");
    el.firewallScroll.scrollTop = 0;
    el.heldButton.focus({ preventScroll: true });
  };

  const finishFirewall = (held) => {
    const heldSeconds = firewallStartedAt ? Math.round((Date.now() - firewallStartedAt) / 1000) : 0;
    const sessions = readSessions();
    sessions.push({
      at: Date.now(),
      heldSeconds,
      completed: firewallComplete,
      intensity: selectedIntensity || null,
      held: typeof held === "boolean" ? held : null
    });
    writeSessions(sessions);
    localStorage.removeItem(KEYS.active);

    stopFirewallLoop();
    firewallStartedAt = null;
    el.firewallModal.classList.add("hidden");
    el.firewallAftermath.classList.add("hidden");
    el.firewallStage.classList.remove("hidden");
    syncShell();
    refreshAll();
    el.deployFirewall.focus();

    if (held === false) {
      setTab("log");
      startEntryForDate(todayISO());
      el.slipType.value = "Smoking";
      showToast("📉 Logged as data, not as failure. Fill in the audit.", { alert: true });
    } else if (held === true) {
      showToast(`⚔️ You held the line for ${formatClock(heldSeconds)}.`);
    } else {
      showToast("🧘 Mind restored.");
    }
  };

  const requestCloseFirewall = () => {
    if (settings.guardExit && !firewallComplete) {
      showConfirm({
        title: "Leave the intercept early?",
        message: "The timer has not finished. The wave usually peaks and falls within three minutes — staying is the whole technique.",
        acceptLabel: "Leave anyway",
        danger: true,
        onAccept: enterAftermath
      });
      return;
    }
    enterAftermath();
  };

  const renderIntensityChips = () => {
    el.intensityChips.innerHTML = INTENSITY_LABELS.map((label, index) =>
      `<button type="button" class="seg" data-intensity="${index + 1}" aria-pressed="${selectedIntensity === index + 1}">${label}</button>`
    ).join("");
  };

  const resumeFirewallIfActive = () => {
    const active = read(KEYS.active, null);
    if (!active || typeof active.startedAt !== "number") return;
    const elapsed = Date.now() - active.startedAt;
    if (elapsed < 0 || elapsed > (active.duration || settings.timerSeconds) * 1000) {
      localStorage.removeItem(KEYS.active);
      return;
    }
    openFirewall(active.startedAt);
    showToast("⏱️ Intercept resumed where you left it.");
  };

  /* ------------------------------------------------------------------ *
   * Log view
   * ------------------------------------------------------------------ */

  const renderMoodChips = () => {
    el.moodChips.innerHTML = MOOD_LABELS.map((label, index) =>
      `<button type="button" class="seg px-1 py-2 text-[0.62rem]" data-mood="${index + 1}" aria-pressed="${selectedMood === index + 1}">${label}</button>`
    ).join("");
  };

  const renderFilterChips = () => {
    const filters = [["all", "All"], ["clean", "Clean days"], ["slip", "Slips"]];
    el.filterChips.innerHTML = filters.map(([value, label]) =>
      `<button type="button" class="seg" data-filter="${value}" aria-pressed="${statusFilter === value}">${label}</button>`
    ).join("");
  };

  const sortedLogs = () => readLogs().slice().sort((a, b) => {
    if (a.date === b.date) return (b.createdAt || 0) - (a.createdAt || 0);
    return a.date < b.date ? 1 : -1;
  });

  const matchesFilters = (log) => {
    if (statusFilter === "clean" && !isCleanLog(log)) return false;
    if (statusFilter === "slip" && isCleanLog(log)) return false;
    if (!searchTerm) return true;
    const haystack = `${log.date} ${formatDisplayDate(log.date)} ${log.slipType} ${log.trigger} ${log.reaction} ${log.notes || ""}`.toLowerCase();
    return haystack.includes(searchTerm);
  };

  const buildLogCard = (log) => {
    const clean = isCleanLog(log);
    const badge = clean ? "chip chip-accent" : "chip chip-danger";
    const edge = clean ? "bg-accent" : "bg-danger";
    const privacy = settings.privacy ? " blur-private" : "";
    const shieldChip = typeof log.shield === "number"
      ? `<span class="chip ${log.shieldTotal && log.shield === log.shieldTotal ? "chip-accent" : ""}">🛡 ${log.shield}/${log.shieldTotal || 2}</span>`
      : "";
    const moodChip = log.mood
      ? `<span class="chip">${escapeHTML(MOOD_LABELS[log.mood - 1] || "")}</span>`
      : "";
    const notes = log.notes
      ? `<div class="mt-3 border-t border-line/60 pt-3${privacy}">
           <p class="eyebrow mb-1">Gear adjustment</p>
           <p class="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">${escapeHTML(log.notes)}</p>
         </div>`
      : "";
    return `<article class="relative overflow-hidden rounded-xl border border-line/70 bg-canvas/60">
      <div class="absolute inset-y-0 left-0 w-1 ${edge}"></div>
      <div class="p-4 pl-5 sm:p-5 sm:pl-6">
        <div class="mb-2 flex items-center justify-between gap-2">
          <h3 class="min-w-0 truncate font-display text-sm font-bold text-snow sm:text-base">${escapeHTML(formatDisplayDate(log.date))}</h3>
          <div class="flex shrink-0 items-center gap-2">
            <button type="button" class="icon-btn h-8 w-8" data-edit-log="${escapeHTML(log.id)}" aria-label="Edit entry for ${escapeHTML(formatDisplayDate(log.date))}">✎</button>
            <button type="button" class="icon-btn h-8 w-8 border-danger/40 text-danger" data-delete-log="${escapeHTML(log.id)}" aria-label="Delete entry for ${escapeHTML(formatDisplayDate(log.date))}">✕</button>
          </div>
        </div>
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <span class="${badge}${privacy}">${escapeHTML(log.slipType)}</span>
          ${shieldChip}${moodChip}
        </div>
        <div class="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div class="flex items-baseline gap-2"><span class="eyebrow shrink-0">Trigger</span><span class="text-slate-300">${escapeHTML(log.trigger)}</span></div>
          <div class="flex items-baseline gap-2"><span class="eyebrow shrink-0">Reaction</span><span class="text-slate-300">${escapeHTML(log.reaction)}</span></div>
        </div>
        ${notes}
      </div>
    </article>`;
  };

  const renderLogList = () => {
    const logs = sortedLogs();
    const stats = computeStats(logs);
    el.repoStats.textContent = stats.total === 0 ? "Repository empty" : `${stats.clean} clean / ${stats.total} logged`;

    if (logs.length === 0) {
      el.historyFeed.innerHTML = `<div class="space-y-3 py-10 text-center">
        <div class="text-4xl">📭</div>
        <p class="text-sm text-silver">The repository is empty. Complete tonight's audit to mount your first data card.</p>
      </div>`;
      el.loadMoreWrap.classList.add("hidden");
      return;
    }

    const filtered = logs.filter(matchesFilters);
    if (filtered.length === 0) {
      el.historyFeed.innerHTML = `<p class="py-10 text-center text-sm text-silver">No entries match this search or filter.</p>`;
      el.loadMoreWrap.classList.add("hidden");
      return;
    }

    const visible = filtered.slice(0, visibleLogCount);
    el.historyFeed.innerHTML = visible.map(buildLogCard).join("");

    const remaining = filtered.length - visible.length;
    if (remaining > 0) {
      el.loadMoreWrap.classList.remove("hidden");
      el.loadMoreButton.textContent = `Reveal ${Math.min(LOGS_PER_PAGE, remaining)} older (${remaining} archived)`;
    } else {
      el.loadMoreWrap.classList.add("hidden");
    }
  };

  const setTriggerValue = (value) => {
    const known = [...el.rootTrigger.options].some((option) => option.value === value);
    if (known && value !== "__custom__") {
      el.rootTrigger.value = value;
      el.customTriggerWrap.classList.add("hidden");
      el.customTrigger.value = "";
    } else {
      el.rootTrigger.value = "__custom__";
      el.customTriggerWrap.classList.remove("hidden");
      el.customTrigger.value = value === "__custom__" ? "" : value;
    }
  };

  const resetAuditForm = () => {
    editingId = null;
    selectedMood = 0;
    el.auditForm.reset();
    el.auditDate.value = todayISO();
    el.auditDate.max = todayISO();
    el.customTriggerWrap.classList.add("hidden");
    el.auditFormTitle.textContent = "🔭 Nightly Scientist Audit";
    el.auditSubmit.textContent = "📡 Log observation";
    el.cancelEditButton.classList.add("hidden");
    renderMoodChips();
  };

  const startEntryForDate = (iso) => {
    resetAuditForm();
    el.auditDate.value = iso;
    el.auditDate.focus();
  };

  const startEditing = (id) => {
    const log = readLogs().find((entry) => entry.id === id);
    if (!log) return;
    editingId = id;
    el.auditDate.value = log.date;
    el.slipType.value = log.slipType;
    setTriggerValue(log.trigger);
    el.reactionTime.value = log.reaction;
    el.gearNotes.value = log.notes || "";
    selectedMood = log.mood || 0;
    renderMoodChips();
    el.auditFormTitle.textContent = "✎ Editing observation";
    el.auditSubmit.textContent = "💾 Update observation";
    el.cancelEditButton.classList.remove("hidden");
    setTab("log", { scroll: false });
    el.auditForm.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  };

  const currentTriggerValue = () => {
    if (el.rootTrigger.value !== "__custom__") return el.rootTrigger.value;
    return el.customTrigger.value.trim() || "Unspecified";
  };

  const handleAuditSubmit = (event) => {
    event.preventDefault();
    const today = todayISO();
    el.auditDate.max = today;

    if (!el.auditDate.value) {
      showToast("⚠️ Select an observation date first.", { alert: true });
      el.auditDate.focus();
      return;
    }
    if (el.auditDate.value > today) {
      showToast("⚠️ The scientist records the past, not the future.", { alert: true });
      el.auditDate.focus();
      return;
    }

    const shield = readShield();
    const rituals = readRituals();
    const entry = {
      id: editingId || uid(),
      date: el.auditDate.value,
      slipType: el.slipType.value,
      trigger: currentTriggerValue(),
      reaction: el.reactionTime.value,
      notes: el.gearNotes.value.trim(),
      mood: selectedMood || undefined,
      shield: rituals.filter((ritual) => shield.done.includes(ritual.id)).length,
      shieldTotal: rituals.length,
      createdAt: Date.now()
    };

    const logs = readLogs();
    if (editingId) {
      const index = logs.findIndex((log) => log.id === editingId);
      const existing = logs[index];
      if (existing) {
        entry.shield = typeof existing.shield === "number" && existing.date !== today ? existing.shield : entry.shield;
        entry.shieldTotal = existing.shieldTotal || entry.shieldTotal;
        entry.createdAt = existing.createdAt || entry.createdAt;
      }
      const collision = logs.findIndex((log) => log.date === entry.date && log.id !== editingId);
      const commit = () => {
        const next = logs.filter((log) => log.id !== editingId && !(collision >= 0 && log.date === entry.date));
        next.push(entry);
        writeLogs(next);
        resetAuditForm();
        refreshAll();
        showToast("💾 Observation updated.");
      };
      if (collision >= 0) {
        showConfirm({
          title: "Replace the other entry?",
          message: `Another audit already exists for ${formatDisplayDate(entry.date)}. Moving this entry there will replace it.`,
          acceptLabel: "Replace it",
          danger: true,
          onAccept: commit
        });
      } else {
        commit();
      }
      return;
    }

    const existingIndex = logs.findIndex((log) => log.date === entry.date);
    const commit = () => {
      if (existingIndex >= 0) logs[existingIndex] = entry;
      else logs.push(entry);
      writeLogs(logs);
      const streakAfterWrite = computeStats(readLogs()).currentStreak;
      resetAuditForm();
      refreshAll();
      haptic(30);
      showToast(isCleanLog(entry) ? "✅ Flawless victory mounted to the repository." : "📡 Data logged. The gears adjust tomorrow.");
      celebrateMilestone(streakAfterWrite);
    };

    if (existingIndex >= 0) {
      showConfirm({
        title: "Overwrite existing audit?",
        message: `An audit for ${formatDisplayDate(entry.date)} is already mounted. The repository keeps one record per day.`,
        acceptLabel: "Replace entry",
        danger: false,
        onAccept: commit
      });
    } else {
      commit();
    }
  };

  const celebrateMilestone = (streakAfterWrite) => {
    if (MILESTONES.includes(streakAfterWrite)) {
      haptic([80, 50, 80, 50, 120]);
      showToast(`🏆 ${streakAfterWrite}-day milestone reached. The machine is rebuilt one gear at a time.`, { duration: 5000 });
    }
  };

  const deleteLog = (id) => {
    const logs = readLogs();
    const entry = logs.find((log) => log.id === id);
    if (!entry) return;
    writeLogs(logs.filter((log) => log.id !== id));
    if (editingId === id) resetAuditForm();
    refreshAll();
    pendingUndo = entry;
    showToast("🗑️ Entry removed.", {
      alert: true,
      duration: 6000,
      actionLabel: "Undo",
      onAction: () => {
        const current = readLogs();
        if (!current.some((log) => log.id === pendingUndo.id)) {
          current.push(pendingUndo);
          writeLogs(current);
          refreshAll();
          showToast("↩️ Entry restored.");
        }
        pendingUndo = null;
      }
    });
  };

  const logCleanDayNow = () => {
    const today = todayISO();
    const logs = readLogs();
    const shield = readShield();
    const rituals = readRituals();
    const entry = {
      id: uid(),
      date: today,
      slipType: CLEAN_SLIP_VALUE,
      trigger: "None",
      reaction: "Defended Successfully",
      notes: "",
      shield: rituals.filter((ritual) => shield.done.includes(ritual.id)).length,
      shieldTotal: rituals.length,
      createdAt: Date.now()
    };
    const existingIndex = logs.findIndex((log) => log.date === today);
    const commit = () => {
      if (existingIndex >= 0) logs[existingIndex] = { ...logs[existingIndex], ...entry, id: logs[existingIndex].id };
      else logs.push(entry);
      writeLogs(logs);
      refreshAll();
      haptic(30);
      showToast("✅ Clean day mounted. Add detail any time from the Log tab.");
      celebrateMilestone(computeStats(readLogs()).currentStreak);
    };
    if (existingIndex >= 0) {
      showConfirm({
        title: "Today is already logged",
        message: "Replace today's entry with a clean-day record? Your notes for today will be kept.",
        acceptLabel: "Mark clean",
        danger: false,
        onAccept: commit
      });
    } else {
      commit();
    }
  };

  /* ------------------------------------------------------------------ *
   * Insights
   * ------------------------------------------------------------------ */

  const renderBars = (container, rows, options) => {
    const config = options || {};
    if (rows.length === 0) {
      container.innerHTML = `<p class="py-3 text-center text-sm text-silver">${escapeHTML(config.empty || "Not enough data yet.")}</p>`;
      return;
    }
    const max = Math.max(...rows.map((row) => row.value), 1);
    container.innerHTML = rows.map((row) => `<div>
      <div class="mb-1.5 flex items-baseline justify-between gap-3">
        <span class="min-w-0 truncate text-xs font-semibold text-slate-300">${escapeHTML(row.label)}</span>
        <span class="shrink-0 text-xs font-bold text-silver">${escapeHTML(row.display || String(row.value))}</span>
      </div>
      <div class="bar-track"><div class="bar-fill ${config.danger ? "bg-danger" : ""}" style="width:${Math.round((row.value / max) * 100)}%"></div></div>
    </div>`).join("");
  };

  const renderCalendar = (dayMap) => {
    const cursor = calendarCursor || new Date();
    calendarCursor = cursor;
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = todayISO();

    el.calendarLabel.textContent = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });

    const cells = [];
    for (let blank = 0; blank < first.getDay(); blank++) cells.push(`<div></div>`);
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = dateToISO(new Date(year, month, day));
      const hasData = dayMap.has(iso);
      const clean = dayMap.get(iso) === true;
      const tone = !hasData ? "bg-elevated text-silver" : clean ? "bg-accent text-canvas" : "bg-danger text-snow";
      const ring = iso === today ? " ring-2 ring-accent/80" : "";
      const future = iso > today ? " opacity-40" : "";
      const status = !hasData ? "No data" : clean ? "Clean" : "Slip";
      cells.push(`<button type="button" data-day="${iso}" class="aspect-square rounded-md text-[0.62rem] font-bold ${tone}${ring}${future} transition hover:brightness-125" aria-label="${escapeHTML(formatDisplayDate(iso))}: ${status}">${day}</button>`);
    }
    el.calendarGrid.innerHTML = cells.join("");
  };

  const renderWeeklyBars = (logs) => {
    const today = isoToDate(todayISO());
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    const buckets = [];
    for (let index = 7; index >= 0; index--) {
      const start = new Date(weekStart);
      start.setDate(start.getDate() - index * 7);
      const startISO = dateToISO(start);
      const endISO = shiftISO(startISO, 6);
      const inWeek = logs.filter((log) => log.date >= startISO && log.date <= endISO);
      const clean = inWeek.filter(isCleanLog).length;
      buckets.push({
        startISO,
        rate: inWeek.length === 0 ? null : Math.round((clean / inWeek.length) * 100),
        label: index === 0 ? "Now" : `${index}w`
      });
    }

    el.weeklyBars.innerHTML = buckets.map((bucket) => {
      const height = bucket.rate === null ? 4 : Math.max(6, bucket.rate);
      const tone = bucket.rate === null ? "bg-elevated" : bucket.rate >= 70 ? "bg-accent" : bucket.rate >= 40 ? "bg-warn" : "bg-danger";
      return `<div class="flex flex-1 flex-col items-center gap-2">
        <div class="flex w-full flex-1 items-end">
          <div class="w-full rounded-t-md ${tone}" style="height:${height}%" title="${escapeHTML(bucket.startISO)}: ${bucket.rate === null ? "no data" : bucket.rate + "% clean"}"></div>
        </div>
        <span class="text-[0.55rem] font-bold uppercase text-muted">${bucket.label}</span>
      </div>`;
    }).join("");
  };

  const renderMoodSpark = (logs) => {
    const points = logs
      .filter((log) => typeof log.mood === "number" && log.mood >= 1)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .slice(-14);

    if (points.length < 2) {
      el.moodSpark.innerHTML = `<p class="py-3 text-center text-sm text-silver">Rate your clarity on a few audits to see the trend line.</p>`;
      el.moodAverage.textContent = "";
      return;
    }

    const width = 300;
    const height = 80;
    const stepX = width / (points.length - 1);
    const coords = points.map((log, index) => {
      const x = index * stepX;
      const y = height - ((log.mood - 1) / 4) * (height - 10) - 5;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const average = points.reduce((sum, log) => sum + log.mood, 0) / points.length;
    el.moodAverage.textContent = `avg ${average.toFixed(1)} · ${MOOD_LABELS[Math.round(average) - 1] || ""}`;
    el.moodSpark.innerHTML = `<svg viewBox="0 0 ${width} ${height}" class="h-24 w-full" preserveAspectRatio="none" role="img" aria-label="Clarity trend across the last ${points.length} rated audits">
      <polyline points="${coords.join(" ")}" fill="none" stroke="rgb(var(--accent))" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></polyline>
      ${coords.map((coord) => { const [x, y] = coord.split(","); return `<circle cx="${x}" cy="${y}" r="3" fill="rgb(var(--accent))"></circle>`; }).join("")}
    </svg>`;
  };

  const renderRitualAdherence = () => {
    const history = readShieldHistory();
    const rituals = readRituals();
    const today = todayISO();
    const rows = rituals.map((ritual) => {
      let hits = 0;
      for (let offset = 0; offset < 30; offset++) {
        const done = history[shiftISO(today, -offset)];
        if (Array.isArray(done) && done.includes(ritual.id)) hits += 1;
      }
      const rate = Math.round((hits / 30) * 100);
      return { label: ritual.title, value: rate, display: `${rate}% · ${hits}/30` };
    });
    renderBars(el.ritualAdherence, rows, { empty: "Add a morning ritual to track adherence." });
  };

  const renderMilestones = (bestStreak) => {
    el.milestoneRow.innerHTML = MILESTONES.map((milestone) => {
      const unlocked = bestStreak >= milestone;
      return `<div class="rounded-xl border ${unlocked ? "border-accent/50 bg-accent/10 text-accent" : "border-line/70 bg-canvas/60 text-muted"} py-3 text-center">
        <p class="font-display text-sm font-extrabold">${milestone}</p>
        <p class="text-[0.55rem] font-bold uppercase tracking-wider">${unlocked ? "cleared" : "days"}</p>
      </div>`;
    }).join("");
  };

  const renderInsights = () => {
    const logs = readLogs();
    const stats = computeStats(logs);

    el.insightsEmpty.classList.toggle("hidden", stats.total > 0);
    el.insightsBody.classList.toggle("hidden", stats.total === 0);
    if (stats.total === 0) return;

    el.statCurrentStreak.textContent = String(stats.currentStreak);
    el.statBestStreak.textContent = String(stats.bestStreak);
    el.statSuccessRate.textContent = String(stats.successRate);
    el.statTopTrigger.textContent = stats.topTrigger ? (SHORT_TRIGGERS[stats.topTrigger] || stats.topTrigger) : "—";

    renderCalendar(stats.dayMap);
    renderWeeklyBars(logs);

    renderBars(el.triggerBars, stats.rankedTriggers.slice(0, 5).map(([label, value]) => ({
      label: SHORT_TRIGGERS[label] || label,
      value,
      display: plural(value, "slip")
    })), { danger: true, empty: "No slips recorded — nothing to break down." });

    const reactionCounts = {};
    logs.forEach((log) => {
      const key = (log.reaction || "").replace(/\s*\(.*\)$/, "") || "Unspecified";
      reactionCounts[key] = (reactionCounts[key] || 0) + 1;
    });
    renderBars(el.reactionBars, Object.entries(reactionCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value, display: `${Math.round((value / logs.length) * 100)}%` })));

    renderMoodSpark(logs);
    renderRitualAdherence();
    renderMilestones(stats.bestStreak);
  };

  /* ------------------------------------------------------------------ *
   * Settings + data
   * ------------------------------------------------------------------ */

  const applySettings = () => {
    document.documentElement.dataset.accent = settings.accent;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", ACCENT_THEME_COLOR);
    el.timerLength.value = String(settings.timerSeconds);
    el.breathPattern.value = settings.breath;
    el.hapticsToggle.checked = settings.haptics;
    el.privacyToggle.checked = settings.privacy;
    el.confirmCloseToggle.checked = settings.guardExit;
    el.accentChoices.innerHTML = ACCENTS.map((accent) => `<button type="button" data-accent-choice="${accent.id}"
      class="h-10 w-10 rounded-full border-2 ${settings.accent === accent.id ? "border-snow" : "border-line"} transition"
      style="background:${accent.swatch}" aria-label="${accent.label} accent" aria-pressed="${settings.accent === accent.id}"></button>`).join("");
  };

  const updateSetting = (patch) => {
    settings = { ...settings, ...patch };
    writeSettings(settings);
    applySettings();
    renderLogList();
  };

  const openSettings = () => {
    applySettings();
    el.settingsScrim.classList.remove("hidden");
    el.settingsSheet.classList.remove("hidden");
    el.settingsSheet.classList.add("sheet-up");
    syncShell();
    el.closeSettings.focus({ preventScroll: true });
  };

  const closeSettings = () => {
    el.settingsSheet.classList.add("hidden");
    el.settingsSheet.classList.remove("sheet-up");
    el.settingsScrim.classList.add("hidden");
    syncShell();
    el.settingsButton.focus();
  };

  const handleExport = () => {
    const payload = {
      app: "chariot-control-panel",
      version: 2,
      exportedAt: new Date().toISOString(),
      logs: readLogs(),
      rituals: readRituals(),
      anchors: readAnchors(),
      settings,
      sessions: readSessions(),
      shieldHistory: readShieldHistory(),
      firewallDeploys: readDeploys()
    };
    if (payload.logs.length === 0 && payload.sessions.length === 0) {
      showToast("📭 Nothing to export yet.", { alert: true });
      return;
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `chariot-backup-${todayISO()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`⬇️ Backup with ${plural(payload.logs.length, "entry", "entries")} downloaded.`);
  };

  const sanitizeEntry = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    if (typeof raw.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) return null;
    if (typeof raw.slipType !== "string" || raw.slipType.length === 0) return null;
    return {
      id: typeof raw.id === "string" && raw.id.length > 0 ? raw.id : uid(),
      date: raw.date,
      slipType: raw.slipType,
      trigger: typeof raw.trigger === "string" ? raw.trigger : "Unspecified",
      reaction: typeof raw.reaction === "string" ? raw.reaction : "Automatic Pilot (Slid Instantly)",
      notes: typeof raw.notes === "string" ? raw.notes : "",
      mood: typeof raw.mood === "number" && raw.mood >= 1 && raw.mood <= 5 ? Math.round(raw.mood) : undefined,
      shield: typeof raw.shield === "number" ? Math.max(0, Math.round(raw.shield)) : undefined,
      shieldTotal: typeof raw.shieldTotal === "number" ? Math.max(0, Math.round(raw.shieldTotal)) : undefined,
      createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now()
    };
  };

  const applyImport = (parsed) => {
    const rawLogs = Array.isArray(parsed) ? parsed : Array.isArray(parsed.logs) ? parsed.logs : null;
    if (!rawLogs) {
      showToast("⚠️ That file is not a valid backup.", { alert: true });
      return;
    }

    const logs = readLogs();
    const seenIds = new Set(logs.map((log) => log.id));
    const seenDates = new Set(logs.map((log) => log.date));
    let imported = 0;
    let skipped = 0;

    rawLogs.forEach((raw) => {
      const entry = sanitizeEntry(raw);
      if (!entry || seenIds.has(entry.id) || seenDates.has(entry.date)) {
        skipped += 1;
        return;
      }
      logs.push(entry);
      seenIds.add(entry.id);
      seenDates.add(entry.date);
      imported += 1;
    });
    writeLogs(logs);

    if (!Array.isArray(parsed)) {
      if (Array.isArray(parsed.rituals) && parsed.rituals.length > 0) {
        const existing = readRituals();
        const byId = new Map(existing.map((ritual) => [ritual.id, ritual]));
        parsed.rituals.forEach((ritual) => {
          if (ritual && typeof ritual.id === "string" && typeof ritual.title === "string" && !byId.has(ritual.id)) {
            byId.set(ritual.id, { id: ritual.id, title: ritual.title, detail: typeof ritual.detail === "string" ? ritual.detail : "" });
          }
        });
        writeRituals([...byId.values()]);
      }
      if (Array.isArray(parsed.anchors) && parsed.anchors.length > 0) {
        const merged = readAnchors();
        parsed.anchors.forEach((anchor) => {
          if (typeof anchor === "string" && anchor.trim() && !merged.includes(anchor)) merged.push(anchor);
        });
        writeAnchors(merged);
      }
      if (parsed.settings && typeof parsed.settings === "object") {
        settings = { ...DEFAULT_SETTINGS, ...parsed.settings };
        writeSettings(settings);
        applySettings();
      }
      if (Array.isArray(parsed.sessions)) {
        const merged = readSessions().concat(parsed.sessions.filter((session) => session && typeof session.at === "number"));
        const unique = [...new Map(merged.map((session) => [session.at, session])).values()].sort((a, b) => a.at - b.at);
        writeSessions(unique);
      }
      if (parsed.shieldHistory && typeof parsed.shieldHistory === "object") {
        write(KEYS.shieldHistory, { ...parsed.shieldHistory, ...readShieldHistory() });
      }
      if (typeof parsed.firewallDeploys === "number") {
        localStorage.setItem(KEYS.deploys, String(Math.max(readDeploys(), Math.round(parsed.firewallDeploys))));
      }
    }

    refreshAll();
    if (imported === 0) {
      showToast(`⚠️ No new entries — ${skipped} skipped as duplicates or invalid.`, { alert: true });
    } else {
      showToast(`⬆️ Imported ${plural(imported, "entry", "entries")}${skipped > 0 ? `, skipped ${skipped}` : ""}.`);
    }
  };

  const handleImportFile = (event) => {
    const file = event.target.files && event.target.files[0];
    el.importInput.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = safeParse(String(reader.result), null);
      if (!parsed) {
        showToast("⚠️ That file is not valid JSON.", { alert: true });
        return;
      }
      showConfirm({
        title: "Merge this backup?",
        message: "Entries with a new date will be added, duplicates skipped. Rituals, anchors and preferences from the backup are merged in too.",
        acceptLabel: "Merge backup",
        danger: false,
        onAccept: () => applyImport(parsed)
      });
    };
    reader.onerror = () => showToast("⚠️ Could not read that file.", { alert: true });
    reader.readAsText(file);
  };

  const handleClearAll = () => {
    showConfirm({
      title: "Erase everything?",
      message: "Every entry, ritual, anchor, intercept and preference will be permanently removed from this device. Export a backup first — this cannot be undone.",
      acceptLabel: "Erase everything",
      danger: true,
      onAccept: () => {
        Object.values(KEYS).forEach((key) => localStorage.removeItem(key));
        settings = readSettings();
        visibleLogCount = LOGS_PER_PAGE;
        searchTerm = "";
        statusFilter = "all";
        el.searchInput.value = "";
        migrate();
        applySettings();
        renderFilterChips();
        resetAuditForm();
        refreshAll();
        showToast("🗑️ Device wiped. Fresh observation field ready.", { alert: true });
      }
    });
  };

  /* ------------------------------------------------------------------ *
   * Render orchestration
   * ------------------------------------------------------------------ */

  function refreshAll() {
    renderToday();
    renderStreakChip();
    renderAnchors();
    renderFirewallStats();
    renderLogList();
    renderInsights();
  }

  /* ------------------------------------------------------------------ *
   * Event wiring
   * ------------------------------------------------------------------ */

  document.addEventListener("click", (event) => {
    const target = event.target;

    const tabButton = target.closest("[data-tab]");
    if (tabButton) {
      setTab(tabButton.getAttribute("data-tab"));
      return;
    }

    const goto = target.closest("[data-goto]");
    if (goto) {
      setTab(goto.getAttribute("data-goto"));
      return;
    }

    const editLog = target.closest("[data-edit-log]");
    if (editLog) {
      startEditing(editLog.getAttribute("data-edit-log"));
      return;
    }

    const deleteLogButton = target.closest("[data-delete-log]");
    if (deleteLogButton) {
      const id = deleteLogButton.getAttribute("data-delete-log");
      showConfirm({
        title: "Discard this observation?",
        message: "The entry is removed from the repository. You can undo straight after, from the toast.",
        acceptLabel: "Delete entry",
        danger: true,
        onAccept: () => deleteLog(id)
      });
      return;
    }

    const editRitual = target.closest("[data-edit-ritual]");
    if (editRitual) {
      const id = editRitual.getAttribute("data-edit-ritual");
      const ritual = readRituals().find((item) => item.id === id);
      if (!ritual) return;
      showPrompt({
        title: "Rename ritual",
        label: "Ritual name",
        value: ritual.title,
        withDetail: true,
        detailLabel: "Description (optional)",
        detailValue: ritual.detail || "",
        acceptLabel: "Save ritual",
        onAccept: (title, detail) => {
          if (!title.trim()) return;
          writeRituals(readRituals().map((item) => (item.id === id ? { ...item, title: title.trim(), detail: detail.trim() } : item)));
          renderToday();
          renderInsights();
        }
      });
      return;
    }

    const deleteRitual = target.closest("[data-delete-ritual]");
    if (deleteRitual) {
      const id = deleteRitual.getAttribute("data-delete-ritual");
      const ritual = readRituals().find((item) => item.id === id);
      showConfirm({
        title: "Remove this ritual?",
        message: `"${ritual ? ritual.title : "This ritual"}" disappears from the Morning Shield. Past audit snapshots keep their numbers.`,
        acceptLabel: "Remove ritual",
        danger: true,
        onAccept: () => {
          writeRituals(readRituals().filter((item) => item.id !== id));
          writeShield(readShield().done.filter((doneId) => doneId !== id));
          refreshAll();
        }
      });
      return;
    }

    const deleteAnchor = target.closest("[data-delete-anchor]");
    if (deleteAnchor) {
      const index = Number(deleteAnchor.getAttribute("data-delete-anchor"));
      const anchors = readAnchors();
      anchors.splice(index, 1);
      writeAnchors(anchors);
      renderAnchors();
      return;
    }

    const moodChip = target.closest("[data-mood]");
    if (moodChip) {
      const value = Number(moodChip.getAttribute("data-mood"));
      selectedMood = selectedMood === value ? 0 : value;
      renderMoodChips();
      return;
    }

    const intensityChip = target.closest("[data-intensity]");
    if (intensityChip) {
      const value = Number(intensityChip.getAttribute("data-intensity"));
      selectedIntensity = selectedIntensity === value ? 0 : value;
      renderIntensityChips();
      return;
    }

    const filterChip = target.closest("[data-filter]");
    if (filterChip) {
      statusFilter = filterChip.getAttribute("data-filter");
      visibleLogCount = LOGS_PER_PAGE;
      renderFilterChips();
      renderLogList();
      return;
    }

    const accentChoice = target.closest("[data-accent-choice]");
    if (accentChoice) {
      updateSetting({ accent: accentChoice.getAttribute("data-accent-choice") });
      return;
    }

    const dayCell = target.closest("[data-day]");
    if (dayCell) {
      const iso = dayCell.getAttribute("data-day");
      if (iso > todayISO()) {
        showToast("⚠️ The scientist records the past, not the future.", { alert: true });
        return;
      }
      const existing = readLogs().find((log) => log.date === iso);
      if (existing) {
        startEditing(existing.id);
      } else {
        setTab("log", { scroll: false });
        startEntryForDate(iso);
        el.auditForm.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
        showToast(`📅 Logging ${formatDisplayDate(iso)}.`);
      }
    }
  });

  el.ritualList.addEventListener("change", (event) => {
    const input = event.target.closest("[data-ritual]");
    if (!input) return;
    const done = new Set(readShield().done);
    const id = input.getAttribute("data-ritual");
    if (input.checked) {
      done.add(id);
      haptic(20);
    } else {
      done.delete(id);
    }
    writeShield([...done]);
    renderRituals();
    renderInsights();
  });

  el.addRitualButton.addEventListener("click", () => {
    showPrompt({
      title: "New morning ritual",
      label: "Ritual name",
      value: "",
      withDetail: true,
      detailLabel: "Description (optional)",
      detailValue: "",
      acceptLabel: "Add ritual",
      onAccept: (title, detail) => {
        if (!title.trim()) return;
        const rituals = readRituals();
        rituals.push({ id: uid(), title: title.trim(), detail: detail.trim() });
        writeRituals(rituals);
        renderToday();
        renderInsights();
        showToast("🛡️ Ritual added to the Morning Shield.");
      }
    });
  });

  el.manageRitualsButton.addEventListener("click", () => {
    ritualsManageMode = !ritualsManageMode;
    renderRituals();
  });

  el.addAnchorButton.addEventListener("click", () => {
    showPrompt({
      title: "New anchor",
      label: "What will you remember mid-urge?",
      value: "",
      withDetail: false,
      acceptLabel: "Add anchor",
      onAccept: (text) => {
        if (!text.trim()) return;
        const anchors = readAnchors();
        anchors.push(text.trim());
        writeAnchors(anchors);
        renderAnchors();
        showToast("⚓ Anchor added to the intercept.");
      }
    });
  });

  el.quickCleanButton.addEventListener("click", logCleanDayNow);
  el.quickFirewallButton.addEventListener("click", () => openFirewall());
  el.quickAuditButton.addEventListener("click", () => {
    setTab("log", { scroll: false });
    el.auditForm.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    el.gearNotes.focus();
  });

  el.streakChip.addEventListener("click", () => setTab("insights"));
  el.deployFirewall.addEventListener("click", () => openFirewall());
  el.closeFirewall.addEventListener("click", requestCloseFirewall);
  el.heldButton.addEventListener("click", () => finishFirewall(true));
  el.slippedButton.addEventListener("click", () => finishFirewall(false));
  el.skipAftermath.addEventListener("click", () => finishFirewall(null));

  el.auditForm.addEventListener("submit", handleAuditSubmit);
  el.cancelEditButton.addEventListener("click", () => {
    resetAuditForm();
    showToast("Edit cancelled.");
  });
  el.rootTrigger.addEventListener("change", () => {
    const custom = el.rootTrigger.value === "__custom__";
    el.customTriggerWrap.classList.toggle("hidden", !custom);
    if (custom) el.customTrigger.focus();
  });
  el.searchInput.addEventListener("input", () => {
    searchTerm = el.searchInput.value.trim().toLowerCase();
    visibleLogCount = LOGS_PER_PAGE;
    renderLogList();
  });
  el.loadMoreButton.addEventListener("click", () => {
    visibleLogCount += LOGS_PER_PAGE;
    renderLogList();
  });

  el.calPrev.addEventListener("click", () => {
    calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1);
    renderCalendar(computeStats(readLogs()).dayMap);
  });
  el.calNext.addEventListener("click", () => {
    calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1);
    renderCalendar(computeStats(readLogs()).dayMap);
  });

  el.settingsButton.addEventListener("click", openSettings);
  el.closeSettings.addEventListener("click", closeSettings);
  el.settingsScrim.addEventListener("click", closeSettings);
  el.timerLength.addEventListener("change", () => updateSetting({ timerSeconds: Number(el.timerLength.value) }));
  el.breathPattern.addEventListener("change", () => updateSetting({ breath: el.breathPattern.value }));
  el.hapticsToggle.addEventListener("change", () => updateSetting({ haptics: el.hapticsToggle.checked }));
  el.privacyToggle.addEventListener("change", () => updateSetting({ privacy: el.privacyToggle.checked }));
  el.confirmCloseToggle.addEventListener("change", () => updateSetting({ guardExit: el.confirmCloseToggle.checked }));

  el.exportRepo.addEventListener("click", handleExport);
  el.importRepo.addEventListener("click", () => el.importInput.click());
  el.importInput.addEventListener("change", handleImportFile);
  el.clearRepo.addEventListener("click", handleClearAll);

  el.confirmCancel.addEventListener("click", closeConfirm);
  el.confirmAccept.addEventListener("click", () => {
    const action = pendingConfirm;
    closeConfirm();
    if (action) action();
  });
  el.promptCancel.addEventListener("click", closePrompt);
  el.promptForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const action = pendingPrompt;
    const value = el.promptInput.value;
    const detail = el.promptDetail.value;
    closePrompt();
    if (action) action(value, detail);
  });

  /* ------------------------------------------------------------------ *
   * Back navigation + keyboard
   * ------------------------------------------------------------------ */

  const goBack = () => {
    if (isOpen(el.promptModal)) { closePrompt(); return true; }
    if (isOpen(el.confirmModal)) { closeConfirm(); return true; }
    if (isOpen(el.firewallModal)) { requestCloseFirewall(); return true; }
    if (isOpen(el.settingsSheet)) { closeSettings(); return true; }
    if (activeTab !== "today") { setTab("today"); return true; }
    return false;
  };

  // Consumed by the Android wrapper's hardware back button.
  window.__chariotBack = goBack;

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (goBack()) event.preventDefault();
      return;
    }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
    if (typing || anyOverlayOpen() || event.metaKey || event.ctrlKey || event.altKey) return;
    const shortcuts = { 1: "today", 2: "firewall", 3: "log", 4: "insights" };
    if (shortcuts[event.key]) {
      setTab(shortcuts[event.key]);
    } else if (event.key.toLowerCase() === "f") {
      openFirewall();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopFirewallLoop();
    } else if (firewallStartedAt !== null && animationFrame === null) {
      runFirewallLoop();
    }
    if (!document.hidden && readShield().date !== todayISO()) refreshAll();
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    el.installWrap.classList.remove("hidden");
  });

  el.installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    el.installWrap.classList.add("hidden");
  });

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */

  migrate();
  applySettings();
  el.appVersion.textContent = `v${APP_VERSION}`;
  renderFilterChips();
  renderIntensityChips();
  resetAuditForm();
  refreshAll();

  // Manifest shortcuts (and deep links) land on a specific tab.
  const requestedTab = location.hash.replace("#", "");
  setTab(["today", "firewall", "log", "insights"].includes(requestedTab) ? requestedTab : "today", { scroll: false });

  resumeFirewallIfActive();

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
})();
