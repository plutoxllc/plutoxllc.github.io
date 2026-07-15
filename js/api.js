// NexLaunch frontend adapter for the local SP-API sandbox server.
// Self-contained — no edits to other files required. Include with:
//   <script src="js/api.js"></script>
// Callers should treat a null return as "server unavailable" and fall back
// to demo data.
(function () {
  'use strict';

  var BASE_URL = 'http://localhost:4879';
  // Production /api/xray is two sequential SP-API round-trips (catalog+offers,
  // then fees at the real Buy Box price) plus a possible LWA token exchange —
  // keep this generous; failures still silently fall back to demo data.
  var TIMEOUT_MS = 10000;

  function fetchJson(url) {
    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, TIMEOUT_MS);

    return fetch(url, { signal: controller.signal })
      .then(function (res) {
        if (!res.ok) {
          // Non-2xx (e.g. credentials not configured) — treat as
          // unavailable so callers fall back to demo data.
          return null;
        }
        return res.json();
      })
      .catch(function () {
        // Server down, timeout, CORS, bad JSON — all silently map to null.
        return null;
      })
      .finally(function () {
        clearTimeout(timer);
      });
  }

  window.NexApi = {
    /**
     * Fetch live X-Ray data for an ASIN (or search query) from the local
     * SP-API sandbox server. Resolves to the parsed JSON payload, or null
     * on any failure (server not running, timeout, or a non-2xx error
     * response — callers should fall back to demo data).
     */
    serverXray: function (asinOrQuery) {
      var url =
        BASE_URL + '/api/xray?asin=' + encodeURIComponent(asinOrQuery || '');
      return fetchJson(url);
    },

    /**
     * Check whether the local server is up and configured.
     * Resolves to { ok, configured } or null if the server is unreachable.
     */
    health: function () {
      return fetchJson(BASE_URL + '/api/health');
    },
  };
})();
