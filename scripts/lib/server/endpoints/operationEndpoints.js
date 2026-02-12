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
        _parseBooleanQuery: function(rawValue, defaultValue) {
            if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") {
                return defaultValue;
            }
            var normalized = String(rawValue).trim().toLowerCase();
            if (normalized === "1" || normalized === "true" || normalized === "yes") return true;
            if (normalized === "0" || normalized === "false" || normalized === "no") return false;
            return null;
        },

        _parseIntegerQuery: function(rawValue, defaultValue, min, max) {
            if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") {
                return defaultValue;
            }
            var parsed = parseInt(String(rawValue), 10);
            if (!isFinite(parsed) || parsed < min || parsed > max) {
                return null;
            }
            return parsed;
        },

        _paginateArray: function(items, cursor, pageSize) {
            var safeItems = Array.isArray(items) ? items : [];
            var start = cursor;
            if (!isFinite(start) || start < 0) start = 0;
            var size = pageSize;
            if (!isFinite(size) || size < 1) size = safeItems.length || 1;

            var page = safeItems.slice(start, start + size);
            var hasMore = start + page.length < safeItems.length;
            return {
                page: page,
                total: safeItems.length,
                cursor: String(start),
                pageSize: size,
                hasMore: hasMore,
                nextCursor: hasMore ? String(start + page.length) : null
            };
        },

        /**
         * Handle GET /ops/status - Poll operation status
         * @param {Object} request - HTTP request object with query.opId
         * @param {Object} response - HTTP response object
         * @param {Object} serverState - Server state object (unused)
         */
        handleOpStatus: function(request, response, serverState) {
            var opId = request.query.opId;
            var summaryOnly = this._parseBooleanQuery(request.query.summaryOnly, false);
            var cursor = this._parseIntegerQuery(request.query.cursor, 0, 0, 1000000);
            var pageSize = this._parseIntegerQuery(request.query.pageSize, 200, 1, 1000);

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

            if (summaryOnly === null) {
                response.statusCode = 400;
                response.body = {
                    error: {
                        code: "BadRequest",
                        message: "Invalid 'summaryOnly' query parameter. Use true/false"
                    }
                };
                return;
            }

            if (cursor === null) {
                response.statusCode = 400;
                response.body = {
                    error: {
                        code: "BadRequest",
                        message: "Invalid 'cursor' query parameter. Must be an integer >= 0"
                    }
                };
                return;
            }

            if (pageSize === null) {
                response.statusCode = 400;
                response.body = {
                    error: {
                        code: "BadRequest",
                        message: "Invalid 'pageSize' query parameter. Must be an integer 1-1000"
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
                var pagedResult = this._paginateArray(operation.result, cursor, pageSize);
                response.body = {
                    operationId: opId,
                    status: "complete",
                    result: summaryOnly ? undefined : pagedResult.page,
                    totalResultCount: pagedResult.total,
                    cursor: pagedResult.cursor,
                    pageSize: pagedResult.pageSize,
                    hasMore: pagedResult.hasMore,
                    nextCursor: pagedResult.nextCursor,
                    summaryOnly: summaryOnly,
                    digest: operation.digest || null,
                    timeline: operation.timeline || [],
                    tempIdMap: operation.tempIdMap || {},
                    tempIdMappings: operation.tempIdMappings || [],
                    retryHints: operation.retryHints || null,
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
                    summaryOnly: summaryOnly,
                    digest: operation.digest || null,
                    timeline: operation.timeline || [],
                    tempIdMap: operation.tempIdMap || {},
                    tempIdMappings: operation.tempIdMappings || [],
                    retryHints: operation.retryHints || null,
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
                    summaryOnly: summaryOnly,
                    digest: operation.digest || null,
                    timeline: operation.timeline || [],
                    tempIdMap: operation.tempIdMap || {},
                    tempIdMappings: operation.tempIdMappings || [],
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
            var cursorRaw = query.cursor;
            var summaryOnlyRaw = query.summaryOnly;

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

            var cursor = this._parseIntegerQuery(cursorRaw, 0, 0, 1000000);
            if (cursor === null) {
                response.statusCode = 400;
                response.body = {
                    error: {
                        code: "BadRequest",
                        message: "Invalid 'cursor' query parameter. Must be an integer >= 0"
                    }
                };
                return;
            }

            var summaryOnly = this._parseBooleanQuery(summaryOnlyRaw, false);
            if (summaryOnly === null) {
                response.statusCode = 400;
                response.body = {
                    error: {
                        code: "BadRequest",
                        message: "Invalid 'summaryOnly' query parameter. Use true/false"
                    }
                };
                return;
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
                status: status || undefined,
                cursor: cursor,
                summaryOnly: summaryOnly
            });

            response.body = {
                operations: listResult.operations,
                total: listResult.total,
                limit: listResult.limit,
                status: listResult.status,
                cursor: listResult.cursor,
                hasMore: listResult.hasMore,
                nextCursor: listResult.nextCursor,
                summaryOnly: listResult.summaryOnly
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
