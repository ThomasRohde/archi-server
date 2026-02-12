/**
 * operationQueue.js - Async operation queue with Display.timerExec processor
 *
 * Manages a queue of model operations that are processed asynchronously on the
 * SWT Display thread. Uses undoableCommands for all model modifications to ensure
 * proper undo/redo support. Operations are processed in batches with status tracking.
 *
 * Production hardening features:
 *   - Operation timeout with automatic failure
 *   - Configurable via serverConfig
 *   - Clean operation status tracking
 *
 * @module server/operationQueue
 * @requires lib/core/undoableCommands
 * @requires server/modelSnapshot
 * @requires server/loggingQueue
 * @requires server/serverConfig (optional)
 */

(function() {
    "use strict";

    // Guard against double-loading
    if (typeof globalThis !== "undefined" && typeof globalThis.operationQueue !== "undefined") {
        return;
    }

    // Java imports
    var ConcurrentLinkedQueue = Java.type("java.util.concurrent.ConcurrentLinkedQueue");

    /**
     * Async operation queue with processor
     */
    var operationQueue = {
        /**
         * Thread-safe queue for pending operations
         * @type {java.util.concurrent.ConcurrentLinkedQueue}
         */
        queue: new ConcurrentLinkedQueue(),

        /**
         * Map of operation ID to operation descriptor
         * @type {Object}
         */
        pendingOperations: {},

        /**
         * Processor state
         * @private
         */
        _processorRunning: false,
        _displayRef: null,
        _modelRef: null,
        _processorCycleCount: 0,
        _onUpdateCountCallback: null,
        _commandStackListenerHandle: null,
        _isProcessingBatch: false,

        /**
         * Get configuration from serverConfig or use defaults
         * @returns {Object} Configuration object
         * @private
         */
        _getConfig: function() {
            if (typeof serverConfig !== "undefined" && serverConfig.operations) {
                return {
                    processorInterval: serverConfig.operations.processorInterval || 50,
                    maxOpsPerCycle: serverConfig.operations.maxOpsPerCycle || 10,
                    cleanupInterval: serverConfig.operations.cleanupInterval || 100,
                    maxOperationAge: serverConfig.operations.maxOperationAge || 3600000,
                    timeoutMs: serverConfig.operations.timeoutMs || 60000
                };
            }
            return {
                processorInterval: 50,
                maxOpsPerCycle: 10,
                cleanupInterval: 100,
                maxOperationAge: 3600000,
                timeoutMs: 60000
            };
        },

        /**
         * Processor configuration (deprecated - use _getConfig())
         * @deprecated Use serverConfig.operations instead
         */
        config: {
            processorInterval: 50,      // Processor cycle interval in milliseconds
            maxOpsPerCycle: 10,         // Maximum operations to process per cycle
            cleanupInterval: 100,       // Cleanup every N cycles (~5 seconds)
            maxOperationAge: 3600000    // Max age for completed operations (1 hour)
        },

        /**
         * Fields that can contain IDs or tempIds in apply operations.
         * @private
         */
        _referenceFields: [
            "id", "sourceId", "targetId", "elementId", "viewId",
            "relationshipId", "sourceVisualId", "targetVisualId",
            "parentId", "folderId", "viewObjectId", "connectionId"
        ],

        _incrementCounter: function(target, key) {
            if (!target || !key) return;
            target[key] = (target[key] || 0) + 1;
        },

        _normalizeSkipReasonCode: function(result) {
            if (!result || typeof result !== "object") return null;
            if (typeof result.reasonCode === "string" && result.reasonCode.length > 0) {
                return result.reasonCode;
            }
            var reason = typeof result.reason === "string" ? result.reason.toLowerCase() : "";
            if (reason.indexOf("source") !== -1) return "missingSourceVisual";
            if (reason.indexOf("target") !== -1) return "missingTargetVisual";
            if (reason.indexOf("already") !== -1) return "alreadyConnected";
            if (reason.indexOf("unsupported") !== -1) return "unsupportedType";
            return "unknown";
        },

        _inferMappingType: function(result, resolvedId) {
            if (!result || typeof result !== "object") return "concept";
            var op = typeof result.op === "string" ? result.op : "";
            if (result.connectionId && resolvedId === result.connectionId) {
                return "connection";
            }
            if (result.visualId || result.noteId || result.groupId) {
                return "visual";
            }
            if (op === "createView" || (result.viewId && !result.realId && !result.visualId)) {
                return "view";
            }
            return "concept";
        },

        _buildTempIdMappingReport: function(results) {
            var tempIdMap = {};
            var tempIdMappings = [];

            if (!results || !results.length) {
                return {
                    tempIdMap: tempIdMap,
                    tempIdMappings: tempIdMappings
                };
            }

            for (var i = 0; i < results.length; i++) {
                var result = results[i];
                if (!result || typeof result !== "object") continue;

                var tempId = typeof result.tempId === "string" && result.tempId.length > 0 ? result.tempId : null;
                if (!tempId) continue;

                var resolvedId = null;
                if (typeof result.realId === "string" && result.realId.length > 0) {
                    resolvedId = result.realId;
                } else if (typeof result.visualId === "string" && result.visualId.length > 0) {
                    resolvedId = result.visualId;
                } else if (typeof result.connectionId === "string" && result.connectionId.length > 0) {
                    resolvedId = result.connectionId;
                } else if (typeof result.noteId === "string" && result.noteId.length > 0) {
                    resolvedId = result.noteId;
                } else if (typeof result.groupId === "string" && result.groupId.length > 0) {
                    resolvedId = result.groupId;
                } else if (typeof result.viewId === "string" && result.viewId.length > 0) {
                    resolvedId = result.viewId;
                } else if (typeof result.folderId === "string" && result.folderId.length > 0) {
                    resolvedId = result.folderId;
                }

                if (!resolvedId) continue;

                tempIdMap[tempId] = resolvedId;
                tempIdMappings.push({
                    tempId: tempId,
                    resolvedId: resolvedId,
                    mappingType: this._inferMappingType(result, resolvedId),
                    op: typeof result.op === "string" ? result.op : null,
                    resultIndex: i
                });
            }

            return {
                tempIdMap: tempIdMap,
                tempIdMappings: tempIdMappings
            };
        },

        _buildOperationDigest: function(operation, results) {
            var requestedByType = {};
            var executedByType = {};
            var skipsByReason = {};
            var skipCount = 0;
            var executedCount = 0;
            var requested = operation && operation.changes ? operation.changes : [];
            var output = results || [];

            for (var i = 0; i < requested.length; i++) {
                var requestedOp = requested[i] && typeof requested[i].op === "string" ? requested[i].op : "unknown";
                this._incrementCounter(requestedByType, requestedOp);
            }

            for (var j = 0; j < output.length; j++) {
                var row = output[j];
                var rowOp = row && typeof row.op === "string" ? row.op : "unknown";
                if (row && row.skipped === true) {
                    skipCount++;
                    this._incrementCounter(skipsByReason, this._normalizeSkipReasonCode(row));
                    continue;
                }
                executedCount++;
                this._incrementCounter(executedByType, rowOp);
            }

            return {
                totals: {
                    requested: requested.length,
                    results: output.length,
                    executed: executedCount,
                    skipped: skipCount
                },
                requestedByType: requestedByType,
                executedByType: executedByType,
                skipsByReason: skipsByReason,
                integrityFlags: {
                    hasErrors: operation && operation.status === "error",
                    hasSkips: skipCount > 0,
                    resultCountMatchesRequested: output.length === requested.length,
                    hadTimeout: operation && operation.errorDetails && operation.errorDetails.hint &&
                        String(operation.errorDetails.hint).toLowerCase().indexOf("timeout") !== -1
                }
            };
        },

        _appendTimelineEvent: function(operation, status, metadata) {
            if (!operation) return;
            if (!operation.timeline) {
                operation.timeline = [];
            }
            var event = {
                status: status,
                timestamp: new Date().toISOString(),
                chunkIndex: 0,
                chunkCount: 1,
                operationCount: operation.changes && operation.changes.length ? operation.changes.length : 0
            };
            if (metadata && typeof metadata === "object") {
                for (var key in metadata) {
                    if (metadata.hasOwnProperty(key) && metadata[key] !== undefined) {
                        event[key] = metadata[key];
                    }
                }
            }
            operation.timeline.push(event);
        },

        _buildRetryHints: function(operation) {
            if (!operation || operation.status !== "error") return null;
            var hints = [];
            var failedChange = operation.errorDetails && operation.errorDetails.change ? operation.errorDetails.change : null;
            if (failedChange) {
                hints.push({
                    strategy: "retry_failed_change",
                    chunkIndex: 0,
                    operationIndex: operation.errorDetails.opIndex,
                    failedChange: failedChange
                });
            }
            if (operation.errorDetails && operation.errorDetails.hint) {
                hints.push({
                    strategy: "apply_hint",
                    message: operation.errorDetails.hint
                });
            }
            return hints.length ? hints : null;
        },

        _finalizeOperationMetadata: function(operation) {
            var results = operation && operation.result && operation.result.length ? operation.result : [];
            var mappingReport = this._buildTempIdMappingReport(results);
            operation.tempIdMap = mappingReport.tempIdMap;
            operation.tempIdMappings = mappingReport.tempIdMappings;
            operation.digest = this._buildOperationDigest(operation, results);
            operation.retryHints = this._buildRetryHints(operation);
        },

        /**
         * Extract human-readable message from an error object.
         * @param {Object|string} error - Thrown error
         * @returns {string} Error message
         * @private
         */
        _extractErrorMessage: function(error) {
            if (!error) return "Unknown error";
            if (typeof error === "string") return error;
            if (error.message) return String(error.message);
            return String(error);
        },

        /**
         * Detect reference details from common runtime error messages.
         * @param {string} message - Error message text
         * @returns {Object|null} { field, reference } or null
         * @private
         */
        _extractReferenceFromMessage: function(message) {
            if (!message) return null;

            var patterns = [
                { regex: /deleteConnectionFromView:\s*cannot find view:\s*([^\r\n]+)/i, field: "viewId" },
                { regex: /deleteView:\s*cannot find view:\s*([^\r\n]+)/i, field: "viewId" },
                { regex: /cannot find view:\s*([^\r\n]+)/i, field: "viewId" },
                { regex: /cannot find element to delete:\s*([^\r\n]+)/i, field: "id" },
                { regex: /cannot find element:\s*([^\r\n]+)/i, field: "id" },
                { regex: /cannot find relationship to delete:\s*([^\r\n]+)/i, field: "id" },
                { regex: /cannot find relationship:\s*([^\r\n]+)/i, field: "relationshipId" },
                { regex: /deleteConnectionFromView:\s*cannot find connection:\s*([^\r\n]+)/i, field: "connectionId" },
                { regex: /cannot find connection in view:\s*([^\r\n]+)/i, field: "connectionId" },
                { regex: /cannot find connection:\s*([^\r\n]+)/i, field: "connectionId" }
            ];

            for (var i = 0; i < patterns.length; i++) {
                var m = message.match(patterns[i].regex);
                if (m && m[1]) {
                    var ref = String(m[1]).trim();
                    ref = ref.replace(/^['"]/, "").replace(/['"]$/, "");
                    return { field: patterns[i].field, reference: ref };
                }
            }

            return null;
        },

        /**
         * Find the most likely change operation for a given reference.
         * @param {Array} changes - Requested changes
         * @param {Object|null} refInfo - { field, reference } or null
         * @returns {Object|null} { index, change, field } or null
         * @private
         */
        _findChangeContext: function(changes, refInfo) {
            if (!changes || !changes.length) return null;

            var i;
            var j;
            var field;
            var change;

            if (refInfo && refInfo.field && refInfo.reference) {
                for (i = 0; i < changes.length; i++) {
                    change = changes[i];
                    if (!change || typeof change !== "object") continue;
                    if (change[refInfo.field] === refInfo.reference) {
                        return { index: i, change: change, field: refInfo.field };
                    }
                }
            }

            if (refInfo && refInfo.reference) {
                for (i = 0; i < changes.length; i++) {
                    change = changes[i];
                    if (!change || typeof change !== "object") continue;
                    for (j = 0; j < this._referenceFields.length; j++) {
                        field = this._referenceFields[j];
                        if (change[field] === refInfo.reference) {
                            return { index: i, change: change, field: field };
                        }
                    }
                }
            }

            return null;
        },

        /**
         * Best-effort semantic preflight used only for failure context.
         * Mirrors executeBatch phase ordering to locate unresolved tempId refs.
         * @param {Array} changes - Requested changes
         * @returns {Object|null} Context object or null
         * @private
         */
        _findFirstSemanticReferenceError: function(changes) {
            if (!changes || !changes.length) return null;

            var declaredTempIds = {};
            var availableTempIds = {};
            var phase3Ops = {
                deleteConnectionFromView: true,
                deleteElement: true,
                deleteRelationship: true,
                deleteView: true
            };
            var phase2Creators = {
                createRelationship: true,
                addToView: true,
                createFolder: true,
                createNote: true,
                createGroup: true,
                createView: true
            };

            var i;
            var change;
            var opName;
            var tempId;

            for (i = 0; i < changes.length; i++) {
                change = changes[i];
                if (!change || typeof change !== "object") continue;
                tempId = change.tempId;
                if (typeof tempId === "string" && tempId.length > 0 && !declaredTempIds[tempId]) {
                    declaredTempIds[tempId] = {
                        index: i,
                        op: typeof change.op === "string" ? change.op : "unknown"
                    };
                }
            }

            // Phase 1: all createElement tempIds become available.
            for (i = 0; i < changes.length; i++) {
                change = changes[i];
                if (!change || typeof change !== "object") continue;
                if (change.op === "createElement" && typeof change.tempId === "string" && change.tempId.length > 0) {
                    availableTempIds[change.tempId] = true;
                }
            }

            function isRealId(idValue) {
                return typeof idValue === "string" && idValue.indexOf("id-") === 0;
            }

            function checkRefs(op, index, fields, declared, available) {
                for (var fi = 0; fi < fields.length; fi++) {
                    var refField = fields[fi];
                    var refValue = op[refField];
                    if (typeof refValue !== "string" || isRealId(refValue)) continue;
                    if (!declared[refValue]) continue;
                    if (available[refValue]) continue;

                    var decl = declared[refValue];
                    return {
                        index: index,
                        change: op,
                        field: refField,
                        reference: refValue,
                        hint: "tempId '" + refValue + "' is declared at /changes/" + decl.index +
                              " (" + decl.op + ") but is not available at this execution phase"
                    };
                }
                return null;
            }

            // Phase 2: non-delete mutations in request order.
            for (i = 0; i < changes.length; i++) {
                change = changes[i];
                if (!change || typeof change !== "object") continue;
                opName = typeof change.op === "string" ? change.op : "";
                if (opName === "createElement" || phase3Ops[opName]) continue;

                var issue2 = checkRefs(change, i, this._referenceFields, declaredTempIds, availableTempIds);
                if (issue2) return issue2;

                if (phase2Creators[opName] && typeof change.tempId === "string" && change.tempId.length > 0) {
                    availableTempIds[change.tempId] = true;
                }
            }

            // Phase 3: delete operations in request order.
            for (i = 0; i < changes.length; i++) {
                change = changes[i];
                if (!change || typeof change !== "object") continue;
                opName = typeof change.op === "string" ? change.op : "";
                if (!phase3Ops[opName]) continue;

                var issue3 = checkRefs(change, i, this._referenceFields, declaredTempIds, availableTempIds);
                if (issue3) return issue3;
            }

            return null;
        },

        /**
         * Build structured error details for a failed operation.
         * @param {Object} operation - Operation descriptor
         * @param {Object|string} error - Thrown error
         * @returns {Object} Error details with per-op context when available
         * @private
         */
        _buildOperationErrorDetails: function(operation, error) {
            var message = this._extractErrorMessage(error);
            var details = {
                message: message
            };

            var refInfo = this._extractReferenceFromMessage(message);
            var context = this._findChangeContext(operation && operation.changes ? operation.changes : [], refInfo);

            if (!context) {
                var semanticContext = this._findFirstSemanticReferenceError(operation && operation.changes ? operation.changes : []);
                if (semanticContext) {
                    context = semanticContext;
                    if (!refInfo && semanticContext.reference) {
                        refInfo = {
                            field: semanticContext.field,
                            reference: semanticContext.reference
                        };
                    }
                    if (semanticContext.hint) {
                        details.hint = semanticContext.hint;
                    }
                }
            }

            if (context) {
                details.opIndex = context.index;
                details.opNumber = context.index + 1;
                details.path = "/changes/" + context.index;
                details.op = context.change && typeof context.change.op === "string" ? context.change.op : "unknown";
                if (context.field) {
                    details.field = context.field;
                }
                if (refInfo && refInfo.reference) {
                    details.reference = refInfo.reference;
                } else if (context.field && context.change && typeof context.change[context.field] === "string") {
                    details.reference = context.change[context.field];
                }
                details.change = context.change;
            }

            if (!details.hint && details.field && details.reference) {
                details.hint = details.field + " refers to '" + details.reference + "' which was not resolved";
            }

            return details;
        },

        /**
         * Create operation descriptor
         * @param {Array} changes - Array of change descriptors
         * @returns {Object} Operation descriptor with id, status, changes, timestamps
         */
        createOperation: function(changes) {
            var opId = "op_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
            var operation = {
                id: opId,
                changes: changes,
                status: "queued",
                result: null,
                error: null,
                errorDetails: null,
                createdAt: new Date().toISOString(),
                startedAt: null,         // Timestamp when processing started
                completedAt: null,
                timeline: [],
                tempIdMap: {},
                tempIdMappings: [],
                digest: {
                    totals: {
                        requested: changes && changes.length ? changes.length : 0,
                        results: 0,
                        executed: 0,
                        skipped: 0
                    },
                    requestedByType: {},
                    executedByType: {},
                    skipsByReason: {},
                    integrityFlags: {
                        hasErrors: false,
                        hasSkips: false,
                        resultCountMatchesRequested: false,
                        pending: true
                    }
                },
                retryHints: null
            };

            this._appendTimelineEvent(operation, "queued");
            return operation;
        },

        /**
         * Queue operation for processing
         * @param {Object} operation - Operation descriptor from createOperation()
         * @returns {string} Operation ID
         */
        queueOperation: function(operation) {
            this.pendingOperations[operation.id] = operation;
            this.queue.offer(operation);
            return operation.id;
        },

        /**
         * Get operation status by ID
         * @param {string} opId - Operation ID
         * @returns {Object|null} Operation descriptor or null if not found
         */
        getOperationStatus: function(opId) {
            return this.pendingOperations[opId] || null;
        },

        /**
         * List recent operations with optional filtering.
         * @param {Object} options - Listing options
         * @param {number} [options.limit=20] - Maximum number of operations to return
         * @param {string} [options.status] - Optional status filter
         * @returns {Object} { operations, total, limit, status }
         */
        listOperations: function(options) {
            options = options || {};
            var limit = typeof options.limit === "number" ? options.limit : 20;
            if (!isFinite(limit) || limit <= 0) limit = 20;
            if (limit > 200) limit = 200;
            var cursor = typeof options.cursor === "number" ? options.cursor : 0;
            if (!isFinite(cursor) || cursor < 0) cursor = 0;
            var summaryOnly = options.summaryOnly === true;

            var statusFilter = typeof options.status === "string" ? options.status : null;
            var operations = [];

            for (var opId in this.pendingOperations) {
                if (!this.pendingOperations.hasOwnProperty(opId)) continue;
                var op = this.pendingOperations[opId];
                if (!op) continue;
                if (statusFilter && op.status !== statusFilter) continue;

                var durationMs = null;
                if (op.completedAt && op.startedAt) {
                    durationMs = new Date(op.completedAt).getTime() - new Date(op.startedAt).getTime();
                }

                var summary = {
                    operationId: op.id,
                    status: op.status,
                    createdAt: op.createdAt || null,
                    startedAt: op.startedAt || null,
                    completedAt: op.completedAt || null,
                    durationMs: durationMs,
                    changeCount: op.changes && op.changes.length ? op.changes.length : 0,
                    error: op.error || null
                };

                if (!summaryOnly) {
                    summary.digest = op.digest || null;
                    summary.timeline = op.timeline || [];
                    summary.tempIdMap = op.tempIdMap || {};
                    summary.tempIdMappings = op.tempIdMappings || [];
                    summary.errorDetails = op.errorDetails || null;
                    summary.retryHints = op.retryHints || null;
                }

                operations.push(summary);
            }

            operations.sort(function(a, b) {
                var ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                var tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return tb - ta;
            });

            var total = operations.length;
            var paged = operations.slice(cursor, cursor + limit);
            var hasMore = cursor + paged.length < total;
            var nextCursor = hasMore ? String(cursor + paged.length) : null;

            return {
                operations: paged,
                total: total,
                limit: limit,
                status: statusFilter || null,
                cursor: String(cursor),
                hasMore: hasMore,
                nextCursor: nextCursor,
                summaryOnly: summaryOnly
            };
        },

        /**
         * Get count of queued operations
         * @returns {number} Number of operations in queue
         */
        getQueuedCount: function() {
            return this.queue.size();
        },

        /**
         * Get count of completed operations
         * @returns {number} Number of completed operations
         */
        getCompletedCount: function() {
            var count = 0;
            for (var opId in this.pendingOperations) {
                if (this.pendingOperations[opId].status === "complete") {
                    count++;
                }
            }
            return count;
        },

        /**
         * Get count of in-flight (queued or processing) operations
         * @returns {number} Number of in-flight operations
         */
        getInFlightCount: function() {
            var processingCount = 0;
            for (var opId in this.pendingOperations) {
                var status = this.pendingOperations[opId].status;
                if (status === "processing" || status === "queued") {
                    processingCount++;
                }
            }
            return processingCount;
        },

        /**
         * Get detailed queue statistics for health endpoint
         * @returns {Object} Queue statistics
         */
        getQueueStats: function() {
            var queued = 0;
            var processing = 0;
            var completed = 0;
            var error = 0;

            for (var opId in this.pendingOperations) {
                switch (this.pendingOperations[opId].status) {
                    case "queued": queued++; break;
                    case "processing": processing++; break;
                    case "complete": completed++; break;
                    case "error": error++; break;
                }
            }

            return {
                queueSize: this.queue.size(),
                queued: queued,
                processing: processing,
                completed: completed,
                error: error,
                total: Object.keys(this.pendingOperations).length
            };
        },

        /**
         * Start operation processor timer
         * @param {org.eclipse.swt.widgets.Display} display - SWT Display reference
         * @param {Object} options - Configuration options
         * @param {com.archimatetool.model.IArchimateModel} options.modelRef - EMF model reference
         * @param {Function} [options.onUpdateCount] - Callback for operation count updates (queued, completed)
         */
        startProcessor: function(display, options) {
            if (this._processorRunning) {
                return;
            }

            this._processorRunning = true;
            this._displayRef = display;
            this._modelRef = options.modelRef;
            this._onUpdateCountCallback = options.onUpdateCount || null;

            // Register CommandStack listener to auto-refresh snapshot on external changes
            // (e.g., user pressing Ctrl+Z in Archi, or command stack silently undoing)
            if (typeof undoableCommands !== "undefined" && undoableCommands.registerCommandStackListener &&
                this._modelRef && typeof modelSnapshot !== "undefined") {
                var self = this;
                try {
                    this._commandStackListenerHandle = undoableCommands.registerCommandStackListener(
                        this._modelRef,
                        function(eventType) {
                            // Only refresh snapshot for changes NOT initiated by our own batch processing
                            if (!self._isProcessingBatch && modelSnapshot) {
                                try {
                                    modelSnapshot.refreshSnapshot(self._modelRef);
                                    if (loggingQueue) {
                                        loggingQueue.log("Snapshot refreshed due to external command stack change");
                                    }
                                } catch (refreshErr) {
                                    if (loggingQueue) {
                                        loggingQueue.error("Snapshot refresh on command stack change failed: " + refreshErr);
                                    }
                                }
                            }
                        }
                    );
                    if (loggingQueue) {
                        loggingQueue.log("CommandStack listener registered for external change detection");
                    }
                } catch (listenerErr) {
                    if (loggingQueue) {
                        loggingQueue.error("Failed to register CommandStack listener: " + listenerErr);
                    }
                }
            }

            this._scheduleProcessor();
        },

        /**
         * Stop the operation processor
         */
        stopProcessor: function() {
            this._processorRunning = false;

            // Unregister CommandStack listener
            if (this._commandStackListenerHandle) {
                try {
                    this._commandStackListenerHandle.remove();
                    if (loggingQueue) {
                        loggingQueue.log("CommandStack listener unregistered");
                    }
                } catch (e) { /* ignore */ }
                this._commandStackListenerHandle = null;
            }
        },

        /**
         * Schedule next processor cycle (internal)
         * @private
         */
        _scheduleProcessor: function() {
            var self = this;
            var config = this._getConfig();

            this._displayRef.timerExec(config.processorInterval, function() {
                if (!self._processorRunning) {
                    return;
                }

                // Check for timed-out in-progress operations
                self._checkOperationTimeouts();

                // Process operations from queue
                var processed = 0;
                var maxPerCycle = config.maxOpsPerCycle;

                while (processed < maxPerCycle && !self.queue.isEmpty()) {
                    var operation = self.queue.poll();
                    if (!operation) break;

                    // Mark operation as in-progress with start time
                    operation.status = "processing";
                    operation.startedAt = new Date().toISOString();
                    self._appendTimelineEvent(operation, "processing", {
                        queuedAt: operation.createdAt
                    });

                    try {
                        if (loggingQueue) {
                            loggingQueue.log("Processing operation: " + operation.id);
                            loggingQueue.log("Model ref available: " + (self._modelRef !== null));
                        }

                        // Mark that we're processing a batch so the CommandStack listener
                        // doesn't trigger redundant snapshot refreshes during execution
                        self._isProcessingBatch = true;

                        // Use undoableCommands.executeBatch for proper undo/redo support
                        var batchLabel = "API Operation " + operation.id;
                        var results = undoableCommands.executeBatch(self._modelRef, batchLabel, operation.changes);

                        self._isProcessingBatch = false;

                        // Delayed snapshot refresh: allow async GEF rollback to settle
                        // before capturing the new snapshot state
                        var refreshDelayMs = 100;
                        if (typeof serverConfig !== "undefined" && serverConfig.operations &&
                            serverConfig.operations.snapshotRefreshDelayMs !== undefined) {
                            refreshDelayMs = serverConfig.operations.snapshotRefreshDelayMs;
                        }

                        if (modelSnapshot) {
                            if (refreshDelayMs > 0) {
                                try {
                                    var Thread = Java.type("java.lang.Thread");
                                    Thread.sleep(refreshDelayMs);
                                } catch (sleepErr) { /* ignore */ }
                            }
                            modelSnapshot.refreshSnapshot(self._modelRef);
                        }

                        // Mark operation as complete
                        operation.status = "complete";
                        operation.result = results;
                        operation.completedAt = new Date().toISOString();
                        self._appendTimelineEvent(operation, "complete", {
                            resultCount: results.length
                        });
                        self._finalizeOperationMetadata(operation);

                        var duration = new Date(operation.completedAt).getTime() - new Date(operation.startedAt).getTime();
                        if (loggingQueue) {
                            loggingQueue.log("Operation completed: " + operation.id +
                                           " (" + results.length + " changes, " + duration + "ms) [UNDOABLE]");
                        }

                    } catch (e) {
                        self._isProcessingBatch = false;
                        var errorMsg = "Operation failed: " + operation.id + " - " + String(e);
                        var errorDetails = self._buildOperationErrorDetails(operation, e);

                        // Include Java stack trace if available
                        if (e.javaException) {
                            var StringWriter = Java.type("java.io.StringWriter");
                            var PrintWriter = Java.type("java.io.PrintWriter");
                            var sw = new StringWriter();
                            e.javaException.printStackTrace(new PrintWriter(sw));
                            errorMsg += "\n" + sw.toString();
                        }

                        if (loggingQueue) {
                            loggingQueue.error(errorMsg);
                            if (errorDetails && errorDetails.opNumber) {
                                loggingQueue.error(
                                    "Operation context: change " + errorDetails.opNumber +
                                    " (" + errorDetails.op + ")" +
                                    (errorDetails.field ? ", field=" + errorDetails.field : "") +
                                    (errorDetails.reference ? ", reference=" + errorDetails.reference : "")
                                );
                            }
                        }

                        operation.status = "error";
                        operation.error = errorDetails.message;
                        operation.errorDetails = errorDetails;
                        operation.completedAt = new Date().toISOString();
                        self._appendTimelineEvent(operation, "failed", {
                            error: errorDetails.message,
                            opIndex: errorDetails.opIndex,
                            op: errorDetails.op
                        });
                        self._finalizeOperationMetadata(operation);
                    }

                    processed++;
                }

                // Update operation counter
                self._updateOperationCount();

                // Cleanup old operations periodically
                if (self._processorCycleCount % config.cleanupInterval === 0) {
                    self.cleanupOldOperations(config.maxOperationAge);
                }

                self._processorCycleCount++;

                // Schedule next processor cycle
                if (self._processorRunning) {
                    self._scheduleProcessor();
                }
            });
        },

        /**
         * Check for and timeout stale in-progress operations
         * @private
         */
        _checkOperationTimeouts: function() {
            var config = this._getConfig();
            var now = Date.now();

            for (var opId in this.pendingOperations) {
                var op = this.pendingOperations[opId];
                if (op.status === "processing" && op.startedAt) {
                    var elapsed = now - new Date(op.startedAt).getTime();
                    if (elapsed > config.timeoutMs) {
                        if (loggingQueue) {
                            loggingQueue.error("Operation timed out: " + opId +
                                " (elapsed: " + elapsed + "ms, limit: " + config.timeoutMs + "ms)");
                        }
                        op.status = "error";
                        op.error = "Operation timed out after " + Math.round(elapsed / 1000) + " seconds";
                        op.errorDetails = {
                            message: op.error,
                            hint: "Operation exceeded timeout while in processing state"
                        };
                        op.completedAt = new Date().toISOString();
                        this._appendTimelineEvent(op, "failed", {
                            error: op.error,
                            timeoutMs: config.timeoutMs
                        });
                        this._finalizeOperationMetadata(op);
                    }
                }
            }
        },

        /**
         * Update operation count via callback
         * @private
         */
        _updateOperationCount: function() {
            if (this._onUpdateCountCallback) {
                var queuedCount = this.queue.size();
                var completedCount = this.getCompletedCount();
                this._onUpdateCountCallback(queuedCount, completedCount);
            }
        },

        /**
         * Clean up old completed/failed operations
         * @param {number} maxAgeMs - Maximum age in milliseconds for completed operations
         */
        cleanupOldOperations: function(maxAgeMs) {
            var cutoffTime = Date.now() - maxAgeMs;
            var toDelete = [];

            for (var opId in this.pendingOperations) {
                var op = this.pendingOperations[opId];
                if ((op.status === "complete" || op.status === "error") &&
                    op.completedAt &&
                    new Date(op.completedAt).getTime() < cutoffTime) {
                    toDelete.push(opId);
                }
            }

            var self = this;
            toDelete.forEach(function(opId) {
                delete self.pendingOperations[opId];
            });

            if (toDelete.length > 0 && loggingQueue) {
                loggingQueue.log("Cleaned up " + toDelete.length + " old operations");
            }
        }
    };

    // Export globally for JArchi
    if (typeof globalThis !== "undefined") {
        globalThis.operationQueue = operationQueue;
    } else if (typeof global !== "undefined") {
        global.operationQueue = operationQueue;
    }

    // CommonJS for Node.js build tools
    if (typeof module !== "undefined" && module.exports) {
        module.exports = operationQueue;
    }

})();
