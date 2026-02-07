/**
 * folderCache.js - Model folder caching for performance optimization
 *
 * Caches references to ArchiMate model folders for fast access during
 * operations. Provides convenience methods for retrieving folders by layer
 * and finding elements by ID.
 *
 * @module server/folderCache
 */

(function() {
    "use strict";

    // Guard against double-loading
    if (typeof globalThis !== "undefined" && typeof globalThis.folderCache !== "undefined") {
        return;
    }

    // Java imports
    var FolderType = Java.type("com.archimatetool.model.FolderType");

    /**
     * Folder cache with convenience accessors
     */
    var folderCache = {
        /**
         * Internal cache storage
         * @private
         */
        cache: null,

        /**
         * Initialize folder cache from model
         * @param {com.archimatetool.model.IArchimateModel} modelRef - EMF model reference
         */
        initialize: function(modelRef) {
            this.cache = {
                business: null,
                application: null,
                technology: null,
                strategy: null,
                motivation: null,
                implementation: null,
                physical: null,
                relations: null
            };

            var folders = modelRef.getFolders();
            for (var i = 0; i < folders.size(); i++) {
                var folder = folders.get(i);

                if (folder.getType() === FolderType.BUSINESS) {
                    this.cache.business = folder;
                } else if (folder.getType() === FolderType.APPLICATION) {
                    this.cache.application = folder;
                } else if (folder.getType() === FolderType.TECHNOLOGY) {
                    this.cache.technology = folder;
                } else if (folder.getType() === FolderType.STRATEGY) {
                    this.cache.strategy = folder;
                } else if (folder.getType() === FolderType.MOTIVATION) {
                    this.cache.motivation = folder;
                } else if (folder.getType() === FolderType.IMPLEMENTATION_MIGRATION) {
                    this.cache.implementation = folder;
                } else if (folder.getType() === FolderType.PHYSICAL) {
                    this.cache.physical = folder;
                } else if (folder.getType() === FolderType.RELATIONS) {
                    this.cache.relations = folder;
                }
            }
        },

        /**
         * Clear the folder cache
         */
        clear: function() {
            this.cache = null;
        },

        /**
         * Get business layer folder
         * @returns {com.archimatetool.model.IFolder}
         * @throws {Error} If business folder not found
         */
        getBusinessFolder: function() {
            if (!this.cache || !this.cache.business) {
                throw new Error("Business folder not found in model");
            }
            return this.cache.business;
        },

        /**
         * Get application layer folder
         * @returns {com.archimatetool.model.IFolder}
         * @throws {Error} If application folder not found
         */
        getApplicationFolder: function() {
            if (!this.cache || !this.cache.application) {
                throw new Error("Application folder not found in model");
            }
            return this.cache.application;
        },

        /**
         * Get technology layer folder
         * @returns {com.archimatetool.model.IFolder}
         * @throws {Error} If technology folder not found
         */
        getTechnologyFolder: function() {
            if (!this.cache || !this.cache.technology) {
                throw new Error("Technology folder not found in model");
            }
            return this.cache.technology;
        },

        /**
         * Get strategy layer folder
         * @returns {com.archimatetool.model.IFolder}
         * @throws {Error} If strategy folder not found
         */
        getStrategyFolder: function() {
            if (!this.cache || !this.cache.strategy) {
                throw new Error("Strategy folder not found in model");
            }
            return this.cache.strategy;
        },

        /**
         * Get motivation layer folder
         * @returns {com.archimatetool.model.IFolder}
         * @throws {Error} If motivation folder not found
         */
        getMotivationFolder: function() {
            if (!this.cache || !this.cache.motivation) {
                throw new Error("Motivation folder not found in model");
            }
            return this.cache.motivation;
        },

        /**
         * Get implementation & migration layer folder
         * @returns {com.archimatetool.model.IFolder}
         * @throws {Error} If implementation folder not found
         */
        getImplementationFolder: function() {
            if (!this.cache || !this.cache.implementation) {
                throw new Error("Implementation folder not found in model");
            }
            return this.cache.implementation;
        },

        /**
         * Get physical layer folder
         * @returns {com.archimatetool.model.IFolder}
         * @throws {Error} If physical folder not found
         */
        getPhysicalFolder: function() {
            if (!this.cache || !this.cache.physical) {
                throw new Error("Physical folder not found in model");
            }
            return this.cache.physical;
        },

        /**
         * Get relations folder
         * @returns {com.archimatetool.model.IFolder}
         * @throws {Error} If relations folder not found
         */
        getRelationsFolder: function() {
            if (!this.cache || !this.cache.relations) {
                throw new Error("Relations folder not found in model");
            }
            return this.cache.relations;
        },

        /**
         * Get folder for specific element type
         * @param {string} elementType - ArchiMate element type (e.g., "business-actor")
         * @returns {com.archimatetool.model.IFolder}
         * @throws {Error} If appropriate folder not found
         */
        getFolderForType: function(elementType) {
            if (elementType.startsWith("business-")) {
                return this.getBusinessFolder();
            } else if (elementType.startsWith("application-") || elementType === "data-object") {
                return this.getApplicationFolder();
            } else if (elementType.startsWith("technology-") ||
                       elementType === "artifact" ||
                       elementType === "path" ||
                       elementType === "communication-network") {
                return this.getTechnologyFolder();
            } else if (elementType.startsWith("strategy-")) {
                return this.getStrategyFolder();
            } else if (elementType.startsWith("motivation-") ||
                       elementType === "stakeholder" ||
                       elementType === "driver" ||
                       elementType === "assessment" ||
                       elementType === "goal" ||
                       elementType === "outcome" ||
                       elementType === "principle" ||
                       elementType === "requirement" ||
                       elementType === "constraint") {
                return this.getMotivationFolder();
            } else if (elementType.startsWith("implementation-") ||
                       elementType === "work-package" ||
                       elementType === "deliverable" ||
                       elementType === "plateau" ||
                       elementType === "gap") {
                return this.getImplementationFolder();
            } else if (elementType.startsWith("physical-") ||
                       elementType === "equipment" ||
                       elementType === "facility" ||
                       elementType === "distribution-network" ||
                       elementType === "material") {
                return this.getPhysicalFolder();
            } else {
                // Default to business folder for unknown types
                return this.getBusinessFolder();
            }
        },

        /**
         * Find element by ID in the model
         * @param {com.archimatetool.model.IArchimateModel} modelRef - EMF model reference
         * @param {string} id - Element ID to search for
         * @returns {Object|null} Element or null if not found
         */
        findElementById: function(modelRef, id) {
            var folders = modelRef.getFolders();
            for (var i = 0; i < folders.size(); i++) {
                var folder = folders.get(i);
                var element = this._findInFolder(folder, id);
                if (element) return element;
            }
            return null;
        },

        /**
         * Recursively search folder and subfolders for element by ID
         * @private
         */
        _findInFolder: function(folder, id) {
            var elements = folder.getElements();
            for (var i = 0; i < elements.size(); i++) {
                var element = elements.get(i);
                if (element.getId() === id) {
                    return element;
                }
            }

            // Search subfolders
            var subfolders = folder.getFolders();
            for (var j = 0; j < subfolders.size(); j++) {
                var subfolder = subfolders.get(j);
                var found = this._findInFolder(subfolder, id);
                if (found) return found;
            }

            return null;
        }
    };

    // Export globally for JArchi
    if (typeof globalThis !== "undefined") {
        globalThis.folderCache = folderCache;
    } else if (typeof global !== "undefined") {
        global.folderCache = folderCache;
    }

    // CommonJS for Node.js build tools
    if (typeof module !== "undefined" && module.exports) {
        module.exports = folderCache;
    }

})();
