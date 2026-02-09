/**
 * healthEndpoints.js - Health, diagnostics, and lifecycle endpoints
 *
 * Handles server health checks, UI thread testing, and graceful shutdown.
 *
 * @module server/endpoints/healthEndpoints
 * @requires server/serverConfig (optional)
 * @requires server/operationQueue (optional)
 * @requires server/modelSnapshot (optional)
 * @requires server/loggingQueue
 */

(function() {
    "use strict";

    // Guard against double-loading
    if (typeof globalThis !== "undefined" && typeof globalThis.healthEndpoints !== "undefined") {
        return;
    }

    // Java imports
    var Runtime = Java.type("java.lang.Runtime");

    /**
     * Health and lifecycle endpoint handlers
     */
    var healthEndpoints = {
        /**
         * Handle GET /health - Server health check with detailed system info
         * @param {Object} request - HTTP request object
         * @param {Object} response - HTTP response object
         * @param {Object} serverState - Server state object with serverInstance
         */
        handleHealth: function(request, response, serverState) {
            // Get version from serverConfig if available
            var version = "1.0.0";
            var port = 8765;
            var host = "127.0.0.1";
            if (typeof serverConfig !== "undefined" && serverConfig.server) {
                version = serverConfig.server.version || version;
                port = serverConfig.server.port || port;
                host = serverConfig.server.host || host;
            }

            // Get queue statistics
            var queueStats = null;
            if (typeof operationQueue !== "undefined" && operationQueue.getQueueStats) {
                queueStats = operationQueue.getQueueStats();
            }

            // Get model info
            var modelInfo = null;
            if (serverState.modelRef) {
                try {
                    modelInfo = {
                        name: serverState.modelRef.getName(),
                        id: serverState.modelRef.getId()
                    };
                    // Refresh snapshot to get accurate counts
                    if (typeof modelSnapshot !== "undefined" && modelSnapshot.refreshSnapshot) {
                        modelSnapshot.refreshSnapshot(serverState.modelRef);
                    }
                    // Add snapshot stats if available
                    if (typeof modelSnapshot !== "undefined" && modelSnapshot.getSnapshot) {
                        var snapshot = modelSnapshot.getSnapshot();
                        if (snapshot) {
                            modelInfo.elements = snapshot.elements ? snapshot.elements.length : 0;
                            modelInfo.relationships = snapshot.relationships ? snapshot.relationships.length : 0;
                            modelInfo.views = snapshot.views ? snapshot.views.length : 0;
                        }
                    }
                } catch (e) {
                    modelInfo = { error: String(e) };
                }
            }

            // Get memory info
            var runtime = Runtime.getRuntime();
            var memoryInfo = {
                totalMB: Math.round(runtime.totalMemory() / (1024 * 1024)),
                freeMB: Math.round(runtime.freeMemory() / (1024 * 1024)),
                usedMB: Math.round((runtime.totalMemory() - runtime.freeMemory()) / (1024 * 1024)),
                maxMB: Math.round(runtime.maxMemory() / (1024 * 1024))
            };

            response.body = {
                status: serverState.serverInstance.getState() === "running" ? "ok" : "stopping",
                version: version,
                server: {
                    port: port,
                    host: host,
                    uptime: serverState.startTime ? Date.now() - serverState.startTime : null
                },
                operations: queueStats,
                model: modelInfo,
                memory: memoryInfo,
                timestamp: new Date().toISOString()
            };
        },

        /**
         * Handle GET /test - UI thread test endpoint
         * @param {Object} request - HTTP request object
         * @param {Object} response - HTTP response object
         * @param {Object} serverState - Server state object with modelRef
         */
        handleTest: function(request, response, serverState) {
            if (typeof loggingQueue !== "undefined" && loggingQueue) {
                loggingQueue.log("[" + request.requestId + "] Test endpoint called");
            }

            // Handler runs on UI thread (Display executor), so we can use JS directly!
            var msg = "Handler running on UI thread!";
            msg += " Thread: " + java.lang.Thread.currentThread().getName();

            // Check model reference
            if (serverState.modelRef) {
                msg += " Model: " + serverState.modelRef.getName();
                var purpose = serverState.modelRef.getPurpose();
                if (purpose) {
                    msg += " (" + purpose + ")";
                }
            } else {
                msg += " No model reference.";
            }

            response.body = {
                success: true,
                message: msg
            };
        },

        /**
         * Handle GET /model/diagnostics - Detect ghost/orphan objects and model health
         * @param {Object} request - HTTP request object
         * @param {Object} response - HTTP response object
         * @param {Object} serverState - Server state object with modelRef
         */
        handleDiagnostics: function(request, response, serverState) {
            if (!serverState.modelRef) {
                response.status = 400;
                response.body = { error: "No model loaded" };
                return;
            }

            var result = {
                timestamp: new Date().toISOString(),
                model: {
                    name: serverState.modelRef.getName(),
                    id: serverState.modelRef.getId()
                }
            };

            // Run orphan detection if modelSnapshot supports it
            if (typeof modelSnapshot !== "undefined" && modelSnapshot.detectOrphans) {
                try {
                    var orphanResult = modelSnapshot.detectOrphans(serverState.modelRef);
                    result.orphans = orphanResult;
                } catch (e) {
                    result.orphans = { error: "Orphan detection failed: " + String(e) };
                }
            } else {
                result.orphans = { error: "Orphan detection not available" };
            }

            // Include snapshot summary
            if (typeof modelSnapshot !== "undefined" && modelSnapshot.getSummary) {
                result.snapshot = modelSnapshot.getSummary();
            }

            response.body = result;
        },

        /**
         * Handle POST /shutdown - Trigger server shutdown
         * @param {Object} request - HTTP request object
         * @param {Object} response - HTTP response object
         * @param {Object} serverState - Server state object (unused)
         */
        handleShutdown: function(request, response, serverState) {
            if (typeof loggingQueue !== "undefined" && loggingQueue) {
                loggingQueue.log("[" + request.requestId + "] Shutdown requested");
            }

            // Check for in-flight operations
            var inFlightCount = 0;
            if (typeof operationQueue !== "undefined" && operationQueue.getInFlightCount) {
                inFlightCount = operationQueue.getInFlightCount();
            }

            response.body = {
                status: "stopping",
                message: "Server shutdown initiated",
                inFlightOperations: inFlightCount
            };

            // Trigger shutdown after response sent
            var Thread = Java.type("java.lang.Thread");
            Thread.sleep(100);

            // Shutdown will be triggered by caller
        }
    };

    // Export globally for JArchi
    if (typeof globalThis !== "undefined") {
        globalThis.healthEndpoints = healthEndpoints;
    } else if (typeof global !== "undefined") {
        global.healthEndpoints = healthEndpoints;
    }

    // CommonJS for Node.js build tools
    if (typeof module !== "undefined" && module.exports) {
        module.exports = healthEndpoints;
    }

})();
