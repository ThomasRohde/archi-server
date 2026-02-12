/**
 * viewEndpoints.js - View management and export endpoints
 *
 * Handles view listing, details, creation, and export operations (PNG, JPEG).
 * All export operations return absolute file paths for local filesystem access.
 *
 * Endpoints:
 *   GET  /views              - List all views with metadata
 *   GET  /views/:id          - Get single view details including elements
 *   POST /views              - Create new view (async via operationQueue)
 *   POST /views/:id/export   - Export view to file (PNG, JPEG)
 *
 * @module server/endpoints/viewEndpoints
 * @requires server/loggingQueue
 * @requires server/modelSnapshot
 * @requires server/operationQueue
 */

(function() {
    "use strict";

    // Guard against double-loading
    if (typeof globalThis !== "undefined" && typeof globalThis.viewEndpoints !== "undefined") {
        return;
    }

    // Java imports for file operations
    var File = Java.type("java.io.File");
    var System = Java.type("java.lang.System");
    var UUID = Java.type("java.util.UUID");

    // Viewpoint manager for resolving viewpoint IDs
    var ViewpointManagerClass = Java.type("com.archimatetool.model.viewpoints.ViewpointManager");

    function normalizeViewpointToken(value) {
        if (value === null || value === undefined) return null;
        var token = String(value).trim().toLowerCase();
        if (!token) return null;
        token = token.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
        return token.length > 0 ? token : null;
    }

    function stripViewpointSuffix(token) {
        if (!token) return token;
        return token.replace(/_viewpoint$/, "");
    }

    function normalizeViewpointId(value) {
        if (value === null || value === undefined) return null;
        var raw = String(value).trim();
        if (!raw) return null;
        if (raw.indexOf("@") !== -1) return null;
        return normalizeViewpointToken(raw);
    }

    function safeViewpointId(viewpointObj) {
        if (!viewpointObj) return null;
        try {
            var id = viewpointObj.getId ? viewpointObj.getId() : null;
            return normalizeViewpointId(id);
        } catch (e) {
            return null;
        }
    }

    function safeViewpointName(viewpointObj) {
        if (!viewpointObj) return null;
        try {
            var name = viewpointObj.getName ? viewpointObj.getName() : null;
            if (name === null || name === undefined) return null;
            var str = String(name).trim();
            return str.length > 0 ? str : null;
        } catch (e) {
            return null;
        }
    }

    function safeViewpointString(viewpointObj) {
        if (!viewpointObj) return null;
        try {
            var str = String(viewpointObj).trim();
            return str.length > 0 ? str : null;
        } catch (e) {
            return null;
        }
    }

    function resolveViewpointInput(viewpointInput) {
        var raw = viewpointInput === null || viewpointInput === undefined ? "" : String(viewpointInput).trim();
        if (!raw) return { id: null, viewpoint: null, invalidFormat: false };
        if (raw.indexOf("@") !== -1) return { id: null, viewpoint: null, invalidFormat: true };

        var normalizedInput = normalizeViewpointToken(raw);
        var normalizedInputStripped = stripViewpointSuffix(normalizedInput);
        var rawLower = raw.toLowerCase();

        try {
            var manager = ViewpointManagerClass.INSTANCE;

            if (normalizedInput) {
                var direct = manager.getViewpoint(normalizedInput);
                if (direct) {
                    return { id: normalizedInput, viewpoint: direct, invalidFormat: false };
                }
            }

            var allVPs = manager.getAllViewpoints();
            for (var i = 0; i < allVPs.size(); i++) {
                var candidate = allVPs.get(i);
                var candidateId = safeViewpointId(candidate);
                if (!candidateId) continue;

                var candidateName = safeViewpointName(candidate);
                var candidateNameToken = normalizeViewpointToken(candidateName);
                var candidateIdStripped = stripViewpointSuffix(candidateId);
                var candidateNameTokenStripped = stripViewpointSuffix(candidateNameToken);

                if (candidateId === normalizedInput) {
                    return { id: candidateId, viewpoint: candidate, invalidFormat: false };
                }
                if (candidateName && candidateName.toLowerCase() === rawLower) {
                    return { id: candidateId, viewpoint: candidate, invalidFormat: false };
                }
                if (candidateNameToken && candidateNameToken === normalizedInput) {
                    return { id: candidateId, viewpoint: candidate, invalidFormat: false };
                }
                if (normalizedInputStripped &&
                    (candidateIdStripped === normalizedInputStripped || candidateNameTokenStripped === normalizedInputStripped)) {
                    return { id: candidateId, viewpoint: candidate, invalidFormat: false };
                }
            }
        } catch (e) {
            // ignore and return unknown
        }

        return { id: normalizedInput, viewpoint: null, invalidFormat: false };
    }

    // EMF types for view detection
    var IArchimateDiagramModel = Java.type("com.archimatetool.model.IArchimateDiagramModel");
    var ISketchModel = Java.type("com.archimatetool.model.ISketchModel");
    var ICanvasModel = Java.type("com.archimatetool.canvas.model.ICanvasModel");
    var IDiagramModelObject = Java.type("com.archimatetool.model.IDiagramModelObject");
    var IDiagramModelConnection = Java.type("com.archimatetool.model.IDiagramModelConnection");
    var IDiagramModelArchimateObject = Java.type("com.archimatetool.model.IDiagramModelArchimateObject");
    var IDiagramModelArchimateConnection = Java.type("com.archimatetool.model.IDiagramModelArchimateConnection");

    /**
     * Resolve viewpoint ID from a view, handling GraalVM module-access restrictions.
     * vp.getId() may fail on the inner Viewpoint class; fallback scans ViewpointManager.
     */
    function getViewpointId(view) {
        try {
            var vp = view.getViewpoint();
            if (!vp) return null;
            if (typeof vp === "string") return normalizeViewpointId(vp);

            var normalizedId = safeViewpointId(vp);
            if (normalizedId) return normalizedId;

            var vpName = safeViewpointName(vp);
            var vpString = safeViewpointString(vp);

            // Fallback: scan all viewpoints for identity match
            var allVPs = ViewpointManagerClass.INSTANCE.getAllViewpoints();
            for (var i = 0; i < allVPs.size(); i++) {
                var candidate = allVPs.get(i);
                var candidateId = safeViewpointId(candidate);
                if (!candidateId) continue;
                if (candidate === vp) return candidateId;
                if (candidate.equals && candidate.equals(vp)) return candidateId;

                var candidateName = safeViewpointName(candidate);
                if (vpName && candidateName && candidateName === vpName) return candidateId;

                var candidateString = safeViewpointString(candidate);
                if (vpString && candidateString && candidateString === vpString) return candidateId;
            }
        } catch (e) {
            // ignore
        }
        return null;
    }

    /**
     * Find a view by ID using EMF traversal (works without $() context)
     * @param {Object} modelRef - EMF model reference
     * @param {string} viewId - View ID to find
     * @returns {Object|null} EMF view object or null
     */
    function findViewById(modelRef, viewId) {
        if (!modelRef || !viewId) return null;

        var folders = modelRef.getFolders();
        for (var i = 0; i < folders.size(); i++) {
            var folder = folders.get(i);
            var view = searchFolderForView(folder, viewId);
            if (view) return view;
        }
        return null;
    }

    /**
     * Recursively search folder for view by ID
     */
    function searchFolderForView(folder, viewId) {
        var elements = folder.getElements();
        for (var i = 0; i < elements.size(); i++) {
            var element = elements.get(i);
            if (element.getId() === viewId) {
                // Verify it's a view type
                if (element instanceof IArchimateDiagramModel ||
                    element instanceof ISketchModel ||
                    element instanceof ICanvasModel) {
                    return element;
                }
            }
        }

        var subfolders = folder.getFolders();
        for (var j = 0; j < subfolders.size(); j++) {
            var found = searchFolderForView(subfolders.get(j), viewId);
            if (found) return found;
        }

        return null;
    }

    /**
     * Collect all views from model using EMF traversal
     */
    function collectAllViews(modelRef) {
        var views = [];
        if (!modelRef) return views;

        var folders = modelRef.getFolders();
        for (var i = 0; i < folders.size(); i++) {
            collectViewsFromFolder(folders.get(i), views);
        }
        return views;
    }

    /**
     * Recursively collect views from folder
     */
    function collectViewsFromFolder(folder, views) {
        var elements = folder.getElements();
        for (var i = 0; i < elements.size(); i++) {
            var element = elements.get(i);
            if (element instanceof IArchimateDiagramModel ||
                element instanceof ISketchModel ||
                element instanceof ICanvasModel) {
                views.push(element);
            }
        }

        var subfolders = folder.getFolders();
        for (var j = 0; j < subfolders.size(); j++) {
            collectViewsFromFolder(subfolders.get(j), views);
        }
    }

    /**
     * Get view type string from EMF object
     */
    function getViewType(view) {
        if (view instanceof IArchimateDiagramModel) return "archimate-diagram-model";
        if (view instanceof ISketchModel) return "sketch-model";
        if (view instanceof ICanvasModel) return "canvas-model";
        return "unknown";
    }

    /**
     * Count elements and connections in a view using EMF traversal
     */
    function countViewContents(view) {
        var objectCount = 0;
        var connectionCount = 0;

        // Connections in Archi's diagram model are stored in the sourceConnections
        // list of each IDiagramModelObject — they are NOT children of the view container.
        function processChildren(container) {
            var children = container.getChildren();
            for (var i = 0; i < children.size(); i++) {
                var child = children.get(i);
                if (child instanceof IDiagramModelObject) {
                    objectCount++;
                    // Count connections that originate from this object
                    var srcConns = child.getSourceConnections ? child.getSourceConnections() : null;
                    if (srcConns) connectionCount += srcConns.size();
                    // Recursively process nested children (groups, etc.)
                    var childList = child.getChildren ? child.getChildren() : null;
                    if (childList) processChildren(child);
                }
            }
        }

        processChildren(view);

        return { objectCount: objectCount, connectionCount: connectionCount };
    }

    /**
     * Get view details including elements and connections using EMF traversal
     */
    function getViewDetails(view) {
        var elements = [];
        var connections = [];

        function processChildren(container, parentId) {
            var children = container.getChildren();
            for (var i = 0; i < children.size(); i++) {
                var child = children.get(i);

                // Collect connections
                var sourceConns = child.getSourceConnections ? child.getSourceConnections() : null;
                if (sourceConns) {
                    for (var c = 0; c < sourceConns.size(); c++) {
                        var conn = sourceConns.get(c);
                        var connData = {
                            id: conn.getId(),
                            name: conn.getName() || ""
                        };

                        if (conn.getSource()) connData.sourceId = conn.getSource().getId();
                        if (conn.getTarget()) connData.targetId = conn.getTarget().getId();

                        // Get underlying concept for archimate connections
                        if (conn instanceof IDiagramModelArchimateConnection) {
                            var relConcept = conn.getArchimateRelationship();
                            if (relConcept) {
                                connData.conceptId = relConcept.getId();
                                connData.conceptType = relConcept.eClass().getName().replace(/([A-Z])/g, function(m, p, o) {
                                    return (o > 0 ? '-' : '') + p.toLowerCase();
                                });
                            }
                            connData.type = "diagram-model-archimate-connection";
                        } else {
                            connData.type = "diagram-model-connection";
                        }

                        // Add style properties for connections
                        if (typeof conn.getLineColor === "function") {
                            var lineColor = conn.getLineColor();
                            if (lineColor) connData.lineColor = lineColor;
                        }
                        if (typeof conn.getLineWidth === "function") {
                            var lineWidth = conn.getLineWidth();
                            if (lineWidth !== undefined && lineWidth !== 1) connData.lineWidth = lineWidth;
                        }
                        if (typeof conn.getFontColor === "function") {
                            var connFontColor = conn.getFontColor();
                            if (connFontColor) connData.fontColor = connFontColor;
                        }

                        connections.push(connData);
                    }
                }

                // Collect element
                if (child instanceof IDiagramModelObject) {
                    var bounds = child.getBounds();
                    var elemData = {
                        id: child.getId(),
                        name: child.getName() || "",
                        x: bounds ? bounds.getX() : 0,
                        y: bounds ? bounds.getY() : 0,
                        width: bounds ? bounds.getWidth() : 0,
                        height: bounds ? bounds.getHeight() : 0
                    };

                    // Include parentId for nested visual objects
                    if (parentId) {
                        elemData.parentId = parentId;
                    }

                    // Add style properties for visual objects
                    if (typeof child.getFillColor === "function") {
                        var fillColor = child.getFillColor();
                        if (fillColor) elemData.fillColor = fillColor;
                    }
                    if (typeof child.getLineColor === "function") {
                        var lineColor = child.getLineColor();
                        if (lineColor) elemData.lineColor = lineColor;
                    }
                    if (typeof child.getLineWidth === "function") {
                        var objLineWidth = child.getLineWidth();
                        if (objLineWidth !== undefined && objLineWidth !== 1) elemData.lineWidth = objLineWidth;
                    }
                    if (typeof child.getFontColor === "function") {
                        var fontColor = child.getFontColor();
                        if (fontColor) elemData.fontColor = fontColor;
                    }

                    // Get underlying concept for archimate objects
                    if (child instanceof IDiagramModelArchimateObject) {
                        var concept = child.getArchimateElement();
                        if (concept) {
                            elemData.conceptId = concept.getId();
                            elemData.conceptType = concept.eClass().getName().replace(/([A-Z])/g, function(m, p, o) {
                                return (o > 0 ? '-' : '') + p.toLowerCase();
                            });
                        }
                        elemData.type = "diagram-model-archimate-object";
                    } else {
                        elemData.type = child.eClass().getName().replace(/([A-Z])/g, function(m, p, o) {
                            return (o > 0 ? '-' : '') + p.toLowerCase();
                        });
                    }

                    elements.push(elemData);

                    // Recursively process nested children, passing this element as parent
                    if (typeof child.getChildren === "function") {
                        processChildren(child, child.getId());
                    }
                }
            }
        }

        processChildren(view, null);
        return { elements: elements, connections: connections };
    }

    /**
     * View endpoint handlers
     */
    var viewEndpoints = {
        /**
         * Handle GET /views - List all views
         * @param {Object} request - HTTP request object
         * @param {Object} response - HTTP response object
         * @param {Object} serverState - Server state with modelRef
         */
        handleListViews: function(request, response, serverState) {
            if (typeof loggingQueue !== "undefined" && loggingQueue) {
                loggingQueue.log("[" + request.requestId + "] List views");
            }

            try {
                if (!serverState.modelRef) {
                    throw new Error("No model reference available");
                }

                // Get all views using EMF traversal (no $() required)
                var emfViews = collectAllViews(serverState.modelRef);
                var viewList = [];

                emfViews.forEach(function(view) {
                    var viewData = {
                        id: view.getId(),
                        name: view.getName() || "",
                        type: getViewType(view),
                        viewpoint: null
                    };

                    // Get viewpoint if available
                    if (view instanceof IArchimateDiagramModel) {
                        viewData.viewpoint = getViewpointId(view);
                    }

                    // Count elements and connections
                    try {
                        var counts = countViewContents(view);
                        viewData.objectCount = counts.objectCount;
                        viewData.connectionCount = counts.connectionCount;
                    } catch (e) {
                        // Ignore count errors
                    }

                    viewList.push(viewData);
                });

                if (typeof loggingQueue !== "undefined" && loggingQueue) {
                    loggingQueue.log("[" + request.requestId + "] Found " + viewList.length + " views");
                }

                response.body = {
                    views: viewList,
                    total: viewList.length
                };

            } catch (e) {
                if (typeof loggingQueue !== "undefined" && loggingQueue) {
                    loggingQueue.error("[" + request.requestId + "] List views failed: " + e);
                }
                response.statusCode = 500;
                response.body = {
                    error: {
                        code: "ListViewsFailed",
                        message: String(e)
                    }
                };
            }
        },

        /**
         * Handle GET /views/:id - Get single view details
         * @param {Object} request - HTTP request with params.id
         * @param {Object} response - HTTP response object
         * @param {Object} serverState - Server state with modelRef
         */
        handleGetView: function(request, response, serverState) {
            var viewId = request.params && request.params.id;

            if (!viewId) {
                response.statusCode = 400;
                response.body = {
                    error: {
                        code: "ValidationError",
                        message: "Missing view ID parameter"
                    }
                };
                return;
            }

            if (typeof loggingQueue !== "undefined" && loggingQueue) {
                loggingQueue.log("[" + request.requestId + "] Get view: " + viewId);
            }

            try {
                if (!serverState.modelRef) {
                    throw new Error("No model reference available");
                }

                // Find view using EMF traversal (no $() required)
                var view = findViewById(serverState.modelRef, viewId);

                if (!view) {
                    response.statusCode = 404;
                    response.body = {
                        error: {
                            code: "NotFound",
                            message: "View not found: " + viewId
                        }
                    };
                    return;
                }

                var viewType = getViewType(view);

                // Build detailed view response
                var viewDetail = {
                    id: view.getId(),
                    name: view.getName() || "",
                    type: viewType,
                    documentation: view.getDocumentation() || "",
                    viewpoint: null,
                    connectionRouter: null,
                    elements: [],
                    connections: []
                };

                // Get viewpoint if ArchiMate diagram
                if (view instanceof IArchimateDiagramModel) {
                    viewDetail.viewpoint = getViewpointId(view);

                    // Get connection router (JArchi 1.11+)
                    try {
                        var router = view.getConnectionRouterType();
                        if (router !== undefined) {
                            viewDetail.connectionRouter = router === 0 ? "bendpoint" : "manhattan";
                        }
                    } catch (e) {
                        // Ignore - older version
                    }
                }

                // Get elements and connections using EMF traversal
                var details = getViewDetails(view);
                viewDetail.elements = details.elements;
                viewDetail.connections = details.connections;

                if (typeof loggingQueue !== "undefined" && loggingQueue) {
                    // Debug: check raw children count
                    var rawChildCount = view.getChildren ? view.getChildren().size() : -1;
                    loggingQueue.log("[" + request.requestId + "] View has " + 
                        viewDetail.elements.length + " elements, " + 
                        viewDetail.connections.length + " connections (raw children: " + rawChildCount + ")");
                }

                response.body = viewDetail;

            } catch (e) {
                if (typeof loggingQueue !== "undefined" && loggingQueue) {
                    loggingQueue.error("[" + request.requestId + "] Get view failed: " + e);
                }
                if (e.javaException) {
                    e.javaException.printStackTrace();
                }
                response.statusCode = 500;
                response.body = {
                    error: {
                        code: "GetViewFailed",
                        message: String(e)
                    }
                };
            }
        },

        /**
         * Handle POST /views - Create new view
         * Creates a view using EMF directly (no jArchi model context required).
         * 
         * @param {Object} request - HTTP request with body.name, body.folder
         * @param {Object} response - HTTP response object
         * @param {Object} serverState - Server state with modelRef
         */
        handleCreateView: function(request, response, serverState) {
            var body = request.body || {};

            // Validate required fields
            if (!body.name) {
                response.statusCode = 400;
                response.body = {
                    error: {
                        code: "ValidationError",
                        message: "Missing required field: name"
                    }
                };
                return;
            }

            var viewpointId = null;
            if (body.viewpoint !== undefined && body.viewpoint !== null && String(body.viewpoint).trim() !== "") {
                var viewpointResolution = resolveViewpointInput(body.viewpoint);
                if (viewpointResolution.invalidFormat) {
                    response.statusCode = 400;
                    response.body = {
                        error: {
                            code: "ValidationError",
                            message: "Invalid viewpoint format: " + body.viewpoint
                        }
                    };
                    return;
                }

                viewpointId = viewpointResolution.id;
                if (!viewpointResolution.viewpoint) {
                    response.statusCode = 400;
                    response.body = {
                        error: {
                            code: "ValidationError",
                            message: "Unknown viewpoint: " + String(body.viewpoint).trim()
                        }
                    };
                    return;
                }
            }

            // Check for duplicate view name (unless allowDuplicate is true)
            var allowDuplicate = body.allowDuplicate === true;

            if (!allowDuplicate) {
                var modelRef = serverState.modelRef;
                if (!modelRef) {
                    response.statusCode = 500;
                    response.body = {
                        error: {
                            code: "NoModel",
                            message: "No model reference available"
                        }
                    };
                    return;
                }

                // Check for existing view with same name
                var existingViews = modelRef.getDiagramModels();
                for (var vi = 0; vi < existingViews.size(); vi++) {
                    var existingView = existingViews.get(vi);
                    if (existingView.getName() === body.name) {
                        response.statusCode = 409;
                        response.body = {
                            error: {
                                code: "ViewNameExists",
                                message: "A view with name '" + body.name + "' already exists. " +
                                        "Use allowDuplicate: true to create anyway, or choose a different name.",
                                existingViewId: existingView.getId()
                            }
                        };
                        if (typeof loggingQueue !== "undefined" && loggingQueue) {
                            loggingQueue.warn("[" + request.requestId + "] View creation blocked: name '" +
                                            body.name + "' already exists (id: " + existingView.getId() + ")");
                        }
                        return;
                    }
                }
            }

            if (typeof loggingQueue !== "undefined" && loggingQueue) {
                loggingQueue.log("[" + request.requestId + "] Create view: " + body.name);
            }

            var startTime = Date.now();

            try {
                var viewName = body.name;
                var documentation = body.documentation || "";

                // Get model reference
                var modelRef = serverState.modelRef;
                if (!modelRef) {
                    throw new Error("No model reference available");
                }

                // Use undoableCommands for proper undo support
                var ops = [{
                    op: "createView",
                    name: viewName,
                    documentation: documentation || undefined,
                    folderId: body.folderId || undefined,
                    viewpoint: viewpointId || undefined
                }];
                var results = undoableCommands.executeBatch(modelRef, "Create View: " + viewName, ops);
                var result = results[0];

                var durationMs = Date.now() - startTime;

                if (typeof loggingQueue !== "undefined" && loggingQueue) {
                    loggingQueue.log("[" + request.requestId + "] View created: " + result.viewId + " (" + durationMs + "ms) [UNDOABLE]");
                }

                response.body = {
                    viewId: result.viewId,
                    viewName: result.viewName,
                    viewType: "archimate-diagram-model",
                    viewpoint: normalizeViewpointId(result.viewpoint) || null,
                    documentation: result.documentation || null,
                    durationMs: durationMs
                };

            } catch (e) {
                if (typeof loggingQueue !== "undefined" && loggingQueue) {
                    loggingQueue.error("[" + request.requestId + "] Create view failed: " + e);
                }
                if (e.javaException) {
                    e.javaException.printStackTrace();
                }
                response.statusCode = 500;
                response.body = {
                    error: {
                        code: "CreateViewFailed",
                        message: String(e)
                    }
                };
            }
        },

        /**
         * Handle POST /views/:id/export - Export view to file
         * 
         * Exports view to PNG or JPEG image formats.
         * Uses EMF-based rendering (no jArchi model context required).
         * Returns absolute file path for local MCP access.
         * 
         * @param {Object} request - HTTP request with params.id and body.format, body.outputPath
         * @param {Object} response - HTTP response object
         * @param {Object} serverState - Server state with modelRef
         */
        handleExportView: function(request, response, serverState) {
            var viewId = request.params && request.params.id;
            var body = request.body || {};

            if (!viewId) {
                response.statusCode = 400;
                response.body = {
                    error: {
                        code: "ValidationError",
                        message: "Missing view ID parameter"
                    }
                };
                return;
            }

            // Validate format
            var format = (body.format || "png").toUpperCase();
            var validFormats = ["PNG", "JPG", "JPEG"];
            if (validFormats.indexOf(format) === -1) {
                response.statusCode = 400;
                response.body = {
                    error: {
                        code: "ValidationError",
                        message: "Invalid format: " + format + ". Valid formats: " + validFormats.join(", ")
                    }
                };
                return;
            }

            if (body.scale !== undefined) {
                if (typeof body.scale !== "number" || !isFinite(body.scale) || body.scale < 0.5 || body.scale > 4.0) {
                    response.statusCode = 400;
                    response.body = {
                        error: {
                            code: "ValidationError",
                            message: "Invalid scale: must be a number between 0.5 and 4.0"
                        }
                    };
                    return;
                }
            }

            if (body.margin !== undefined) {
                if (typeof body.margin !== "number" || !isFinite(body.margin) || body.margin < 0 || Math.floor(body.margin) !== body.margin) {
                    response.statusCode = 400;
                    response.body = {
                        error: {
                            code: "ValidationError",
                            message: "Invalid margin: must be a non-negative integer"
                        }
                    };
                    return;
                }
            }

            if (typeof loggingQueue !== "undefined" && loggingQueue) {
                loggingQueue.log("[" + request.requestId + "] Export view " + viewId + " as " + format);
            }

            try {
                if (!serverState.modelRef) {
                    throw new Error("No model reference available");
                }

                // Find view using EMF traversal (no $() required)
                var view = findViewById(serverState.modelRef, viewId);

                if (!view) {
                    response.statusCode = 404;
                    response.body = {
                        error: {
                            code: "NotFound",
                            message: "View not found: " + viewId
                        }
                    };
                    return;
                }

                // Build output path
                var outputPath;
                var viewName = view.getName() || "view";
                if (body.outputPath) {
                    outputPath = body.outputPath;
                } else {
                    // Generate temp file path
                    var tempDir = System.getProperty("java.io.tmpdir");
                    var safeViewName = viewName.replace(/[^a-zA-Z0-9_-]/g, "_");
                    var timestamp = new Date().getTime();
                    var extension = format.toLowerCase();
                    if (extension === "jpeg") extension = "jpg";
                    outputPath = tempDir + File.separator + "archi_export_" + safeViewName + "_" + timestamp + "." + extension;
                }

                // Ensure parent directory exists
                var outputFile = new File(outputPath);
                var parentDir = outputFile.getParentFile();
                if (parentDir && !parentDir.exists()) {
                    parentDir.mkdirs();
                }

                // Export using EMF-based DiagramUtils
                var startTime = Date.now();
                var scale = body.scale !== undefined ? body.scale : 1.0;
                var margin = body.margin !== undefined ? body.margin : 10;

                // Use DiagramUtils to create image from diagram model
                var DiagramUtils = Java.type("com.archimatetool.editor.diagram.util.DiagramUtils");
                var ImageLoader = Java.type("org.eclipse.swt.graphics.ImageLoader");
                var SWT = Java.type("org.eclipse.swt.SWT");
                var FileOutputStream = Java.type("java.io.FileOutputStream");

                var image = DiagramUtils.createImage(view, scale, margin);

                if (!image) {
                    throw new Error("Failed to create image from view");
                }

                try {
                    // Determine SWT format constant
                    var swtFormat;
                    switch (format) {
                        case "PNG": swtFormat = SWT.IMAGE_PNG; break;
                        case "JPG":
                        case "JPEG": swtFormat = SWT.IMAGE_JPEG; break;
                        default: swtFormat = SWT.IMAGE_PNG;
                    }

                    // Save image to file
                    var loader = new ImageLoader();
                    loader.data = [image.getImageData()];

                    var fos = new FileOutputStream(outputFile);
                    try {
                        loader.save(fos, swtFormat);
                    } finally {
                        fos.close();
                    }
                } finally {
                    image.dispose();
                }

                var durationMs = Date.now() - startTime;

                // Verify file was created
                if (!outputFile.exists()) {
                    throw new Error("Export completed but file not found: " + outputPath);
                }

                var fileSizeBytes = outputFile.length();

                if (typeof loggingQueue !== "undefined" && loggingQueue) {
                    loggingQueue.log("[" + request.requestId + "] Exported to: " + outputPath + 
                        " (" + Math.round(fileSizeBytes / 1024) + " KB, " + durationMs + "ms)");
                }

                response.body = {
                    viewId: viewId,
                    viewName: viewName,
                    format: format,
                    filePath: outputFile.getAbsolutePath(),
                    fileSizeBytes: fileSizeBytes,
                    durationMs: durationMs
                };

            } catch (e) {
                if (typeof loggingQueue !== "undefined" && loggingQueue) {
                    loggingQueue.error("[" + request.requestId + "] Export view failed: " + e);
                }
                if (e.javaException) {
                    e.javaException.printStackTrace();
                }
                response.statusCode = 500;
                response.body = {
                    error: {
                        code: "ExportFailed",
                        message: String(e)
                    }
                };
            }
        },

        /**
         * Handle DELETE /views/:id - Delete a view
         * @param {Object} request - HTTP request with params.id
         * @param {Object} response - HTTP response object
         * @param {Object} serverState - Server state with modelRef
         */
        handleDeleteView: function(request, response, serverState) {
            var viewId = request.params && request.params.id;

            if (!viewId) {
                response.statusCode = 400;
                response.body = {
                    error: {
                        code: "ValidationError",
                        message: "Missing view ID parameter"
                    }
                };
                return;
            }

            if (typeof loggingQueue !== "undefined" && loggingQueue) {
                loggingQueue.log("[" + request.requestId + "] Delete view: " + viewId);
            }

            try {
                if (!serverState.modelRef) {
                    throw new Error("No model reference available");
                }

                var view = findViewById(serverState.modelRef, viewId);
                if (!view) {
                    response.statusCode = 404;
                    response.body = {
                        error: {
                            code: "NotFound",
                            message: "View not found: " + viewId
                        }
                    };
                    return;
                }

                var viewName = view.getName() || '';

                // Use undoableCommands for proper undo support
                var ops = [{ op: "deleteView", viewId: viewId }];
                undoableCommands.executeBatch(serverState.modelRef, "Delete View: " + viewName, ops);

                if (typeof loggingQueue !== "undefined" && loggingQueue) {
                    loggingQueue.log("[" + request.requestId + "] Deleted view: " + viewName + " [UNDOABLE]");
                }

                response.body = {
                    success: true,
                    viewId: viewId,
                    viewName: viewName
                };

            } catch (e) {
                if (typeof loggingQueue !== "undefined" && loggingQueue) {
                    loggingQueue.error("[" + request.requestId + "] Delete view failed: " + e);
                }
                response.statusCode = 500;
                response.body = {
                    error: {
                        code: "DeleteViewFailed",
                        message: String(e)
                    }
                };
            }
        },

        /**
         * Handle POST /views/:id/duplicate - Duplicate a view
         * @param {Object} request - HTTP request with params.id
         * @param {Object} response - HTTP response object
         * @param {Object} serverState - Server state with modelRef
         */
        handleDuplicateView: function(request, response, serverState) {
            var viewId = request.params && request.params.id;
            var body = request.body || {};

            if (!viewId) {
                response.statusCode = 400;
                response.body = {
                    error: {
                        code: "ValidationError",
                        message: "Missing view ID parameter"
                    }
                };
                return;
            }

            if (typeof loggingQueue !== "undefined" && loggingQueue) {
                loggingQueue.log("[" + request.requestId + "] Duplicate view: " + viewId);
            }

            try {
                if (!serverState.modelRef) {
                    throw new Error("No model reference available");
                }

                var view = findViewById(serverState.modelRef, viewId);
                if (!view) {
                    response.statusCode = 404;
                    response.body = {
                        error: {
                            code: "NotFound",
                            message: "View not found: " + viewId
                        }
                    };
                    return;
                }

                // Use undoableCommands for proper undo support
                var newName = body.name || (view.getName() + " (Copy)");
                var ops = [{ op: "duplicateView", viewId: viewId, name: newName }];
                var results = undoableCommands.executeBatch(serverState.modelRef, "Duplicate View: " + newName, ops);
                var result = results[0];

                if (typeof loggingQueue !== "undefined" && loggingQueue) {
                    loggingQueue.log("[" + request.requestId + "] Duplicated view: " + result.newViewId + " [UNDOABLE]");
                }

                response.body = {
                    success: true,
                    sourceViewId: viewId,
                    newViewId: result.newViewId,
                    newViewName: result.newViewName
                };

            } catch (e) {
                if (typeof loggingQueue !== "undefined" && loggingQueue) {
                    loggingQueue.error("[" + request.requestId + "] Duplicate view failed: " + e);
                }
                response.statusCode = 500;
                response.body = {
                    error: {
                        code: "DuplicateViewFailed",
                        message: String(e)
                    }
                };
            }
        },

        /**
         * Handle PUT /views/:id/router - Set view connection router type
         * @param {Object} request - HTTP request with params.id and body.routerType
         * @param {Object} response - HTTP response object
         * @param {Object} serverState - Server state with modelRef
         */
        handleSetViewRouter: function(request, response, serverState) {
            var viewId = request.params && request.params.id;
            var body = request.body || {};

            if (!viewId) {
                response.statusCode = 400;
                response.body = {
                    error: {
                        code: "ValidationError",
                        message: "Missing view ID parameter"
                    }
                };
                return;
            }

            var routerType = body.routerType;
            if (routerType !== "bendpoint" && routerType !== "manhattan") {
                response.statusCode = 400;
                response.body = {
                    error: {
                        code: "ValidationError",
                        message: "Invalid routerType. Must be 'bendpoint' or 'manhattan'"
                    }
                };
                return;
            }

            if (typeof loggingQueue !== "undefined" && loggingQueue) {
                loggingQueue.log("[" + request.requestId + "] Set router for view " + viewId + ": " + routerType);
            }

            try {
                if (!serverState.modelRef) {
                    throw new Error("No model reference available");
                }

                var view = findViewById(serverState.modelRef, viewId);
                if (!view) {
                    response.statusCode = 404;
                    response.body = {
                        error: {
                            code: "NotFound",
                            message: "View not found: " + viewId
                        }
                    };
                    return;
                }

                if (!(view instanceof IArchimateDiagramModel)) {
                    response.statusCode = 400;
                    response.body = {
                        error: {
                            code: "InvalidViewType",
                            message: "Router can only be set on ArchiMate diagram views"
                        }
                    };
                    return;
                }

                // Use undoableCommands for proper undo support
                var ops = [{ op: "setViewRouter", viewId: viewId, routerType: routerType }];
                undoableCommands.executeBatch(serverState.modelRef, "Set Router: " + routerType, ops);

                response.body = {
                    success: true,
                    viewId: viewId,
                    routerType: routerType
                };

            } catch (e) {
                if (typeof loggingQueue !== "undefined" && loggingQueue) {
                    loggingQueue.error("[" + request.requestId + "] Set router failed: " + e);
                }
                response.statusCode = 500;
                response.body = {
                    error: {
                        code: "SetRouterFailed",
                        message: String(e)
                    }
                };
            }
        },

        /**
         * Handle POST /views/:id/layout - Apply automatic layout to view
         * @param {Object} request - HTTP request with params.id and body with layout options
         * @param {Object} response - HTTP response object
         * @param {Object} serverState - Server state with modelRef
         */
        handleLayoutView: function(request, response, serverState) {
            var viewId = request.params && request.params.id;
            var body = request.body || {};

            if (!viewId) {
                response.statusCode = 400;
                response.body = {
                    error: {
                        code: "ValidationError",
                        message: "Missing view ID parameter"
                    }
                };
                return;
            }

            if (typeof loggingQueue !== "undefined" && loggingQueue) {
                loggingQueue.log("[" + request.requestId + "] Layout view: " + viewId);
            }

            try {
                if (!serverState.modelRef) {
                    throw new Error("No model reference available");
                }

                var view = findViewById(serverState.modelRef, viewId);
                if (!view) {
                    response.statusCode = 404;
                    response.body = {
                        error: {
                            code: "NotFound",
                            message: "View not found: " + viewId
                        }
                    };
                    return;
                }

                var requestedAlgorithm = body.algorithm || "dagre";
                var algorithm = requestedAlgorithm === "sugiyama" ? "sugiyama" : "dagre";

                if (algorithm === "dagre" && typeof layoutDagreHeadless === "undefined") {
                    response.statusCode = 501;
                    response.body = {
                        error: {
                            code: "NotImplemented",
                            message: "Dagre layout module not loaded. Ensure layoutDagreHeadless.js is loaded."
                        }
                    };
                    return;
                }

                if (algorithm === "sugiyama" && typeof layoutSugiyamaHeadless === "undefined") {
                    algorithm = "dagre";
                }

                var startTime = Date.now();
                var options = {
                    rankdir: body.rankdir || 'TB',
                    nodesep: body.nodesep || 50,
                    ranksep: body.ranksep || 50,
                    edgesep: body.edgesep || 10,
                    marginx: body.marginx || 20,
                    marginy: body.marginy || 20
                };

                // Apply layout via undoableCommands for proper undo support
                var ops = [{
                    op: "layoutView",
                    viewId: viewId,
                    algorithm: algorithm,
                    rankdir: options.rankdir,
                    nodesep: options.nodesep,
                    ranksep: options.ranksep,
                    edgesep: options.edgesep,
                    marginx: options.marginx,
                    marginy: options.marginy
                }];
                var results = undoableCommands.executeBatch(serverState.modelRef, "Layout View", ops);
                var layoutResult = results[0];
                var durationMs = Date.now() - startTime;

                if (typeof loggingQueue !== "undefined" && loggingQueue) {
                    loggingQueue.log("[" + request.requestId + "] Layout applied: " + 
                        layoutResult.nodesPositioned + " nodes (" + durationMs + "ms) [UNDOABLE]");
                }

                response.body = {
                    success: true,
                    viewId: viewId,
                    algorithm: algorithm,
                    options: options,
                    nodesPositioned: layoutResult.nodesPositioned,
                    durationMs: durationMs
                };

            } catch (e) {
                if (typeof loggingQueue !== "undefined" && loggingQueue) {
                    loggingQueue.error("[" + request.requestId + "] Layout failed: " + e);
                }
                response.statusCode = 500;
                response.body = {
                    error: {
                        code: "LayoutFailed",
                        message: String(e)
                    }
                };
            }
        },

        /**
         * Handle GET /views/:id/validate - Validate view connection integrity
         * 
         * Checks all connections in the view for:
         * - Orphaned connections (no underlying relationship reference)
         * - Direction mismatches (visual source/target don't match relationship)
         * 
         * @param {Object} request - HTTP request with params.id
         * @param {Object} response - HTTP response object
         * @param {Object} serverState - Server state with modelRef
         */
        handleValidateView: function(request, response, serverState) {
            var viewId = request.params && request.params.id;

            if (!viewId) {
                response.statusCode = 400;
                response.body = {
                    error: {
                        code: "ValidationError",
                        message: "Missing view ID parameter"
                    }
                };
                return;
            }

            if (typeof loggingQueue !== "undefined" && loggingQueue) {
                loggingQueue.log("[" + request.requestId + "] Validate view: " + viewId);
            }

            try {
                if (!serverState.modelRef) {
                    throw new Error("No model reference available");
                }

                var view = findViewById(serverState.modelRef, viewId);
                if (!view) {
                    response.statusCode = 404;
                    response.body = {
                        error: {
                            code: "NotFound",
                            message: "View not found: " + viewId
                        }
                    };
                    return;
                }

                var orphanedConnections = [];
                var directionMismatches = [];

                // Traverse all connections in the view
                function checkConnections(container) {
                    var children = container.getChildren();
                    for (var i = 0; i < children.size(); i++) {
                        var child = children.get(i);

                        // Check source connections
                        var sourceConns = child.getSourceConnections ? child.getSourceConnections() : null;
                        if (sourceConns) {
                            for (var c = 0; c < sourceConns.size(); c++) {
                                var conn = sourceConns.get(c);
                                var connId = conn.getId();
                                var connName = conn.getName() || "";

                                // Get visual source/target
                                var visualSource = conn.getSource();
                                var visualTarget = conn.getTarget();
                                var visualSourceId = visualSource ? visualSource.getId() : null;
                                var visualTargetId = visualTarget ? visualTarget.getId() : null;

                                // Check if it's an ArchiMate connection with relationship reference
                                if (conn instanceof IDiagramModelArchimateConnection) {
                                    var relationship = conn.getArchimateRelationship();
                                    
                                    if (!relationship) {
                                        // Orphaned connection - no underlying relationship
                                        orphanedConnections.push({
                                            connectionId: connId,
                                            connectionName: connName,
                                            sourceVisualId: visualSourceId,
                                            targetVisualId: visualTargetId,
                                            issue: "No underlying relationship (conceptId missing)",
                                            fix: "Delete connection and recreate with relationship_id, or delete and drag relationship from model tree"
                                        });
                                    } else {
                                        // Check direction match
                                        var relSource = relationship.getSource();
                                        var relTarget = relationship.getTarget();
                                        var relSourceId = relSource ? relSource.getId() : null;
                                        var relTargetId = relTarget ? relTarget.getId() : null;

                                        // Get underlying elements from visual objects
                                        var sourceElem = (visualSource && typeof visualSource.getArchimateElement === 'function') 
                                            ? visualSource.getArchimateElement() : null;
                                        var targetElem = (visualTarget && typeof visualTarget.getArchimateElement === 'function')
                                            ? visualTarget.getArchimateElement() : null;
                                        var sourceElemId = sourceElem ? sourceElem.getId() : null;
                                        var targetElemId = targetElem ? targetElem.getId() : null;

                                        if (sourceElemId && targetElemId && relSourceId && relTargetId) {
                                            if (sourceElemId !== relSourceId || targetElemId !== relTargetId) {
                                                var isSwapped = (sourceElemId === relTargetId && targetElemId === relSourceId);
                                                directionMismatches.push({
                                                    connectionId: connId,
                                                    connectionName: connName,
                                                    relationshipId: relationship.getId(),
                                                    visualSourceElement: sourceElem.getName() || sourceElemId,
                                                    visualTargetElement: targetElem.getName() || targetElemId,
                                                    relationshipSourceElement: relSource.getName() || relSourceId,
                                                    relationshipTargetElement: relTarget.getName() || relTargetId,
                                                    issue: isSwapped 
                                                        ? "Visual direction is reversed from relationship direction"
                                                        : "Visual elements do not match relationship endpoints",
                                                    fix: isSwapped
                                                        ? "Delete and recreate connection with swapped source/target visual IDs"
                                                        : "Delete connection - visual objects don't represent the relationship's elements"
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // Recurse into nested children
                        if (typeof child.getChildren === 'function') {
                            checkConnections(child);
                        }
                    }
                }

                checkConnections(view);

                var isValid = orphanedConnections.length === 0 && directionMismatches.length === 0;

                if (typeof loggingQueue !== "undefined" && loggingQueue) {
                    loggingQueue.log("[" + request.requestId + "] Validation result: " + 
                        (isValid ? "valid" : "invalid") + 
                        " (orphaned: " + orphanedConnections.length + 
                        ", mismatches: " + directionMismatches.length + ")");
                }

                response.body = {
                    valid: isValid,
                    viewId: viewId,
                    viewName: view.getName() || "",
                    checks: [
                        {
                            name: "orphaned_connections",
                            description: "Visual connections without underlying relationship references",
                            passed: orphanedConnections.length === 0,
                            violations: orphanedConnections
                        },
                        {
                            name: "direction_mismatches",
                            description: "Visual connections with source/target not matching relationship direction",
                            passed: directionMismatches.length === 0,
                            violations: directionMismatches
                        }
                    ]
                };

            } catch (e) {
                if (typeof loggingQueue !== "undefined" && loggingQueue) {
                    loggingQueue.error("[" + request.requestId + "] Validate view failed: " + e);
                }
                response.statusCode = 500;
                response.body = {
                    error: {
                        code: "ValidateViewFailed",
                        message: String(e)
                    }
                };
            }
        }
    };

    // Export globally for JArchi
    if (typeof globalThis !== "undefined") {
        globalThis.viewEndpoints = viewEndpoints;
    } else if (typeof global !== "undefined") {
        global.viewEndpoints = viewEndpoints;
    }

    // CommonJS for Node.js build tools
    if (typeof module !== "undefined" && module.exports) {
        module.exports = viewEndpoints;
    }

})();
