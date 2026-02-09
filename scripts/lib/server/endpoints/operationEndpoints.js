/**
 * operationEndpoints.js - Async operation status tracking endpoints
 *
 * Handles polling and listing for queued asynchronous operations.
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
                    errorDetails: operation.errorDetails || null,
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
        },

        /**
         * Handle GET /ops/list - List recent operations
         * @param {Object} request - HTTP request object with optional query.limit and query.status
         * @param {Object} response - HTTP response object
         * @param {Object} serverState - Server state object (unused)
         */
        handleOpList: function(request, response, serverState) {
            var query = request.query || {};
            var limitRaw = query.limit;
            var statusRaw = query.status;

            var limit = 20;
            if (limitRaw !== undefined && limitRaw !== null && String(limitRaw).trim() !== "") {
                limit = parseInt(String(limitRaw), 10);
                if (!isFinite(limit) || limit < 1) {
                    response.statusCode = 400;
                    response.body = {
                        error: {
                            code: "BadRequest",
                            message: "Invalid 'limit' query parameter. Must be an integer >= 1"
                        }
                    };
                    return;
                }
                if (limit > 200) {
                    response.statusCode = 400;
                    response.body = {
                        error: {
                            code: "BadRequest",
                            message: "Invalid 'limit' query parameter. Must be <= 200"
                        }
                    };
                    return;
                }
            }

            var status = null;
            if (statusRaw !== undefined && statusRaw !== null && String(statusRaw).trim() !== "") {
                status = String(statusRaw).trim().toLowerCase();
                if (status !== "queued" && status !== "processing" && status !== "complete" && status !== "error") {
                    response.statusCode = 400;
                    response.body = {
                        error: {
                            code: "BadRequest",
                            message: "Invalid 'status' query parameter. Valid values: queued, processing, complete, error"
                        }
                    };
                    return;
                }
            }

            var listResult = operationQueue.listOperations({
                limit: limit,
                status: status || undefined
            });

            response.body = {
                operations: listResult.operations,
                total: listResult.total,
                limit: listResult.limit,
                status: listResult.status
            };
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
