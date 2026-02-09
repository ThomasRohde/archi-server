/**
 * modelSnapshot.js - Model snapshot capture and refresh
 *
 * Captures a snapshot of the model state (elements, relationships, views)
 * for query operations. Uses $() API for initial capture and EMF traversal
 * for refresh operations.
 *
 * @module server/modelSnapshot
 * @requires server/folderCache
 */

(function() {
    "use strict";

    // Guard against double-loading
    if (typeof globalThis !== "undefined" && typeof globalThis.modelSnapshot !== "undefined") {
        return;
    }

    // Java imports
    var IArchimateElement = Java.type("com.archimatetool.model.IArchimateElement");
    var IArchimateRelationship = Java.type("com.archimatetool.model.IArchimateRelationship");
    var IAccessRelationship = Java.type("com.archimatetool.model.IAccessRelationship");
    var IInfluenceRelationship = Java.type("com.archimatetool.model.IInfluenceRelationship");

    /**
     * Model snapshot management
     */
    var modelSnapshot = {
        /**
         * Internal snapshot storage
         * @private
         */
        snapshot: null,

        /**
         * Capture initial model snapshot using $() API
         * Must be called from script context where $() is available
         * @param {com.archimatetool.model.IArchimateModel} modelRef - EMF model reference
         */
        captureSnapshot: function(modelRef) {
            var elementsList = [];
            var relationshipsList = [];
            var viewsList = [];

            // Use $() API to capture initial snapshot
            $("element").each(function(el) {
                elementsList.push({
                    id: el.id,
                    name: el.name,
                    type: el.type,
                    documentation: el.documentation || ""
                });
            });

            $("relationship").each(function(rel) {
                var relData = {
                    id: rel.id,
                    name: rel.name,
                    type: rel.type,
                    source: rel.source ? rel.source.id : null,
                    target: rel.target ? rel.target.id : null
                };
                // Include accessType for access-relationships
                if (rel.type === "access-relationship" && rel.concept &&
                    typeof rel.concept.getAccessType === 'function') {
                    relData.accessType = rel.concept.getAccessType();
                }
                // Include strength for influence-relationships
                if (rel.type === "influence-relationship" && rel.concept &&
                    typeof rel.concept.getStrength === 'function') {
                    relData.strength = rel.concept.getStrength();
                }
                relationshipsList.push(relData);
            });

            $("view").each(function(view) {
                viewsList.push({
                    id: view.id,
                    name: view.name,
                    type: view.type
                });
            });

            // Store snapshot
            this.snapshot = {
                name: modelRef.getName(),
                elements: elementsList,
                relationships: relationshipsList,
                views: viewsList
            };

            return this.snapshot;
        },

        /**
         * Refresh model snapshot using EMF traversal
         * Use this after model modifications to update snapshot
         * @param {com.archimatetool.model.IArchimateModel} modelRef - EMF model reference
         */
        refreshSnapshot: function(modelRef) {
            if (!this.snapshot) {
                throw new Error("Snapshot not initialized. Call captureSnapshot() first.");
            }

            var elementsList = [];
            var relationshipsList = [];
            var viewsList = [];

            // Recursively collect elements from folders
            var self = this;
            function collectFromFolder(folder) {
                var elements = folder.getElements();
                for (var i = 0; i < elements.size(); i++) {
                    var el = elements.get(i);

                    if (el instanceof IArchimateElement) {
                        elementsList.push({
                            id: el.getId(),
                            name: el.getName(),
                            type: self._getTypeName(el),
                            documentation: el.getDocumentation() || ""
                        });
                    } else if (el instanceof IArchimateRelationship) {
                        var relData = {
                            id: el.getId(),
                            name: el.getName(),
                            type: self._getTypeName(el),
                            source: el.getSource() ? el.getSource().getId() : null,
                            target: el.getTarget() ? el.getTarget().getId() : null
                        };
                        // Include accessType for access-relationships
                        if (el instanceof IAccessRelationship) {
                            relData.accessType = el.getAccessType();
                        }
                        // Include strength for influence-relationships
                        if (el instanceof IInfluenceRelationship) {
                            relData.strength = el.getStrength();
                        }
                        relationshipsList.push(relData);
                    }
                }

                // Process subfolders
                var subfolders = folder.getFolders();
                for (var j = 0; j < subfolders.size(); j++) {
                    collectFromFolder(subfolders.get(j));
                }
            }

            // Collect from all top-level folders
            var folders = modelRef.getFolders();
            for (var i = 0; i < folders.size(); i++) {
                collectFromFolder(folders.get(i));
            }

            // Collect views from model
            var diagramModels = modelRef.getDiagramModels();
            for (var k = 0; k < diagramModels.size(); k++) {
                var view = diagramModels.get(k);
                viewsList.push({
                    id: view.getId(),
                    name: view.getName(),
                    type: self._getTypeName(view)
                });
            }

            // Update snapshot
            this.snapshot.elements = elementsList;
            this.snapshot.relationships = relationshipsList;
            this.snapshot.views = viewsList;

            return this.snapshot;
        },

        /**
         * Get current snapshot
         * @returns {Object} Snapshot object with name, elements, relationships, views
         */
        getSnapshot: function() {
            return this.snapshot;
        },

        /**
         * Get elements from snapshot
         * @returns {Array} Array of element objects
         */
        getElements: function() {
            return this.snapshot ? this.snapshot.elements : [];
        },

        /**
         * Get relationships from snapshot
         * @returns {Array} Array of relationship objects
         */
        getRelationships: function() {
            return this.snapshot ? this.snapshot.relationships : [];
        },

        /**
         * Get views from snapshot
         * @returns {Array} Array of view objects
         */
        getViews: function() {
            return this.snapshot ? this.snapshot.views : [];
        },

        /**
         * Get snapshot summary
         * @returns {Object} Summary with counts of elements, relationships, views
         */
        getSummary: function() {
            if (!this.snapshot) {
                return { elements: 0, relationships: 0, views: 0 };
            }

            return {
                elements: this.snapshot.elements.length,
                relationships: this.snapshot.relationships.length,
                views: this.snapshot.views.length
            };
        },

        /**
         * Convert element to JSON representation
         * @param {Object} element - EMF element
         * @returns {Object} JSON representation
         */
        elementToJSON: function(element) {
            return {
                id: element.getId(),
                name: element.getName(),
                type: this._getTypeName(element),
                documentation: element.getDocumentation() || ""
            };
        },

        /**
         * Convert relationship to JSON representation
         * @param {Object} rel - EMF relationship
         * @returns {Object} JSON representation
         */
        relationshipToJSON: function(rel) {
            var data = {
                id: rel.getId(),
                name: rel.getName(),
                type: this._getTypeName(rel),
                source: rel.getSource() ? rel.getSource().getId() : null,
                target: rel.getTarget() ? rel.getTarget().getId() : null
            };
            // Include accessType for access-relationships
            if (rel instanceof IAccessRelationship) {
                data.accessType = rel.getAccessType();
            }
            // Include strength for influence-relationships
            if (rel instanceof IInfluenceRelationship) {
                data.strength = rel.getStrength();
            }
            return data;
        },

        /**
         * Convert view to JSON representation
         * @param {Object} view - EMF view
         * @returns {Object} JSON representation
         */
        viewToJSON: function(view) {
            return {
                id: view.getId(),
                name: view.getName(),
                type: this._getTypeName(view)
            };
        },

        /**
         * Get ArchiMate type name from EMF class
         * Converts from EMF class name (e.g., "BusinessActor") to ArchiMate type (e.g., "business-actor")
         * @private
         */
        _getTypeName: function(element) {
            var className = element.eClass().getName();
            // Convert from EMF class name to ArchiMate type
            return className.replace(/([A-Z])/g, function(match, p1, offset) {
                return (offset > 0 ? '-' : '') + p1.toLowerCase();
            });
        },

        /**
         * Detect orphan/ghost objects in the model.
         *
         * Ghost objects exist in the EMF model resource but are NOT contained in
         * any folder. This happens when a CompoundCommand is silently rolled back
         * — the folder-add sub-command is undone but the EMF object persists.
         *
         * Uses model.eResource().getAllContents() for EMF-level traversal and
         * compares against the folder-based snapshot.
         *
         * @param {com.archimatetool.model.IArchimateModel} modelRef - EMF model reference
         * @returns {Object} { orphanElements: [...], orphanRelationships: [...], totalOrphans: number }
         */
        detectOrphans: function(modelRef) {
            // First, refresh snapshot to get current folder-based state
            this.refreshSnapshot(modelRef);
            var folderElementIds = {};
            var folderRelationshipIds = {};

            for (var ei = 0; ei < this.snapshot.elements.length; ei++) {
                folderElementIds[this.snapshot.elements[ei].id] = true;
            }
            for (var ri = 0; ri < this.snapshot.relationships.length; ri++) {
                folderRelationshipIds[this.snapshot.relationships[ri].id] = true;
            }

            // EMF-level traversal
            var orphanElements = [];
            var orphanRelationships = [];

            try {
                var resource = modelRef.eResource();
                if (resource) {
                    var allContents = resource.getAllContents();
                    while (allContents.hasNext()) {
                        var obj = allContents.next();
                        if (obj instanceof IArchimateElement) {
                            if (!folderElementIds[obj.getId()]) {
                                orphanElements.push({
                                    id: obj.getId(),
                                    name: obj.getName ? obj.getName() : "",
                                    type: this._getTypeName(obj)
                                });
                            }
                        } else if (obj instanceof IArchimateRelationship) {
                            if (!folderRelationshipIds[obj.getId()]) {
                                var relData = {
                                    id: obj.getId(),
                                    name: obj.getName ? obj.getName() : "",
                                    type: this._getTypeName(obj),
                                    source: obj.getSource() ? obj.getSource().getId() : null,
                                    target: obj.getTarget() ? obj.getTarget().getId() : null
                                };
                                orphanRelationships.push(relData);
                            }
                        }
                    }
                }
            } catch (e) {
                // EMF resource traversal may not be available in all contexts
                return {
                    orphanElements: [],
                    orphanRelationships: [],
                    totalOrphans: 0,
                    error: "EMF resource traversal failed: " + String(e)
                };
            }

            return {
                orphanElements: orphanElements,
                orphanRelationships: orphanRelationships,
                totalOrphans: orphanElements.length + orphanRelationships.length
            };
        }
    };

    // Export globally for JArchi
    if (typeof globalThis !== "undefined") {
        globalThis.modelSnapshot = modelSnapshot;
    } else if (typeof global !== "undefined") {
        global.modelSnapshot = modelSnapshot;
    }

    // CommonJS for Node.js build tools
    if (typeof module !== "undefined" && module.exports) {
        module.exports = modelSnapshot;
    }

})();
