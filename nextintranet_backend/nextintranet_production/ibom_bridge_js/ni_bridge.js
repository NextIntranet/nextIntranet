/**
 * ibom defaults override — runs before window.onload, after ///CONFIG/// is set.
 * Sets fallback values for settings that KiBot may not pass through via CLI.
 * User-saved localStorage values always take priority over these defaults.
 */
(function () {
  if (typeof config !== "undefined") {
    if (!config.highlight_pin1 || config.highlight_pin1 === "none") {
      config.highlight_pin1 = "selected";
    }
    if (!config.mark_when_checked) {
      config.mark_when_checked = "Placed";
    }
  }
})();

/**
 * NextIntranet ↔ iBOM WebSocket Bridge
 *
 * Connects an InteractiveHtmlBom instance (loaded in an iframe) to the
 * NextIntranet realtime event bus via Django Channels.
 *
 * Configuration is read from the iframe's URL query string:
 *   station_id  – station group to join
 *   token       – JWT access token
 *   api_host    – host[:port] of the NI backend (ws will be derived)
 *   template_id – UUID of the manufacturing Template
 *   ws_url      – (alternative) full ws:// URL, overrides api_host
 */

(function () {
  "use strict";

  var PREFIX = "[NI-bridge]";

  function sanitizeWsUrl(url) {
    if (!url) return "(none)";
    return String(url).replace(/token=[^&]+/, "token=***");
  }

  function wsStateToText(state) {
    switch (state) {
      case 0: return "CONNECTING";
      case 1: return "OPEN";
      case 2: return "CLOSING";
      case 3: return "CLOSED";
      default: return "UNKNOWN(" + state + ")";
    }
  }

  function parseJwtPayload(jwt) {
    if (!jwt) return null;
    var parts = jwt.split(".");
    if (parts.length < 2) return null;
    try {
      var base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      var json = atob(base64 + "===".slice((base64.length + 3) % 4));
      return JSON.parse(json);
    } catch (e) {
      warn("Failed to decode JWT payload:", e.message || e);
      return null;
    }
  }

  function getJwtExpiryText(jwt) {
    var payload = parseJwtPayload(jwt);
    if (!payload || !payload.exp) return "unknown";
    var expMs = payload.exp * 1000;
    var secLeft = Math.floor((expMs - Date.now()) / 1000);
    return new Date(expMs).toISOString() + " (" + secLeft + "s left)";
  }

  function log() {
    var args = [PREFIX].concat(Array.prototype.slice.call(arguments));
    console.log.apply(console, args);
  }

  function warn() {
    var args = [PREFIX].concat(Array.prototype.slice.call(arguments));
    console.warn.apply(console, args);
  }

  // ---------------------------------------------------------------------------
  // 1. Parse configuration from query string
  // ---------------------------------------------------------------------------

  log("Initializing… URL:", window.location.href);

  var params = new URLSearchParams(window.location.search);
  var stationId = params.get("station_id") || params.get("stationId");
  var token = params.get("token");
  var apiHost = params.get("api_host");
  var templateId = params.get("template_id");
  var wsUrl = params.get("ws_url");

  log("Config parsed:",
    "station_id=" + (stationId || "(none)"),
    "token=" + (token ? token.substring(0, 12) + "… (len=" + token.length + ")" : "(none)"),
    "api_host=" + (apiHost || "(none)"),
    "template_id=" + (templateId || "(none)"),
    "ws_url=" + (wsUrl || "(auto)")
  );
  log("Browser context:",
    "origin=" + window.location.origin,
    "protocol=" + window.location.protocol,
    "host=" + window.location.host,
    "online=" + navigator.onLine,
    "visibility=" + document.visibilityState
  );
  if (token) {
    log("JWT exp:", getJwtExpiryText(token));
  }

  // The live channel and the BOM grouping are independent: grouping only needs
  // template_id + token and works over plain REST, so a page opened without a
  // station still gets the right rows.
  var wsEnabled = true;

  if (typeof WebSocket === "undefined") {
    warn("WebSocket API is not available in this browser/runtime – live channel disabled.");
    wsEnabled = false;
  }

  if (wsEnabled && !stationId && !wsUrl) {
    log("No station_id or ws_url in query string – live channel INACTIVE. Params available:", Array.from(params.keys()).join(", ") || "(none)");
    wsEnabled = false;
  }

  if (wsEnabled && !wsUrl) {
    var host = apiHost || window.location.host;
    var proto = (window.location.protocol === "https:") ? "wss" : "ws";
    wsUrl = proto + "://" + host + "/ws/station/" + encodeURIComponent(stationId) + "/";
    if (token) {
      wsUrl += "?token=" + encodeURIComponent(token);
    }
    log("WS URL built:", sanitizeWsUrl(wsUrl));
  } else {
    log("Using explicit ws_url:", sanitizeWsUrl(wsUrl));
  }

  if (wsEnabled && window.location.protocol === "https:" && wsUrl.indexOf("ws://") === 0) {
    warn("Mixed-content risk: page runs on HTTPS but WS URL is insecure (ws://). Browser may block this connection.");
  }

  // ---------------------------------------------------------------------------
  // 2. Status indicator (CSS dot, top-right corner)
  // ---------------------------------------------------------------------------

  var STATUS_COLORS = { connected: "#22c55e", disconnected: "#ef4444", connecting: "#eab308" };
  var dot = null;

  function ensureStatusElements() {
    var statusStyleId = "ni-bridge-status-style";
    if (!document.getElementById(statusStyleId)) {
      var style = document.createElement("style");
      style.id = statusStyleId;
      style.textContent =
        "#ni-bridge-status{position:fixed;top:8px;right:8px;z-index:99999;" +
        "width:12px;height:12px;border-radius:50%;border:2px solid rgba(0,0,0,.25);" +
        "box-shadow:0 0 0 1px rgba(255,255,255,.7),0 1px 3px rgba(0,0,0,.45);" +
        "opacity:1;pointer-events:none;" +
        "transition:background-color .3s,transform .15s,box-shadow .15s;}" +
        "#ni-bridge-status.ni-flash{animation:ni-bridge-flash .45s ease-out;}" +
        "@keyframes ni-bridge-flash{0%{transform:scale(1);}" +
        "30%{transform:scale(1.5);box-shadow:0 0 9px 3px rgba(255,255,255,.95),0 0 0 1px rgba(255,255,255,.7);}" +
        "100%{transform:scale(1);}}";
      var headTarget = document.head || document.getElementsByTagName("head")[0] || document.documentElement;
      if (headTarget) {
        headTarget.appendChild(style);
      }
    }

    dot = document.getElementById("ni-bridge-status");
    if (!dot) {
      if (!document.body) return false;
      dot = document.createElement("div");
      dot.id = "ni-bridge-status";
      document.body.appendChild(dot);
    }
    return true;
  }

  if (!ensureStatusElements()) {
    log("Status indicator delayed until DOM is ready");
    function onDomReady() {
      window.removeEventListener("DOMContentLoaded", onDomReady);
      ensureStatusElements();
      setStatus("connecting");
    }
    window.addEventListener("DOMContentLoaded", onDomReady);
  }

  // Last WS state and last grouping state, composed together into the dot's tooltip.
  var currentWsState = "connecting";
  var groupingStatusText = "";

  function refreshStatusTitle() {
    if (!dot) return;
    dot.title = "NI bridge: " + currentWsState + (groupingStatusText ? "\n" + groupingStatusText : "");
  }

  function setStatus(state) {
    currentWsState = state;
    if (!dot && !ensureStatusElements()) {
      log("Status pending (DOM not ready):", state);
      return;
    }
    dot.style.backgroundColor = STATUS_COLORS[state] || STATUS_COLORS.disconnected;
    refreshStatusTitle();
    log("Status →", state);
  }

  function setGroupingStatus(text) {
    groupingStatusText = text || "";
    if (!dot && !ensureStatusElements()) return;
    refreshStatusTitle();
  }
  setStatus("connecting");

  // Brief blink of the status dot whenever data is sent or received.
  var flashResetTimer = null;
  function flashStatusDot() {
    if (!dot && !ensureStatusElements()) return;
    dot.classList.remove("ni-flash");
    // Force reflow so the animation restarts even on back-to-back messages.
    void dot.offsetWidth;
    dot.classList.add("ni-flash");
    if (flashResetTimer) clearTimeout(flashResetTimer);
    flashResetTimer = setTimeout(function () {
      if (dot) dot.classList.remove("ni-flash");
    }, 500);
  }

  // ---------------------------------------------------------------------------
  // 3. Ref ↔ footprint-index helpers
  // ---------------------------------------------------------------------------

  var refToRefId = null;

  function refToIndex(ref) {
    if (typeof pcbdata === "undefined") return -1;
    if (!refToRefId) {
      refToRefId = {};
      for (var i = 0; i < pcbdata.footprints.length; i++) {
        refToRefId[pcbdata.footprints[i].ref] = i;
      }
    }
    var idx = refToRefId[ref];
    return idx === undefined ? -1 : idx;
  }

  function buildFootprintList() {
    if (typeof pcbdata === "undefined") {
      warn("pcbdata is undefined – footprint list will be empty");
      return [];
    }
    var list = [];
    for (var i = 0; i < pcbdata.footprints.length; i++) {
      var fp = pcbdata.footprints[i];
      list.push({ index: i, ref: fp.ref, layer: fp.layer || "F" });
    }
    log("Built footprint list:", list.length, "entries");
    return list;
  }

  function refreshMarkedFootprintsFromSettings() {
    if (typeof markedFootprints === "undefined" || !markedFootprints || typeof markedFootprints.clear !== "function") {
      return;
    }
    var markerCheckbox = (typeof settings !== "undefined" && settings) ? settings.markWhenChecked : null;
    markedFootprints.clear();
    if (!markerCheckbox || typeof getStoredCheckboxRefs !== "function") {
      return;
    }
    var refsSet = getStoredCheckboxRefs(markerCheckbox);
    refsSet.forEach(function (refIndex) {
      markedFootprints.add(refIndex);
    });
  }

  // ---------------------------------------------------------------------------
  // 3.5 Lock local iBOM checkbox edits (Sourced / Placed) in NI bridge mode
  // ---------------------------------------------------------------------------

  var LOCKED_CHECKBOX_NAMES = { sourced: true, placed: true };
  var ibomCheckboxEditingLocked = false;
  var checkboxPatchesApplied = false;
  var syncInProgress = false;
  var highlightInProgress = false;

  function normalizeCheckboxName(name) {
    return String(name || "").trim().toLowerCase();
  }

  function isLockedCheckboxName(name) {
    return !!LOCKED_CHECKBOX_NAMES[normalizeCheckboxName(name)];
  }

  function preventLocalCheckboxEdit(checkboxName, event) {
    if (event && typeof event.preventDefault === "function") {
      event.preventDefault();
    }
    if (event && typeof event.stopPropagation === "function") {
      event.stopPropagation();
    }
    warn("Local iBOM checkbox edit blocked for '" + checkboxName + "'.",
      "Use NextIntranet Production tab to change Sourced/Placed.");
    return false;
  }

  function applyCheckboxPatches() {
    if (checkboxPatchesApplied) return;
    checkboxPatchesApplied = true;

    if (typeof createCheckboxHandlers === "function") {
      var originalCreateCheckboxHandlers = createCheckboxHandlers;
      createCheckboxHandlers = function (input, checkbox, references, row) {
        var handlers = originalCreateCheckboxHandlers(input, checkbox, references, row);
        var locked = ibomCheckboxEditingLocked && isLockedCheckboxName(checkbox);
        input.disabled = !!locked;
        input.title = locked ? "Managed by NextIntranet Production tab" : "";
        if (!locked) {
          return handlers;
        }
        return [
          function (e) { return preventLocalCheckboxEdit(checkbox, e); },
          handlers && handlers[1] ? handlers[1] : null,
          function (e) { return preventLocalCheckboxEdit(checkbox, e); }
        ];
      };
    } else {
      warn("createCheckboxHandlers() not found; checkbox lock patch not applied.");
    }

    if (typeof checkboxSetUnsetAllHandler === "function") {
      var originalCheckboxSetUnsetAllHandler = checkboxSetUnsetAllHandler;
      checkboxSetUnsetAllHandler = function (checkboxname) {
        var originalHandler = originalCheckboxSetUnsetAllHandler(checkboxname);
        return function () {
          if (ibomCheckboxEditingLocked && isLockedCheckboxName(checkboxname)) {
            warn("Set/unset all blocked for '" + checkboxname + "' while NI bridge lock is active.");
            return;
          }
          return originalHandler.apply(this, arguments);
        };
      };
    }

    if (typeof toggleBomCheckbox === "function") {
      var originalToggleBomCheckbox = toggleBomCheckbox;
      toggleBomCheckbox = function (bomrowid, checkboxnum) {
        var checkboxName = (typeof settings !== "undefined" && settings && settings.checkboxes)
          ? settings.checkboxes[checkboxnum]
          : null;
        if (ibomCheckboxEditingLocked && isLockedCheckboxName(checkboxName)) {
          warn("toggleBomCheckbox blocked for '" + checkboxName + "'.");
          return;
        }
        return originalToggleBomCheckbox.apply(this, arguments);
      };
    }

    if (typeof checkBomCheckbox === "function") {
      var originalCheckBomCheckbox = checkBomCheckbox;
      checkBomCheckbox = function (bomrowid, checkboxname) {
        if (ibomCheckboxEditingLocked && isLockedCheckboxName(checkboxname)) {
          warn("checkBomCheckbox blocked for '" + checkboxname + "'.");
          return;
        }
        return originalCheckBomCheckbox.apply(this, arguments);
      };
    }
  }

  function setIbomCheckboxEditingLocked(locked, reason) {
    if (ibomCheckboxEditingLocked === !!locked) return;
    ibomCheckboxEditingLocked = !!locked;
    log("iBOM checkbox editing", ibomCheckboxEditingLocked ? "LOCKED" : "UNLOCKED", reason ? "(" + reason + ")" : "");
    if (typeof populateBomTable === "function") {
      populateBomTable();
      if (typeof drawHighlights === "function") {
        drawHighlights();
      }
    }
  }

  applyCheckboxPatches();

  // ---------------------------------------------------------------------------
  // 4. WebSocket connection with auto-reconnect
  // ---------------------------------------------------------------------------

  var ws = null;
  var reconnectTimer = null;
  var connectAttempt = 0;
  var RECONNECT_DELAY = 3000;
  var CONNECT_TIMEOUT = 8000;
  var connectTimeoutTimer = null;

  function clearConnectTimeout() {
    if (connectTimeoutTimer) {
      clearTimeout(connectTimeoutTimer);
      connectTimeoutTimer = null;
    }
  }

  function startConnectTimeout() {
    clearConnectTimeout();
    connectTimeoutTimer = setTimeout(function () {
      if (ws && ws.readyState === WebSocket.CONNECTING) {
        warn("WebSocket still CONNECTING after " + CONNECT_TIMEOUT + "ms.",
          "URL:", sanitizeWsUrl(wsUrl),
          "online=" + navigator.onLine,
          "visibility=" + document.visibilityState);
      }
    }, CONNECT_TIMEOUT);
  }

  function connect() {
    if (!wsEnabled) return;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      log("connect() skipped – already", wsStateToText(ws.readyState));
      return;
    }

    connectAttempt++;
    setStatus("connecting");
    log("Connecting… (attempt #" + connectAttempt + ")",
      "online=" + navigator.onLine,
      "visibility=" + document.visibilityState,
      "url=" + sanitizeWsUrl(wsUrl));

    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      warn("WebSocket constructor threw:", e.message || e);
      setStatus("disconnected");
      scheduleReconnect();
      return;
    }

    startConnectTimeout();
    log("WebSocket created, readyState=" + ws.readyState,
      "(" + wsStateToText(ws.readyState) + ")",
      "url=" + sanitizeWsUrl(wsUrl));

    ws.onopen = function () {
      clearConnectTimeout();
      connectAttempt = 0;
      setStatus("connected");
      log("WebSocket OPEN",
        "protocol=" + (ws.protocol || "(none)"),
        "extensions=" + (ws.extensions || "(none)"));
      setIbomCheckboxEditingLocked(true, "connected to NextIntranet");
      sendReady();
    };

    ws.onmessage = function (event) {
      flashStatusDot();
      try {
        var msg = JSON.parse(event.data);
        log("← Received:",
          "type=" + msg.type,
          msg.payload ? "(has payload)" : "(no payload)",
          "size=" + String(event.data || "").length + "B");
        handleIncoming(msg);
      } catch (e) {
        warn("Bad message:", e, "raw:", event.data.substring(0, 200));
      }
    };

    ws.onerror = function (event) {
      warn("WebSocket ERROR event.",
        "event.type=" + (event && event.type),
        "readyState=" + ws.readyState + " (" + wsStateToText(ws.readyState) + ")",
        "online=" + navigator.onLine,
        "visibility=" + document.visibilityState,
        "This usually means the connection was refused or the URL is wrong.",
        "URL:", sanitizeWsUrl(wsUrl));
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
    };

    ws.onclose = function (event) {
      clearConnectTimeout();
      setStatus("disconnected");
      log("WebSocket CLOSED.",
        "code=" + event.code,
        "reason=" + (event.reason || "(none)"),
        "wasClean=" + event.wasClean,
        "online=" + navigator.onLine,
        "visibility=" + document.visibilityState);
      scheduleReconnect();
    };
  }

  function scheduleReconnect() {
    if (reconnectTimer) {
      log("Reconnect already scheduled, skipping");
      return;
    }
    log("Scheduling reconnect in " + RECONNECT_DELAY + "ms…",
      "online=" + navigator.onLine,
      "visibility=" + document.visibilityState);
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      connect();
    }, RECONNECT_DELAY);
  }

  function send(eventType, payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      warn("→ DROPPED (not connected):", eventType);
      return;
    }
    var msg = {
      type: eventType,
      stationId: stationId,
      payload: payload || {},
    };
    log("→ Sending:", eventType);
    ws.send(JSON.stringify(msg));
    flashStatusDot();
  }

  // ---------------------------------------------------------------------------
  // 5. Outgoing events: iBOM → NI
  // ---------------------------------------------------------------------------

  function sendReady() {
    var footprints = buildFootprintList();
    log("Sending ibom.ready with", footprints.length, "footprints, templateId=" + templateId);
    send("ibom.ready", {
      templateId: templateId,
      footprints: footprints,
    });
  }

  // HIGHLIGHT_EVENT → ibom.hover
  if (typeof EventHandler !== "undefined" && typeof IBOM_EVENT_TYPES !== "undefined") {
    log("EventHandler found – registering callbacks");

    EventHandler.registerCallback(IBOM_EVENT_TYPES.HIGHLIGHT_EVENT, function (e) {
      if (highlightInProgress) {
        log("Suppressing ibom.hover echo – highlight triggered by external signal, not mouse.");
        return;
      }
      log("iBOM highlight event, refs:", e.args.refs ? e.args.refs.length + " refs" : "none");
      send("ibom.hover", {
        refs: e.args.refs,
        net: e.args.net,
        rowid: e.args.rowid,
      });
    });

    EventHandler.registerCallback(IBOM_EVENT_TYPES.CHECKBOX_CHANGE_EVENT, function (e) {
      if (syncInProgress) {
        warn("Ignoring outgoing iBOM checkbox event during NI sync for '" + e.args.checkbox + "'.");
        return;
      }
      if (ibomCheckboxEditingLocked && isLockedCheckboxName(e.args.checkbox)) {
        warn("Ignoring outgoing iBOM checkbox event for locked checkbox '" + e.args.checkbox + "'.");
        return;
      }
      log("iBOM checkbox event:", e.args.checkbox, "state=" + e.args.state);
      send("ibom.checkbox", {
        checkbox: e.args.checkbox,
        refs: e.args.refs,
        state: e.args.state,
        templateId: templateId,
      });
    });
  } else {
    warn("EventHandler or IBOM_EVENT_TYPES not found – iBOM event callbacks NOT registered.",
      "EventHandler=" + (typeof EventHandler), "IBOM_EVENT_TYPES=" + (typeof IBOM_EVENT_TYPES));
  }

  // ---------------------------------------------------------------------------
  // 6. Incoming events: NI → iBOM
  // ---------------------------------------------------------------------------

  function handleIncoming(msg) {
    var type = msg.type;
    var payload = msg.payload || {};

    switch (type) {
      case "ibom.highlight":
        log("Handling ibom.highlight, ref=" + payload.ref);
        handleHighlight(payload);
        break;
      case "ibom.sourced":
        log("Handling ibom.sourced, ref=" + payload.ref, "state=" + payload.state);
        handleSourced(payload);
        break;
      case "ibom.barcode":
        log("Handling ibom.barcode, ref=" + payload.ref, "autoCheck=" + payload.autoCheck);
        handleBarcode(payload);
        break;
      case "ibom.sync":
        var refCount = payload.refs ? Object.keys(payload.refs).length : 0;
        log("Handling ibom.sync, checkbox=" + payload.checkbox, "refs=" + refCount);
        handleSync(payload);
        // Progress moved, so stock most likely did too.
        scheduleRefetch();
        break;
      case "ibom.grouping":
        log("Handling ibom.grouping,", (payload.items || []).length, "items");
        handleGrouping(payload);
        break;
      case "ibom.checkbox":
        // Echo from another client changing progress — refresh the stock columns.
        scheduleRefetch();
        break;
      default:
        // Ignore events not intended for iBOM (e.g. scanner.data, etc.)
        break;
    }
  }

  function handleHighlight(payload) {
    var ref = payload.ref;
    if (!ref) return;
    var idx = refToIndex(ref);
    if (idx < 0) {
      warn("handleHighlight: ref '" + ref + "' not found in pcbdata");
      return;
    }
    highlightInProgress = true;
    try {
      if (typeof footprintIndexToHandler !== "undefined" && footprintIndexToHandler[idx]) {
        footprintIndexToHandler[idx]();
      }
    } finally {
      highlightInProgress = false;
    }
    if (typeof currentHighlightedRowId !== "undefined" && currentHighlightedRowId) {
      smoothScrollToRow(currentHighlightedRowId);
    }
  }

  function handleSourced(payload) {
    var checkbox = payload.checkbox || "Sourced";
    var ref = payload.ref;
    var state = !!payload.state;
    if (!ref) return;
    var idx = refToIndex(ref);
    if (idx < 0) {
      warn("handleSourced: ref '" + ref + "' not found in pcbdata");
      return;
    }

    var refsSet = getStoredCheckboxRefs(checkbox);
    if (state) {
      refsSet.add(idx);
    } else {
      refsSet.delete(idx);
    }
    settings.checkboxStoredRefs[checkbox] = Array.from(refsSet).join(",");
    writeStorage("checkbox_" + checkbox, settings.checkboxStoredRefs[checkbox]);
    updateCheckboxStats(checkbox);
    populateBomTable();
    refreshMarkedFootprintsFromSettings();
    drawHighlights();
  }

  function handleBarcode(payload) {
    handleHighlight(payload);
    if (payload.autoCheck) {
      handleSourced({
        checkbox: payload.checkbox || "Placed",
        ref: payload.ref,
        state: true,
      });
    }
  }

  function handleSync(payload) {
    var checkbox = payload.checkbox || "Sourced";
    var refs = payload.refs || {};
    var refsSet = getStoredCheckboxRefs(checkbox);
    var added = 0, removed = 0, notFound = 0;

    for (var refName in refs) {
      if (!refs.hasOwnProperty(refName)) continue;
      var idx = refToIndex(refName);
      if (idx < 0) {
        notFound++;
        continue;
      }
      if (refs[refName]) {
        refsSet.add(idx);
        added++;
      } else {
        refsSet.delete(idx);
        removed++;
      }
    }

    log("ibom.sync result: added=" + added, "removed=" + removed, "notFound=" + notFound);

    settings.checkboxStoredRefs[checkbox] = Array.from(refsSet).join(",");
    writeStorage("checkbox_" + checkbox, settings.checkboxStoredRefs[checkbox]);
    updateCheckboxStats(checkbox);
    syncInProgress = true;
    try {
      populateBomTable();
      refreshMarkedFootprintsFromSettings();
      drawHighlights();
    } finally {
      syncInProgress = false;
    }
  }

  function handleGrouping(payload) {
    if (payload.templateId && templateId && payload.templateId !== templateId) {
      log("Ignoring ibom.grouping for a different template:", payload.templateId);
      return;
    }
    // A full push replaces the map; a patch merges into it.
    ingestItems(payload.items, payload.patch !== true);
  }

  // ---------------------------------------------------------------------------
  // 6.5 External grouping — rebuild BOM rows from NextIntranet BOM lines
  //
  // The generator merges rows by Value + Footprint + UST_ID, and UST_ID is often
  // wrong, so rows come out merged that shouldn't be and split that should be. The
  // authoritative grouping lives in NextIntranet: one TemplateComponent (BOM line)
  // per row, with its own refs. This section replaces pcbdata.bom.* with groups
  // built from those line ids and fills extra columns with live warehouse data.
  //
  // Nothing in ibom.js is patched — we only rewrite the data it reads and call
  // populateBomTable() again.
  // ---------------------------------------------------------------------------

  var GROUPING_COLUMNS = ["Part", "Stock", "Location"];
  // Marks a designator the backend knows nothing about — on the board but not in
  // the BOM. Those get one row each so they're impossible to miss.
  var UNKNOWN_MARK = "—";
  var REDRAW_DEBOUNCE_MS = 120;
  var API_REFRESH_MS = 60000;
  var API_REFETCH_DEBOUNCE_MS = 1000;

  var groupingEnabled = !!templateId && params.get("ni_grouping") !== "0";
  var groupingFormatOk = null;   // null = not checked yet
  var baseFlat = null;           // [[ref, refid], …] snapshot of the generated BOM
  var baseGroups = null;         // generated grouping, for clear() to restore
  var lineByRefId = {};          // refid → BOM line id
  var groupingRowCount = 0;
  var lastGroupingUpdate = null;
  var groupingStale = false;
  var redrawTimer = null;
  var refetchTimer = null;
  var refreshTimer = null;
  var unknownRefsWarned = false;

  // iBOM writes field values into the DOM with innerHTML (via highlightFilter),
  // so anything arriving from the API has to be escaped before it is stored.
  function escapeFieldValue(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* Verify the generator used the field layout we know how to rewrite.
     Older iBOM kept extra fields inline in the BOM rows instead of in
     pcbdata.bom.fields; there we leave the table alone. */
  function checkGroupingFormat() {
    if (groupingFormatOk !== null) return groupingFormatOk;
    if (typeof pcbdata === "undefined" || !pcbdata.bom || !pcbdata.bom.both) return false;
    var ok = !!pcbdata.bom.fields
      && typeof pcbdata.bom.fields === "object"
      && !Array.isArray(pcbdata.bom.fields)
      && typeof config !== "undefined"
      && Array.isArray(config.fields)
      && typeof settings !== "undefined"
      && Array.isArray(settings.columnOrder);
    if (!ok) {
      warn("Unsupported iBOM data layout – external grouping disabled.",
        "bom.fields=" + (typeof (pcbdata.bom || {}).fields),
        "config.fields=" + (typeof config !== "undefined" && Array.isArray(config.fields)),
        "The rest of the bridge keeps working.");
    }
    groupingFormatOk = ok;
    return ok;
  }

  /* One-off snapshot of the generated BOM as a flat [ref, refid] list.

     Taken from pcbdata.bom.both rather than pcbdata.footprints so parts the
     generator filtered out (DNP, excluded) don't reappear in the table. Every
     later regroup starts from this snapshot, never from the current state.
     The original group arrays are kept too, so clear() can restore the exact
     generated grouping instead of degrading to one row per component. */
  function copyGroups(groups) {
    var out = [];
    for (var i = 0; i < groups.length; i++) out.push(groups[i].slice());
    return out;
  }

  function snapshotBase() {
    if (baseFlat) return;
    var seen = {};
    baseFlat = [];
    for (var g = 0; g < pcbdata.bom.both.length; g++) {
      var group = pcbdata.bom.both[g];
      for (var e = 0; e < group.length; e++) {
        var entry = group[e];
        if (seen[entry[1]]) continue;
        seen[entry[1]] = true;
        baseFlat.push(entry);
      }
    }
    baseGroups = {
      both: copyGroups(pcbdata.bom.both),
      F: copyGroups(pcbdata.bom.F),
      B: copyGroups(pcbdata.bom.B)
    };
    log("Grouping snapshot:", baseFlat.length, "components");
  }

  /* Add a column: config.fields entry + a padded slot in every row of
     pcbdata.bom.fields (lengths must match or the other columns shift) +
     a place in settings.columnOrder, just before Quantity. Idempotent. */
  function ensureField(name) {
    var idx = config.fields.indexOf(name);
    if (idx < 0) {
      config.fields.push(name);
      idx = config.fields.length - 1;
      for (var refid in pcbdata.bom.fields) {
        if (!pcbdata.bom.fields.hasOwnProperty(refid)) continue;
        var row = pcbdata.bom.fields[refid];
        while (row.length < config.fields.length) row.push("");
      }
      log("Added column", name, "at field index", idx);
    }
    if (settings.columnOrder.indexOf(name) < 0) {
      var q = settings.columnOrder.indexOf("Quantity");
      settings.columnOrder.splice(q < 0 ? settings.columnOrder.length : q, 0, name);
    }
    return idx;
  }

  function ensureAllFields() {
    for (var i = 0; i < GROUPING_COLUMNS.length; i++) ensureField(GROUPING_COLUMNS[i]);
  }

  function setFieldValue(refid, name, value) {
    var row = pcbdata.bom.fields[refid];
    if (!row) return;
    var idx = ensureField(name);
    while (row.length < config.fields.length) row.push("");
    row[idx] = escapeFieldValue(value);
  }

  // Natural order so R2 sorts before R10.
  function compareRefs(a, b) {
    var ma = /^(\D*)(\d*)(.*)$/.exec(a || "");
    var mb = /^(\D*)(\d*)(.*)$/.exec(b || "");
    if (ma[1] !== mb[1]) return ma[1] < mb[1] ? -1 : 1;
    var na = ma[2] === "" ? -1 : parseInt(ma[2], 10);
    var nb = mb[2] === "" ? -1 : parseInt(mb[2], 10);
    if (na !== nb) return na - nb;
    return ma[3] < mb[3] ? -1 : (ma[3] > mb[3] ? 1 : 0);
  }

  function groupKey(refid) {
    var lineId = lineByRefId[refid];
    // Unknown designators stay on their own row instead of being lumped together.
    return lineId ? "line " + lineId : "one " + refid;
  }

  function regroup() {
    if (!groupingEnabled || !checkGroupingFormat()) return;
    snapshotBase();
    ensureAllFields();

    var keys = [];
    var groups = {};
    for (var i = 0; i < baseFlat.length; i++) {
      var entry = baseFlat[i];
      var key = groupKey(entry[1]);
      if (!groups[key]) {
        groups[key] = [];
        keys.push(key);
      }
      groups[key].push(entry);
    }

    var all = [];
    for (var k = 0; k < keys.length; k++) {
      groups[keys[k]].sort(function (a, b) { return compareRefs(a[0], b[0]); });
      all.push(groups[keys[k]]);
    }

    // Known lines first, then the leftovers; both by their first designator, so the
    // order is stable across updates.
    all.sort(function (a, b) {
      var ka = !!lineByRefId[a[0][1]];
      var kb = !!lineByRefId[b[0][1]];
      if (ka !== kb) return ka ? -1 : 1;
      return compareRefs(a[0][0], b[0][0]);
    });

    function onLayer(group, layer) {
      var out = [];
      for (var j = 0; j < group.length; j++) {
        var fp = pcbdata.footprints[group[j][1]];
        if (fp && fp.layer === layer) out.push(group[j]);
      }
      return out;
    }

    pcbdata.bom.both = all;
    pcbdata.bom.F = [];
    pcbdata.bom.B = [];
    for (var g = 0; g < all.length; g++) {
      var front = onLayer(all[g], "F");
      if (front.length) pcbdata.bom.F.push(front);
      var back = onLayer(all[g], "B");
      if (back.length) pcbdata.bom.B.push(back);
    }

    groupingRowCount = all.length;
    log("Regrouped into", all.length, "rows");
  }

  function redrawTable() {
    if (typeof populateBomTable !== "function") return;
    // Keep the user's context: remember the highlighted footprint and re-apply it.
    var keep = (typeof lastClicked !== "undefined") ? lastClicked : null;
    syncInProgress = true;
    try {
      populateBomTable();
      refreshMarkedFootprintsFromSettings();
      if (typeof drawHighlights === "function") drawHighlights();
    } finally {
      syncInProgress = false;
    }
    if (keep !== null && keep !== undefined && typeof footprintsClicked === "function") {
      highlightInProgress = true;
      try {
        footprintsClicked([keep]);
      } catch (e) {
        // The row may have been filtered out — not worth failing the redraw over.
        log("Could not restore highlight for footprint", keep);
      } finally {
        highlightInProgress = false;
      }
    }
  }

  function scheduleRegroup() {
    if (!groupingEnabled) return;
    if (redrawTimer) clearTimeout(redrawTimer);
    redrawTimer = setTimeout(function () {
      redrawTimer = null;
      regroup();
      redrawTable();
      updateGroupingStatus();
    }, REDRAW_DEBOUNCE_MS);
  }

  function updateGroupingStatus() {
    if (!groupingEnabled) return;
    if (!checkGroupingFormat()) {
      setGroupingStatus("grouping: unsupported iBOM layout");
      return;
    }
    if (!lastGroupingUpdate) {
      setGroupingStatus("grouping: waiting for data");
      return;
    }
    var when = lastGroupingUpdate.toTimeString().slice(0, 8);
    setGroupingStatus("grouping: " + groupingRowCount + " rows · "
      + (groupingStale ? "stale since " : "updated ") + when);
  }

  /* Merge BOM lines into the ref→line map and the extra columns.

     Items are per-designator: {ref, line_id, part, stock, needed, shortage, location}.
     `replace` drops the previous map first (full state); otherwise this is a patch. */
  function ingestItems(items, replace) {
    if (!groupingEnabled || !checkGroupingFormat()) return;
    if (!items) return;
    if (!Array.isArray(items)) items = [items];

    snapshotBase();
    ensureAllFields();

    if (replace) {
      lineByRefId = {};
      // Clear stale column values so a removed line doesn't leave its part behind.
      for (var b = 0; b < baseFlat.length; b++) {
        for (var c = 0; c < GROUPING_COLUMNS.length; c++) {
          setFieldValue(baseFlat[b][1], GROUPING_COLUMNS[c], "");
        }
      }
    }

    var unknown = 0;
    for (var i = 0; i < items.length; i++) {
      var it = items[i] || {};
      var refid = (it.refid !== undefined && it.refid !== null) ? it.refid : refToIndex(it.ref);
      if (refid === undefined || refid === null || refid < 0) {
        unknown++;
        continue;
      }
      if (it.line_id) {
        lineByRefId[refid] = String(it.line_id);
      } else if (replace) {
        delete lineByRefId[refid];
      }
      // An empty part here means the BOM line exists but has no warehouse component
      // linked yet — different from "not in the BOM at all", marked below.
      setFieldValue(refid, "Part", it.part || "");
      setFieldValue(refid, "Stock", formatStock(it));
      setFieldValue(refid, "Location", it.location || "");
    }

    // Anything the backend didn't mention is on the board but not in the BOM. Mark it
    // so a row that stands alone can be told apart from a genuine single-part line.
    for (var m = 0; m < baseFlat.length; m++) {
      if (!lineByRefId[baseFlat[m][1]]) {
        setFieldValue(baseFlat[m][1], "Part", UNKNOWN_MARK);
      }
    }

    if (unknown && !unknownRefsWarned) {
      unknownRefsWarned = true;
      warn("Grouping data referenced", unknown, "designator(s) not present on this board.",
        "They are ignored; further occurrences are not logged.");
    }

    lastGroupingUpdate = new Date();
    groupingStale = false;
    scheduleRegroup();
  }

  function formatStock(item) {
    if (item.stock === null || item.stock === undefined) return "";
    var text = String(item.stock);
    if (item.needed !== null && item.needed !== undefined) text += " / " + item.needed;
    return item.shortage ? "⚠ " + text : text;
  }

  /* Expand the /ibom-state/ payload (one entry per BOM line) into per-designator
     items. Shared by the REST fetch here and by the WS push from the React app,
     which sends the already-expanded form. */
  function itemsFromState(state) {
    var items = [];
    var lines = (state && state.components) || [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var refs = Array.isArray(line.refs) ? line.refs : [];
      for (var r = 0; r < refs.length; r++) {
        items.push({
          ref: refs[r],
          line_id: line.id,
          part: line.component_name || "",
          stock: line.in_stock,
          needed: line.needed_total,
          shortage: line.shortage,
          location: line.location,
        });
      }
    }
    return items;
  }

  function apiBaseUrl() {
    var host = apiHost || window.location.host;
    return window.location.protocol + "//" + host;
  }

  function loadFromApi() {
    if (!groupingEnabled || !templateId) return Promise.resolve();
    if (typeof fetch !== "function") {
      warn("fetch() unavailable – grouping will rely on WebSocket pushes only.");
      return Promise.resolve();
    }
    var url = apiBaseUrl() + "/api/v1/production/templates/"
      + encodeURIComponent(templateId) + "/ibom-state/?stock=1";
    var headers = token ? { Authorization: "Bearer " + token } : {};
    log("Fetching BOM state:", url);
    return fetch(url, { headers: headers, credentials: "omit" })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (state) {
        var items = itemsFromState(state);
        log("BOM state loaded:", (state.components || []).length, "lines,", items.length, "designators");
        ingestItems(items, true);
      })
      .catch(function (err) {
        // Never log the URL here — it is the one place the token would leak.
        warn("BOM state fetch failed:", err.message || err,
          "Keeping the last known grouping; WS pushes still apply.");
        groupingStale = true;
        updateGroupingStatus();
      });
  }

  function scheduleRefetch() {
    if (!groupingEnabled) return;
    if (refetchTimer) return;
    refetchTimer = setTimeout(function () {
      refetchTimer = null;
      loadFromApi();
    }, API_REFETCH_DEBOUNCE_MS);
  }

  function waitForIbom(fn) {
    if (typeof pcbdata !== "undefined" && pcbdata.bom
        && typeof populateBomTable === "function"
        && typeof settings !== "undefined" && settings.columnOrder
        && settings.columnOrder.length) {
      fn();
      return;
    }
    setTimeout(function () { waitForIbom(fn); }, 50);
  }

  function startGrouping() {
    if (!groupingEnabled) {
      log("External grouping inactive (no template_id, or ni_grouping=0).");
      return;
    }
    waitForIbom(function () {
      if (!checkGroupingFormat()) {
        updateGroupingStatus();
        return;
      }
      snapshotBase();
      ensureAllFields();
      updateGroupingStatus();
      // Paint the (still empty) live columns right away, so the header row
      // doesn't silently change later on the first user-triggered redraw.
      redrawTable();
      loadFromApi();
      // Slow refresh so a kiosk tab left open still tracks stock movements.
      refreshTimer = setInterval(loadFromApi, API_REFRESH_MS);
    });
  }

  // ---------------------------------------------------------------------------
  // 7. Start connection
  // ---------------------------------------------------------------------------

  window.addEventListener("online", function () {
    log("Browser ONLINE event fired. Reconnecting immediately.");
    connect();
  });

  window.addEventListener("offline", function () {
    warn("Browser OFFLINE event fired. WS reconnect will likely fail until network is restored.");
  });

  document.addEventListener("visibilitychange", function () {
    log("Visibility changed:", document.visibilityState);
    if (document.visibilityState === "visible") {
      connect();
      // The tab may have slept through several updates.
      scheduleRefetch();
    }
  });

  window.NIBridgeDebug = {
    connect: connect,
    wsUrl: sanitizeWsUrl(wsUrl),
    getState: function () {
      return {
        hasSocket: !!ws,
        readyState: ws ? wsStateToText(ws.readyState) : "NO_SOCKET",
        connectAttempt: connectAttempt,
        reconnectScheduled: !!reconnectTimer,
        checkboxEditLocked: ibomCheckboxEditingLocked,
        online: navigator.onLine,
        visibility: document.visibilityState
      };
    },
    grouping: {
      applyItems: function (items) { ingestItems(items, true); },
      patchItems: function (items) { ingestItems(items, false); },
      clear: function () {
        lineByRefId = {};
        if (baseGroups) {
          // Back to the generated grouping, with the live column values wiped.
          // The columns themselves stay — removing them would mean rewriting
          // every pcbdata.bom.fields row again.
          pcbdata.bom.both = copyGroups(baseGroups.both);
          pcbdata.bom.F = copyGroups(baseGroups.F);
          pcbdata.bom.B = copyGroups(baseGroups.B);
          groupingRowCount = baseGroups.both.length;
          for (var b = 0; b < baseFlat.length; b++) {
            for (var c = 0; c < GROUPING_COLUMNS.length; c++) {
              setFieldValue(baseFlat[b][1], GROUPING_COLUMNS[c], "");
            }
          }
        } else {
          regroup();
        }
        redrawTable();
        lastGroupingUpdate = null;
        updateGroupingStatus();
      },
      regroup: function () { regroup(); redrawTable(); },
      redraw: redrawTable,
      loadFromApi: loadFromApi,
      state: function () {
        return {
          enabled: groupingEnabled,
          formatSupported: checkGroupingFormat(),
          templateId: templateId || null,
          snapshotSize: baseFlat ? baseFlat.length : 0,
          mappedRefs: Object.keys(lineByRefId).length,
          rows: groupingRowCount,
          stale: groupingStale,
          lastUpdate: lastGroupingUpdate ? lastGroupingUpdate.toISOString() : null,
          columns: GROUPING_COLUMNS
        };
      }
    }
  };

  log("Debug helper available as window.NIBridgeDebug");
  if (wsEnabled) {
    log("Bridge active – starting WS connection");
    connect();
  } else {
    setStatus("disconnected");
  }
  startGrouping();
})();
