/**
 * apiEndpoints.js - HTTP endpoint handlers facade for Model API Server
 *
 * This is a facade module that loads and re-exports all endpoint handlers
 * from their respective single-responsibility modules. This maintains
 * backward compatibility while keeping the codebase modular.
 *
 * Endpoint modules:
 *   - healthEndpoints: /health, /test, /shutdown
 *   - modelEndpoints: /model/query, /model/plan, /model/apply
 *   - operationEndpoints: /ops/status, /ops/list
 *   - scriptEndpoints: /scripts/run
 *
 * @module server/apiEndpoints
 * @requires server/endpoints/healthEndpoints
 * @requires server/endpoints/modelEndpoints
 * @requires server/endpoints/operationEndpoints
 * @requires server/endpoints/scriptEndpoints
 */

(function() {
    "use strict";

    // Guard against double-loading
    if (typeof globalThis !== "undefined" && typeof globalThis.apiEndpoints !== "undefined") {
        return;
    }

    // Determine __DIR__ for loading sub-modules
    // In JArchi, __DIR__ is set per script. When loaded via load(), we need to derive the path.
    var endpointsDir;
    if (typeof __DIR__ !== "undefined") {
        endpointsDir = __DIR__ + "endpoints/";
    } else {
        // Fallback: assume we're in lib/server/
        endpointsDir = "lib/server/endpoints/";
    }

    // Load endpoint modules
    load(endpointsDir + "healthEndpoints.js");
    load(endpointsDir + "modelEndpoints.js");
    load(endpointsDir + "operationEndpoints.js");
    load(endpointsDir + "scriptEndpoints.js");
    load(endpointsDir + "viewEndpoints.js");

    /**
     * Combined API endpoint handlers - delegates to specialized modules
     * Maintains backward compatibility with existing Start Server.ajs
     */
    var apiEndpoints = {
        // Health & lifecycle endpoints
        handleHealth: function(request, response, serverState) {
            return healthEndpoints.handleHealth(request, response, serverState);
        },
        handleTest: function(request, response, serverState) {
            return healthEndpoints.handleTest(request, response, serverState);
        },
        handleShutdown: function(request, response, serverState) {
            return healthEndpoints.handleShutdown(request, response, serverState);
        },
        handleDiagnostics: function(request, response, serverState) {
            return healthEndpoints.handleDiagnostics(request, response, serverState);
        },

        // Model operation endpoints
        handleQuery: function(request, response, serverState) {
            return modelEndpoints.handleQuery(request, response, serverState);
        },
        handleStats: function(request, response, serverState) {
            return modelEndpoints.handleStats(request, response, serverState);
        },
        handlePlan: function(request, response, serverState) {
            return modelEndpoints.handlePlan(request, response, serverState);
        },
        handleApply: function(request, response, serverState) {
            return modelEndpoints.handleApply(request, response, serverState);
        },

        // Operation status endpoints
        handleOpStatus: function(request, response, serverState) {
            return operationEndpoints.handleOpStatus(request, response, serverState);
        },
        handleOpList: function(request, response, serverState) {
            return operationEndpoints.handleOpList(request, response, serverState);
        },

        // Script execution endpoint
        handleScriptRun: function(request, response, serverState, scriptsDir) {
            return scriptEndpoints.handleScriptRun(request, response, serverState, scriptsDir);
        },

        // View management endpoints
        handleListViews: function(request, response, serverState) {
            return viewEndpoints.handleListViews(request, response, serverState);
        },
        handleGetView: function(request, response, serverState) {
            return viewEndpoints.handleGetView(request, response, serverState);
        },
        handleCreateView: function(request, response, serverState) {
            return viewEndpoints.handleCreateView(request, response, serverState);
        },
        handleExportView: function(request, response, serverState) {
            return viewEndpoints.handleExportView(request, response, serverState);
        },
        handleDeleteView: function(request, response, serverState) {
            return viewEndpoints.handleDeleteView(request, response, serverState);
        },
        handleDuplicateView: function(request, response, serverState) {
            return viewEndpoints.handleDuplicateView(request, response, serverState);
        },
        handleSetViewRouter: function(request, response, serverState) {
            return viewEndpoints.handleSetViewRouter(request, response, serverState);
        },
        handleLayoutView: function(request, response, serverState) {
            return viewEndpoints.handleLayoutView(request, response, serverState);
        },
        handleValidateView: function(request, response, serverState) {
            return viewEndpoints.handleValidateView(request, response, serverState);
        },

        // Model search and element inspection endpoints
        handleSearch: function(request, response, serverState) {
            return modelEndpoints.handleSearch(request, response, serverState);
        },
        handleGetElement: function(request, response, serverState) {
            return modelEndpoints.handleGetElement(request, response, serverState);
        },
        handleListFolders: function(request, response, serverState) {
            return modelEndpoints.handleListFolders(request, response, serverState);
        },
        handleSave: function(request, response, serverState) {
            return modelEndpoints.handleSave(request, response, serverState);
        }
    };

    // Export globally for JArchi
    if (typeof globalThis !== "undefined") {
        globalThis.apiEndpoints = apiEndpoints;
    } else if (typeof global !== "undefined") {
        global.apiEndpoints = apiEndpoints;
    }

    // CommonJS for Node.js build tools
    if (typeof module !== "undefined" && module.exports) {
        module.exports = apiEndpoints;
    }

})();
