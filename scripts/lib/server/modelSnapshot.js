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
                relationshipsList.push({
                    id: rel.id,
                    name: rel.name,
                    type: rel.type,
                    source: rel.source ? rel.source.id : null,
                    target: rel.target ? rel.target.id : null
                });
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
                        relationshipsList.push({
                            id: el.getId(),
                            name: el.getName(),
                            type: self._getTypeName(el),
                            source: el.getSource() ? el.getSource().getId() : null,
                            target: el.getTarget() ? el.getTarget().getId() : null
                        });
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
            return {
                id: rel.getId(),
                name: rel.getName(),
                type: this._getTypeName(rel),
                source: rel.getSource() ? rel.getSource().getId() : null,
                target: rel.getTarget() ? rel.getTarget().getId() : null
            };
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
