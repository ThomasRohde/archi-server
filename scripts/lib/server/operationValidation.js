/**
 * operationValidation.js - Request validation for API operations
 *
 * Validates request bodies for /model/apply endpoint with clear error messages.
 * Ensures all required fields are present, operations are well-formed, and
 * element/relationship types are valid ArchiMate types.
 *
 * @module server/operationValidation
 * @requires server/serverConfig (optional, for type validation)
 */

(function() {
    "use strict";

    // Guard against double-loading
    if (typeof globalThis !== "undefined" && typeof globalThis.operationValidation !== "undefined") {
        return;
    }

    /**
     * Operation validation utilities
     */
    var operationValidation = {
        /**
         * Maximum changes allowed per request (can be overridden by serverConfig)
         */
        MAX_CHANGES_PER_REQUEST: 1000,

        /**
         * Get max changes limit from config or default
         * @returns {number} Maximum changes per request
         * @private
         */
        _getMaxChanges: function() {
            if (typeof serverConfig !== "undefined" && serverConfig.request) {
                return serverConfig.request.maxChangesPerRequest || this.MAX_CHANGES_PER_REQUEST;
            }
            return this.MAX_CHANGES_PER_REQUEST;
        },

        /**
         * Normalize element type to canonical kebab-case format
         * @param {string} type - Element type in any format
         * @returns {string} Normalized kebab-case type
         */
        normalizeElementType: function(type) {
            if (typeof serverConfig !== "undefined" && serverConfig.normalizeElementType) {
                return serverConfig.normalizeElementType(type);
            }
            // Fallback: return as-is
            return type;
        },

        /**
         * Validate that an element type is a valid ArchiMate type
         * @param {string} type - Element type to validate
         * @returns {boolean} True if valid
         */
        isValidElementType: function(type) {
            if (typeof serverConfig !== "undefined" && serverConfig.isValidElementType) {
                return serverConfig.isValidElementType(type);
            }
            // Fallback: accept all types if serverConfig not loaded
            return true;
        },

        /**
         * Validate that a relationship type is a valid ArchiMate type
         * @param {string} type - Relationship type to validate
         * @returns {boolean} True if valid
         */
        isValidRelationshipType: function(type) {
            if (typeof serverConfig !== "undefined" && serverConfig.isValidRelationshipType) {
                return serverConfig.isValidRelationshipType(type);
            }
            // Fallback: accept all types if serverConfig not loaded
            return true;
        },

        /**
         * Get list of valid element types for error messages
         * @returns {string} Formatted list of valid types grouped by layer
         * @private
         */
        _getValidElementTypesHint: function() {
            if (typeof serverConfig !== "undefined" && serverConfig.validElementTypes) {
                var types = serverConfig.validElementTypes;
                // Return a helpful grouped summary
                return "Strategy: resource, capability, value-stream, course-of-action; " +
                    "Business: business-actor, business-role, business-process, ...; " +
                    "Application: application-component, application-service, data-object, ...; " +
                    "Technology: node, device, artifact, ...; " +
                    "Physical: equipment, facility, material, ...; " +
                    "Motivation: stakeholder, driver, goal, requirement, ...; " +
                    "Implementation: work-package, deliverable, plateau, gap; " +
                    "Other: location, grouping, junction (" + types.length + " total). " +
                    "Use kebab-case format.";
            }
            return "(type validation disabled)";
        },

        /**
         * Get list of valid relationship types for error messages
         * @returns {string} Comma-separated list of valid types
         * @private
         */
        _getValidRelationshipTypesHint: function() {
            if (typeof serverConfig !== "undefined" && serverConfig.validRelationshipTypes) {
                return serverConfig.validRelationshipTypes.join(", ");
            }
            return "(type validation disabled)";
        },

        /**
         * Find duplicate element in model snapshot
         * @param {Object} modelSnapshot - Model snapshot with elements array
         * @param {string} name - Element name to search for
         * @param {string} type - Element type to search for
         * @returns {Object|null} Existing element or null
         * @private
         */
        _findDuplicateElement: function(modelSnapshot, name, type) {
            if (!modelSnapshot || !modelSnapshot.elements) {
                return null;
            }
            
            for (var i = 0; i < modelSnapshot.elements.length; i++) {
                var el = modelSnapshot.elements[i];
                if (el.name === name && el.type === type) {
                    return el;
                }
            }
            return null;
        },

        /**
         * Find duplicate relationship in model snapshot.
         * For access-relationships, also compares accessType.
         * For influence-relationships, also compares strength.
         * @param {Object} modelSnapshot - Model snapshot with relationships array
         * @param {string} sourceId - Source element ID
         * @param {string} targetId - Target element ID
         * @param {string} type - Relationship type
         * @param {Object} [extraProps] - Additional properties to match (accessType, strength)
         * @returns {Object|null} Existing relationship or null
         * @private
         */
        _findDuplicateRelationship: function(modelSnapshot, sourceId, targetId, type, extraProps) {
            if (!modelSnapshot || !modelSnapshot.relationships) {
                return null;
            }
            
            for (var i = 0; i < modelSnapshot.relationships.length; i++) {
                var rel = modelSnapshot.relationships[i];
                if (rel.source === sourceId && rel.target === targetId && rel.type === type) {
                    // For access-relationships, differentiate by accessType
                    if (type === "access-relationship" && extraProps && extraProps.accessType !== undefined) {
                        if (rel.accessType !== undefined && rel.accessType !== extraProps.accessType) {
                            continue; // Different accessType — not a duplicate
                        }
                    }
                    // For influence-relationships, differentiate by strength
                    if (type === "influence-relationship" && extraProps && extraProps.strength !== undefined) {
                        if (rel.strength !== undefined && rel.strength !== extraProps.strength) {
                            continue; // Different strength — not a duplicate
                        }
                    }
                    return rel;
                }
            }
            return null;
        },

        _normalizeDuplicateStrategy: function(value, allowRename) {
            var raw = value === undefined || value === null ? "" : String(value).trim().toLowerCase();
            if (raw === "") return null;
            if (raw !== "error" && raw !== "reuse" && raw !== "rename") {
                throw this.createValidationError(
                    "Invalid duplicate strategy '" + value + "'. Valid values: error, reuse, rename.",
                    "InvalidDuplicateStrategy"
                );
            }
            if (!allowRename && raw === "rename") {
                throw this.createValidationError(
                    "Duplicate strategy 'rename' is not valid for relationship upsert operations.",
                    "InvalidDuplicateStrategy"
                );
            }
            return raw;
        },

        _resolveDuplicateStrategyForOperation: function(change, batchContext, allowRename) {
            var requestDefault = (batchContext && batchContext.defaultDuplicateStrategy) ?
                batchContext.defaultDuplicateStrategy : "error";
            var operationOverride = this._normalizeDuplicateStrategy(change.onDuplicate, allowRename);
            return operationOverride || requestDefault || "error";
        },

        /**
         * Validate apply request body
         * @param {Object} body - Request body to validate
         * @param {Object} modelSnapshot - Current model snapshot (optional, for duplicate checking)
         * @throws {Error} If validation fails with descriptive message
         */
        validateApplyRequest: function(body, modelSnapshot) {
            if (!body) {
                throw this.createValidationError("Request body is missing");
            }

            if (!body.changes || !Array.isArray(body.changes)) {
                throw this.createValidationError("Missing or invalid 'changes' array");
            }

            if (body.changes.length === 0) {
                throw this.createValidationError("'changes' array is empty");
            }

            var maxChanges = this._getMaxChanges();
            if (body.changes.length > maxChanges) {
                throw this.createValidationError(
                    "Too many changes (max " + maxChanges +
                    ", got " + body.changes.length + ")"
                );
            }

            if (body.idempotencyKey !== undefined && body.idempotencyKey !== null && body.idempotencyKey !== "") {
                var key = String(body.idempotencyKey).trim();
                if (!/^[A-Za-z0-9:_-]{1,128}$/.test(key)) {
                    throw this.createValidationError(
                        "Invalid idempotencyKey. Must match ^[A-Za-z0-9:_-]+$ and be 1-128 characters.",
                        "ValidationError"
                    );
                }
                body.idempotencyKey = key;
            }

            var requestDuplicateStrategy = this._normalizeDuplicateStrategy(body.duplicateStrategy, true) || "error";
            body.duplicateStrategy = requestDuplicateStrategy;

            // Track elements and relationships created within this batch for intra-batch duplicate detection
            var batchContext = {
                createdElements: [],  // Array of {name, type, tempId}
                createdRelationships: [],  // Array of {sourceId, targetId, type, tempId}
                tempIdMap: {},  // Map tempId to {name, type} for relationship resolution
                defaultDuplicateStrategy: requestDuplicateStrategy
            };

            // Validate each change
            for (var i = 0; i < body.changes.length; i++) {
                this.validateChange(body.changes[i], i, modelSnapshot, batchContext);
            }
        },

        /**
         * Validate a single change operation
         * @param {Object} change - Change descriptor to validate
         * @param {number} index - Index in changes array (for error messages)
         * @param {Object} modelSnapshot - Current model snapshot (optional)
         * @param {Object} batchContext - Batch-level tracking context (optional)
         * @throws {Error} If validation fails with descriptive message
         */
        validateChange: function(change, index, modelSnapshot, batchContext) {
            if (!change) {
                throw this.createValidationError(
                    "Change " + index + " is null or undefined"
                );
            }

            if (!change.op) {
                throw this.createValidationError(
                    "Change " + index + " is missing 'op' field"
                );
            }

            // Dispatch to specific validator
            switch (change.op) {
                case "createElement":
                    this.validateCreateElement(change, index, modelSnapshot, batchContext);
                    break;
                case "createRelationship":
                    this.validateCreateRelationship(change, index, modelSnapshot, batchContext);
                    break;
                case "createOrGetElement":
                    this.validateCreateOrGetElement(change, index, modelSnapshot, batchContext);
                    break;
                case "createOrGetRelationship":
                    this.validateCreateOrGetRelationship(change, index, modelSnapshot, batchContext);
                    break;
                case "setProperty":
                    this.validateSetProperty(change, index);
                    break;
                case "updateElement":
                    this.validateUpdateElement(change, index);
                    break;
                case "deleteElement":
                    this.validateDeleteElement(change, index);
                    break;
                case "addToView":
                    this.validateAddToView(change, index);
                    break;
                case "addConnectionToView":
                    this.validateAddConnectionToView(change, index);
                    break;
                case "nestInView":
                    this.validateNestInView(change, index);
                    break;
                case "deleteConnectionFromView":
                    this.validateDeleteConnectionFromView(change, index);
                    break;
                case "deleteRelationship":
                    this.validateDeleteRelationship(change, index);
                    break;
                case "updateRelationship":
                    this.validateUpdateRelationship(change, index);
                    break;
                case "moveToFolder":
                    this.validateMoveToFolder(change, index);
                    break;
                case "createFolder":
                    this.validateCreateFolder(change, index);
                    break;
                case "styleViewObject":
                    this.validateStyleViewObject(change, index);
                    break;
                case "styleConnection":
                    this.validateStyleConnection(change, index);
                    break;
                case "moveViewObject":
                    this.validateMoveViewObject(change, index);
                    break;
                case "createNote":
                    this.validateCreateNote(change, index);
                    break;
                case "createGroup":
                    this.validateCreateGroup(change, index);
                    break;
                case "createView":
                    this.validateCreateView(change, index);
                    break;
                case "deleteView":
                case "duplicateView":
                case "setViewRouter":
                case "layoutView":
                    // Basic validation: require viewId
                    if (!change.viewId && change.op !== "createView") {
                        throw this.createValidationError(
                            "Change " + index + " (" + change.op + "): missing 'viewId' field"
                        );
                    }
                    break;
                default:
                    throw this.createValidationError(
                        "Change " + index + " has unknown operation: " + change.op
                    );
            }
        },

        /**
         * Validate createElement operation
         * @param {Object} change - Change descriptor
         * @param {number} index - Index in changes array
         * @param {Object} modelSnapshot - Current model snapshot (optional)
         * @param {Object} batchContext - Batch-level tracking context (optional)
         * @throws {Error} If validation fails
         */
        validateCreateElement: function(change, index, modelSnapshot, batchContext) {
            if (!change.type) {
                throw this.createValidationError(
                    "Change " + index + " (createElement): missing 'type' field"
                );
            }
            if (!change.name) {
                throw this.createValidationError(
                    "Change " + index + " (createElement): missing 'name' field"
                );
            }
            // Normalize the type for lenient matching
            var normalizedType = this.normalizeElementType(change.type);
            // Validate element type is a valid ArchiMate type
            if (!this.isValidElementType(change.type)) {
                var hint = change.type !== normalizedType
                    ? " (normalized to '" + normalizedType + "')"
                    : "";
                throw this.createValidationError(
                    "Change " + index + " (createElement): invalid element type '" + change.type + "'" + hint +
                    ". Valid types: " + this._getValidElementTypesHint()
                );
            }
            // Store normalized type back for downstream processing
            change.type = normalizedType;

            // Check for duplicate in existing model
            if (modelSnapshot) {
                var existing = this._findDuplicateElement(modelSnapshot, change.name, normalizedType);
                if (existing) {
                    throw this.createValidationError(
                        "Change " + index + " (createElement): element '" + change.name +
                        "' of type '" + normalizedType + "' already exists (id: " + existing.id + ")"
                    );
                }
            }

            // Check for duplicate within this batch
            if (batchContext && batchContext.createdElements) {
                for (var i = 0; i < batchContext.createdElements.length; i++) {
                    var created = batchContext.createdElements[i];
                    if (created.name === change.name && created.type === normalizedType) {
                        throw this.createValidationError(
                            "Change " + index + " (createElement): element '" + change.name +
                            "' of type '" + normalizedType + "' already created earlier in this batch (tempId: " + created.tempId + ")"
                        );
                    }
                }
                // Track this element creation
                batchContext.createdElements.push({
                    name: change.name,
                    type: normalizedType,
                    tempId: change.tempId || null
                });
                // Store in tempId map for relationship resolution
                if (change.tempId) {
                    batchContext.tempIdMap[change.tempId] = {
                        name: change.name,
                        type: normalizedType
                    };
                }
            }
        },

        /**
         * Validate createRelationship operation
         * @param {Object} change - Change descriptor
         * @param {number} index - Index in changes array
         * @param {Object} modelSnapshot - Current model snapshot (optional)
         * @param {Object} batchContext - Batch-level tracking context (optional)
         * @throws {Error} If validation fails
         */
        validateCreateRelationship: function(change, index, modelSnapshot, batchContext) {
            if (!change.type) {
                throw this.createValidationError(
                    "Change " + index + " (createRelationship): missing 'type' field"
                );
            }
            if (!change.sourceId) {
                throw this.createValidationError(
                    "Change " + index + " (createRelationship): missing 'sourceId' field"
                );
            }
            if (!change.targetId) {
                throw this.createValidationError(
                    "Change " + index + " (createRelationship): missing 'targetId' field"
                );
            }
            // Validate relationship type is a valid ArchiMate type
            if (!this.isValidRelationshipType(change.type)) {
                throw this.createValidationError(
                    "Change " + index + " (createRelationship): invalid relationship type '" + change.type +
                    "'. Valid types: " + this._getValidRelationshipTypesHint()
                );
            }

            // For duplicate checking, we need to resolve IDs (tempIds may reference earlier creates)
            var resolvedSourceId = change.sourceId;
            var resolvedTargetId = change.targetId;
            
            // Note: We can't fully resolve tempIds to real IDs at validation time,
            // but we can track them for intra-batch duplicate detection

            // Check for duplicate in existing model
            if (modelSnapshot) {
                var extraProps = {};
                if (change.accessType !== undefined) extraProps.accessType = change.accessType;
                if (change.strength !== undefined) extraProps.strength = change.strength;
                var existing = this._findDuplicateRelationship(
                    modelSnapshot,
                    resolvedSourceId,
                    resolvedTargetId,
                    change.type,
                    extraProps
                );
                if (existing) {
                    throw this.createValidationError(
                        "Change " + index + " (createRelationship): relationship of type '" + change.type +
                        "' from '" + resolvedSourceId + "' to '" + resolvedTargetId + "' already exists (id: " + existing.id + ")"
                    );
                }
            }

            // Check for duplicate within this batch
            if (batchContext && batchContext.createdRelationships) {
                for (var i = 0; i < batchContext.createdRelationships.length; i++) {
                    var created = batchContext.createdRelationships[i];
                    if (created.sourceId === resolvedSourceId &&
                        created.targetId === resolvedTargetId &&
                        created.type === change.type) {
                        // For access-relationships, differentiate by accessType
                        if (change.type === "access-relationship" &&
                            change.accessType !== undefined && created.accessType !== undefined &&
                            change.accessType !== created.accessType) {
                            continue; // Different accessType — not a duplicate
                        }
                        // For influence-relationships, differentiate by strength
                        if (change.type === "influence-relationship" &&
                            change.strength !== undefined && created.strength !== undefined &&
                            change.strength !== created.strength) {
                            continue; // Different strength — not a duplicate
                        }
                        throw this.createValidationError(
                            "Change " + index + " (createRelationship): relationship of type '" + change.type +
                            "' from '" + resolvedSourceId + "' to '" + resolvedTargetId +
                            "' already created earlier in this batch (tempId: " + created.tempId + ")"
                        );
                    }
                }
                // Track this relationship creation (include accessType/strength for intra-batch checks)
                batchContext.createdRelationships.push({
                    sourceId: resolvedSourceId,
                    targetId: resolvedTargetId,
                    type: change.type,
                    tempId: change.tempId || null,
                    accessType: change.accessType,
                    strength: change.strength
                });
            }
        },

        /**
         * Validate createOrGetElement operation.
         * Requires explicit match keys and deterministic duplicate strategy.
         */
        validateCreateOrGetElement: function(change, index, modelSnapshot, batchContext) {
            if (!change.create || typeof change.create !== "object") {
                throw this.createValidationError(
                    "Change " + index + " (createOrGetElement): missing 'create' object",
                    "InvalidMatchSpecification"
                );
            }
            if (!change.match || typeof change.match !== "object") {
                throw this.createValidationError(
                    "Change " + index + " (createOrGetElement): missing 'match' object",
                    "InvalidMatchSpecification"
                );
            }

            var create = change.create;
            var match = change.match;
            if (!create.type || !create.name) {
                throw this.createValidationError(
                    "Change " + index + " (createOrGetElement): create requires 'type' and 'name'",
                    "InvalidMatchSpecification"
                );
            }
            if (!match.type || !match.name) {
                throw this.createValidationError(
                    "Change " + index + " (createOrGetElement): match requires explicit 'type' and 'name'",
                    "InvalidMatchSpecification"
                );
            }

            var normalizedCreateType = this.normalizeElementType(create.type);
            var normalizedMatchType = this.normalizeElementType(match.type);
            if (!this.isValidElementType(normalizedCreateType)) {
                throw this.createValidationError(
                    "Change " + index + " (createOrGetElement): invalid element type '" + create.type + "'",
                    "InvalidMatchSpecification"
                );
            }
            if (!this.isValidElementType(normalizedMatchType)) {
                throw this.createValidationError(
                    "Change " + index + " (createOrGetElement): invalid match type '" + match.type + "'",
                    "InvalidMatchSpecification"
                );
            }
            if (normalizedCreateType !== normalizedMatchType) {
                throw this.createValidationError(
                    "Change " + index + " (createOrGetElement): create.type and match.type must match",
                    "InvalidMatchSpecification"
                );
            }
            if (String(create.name) !== String(match.name)) {
                throw this.createValidationError(
                    "Change " + index + " (createOrGetElement): create.name and match.name must match",
                    "InvalidMatchSpecification"
                );
            }

            create.type = normalizedCreateType;
            match.type = normalizedMatchType;
            change.onDuplicate = this._resolveDuplicateStrategyForOperation(change, batchContext, true);
        },

        /**
         * Validate createOrGetRelationship operation.
         * Requires explicit relationship match keys and disallows rename strategy.
         */
        validateCreateOrGetRelationship: function(change, index, modelSnapshot, batchContext) {
            if (!change.create || typeof change.create !== "object") {
                throw this.createValidationError(
                    "Change " + index + " (createOrGetRelationship): missing 'create' object",
                    "InvalidMatchSpecification"
                );
            }
            if (!change.match || typeof change.match !== "object") {
                throw this.createValidationError(
                    "Change " + index + " (createOrGetRelationship): missing 'match' object",
                    "InvalidMatchSpecification"
                );
            }

            var create = change.create;
            var match = change.match;
            if (!create.type || !create.sourceId || !create.targetId) {
                throw this.createValidationError(
                    "Change " + index + " (createOrGetRelationship): create requires 'type', 'sourceId', 'targetId'",
                    "InvalidMatchSpecification"
                );
            }
            if (!match.type || !match.sourceId || !match.targetId) {
                throw this.createValidationError(
                    "Change " + index + " (createOrGetRelationship): match requires explicit 'type', 'sourceId', 'targetId'",
                    "InvalidMatchSpecification"
                );
            }
            if (!this.isValidRelationshipType(create.type)) {
                throw this.createValidationError(
                    "Change " + index + " (createOrGetRelationship): invalid relationship type '" + create.type + "'",
                    "InvalidMatchSpecification"
                );
            }
            if (!this.isValidRelationshipType(match.type)) {
                throw this.createValidationError(
                    "Change " + index + " (createOrGetRelationship): invalid match type '" + match.type + "'",
                    "InvalidMatchSpecification"
                );
            }
            if (String(create.type) !== String(match.type)) {
                throw this.createValidationError(
                    "Change " + index + " (createOrGetRelationship): create.type and match.type must match",
                    "InvalidMatchSpecification"
                );
            }
            if (String(create.sourceId) !== String(match.sourceId) ||
                String(create.targetId) !== String(match.targetId)) {
                throw this.createValidationError(
                    "Change " + index + " (createOrGetRelationship): create and match endpoints must match",
                    "InvalidMatchSpecification"
                );
            }
            if (match.accessType !== undefined && create.accessType !== undefined &&
                String(match.accessType) !== String(create.accessType)) {
                throw this.createValidationError(
                    "Change " + index + " (createOrGetRelationship): create.accessType and match.accessType must match",
                    "InvalidMatchSpecification"
                );
            }
            if (match.strength !== undefined && create.strength !== undefined &&
                String(match.strength) !== String(create.strength)) {
                throw this.createValidationError(
                    "Change " + index + " (createOrGetRelationship): create.strength and match.strength must match",
                    "InvalidMatchSpecification"
                );
            }

            change.onDuplicate = this._resolveDuplicateStrategyForOperation(change, batchContext, false);
            if (change.onDuplicate === "rename") {
                throw this.createValidationError(
                    "Change " + index + " (createOrGetRelationship): duplicate strategy 'rename' is not supported",
                    "InvalidDuplicateStrategy"
                );
            }
        },

        /**
         * Validate setProperty operation
         * @param {Object} change - Change descriptor
         * @param {number} index - Index in changes array
         * @throws {Error} If validation fails
         */
        validateSetProperty: function(change, index) {
            if (!change.id) {
                throw this.createValidationError(
                    "Change " + index + " (setProperty): missing 'id' field"
                );
            }
            if (!change.key) {
                throw this.createValidationError(
                    "Change " + index + " (setProperty): missing 'key' field"
                );
            }
            if (change.value === undefined) {
                throw this.createValidationError(
                    "Change " + index + " (setProperty): missing 'value' field"
                );
            }
        },

        /**
         * Validate updateElement operation
         * @param {Object} change - Change descriptor
         * @param {number} index - Index in changes array
         * @throws {Error} If validation fails
         */
        validateUpdateElement: function(change, index) {
            if (!change.id) {
                throw this.createValidationError(
                    "Change " + index + " (updateElement): missing 'id' field"
                );
            }
            // At least one update field must be provided
            var hasUpdate = (
                change.name !== undefined ||
                change.documentation !== undefined ||
                (change.properties && typeof change.properties === 'object' && Object.keys(change.properties).length > 0)
            );
            if (!hasUpdate) {
                throw this.createValidationError(
                    "Change " + index + " (updateElement): must specify at least one of 'name', 'documentation', or 'properties'"
                );
            }
            // Validate properties object if provided
            if (change.properties !== undefined) {
                if (typeof change.properties !== 'object' || change.properties === null || Array.isArray(change.properties)) {
                    throw this.createValidationError(
                        "Change " + index + " (updateElement): 'properties' must be an object"
                    );
                }
                // All property values must be strings
                for (var key in change.properties) {
                    if (change.properties.hasOwnProperty(key)) {
                        if (typeof change.properties[key] !== 'string') {
                            throw this.createValidationError(
                                "Change " + index + " (updateElement): property '" + key + "' value must be a string"
                            );
                        }
                    }
                }
            }
        },

        /**
         * Validate deleteElement operation
         * @param {Object} change - Change descriptor
         * @param {number} index - Index in changes array
         * @throws {Error} If validation fails
         */
        validateDeleteElement: function(change, index) {
            if (!change.id) {
                throw this.createValidationError(
                    "Change " + index + " (deleteElement): missing 'id' field"
                );
            }
            // cascade is optional boolean, defaults to true
            if (change.cascade !== undefined && typeof change.cascade !== 'boolean') {
                throw this.createValidationError(
                    "Change " + index + " (deleteElement): 'cascade' must be a boolean"
                );
            }
        },

        /**
         * Validate addToView operation
         * @param {Object} change - Change descriptor
         * @param {number} index - Index in changes array
         * @throws {Error} If validation fails
         */
        validateAddToView: function(change, index) {
            if (!change.viewId) {
                throw this.createValidationError(
                    "Change " + index + " (addToView): missing 'viewId' field"
                );
            }
            if (!change.elementId) {
                throw this.createValidationError(
                    "Change " + index + " (addToView): missing 'elementId' field"
                );
            }
            // x, y, width, height are optional with defaults
            // Validate numeric types if provided
            if (change.x !== undefined && typeof change.x !== 'number') {
                throw this.createValidationError(
                    "Change " + index + " (addToView): 'x' must be a number"
                );
            }
            if (change.y !== undefined && typeof change.y !== 'number') {
                throw this.createValidationError(
                    "Change " + index + " (addToView): 'y' must be a number"
                );
            }
            // parentVisualId is optional — if provided, coordinates are relative to parent
            if (change.parentVisualId !== undefined && typeof change.parentVisualId !== 'string') {
                throw this.createValidationError(
                    "Change " + index + " (addToView): 'parentVisualId' must be a string"
                );
            }
        },

        /**
         * Validate nestInView operation
         * @param {Object} change - Change descriptor
         * @param {number} index - Index in changes array
         * @throws {Error} If validation fails
         */
        validateNestInView: function(change, index) {
            if (!change.viewId) {
                throw this.createValidationError(
                    "Change " + index + " (nestInView): missing 'viewId' field"
                );
            }
            if (!change.visualId) {
                throw this.createValidationError(
                    "Change " + index + " (nestInView): missing 'visualId' field"
                );
            }
            if (!change.parentVisualId) {
                throw this.createValidationError(
                    "Change " + index + " (nestInView): missing 'parentVisualId' field"
                );
            }
            if (change.x !== undefined && typeof change.x !== 'number') {
                throw this.createValidationError(
                    "Change " + index + " (nestInView): 'x' must be a number"
                );
            }
            if (change.y !== undefined && typeof change.y !== 'number') {
                throw this.createValidationError(
                    "Change " + index + " (nestInView): 'y' must be a number"
                );
            }
        },

        /**
         * Validate addConnectionToView operation
         * @param {Object} change - Change descriptor
         * @param {number} index - Index in changes array
         * @throws {Error} If validation fails
         */
        validateAddConnectionToView: function(change, index) {
            if (!change.viewId) {
                throw this.createValidationError(
                    "Change " + index + " (addConnectionToView): missing 'viewId' field"
                );
            }
            if (!change.relationshipId) {
                throw this.createValidationError(
                    "Change " + index + " (addConnectionToView): missing 'relationshipId' field"
                );
            }
            // sourceVisualId and targetVisualId are optional — if omitted, the
            // execution engine auto-discovers them from the relationship's source/target
        },

        /**
         * Validate deleteConnectionFromView operation
         * @param {Object} change - Change descriptor
         * @param {number} index - Index in changes array
         * @throws {Error} If validation fails
         */
        validateDeleteConnectionFromView: function(change, index) {
            if (!change.viewId) {
                throw this.createValidationError(
                    "Change " + index + " (deleteConnectionFromView): missing 'viewId' field"
                );
            }
            if (!change.connectionId) {
                throw this.createValidationError(
                    "Change " + index + " (deleteConnectionFromView): missing 'connectionId' field"
                );
            }
        },

        /**
         * Validate deleteRelationship operation
         * @param {Object} change - Change descriptor
         * @param {number} index - Index in changes array
         * @throws {Error} If validation fails
         */
        validateDeleteRelationship: function(change, index) {
            if (!change.id) {
                throw this.createValidationError(
                    "Change " + index + " (deleteRelationship): missing 'id' field"
                );
            }
        },

        /**
         * Validate updateRelationship operation
         * @param {Object} change - Change descriptor
         * @param {number} index - Index in changes array
         * @throws {Error} If validation fails
         */
        validateUpdateRelationship: function(change, index) {
            if (!change.id) {
                throw this.createValidationError(
                    "Change " + index + " (updateRelationship): missing 'id' field"
                );
            }
            // At least one update field must be provided
            var hasUpdate = (
                change.name !== undefined ||
                change.documentation !== undefined ||
                (change.properties && typeof change.properties === 'object' && Object.keys(change.properties).length > 0)
            );
            if (!hasUpdate) {
                throw this.createValidationError(
                    "Change " + index + " (updateRelationship): must specify at least one of 'name', 'documentation', or 'properties'"
                );
            }
        },

        /**
         * Validate moveToFolder operation
         * @param {Object} change - Change descriptor
         * @param {number} index - Index in changes array
         * @throws {Error} If validation fails
         */
        validateMoveToFolder: function(change, index) {
            if (!change.id) {
                throw this.createValidationError(
                    "Change " + index + " (moveToFolder): missing 'id' field"
                );
            }
            if (!change.folderId) {
                throw this.createValidationError(
                    "Change " + index + " (moveToFolder): missing 'folderId' field"
                );
            }
        },

        /**
         * Validate createFolder operation
         * @param {Object} change - Change descriptor
         * @param {number} index - Index in changes array
         * @throws {Error} If validation fails
         */
        validateCreateFolder: function(change, index) {
            if (!change.name) {
                throw this.createValidationError(
                    "Change " + index + " (createFolder): missing 'name' field"
                );
            }
            if (!change.parentId && !change.parentType && !change.parentFolder) {
                throw this.createValidationError(
                    "Change " + index + " (createFolder): must specify 'parentId', 'parentType' (e.g. 'BUSINESS'), or 'parentFolder' (name, e.g. 'Views')"
                );
            }
        },

        /**
         * Validate styleViewObject operation
         * @param {Object} change - Change descriptor
         * @param {number} index - Index in changes array
         * @throws {Error} If validation fails
         */
        validateStyleViewObject: function(change, index) {
            if (!change.viewObjectId) {
                throw this.createValidationError(
                    "Change " + index + " (styleViewObject): missing 'viewObjectId' field"
                );
            }
            // At least one style property should be present (but not required for flexibility)
        },

        /**
         * Validate styleConnection operation
         * @param {Object} change - Change descriptor
         * @param {number} index - Index in changes array
         * @throws {Error} If validation fails
         */
        validateStyleConnection: function(change, index) {
            if (!change.connectionId) {
                throw this.createValidationError(
                    "Change " + index + " (styleConnection): missing 'connectionId' field"
                );
            }
        },

        /**
         * Validate moveViewObject operation
         * @param {Object} change - Change descriptor
         * @param {number} index - Index in changes array
         * @throws {Error} If validation fails
         */
        validateMoveViewObject: function(change, index) {
            if (!change.viewObjectId) {
                throw this.createValidationError(
                    "Change " + index + " (moveViewObject): missing 'viewObjectId' field"
                );
            }
            if (change.x !== undefined && typeof change.x !== 'number') {
                throw this.createValidationError(
                    "Change " + index + " (moveViewObject): 'x' must be a number"
                );
            }
            if (change.y !== undefined && typeof change.y !== 'number') {
                throw this.createValidationError(
                    "Change " + index + " (moveViewObject): 'y' must be a number"
                );
            }
            if (change.width !== undefined && typeof change.width !== 'number') {
                throw this.createValidationError(
                    "Change " + index + " (moveViewObject): 'width' must be a number"
                );
            }
            if (change.height !== undefined && typeof change.height !== 'number') {
                throw this.createValidationError(
                    "Change " + index + " (moveViewObject): 'height' must be a number"
                );
            }
            // At least one dimension should be provided
            var hasDimension = (
                change.x !== undefined ||
                change.y !== undefined ||
                change.width !== undefined ||
                change.height !== undefined
            );
            if (!hasDimension) {
                throw this.createValidationError(
                    "Change " + index + " (moveViewObject): must specify at least one of 'x', 'y', 'width', or 'height'"
                );
            }
        },

        /**
         * Validate createNote operation
         * @param {Object} change - Change descriptor
         * @param {number} index - Index in changes array
         * @throws {Error} If validation fails
         */
        validateCreateNote: function(change, index) {
            if (!change.viewId) {
                throw this.createValidationError(
                    "Change " + index + " (createNote): missing 'viewId' field"
                );
            }
            if (!change.content) {
                throw this.createValidationError(
                    "Change " + index + " (createNote): missing 'content' field"
                );
            }
            if (change.x !== undefined && typeof change.x !== 'number') {
                throw this.createValidationError(
                    "Change " + index + " (createNote): 'x' must be a number"
                );
            }
            if (change.y !== undefined && typeof change.y !== 'number') {
                throw this.createValidationError(
                    "Change " + index + " (createNote): 'y' must be a number"
                );
            }
            if (change.width !== undefined && typeof change.width !== 'number') {
                throw this.createValidationError(
                    "Change " + index + " (createNote): 'width' must be a number"
                );
            }
            if (change.height !== undefined && typeof change.height !== 'number') {
                throw this.createValidationError(
                    "Change " + index + " (createNote): 'height' must be a number"
                );
            }
        },

        /**
         * Validate createGroup operation
         * @param {Object} change - Change descriptor
         * @param {number} index - Index in changes array
         * @throws {Error} If validation fails
         */
        validateCreateGroup: function(change, index) {
            if (!change.viewId) {
                throw this.createValidationError(
                    "Change " + index + " (createGroup): missing 'viewId' field"
                );
            }
            if (!change.name) {
                throw this.createValidationError(
                    "Change " + index + " (createGroup): missing 'name' field"
                );
            }
        },

        /**
         * Validate createView operation
         * @param {Object} change - Change descriptor
         * @param {number} index - Index in changes array
         * @throws {Error} If validation fails
         */
        validateCreateView: function(change, index) {
            if (!change.name) {
                throw this.createValidationError(
                    "Change " + index + " (createView): missing 'name' field"
                );
            }
            if (change.viewpoint !== undefined) {
                if (typeof change.viewpoint !== "string" || String(change.viewpoint).trim().length === 0) {
                    throw this.createValidationError(
                        "Change " + index + " (createView): 'viewpoint' must be a non-empty string when provided"
                    );
                }
                var viewpointValue = String(change.viewpoint).trim();
                if (viewpointValue.indexOf("@") !== -1) {
                    throw this.createValidationError(
                        "Change " + index + " (createView): invalid viewpoint format '" + change.viewpoint + "'"
                    );
                }
                change.viewpoint = viewpointValue;
            }
        },

        /**
         * Create a validation error with consistent format
         * @param {string} message - Error message
         * @param {string} [code] - Optional error code
         * @returns {Error} Error object
         */
        createValidationError: function(message, code) {
            var error = new Error(message);
            error.code = code || "ValidationError";
            return error;
        }
    };

    // Export globally for JArchi
    if (typeof globalThis !== "undefined") {
        globalThis.operationValidation = operationValidation;
    } else if (typeof global !== "undefined") {
        global.operationValidation = operationValidation;
    }

    // CommonJS for Node.js build tools
    if (typeof module !== "undefined" && module.exports) {
        module.exports = operationValidation;
    }

})();
