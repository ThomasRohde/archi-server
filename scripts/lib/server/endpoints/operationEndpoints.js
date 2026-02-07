/**
 * operationEndpoints.js - Async operation status tracking endpoints
 *
 * Handles polling for status of queued asynchronous operations.
 *
 * @module server/endpoints/operationEndpoints
 * @requires server/operationQueue
 */

(function() {
    "use strict";

    // Guard against double-loading
    if (typeof globalThis !== "undefined" && typeof globalThis.operationEndpoints !== "undefined") {
        return;
    }

    /**
     * Operation status endpoint handlers
     */
    var operationEndpoints = {
        /**
         * Handle GET /ops/status - Poll operation status
         * @param {Object} request - HTTP request object with query.opId
         * @param {Object} response - HTTP response object
         * @param {Object} serverState - Server state object (unused)
         */
        handleOpStatus: function(request, response, serverState) {
            var opId = request.query.opId;

            if (!opId) {
                response.statusCode = 400;
                response.body = {
                    error: {
                        code: "BadRequest",
                        message: "Missing 'opId' query parameter"
                    }
                };
                return;
            }

            var operation = operationQueue.getOperationStatus(opId);

            if (!operation) {
                response.statusCode = 404;
                response.body = {
                    error: {
                        code: "NotFound",
                        message: "Operation not found: " + opId
                    }
                };
                return;
            }

            // Return operation status
            if (operation.status === "complete") {
                response.body = {
                    operationId: opId,
                    status: "complete",
                    result: operation.result,
                    createdAt: operation.createdAt,
                    startedAt: operation.startedAt,
                    completedAt: operation.completedAt,
                    durationMs: operation.completedAt && operation.startedAt ?
                        new Date(operation.completedAt).getTime() - new Date(operation.startedAt).getTime() : null
                };
            } else if (operation.status === "error") {
                response.body = {
                    operationId: opId,
                    status: "error",
                    error: operation.error,
                    createdAt: operation.createdAt,
                    startedAt: operation.startedAt,
                    completedAt: operation.completedAt,
                    durationMs: operation.completedAt && operation.startedAt ?
                        new Date(operation.completedAt).getTime() - new Date(operation.startedAt).getTime() : null
                };
            } else {
                response.body = {
                    operationId: opId,
                    status: operation.status,
                    message: "Operation in progress",
                    createdAt: operation.createdAt,
                    startedAt: operation.startedAt
                };
            }
        }
    };

    // Export globally for JArchi
    if (typeof globalThis !== "undefined") {
        globalThis.operationEndpoints = operationEndpoints;
    } else if (typeof global !== "undefined") {
        global.operationEndpoints = operationEndpoints;
    }

    // CommonJS for Node.js build tools
    if (typeof module !== "undefined" && module.exports) {
        module.exports = operationEndpoints;
    }

})();
