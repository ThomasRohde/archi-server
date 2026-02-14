(function() {
    "use strict";

    /**
     * layoutSugiyamaHeadless.js
     *
     * Sugiyama-style layered layout engine for Archi diagram views.
     *
     * Pipeline overview:
     *  1) Extract top-level diagram graph
     *  2) Break cycles by reversing back-edges (heuristic)
     *  3) Assign layers with longest-path strategy
     *  4) Properize long edges with internal dummy nodes
     *  5) Reduce crossings with alternating barycenter sweeps
     *  6) Assign x coordinates using four directional variants + balancing
     *  7) Enforce no-overlap spacing constraints
     *  8) Place layers on y axis, apply orientation transform, write bounds
     *
     * Notes:
     * - Works in GraalVM/jArchi runtime (no Node.js dependencies).
     * - Mutations are performed by callers through undoable command wrappers.
     * - On unexpected runtime failures, computeLayout falls back to Dagre when available.
     */

    if (typeof globalThis !== "undefined" && typeof globalThis.layoutSugiyamaHeadless !== "undefined") {
        return;
    }
    if (typeof global !== "undefined" && typeof global.layoutSugiyamaHeadless !== "undefined") {
        return;
    }

    var IDiagramModelConnection = Java.type("com.archimatetool.model.IDiagramModelConnection");
    var IArchimateFactory = Java.type("com.archimatetool.model.IArchimateFactory");
    var factory = IArchimateFactory.eINSTANCE;

    /**
     * Parse integer option safely and clamp to non-negative domain.
     */
    function getOptionInt(options, key, fallback) {
        var value = options[key];
        if (value === undefined || value === null || value === "") return fallback;
        var parsed = Number(value);
        if (!isFinite(parsed)) return fallback;
        return Math.max(0, Math.round(parsed));
    }

    /**
     * Parse string option safely with trim and fallback.
     */
    function getOptionString(options, key, fallback) {
        var value = options[key];
        if (value === undefined || value === null) return fallback;
        var s = String(value).trim();
        return s.length > 0 ? s : fallback;
    }

    /**
     * Extract top-level diagram objects and visible connections into an in-memory graph.
     *
     * Scope policy (v1): only top-level nodes are considered layout participants.
     * Nested children are intentionally ignored to avoid mixing parent-relative coordinates.
     *
     * Returns:
     * - nodes: real visual nodes with width/height and original bounds snapshot
     * - nodeById: id lookup map for fast edge filtering
     * - edges: directed edges between included nodes (self-loops excluded)
     * - connections: unique connection visuals for bendpoint cleanup phase
     */
    function collectTopLevelGraph(view) {
        var children = view.getChildren();
        var nodes = [];
        var nodeById = {};
        var connections = [];
        var seenConnections = {};

        for (var i = 0; i < children.size(); i++) {
            var child = children.get(i);
            if (child instanceof IDiagramModelConnection) continue;

            var bounds = child.getBounds();
            if (!bounds) continue;

            var width = bounds.getWidth();
            var height = bounds.getHeight();

            var node = {
                id: child.getId(),
                element: child,
                width: width > 0 ? width : 120,
                height: height > 0 ? height : 55,
                oldBounds: bounds,
                isDummy: false
            };
            nodes.push(node);
            nodeById[node.id] = node;
        }

        var edges = [];
        for (var n = 0; n < nodes.length; n++) {
            var srcObj = nodes[n].element;
            var sourceConns = srcObj.getSourceConnections();
            if (!sourceConns) continue;

            for (var c = 0; c < sourceConns.size(); c++) {
                var conn = sourceConns.get(c);
                if (!conn) continue;

                var target = conn.getTarget();
                if (!target) continue;

                var sourceId = srcObj.getId();
                var targetId = target.getId();

                if (!nodeById[sourceId] || !nodeById[targetId]) continue;
                if (sourceId === targetId) continue;

                var connId = conn.getId ? conn.getId() : (sourceId + "->" + targetId + "#" + c);
                edges.push({
                    id: connId,
                    sourceId: sourceId,
                    targetId: targetId,
                    connection: conn,
                    reversed: false,
                    isDummy: false
                });

                if (!seenConnections[connId]) {
                    seenConnections[connId] = true;
                    connections.push(conn);
                }
            }
        }

        return {
            nodes: nodes,
            nodeById: nodeById,
            edges: edges,
            connections: connections
        };
    }

    /**
     * Build a vertex ordering for cycle breaking.
     *
     * Heuristic:
     * - repeatedly remove sinks and sources
     * - when none exist, remove node with max(outdegree - indegree)
     *
     * The resulting order is used to identify back-edges that must be reversed
     * to obtain a DAG for downstream Sugiyama phases.
     */
    function computeOrderForCycleBreaking(nodes, edges) {
        var remaining = {};
        var indegree = {};
        var outdegree = {};
        var incoming = {};
        var outgoing = {};

        for (var i = 0; i < nodes.length; i++) {
            var nodeId = nodes[i].id;
            remaining[nodeId] = true;
            indegree[nodeId] = 0;
            outdegree[nodeId] = 0;
            incoming[nodeId] = [];
            outgoing[nodeId] = [];
        }

        for (var e = 0; e < edges.length; e++) {
            var edge = edges[e];
            if (!remaining[edge.sourceId] || !remaining[edge.targetId]) continue;
            outdegree[edge.sourceId]++;
            indegree[edge.targetId]++;
            outgoing[edge.sourceId].push(edge.targetId);
            incoming[edge.targetId].push(edge.sourceId);
        }

        var left = [];
        var right = [];
        var remainingCount = nodes.length;

        function removeNode(nodeId) {
            if (!remaining[nodeId]) return;
            remaining[nodeId] = false;
            remainingCount--;

            var outs = outgoing[nodeId];
            for (var oi = 0; oi < outs.length; oi++) {
                var t = outs[oi];
                if (remaining[t]) indegree[t]--;
            }

            var ins = incoming[nodeId];
            for (var ii = 0; ii < ins.length; ii++) {
                var s = ins[ii];
                if (remaining[s]) outdegree[s]--;
            }
        }

        while (remainingCount > 0) {
            var changed = true;
            while (changed) {
                changed = false;

                for (var ni = 0; ni < nodes.length; ni++) {
                    var sinkId = nodes[ni].id;
                    if (remaining[sinkId] && outdegree[sinkId] === 0) {
                        right.push(sinkId);
                        removeNode(sinkId);
                        changed = true;
                    }
                }

                for (var nj = 0; nj < nodes.length; nj++) {
                    var sourceId = nodes[nj].id;
                    if (remaining[sourceId] && indegree[sourceId] === 0) {
                        left.push(sourceId);
                        removeNode(sourceId);
                        changed = true;
                    }
                }
            }

            if (remainingCount === 0) break;

            var bestId = null;
            var bestScore = -Infinity;
            for (var nk = 0; nk < nodes.length; nk++) {
                var candidate = nodes[nk].id;
                if (!remaining[candidate]) continue;
                var score = outdegree[candidate] - indegree[candidate];
                if (score > bestScore) {
                    bestScore = score;
                    bestId = candidate;
                }
            }

            if (bestId !== null) {
                left.push(bestId);
                removeNode(bestId);
            } else {
                break;
            }
        }

        var order = [];
        for (var li = 0; li < left.length; li++) order.push(left[li]);
        for (var ri = right.length - 1; ri >= 0; ri--) order.push(right[ri]);

        var orderIndex = {};
        for (var oi = 0; oi < order.length; oi++) orderIndex[order[oi]] = oi;
        return orderIndex;
    }

    /**
     * Reverse edges that go against the chosen acyclic ordering.
     *
     * This mutates edge endpoints in-place and marks the edge as reversed.
     * Returns the number of reversals for diagnostics/logging.
     */
    function reverseBackEdges(edges, orderIndex) {
        var reversedCount = 0;
        for (var i = 0; i < edges.length; i++) {
            var edge = edges[i];
            var s = orderIndex[edge.sourceId];
            var t = orderIndex[edge.targetId];
            if (s === undefined || t === undefined) continue;
            if (s > t) {
                var tmp = edge.sourceId;
                edge.sourceId = edge.targetId;
                edge.targetId = tmp;
                edge.reversed = !edge.reversed;
                reversedCount++;
            }
        }
        return reversedCount;
    }

    /**
     * Assign layers with longest-path propagation over a DAG.
     *
     * Sources start at layer 0; each edge enforces target >= source + 1.
     */
    function assignLayersLongestPath(nodes, edges) {
        var indegree = {};
        var layer = {};
        var outgoing = {};
        var queue = [];

        for (var i = 0; i < nodes.length; i++) {
            var nodeId = nodes[i].id;
            indegree[nodeId] = 0;
            layer[nodeId] = 0;
            outgoing[nodeId] = [];
        }

        for (var e = 0; e < edges.length; e++) {
            var edge = edges[e];
            outgoing[edge.sourceId].push(edge.targetId);
            indegree[edge.targetId]++;
        }

        for (var n = 0; n < nodes.length; n++) {
            var id = nodes[n].id;
            if (indegree[id] === 0) queue.push(id);
        }

        var qi = 0;
        while (qi < queue.length) {
            var current = queue[qi++];
            var outs = outgoing[current];
            for (var oi = 0; oi < outs.length; oi++) {
                var targetId = outs[oi];
                var candidate = layer[current] + 1;
                if (candidate > layer[targetId]) layer[targetId] = candidate;
                indegree[targetId]--;
                if (indegree[targetId] === 0) queue.push(targetId);
            }
        }

        return layer;
    }

    /**
     * Properize the graph by inserting dummy nodes on edges spanning >1 layer.
     *
     * Brandes–Köpf coordinate assignment assumes proper layering where all
     * edges connect adjacent layers. Dummy nodes are internal only.
     */
    function properizeGraph(nodes, edges, nodeById, layerMap) {
        var expandedNodes = nodes.slice();
        var expandedEdges = [];
        var dummyCounter = 0;

        for (var i = 0; i < edges.length; i++) {
            var edge = edges[i];
            var srcLayer = layerMap[edge.sourceId] || 0;
            var tgtLayer = layerMap[edge.targetId] || 0;
            var span = tgtLayer - srcLayer;

            if (span <= 1) {
                expandedEdges.push(edge);
                continue;
            }

            var prevId = edge.sourceId;
            for (var l = srcLayer + 1; l < tgtLayer; l++) {
                var dummyId = "__dummy_" + (++dummyCounter);
                var dummyNode = {
                    id: dummyId,
                    element: null,
                    width: 1,
                    height: 1,
                    oldBounds: null,
                    isDummy: true,
                    layer: l
                };
                expandedNodes.push(dummyNode);
                nodeById[dummyId] = dummyNode;
                layerMap[dummyId] = l;

                expandedEdges.push({
                    id: edge.id + "::" + dummyId,
                    sourceId: prevId,
                    targetId: dummyId,
                    connection: edge.connection,
                    reversed: edge.reversed,
                    isDummy: true
                });
                prevId = dummyId;
            }

            expandedEdges.push({
                id: edge.id + "::tail",
                sourceId: prevId,
                targetId: edge.targetId,
                connection: edge.connection,
                reversed: edge.reversed,
                isDummy: true
            });
        }

        return {
            nodes: expandedNodes,
            edges: expandedEdges
        };
    }

    /**
     * Convert node->layer map into contiguous layer arrays.
     */
    function buildLayerArrays(nodes, layerMap) {
        var maxLayer = 0;
        for (var i = 0; i < nodes.length; i++) {
            var layer = layerMap[nodes[i].id] || 0;
            if (layer > maxLayer) maxLayer = layer;
        }

        var layers = [];
        for (var l = 0; l <= maxLayer; l++) layers.push([]);

        for (var n = 0; n < nodes.length; n++) {
            var node = nodes[n];
            layers[layerMap[node.id] || 0].push(node.id);
        }

        return layers;
    }

    /**
     * Build incoming/outgoing adjacency maps used by sweep and coordinate phases.
     */
    function buildNeighbors(edges) {
        var incoming = {};
        var outgoing = {};
        for (var i = 0; i < edges.length; i++) {
            var edge = edges[i];
            if (!incoming[edge.targetId]) incoming[edge.targetId] = [];
            if (!outgoing[edge.sourceId]) outgoing[edge.sourceId] = [];
            incoming[edge.targetId].push(edge.sourceId);
            outgoing[edge.sourceId].push(edge.targetId);
        }
        return { incoming: incoming, outgoing: outgoing };
    }

    /**
     * Build O(1) index lookup map for an ordered array.
     */
    function indexMap(array) {
        var map = {};
        for (var i = 0; i < array.length; i++) map[array[i]] = i;
        return map;
    }

    /**
     * Stable barycenter sort for one layer against its adjacent fixed layer.
     *
     * Tie-break keeps previous order for deterministic output.
     */
    function stableSortByBarycenter(layerNodes, neighbors, adjacentOrder) {
        var adjIndex = indexMap(adjacentOrder);
        var decorated = [];

        for (var i = 0; i < layerNodes.length; i++) {
            var nodeId = layerNodes[i];
            var neigh = neighbors[nodeId] || [];
            var bary;

            if (neigh.length === 0) {
                bary = i;
            } else {
                var sum = 0;
                var count = 0;
                for (var n = 0; n < neigh.length; n++) {
                    var idx = adjIndex[neigh[n]];
                    if (idx !== undefined) {
                        sum += idx;
                        count++;
                    }
                }
                bary = count > 0 ? (sum / count) : i;
            }

            decorated.push({ nodeId: nodeId, bary: bary, oldIndex: i });
        }

        decorated.sort(function(a, b) {
            if (a.bary < b.bary) return -1;
            if (a.bary > b.bary) return 1;
            return a.oldIndex - b.oldIndex;
        });

        for (var d = 0; d < decorated.length; d++) {
            layerNodes[d] = decorated[d].nodeId;
        }
    }

    /**
     * Alternating down/up barycenter sweeps to reduce crossings.
     */
    function crossingMinimize(layers, neighbors, iterations) {
        var sweeps = iterations > 0 ? iterations : 4;
        for (var iter = 0; iter < sweeps; iter++) {
            for (var down = 1; down < layers.length; down++) {
                stableSortByBarycenter(layers[down], neighbors.incoming, layers[down - 1]);
            }
            for (var up = layers.length - 2; up >= 0; up--) {
                stableSortByBarycenter(layers[up], neighbors.outgoing, layers[up + 1]);
            }
        }
    }

    /**
     * Median helper for center alignment decisions.
     */
    function median(values) {
        if (!values || values.length === 0) return null;
        var sorted = values.slice().sort(function(a, b) { return a - b; });
        var mid = Math.floor(sorted.length / 2);
        if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
        return sorted[mid];
    }

    /**
     * Minimum center distance to prevent horizontal overlap between two nodes.
     */
    function separation(leftNode, rightNode, nodeSpacing) {
        return (leftNode.width / 2) + (rightNode.width / 2) + nodeSpacing;
    }

    /**
     * Enforce pairwise spacing constraints within a layer.
     *
     * Depending on direction, this performs a forward or reverse pass while
     * preserving node order.
     */
    function enforceLayerSpacing(layerNodes, xMap, nodeById, nodeSpacing, leftToRight) {
        if (layerNodes.length < 2) return;

        if (leftToRight) {
            for (var i = 1; i < layerNodes.length; i++) {
                var prevId = layerNodes[i - 1];
                var currId = layerNodes[i];
                var minX = xMap[prevId] + separation(nodeById[prevId], nodeById[currId], nodeSpacing);
                if (xMap[currId] < minX) xMap[currId] = minX;
            }
        } else {
            for (var j = layerNodes.length - 2; j >= 0; j--) {
                var leftId = layerNodes[j];
                var rightId = layerNodes[j + 1];
                var maxX = xMap[rightId] - separation(nodeById[leftId], nodeById[rightId], nodeSpacing);
                if (xMap[leftId] > maxX) xMap[leftId] = maxX;
            }
        }
    }

    // =========================================================================
    // Brandes-Koepf Horizontal Coordinate Assignment
    // =========================================================================
    //
    // Implements "Fast and Simple Horizontal Coordinate Assignment" (Brandes
    // & Koepf, 2002) using dagre-style block graph compaction (avoids known
    // bugs in the original paper's place_block/sink/shift mechanism).
    //
    // Per-variant pipeline:
    //   1. Mark type-1 conflicts (inner segment crossings)
    //   2. Vertical alignment  (build blocks via root[]/align[])
    //   3. Horizontal compaction (block graph + recursive placement)
    //
    // Four variants (up/down x left/right) are balanced via inner-median.
    // =========================================================================

    /**
     * True when both endpoints of an edge are dummy nodes (inner segment).
     */
    function isInnerSegment(nodeById, u, v) {
        var uNode = nodeById[u];
        var vNode = nodeById[v];
        return uNode && vNode && uNode.isDummy && vNode.isDummy;
    }

    /**
     * Mark type-1 conflicts: non-inner segments that cross inner segments.
     *
     * A type-1 conflict is resolved in favour of the inner segment so that
     * long-edge paths through dummy nodes are kept straight.
     *
     * Returns nested map: conflicts[min(u,v)][max(u,v)] = true
     */
    function markType1Conflicts(layers, neighbors, nodeById) {
        var conflicts = {};

        for (var li = 1; li < layers.length; li++) {
            var prevLayer = layers[li - 1];
            var currLayer = layers[li];
            var prevPos = indexMap(prevLayer);
            var k0 = 0;
            var scanPos = 0;

            for (var l = 0; l < currLayer.length; l++) {
                var v = currLayer[l];
                // Find inner-segment upper endpoint (if any)
                var innerUpper = null;
                var preds = neighbors.incoming[v] || [];
                for (var pi = 0; pi < preds.length; pi++) {
                    if (isInnerSegment(nodeById, preds[pi], v)) {
                        innerUpper = preds[pi];
                        break;
                    }
                }

                var k1;
                if (innerUpper !== null) {
                    k1 = prevPos[innerUpper] !== undefined ? prevPos[innerUpper] : 0;
                } else if (l === currLayer.length - 1) {
                    k1 = prevLayer.length - 1;
                } else {
                    continue;
                }

                while (scanPos <= l) {
                    var w = currLayer[scanPos];
                    var wPreds = neighbors.incoming[w] || [];
                    for (var wp = 0; wp < wPreds.length; wp++) {
                        var u = wPreds[wp];
                        var uPos = prevPos[u];
                        if (uPos === undefined) continue;
                        if (uPos < k0 || uPos > k1) {
                            if (!isInnerSegment(nodeById, u, w)) {
                                var a = u < w ? u : w;
                                var b = u < w ? w : u;
                                if (!conflicts[a]) conflicts[a] = {};
                                conflicts[a][b] = true;
                            }
                        }
                    }
                    scanPos++;
                }
                k0 = k1;
            }
        }
        return conflicts;
    }

    /**
     * Check if edge (u, v) was marked as a type-1 conflict.
     */
    function hasConflict(conflicts, u, v) {
        var a = u < v ? u : v;
        var b = u < v ? v : u;
        return conflicts[a] && conflicts[a][b] === true;
    }

    /**
     * Vertical alignment: build blocks of vertically aligned nodes.
     *
     * Each node picks at most ONE median neighbor to align with, forming
     * chains (blocks) that share the same x-coordinate.
     *
     * @param downward  true: sweep top-to-bottom using predecessors
     * @param leftToRight  true: scan left-to-right, prefer left median
     *
     * Returns { root, align } where root[v] = block root, align[v] = next
     * node in circular block chain.
     */
    function verticalAlignment(layers, nodeById, neighbors, conflicts, downward, leftToRight) {
        var root = {};
        var align = {};

        // Every node starts as its own singleton block
        for (var li = 0; li < layers.length; li++) {
            for (var ni = 0; ni < layers[li].length; ni++) {
                var id = layers[li][ni];
                root[id] = id;
                align[id] = id;
            }
        }

        // Choose layer iteration direction
        var startLayer, endLayer, layerStep;
        if (downward) {
            startLayer = 1;
            endLayer = layers.length;
            layerStep = 1;
        } else {
            startLayer = layers.length - 2;
            endLayer = -1;
            layerStep = -1;
        }

        for (var i = startLayer; i !== endLayer; i += layerStep) {
            var layer = layers[i];
            var adjLayerIdx = downward ? i - 1 : i + 1;
            var adjLayer = layers[adjLayerIdx];
            var adjPos = indexMap(adjLayer);
            var getNeighborList = downward ? neighbors.incoming : neighbors.outgoing;

            // Track rightmost (or leftmost) aligned position to prevent crossing
            var r = leftToRight ? -1 : adjLayer.length;

            // Choose node scan direction
            var nodeStart, nodeEnd, nodeStep;
            if (leftToRight) {
                nodeStart = 0;
                nodeEnd = layer.length;
                nodeStep = 1;
            } else {
                nodeStart = layer.length - 1;
                nodeEnd = -1;
                nodeStep = -1;
            }

            for (var k = nodeStart; k !== nodeEnd; k += nodeStep) {
                var v = layer[k];
                var neighList = getNeighborList[v] || [];
                if (neighList.length === 0) continue;

                // Filter to neighbors actually in the adjacent layer and sort
                var validNeighbors = [];
                for (var vn = 0; vn < neighList.length; vn++) {
                    if (adjPos[neighList[vn]] !== undefined) {
                        validNeighbors.push(neighList[vn]);
                    }
                }
                if (validNeighbors.length === 0) continue;

                validNeighbors.sort(function(a, b) {
                    return adjPos[a] - adjPos[b];
                });

                var d = validNeighbors.length;
                var medLow = Math.floor((d - 1) / 2);
                var medHigh = Math.ceil((d - 1) / 2);

                // Try median(s) in order based on direction preference
                var medStart, medEnd, medStep;
                if (leftToRight) {
                    medStart = medLow;
                    medEnd = medHigh + 1;
                    medStep = 1;
                } else {
                    medStart = medHigh;
                    medEnd = medLow - 1;
                    medStep = -1;
                }

                for (var m = medStart; m !== medEnd; m += medStep) {
                    if (align[v] === v) { // v not yet aligned
                        var u = validNeighbors[m];
                        var uPos = adjPos[u];

                        if (!hasConflict(conflicts, u, v)) {
                            var canAlign;
                            if (leftToRight) {
                                canAlign = (r < uPos);
                            } else {
                                canAlign = (r > uPos);
                            }

                            if (canAlign) {
                                align[u] = v;
                                root[v] = root[u];
                                align[v] = root[v];
                                r = uPos;
                            }
                        }
                    }
                }
            }
        }

        return { root: root, align: align };
    }

    /**
     * Horizontal compaction: assign x-coordinates via a block adjacency graph.
     *
     * All nodes in the same block (sharing the same root) receive identical
     * x-coordinates.  The block graph encodes minimum separation constraints
     * between adjacent blocks within each layer.
     *
     * Uses dagre-style recursive placeBlock (DFS topological ordering) rather
     * than the original paper's sink/shift mechanism.
     */
    function horizontalCompaction(layers, root, align, nodeById, nodeSpacing, leftToRight) {
        // Build block graph: for consecutive nodes u,v in same layer with
        // different roots, add edge from one root to the other.
        var blockPreds = {};   // blockPreds[toRoot][fromRoot] = maxWeight
        var allRoots = {};

        for (var li = 0; li < layers.length; li++) {
            var layer = layers[li];
            for (var ni = 0; ni < layer.length; ni++) {
                allRoots[root[layer[ni]]] = true;
            }
            for (var nj = 1; nj < layer.length; nj++) {
                var uId = layer[nj - 1];
                var vId = layer[nj];
                var uRoot = root[uId];
                var vRoot = root[vId];
                if (uRoot === vRoot) continue;

                var fromRoot, toRoot;
                if (leftToRight) {
                    fromRoot = uRoot;
                    toRoot = vRoot;
                } else {
                    fromRoot = vRoot;
                    toRoot = uRoot;
                }

                var sep = separation(nodeById[uId], nodeById[vId], nodeSpacing);
                if (!blockPreds[toRoot]) blockPreds[toRoot] = {};
                if (!blockPreds[toRoot][fromRoot] || blockPreds[toRoot][fromRoot] < sep) {
                    blockPreds[toRoot][fromRoot] = sep;
                }
            }
        }

        // Recursive DFS placement (dagre-style)
        var xs = {};
        var visited = {};

        function placeBlock(v) {
            if (visited[v]) return;
            visited[v] = true;
            xs[v] = 0;

            var preds = blockPreds[v];
            if (preds) {
                for (var p in preds) {
                    if (preds.hasOwnProperty(p)) {
                        placeBlock(p);
                        var candidate = xs[p] + preds[p];
                        if (candidate > xs[v]) xs[v] = candidate;
                    }
                }
            }
        }

        for (var rootId in allRoots) {
            if (allRoots.hasOwnProperty(rootId)) {
                placeBlock(rootId);
            }
        }

        // Assign all vertices: x[v] = x[root[v]]
        var result = {};
        for (var lk = 0; lk < layers.length; lk++) {
            for (var nk = 0; nk < layers[lk].length; nk++) {
                var nodeId = layers[lk][nk];
                result[nodeId] = xs[root[nodeId]] || 0;
            }
        }

        return result;
    }

    /**
     * Compute one B-K directional variant (alignment + compaction + normalize).
     */
    function computeVariant(layers, neighbors, nodeById, nodeSpacing, conflicts, downward, leftToRight) {
        var alignment = verticalAlignment(layers, nodeById, neighbors, conflicts, downward, leftToRight);
        var xs = horizontalCompaction(layers, alignment.root, alignment.align, nodeById, nodeSpacing, leftToRight);

        // For right-to-left variants, negate x to mirror back
        if (!leftToRight) {
            for (var key in xs) {
                if (xs.hasOwnProperty(key)) xs[key] = -xs[key];
            }
        }

        // Normalize: shift so minimum x = 0
        var minX = Infinity;
        for (var k1 in xs) {
            if (xs.hasOwnProperty(k1) && xs[k1] < minX) minX = xs[k1];
        }
        if (isFinite(minX) && minX !== 0) {
            for (var k2 in xs) {
                if (xs.hasOwnProperty(k2)) xs[k2] -= minX;
            }
        }

        return xs;
    }

    /**
     * Align coordinate ranges of 4 variants before balancing.
     *
     * Shifts each variant so ranges are comparable, preventing one
     * directional bias from dominating the inner-median.
     */
    function alignVariantCoordinates(variants, layers) {
        // Find the variant with smallest width
        var smallestWidth = Infinity;
        var smallestIdx = 0;
        for (var vi = 0; vi < variants.length; vi++) {
            var vMin = Infinity;
            var vMax = -Infinity;
            for (var li = 0; li < layers.length; li++) {
                for (var ni = 0; ni < layers[li].length; ni++) {
                    var x = variants[vi][layers[li][ni]];
                    if (x < vMin) vMin = x;
                    if (x > vMax) vMax = x;
                }
            }
            var w = vMax - vMin;
            if (w < smallestWidth) {
                smallestWidth = w;
                smallestIdx = vi;
            }
        }

        // Compute target range from smallest-width variant
        var targetMin = Infinity;
        var targetMax = -Infinity;
        for (var tli = 0; tli < layers.length; tli++) {
            for (var tni = 0; tni < layers[tli].length; tni++) {
                var tx = variants[smallestIdx][layers[tli][tni]];
                if (tx < targetMin) targetMin = tx;
                if (tx > targetMax) targetMax = tx;
            }
        }

        // Align each variant: left-biased align by min, right-biased by max
        for (var ai = 0; ai < variants.length; ai++) {
            if (ai === smallestIdx) continue;
            var isRight = (ai === 1 || ai === 3);
            var aMin = Infinity;
            var aMax = -Infinity;
            for (var ali = 0; ali < layers.length; ali++) {
                for (var ani = 0; ani < layers[ali].length; ani++) {
                    var ax = variants[ai][layers[ali][ani]];
                    if (ax < aMin) aMin = ax;
                    if (ax > aMax) aMax = ax;
                }
            }

            var delta = isRight ? (targetMax - aMax) : (targetMin - aMin);
            if (delta !== 0) {
                for (var sli = 0; sli < layers.length; sli++) {
                    for (var sni = 0; sni < layers[sli].length; sni++) {
                        variants[ai][layers[sli][sni]] += delta;
                    }
                }
            }
        }
    }

    /**
     * Compute four Brandes-Koepf directional variants and balance.
     *
     * Variants: down-left, down-right, up-left, up-right.
     * Balance: for each node, sort the 4 x-values and average the middle two.
     */
    function balancedX(layers, neighbors, nodeById, nodeSpacing) {
        var conflicts = markType1Conflicts(layers, neighbors, nodeById);

        var variants = [
            computeVariant(layers, neighbors, nodeById, nodeSpacing, conflicts, true, true),   // down-left
            computeVariant(layers, neighbors, nodeById, nodeSpacing, conflicts, true, false),  // down-right
            computeVariant(layers, neighbors, nodeById, nodeSpacing, conflicts, false, true),  // up-left
            computeVariant(layers, neighbors, nodeById, nodeSpacing, conflicts, false, false)  // up-right
        ];

        alignVariantCoordinates(variants, layers);

        var result = {};
        for (var li = 0; li < layers.length; li++) {
            var layer = layers[li];
            for (var ni = 0; ni < layer.length; ni++) {
                var nodeId = layer[ni];
                var values = [
                    variants[0][nodeId],
                    variants[1][nodeId],
                    variants[2][nodeId],
                    variants[3][nodeId]
                ];
                values.sort(function(a, b) { return a - b; });
                result[nodeId] = (values[1] + values[2]) / 2;
            }
        }
        return result;
    }

    /**
     * Final conservative overlap pass after balancing.
     */
    function finalOverlapPass(layers, xMap, nodeById, nodeSpacing) {
        for (var li = 0; li < layers.length; li++) {
            var layer = layers[li];
            enforceLayerSpacing(layer, xMap, nodeById, nodeSpacing, true);
        }
    }

    /**
     * Assign y coordinates by layer max-height stacking.
     *
     * Returns { layerY, layerMaxH } so callers can center-align nodes
     * vertically within their layer band.
     */
    function computeLayerY(layers, nodeById, layerSpacing) {
        var layerY = [];
        var layerMaxH = [];
        var y = 0;
        for (var li = 0; li < layers.length; li++) {
            layerY[li] = y;
            var maxHeight = 1;
            for (var ni = 0; ni < layers[li].length; ni++) {
                var node = nodeById[layers[li][ni]];
                if (node && node.height > maxHeight) maxHeight = node.height;
            }
            layerMaxH[li] = maxHeight;
            y += maxHeight + layerSpacing;
        }
        return { layerY: layerY, layerMaxH: layerMaxH };
    }

    /**
     * Transform canonical TB coordinates into requested rank direction.
     *
     * Canonical layout uses x=horizontal, y=vertical-down. LR/RL swap axes;
     * BT/RL mirror across max extent. Margins are applied at the end.
     */
    function transformByRankdir(centerX, centerY, width, height, rankdir, maxX, maxY, marginx, marginy) {
        var tx = centerX;
        var ty = centerY;

        if (rankdir === "BT") {
            ty = maxY - centerY;
        } else if (rankdir === "LR") {
            tx = centerY;
            ty = centerX;
        } else if (rankdir === "RL") {
            tx = maxY - centerY;
            ty = centerX;
        }

        return {
            x: Math.round(tx - (width / 2) + marginx),
            y: Math.round(ty - (height / 2) + marginy)
        };
    }

    /**
     * Find connected components via union-find (undirected).
     *
     * Returns an array of arrays, each containing the node ids of one component.
     */
    function findConnectedComponents(nodes, edges) {
        var parent = {};

        function find(x) {
            if (parent[x] !== x) parent[x] = find(parent[x]);
            return parent[x];
        }

        function union(a, b) {
            var ra = find(a);
            var rb = find(b);
            if (ra !== rb) parent[ra] = rb;
        }

        for (var i = 0; i < nodes.length; i++) {
            parent[nodes[i].id] = nodes[i].id;
        }

        for (var e = 0; e < edges.length; e++) {
            union(edges[e].sourceId, edges[e].targetId);
        }

        var buckets = {};
        for (var n = 0; n < nodes.length; n++) {
            var r = find(nodes[n].id);
            if (!buckets[r]) buckets[r] = [];
            buckets[r].push(nodes[n].id);
        }

        var result = [];
        for (var key in buckets) {
            if (buckets.hasOwnProperty(key)) result.push(buckets[key]);
        }
        return result;
    }

    /**
     * Run the Sugiyama pipeline on a single connected component.
     *
     * Returns { centers, width, height, reversedEdges, layerCount } where
     * centers maps node id -> { x, y } in canonical TB orientation before
     * rankdir transform.
     */
    function layoutComponent(compNodeIds, allEdges, nodeById, nodeSpacing, layerSpacing, crossingIterations) {
        // Extract component nodes and edges
        var compSet = {};
        var compNodes = [];
        for (var i = 0; i < compNodeIds.length; i++) {
            compSet[compNodeIds[i]] = true;
            compNodes.push(nodeById[compNodeIds[i]]);
        }
        var compEdges = [];
        for (var e = 0; e < allEdges.length; e++) {
            if (compSet[allEdges[e].sourceId] && compSet[allEdges[e].targetId]) {
                compEdges.push(allEdges[e]);
            }
        }

        // Single-node component: place at origin
        if (compNodes.length === 1) {
            var n = compNodes[0];
            var centers = {};
            centers[n.id] = { x: n.width / 2, y: n.height / 2 };
            return { centers: centers, width: n.width, height: n.height, reversedEdges: 0, layerCount: 1 };
        }

        // 1) Cycle handling
        var orderIndex = computeOrderForCycleBreaking(compNodes, compEdges);
        var reversedEdges = reverseBackEdges(compEdges, orderIndex);

        // 2) Layer assignment
        var layerMap = assignLayersLongestPath(compNodes, compEdges);

        // 3) Properization + crossing minimization
        var proper = properizeGraph(compNodes, compEdges, nodeById, layerMap);
        var layers = buildLayerArrays(proper.nodes, layerMap);
        var neighbors = buildNeighbors(proper.edges);
        crossingMinimize(layers, neighbors, crossingIterations);

        // 4) B-K coordinate assignment + overlap enforcement
        var xMap = balancedX(layers, neighbors, nodeById, nodeSpacing);
        finalOverlapPass(layers, xMap, nodeById, nodeSpacing);
        var lyResult = computeLayerY(layers, nodeById, layerSpacing);

        // 5) Compute centers for real nodes (center-aligned vertically)
        var centers = {};
        var compWidth = 0;
        var compHeight = 0;

        for (var li = 0; li < layers.length; li++) {
            var layer = layers[li];
            for (var ni = 0; ni < layer.length; ni++) {
                var nodeId = layer[ni];
                var node = nodeById[nodeId];
                if (!node || node.isDummy) continue;

                var centerX = xMap[nodeId];
                var centerY = lyResult.layerY[li] + (lyResult.layerMaxH[li] / 2);
                centers[nodeId] = { x: centerX, y: centerY };

                var rightEdge = centerX + node.width / 2;
                var bottomEdge = centerY + node.height / 2;
                if (rightEdge > compWidth) compWidth = rightEdge;
                if (bottomEdge > compHeight) compHeight = bottomEdge;
            }
        }

        return {
            centers: centers,
            width: compWidth,
            height: compHeight,
            reversedEdges: reversedEdges,
            layerCount: layers.length
        };
    }

    /**
     * Compute all node position and bendpoint-change deltas for one view.
     *
     * Returns a pure change set:
     * - nodes: {element, oldBounds, newBounds}
     * - connections: {connection, oldBendpoints}
     * - diagnostics: reversal count and layer count
     *
     * No mutation is applied here; caller decides how to apply changes.
     */
    function computeLayout(view, options) {
        options = options || {};

        var rankdir = getOptionString(options, "rankdir", "TB").toUpperCase();
        var nodeSpacing = getOptionInt(options, "nodesep", 50);
        var layerSpacing = getOptionInt(options, "ranksep", 50);
        var marginx = getOptionInt(options, "marginx", 20);
        var marginy = getOptionInt(options, "marginy", 20);
        var crossingIterations = getOptionInt(options, "iterations", 4);
        var componentPadding = nodeSpacing;  // gap between packed components

        try {
            var graph = collectTopLevelGraph(view);
            if (graph.nodes.length === 0) {
                return { nodes: [], connections: [], diagnostics: { reversedEdges: 0, layers: 0, components: 0 } };
            }

            if (graph.nodes.length === 1) {
                var onlyNode = graph.nodes[0];
                var singleBounds = factory.createBounds();
                singleBounds.setX(marginx);
                singleBounds.setY(marginy);
                singleBounds.setWidth(onlyNode.width);
                singleBounds.setHeight(onlyNode.height);
                return {
                    nodes: [{ element: onlyNode.element, oldBounds: onlyNode.oldBounds, newBounds: singleBounds }],
                    connections: [],
                    diagnostics: { reversedEdges: 0, layers: 1, components: 1 }
                };
            }

            // Find connected components and layout each independently
            var components = findConnectedComponents(graph.nodes, graph.edges);

            // Sort components by size descending for better packing
            components.sort(function(a, b) { return b.length - a.length; });

            // Layout each component
            var compResults = [];
            var totalReversedEdges = 0;
            var maxLayerCount = 0;

            for (var ci = 0; ci < components.length; ci++) {
                var result = layoutComponent(
                    components[ci], graph.edges, graph.nodeById,
                    nodeSpacing, layerSpacing, crossingIterations
                );
                compResults.push(result);
                totalReversedEdges += result.reversedEdges;
                if (result.layerCount > maxLayerCount) maxLayerCount = result.layerCount;
            }

            // Pack components left-to-right with padding
            var allCenters = {};
            var packCursor = 0;

            for (var pi = 0; pi < compResults.length; pi++) {
                var comp = compResults[pi];
                var offsetX = packCursor;
                for (var cid in comp.centers) {
                    if (comp.centers.hasOwnProperty(cid)) {
                        allCenters[cid] = {
                            x: comp.centers[cid].x + offsetX,
                            y: comp.centers[cid].y
                        };
                    }
                }
                packCursor += comp.width + componentPadding;
            }

            // Compute global extents for rankdir transform
            var maxX = 0;
            var maxY = 0;
            for (var eid in allCenters) {
                if (allCenters.hasOwnProperty(eid)) {
                    if (allCenters[eid].x > maxX) maxX = allCenters[eid].x;
                    if (allCenters[eid].y > maxY) maxY = allCenters[eid].y;
                }
            }

            // Build node changes with rankdir transform
            var nodeChanges = [];
            for (var rn = 0; rn < graph.nodes.length; rn++) {
                var realNode = graph.nodes[rn];
                var center = allCenters[realNode.id];
                if (!center) continue;

                var transformed = transformByRankdir(
                    center.x,
                    center.y,
                    realNode.width,
                    realNode.height,
                    rankdir,
                    maxX,
                    maxY,
                    marginx,
                    marginy
                );

                var newBounds = factory.createBounds();
                newBounds.setX(transformed.x);
                newBounds.setY(transformed.y);
                newBounds.setWidth(realNode.width);
                newBounds.setHeight(realNode.height);

                nodeChanges.push({
                    element: realNode.element,
                    oldBounds: realNode.oldBounds,
                    newBounds: newBounds
                });
            }

            // Collect connection changes (bendpoints to clear)
            var connectionChanges = [];
            for (var ki = 0; ki < graph.connections.length; ki++) {
                var conn = graph.connections[ki];
                if (!conn || typeof conn.getBendpoints !== "function") continue;
                var bendpoints = conn.getBendpoints();
                if (!bendpoints || bendpoints.size() === 0) continue;

                var oldBendpoints = [];
                for (var bi = 0; bi < bendpoints.size(); bi++) {
                    oldBendpoints.push(bendpoints.get(bi));
                }

                connectionChanges.push({
                    connection: conn,
                    oldBendpoints: oldBendpoints
                });
            }

            // Quality metrics
            var downwardEdges = 0;
            var totalEdges = 0;
            for (var qi = 0; qi < graph.edges.length; qi++) {
                var edge = graph.edges[qi];
                var srcCenter = allCenters[edge.sourceId];
                var tgtCenter = allCenters[edge.targetId];
                if (!srcCenter || !tgtCenter) continue;
                totalEdges++;
                // After cycle-breaking restore, "downward" means target below source
                if (edge.reversed) {
                    if (srcCenter.y >= tgtCenter.y) downwardEdges++;
                } else {
                    if (tgtCenter.y >= srcCenter.y) downwardEdges++;
                }
            }

            return {
                nodes: nodeChanges,
                connections: connectionChanges,
                diagnostics: {
                    reversedEdges: totalReversedEdges,
                    layers: maxLayerCount,
                    components: components.length,
                    downwardEdgePct: totalEdges > 0 ? Math.round((downwardEdges / totalEdges) * 100) : 100
                }
            };
        } catch (e) {
            // Defensive runtime fallback: keep endpoint functional even if the
            // custom algorithm hits an unexpected edge-case in model data.
            if (typeof layoutDagreHeadless !== "undefined" && layoutDagreHeadless) {
                return layoutDagreHeadless.computeLayout(view, options);
            }
            throw e;
        }
    }

    /**
     * Apply computed deltas directly (non-undoable convenience entrypoint).
     *
     * In production API flow, undoableCommands consumes computeLayout output
     * and wraps each mutation in GEF commands for undo/redo.
     */
    function layoutView(view, options) {
        var layoutResult = computeLayout(view, options);

        var nodesPositioned = 0;
        for (var n = 0; n < layoutResult.nodes.length; n++) {
            var nodeChange = layoutResult.nodes[n];
            nodeChange.element.setBounds(nodeChange.newBounds);
            nodesPositioned++;
        }

        var edgesRouted = 0;
        for (var c = 0; c < layoutResult.connections.length; c++) {
            var connChange = layoutResult.connections[c];
            connChange.connection.getBendpoints().clear();
            edgesRouted++;
        }

        return {
            nodesPositioned: nodesPositioned,
            edgesRouted: edgesRouted,
            diagnostics: layoutResult.diagnostics
        };
    }

    /**
     * Public module API.
     */
    var layoutSugiyamaHeadless = {
        layoutView: layoutView,
        computeLayout: computeLayout
    };

    if (typeof globalThis !== "undefined") {
        globalThis.layoutSugiyamaHeadless = layoutSugiyamaHeadless;
    } else if (typeof global !== "undefined") {
        global.layoutSugiyamaHeadless = layoutSugiyamaHeadless;
    }

    if (typeof module !== "undefined" && module.exports) {
        module.exports = layoutSugiyamaHeadless;
    }
})();
