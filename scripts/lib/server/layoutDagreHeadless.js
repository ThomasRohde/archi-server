/**
 * layoutDagreHeadless.js - Headless Dagre layout for API server
 *
 * Provides Dagre graph layout algorithm that works without jArchi $() context.
 * Uses EMF model access only, suitable for server-side layout operations.
 *
 * @module server/layoutDagreHeadless
 * @requires vendor/dagre.min.js
 */

(function() {
    "use strict";

    // Guard against double-loading
    if (typeof globalThis !== "undefined" && typeof globalThis.layoutDagreHeadless !== "undefined") {
        return;
    }
    if (typeof global !== "undefined" && typeof global.layoutDagreHeadless !== "undefined") {
        return;
    }

    // Load dagre library
    var dagre;
    try {
        // Try loading from relative path (server context)
        dagre = require(__DIR__ + '../vendor/dagre.min.js');
    } catch (e) {
        try {
            // Fallback to alternative path
            dagre = require(__DIR__ + 'vendor/dagre.min.js');
        } catch (e2) {
            // dagre may already be loaded globally
            if (typeof globalThis !== "undefined" && globalThis.dagre) {
                dagre = globalThis.dagre;
            }
        }
    }

    // EMF types
    var IDiagramModelObject = Java.type("com.archimatetool.model.IDiagramModelObject");
    var IDiagramModelConnection = Java.type("com.archimatetool.model.IDiagramModelConnection");
    var IDiagramModelArchimateObject = Java.type("com.archimatetool.model.IDiagramModelArchimateObject");
    var IDiagramModelArchimateConnection = Java.type("com.archimatetool.model.IDiagramModelArchimateConnection");
    var IArchimateFactory = Java.type("com.archimatetool.model.IArchimateFactory");
    var factory = IArchimateFactory.eINSTANCE;

    /**
     * Collect nodes and edges from view using EMF traversal
     * @param {Object} view - EMF view object
     * @returns {Object} { nodes: [...], edges: [...] }
     */
    function collectGraphElements(view) {
        var nodes = [];
        var edges = [];
        var nodeMap = {};

        function processChildren(container, parentX, parentY) {
            var children = container.getChildren();
            for (var i = 0; i < children.size(); i++) {
                var child = children.get(i);
                
                // Get bounds
                var bounds = child.getBounds();
                if (!bounds) continue;

                var x = bounds.getX() + (parentX || 0);
                var y = bounds.getY() + (parentY || 0);
                var width = bounds.getWidth();
                var height = bounds.getHeight();

                // Collect connections from this element
                var sourceConns = child.getSourceConnections();
                if (sourceConns) {
                    for (var c = 0; c < sourceConns.size(); c++) {
                        var conn = sourceConns.get(c);
                        var target = conn.getTarget();
                        if (target) {
                            edges.push({
                                sourceId: child.getId(),
                                targetId: target.getId(),
                                connection: conn
                            });
                        }
                    }
                }

                // Skip connection objects as nodes
                if (child instanceof IDiagramModelConnection) continue;

                // Add as node
                var nodeData = {
                    id: child.getId(),
                    x: x,
                    y: y,
                    width: width > 0 ? width : 120,
                    height: height > 0 ? height : 55,
                    element: child
                };
                nodes.push(nodeData);
                nodeMap[child.getId()] = nodeData;

                // Recursively process nested children (groups)
                if (typeof child.getChildren === "function" && child.getChildren().size() > 0) {
                    processChildren(child, x, y);
                }
            }
        }

        processChildren(view, 0, 0);

        return { nodes: nodes, edges: edges, nodeMap: nodeMap };
    }

    /**
     * Compute layout positions without applying them (for undoable operations)
     * @param {Object} view - EMF view object
     * @param {Object} [options] - Layout options (same as layoutView)
     * @returns {Object} { nodes: [{element, oldBounds, newBounds}], connections: [{connection, oldBendpoints}] }
     */
    function computeLayout(view, options) {
        options = options || {};

        if (!dagre) {
            throw new Error("Dagre library not loaded");
        }

        var graphData = collectGraphElements(view);

        if (graphData.nodes.length === 0) {
            return { nodes: [], connections: [] };
        }

        // Create Dagre graph
        var g = new dagre.graphlib.Graph();
        g.setGraph({
            rankdir: options.rankdir || 'TB',
            nodesep: options.nodesep || 50,
            ranksep: options.ranksep || 50,
            edgesep: options.edgesep || 10,
            marginx: options.marginx || 20,
            marginy: options.marginy || 20
        });
        g.setDefaultEdgeLabel(function() { return {}; });

        // Add nodes
        graphData.nodes.forEach(function(node) {
            g.setNode(node.id, {
                width: node.width,
                height: node.height,
                label: node.id
            });
        });

        // Add edges (only between nodes that exist in graph)
        graphData.edges.forEach(function(edge) {
            if (graphData.nodeMap[edge.sourceId] && graphData.nodeMap[edge.targetId]) {
                g.setEdge(edge.sourceId, edge.targetId);
            }
        });

        // Run layout
        dagre.layout(g);

        // Collect position changes (without applying)
        var nodeChanges = [];
        g.nodes().forEach(function(nodeId) {
            var layoutNode = g.node(nodeId);
            var viewNode = graphData.nodeMap[nodeId];

            if (viewNode && viewNode.element && layoutNode) {
                var newX = Math.round(layoutNode.x - layoutNode.width / 2);
                var newY = Math.round(layoutNode.y - layoutNode.height / 2);

                // Capture old bounds
                var oldBounds = viewNode.element.getBounds();

                // Create new bounds object
                var newBounds = factory.createBounds();
                newBounds.setX(newX);
                newBounds.setY(newY);
                newBounds.setWidth(viewNode.width);
                newBounds.setHeight(viewNode.height);

                nodeChanges.push({
                    element: viewNode.element,
                    oldBounds: oldBounds,
                    newBounds: newBounds
                });
            }
        });

        // Collect bendpoint changes (without applying)
        var connectionChanges = [];
        graphData.edges.forEach(function(edge) {
            var conn = edge.connection;
            if (conn && typeof conn.getBendpoints === "function") {
                var bendpoints = conn.getBendpoints();
                if (bendpoints && bendpoints.size() > 0) {
                    // Capture old bendpoints as array
                    var oldBendpoints = [];
                    for (var bpi = 0; bpi < bendpoints.size(); bpi++) {
                        oldBendpoints.push(bendpoints.get(bpi));
                    }
                    connectionChanges.push({
                        connection: conn,
                        oldBendpoints: oldBendpoints
                    });
                }
            }
        });

        return {
            nodes: nodeChanges,
            connections: connectionChanges
        };
    }

    /**
     * Layout a view using Dagre algorithm (EMF-only, no $() context)
     * @param {Object} view - EMF view object
     * @param {Object} [options] - Layout options
     * @param {string} [options.rankdir='TB'] - Layout direction ('TB', 'BT', 'LR', 'RL')
     * @param {number} [options.nodesep=50] - Pixels between nodes
     * @param {number} [options.ranksep=50] - Pixels between ranks
     * @param {number} [options.edgesep=10] - Pixels between edges
     * @param {number} [options.marginx=20] - Left/right margin
     * @param {number} [options.marginy=20] - Top/bottom margin
     * @returns {Object} Layout result { nodesPositioned, edgesRouted }
     */
    function layoutView(view, options) {
        var layoutResult = computeLayout(view, options);

        // Apply positions to view elements
        var nodesPositioned = 0;
        layoutResult.nodes.forEach(function(nodeChange) {
            nodeChange.element.setBounds(nodeChange.newBounds);
            nodesPositioned++;
        });

        // Clear bendpoints from connections
        var edgesRouted = 0;
        layoutResult.connections.forEach(function(connChange) {
            connChange.connection.getBendpoints().clear();
            edgesRouted++;
        });

        return {
            nodesPositioned: nodesPositioned,
            edgesRouted: edgesRouted
        };
    }

    // Export module
    var layoutDagreHeadless = {
        layoutView: layoutView,
        computeLayout: computeLayout,
        collectGraphElements: collectGraphElements
    };

    // Make available globally
    if (typeof globalThis !== "undefined") {
        globalThis.layoutDagreHeadless = layoutDagreHeadless;
    } else if (typeof global !== "undefined") {
        global.layoutDagreHeadless = layoutDagreHeadless;
    }

    // CommonJS export for Node.js build tools
    if (typeof module !== "undefined" && module.exports) {
        module.exports = layoutDagreHeadless;
    }
})();
