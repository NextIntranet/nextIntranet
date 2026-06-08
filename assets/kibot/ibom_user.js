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

  if (typeof WebSocket === "undefined") {
    warn("WebSocket API is not available in this browser/runtime.");
    return;
  }

  if (!stationId && !wsUrl) {
    log("No station_id or ws_url in query string – bridge INACTIVE. Params available:", Array.from(params.keys()).join(", ") || "(none)");
    return;
  }

  if (!wsUrl) {
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

  if (window.location.protocol === "https:" && wsUrl.indexOf("ws://") === 0) {
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
        "transition:background-color .3s;pointer-events:none;}";
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

  function setStatus(state) {
    if (!dot && !ensureStatusElements()) {
      log("Status pending (DOM not ready):", state);
      return;
    }
    dot.style.backgroundColor = STATUS_COLORS[state] || STATUS_COLORS.disconnected;
    dot.title = "NI bridge: " + state;
    log("Status →", state);
  }
  setStatus("connecting");

  // ---------------------------------------------------------------------------
  // 3. Ref ↔ footprint-index helpers
  // ---------------------------------------------------------------------------

  function refToIndex(ref) {
    if (typeof pcbdata === "undefined") return -1;
    for (var i = 0; i < pcbdata.footprints.length; i++) {
      if (pcbdata.footprints[i].ref === ref) return i;
    }
    return -1;
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
  var stateRequestTimer = null;

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

  function requestStateFromNi(reason) {
    log("Requesting current Sourced/Placed state from NextIntranet", reason ? "(" + reason + ")" : "");
    send("ibom.request_state", {
      templateId: templateId,
    });
  }

  function scheduleStateRequest(reason) {
    if (stateRequestTimer) {
      clearTimeout(stateRequestTimer);
    }
    stateRequestTimer = setTimeout(function () {
      stateRequestTimer = null;
      requestStateFromNi(reason);
    }, 250);
  }

  function connect() {
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
      scheduleStateRequest("ws-open");
    };

    ws.onmessage = function (event) {
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
      log("iBOM highlight event, refs:", e.args.refs ? e.args.refs.length + " refs" : "none");
      send("ibom.hover", {
        refs: e.args.refs,
        net: e.args.net,
        rowid: e.args.rowid,
      });
    });

    EventHandler.registerCallback(IBOM_EVENT_TYPES.CHECKBOX_CHANGE_EVENT, function (e) {
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
    if (typeof footprintIndexToHandler !== "undefined" && footprintIndexToHandler[idx]) {
      footprintIndexToHandler[idx]();
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
    populateBomTable();
    refreshMarkedFootprintsFromSettings();
    drawHighlights();
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
      scheduleStateRequest("visibility-visible");
    }
  });

  window.NIBridgeDebug = {
    connect: connect,
    wsUrl: sanitizeWsUrl(wsUrl),
    requestStateFromNi: requestStateFromNi,
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
    }
  };

  log("Debug helper available as window.NIBridgeDebug");
  log("Bridge active – starting WS connection");
  connect();
})();
