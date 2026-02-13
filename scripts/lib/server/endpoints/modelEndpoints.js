/**
 * modelEndpoints.js - Model query and mutation endpoints
 *
 * Handles model snapshot queries, change planning, async apply operations,
 * search, element inspection, and folder management.
 *
 * @module server/endpoints/modelEndpoints
 * @requires server/modelSnapshot
 * @requires server/operationQueue
 * @requires server/operationValidation
 * @requires server/loggingQueue
 */

(function() {
    "use strict";

    // Guard against double-loading
    if (typeof globalThis !== "undefined" && typeof globalThis.modelEndpoints !== "undefined") {
        return;
    }

    // Java imports for EMF traversal
    var FolderType = Java.type("com.archimatetool.model.FolderType");
    var IArchimateElement = Java.type("com.archimatetool.model.IArchimateElement");
    var IArchimateRelationship = Java.type("com.archimatetool.model.IArchimateRelationship");
    var IArchimateDiagramModel = Java.type("com.archimatetool.model.IArchimateDiagramModel");
    var IFolder = Java.type("com.archimatetool.model.IFolder");

    /**
     * Convert EMF class name to kebab-case type string
     * @param {Object} eObject - EMF object
     * @returns {string} Kebab-case type (e.g., "business-actor")
     */
    function getTypeString(eObject) {
        var className = eObject.eClass().getName();
        return className.replace(/([A-Z])/g, function(m, p, offset) {
            return (offset > 0 ? '-' : '') + p.toLowerCase();
        });
    }

    /**
     * Get all properties from an element as key-value object
     * @param {Object} element - EMF element with getProperties()
     * @returns {Object} Property map
     */
    function getPropertiesMap(element) {
        var result = {};
        var props = element.getProperties();
        for (var i = 0; i < props.size(); i++) {
            var prop = props.get(i);
            result[prop.getKey()] = prop.getValue();
        }
        return result;
    }

    /**
     * Find element by ID in model using EMF traversal
     * @param {Object} model - IArchimateModel
     * @param {string} id - Element ID
     * @returns {Object|null} Element or null
     */
    function findElementById(model, id) {
        var folders = model.getFolders();
        for (var i = 0; i < folders.size(); i++) {
            var found = findInFolder(folders.get(i), id);
            if (found) return found;
        }
        return null;
    }

    /**
     * Recursively search folder for element by ID
     */
    function findInFolder(folder, id) {
        var elements = folder.getElements();
        for (var i = 0; i < elements.size(); i++) {
            var element = elements.get(i);
            if (element.getId() === id) {
                return element;
            }
        }
        var subfolders = folder.getFolders();
        for (var j = 0; j < subfolders.size(); j++) {
            var found = findInFolder(subfolders.get(j), id);
            if (found) return found;
        }
        return null;
    }

    /**
     * Collect all elements matching search criteria
     * @param {Object} model - IArchimateModel
     * @param {Object} criteria - Search criteria
     * @returns {Array} Matching elements
     */
    function searchElements(model, criteria) {
        var results = [];
        var typeFilter = criteria.type ? criteria.type.toLowerCase() : null;
        var namePattern = criteria.namePattern ? new RegExp(criteria.namePattern, 'i') : null;
        var propertyKey = criteria.propertyKey || null;
        var propertyValue = criteria.propertyValue || null;
        var includeRelationships = criteria.includeRelationships !== false;
        var limit = criteria.limit || 1000;

        function processFolder(folder) {
            if (results.length >= limit) return;

            var elements = folder.getElements();
            for (var i = 0; i < elements.size() && results.length < limit; i++) {
                var element = elements.get(i);
                
                // Skip views (they're in diagrams folder)
                if (element instanceof IArchimateDiagramModel) continue;
                
                // Skip relationships if not requested
                if (!includeRelationships && element instanceof IArchimateRelationship) continue;
                
                // Type filter
                if (typeFilter) {
                    var elemType = getTypeString(element);
                    if (elemType !== typeFilter && !elemType.includes(typeFilter)) continue;
                }
                
                // Name pattern filter
                if (namePattern) {
                    var name = element.getName() || '';
                    if (!namePattern.test(name)) continue;
                }
                
                // Property filter
                var matchedPropertyValue = null;
                if (propertyKey) {
                    var props = element.getProperties();
                    var found = false;
                    for (var p = 0; p < props.size(); p++) {
                        var prop = props.get(p);
                        if (prop.getKey() === propertyKey) {
                            if (propertyValue === null || prop.getValue() === propertyValue) {
                                found = true;
                                matchedPropertyValue = prop.getValue();
                                break;
                            }
                        }
                    }
                    if (!found) continue;
                }
                
                // Build result object
                var result = {
                    id: element.getId(),
                    name: element.getName() || '',
                    type: getTypeString(element),
                    documentation: element.getDocumentation() || ''
                };
                
                // Add relationship-specific fields
                if (element instanceof IArchimateRelationship) {
                    result.sourceId = element.getSource() ? element.getSource().getId() : null;
                    result.targetId = element.getTarget() ? element.getTarget().getId() : null;
                }

                if (propertyKey) {
                    result.matchedPropertyKey = propertyKey;
                    result.matchedPropertyValue = matchedPropertyValue;
                }
                
                results.push(result);
            }

            var subfolders = folder.getFolders();
            for (var j = 0; j < subfolders.size() && results.length < limit; j++) {
                processFolder(subfolders.get(j));
            }
        }

        var folders = model.getFolders();
        for (var i = 0; i < folders.size() && results.length < limit; i++) {
            processFolder(folders.get(i));
        }

        return results;
    }

    /**
     * Get relationships connected to an element
     * @param {Object} model - IArchimateModel
     * @param {string} elementId - Element ID
     * @returns {Object} Object with incoming and outgoing relationships
     */
    function getRelationshipsForElement(model, elementId) {
        var incoming = [];
        var outgoing = [];
        
        // Find relationships folder
        var folders = model.getFolders();
        for (var i = 0; i < folders.size(); i++) {
            var folder = folders.get(i);
            if (folder.getType() === FolderType.RELATIONS) {
                collectRelationships(folder, elementId, incoming, outgoing);
                break;
            }
        }
        
        return { incoming: incoming, outgoing: outgoing };
    }

    function collectRelationships(folder, elementId, incoming, outgoing) {
        var elements = folder.getElements();
        for (var i = 0; i < elements.size(); i++) {
            var rel = elements.get(i);
            if (!(rel instanceof IArchimateRelationship)) continue;
            
            var source = rel.getSource();
            var target = rel.getTarget();
            
            if (source && source.getId() === elementId) {
                outgoing.push({
                    id: rel.getId(),
                    name: rel.getName() || '',
                    type: getTypeString(rel),
                    sourceId: source.getId(),
                    targetId: target ? target.getId() : null,
                    otherEndId: target ? target.getId() : null,
                    otherEndName: target ? target.getName() : null,
                    otherEndType: target ? getTypeString(target) : null
                });
            }
            if (target && target.getId() === elementId) {
                incoming.push({
                    id: rel.getId(),
                    name: rel.getName() || '',
                    type: getTypeString(rel),
                    sourceId: source ? source.getId() : null,
                    targetId: target.getId(),
                    otherEndId: source ? source.getId() : null,
                    otherEndName: source ? source.getName() : null,
                    otherEndType: source ? getTypeString(source) : null
                });
            }
        }
        
        var subfolders = folder.getFolders();
        for (var j = 0; j < subfolders.size(); j++) {
            collectRelationships(subfolders.get(j), elementId, incoming, outgoing);
        }
    }

    function extractConceptIdFromVisualObject(visual) {
        if (!visual) return null;

        try {
            if (typeof visual.getArchimateElement === "function") {
                var concept = visual.getArchimateElement();
                if (concept && concept.getId) return concept.getId();
            }
        } catch (e1) {
            // ignore
        }

        try {
            if (typeof visual.getArchimateConcept === "function") {
                var concept2 = visual.getArchimateConcept();
                if (concept2 && concept2.getId) return concept2.getId();
            }
        } catch (e2) {
            // ignore
        }

        return null;
    }

    /**
     * Get views containing an element
     * @param {Object} model - IArchimateModel
     * @param {string} elementId - Element ID
     * @returns {Array} Views containing the element
     */
    function getViewsContainingElement(model, elementId) {
        var views = [];
        
        function searchViewsInFolder(folder) {
            var elements = folder.getElements();
            for (var i = 0; i < elements.size(); i++) {
                var item = elements.get(i);
                if (item && typeof item.getChildren === "function") {
                    if (viewContainsElement(item, elementId)) {
                        views.push({
                            id: item.getId(),
                            name: item.getName() || ''
                        });
                    }
                }
            }
            var subfolders = folder.getFolders();
            for (var j = 0; j < subfolders.size(); j++) {
                searchViewsInFolder(subfolders.get(j));
            }
        }
        
        var folders = model.getFolders();
        for (var i = 0; i < folders.size(); i++) {
            searchViewsInFolder(folders.get(i));
        }
        
        return views;
    }

    function viewContainsElement(view, elementId) {
        function searchChildren(container) {
            if (!container || typeof container.getChildren !== "function") return false;
            var children = container.getChildren();
            for (var i = 0; i < children.size(); i++) {
                var child = children.get(i);
                var conceptId = extractConceptIdFromVisualObject(child);
                if (conceptId && conceptId === elementId) return true;

                if (typeof child.getChildren === 'function') {
                    if (searchChildren(child)) return true;
                }
            }
            return false;
        }
        
        return searchChildren(view);
    }

    /**
     * Collect folder structure from model
     * @param {Object} model - IArchimateModel
     * @returns {Array} Folder hierarchy
     */
    function collectFolders(model) {
        var result = [];
        
        function processFolder(folder, path) {
            var folderData = {
                id: folder.getId(),
                name: folder.getName() || '',
                path: path,
                type: folder.getType() ? folder.getType().getName() : null,
                elementCount: folder.getElements().size(),
                subfolderCount: folder.getFolders().size()
            };
            result.push(folderData);
            
            var subfolders = folder.getFolders();
            for (var i = 0; i < subfolders.size(); i++) {
                var sub = subfolders.get(i);
                var subPath = path ? path + '/' + (sub.getName() || '') : (sub.getName() || '');
                processFolder(sub, subPath);
            }
        }
        
        var folders = model.getFolders();
        for (var i = 0; i < folders.size(); i++) {
            var folder = folders.get(i);
            processFolder(folder, folder.getName() || '');
        }
        
        return result;
    }

    /**
     * Model operation endpoint handlers
     */
    var modelEndpoints = {
        /**
         * Handle POST /model/query - Query model snapshot
         * @param {Object} request - HTTP request object with body.limit
         * @param {Object} response - HTTP response object
         * @param {Object} serverState - Server state object (unused)
         */
        handleQuery: function(request, response, serverState) {
            var body = request.body || {};
            var limit = body.limit !== undefined ? parseInt(String(body.limit), 10) : 10;
            if (!isFinite(limit) || limit < 1) limit = 10;

            var relationshipLimit = null;
            if (body.relationshipLimit !== undefined && body.relationshipLimit !== null) {
                relationshipLimit = parseInt(String(body.relationshipLimit), 10);
                if (!isFinite(relationshipLimit) || relationshipLimit < 1) {
                    relationshipLimit = null;
                }
            }

            if (typeof loggingQueue !== "undefined" && loggingQueue) {
                loggingQueue.log("[" + request.requestId + "] Query: limit=" + limit);
            }

            try {
                if (!modelSnapshot || !modelSnapshot.getSnapshot()) {
                    throw new Error("No model snapshot available");
                }

                var snapshot = modelSnapshot.getSnapshot();
                if (typeof loggingQueue !== "undefined" && loggingQueue) {
                    loggingQueue.log("[" + request.requestId + "] Model name: " + snapshot.name);
                }

                var elements = modelSnapshot.getElements();
                var relationships = modelSnapshot.getRelationships();
                var views = modelSnapshot.getViews();

                var summary = {
                    elements: elements.length,
                    relationships: relationships.length,
                    views: views.length
                };

                var sampleElements = [];
                for (var i = 0; i < elements.length && i < limit; i++) {
                    sampleElements.push(elements[i]);
                }

                var sampleRelationships = [];
                if (relationshipLimit !== null) {
                    for (var j = 0; j < relationships.length && j < relationshipLimit; j++) {
                        sampleRelationships.push(relationships[j]);
                    }
                }

                if (typeof loggingQueue !== "undefined" && loggingQueue) {
                    loggingQueue.log("[" + request.requestId + "] Query completed: " + summary.elements + " elements");
                }

                var responseBody = {
                    summary: summary,
                    elements: sampleElements
                };
                if (relationshipLimit !== null) {
                    responseBody.relationships = sampleRelationships;
                }
                response.body = responseBody;

            } catch (e) {
                if (typeof loggingQueue !== "undefined" && loggingQueue) {
                    loggingQueue.error("[" + request.requestId + "] Query failed: " + e);
                }
                if (e.javaException) {
                    e.javaException.printStackTrace();
                }
                response.statusCode = 500;
                response.body = {
                    error: {
                        code: "QueryFailed",
                        message: String(e)
                    }
                };
            }
        },

        /**
         * Handle GET /model/stats - Get model statistics with type-level breakdowns
         * @param {Object} request - HTTP request object
         * @param {Object} response - HTTP response object
         * @param {Object} serverState - Server state object
         */
        handleStats: function(request, response, serverState) {
            if (typeof loggingQueue !== "undefined" && loggingQueue) {
                loggingQueue.log("[" + request.requestId + "] Get model stats");
            }

            try {
                if (!modelSnapshot || !modelSnapshot.getSnapshot()) {
                    throw new Error("No model snapshot available");
                }

                var elements = modelSnapshot.getElements();
                var relationships = modelSnapshot.getRelationships();
                var views = modelSnapshot.getViews();

                // Count elements by type
                var elementsByType = {};
                for (var i = 0; i < elements.length; i++) {
                    var type = elements[i].type;
                    elementsByType[type] = (elementsByType[type] || 0) + 1;
                }

                // Count relationships by type
                var relationshipsByType = {};
                for (var j = 0; j < relationships.length; j++) {
                    var relType = relationships[j].type;
                    relationshipsByType[relType] = (relationshipsByType[relType] || 0) + 1;
                }

                // Count views by type
                var viewsByType = {};
                for (var k = 0; k < views.length; k++) {
                    var viewType = views[k].type;
                    viewsByType[viewType] = (viewsByType[viewType] || 0) + 1;
                }

                // Build response
                response.body = {
                    summary: {
                        totalElements: elements.length,
                        totalRelationships: relationships.length,
                        totalViews: views.length,
                        elementTypes: Object.keys(elementsByType).length,
                        relationshipTypes: Object.keys(relationshipsByType).length,
                        viewTypes: Object.keys(viewsByType).length
                    },
                    elements: elementsByType,
                    relationships: relationshipsByType,
                    views: viewsByType
                };

                if (typeof loggingQueue !== "undefined" && loggingQueue) {
                    loggingQueue.log("[" + request.requestId + "] Stats: " + elements.length +
                                   " elements across " + Object.keys(elementsByType).length + " types");
                }

            } catch (e) {
                if (typeof loggingQueue !== "undefined" && loggingQueue) {
                    loggingQueue.error("[" + request.requestId + "] Stats failed: " + e);
                }
                response.statusCode = 500;
                response.body = {
                    error: {
                        code: "StatsFailed",
                        message: String(e)
                    }
                };
            }
        },

        /**
         * Handle POST /model/plan - Generate change plan (no mutation)
         * @param {Object} request - HTTP request object with body.action
         * @param {Object} response - HTTP response object
         * @param {Object} serverState - Server state object (unused)
         */
        handlePlan: function(request, response, serverState) {
            var action = request.body && request.body.action ? request.body.action : null;

            if (!action) {
                response.statusCode = 400;
                response.body = {
                    error: {
                        code: "BadRequest",
                        message: "Missing 'action' field"
                    }
                };
                return;
            }

            if (typeof loggingQueue !== "undefined" && loggingQueue) {
                loggingQueue.log("[" + request.requestId + "] Plan: action=" + action);
            }

            var planId = "plan_" + Date.now();
            var changes = [];

            if (action === "create-element") {
                var elementType = request.body.type || "business-actor";
                var elementName = request.body.name || "New Element";

                changes.push({
                    op: "createElement",
                    type: elementType,
                    name: elementName,
                    tempId: "t1"
                });
            } else {
                response.statusCode = 400;
                response.body = {
                    error: {
                        code: "BadRequest",
                        message: "Unsupported planning action: " + action
                    }
                };
                return;
            }

            if (typeof loggingQueue !== "undefined" && loggingQueue) {
                loggingQueue.log("[" + request.requestId + "] Plan created: " + planId + " with " + changes.length + " changes");
            }

            response.body = {
                planId: planId,
                changes: changes,
                warnings: []
            };
        },

        /**
         * Handle POST /model/apply - Apply changes asynchronously
         * @param {Object} request - HTTP request object with body.changes
         * @param {Object} response - HTTP response object
         * @param {Object} serverState - Server state object (unused)
         */
        handleApply: function(request, response, serverState) {
            var body = request.body || {};

            // Get current model snapshot for duplicate checking
            var snapshot = null;
            if (typeof modelSnapshot !== "undefined" && modelSnapshot) {
                snapshot = modelSnapshot.getSnapshot();
            }

            try {
                operationValidation.validateApplyRequest(body, snapshot);
            } catch (e) {
                response.statusCode = 400;
                response.body = {
                    error: {
                        code: e && e.code ? String(e.code) : "ValidationError",
                        message: String(e)
                    }
                };
                return;
            }

            var changes = body.changes;
            var duplicateStrategy = body.duplicateStrategy || "error";
            var idempotencyKey = body.idempotencyKey || null;
            var idempotencyReservation = null;
            var idempotencyMeta = null;

            if (idempotencyKey &&
                typeof idempotencyStore !== "undefined" &&
                idempotencyStore &&
                typeof idempotencyStore.validateKey === "function" &&
                typeof idempotencyStore.hashApplyRequestBody === "function" &&
                typeof idempotencyStore.reserve === "function") {
                try {
                    idempotencyKey = idempotencyStore.validateKey(idempotencyKey);
                    var payloadHash = idempotencyStore.hashApplyRequestBody(body);
                    idempotencyReservation = idempotencyStore.reserve(idempotencyKey, payloadHash);
                } catch (idempotencyErr) {
                    response.statusCode = 400;
                    response.body = {
                        error: {
                            code: idempotencyErr && idempotencyErr.code ? String(idempotencyErr.code) : "ValidationError",
                            message: String(idempotencyErr)
                        }
                    };
                    return;
                }

                if (idempotencyReservation && idempotencyReservation.status === "conflict") {
                    response.statusCode = 409;
                    response.body = {
                        error: {
                            code: "IdempotencyConflict",
                            message: "idempotencyKey '" + idempotencyKey + "' was already used with a different payload."
                        },
                        operationId: idempotencyReservation.record ? idempotencyReservation.record.operationId : null,
                        idempotency: idempotencyStore.buildResponseMeta(idempotencyReservation.record, false)
                    };
                    return;
                }

                if (idempotencyReservation && idempotencyReservation.status === "replay") {
                    var replayRecord = idempotencyReservation.record;
                    var replayOperationId = replayRecord ? replayRecord.operationId : null;
                    var replayOperation = replayOperationId ? operationQueue.getOperationStatus(replayOperationId) : null;
                    var replayStatus = replayOperation ? replayOperation.status : (replayRecord ? replayRecord.status : "queued");

                    response.body = {
                        operationId: replayOperationId,
                        status: replayStatus || "queued",
                        message: replayOperationId
                            ? "Idempotent replay. Returning existing operation: " + replayOperationId
                            : "Idempotent replay. Existing operation is reserved but not yet assigned.",
                        digest: replayOperation ? (replayOperation.digest || null) : null,
                        tempIdMap: replayOperation ? (replayOperation.tempIdMap || {}) : {},
                        tempIdMappings: replayOperation ? (replayOperation.tempIdMappings || []) : [],
                        idempotency: idempotencyStore.buildResponseMeta(replayRecord, true)
                    };
                    return;
                }

                if (idempotencyReservation && idempotencyReservation.record) {
                    idempotencyMeta = idempotencyStore.buildResponseMeta(idempotencyReservation.record, false);
                }
            }

            if (typeof loggingQueue !== "undefined" && loggingQueue) {
                loggingQueue.log("[" + request.requestId + "] Apply: Queuing " + changes.length + " change(s) for processing");
            }

            // Create operation descriptor
            var operation = operationQueue.createOperation(changes, {
                idempotencyKey: idempotencyKey || null,
                duplicateStrategy: duplicateStrategy
            });
            operation.requestId = request.requestId;  // Track originating request

            var requestedByType = {};
            for (var i = 0; i < changes.length; i++) {
                var opName = changes[i] && typeof changes[i].op === "string" ? changes[i].op : "unknown";
                requestedByType[opName] = (requestedByType[opName] || 0) + 1;
            }

            // Queue for processing
            operationQueue.queueOperation(operation);

            if (idempotencyKey &&
                typeof idempotencyStore !== "undefined" &&
                idempotencyStore &&
                typeof idempotencyStore.attachOperation === "function") {
                try {
                    var attachedRecord = idempotencyStore.attachOperation(idempotencyKey, operation.id);
                    if (attachedRecord) {
                        idempotencyMeta = idempotencyStore.buildResponseMeta(attachedRecord, false);
                    }
                } catch (idempotencyAttachErr) {
                    if (typeof loggingQueue !== "undefined" && loggingQueue) {
                        loggingQueue.warn("[" + request.requestId + "] Idempotency attach failed: " + idempotencyAttachErr);
                    }
                }
            }

            if (typeof loggingQueue !== "undefined" && loggingQueue) {
                loggingQueue.log("[" + request.requestId + "] Apply: Operation queued: " + operation.id);
            }

            // Return immediately with operation ID
            response.body = {
                operationId: operation.id,
                status: "queued",
                message: "Operation queued for processing. Poll /ops/status?opId=" + operation.id,
                digest: {
                    totals: {
                        requested: changes.length,
                        results: 0,
                        executed: 0,
                        skipped: 0
                    },
                    requestedByType: requestedByType,
                    executedByType: {},
                    skipsByReason: {},
                    integrityFlags: {
                        hasErrors: false,
                        hasSkips: false,
                        resultCountMatchesRequested: false,
                        pending: true
                    }
                },
                tempIdMap: {},
                tempIdMappings: [],
                idempotency: idempotencyMeta || undefined
            };
        },

        /**
         * Handle POST /model/search - Search elements with filters
         * @param {Object} request - HTTP request with search criteria
         * @param {Object} response - HTTP response object
         * @param {Object} serverState - Server state with modelRef
         */
        handleSearch: function(request, response, serverState) {
            var body = request.body || {};

            if (typeof loggingQueue !== "undefined" && loggingQueue) {
                loggingQueue.log("[" + request.requestId + "] Search: type=" + (body.type || '*') + 
                    ", namePattern=" + (body.namePattern || '*'));
            }

            try {
                if (!serverState.modelRef) {
                    throw new Error("No model reference available");
                }

                var criteria = {
                    type: body.type || null,
                    namePattern: body.namePattern || null,
                    propertyKey: body.propertyKey || null,
                    propertyValue: body.propertyValue || null,
                    includeRelationships: body.includeRelationships !== false,
                    limit: body.limit || 1000
                };

                var results = searchElements(serverState.modelRef, criteria);

                if (typeof loggingQueue !== "undefined" && loggingQueue) {
                    loggingQueue.log("[" + request.requestId + "] Search found " + results.length + " results");
                }

                response.body = {
                    results: results,
                    total: results.length,
                    criteria: {
                        type: criteria.type,
                        namePattern: criteria.namePattern,
                        propertyKey: criteria.propertyKey,
                        propertyValue: criteria.propertyValue,
                        includeRelationships: criteria.includeRelationships,
                        limit: criteria.limit
                    }
                };

            } catch (e) {
                if (typeof loggingQueue !== "undefined" && loggingQueue) {
                    loggingQueue.error("[" + request.requestId + "] Search failed: " + e);
                }
                response.statusCode = 500;
                response.body = {
                    error: {
                        code: "SearchFailed",
                        message: String(e)
                    }
                };
            }
        },

        /**
         * Handle GET /model/element/:id - Get single element details
         * @param {Object} request - HTTP request with params.id
         * @param {Object} response - HTTP response object
         * @param {Object} serverState - Server state with modelRef
         */
        handleGetElement: function(request, response, serverState) {
            var elementId = request.params && request.params.id;

            if (!elementId) {
                response.statusCode = 400;
                response.body = {
                    error: {
                        code: "ValidationError",
                        message: "Missing element ID parameter"
                    }
                };
                return;
            }

            if (typeof loggingQueue !== "undefined" && loggingQueue) {
                loggingQueue.log("[" + request.requestId + "] Get element: " + elementId);
            }

            try {
                if (!serverState.modelRef) {
                    throw new Error("No model reference available");
                }

                var element = findElementById(serverState.modelRef, elementId);

                if (!element) {
                    response.statusCode = 404;
                    response.body = {
                        error: {
                            code: "NotFound",
                            message: "Element not found: " + elementId
                        }
                    };
                    return;
                }

                // Build detailed response
                var elementDetail = {
                    id: element.getId(),
                    name: element.getName() || '',
                    type: getTypeString(element),
                    documentation: element.getDocumentation() || '',
                    properties: getPropertiesMap(element)
                };

                // Add relationship-specific fields
                if (element instanceof IArchimateRelationship) {
                    var source = element.getSource();
                    var target = element.getTarget();
                    elementDetail.source = source ? {
                        id: source.getId(),
                        name: source.getName() || '',
                        type: getTypeString(source)
                    } : null;
                    elementDetail.target = target ? {
                        id: target.getId(),
                        name: target.getName() || '',
                        type: getTypeString(target)
                    } : null;
                    
                    // Access relationship specific
                    if (typeof element.getAccessType === 'function') {
                        elementDetail.accessType = element.getAccessType();
                    }
                    // Influence relationship specific  
                    if (typeof element.getStrength === 'function') {
                        elementDetail.strength = element.getStrength();
                    }
                }

                // For elements (not relationships), get related relationships and views
                if (element instanceof IArchimateElement) {
                    var relationships = getRelationshipsForElement(serverState.modelRef, elementId);
                    elementDetail.relationships = relationships;
                    
                    var views = getViewsContainingElement(serverState.modelRef, elementId);
                    elementDetail.views = views;
                }

                response.body = elementDetail;

            } catch (e) {
                if (typeof loggingQueue !== "undefined" && loggingQueue) {
                    loggingQueue.error("[" + request.requestId + "] Get element failed: " + e);
                }
                response.statusCode = 500;
                response.body = {
                    error: {
                        code: "GetElementFailed",
                        message: String(e)
                    }
                };
            }
        },

        /**
         * Handle GET /folders - List all folders in model
         * @param {Object} request - HTTP request object
         * @param {Object} response - HTTP response object
         * @param {Object} serverState - Server state with modelRef
         */
        handleListFolders: function(request, response, serverState) {
            if (typeof loggingQueue !== "undefined" && loggingQueue) {
                loggingQueue.log("[" + request.requestId + "] List folders");
            }

            try {
                if (!serverState.modelRef) {
                    throw new Error("No model reference available");
                }

                var folders = collectFolders(serverState.modelRef);

                response.body = {
                    folders: folders,
                    total: folders.length
                };

            } catch (e) {
                if (typeof loggingQueue !== "undefined" && loggingQueue) {
                    loggingQueue.error("[" + request.requestId + "] List folders failed: " + e);
                }
                response.statusCode = 500;
                response.body = {
                    error: {
                        code: "ListFoldersFailed",
                        message: String(e)
                    }
                };
            }
        },

        /**
         * Handle POST /model/save - Save model to disk
         * @param {Object} request - HTTP request object
         * @param {Object} response - HTTP response object
         * @param {Object} serverState - Server state with modelRef
         */
        handleSave: function(request, response, serverState) {
            if (typeof loggingQueue !== "undefined" && loggingQueue) {
                loggingQueue.log("[" + request.requestId + "] Save model");
            }

            try {
                if (!serverState.modelRef) {
                    throw new Error("No model reference available");
                }

                var body = request.body || {};
                var requestedPath = body.path || null;
                var IEditorModelManager = Java.type("com.archimatetool.editor.model.IEditorModelManager");
                var modelManager = IEditorModelManager.INSTANCE;
                var File = Java.type("java.io.File");

                // Resolve current file from the EMF model reference captured at server startup.
                var currentFile = null;
                try {
                    if (serverState.modelRef && typeof serverState.modelRef.getFile === "function") {
                        currentFile = serverState.modelRef.getFile();
                    }
                } catch (_currentFileError) {
                    currentFile = null;
                }
                var hasExistingFile = (currentFile !== null && currentFile !== undefined);

                if (!hasExistingFile && !requestedPath) {
                    // Auto-generate path from model name
                    var System = Java.type("java.lang.System");
                    var userHome = System.getProperty("user.home");
                    var modelName = serverState.modelRef.getName() || "untitled-model";

                    // Sanitize model name for filesystem (remove invalid characters)
                    var safeName = String(modelName).replace(/[\/\\:*?"<>|]/g, "_");

                    // Generate path in Documents/archi-models/
                    var autoPath = userHome + "/Documents/archi-models/" + safeName + ".archimate";
                    requestedPath = autoPath;

                    if (typeof loggingQueue !== "undefined" && loggingQueue) {
                        loggingQueue.log("[" + request.requestId + "] Auto-generated save path: " + autoPath);
                    }
                }

                // Track if path was auto-generated
                var autoGenerated = (!hasExistingFile && !body.path);

                // If a path was provided (or auto-generated), set the file on the model before saving
                if (requestedPath) {
                    var targetFile = new File(String(requestedPath));
                    // Ensure .archimate extension
                    if (!String(requestedPath).endsWith(".archimate")) {
                        targetFile = new File(String(requestedPath) + ".archimate");
                    }
                    // Ensure parent directory exists
                    var parentDir = targetFile.getParentFile();
                    if (parentDir && !parentDir.exists()) {
                        parentDir.mkdirs();
                    }
                    serverState.modelRef.setFile(targetFile);
                }

                var startTime = Date.now();
                modelManager.saveModel(serverState.modelRef);
                var durationMs = Date.now() - startTime;

                // Read final path from EMF model file binding (does not require UI model selection).
                var savedPath = null;
                try {
                    var savedFile = serverState.modelRef.getFile();
                    if (savedFile) {
                        savedPath = String(savedFile.getAbsolutePath());
                    }
                } catch (_savedPathError) {
                    savedPath = null;
                }

                if (typeof loggingQueue !== "undefined" && loggingQueue) {
                    loggingQueue.log("[" + request.requestId + "] Model saved to " + (savedPath || "existing path") + " (" + durationMs + "ms)");
                }

                var responseBody = {
                    success: true,
                    message: "Model saved successfully",
                    modelName: serverState.modelRef.getName() || '',
                    modelId: serverState.modelRef.getId(),
                    path: savedPath,
                    durationMs: durationMs
                };

                if (autoGenerated) {
                    responseBody.autoGeneratedPath = true;
                }

                response.body = responseBody;

            } catch (e) {
                if (typeof loggingQueue !== "undefined" && loggingQueue) {
                    loggingQueue.error("[" + request.requestId + "] Save failed: " + e);
                }
                response.statusCode = 500;
                response.body = {
                    error: {
                        code: "SaveFailed",
                        message: String(e)
                    }
                };
            }
        }
    };

    // Export globally for JArchi
    if (typeof globalThis !== "undefined") {
        globalThis.modelEndpoints = modelEndpoints;
    } else if (typeof global !== "undefined") {
        global.modelEndpoints = modelEndpoints;
    }

    // CommonJS for Node.js build tools
    if (typeof module !== "undefined" && module.exports) {
        module.exports = modelEndpoints;
    }

})();
