/**
 * undoableCommands.js - Undoable Command Helpers for JArchi
 *
 * Provides a high-level API for performing undoable operations on ArchiMate models.
 * All operations use Eclipse GEF commands which integrate with Archi's undo/redo system.
 *
 * Key Features:
 * - All operations appear in Edit > Undo menu with descriptive labels
 * - Batch operations can be grouped into a single undo/redo action
 * - Thread-safe: Can be called from UI thread (Display.asyncExec context)
 * - Works with both jArchi proxies and direct EMF model objects
 *
 * Usage:
 *   load(__DIR__ + "lib/core/undoableCommands.js");
 *
 *   // Create element (undoable)
 *   var element = undoableCommands.createElement(model, {
 *       type: "business-actor",
 *       name: "New Actor",
 *       documentation: "Description"
 *   });
 *
 *   // Create relationship (undoable)
 *   var rel = undoableCommands.createRelationship(model, {
 *       type: "serving-relationship",
 *       source: element1,
 *       target: element2,
 *       name: "serves"
 *   });
 *
 *   // Batch operations (single undo)
 *   var results = undoableCommands.executeBatch(model, "Create Team", [
 *       { op: "createElement", type: "business-actor", name: "Alice" },
 *       { op: "createElement", type: "business-actor", name: "Bob" },
 *       { op: "createRelationship", type: "assignment-relationship", sourceId: "t1", targetId: "t2" }
 *   ]);
 *
 * @version 1.0.0
 */

(function() {
    "use strict";

    // Guard against double-loading
    if (typeof globalThis !== "undefined" && typeof globalThis.undoableCommands !== "undefined") {
        return;
    }

    // Java imports
    var IArchimateFactory = Java.type("com.archimatetool.model.IArchimateFactory");
    var IEditorModelManager = Java.type("com.archimatetool.editor.model.IEditorModelManager");
    var EObjectFeatureCommand = Java.type("com.archimatetool.editor.model.commands.EObjectFeatureCommand");
    var GEFCommand = Java.type("org.eclipse.gef.commands.Command");
    var CompoundCommand = Java.type("org.eclipse.gef.commands.CompoundCommand");
    var EcoreUtil = Java.type("org.eclipse.emf.ecore.util.EcoreUtil");
    var IArchimatePackage = Java.type("com.archimatetool.model.IArchimatePackage");
    var FolderType = Java.type("com.archimatetool.model.FolderType");

    var factory = IArchimateFactory.eINSTANCE;
    var modelManager = IEditorModelManager.INSTANCE;
    var pkg = IArchimatePackage.eINSTANCE;

    /**
     * Get command stack for a model
     * @param {Object} model - IArchimateModel or jArchi model proxy
     * @returns {Object} CommandStack
     */
    function getCommandStack(model) {
        // Get command stack from the active editor via PlatformUI workbench
        // This is the correct way to access the command stack in Eclipse RCP
        try {
            var PlatformUI = Java.type("org.eclipse.ui.PlatformUI");
            var workbench = PlatformUI.getWorkbench();
            var window = workbench.getActiveWorkbenchWindow();

            if (!window) {
                throw new Error("No active workbench window");
            }

            var page = window.getActivePage();
            if (!page) {
                throw new Error("No active page");
            }

            // Find editor for this model
            var editorRefs = page.getEditorReferences();
            for (var i = 0; i < editorRefs.length; i++) {
                var editorRef = editorRefs[i];
                var editor = editorRef.getEditor(false);

                if (editor && editor.getAdapter) {
                    // Check if this editor's model matches
                    var IArchimateModel = Java.type("com.archimatetool.model.IArchimateModel");
                    var editorModel = editor.getAdapter(IArchimateModel.class);

                    if (editorModel && editorModel.getId() === model.getId()) {
                        // Found the editor for this model, get its command stack
                        var GEFCommandStack = Java.type("org.eclipse.gef.commands.CommandStack");
                        var commandStack = editor.getAdapter(GEFCommandStack.class);

                        if (commandStack) {
                            return commandStack;
                        }
                    }
                }
            }

            // If we couldn't find a matching editor, try the active editor
            var activeEditor = page.getActiveEditor();
            if (activeEditor && activeEditor.getAdapter) {
                var GEFCommandStack2 = Java.type("org.eclipse.gef.commands.CommandStack");
                var stack = activeEditor.getAdapter(GEFCommandStack2.class);
                if (stack) {
                    return stack;
                }
            }

            throw new Error("Could not find command stack for model");

        } catch (e) {
            throw new Error("Failed to get command stack: " + e.message);
        }
    }

    /**
     * Execute a GEF command (makes it undoable)
     * @param {Object} model - IArchimateModel
     * @param {Object} command - GEF Command
     */
    function executeCommand(model, command) {
        var commandStack = getCommandStack(model);
        commandStack.execute(command);
    }

    /**
     * Get folder for element type
     * @param {Object} model - IArchimateModel
     * @param {string} type - ArchiMate element type (e.g., "business-actor")
     * @returns {Object} IFolder
     */
    function getFolderForType(model, type) {
        var folders = model.getFolders();
        var folderType = null;

        // Strategy Layer
        if (type === "resource" || type === "capability" ||
            type === "value-stream" || type === "course-of-action") {
            folderType = FolderType.STRATEGY;
        }
        // Business Layer
        else if (type.startsWith("business-") ||
                 type === "contract" || type === "representation" || type === "product") {
            folderType = FolderType.BUSINESS;
        }
        // Application Layer
        else if (type.startsWith("application-") || type === "data-object") {
            folderType = FolderType.APPLICATION;
        }
        // Technology Layer
        else if (type.startsWith("technology-") || type === "artifact" ||
                 type === "node" || type === "device" || type === "system-software" ||
                 type === "path" || type === "communication-network") {
            folderType = FolderType.TECHNOLOGY;
        }
        // Physical Layer (stored in Technology folder in Archi)
        else if (type === "equipment" || type === "facility" ||
                 type === "distribution-network" || type === "material") {
            folderType = FolderType.TECHNOLOGY;
        }
        // Motivation Layer
        else if (type === "stakeholder" || type === "driver" || type === "assessment" ||
                 type === "goal" || type === "outcome" || type === "principle" ||
                 type === "requirement" || type === "constraint" ||
                 type === "meaning" || type === "value") {
            folderType = FolderType.MOTIVATION;
        }
        // Implementation & Migration Layer
        else if (type === "work-package" || type === "deliverable" ||
                 type === "implementation-event" || type === "plateau" || type === "gap") {
            folderType = FolderType.IMPLEMENTATION_MIGRATION;
        }
        // Other (location, grouping, junction)
        else if (type === "location" || type === "grouping" || type === "junction") {
            folderType = FolderType.OTHER;
        }
        // Relationships
        else if (type.indexOf("relationship") !== -1) {
            folderType = FolderType.RELATIONS;
        }
        // Default fallback
        else {
            folderType = FolderType.OTHER;
        }

        for (var i = 0; i < folders.size(); i++) {
            var folder = folders.get(i);
            if (folder.getType() === folderType) {
                return folder;
            }
        }

        throw new Error("Folder not found for type: " + type);
    }

    /**
     * Create element factory method based on type
     * @param {string} type - ArchiMate element type (kebab-case)
     * @returns {Object} Created element
     */
    function createElementByType(type) {
        switch(type) {
            // Strategy Layer
            case "resource": return factory.createResource();
            case "capability": return factory.createCapability();
            case "value-stream": return factory.createValueStream();
            case "course-of-action": return factory.createCourseOfAction();

            // Business Layer
            case "business-actor": return factory.createBusinessActor();
            case "business-role": return factory.createBusinessRole();
            case "business-collaboration": return factory.createBusinessCollaboration();
            case "business-interface": return factory.createBusinessInterface();
            case "business-process": return factory.createBusinessProcess();
            case "business-function": return factory.createBusinessFunction();
            case "business-interaction": return factory.createBusinessInteraction();
            case "business-event": return factory.createBusinessEvent();
            case "business-service": return factory.createBusinessService();
            case "business-object": return factory.createBusinessObject();
            case "contract": return factory.createContract();
            case "representation": return factory.createRepresentation();
            case "product": return factory.createProduct();

            // Application Layer
            case "application-component": return factory.createApplicationComponent();
            case "application-collaboration": return factory.createApplicationCollaboration();
            case "application-interface": return factory.createApplicationInterface();
            case "application-function": return factory.createApplicationFunction();
            case "application-interaction": return factory.createApplicationInteraction();
            case "application-process": return factory.createApplicationProcess();
            case "application-event": return factory.createApplicationEvent();
            case "application-service": return factory.createApplicationService();
            case "data-object": return factory.createDataObject();

            // Technology Layer
            case "technology-node":
            case "node": return factory.createNode();
            case "technology-device":
            case "device": return factory.createDevice();
            case "system-software": return factory.createSystemSoftware();
            case "technology-collaboration": return factory.createTechnologyCollaboration();
            case "technology-interface": return factory.createTechnologyInterface();
            case "path": return factory.createPath();
            case "communication-network": return factory.createCommunicationNetwork();
            case "technology-function": return factory.createTechnologyFunction();
            case "technology-process": return factory.createTechnologyProcess();
            case "technology-interaction": return factory.createTechnologyInteraction();
            case "technology-event": return factory.createTechnologyEvent();
            case "technology-service": return factory.createTechnologyService();
            case "artifact": return factory.createArtifact();

            // Physical Layer
            case "equipment": return factory.createEquipment();
            case "facility": return factory.createFacility();
            case "distribution-network": return factory.createDistributionNetwork();
            case "material": return factory.createMaterial();

            // Motivation Layer
            case "stakeholder": return factory.createStakeholder();
            case "driver": return factory.createDriver();
            case "assessment": return factory.createAssessment();
            case "goal": return factory.createGoal();
            case "outcome": return factory.createOutcome();
            case "principle": return factory.createPrinciple();
            case "requirement": return factory.createRequirement();
            case "constraint": return factory.createConstraint();
            case "meaning": return factory.createMeaning();
            case "value": return factory.createValue();

            // Implementation & Migration Layer
            case "work-package": return factory.createWorkPackage();
            case "deliverable": return factory.createDeliverable();
            case "implementation-event": return factory.createImplementationEvent();
            case "plateau": return factory.createPlateau();
            case "gap": return factory.createGap();

            // Other
            case "location": return factory.createLocation();
            case "grouping": return factory.createGrouping();
            case "junction": return factory.createJunction();

            default:
                throw new Error("Unknown or unsupported element type: " + type +
                    ". Valid types include: resource, capability, stakeholder, driver, goal, " +
                    "business-actor, application-component, node, equipment, work-package, location, etc.");
        }
    }

    /**
     * Create relationship factory method based on type
     * @param {string} type - ArchiMate relationship type
     * @returns {Object} Created relationship
     */
    function createRelationshipByType(type) {
        switch(type) {
            case "composition-relationship": return factory.createCompositionRelationship();
            case "aggregation-relationship": return factory.createAggregationRelationship();
            case "assignment-relationship": return factory.createAssignmentRelationship();
            case "realization-relationship": return factory.createRealizationRelationship();
            case "serving-relationship": return factory.createServingRelationship();
            case "access-relationship": return factory.createAccessRelationship();
            case "influence-relationship": return factory.createInfluenceRelationship();
            case "triggering-relationship": return factory.createTriggeringRelationship();
            case "flow-relationship": return factory.createFlowRelationship();
            case "specialization-relationship": return factory.createSpecializationRelationship();
            case "association-relationship": return factory.createAssociationRelationship();
            default:
                throw new Error("Unknown or unsupported relationship type: " + type);
        }
    }

    /**
     * Create a custom GEF command for adding element to folder
     * @param {string} label - Command label for undo menu
     * @param {Object} folder - Target folder
     * @param {Object} element - Element to add
     * @returns {Object} GEF Command
     */
    function createAddToFolderCommand(label, folder, element) {
        var AddCommand = Java.extend(GEFCommand, {
            execute: function() {
                folder.getElements().add(element);
            },
            undo: function() {
                folder.getElements().remove(element);
            },
            canExecute: function() {
                return true;
            },
            canUndo: function() {
                return true;
            },
            getLabel: function() {
                return label;
            }
        });

        return new AddCommand();
    }

    /**
     * Create element (undoable)
     * @param {Object} model - IArchimateModel
     * @param {Object} options - Element options
     * @param {string} options.type - Element type (e.g., "business-actor")
     * @param {string} options.name - Element name
     * @param {string} [options.documentation] - Element documentation
     * @returns {Object} Created element
     */
    function createElement(model, options) {
        if (!options.type || !options.name) {
            throw new Error("createElement requires 'type' and 'name' options");
        }

        // Create element
        var element = createElementByType(options.type);

        // Set properties directly (these will be included in the create operation)
        element.setName(options.name);
        if (options.documentation) {
            element.setDocumentation(options.documentation);
        }

        // Create command to add element to folder
        var folder = getFolderForType(model, options.type);
        var addCmd = createAddToFolderCommand(
            "Create " + options.name,
            folder,
            element
        );

        // Execute single command
        executeCommand(model, addCmd);

        return element;
    }

    /**
     * Create relationship (undoable)
     * @param {Object} model - IArchimateModel
     * @param {Object} options - Relationship options
     * @param {string} options.type - Relationship type (e.g., "serving-relationship")
     * @param {Object} options.source - Source element
     * @param {Object} options.target - Target element
     * @param {string} [options.name] - Relationship name
     * @returns {Object} Created relationship
     */
    function createRelationship(model, options) {
        if (!options.type || !options.source || !options.target) {
            throw new Error("createRelationship requires 'type', 'source', and 'target' options");
        }

        // Create relationship
        var rel = createRelationshipByType(options.type);

        // Set properties directly
        rel.setSource(options.source);
        rel.setTarget(options.target);
        if (options.name) {
            rel.setName(options.name);
        }

        // Create command to add relationship to folder
        var folder = getFolderForType(model, options.type);
        var label = options.name ?
            "Create " + options.name :
            "Create " + options.type + " from " + options.source.getName() + " to " + options.target.getName();

        var addCmd = createAddToFolderCommand(
            label,
            folder,
            rel
        );

        // Execute single command
        executeCommand(model, addCmd);

        return rel;
    }

    /**
     * Set property on element (undoable)
     * @param {Object} model - IArchimateModel
     * @param {Object} element - Target element
     * @param {string} key - Property key
     * @param {string} value - Property value
     */
    function setProperty(model, element, key, value) {
        // Find existing property
        var properties = element.getProperties();
        var existingProp = null;

        for (var i = 0; i < properties.size(); i++) {
            var prop = properties.get(i);
            if (prop.getKey() === key) {
                existingProp = prop;
                break;
            }
        }

        if (existingProp) {
            // Update existing property value
            var cmd = new EObjectFeatureCommand(
                "Set Property '" + key + "' on " + element.getName(),
                existingProp,
                pkg.getProperty_Value(),
                value
            );
            executeCommand(model, cmd);
        } else {
            // Create new property with key and value set directly
            var newProp = factory.createProperty();
            newProp.setKey(key);
            newProp.setValue(value);

            // Create single command to add property to element
            var AddPropertyCommand = Java.extend(GEFCommand, {
                execute: function() {
                    properties.add(newProp);
                },
                undo: function() {
                    properties.remove(newProp);
                },
                canExecute: function() {
                    return true;
                },
                canUndo: function() {
                    return true;
                },
                getLabel: function() {
                    return "Set Property '" + key + "' on " + element.getName();
                }
            });

            executeCommand(model, new AddPropertyCommand());
        }
    }

    /**
     * Update element name (undoable)
     * @param {Object} model - IArchimateModel
     * @param {Object} element - Target element
     * @param {string} newName - New name
     */
    function updateName(model, element, newName) {
        var cmd = new EObjectFeatureCommand(
            "Update Name",
            element,
            pkg.getNameable_Name(),
            newName
        );
        executeCommand(model, cmd);
    }

    /**
     * Update element documentation (undoable)
     * @param {Object} model - IArchimateModel
     * @param {Object} element - Target element
     * @param {string} newDoc - New documentation
     */
    function updateDocumentation(model, element, newDoc) {
        var cmd = new EObjectFeatureCommand(
            "Update Documentation",
            element,
            pkg.getDocumentable_Documentation(),
            newDoc
        );
        executeCommand(model, cmd);
    }

    /**
     * Delete element (undoable via manual cascade)
     * Removes all visual references and relationships before removing the element itself.
     * Uses the same cascade approach as executeBatch's deleteElement op.
     * @param {Object} model - IArchimateModel
     * @param {Object} element - Element to delete
     * @param {Object} [options] - Delete options
     * @param {boolean} [options.cascade=true] - If true, also removes relationships and visual refs
     */
    function deleteElement(model, element, options) {
        options = options || {};
        var doCascade = options.cascade !== false;
        var elemId = element.getId();
        var elemName = element.getName ? element.getName() : '';

        var compound = new CompoundCommand("Delete " + elemName);

        if (doCascade) {
            // Step 1: Find and remove all relationships where this element is source or target
            var relRefs = findRelationshipsForElement(model, elemId);
            for (var ri = 0; ri < relRefs.length; ri++) {
                var relRef = relRefs[ri];
                var rel = relRef.relationship;
                var relFolder = relRef.parentFolder;

                // Step 1a: Remove all visual connections for this relationship across all views
                var allViews = findAllViews(model);
                for (var vi = 0; vi < allViews.length; vi++) {
                    var connRefs = findConnectionsForRelationship(allViews[vi], rel.getId());
                    for (var ci = 0; ci < connRefs.length; ci++) {
                        (function(capturedConn, capturedSrc, capturedTgt) {
                            var RemoveConnCmd = Java.extend(GEFCommand, {
                                execute: function() {
                                    if (capturedSrc && typeof capturedSrc.getSourceConnections === 'function') {
                                        capturedSrc.getSourceConnections().remove(capturedConn);
                                    }
                                    if (capturedTgt && typeof capturedTgt.getTargetConnections === 'function') {
                                        capturedTgt.getTargetConnections().remove(capturedConn);
                                    }
                                },
                                undo: function() {
                                    if (capturedSrc && typeof capturedSrc.getSourceConnections === 'function') {
                                        capturedSrc.getSourceConnections().add(capturedConn);
                                    }
                                    if (capturedTgt && typeof capturedTgt.getTargetConnections === 'function') {
                                        capturedTgt.getTargetConnections().add(capturedConn);
                                    }
                                },
                                canExecute: function() { return true; },
                                canUndo: function() { return true; },
                                getLabel: function() { return "Remove connection from view"; }
                            });
                            compound.add(new RemoveConnCmd());
                        })(connRefs[ci].connection, connRefs[ci].source, connRefs[ci].target);
                    }
                }

                // Step 1b: Remove the relationship from its folder
                (function(capturedRel, capturedFolder) {
                    var RemoveRelCmd = Java.extend(GEFCommand, {
                        execute: function() {
                            if (capturedFolder && typeof capturedFolder.getElements === 'function') {
                                capturedFolder.getElements().remove(capturedRel);
                            }
                        },
                        undo: function() {
                            if (capturedFolder && typeof capturedFolder.getElements === 'function') {
                                capturedFolder.getElements().add(capturedRel);
                            }
                        },
                        canExecute: function() { return true; },
                        canUndo: function() { return true; },
                        getLabel: function() { return "Remove relationship"; }
                    });
                    compound.add(new RemoveRelCmd());
                })(rel, relFolder);
            }

            // Step 2: Remove all visual objects for this element across all views
            var allViewsForElem = findAllViews(model);
            for (var vei = 0; vei < allViewsForElem.length; vei++) {
                var visualRefs = findVisualsForElement(allViewsForElem[vei], elemId);
                for (var vri = 0; vri < visualRefs.length; vri++) {
                    // First remove any connections attached to this visual
                    var attachedConns = findConnectionsForVisual(visualRefs[vri].visual);
                    for (var aci = 0; aci < attachedConns.length; aci++) {
                        (function(capturedConn, capturedSrc, capturedTgt) {
                            var RemoveAttConnCmd = Java.extend(GEFCommand, {
                                execute: function() {
                                    if (capturedSrc && typeof capturedSrc.getSourceConnections === 'function') {
                                        capturedSrc.getSourceConnections().remove(capturedConn);
                                    }
                                    if (capturedTgt && typeof capturedTgt.getTargetConnections === 'function') {
                                        capturedTgt.getTargetConnections().remove(capturedConn);
                                    }
                                },
                                undo: function() {
                                    if (capturedSrc && typeof capturedSrc.getSourceConnections === 'function') {
                                        capturedSrc.getSourceConnections().add(capturedConn);
                                    }
                                    if (capturedTgt && typeof capturedTgt.getTargetConnections === 'function') {
                                        capturedTgt.getTargetConnections().add(capturedConn);
                                    }
                                },
                                canExecute: function() { return true; },
                                canUndo: function() { return true; },
                                getLabel: function() { return "Remove attached connection"; }
                            });
                            compound.add(new RemoveAttConnCmd());
                        })(attachedConns[aci].connection, attachedConns[aci].source, attachedConns[aci].target);
                    }

                    // Then remove the visual object from its parent
                    (function(capturedVisual, capturedContainer) {
                        var RemoveVisualCmd = Java.extend(GEFCommand, {
                            execute: function() {
                                if (capturedContainer && typeof capturedContainer.getChildren === 'function') {
                                    capturedContainer.getChildren().remove(capturedVisual);
                                }
                            },
                            undo: function() {
                                if (capturedContainer && typeof capturedContainer.getChildren === 'function') {
                                    capturedContainer.getChildren().add(capturedVisual);
                                }
                            },
                            canExecute: function() { return true; },
                            canUndo: function() { return true; },
                            getLabel: function() { return "Remove visual from view"; }
                        });
                        compound.add(new RemoveVisualCmd());
                    })(visualRefs[vri].visual, visualRefs[vri].parent);
                }
            }
        }

        // Step 3: Remove the element itself from its parent folder
        var parentFolder = element.eContainer();
        (function(capturedElem, capturedParent) {
            var DeleteCmd = Java.extend(GEFCommand, {
                execute: function() {
                    if (capturedParent && typeof capturedParent.getElements === 'function') {
                        capturedParent.getElements().remove(capturedElem);
                    }
                },
                undo: function() {
                    if (capturedParent && typeof capturedParent.getElements === 'function') {
                        capturedParent.getElements().add(capturedElem);
                    }
                },
                canExecute: function() { return true; },
                canUndo: function() { return true; },
                getLabel: function() { return "Delete " + elemName; }
            });
            compound.add(new DeleteCmd());
        })(element, parentFolder);

        executeCommand(model, compound);
    }

    /**
     * Find folder by ID in model
     * @param {Object} model - IArchimateModel
     * @param {string} id - Folder ID
     * @returns {Object|null} Folder or null
     */
    function findFolderById(model, id) {
        function searchFolder(folder) {
            if (folder.getId() === id) return folder;
            var subfolders = folder.getFolders();
            for (var i = 0; i < subfolders.size(); i++) {
                var found = searchFolder(subfolders.get(i));
                if (found) return found;
            }
            return null;
        }

        var folders = model.getFolders();
        for (var i = 0; i < folders.size(); i++) {
            var found = searchFolder(folders.get(i));
            if (found) return found;
        }
        return null;
    }

    /**
     * Get folder by type name
     * @param {Object} model - IArchimateModel
     * @param {string} typeName - Folder type name (e.g., "BUSINESS", "APPLICATION")
     * @returns {Object|null} Folder or null
     */
    function getFolderByType(model, typeName) {
        var folders = model.getFolders();
        for (var i = 0; i < folders.size(); i++) {
            var folder = folders.get(i);
            var folderType = folder.getType();
            if (folderType && folderType.getName().toUpperCase() === typeName.toUpperCase()) {
                return folder;
            }
        }
        return null;
    }

    /**
     * Find connection by ID in view
     * @param {Object} view - View to search
     * @param {string} connectionId - Connection ID
     * @returns {Object|null} Connection or null
     */
    function findConnectionInView(view, connectionId) {
        function searchConnections(container) {
            var children = container.getChildren();
            for (var i = 0; i < children.size(); i++) {
                var child = children.get(i);
                // Check source connections
                var sourceConns = child.getSourceConnections();
                if (sourceConns) {
                    for (var c = 0; c < sourceConns.size(); c++) {
                        var conn = sourceConns.get(c);
                        if (conn.getId() === connectionId) return conn;
                    }
                }
                // Recurse into children
                if (typeof child.getChildren === 'function') {
                    var found = searchConnections(child);
                    if (found) return found;
                }
            }
            return null;
        }
        return searchConnections(view);
    }

    /**
     * Parse color string to integer
     * @param {string} colorStr - Color in "#RRGGBB" or "RRGGBB" format
     * @returns {number} Integer color value
     */
    function parseColorToInt(colorStr) {
        if (colorStr === null || colorStr === undefined) return -1;
        var hex = String(colorStr).replace('#', '');
        if (hex.length === 6) {
            var r = parseInt(hex.substring(0, 2), 16);
            var g = parseInt(hex.substring(2, 4), 16);
            var b = parseInt(hex.substring(4, 6), 16);
            // Archi stores colors as RGB integer
            return (r << 16) | (g << 8) | b;
        }
        return -1; // Default color
    }

    /**
     * Normalize color string to "#RRGGBB" format
     * JArchi's setFillColor/setLineColor expect string format, not integers
     * @param {string} colorStr - Color in "#RRGGBB" or "RRGGBB" format
     * @returns {string} Normalized color string with # prefix
     */
    function normalizeColorString(colorStr) {
        if (colorStr === null || colorStr === undefined) return null;
        var str = String(colorStr);
        if (str.startsWith('#')) return str.toUpperCase();
        if (str.length === 6) return '#' + str.toUpperCase();
        return null;
    }

    /**
     * Normalize viewpoint identifier.
     * @param {string} value - Raw viewpoint ID
     * @returns {string|null} Normalized viewpoint ID or null
     */
    function normalizeViewpointId(value) {
        if (value === null || value === undefined) return null;
        var id = String(value).trim();
        if (!id) return null;
        if (id.indexOf("@") !== -1) return null;
        if (!/^[a-z0-9_]+$/.test(id)) return null;
        return id;
    }

    /**
     * Resolve viewpoint object by ID.
     * @param {string} viewpointId - Viewpoint ID
     * @returns {{id: string|null, viewpoint: Object|null}} Resolved viewpoint and canonical ID
     */
    function resolveViewpointById(viewpointId) {
        var normalizedId = normalizeViewpointId(viewpointId);
        if (!normalizedId) {
            return { id: null, viewpoint: null };
        }

        try {
            var ViewpointManager = Java.type("com.archimatetool.model.viewpoints.ViewpointManager");
            var manager = ViewpointManager.INSTANCE;

            var direct = manager.getViewpoint(normalizedId);
            if (direct) {
                return { id: normalizedId, viewpoint: direct };
            }

            var allVPs = manager.getAllViewpoints();
            for (var i = 0; i < allVPs.size(); i++) {
                var candidate = allVPs.get(i);
                var candidateId = null;
                try {
                    candidateId = normalizeViewpointId(candidate.getId ? candidate.getId() : null);
                } catch (ignoreIdErr) {
                    candidateId = null;
                }
                if (candidateId === normalizedId) {
                    return { id: candidateId, viewpoint: candidate };
                }
            }
        } catch (e) {
            return { id: normalizedId, viewpoint: null };
        }

        return { id: normalizedId, viewpoint: null };
    }

    /**
     * Execute batch operations (single undo/redo)
     * @param {Object} model - IArchimateModel
     * @param {string} label - Label for undo menu (e.g., "Create Team Structure")
     * @param {Array} operations - Array of operation descriptors
     * @returns {Array} Results array with created elements/relationships
     *
     * Operation format:
     *   { op: "createElement", type: "business-actor", name: "Alice", tempId: "t1" }
     *   { op: "createRelationship", type: "assignment-relationship", sourceId: "t1", targetId: "t2" }
     *   { op: "setProperty", id: "element-id", key: "ServiceNow ID", value: "sys123" }
     */

    // =========================================================================
    // View traversal helpers for cross-reference discovery
    // =========================================================================

    /**
     * Find all views in the model by traversing folder structure
     * @param {Object} model - IArchimateModel
     * @returns {Array} Array of view objects
     */
    function findAllViews(model) {
        var views = [];
        function searchFolder(folder) {
            var elements = folder.getElements();
            for (var i = 0; i < elements.size(); i++) {
                var element = elements.get(i);
                // Views have getChildren() method
                if (typeof element.getChildren === "function") {
                    views.push(element);
                }
            }
            var subfolders = folder.getFolders();
            for (var j = 0; j < subfolders.size(); j++) {
                searchFolder(subfolders.get(j));
            }
        }
        var folders = model.getFolders();
        for (var k = 0; k < folders.size(); k++) {
            searchFolder(folders.get(k));
        }
        return views;
    }

    /**
     * Find all visual objects in a view that reference a given ArchiMate element
     * @param {Object} view - EMF view object
     * @param {string} elementId - ArchiMate element ID
     * @returns {Array} Array of {visual, parent} objects
     */
    function findVisualsForElement(view, elementId) {
        var results = [];
        function search(container) {
            var children = container.getChildren();
            for (var i = 0; i < children.size(); i++) {
                var child = children.get(i);
                // Check if this visual references the target element
                if (typeof child.getArchimateElement === "function") {
                    var archEl = child.getArchimateElement();
                    if (archEl && archEl.getId() === elementId) {
                        results.push({ visual: child, parent: container });
                    }
                }
                // Recurse into nested children (groups, etc.)
                if (typeof child.getChildren === "function") {
                    search(child);
                }
            }
        }
        search(view);
        return results;
    }

    /**
     * Find all visual connections in a view that reference a given ArchiMate relationship
     * @param {Object} view - EMF view object
     * @param {string} relationshipId - ArchiMate relationship ID
     * @returns {Array} Array of {connection, source, target} objects
     */
    function findConnectionsForRelationship(view, relationshipId) {
        var results = [];
        function search(container) {
            var children = container.getChildren();
            for (var i = 0; i < children.size(); i++) {
                var child = children.get(i);
                // Check source connections on this visual
                if (typeof child.getSourceConnections === "function") {
                    var conns = child.getSourceConnections();
                    for (var c = 0; c < conns.size(); c++) {
                        var conn = conns.get(c);
                        if (typeof conn.getArchimateRelationship === "function") {
                            var archRel = conn.getArchimateRelationship();
                            if (archRel && archRel.getId() === relationshipId) {
                                results.push({
                                    connection: conn,
                                    source: conn.getSource(),
                                    target: conn.getTarget()
                                });
                            }
                        }
                    }
                }
                // Recurse into nested children
                if (typeof child.getChildren === "function") {
                    search(child);
                }
            }
        }
        search(view);
        return results;
    }

    /**
     * Find all connections attached to a visual object (as source or target)
     * @param {Object} visual - Visual object in a view
     * @returns {Array} Array of {connection, source, target} objects
     */
    function findConnectionsForVisual(visual) {
        var results = [];
        // Outgoing connections
        if (typeof visual.getSourceConnections === "function") {
            var srcConns = visual.getSourceConnections();
            for (var i = 0; i < srcConns.size(); i++) {
                var conn = srcConns.get(i);
                results.push({
                    connection: conn,
                    source: conn.getSource(),
                    target: conn.getTarget()
                });
            }
        }
        // Incoming connections
        if (typeof visual.getTargetConnections === "function") {
            var tgtConns = visual.getTargetConnections();
            for (var j = 0; j < tgtConns.size(); j++) {
                var conn2 = tgtConns.get(j);
                results.push({
                    connection: conn2,
                    source: conn2.getSource(),
                    target: conn2.getTarget()
                });
            }
        }
        return results;
    }

    /**
     * Find all relationships in the model where a given element is source or target.
     * Searches the Relations folder and its subfolders.
     * @param {Object} model - IArchimateModel
     * @param {string} elementId - Element ID
     * @returns {Array} Array of {relationship, parentFolder} objects
     */
    function findRelationshipsForElement(model, elementId) {
        var results = [];
        function searchFolder(folder) {
            var elements = folder.getElements();
            for (var i = 0; i < elements.size(); i++) {
                var el = elements.get(i);
                // Check if it's a relationship with source/target matching
                if (typeof el.getSource === "function" && typeof el.getTarget === "function") {
                    var src = el.getSource();
                    var tgt = el.getTarget();
                    if ((src && src.getId() === elementId) || (tgt && tgt.getId() === elementId)) {
                        results.push({ relationship: el, parentFolder: folder });
                    }
                }
            }
            var subfolders = folder.getFolders();
            for (var j = 0; j < subfolders.size(); j++) {
                searchFolder(subfolders.get(j));
            }
        }
        // Search all folders (relationships could be in any folder)
        var folders = model.getFolders();
        for (var k = 0; k < folders.size(); k++) {
            searchFolder(folders.get(k));
        }
        return results;
    }

    // =========================================================================
    function executeBatch(model, label, operations, batchConfig) {
        // Merge config: caller overrides > serverConfig > defaults
        var config = {
            maxSubCommandsPerBatch: 50,
            postExecuteVerify: true,
            granularity: null // R2: "per-operation" to execute each op as its own CompoundCommand
        };
        if (typeof serverConfig !== "undefined" && serverConfig.operations) {
            if (serverConfig.operations.maxSubCommandsPerBatch !== undefined) {
                config.maxSubCommandsPerBatch = serverConfig.operations.maxSubCommandsPerBatch;
            }
            if (serverConfig.operations.postExecuteVerify !== undefined) {
                config.postExecuteVerify = serverConfig.operations.postExecuteVerify;
            }
        }
        if (batchConfig) {
            if (batchConfig.maxSubCommandsPerBatch !== undefined) {
                config.maxSubCommandsPerBatch = batchConfig.maxSubCommandsPerBatch;
            }
            if (batchConfig.postExecuteVerify !== undefined) {
                config.postExecuteVerify = batchConfig.postExecuteVerify;
            }
            if (batchConfig.granularity !== undefined) {
                config.granularity = batchConfig.granularity;
            }
        }

        var compound = new CompoundCommand(label);
        var results = [];
        var idMap = {}; // Map tempId -> created object
        var relEndpoints = {}; // rel.getId() -> { src, tgt } for same-batch source/target lookup

        // Track created object IDs for post-execution verification
        var createdElementIds = [];
        var createdRelationshipIds = [];

        // R1: Track operation boundaries for operation-aligned chunking
        // Each entry is the sub-command index where a logical operation starts
        var opBoundaries = [];

        // First pass: create all elements
        for (var i = 0; i < operations.length; i++) {
            var op = operations[i];

            if (op.op === "createElement") {
                opBoundaries.push(compound.size()); // R1: mark operation boundary
                var element = createElementByType(op.type);

                // Set name
                var nameCmd = new EObjectFeatureCommand(
                    "Set Name",
                    element,
                    pkg.getNameable_Name(),
                    op.name
                );
                compound.add(nameCmd);

                // Set documentation if provided
                if (op.documentation) {
                    var docCmd = new EObjectFeatureCommand(
                        "Set Documentation",
                        element,
                        pkg.getDocumentable_Documentation(),
                        op.documentation
                    );
                    compound.add(docCmd);
                }

                // Add to folder
                var folder = getFolderForType(model, op.type);
                var addCmd = createAddToFolderCommand(
                    "Add " + op.name,
                    folder,
                    element
                );
                compound.add(addCmd);

                // Store in map
                if (op.tempId) {
                    idMap[op.tempId] = element;
                }

                results.push({
                    op: "createElement",
                    tempId: op.tempId,
                    realId: element.getId(),
                    name: op.name,  // Use op.name since compound command hasn't executed yet
                    type: op.type,
                    element: element
                });

                // Track for post-execution verification
                createdElementIds.push(element.getId());
            }
        }

        // Second pass: mutations (no deletes — deletes handled in third pass)
        for (var j = 0; j < operations.length; j++) {
            var operation = operations[j];

            // Deletes go to third pass so creates are fully committed first
            if (operation.op === "deleteConnectionFromView" || operation.op === "deleteElement" ||
                operation.op === "deleteRelationship" || operation.op === "deleteView") {
                continue;
            }

            var _opStartP2 = compound.size(); // R1: track operation boundary

            if (operation.op === "createRelationship") {
                // Resolve source and target
                var source = idMap[operation.sourceId] || findElementById(model, operation.sourceId);
                var target = idMap[operation.targetId] || findElementById(model, operation.targetId);

                if (!source || !target) {
                    throw new Error("Cannot find source or target for relationship");
                }

                var rel = createRelationshipByType(operation.type);

                // Set source
                var srcCmd = new EObjectFeatureCommand(
                    "Set Source",
                    rel,
                    pkg.getArchimateRelationship_Source(),
                    source
                );
                compound.add(srcCmd);

                // Set target
                var tgtCmd = new EObjectFeatureCommand(
                    "Set Target",
                    rel,
                    pkg.getArchimateRelationship_Target(),
                    target
                );
                compound.add(tgtCmd);

                // Set name if provided
                if (operation.name) {
                    var relNameCmd = new EObjectFeatureCommand(
                        "Set Name",
                        rel,
                        pkg.getNameable_Name(),
                        operation.name
                    );
                    compound.add(relNameCmd);
                }

                // Set documentation if provided
                if (operation.documentation) {
                    var relDocCreateCmd = new EObjectFeatureCommand(
                        "Set Documentation",
                        rel,
                        pkg.getDocumentable_Documentation(),
                        operation.documentation
                    );
                    compound.add(relDocCreateCmd);
                }

                // R4: Set accessType for access relationships using direct setter
                // (avoids potential EMF enum mapping issues with EObjectFeatureCommand)
                if (operation.accessType !== undefined && typeof rel.setAccessType === 'function') {
                    (function(capturedRel, capturedAccessType) {
                        var oldAccessType = capturedRel.getAccessType();
                        var SetAccessCmd = Java.extend(GEFCommand, {
                            execute: function() { capturedRel.setAccessType(capturedAccessType); },
                            undo: function() { capturedRel.setAccessType(oldAccessType); },
                            canExecute: function() { return true; },
                            canUndo: function() { return true; },
                            getLabel: function() { return "Set Access Type"; }
                        });
                        compound.add(new SetAccessCmd());
                    })(rel, operation.accessType);
                }

                // Set strength for influence relationships
                if (operation.strength !== undefined && typeof rel.setStrength === 'function') {
                    var strengthPkgCreate = pkg.getInfluenceRelationship_Strength();
                    var strengthCmdCreate = new EObjectFeatureCommand(
                        "Set Influence Strength",
                        rel,
                        strengthPkgCreate,
                        operation.strength
                    );
                    compound.add(strengthCmdCreate);
                }

                // Add to folder
                var relFolder = getFolderForType(model, operation.type);
                var relAddCmd = createAddToFolderCommand(
                    "Add Relationship",
                    relFolder,
                    rel
                );
                compound.add(relAddCmd);

                if (operation.tempId) {
                    idMap[operation.tempId] = rel;
                }
                relEndpoints[rel.getId()] = { src: source, tgt: target };

                results.push({
                    op: "createRelationship",
                    tempId: operation.tempId,
                    realId: rel.getId(),
                    type: operation.type,
                    source: source.getId(),
                    sourceName: source.getName ? source.getName() : '',
                    target: target.getId(),
                    targetName: target.getName ? target.getName() : '',
                    relationship: rel
                });

                // Track for post-execution verification
                createdRelationshipIds.push(rel.getId());
            }
            else if (operation.op === "setProperty") {
                var elem = idMap[operation.id] || findElementById(model, operation.id);
                if (!elem) {
                    throw new Error("Cannot find element: " + operation.id);
                }

                // Similar to setProperty but inline
                var props = elem.getProperties();
                var existing = null;

                for (var k = 0; k < props.size(); k++) {
                    var p = props.get(k);
                    if (p.getKey() === operation.key) {
                        existing = p;
                        break;
                    }
                }

                if (existing) {
                    var updateCmd = new EObjectFeatureCommand(
                        "Set Property",
                        existing,
                        pkg.getProperty_Value(),
                        operation.value
                    );
                    compound.add(updateCmd);
                } else {
                    var newProperty = factory.createProperty();

                    var propKeyCmd = new EObjectFeatureCommand(
                        "Set Key",
                        newProperty,
                        pkg.getProperty_Key(),
                        operation.key
                    );
                    compound.add(propKeyCmd);

                    var propValueCmd = new EObjectFeatureCommand(
                        "Set Value",
                        newProperty,
                        pkg.getProperty_Value(),
                        operation.value
                    );
                    compound.add(propValueCmd);

                    // Use IIFE to capture variables properly in closure
                    (function(capturedProps, capturedNewProp) {
                        var AddPropCmd = Java.extend(GEFCommand, {
                            execute: function() {
                                capturedProps.add(capturedNewProp);
                            },
                            undo: function() {
                                capturedProps.remove(capturedNewProp);
                            },
                            canExecute: function() {
                                return true;
                            },
                            canUndo: function() {
                                return true;
                            },
                            getLabel: function() {
                                return "Add Property";
                            }
                        });
                        compound.add(new AddPropCmd());
                    })(props, newProperty);
                }

                results.push({
                    op: "setProperty",
                    id: elem.getId(),
                    key: operation.key,
                    value: operation.value
                });
            }
            else if (operation.op === "updateElement") {
                // Update element name, documentation, and/or properties
                var elemToUpdate = idMap[operation.id] || findElementById(model, operation.id);
                if (!elemToUpdate) {
                    throw new Error("Cannot find element: " + operation.id);
                }

                // Track what was updated for the result
                var updated = { name: false, documentation: false, properties: [] };

                // Update name if provided
                if (operation.name !== undefined) {
                    var nameCmd = new EObjectFeatureCommand(
                        "Update Name",
                        elemToUpdate,
                        pkg.getNameable_Name(),
                        operation.name
                    );
                    compound.add(nameCmd);
                    updated.name = true;
                }

                // Update documentation if provided
                if (operation.documentation !== undefined) {
                    var docCmd = new EObjectFeatureCommand(
                        "Update Documentation",
                        elemToUpdate,
                        pkg.getDocumentable_Documentation(),
                        operation.documentation
                    );
                    compound.add(docCmd);
                    updated.documentation = true;
                }

                // Update properties if provided
                if (operation.properties) {
                    var propsToUpdate = elemToUpdate.getProperties();
                    
                    for (var propKey in operation.properties) {
                        if (!operation.properties.hasOwnProperty(propKey)) continue;
                        
                        var propValue = operation.properties[propKey];
                        var existingProp = null;

                        // Find existing property
                        for (var pi = 0; pi < propsToUpdate.size(); pi++) {
                            var prop = propsToUpdate.get(pi);
                            if (prop.getKey() === propKey) {
                                existingProp = prop;
                                break;
                            }
                        }

                        if (existingProp) {
                            // Update existing property value
                            var propUpdateCmd = new EObjectFeatureCommand(
                                "Update Property '" + propKey + "'",
                                existingProp,
                                pkg.getProperty_Value(),
                                propValue
                            );
                            compound.add(propUpdateCmd);
                        } else {
                            // Create new property
                            var newProp = factory.createProperty();
                            
                            var propKeyCmd = new EObjectFeatureCommand(
                                "Set Key",
                                newProp,
                                pkg.getProperty_Key(),
                                propKey
                            );
                            compound.add(propKeyCmd);

                            var propValCmd = new EObjectFeatureCommand(
                                "Set Value",
                                newProp,
                                pkg.getProperty_Value(),
                                propValue
                            );
                            compound.add(propValCmd);

                            // Use IIFE to capture variables properly in closure
                            (function(capturedProps, capturedNewProp) {
                                var AddNewPropCmd = Java.extend(GEFCommand, {
                                    execute: function() {
                                        capturedProps.add(capturedNewProp);
                                    },
                                    undo: function() {
                                        capturedProps.remove(capturedNewProp);
                                    },
                                    canExecute: function() { return true; },
                                    canUndo: function() { return true; },
                                    getLabel: function() { return "Add Property"; }
                                });
                                compound.add(new AddNewPropCmd());
                            })(propsToUpdate, newProp);
                        }
                        
                        updated.properties.push(propKey);
                    }
                }

                results.push({
                    op: "updateElement",
                    id: elemToUpdate.getId(),
                    name: operation.name !== undefined ? operation.name : elemToUpdate.getName(),
                    type: elemToUpdate.eClass().getName().replace(/([A-Z])/g, function(m) { return '-' + m.toLowerCase(); }).substring(1),
                    updated: updated
                });
            }
            else if (operation.op === "addToView") {
                // Add element to view at specified position using EMF
                var viewForAdd = idMap[operation.viewId] || findViewById(model, operation.viewId);
                if (!viewForAdd) {
                    throw new Error("Cannot find view: " + operation.viewId);
                }

                var elementToAdd = idMap[operation.elementId] || findElementById(model, operation.elementId);
                if (!elementToAdd) {
                    throw new Error("Cannot find element: " + operation.elementId);
                }

                // Resolve parent container: parentVisualId → visual object, else view root
                var addContainer = viewForAdd;
                var parentVisualIdForResult = null;
                if (operation.parentVisualId) {
                    var parentVisual = idMap[operation.parentVisualId] || findVisualObjectInView(viewForAdd, operation.parentVisualId);
                    if (!parentVisual) {
                        throw new Error("Cannot find parent visual object: " + operation.parentVisualId);
                    }
                    if (typeof parentVisual.getChildren !== "function") {
                        throw new Error("Visual object " + operation.parentVisualId + " cannot contain children");
                    }
                    addContainer = parentVisual;
                    parentVisualIdForResult = parentVisual.getId();
                }

                // Default dimensions — coordinates are relative to parent container
                var addX = typeof operation.x === "number" ? operation.x : 100;
                var addY = typeof operation.y === "number" ? operation.y : 100;
                var addWidth = typeof operation.width === "number" ? operation.width : 120;
                var addHeight = typeof operation.height === "number" ? operation.height : 55;

                // Create visual object using EMF factory
                var visualObj = factory.createDiagramModelArchimateObject();
                visualObj.setArchimateElement(elementToAdd);

                // Set bounds (relative to parent container)
                var bounds = factory.createBounds();
                bounds.setX(addX);
                bounds.setY(addY);
                bounds.setWidth(addWidth < 0 ? 120 : addWidth);
                bounds.setHeight(addHeight < 0 ? 55 : addHeight);
                visualObj.setBounds(bounds);

                // Create command to add to container (undoable)
                // IMPORTANT: Use IIFE to capture variables by value, not by reference
                // Without this, the closure would capture the last values from the loop
                (function(capturedContainer, capturedVisual) {
                    var AddToViewCmd = Java.extend(GEFCommand, {
                        execute: function() {
                            capturedContainer.getChildren().add(capturedVisual);
                        },
                        undo: function() {
                            capturedContainer.getChildren().remove(capturedVisual);
                        },
                        canExecute: function() { return true; },
                        canUndo: function() { return true; },
                        getLabel: function() { return "Add to View"; }
                    });
                    compound.add(new AddToViewCmd());
                })(addContainer, visualObj);

                // Store visual object in map for connection references
                if (operation.tempId) {
                    idMap[operation.tempId] = visualObj;
                }
                // Also store by visual object ID
                idMap[visualObj.getId()] = visualObj;
                // Index by view+element for auto-discovery during same-batch addConnectionToView
                var _eltId = elementToAdd.getId ? elementToAdd.getId() : elementToAdd.id;
                idMap["__vis_" + viewForAdd.getId() + "_" + _eltId] = visualObj;

                var addToViewResult = {
                    op: "addToView",
                    tempId: operation.tempId || null,
                    visualId: visualObj.getId(),
                    viewId: viewForAdd.getId(),
                    elementId: elementToAdd.getId ? elementToAdd.getId() : elementToAdd.id,
                    x: addX,
                    y: addY,
                    width: bounds.getWidth(),
                    height: bounds.getHeight()
                };
                if (parentVisualIdForResult) {
                    addToViewResult.parentVisualId = parentVisualIdForResult;
                }
                results.push(addToViewResult);
            }
            else if (operation.op === "nestInView") {
                // Move an existing visual object to be a child of another visual object
                // Implements jArchi's parent.add(object, x, y) pattern
                var viewForNest = idMap[operation.viewId] || findViewById(model, operation.viewId);
                if (!viewForNest) {
                    throw new Error("Cannot find view: " + operation.viewId);
                }

                var visualToNest = idMap[operation.visualId] || findVisualObjectInView(viewForNest, operation.visualId);
                if (!visualToNest) {
                    throw new Error("Cannot find visual object to nest: " + operation.visualId);
                }

                var nestParent = idMap[operation.parentVisualId] || findVisualObjectInView(viewForNest, operation.parentVisualId);
                if (!nestParent) {
                    throw new Error("Cannot find parent visual object: " + operation.parentVisualId);
                }
                if (typeof nestParent.getChildren !== "function") {
                    throw new Error("Visual object " + operation.parentVisualId + " cannot contain children");
                }

                // Prevent nesting into self
                if (visualToNest.getId() === nestParent.getId()) {
                    throw new Error("Cannot nest a visual object inside itself");
                }

                // Set new position relative to parent (optional, defaults to 10, 10)
                var nestX = typeof operation.x === "number" ? operation.x : 10;
                var nestY = typeof operation.y === "number" ? operation.y : 10;

                // Find current parent container for undo
                (function(capturedView, capturedVisual, capturedNewParent, capturedX, capturedY) {
                    // Snapshot old parent and old bounds for undo
                    var oldParent = null;
                    var oldBounds = capturedVisual.getBounds();

                    var NestCmd = Java.extend(GEFCommand, {
                        execute: function() {
                            // Find current parent (view or another container)
                            oldParent = capturedVisual.eContainer();
                            // Remove from current parent
                            if (oldParent && typeof oldParent.getChildren === "function") {
                                oldParent.getChildren().remove(capturedVisual);
                            }
                            // Set new bounds relative to new parent
                            var newBounds = factory.createBounds();
                            newBounds.setX(capturedX);
                            newBounds.setY(capturedY);
                            newBounds.setWidth(oldBounds.getWidth());
                            newBounds.setHeight(oldBounds.getHeight());
                            capturedVisual.setBounds(newBounds);
                            // Add to new parent
                            capturedNewParent.getChildren().add(capturedVisual);
                        },
                        undo: function() {
                            // Remove from new parent
                            capturedNewParent.getChildren().remove(capturedVisual);
                            // Restore old bounds
                            capturedVisual.setBounds(oldBounds);
                            // Add back to old parent
                            if (oldParent && typeof oldParent.getChildren === "function") {
                                oldParent.getChildren().add(capturedVisual);
                            }
                        },
                        canExecute: function() { return true; },
                        canUndo: function() { return true; },
                        getLabel: function() { return "Nest in View"; }
                    });
                    compound.add(new NestCmd());
                })(viewForNest, visualToNest, nestParent, nestX, nestY);

                results.push({
                    op: "nestInView",
                    visualId: visualToNest.getId(),
                    parentVisualId: nestParent.getId(),
                    viewId: viewForNest.getId(),
                    x: nestX,
                    y: nestY
                });
            }
            else if (operation.op === "addConnectionToView") {
                // Add relationship as visual connection using EMF
                var viewForConn = idMap[operation.viewId] || findViewById(model, operation.viewId);
                if (!viewForConn) {
                    throw new Error("Cannot find view: " + operation.viewId);
                }

                var relationship = idMap[operation.relationshipId] || findElementById(model, operation.relationshipId);
                if (!relationship) {
                    throw new Error("Cannot find relationship: " + operation.relationshipId);
                }

                // Find source and target visual objects
                var sourceVisual = null;
                var targetVisual = null;
                var autoResolved = false;

                if (!operation.autoResolveVisuals) {
                    // Explicit mode: look up by provided visual IDs
                    sourceVisual = idMap[operation.sourceVisualId];
                    targetVisual = idMap[operation.targetVisualId];

                    // If not in idMap, search in view children by explicit visual ID
                    if (!sourceVisual && operation.sourceVisualId) {
                        sourceVisual = findVisualObjectInView(viewForConn, operation.sourceVisualId);
                    }
                    if (!targetVisual && operation.targetVisualId) {
                        targetVisual = findVisualObjectInView(viewForConn, operation.targetVisualId);
                    }
                }

                // Auto-discover: find visuals by matching the relationship's source/target
                // element IDs. When autoResolveVisuals is true this is the primary mechanism;
                // otherwise it is a fallback for missing explicit IDs.
                // First check idMap index (works within same batch),
                // then fall back to iterating already-committed view children.
                if (!sourceVisual || !targetVisual) {
                    // Use relEndpoints cache for same-batch relationships (getSource/getTarget
                    // return null until the compound command actually executes)
                    var _ep = relEndpoints[relationship.getId()];
                    var relSrcId = _ep ? (_ep.src.getId ? _ep.src.getId() : null)
                                       : (relationship.getSource() ? relationship.getSource().getId() : null);
                    var relTgtId = _ep ? (_ep.tgt.getId ? _ep.tgt.getId() : null)
                                       : (relationship.getTarget() ? relationship.getTarget().getId() : null);
                    var viewConnId = viewForConn.getId();
                    if (!sourceVisual && relSrcId) {
                        sourceVisual = idMap["__vis_" + viewConnId + "_" + relSrcId];
                    }
                    if (!targetVisual && relTgtId) {
                        targetVisual = idMap["__vis_" + viewConnId + "_" + relTgtId];
                    }
                    // Fall back to searching committed view children
                    if (!sourceVisual || !targetVisual) {
                        var autoChildren = viewForConn.getChildren();
                        for (var avi = 0; avi < autoChildren.size(); avi++) {
                            var avc = autoChildren.get(avi);
                            if (typeof avc.getArchimateElement === "function") {
                                var avel = avc.getArchimateElement();
                                if (avel) {
                                    var avelId = avel.getId();
                                    if (!sourceVisual && avelId === relSrcId) { sourceVisual = avc; }
                                    if (!targetVisual && avelId === relTgtId) { targetVisual = avc; }
                                }
                            }
                        }
                    }
                    if (sourceVisual && targetVisual) {
                        autoResolved = true;
                    }
                }

                if (!sourceVisual || !targetVisual) {
                    // Source or target element not present in this view — skip gracefully
                    results.push({
                        op: "addConnectionToView",
                        skipped: true,
                        reason: (!sourceVisual ? "source" : "target") + " element not in view",
                        relationshipId: operation.relationshipId
                    });
                    continue;
                }

                // Direction validation: ensure visual source/target match relationship source/target
                var relSource = relationship.getSource();
                var relTarget = relationship.getTarget();
                var sourceElem = typeof sourceVisual.getArchimateElement === 'function' ? sourceVisual.getArchimateElement() : null;
                var targetElem = typeof targetVisual.getArchimateElement === 'function' ? targetVisual.getArchimateElement() : null;

                if (sourceElem && targetElem && relSource && relTarget) {
                    var sourceElemId = sourceElem.getId ? sourceElem.getId() : sourceElem.id;
                    var targetElemId = targetElem.getId ? targetElem.getId() : targetElem.id;
                    var relSourceId = relSource.getId ? relSource.getId() : relSource.id;
                    var relTargetId = relTarget.getId ? relTarget.getId() : relTarget.id;

                    if (sourceElemId !== relSourceId || targetElemId !== relTargetId) {
                        // Check if it's a swap (visual is reversed)
                        if (sourceElemId === relTargetId && targetElemId === relSourceId) {
                            // R6: Auto-swap direction if requested
                            if (operation.autoSwapDirection) {
                                var tmpVisual = sourceVisual;
                                sourceVisual = targetVisual;
                                targetVisual = tmpVisual;
                            } else {
                                throw new Error(
                                    "Direction mismatch: visual source/target are swapped vs relationship. " +
                                    "Relationship: '" + (relSource.getName ? relSource.getName() : relSourceId) + "' → '" + 
                                    (relTarget.getName ? relTarget.getName() : relTargetId) + "'. " +
                                    "Visual: '" + (sourceElem.getName ? sourceElem.getName() : sourceElemId) + "' → '" + 
                                    (targetElem.getName ? targetElem.getName() : targetElemId) + "'. " +
                                    "Swap sourceVisualId and targetVisualId to match relationship direction, " +
                                    "or set autoSwapDirection: true."
                                );
                            }
                        } else {
                            throw new Error(
                                "Direction mismatch: visual elements do not match relationship source/target. " +
                                "Relationship connects '" + (relSource.getName ? relSource.getName() : relSourceId) + "' → '" + 
                                (relTarget.getName ? relTarget.getName() : relTargetId) + "', but visual objects represent '" +
                                (sourceElem.getName ? sourceElem.getName() : sourceElemId) + "' → '" + 
                                (targetElem.getName ? targetElem.getName() : targetElemId) + "'."
                            );
                        }
                    }
                }

                // Create visual connection using EMF factory
                var connection = factory.createDiagramModelArchimateConnection();
                connection.setArchimateRelationship(relationship);
                connection.setSource(sourceVisual);
                connection.setTarget(targetVisual);

                // Create command to add connection (undoable)
                // CRITICAL: Must add to BOTH sourceConnections AND targetConnections
                // - sourceConnections is the EMF containment list (for persistence)
                // - targetConnections is needed for GEF/Archi renderer to anchor endpoints
                // This mirrors what connect()/reconnect() does internally in Archi
                // IMPORTANT: Use IIFE to capture variables by value, not by reference
                (function(capturedSource, capturedTarget, capturedConnection) {
                    var AddConnectionCmd = Java.extend(GEFCommand, {
                        execute: function() {
                            capturedSource.getSourceConnections().add(capturedConnection);
                            capturedTarget.getTargetConnections().add(capturedConnection);
                        },
                        undo: function() {
                            capturedTarget.getTargetConnections().remove(capturedConnection);
                            capturedSource.getSourceConnections().remove(capturedConnection);
                        },
                        canExecute: function() { return true; },
                        canUndo: function() { return true; },
                        getLabel: function() { return "Add Connection to View"; }
                    });
                    compound.add(new AddConnectionCmd());
                })(sourceVisual, targetVisual, connection);

                var connResult = {
                    op: "addConnectionToView",
                    connectionId: connection.getId(),
                    viewId: viewForConn.getId(),
                    relationshipId: relationship.getId ? relationship.getId() : relationship.id,
                    sourceVisualId: sourceVisual.getId ? sourceVisual.getId() : sourceVisual.id,
                    targetVisualId: targetVisual.getId ? targetVisual.getId() : targetVisual.id
                };
                if (autoResolved) {
                    connResult.autoResolved = true;
                }
                results.push(connResult);
            }
            else if (operation.op === "deleteConnectionFromView") {
                // Delete a visual connection from a view
                var viewForConnDel = findViewById(model, operation.viewId);
                if (!viewForConnDel) {
                    throw new Error("Cannot find view: " + operation.viewId);
                }

                var connToDelete = findConnectionInView(viewForConnDel, operation.connectionId);
                if (!connToDelete) {
                    throw new Error("Cannot find connection in view: " + operation.connectionId);
                }

                // Capture references for undo
                var connSource = connToDelete.getSource();
                var connTarget = connToDelete.getTarget();
                var connId = connToDelete.getId();
                var connRelId = null;
                if (typeof connToDelete.getArchimateRelationship === 'function' && connToDelete.getArchimateRelationship()) {
                    connRelId = connToDelete.getArchimateRelationship().getId();
                }

                // Use IIFE to capture variables
                (function(capturedConn, capturedSource, capturedTarget) {
                    var DeleteConnCmd = Java.extend(GEFCommand, {
                        execute: function() {
                            // Remove from both source and target connection lists
                            if (capturedSource && typeof capturedSource.getSourceConnections === 'function') {
                                capturedSource.getSourceConnections().remove(capturedConn);
                            }
                            if (capturedTarget && typeof capturedTarget.getTargetConnections === 'function') {
                                capturedTarget.getTargetConnections().remove(capturedConn);
                            }
                        },
                        undo: function() {
                            // Re-add to both source and target connection lists
                            if (capturedSource && typeof capturedSource.getSourceConnections === 'function') {
                                capturedSource.getSourceConnections().add(capturedConn);
                            }
                            if (capturedTarget && typeof capturedTarget.getTargetConnections === 'function') {
                                capturedTarget.getTargetConnections().add(capturedConn);
                            }
                        },
                        canExecute: function() { return true; },
                        canUndo: function() { return true; },
                        getLabel: function() { return "Delete Connection from View"; }
                    });
                    compound.add(new DeleteConnCmd());
                })(connToDelete, connSource, connTarget);

                results.push({
                    op: "deleteConnectionFromView",
                    connectionId: connId,
                    viewId: viewForConnDel.getId(),
                    relationshipId: connRelId
                });
            }
            else if (operation.op === "deleteElement") {
                // Delete element with full undo support via manual cascade
                var elemToDelete = idMap[operation.id] || findElementById(model, operation.id);
                if (!elemToDelete) {
                    throw new Error("Cannot find element to delete: " + operation.id);
                }

                var elemName = elemToDelete.getName ? elemToDelete.getName() : '';
                var elemId = elemToDelete.getId();
                var doCascade = operation.cascade !== false;

                if (doCascade) {
                    // Step 1: Find and remove all relationships where this element is source or target
                    var relRefs = findRelationshipsForElement(model, elemId);
                    for (var ri = 0; ri < relRefs.length; ri++) {
                        var relRef = relRefs[ri];
                        var rel = relRef.relationship;
                        var relFolder = relRef.parentFolder;

                        // Step 1a: Remove all visual connections for this relationship across all views
                        var allViews = findAllViews(model);
                        for (var vi = 0; vi < allViews.length; vi++) {
                            var connRefs = findConnectionsForRelationship(allViews[vi], rel.getId());
                            for (var ci = 0; ci < connRefs.length; ci++) {
                                (function(capturedConn, capturedSrc, capturedTgt) {
                                    var RemoveConnCmd = Java.extend(GEFCommand, {
                                        execute: function() {
                                            if (capturedSrc && typeof capturedSrc.getSourceConnections === 'function') {
                                                capturedSrc.getSourceConnections().remove(capturedConn);
                                            }
                                            if (capturedTgt && typeof capturedTgt.getTargetConnections === 'function') {
                                                capturedTgt.getTargetConnections().remove(capturedConn);
                                            }
                                        },
                                        undo: function() {
                                            if (capturedSrc && typeof capturedSrc.getSourceConnections === 'function') {
                                                capturedSrc.getSourceConnections().add(capturedConn);
                                            }
                                            if (capturedTgt && typeof capturedTgt.getTargetConnections === 'function') {
                                                capturedTgt.getTargetConnections().add(capturedConn);
                                            }
                                        },
                                        canExecute: function() { return true; },
                                        canUndo: function() { return true; },
                                        getLabel: function() { return "Remove connection from view"; }
                                    });
                                    compound.add(new RemoveConnCmd());
                                })(connRefs[ci].connection, connRefs[ci].source, connRefs[ci].target);
                            }
                        }

                        // Step 1b: Remove the relationship from its folder
                        (function(capturedRel, capturedFolder) {
                            var RemoveRelCmd = Java.extend(GEFCommand, {
                                execute: function() {
                                    if (capturedFolder && typeof capturedFolder.getElements === 'function') {
                                        capturedFolder.getElements().remove(capturedRel);
                                    }
                                },
                                undo: function() {
                                    if (capturedFolder && typeof capturedFolder.getElements === 'function') {
                                        capturedFolder.getElements().add(capturedRel);
                                    }
                                },
                                canExecute: function() { return true; },
                                canUndo: function() { return true; },
                                getLabel: function() { return "Remove relationship"; }
                            });
                            compound.add(new RemoveRelCmd());
                        })(rel, relFolder);
                    }

                    // Step 2: Remove all visual objects for this element across all views
                    var allViewsForElem = findAllViews(model);
                    for (var vei = 0; vei < allViewsForElem.length; vei++) {
                        var visualRefs = findVisualsForElement(allViewsForElem[vei], elemId);
                        for (var vri = 0; vri < visualRefs.length; vri++) {
                            // First remove any connections attached to this visual
                            var attachedConns = findConnectionsForVisual(visualRefs[vri].visual);
                            for (var aci = 0; aci < attachedConns.length; aci++) {
                                (function(capturedConn, capturedSrc, capturedTgt) {
                                    var RemoveAttConnCmd = Java.extend(GEFCommand, {
                                        execute: function() {
                                            if (capturedSrc && typeof capturedSrc.getSourceConnections === 'function') {
                                                capturedSrc.getSourceConnections().remove(capturedConn);
                                            }
                                            if (capturedTgt && typeof capturedTgt.getTargetConnections === 'function') {
                                                capturedTgt.getTargetConnections().remove(capturedConn);
                                            }
                                        },
                                        undo: function() {
                                            if (capturedSrc && typeof capturedSrc.getSourceConnections === 'function') {
                                                capturedSrc.getSourceConnections().add(capturedConn);
                                            }
                                            if (capturedTgt && typeof capturedTgt.getTargetConnections === 'function') {
                                                capturedTgt.getTargetConnections().add(capturedConn);
                                            }
                                        },
                                        canExecute: function() { return true; },
                                        canUndo: function() { return true; },
                                        getLabel: function() { return "Remove attached connection"; }
                                    });
                                    compound.add(new RemoveAttConnCmd());
                                })(attachedConns[aci].connection, attachedConns[aci].source, attachedConns[aci].target);
                            }

                            // Then remove the visual object from its parent
                            (function(capturedVisual, capturedContainer) {
                                var RemoveVisualCmd = Java.extend(GEFCommand, {
                                    execute: function() {
                                        if (capturedContainer && typeof capturedContainer.getChildren === 'function') {
                                            capturedContainer.getChildren().remove(capturedVisual);
                                        }
                                    },
                                    undo: function() {
                                        if (capturedContainer && typeof capturedContainer.getChildren === 'function') {
                                            capturedContainer.getChildren().add(capturedVisual);
                                        }
                                    },
                                    canExecute: function() { return true; },
                                    canUndo: function() { return true; },
                                    getLabel: function() { return "Remove visual from view"; }
                                });
                                compound.add(new RemoveVisualCmd());
                            })(visualRefs[vri].visual, visualRefs[vri].parent);
                        }
                    }
                }

                // Step 3: Remove the element itself from its parent folder
                // NOTE: eContainer() is evaluated lazily inside execute/undo because the
                // element may have been created in the same batch (parent not yet assigned
                // until compound executes).
                (function(capturedElem, capturedId) {
                    var DeleteCmd = Java.extend(GEFCommand, {
                        execute: function() {
                            var capturedParent = capturedElem.eContainer();
                            if (capturedParent && typeof capturedParent.getElements === 'function') {
                                capturedParent.getElements().remove(capturedElem);
                            }
                        },
                        undo: function() {
                            var capturedParent = capturedElem.eContainer();
                            if (capturedParent && typeof capturedParent.getElements === 'function') {
                                capturedParent.getElements().add(capturedElem);
                            }
                        },
                        canExecute: function() { return true; },
                        canUndo: function() { return true; },
                        getLabel: function() { return "Delete " + capturedId; }
                    });
                    compound.add(new DeleteCmd());
                })(elemToDelete, elemId);

                results.push({
                    op: "deleteElement",
                    id: elemId,
                    name: elemName,
                    cascade: doCascade
                });
            }
            else if (operation.op === "deleteRelationship") {
                // Delete relationship with full undo support via manual cascade
                var relToDelete = idMap[operation.id] || findElementById(model, operation.id);
                if (!relToDelete) {
                    throw new Error("Cannot find relationship to delete: " + operation.id);
                }

                var relName = relToDelete.getName ? relToDelete.getName() : '';
                var relId = relToDelete.getId();

                // Step 1: Remove all visual connections for this relationship across all views
                var allViewsForRel = findAllViews(model);
                for (var vrdi = 0; vrdi < allViewsForRel.length; vrdi++) {
                    var relConnRefs = findConnectionsForRelationship(allViewsForRel[vrdi], relId);
                    for (var vrci = 0; vrci < relConnRefs.length; vrci++) {
                        (function(capturedConn, capturedSrc, capturedTgt) {
                            var RemoveRelConnCmd = Java.extend(GEFCommand, {
                                execute: function() {
                                    if (capturedSrc && typeof capturedSrc.getSourceConnections === 'function') {
                                        capturedSrc.getSourceConnections().remove(capturedConn);
                                    }
                                    if (capturedTgt && typeof capturedTgt.getTargetConnections === 'function') {
                                        capturedTgt.getTargetConnections().remove(capturedConn);
                                    }
                                },
                                undo: function() {
                                    if (capturedSrc && typeof capturedSrc.getSourceConnections === 'function') {
                                        capturedSrc.getSourceConnections().add(capturedConn);
                                    }
                                    if (capturedTgt && typeof capturedTgt.getTargetConnections === 'function') {
                                        capturedTgt.getTargetConnections().add(capturedConn);
                                    }
                                },
                                canExecute: function() { return true; },
                                canUndo: function() { return true; },
                                getLabel: function() { return "Remove connection from view"; }
                            });
                            compound.add(new RemoveRelConnCmd());
                        })(relConnRefs[vrci].connection, relConnRefs[vrci].source, relConnRefs[vrci].target);
                    }
                }

                // Step 2: Remove the relationship from its parent folder
                // NOTE: eContainer() evaluated lazily — relationship may have been created
                // in the same batch and not yet inserted into its folder.
                (function(capturedRel, capturedId) {
                    var DeleteRelCmd = Java.extend(GEFCommand, {
                        execute: function() {
                            var capturedParent = capturedRel.eContainer();
                            if (capturedParent && typeof capturedParent.getElements === 'function') {
                                capturedParent.getElements().remove(capturedRel);
                            }
                        },
                        undo: function() {
                            var capturedParent = capturedRel.eContainer();
                            if (capturedParent && typeof capturedParent.getElements === 'function') {
                                capturedParent.getElements().add(capturedRel);
                            }
                        },
                        canExecute: function() { return true; },
                        canUndo: function() { return true; },
                        getLabel: function() { return "Delete Relationship " + capturedId; }
                    });
                    compound.add(new DeleteRelCmd());
                })(relToDelete, relId);

                results.push({
                    op: "deleteRelationship",
                    id: relId,
                    name: relName
                });
            }
            else if (operation.op === "updateRelationship") {
                // Update relationship properties (accessType, strength, name, doc)
                var relToUpdate = idMap[operation.id] || findElementById(model, operation.id);
                if (!relToUpdate) {
                    throw new Error("Cannot find relationship: " + operation.id);
                }

                var relUpdated = { accessType: false, strength: false, name: false, documentation: false };

                // Update name if provided
                if (operation.name !== undefined) {
                    var relNameCmd = new EObjectFeatureCommand(
                        "Update Relationship Name",
                        relToUpdate,
                        pkg.getNameable_Name(),
                        operation.name
                    );
                    compound.add(relNameCmd);
                    relUpdated.name = true;
                }

                // Update documentation if provided
                if (operation.documentation !== undefined) {
                    var relDocCmd = new EObjectFeatureCommand(
                        "Update Relationship Documentation",
                        relToUpdate,
                        pkg.getDocumentable_Documentation(),
                        operation.documentation
                    );
                    compound.add(relDocCmd);
                    relUpdated.documentation = true;
                }

                // R4: Update accessType for access relationships using direct setter
                if (operation.accessType !== undefined && typeof relToUpdate.setAccessType === 'function') {
                    (function(capturedRel, capturedAccessType) {
                        var oldAccessType = capturedRel.getAccessType();
                        var SetAccessCmd = Java.extend(GEFCommand, {
                            execute: function() { capturedRel.setAccessType(capturedAccessType); },
                            undo: function() { capturedRel.setAccessType(oldAccessType); },
                            canExecute: function() { return true; },
                            canUndo: function() { return true; },
                            getLabel: function() { return "Set Access Type"; }
                        });
                        compound.add(new SetAccessCmd());
                    })(relToUpdate, operation.accessType);
                    relUpdated.accessType = true;
                }

                // Update strength for influence relationships
                if (operation.strength !== undefined && typeof relToUpdate.setStrength === 'function') {
                    var strengthPkg = pkg.getInfluenceRelationship_Strength();
                    var strengthCmd = new EObjectFeatureCommand(
                        "Set Influence Strength",
                        relToUpdate,
                        strengthPkg,
                        operation.strength
                    );
                    compound.add(strengthCmd);
                    relUpdated.strength = true;
                }

                results.push({
                    op: "updateRelationship",
                    id: relToUpdate.getId(),
                    updated: relUpdated
                });
            }
            else if (operation.op === "moveToFolder") {
                // Move element to a different folder
                var elemToMove = idMap[operation.id] || findElementById(model, operation.id);
                if (!elemToMove) {
                    throw new Error("Cannot find element to move: " + operation.id);
                }

                var targetFolder = findFolderById(model, operation.folderId);
                if (!targetFolder) {
                    throw new Error("Cannot find target folder: " + operation.folderId);
                }

                var sourceFolder = elemToMove.eContainer();
                
                (function(capturedElem, capturedSource, capturedTarget) {
                    var MoveCmd = Java.extend(GEFCommand, {
                        execute: function() {
                            if (capturedSource && typeof capturedSource.getElements === 'function') {
                                capturedSource.getElements().remove(capturedElem);
                            }
                            capturedTarget.getElements().add(capturedElem);
                        },
                        undo: function() {
                            capturedTarget.getElements().remove(capturedElem);
                            if (capturedSource && typeof capturedSource.getElements === 'function') {
                                capturedSource.getElements().add(capturedElem);
                            }
                        },
                        canExecute: function() { return true; },
                        canUndo: function() { return true; },
                        getLabel: function() { return "Move to Folder"; }
                    });
                    compound.add(new MoveCmd());
                })(elemToMove, sourceFolder, targetFolder);

                results.push({
                    op: "moveToFolder",
                    id: elemToMove.getId(),
                    folderId: targetFolder.getId(),
                    folderName: targetFolder.getName() || ''
                });
            }
            else if (operation.op === "createFolder") {
                // Create a new folder
                var parentFolder = null;
                if (operation.parentId) {
                    parentFolder = findFolderById(model, operation.parentId);
                    if (!parentFolder) {
                        throw new Error("Cannot find parent folder: " + operation.parentId);
                    }
                } else if (operation.parentType) {
                    // Find folder by type (e.g., "BUSINESS", "APPLICATION")
                    parentFolder = getFolderByType(model, operation.parentType);
                }
                if (!parentFolder) {
                    throw new Error("Must specify parentId or parentType for createFolder");
                }

                var newFolder = factory.createFolder();
                newFolder.setName(operation.name || "New Folder");
                if (operation.documentation) {
                    newFolder.setDocumentation(operation.documentation);
                }

                (function(capturedParent, capturedFolder) {
                    var CreateFolderCmd = Java.extend(GEFCommand, {
                        execute: function() {
                            capturedParent.getFolders().add(capturedFolder);
                        },
                        undo: function() {
                            capturedParent.getFolders().remove(capturedFolder);
                        },
                        canExecute: function() { return true; },
                        canUndo: function() { return true; },
                        getLabel: function() { return "Create Folder"; }
                    });
                    compound.add(new CreateFolderCmd());
                })(parentFolder, newFolder);

                if (operation.tempId) {
                    idMap[operation.tempId] = newFolder;
                }

                results.push({
                    op: "createFolder",
                    tempId: operation.tempId || null,
                    folderId: newFolder.getId(),
                    folderName: newFolder.getName(),
                    parentId: parentFolder.getId()
                });
            }
            else if (operation.op === "styleViewObject") {
                // Style a visual object in a view
                // Use viewObjectId (from API schema) or visualId (legacy)
                var visualObjId = operation.viewObjectId || operation.visualId;
                var visualToStyle = idMap[visualObjId] || findVisualObjectInModel(model, visualObjId);
                if (!visualToStyle) {
                    throw new Error("Cannot find visual object: " + visualObjId);
                }

                var styleUpdated = [];

                // fillColor (format: "#RRGGBB")
                if (operation.fillColor !== undefined) {
                    var fillColorStr = normalizeColorString(operation.fillColor);
                    (function(capturedObj, capturedColor) {
                        var oldColor = capturedObj.getFillColor();
                        var SetFillCmd = Java.extend(GEFCommand, {
                            execute: function() { capturedObj.setFillColor(capturedColor); },
                            undo: function() { capturedObj.setFillColor(oldColor); },
                            canExecute: function() { return true; },
                            canUndo: function() { return true; },
                            getLabel: function() { return "Set Fill Color"; }
                        });
                        compound.add(new SetFillCmd());
                    })(visualToStyle, fillColorStr);
                    styleUpdated.push("fillColor");
                }

                // lineColor
                if (operation.lineColor !== undefined) {
                    var lineColorStr = normalizeColorString(operation.lineColor);
                    (function(capturedObj, capturedColor) {
                        var oldColor = capturedObj.getLineColor();
                        var SetLineCmd = Java.extend(GEFCommand, {
                            execute: function() { capturedObj.setLineColor(capturedColor); },
                            undo: function() { capturedObj.setLineColor(oldColor); },
                            canExecute: function() { return true; },
                            canUndo: function() { return true; },
                            getLabel: function() { return "Set Line Color"; }
                        });
                        compound.add(new SetLineCmd());
                    })(visualToStyle, lineColorStr);
                    styleUpdated.push("lineColor");
                }

                // fontColor
                if (operation.fontColor !== undefined) {
                    var fontColorStr = normalizeColorString(operation.fontColor);
                    (function(capturedObj, capturedColor) {
                        var oldColor = capturedObj.getFontColor();
                        var SetFontColorCmd = Java.extend(GEFCommand, {
                            execute: function() { capturedObj.setFontColor(capturedColor); },
                            undo: function() { capturedObj.setFontColor(oldColor); },
                            canExecute: function() { return true; },
                            canUndo: function() { return true; },
                            getLabel: function() { return "Set Font Color"; }
                        });
                        compound.add(new SetFontColorCmd());
                    })(visualToStyle, fontColorStr);
                    styleUpdated.push("fontColor");
                }

                // opacity (0-255)
                if (operation.opacity !== undefined) {
                    (function(capturedObj, capturedOpacity) {
                        var oldOpacity = capturedObj.getAlpha();
                        var SetOpacityCmd = Java.extend(GEFCommand, {
                            execute: function() { capturedObj.setAlpha(capturedOpacity); },
                            undo: function() { capturedObj.setAlpha(oldOpacity); },
                            canExecute: function() { return true; },
                            canUndo: function() { return true; },
                            getLabel: function() { return "Set Opacity"; }
                        });
                        compound.add(new SetOpacityCmd());
                    })(visualToStyle, operation.opacity);
                    styleUpdated.push("opacity");
                }

                // font (format: "fontName|height|style" e.g., "Arial|10|1" for bold)
                if (operation.font !== undefined) {
                    (function(capturedObj, capturedFont) {
                        var oldFont = capturedObj.getFont();
                        var SetFontCmd = Java.extend(GEFCommand, {
                            execute: function() { capturedObj.setFont(capturedFont); },
                            undo: function() { capturedObj.setFont(oldFont); },
                            canExecute: function() { return true; },
                            canUndo: function() { return true; },
                            getLabel: function() { return "Set Font"; }
                        });
                        compound.add(new SetFontCmd());
                    })(visualToStyle, operation.font);
                    styleUpdated.push("font");
                }

                results.push({
                    op: "styleViewObject",
                    visualId: visualToStyle.getId(),
                    updated: styleUpdated
                });
            }
            else if (operation.op === "styleConnection") {
                // Style a visual connection
                var connToStyle = findConnectionInModel(model, operation.connectionId);
                if (!connToStyle) {
                    throw new Error("Cannot find connection: " + operation.connectionId);
                }

                var connStyleUpdated = [];

                // lineColor
                if (operation.lineColor !== undefined) {
                    var connLineColorStr = normalizeColorString(operation.lineColor);
                    (function(capturedConn, capturedColor) {
                        var oldColor = capturedConn.getLineColor();
                        var SetConnLineCmd = Java.extend(GEFCommand, {
                            execute: function() { capturedConn.setLineColor(capturedColor); },
                            undo: function() { capturedConn.setLineColor(oldColor); },
                            canExecute: function() { return true; },
                            canUndo: function() { return true; },
                            getLabel: function() { return "Set Connection Line Color"; }
                        });
                        compound.add(new SetConnLineCmd());
                    })(connToStyle, connLineColorStr);
                    connStyleUpdated.push("lineColor");
                }

                // lineWidth
                if (operation.lineWidth !== undefined) {
                    (function(capturedConn, capturedWidth) {
                        var oldWidth = capturedConn.getLineWidth();
                        var SetLineWidthCmd = Java.extend(GEFCommand, {
                            execute: function() { capturedConn.setLineWidth(capturedWidth); },
                            undo: function() { capturedConn.setLineWidth(oldWidth); },
                            canExecute: function() { return true; },
                            canUndo: function() { return true; },
                            getLabel: function() { return "Set Line Width"; }
                        });
                        compound.add(new SetLineWidthCmd());
                    })(connToStyle, operation.lineWidth);
                    connStyleUpdated.push("lineWidth");
                }

                // fontColor
                if (operation.fontColor !== undefined) {
                    if (typeof connToStyle.getFontColor !== 'function' || typeof connToStyle.setFontColor !== 'function') {
                        if (typeof loggingQueue !== "undefined" && loggingQueue) {
                            loggingQueue.log("[batch] styleConnection: fontColor not supported on this connection type");
                        }
                    } else {
                        var connFontColorStr = normalizeColorString(operation.fontColor);
                        (function(capturedConn, capturedColor) {
                            var oldColor = capturedConn.getFontColor();
                            var SetConnFontColorCmd = Java.extend(GEFCommand, {
                                execute: function() { capturedConn.setFontColor(capturedColor); },
                                undo: function() { capturedConn.setFontColor(oldColor); },
                                canExecute: function() { return true; },
                                canUndo: function() { return true; },
                                getLabel: function() { return "Set Connection Font Color"; }
                            });
                            compound.add(new SetConnFontColorCmd());
                        })(connToStyle, connFontColorStr);
                        connStyleUpdated.push("fontColor");
                    }
                }

                // textPosition (0=source, 1=middle, 2=target)
                if (operation.textPosition !== undefined) {
                    (function(capturedConn, capturedPos) {
                        var oldPos = capturedConn.getTextPosition();
                        var SetTextPosCmd = Java.extend(GEFCommand, {
                            execute: function() { capturedConn.setTextPosition(capturedPos); },
                            undo: function() { capturedConn.setTextPosition(oldPos); },
                            canExecute: function() { return true; },
                            canUndo: function() { return true; },
                            getLabel: function() { return "Set Text Position"; }
                        });
                        compound.add(new SetTextPosCmd());
                    })(connToStyle, operation.textPosition);
                    connStyleUpdated.push("textPosition");
                }

                results.push({
                    op: "styleConnection",
                    connectionId: connToStyle.getId(),
                    updated: connStyleUpdated
                });
            }
            else if (operation.op === "moveViewObject") {
                // Move/resize a visual object in a view
                // Use viewObjectId (from API schema) or visualId (legacy)
                var moveVisualId = operation.viewObjectId || operation.visualId;
                var visualToMove = idMap[moveVisualId] || findVisualObjectInModel(model, moveVisualId);
                if (!visualToMove) {
                    throw new Error("Cannot find visual object: " + moveVisualId);
                }

                var currentBounds = visualToMove.getBounds();
                var newX = operation.x !== undefined ? operation.x : currentBounds.getX();
                var newY = operation.y !== undefined ? operation.y : currentBounds.getY();
                var newWidth = operation.width !== undefined ? operation.width : currentBounds.getWidth();
                var newHeight = operation.height !== undefined ? operation.height : currentBounds.getHeight();

                (function(capturedObj, capturedOldBounds, capturedNewX, capturedNewY, capturedNewW, capturedNewH) {
                    var MoveResizeCmd = Java.extend(GEFCommand, {
                        execute: function() {
                            var newBounds = factory.createBounds();
                            newBounds.setX(capturedNewX);
                            newBounds.setY(capturedNewY);
                            newBounds.setWidth(capturedNewW);
                            newBounds.setHeight(capturedNewH);
                            capturedObj.setBounds(newBounds);
                        },
                        undo: function() {
                            capturedObj.setBounds(capturedOldBounds);
                        },
                        canExecute: function() { return true; },
                        canUndo: function() { return true; },
                        getLabel: function() { return "Move/Resize"; }
                    });
                    compound.add(new MoveResizeCmd());
                })(visualToMove, currentBounds, newX, newY, newWidth, newHeight);

                results.push({
                    op: "moveViewObject",
                    visualId: visualToMove.getId(),
                    x: newX,
                    y: newY,
                    width: newWidth,
                    height: newHeight
                });
            }
            else if (operation.op === "createNote") {
                // Create a note in a view
                var viewForNote = idMap[operation.viewId] || findViewById(model, operation.viewId);
                if (!viewForNote) {
                    throw new Error("Cannot find view: " + operation.viewId);
                }

                var note = factory.createDiagramModelNote();
                note.setContent(operation.content || '');
                
                var noteBounds = factory.createBounds();
                noteBounds.setX(operation.x !== undefined ? operation.x : 100);
                noteBounds.setY(operation.y !== undefined ? operation.y : 100);
                noteBounds.setWidth(operation.width !== undefined ? operation.width : 185);
                noteBounds.setHeight(operation.height !== undefined ? operation.height : 80);
                note.setBounds(noteBounds);

                (function(capturedView, capturedNote) {
                    var AddNoteCmd = Java.extend(GEFCommand, {
                        execute: function() { capturedView.getChildren().add(capturedNote); },
                        undo: function() { capturedView.getChildren().remove(capturedNote); },
                        canExecute: function() { return true; },
                        canUndo: function() { return true; },
                        getLabel: function() { return "Add Note"; }
                    });
                    compound.add(new AddNoteCmd());
                })(viewForNote, note);

                if (operation.tempId) {
                    idMap[operation.tempId] = note;
                }

                results.push({
                    op: "createNote",
                    tempId: operation.tempId || null,
                    noteId: note.getId(),
                    viewId: viewForNote.getId()
                });
            }
            else if (operation.op === "createGroup") {
                // Create a visual group in a view
                var viewForGroup = idMap[operation.viewId] || findViewById(model, operation.viewId);
                if (!viewForGroup) {
                    throw new Error("Cannot find view: " + operation.viewId);
                }

                var group = factory.createDiagramModelGroup();
                group.setName(operation.name || '');
                if (operation.documentation) {
                    group.setDocumentation(operation.documentation);
                }

                var groupBounds = factory.createBounds();
                groupBounds.setX(operation.x !== undefined ? operation.x : 100);
                groupBounds.setY(operation.y !== undefined ? operation.y : 100);
                groupBounds.setWidth(operation.width !== undefined ? operation.width : 400);
                groupBounds.setHeight(operation.height !== undefined ? operation.height : 300);
                group.setBounds(groupBounds);

                (function(capturedView, capturedGroup) {
                    var AddGroupCmd = Java.extend(GEFCommand, {
                        execute: function() { capturedView.getChildren().add(capturedGroup); },
                        undo: function() { capturedView.getChildren().remove(capturedGroup); },
                        canExecute: function() { return true; },
                        canUndo: function() { return true; },
                        getLabel: function() { return "Add Group"; }
                    });
                    compound.add(new AddGroupCmd());
                })(viewForGroup, group);

                if (operation.tempId) {
                    idMap[operation.tempId] = group;
                }

                results.push({
                    op: "createGroup",
                    tempId: operation.tempId || null,
                    groupId: group.getId(),
                    viewId: viewForGroup.getId()
                });
            }
            // ================================================================
            // View management operations (Finding 3 fix)
            // ================================================================
            else if (operation.op === "createView") {
                // Create a new ArchiMate diagram view (undoable)
                var viewName = operation.name;
                if (!viewName) {
                    throw new Error("createView: missing 'name' field");
                }

                var newView = factory.createArchimateDiagramModel();
                newView.setName(viewName);
                if (operation.documentation) {
                    newView.setDocumentation(operation.documentation);
                }
                var viewpointId = null;
                if (operation.viewpoint !== undefined && operation.viewpoint !== null && String(operation.viewpoint).trim() !== "") {
                    viewpointId = normalizeViewpointId(operation.viewpoint);
                    if (!viewpointId) {
                        throw new Error("createView: invalid viewpoint format: " + operation.viewpoint);
                    }

                    var viewpointResolution = resolveViewpointById(viewpointId);
                    if (!viewpointResolution || !viewpointResolution.viewpoint) {
                        throw new Error("createView: unknown viewpoint: " + viewpointId);
                    }
                    viewpointId = viewpointResolution.id || viewpointId;

                    try {
                        newView.setViewpoint(viewpointId);
                    } catch (setVpErr) {
                        throw new Error("createView: failed to set viewpoint '" + viewpointId + "': " + setVpErr);
                    }
                }

                // Find target folder (Views/Diagrams folder by default)
                var targetViewFolder = null;
                if (operation.folderId) {
                    targetViewFolder = findElementById(model, operation.folderId);
                    if (!targetViewFolder) {
                        // Also check for folder by searching folders
                        targetViewFolder = findFolderById(model, operation.folderId);
                    }
                }
                if (!targetViewFolder) {
                    var modelFolders = model.getFolders();
                    for (var vfi = 0; vfi < modelFolders.size(); vfi++) {
                        if (modelFolders.get(vfi).getType() === FolderType.DIAGRAMS) {
                            targetViewFolder = modelFolders.get(vfi);
                            break;
                        }
                    }
                }
                if (!targetViewFolder) {
                    throw new Error("createView: could not find Views folder in model");
                }

                (function(capturedView, capturedFolder) {
                    var CreateViewCmd = Java.extend(GEFCommand, {
                        execute: function() { capturedFolder.getElements().add(capturedView); },
                        undo: function() { capturedFolder.getElements().remove(capturedView); },
                        canExecute: function() { return true; },
                        canUndo: function() { return true; },
                        getLabel: function() { return "Create View"; }
                    });
                    compound.add(new CreateViewCmd());
                })(newView, targetViewFolder);

                if (operation.tempId) {
                    idMap[operation.tempId] = newView;
                }

                results.push({
                    op: "createView",
                    tempId: operation.tempId || null,
                    viewId: newView.getId(),
                    viewName: newView.getName(),
                    viewpoint: viewpointId,
                    documentation: newView.getDocumentation ? newView.getDocumentation() : null
                });
            }
            else if (operation.op === "deleteView") {
                // Delete a view (undoable) - removes view from its parent folder
                var viewToDelete = idMap[operation.viewId] || findViewById(model, operation.viewId);
                if (!viewToDelete) {
                    throw new Error("deleteView: cannot find view: " + operation.viewId);
                }

                var delViewName = viewToDelete.getName ? viewToDelete.getName() : '';
                var delViewId = viewToDelete.getId();
                var delViewParent = viewToDelete.eContainer();

                (function(capturedView, capturedParent) {
                    var DeleteViewCmd = Java.extend(GEFCommand, {
                        execute: function() {
                            if (capturedParent && typeof capturedParent.getElements === 'function') {
                                capturedParent.getElements().remove(capturedView);
                            }
                        },
                        undo: function() {
                            if (capturedParent && typeof capturedParent.getElements === 'function') {
                                capturedParent.getElements().add(capturedView);
                            }
                        },
                        canExecute: function() { return true; },
                        canUndo: function() { return true; },
                        getLabel: function() { return "Delete View"; }
                    });
                    compound.add(new DeleteViewCmd());
                })(viewToDelete, delViewParent);

                results.push({
                    op: "deleteView",
                    viewId: delViewId,
                    viewName: delViewName
                });
            }
            else if (operation.op === "duplicateView") {
                // Deep-copy a view (undoable)
                var viewToDup = idMap[operation.viewId] || findViewById(model, operation.viewId);
                if (!viewToDup) {
                    throw new Error("duplicateView: cannot find view: " + operation.viewId);
                }

                var dupNewView = EcoreUtil.copy(viewToDup);
                var dupNewName = operation.name || (viewToDup.getName() + " (Copy)");
                dupNewView.setName(dupNewName);

                var dupParent = viewToDup.eContainer();

                (function(capturedNewView, capturedParent) {
                    var DuplicateViewCmd = Java.extend(GEFCommand, {
                        execute: function() {
                            if (capturedParent && typeof capturedParent.getElements === 'function') {
                                capturedParent.getElements().add(capturedNewView);
                            }
                        },
                        undo: function() {
                            if (capturedParent && typeof capturedParent.getElements === 'function') {
                                capturedParent.getElements().remove(capturedNewView);
                            }
                        },
                        canExecute: function() { return true; },
                        canUndo: function() { return true; },
                        getLabel: function() { return "Duplicate View"; }
                    });
                    compound.add(new DuplicateViewCmd());
                })(dupNewView, dupParent);

                results.push({
                    op: "duplicateView",
                    sourceViewId: viewToDup.getId(),
                    newViewId: dupNewView.getId(),
                    newViewName: dupNewView.getName()
                });
            }
            else if (operation.op === "setViewRouter") {
                // Set connection router type on a view (undoable)
                var routerView = idMap[operation.viewId] || findViewById(model, operation.viewId);
                if (!routerView) {
                    throw new Error("setViewRouter: cannot find view: " + operation.viewId);
                }

                var routerValue = operation.routerType === "manhattan" ? 1 : 0;

                (function(capturedView, capturedNewRouter) {
                    var oldRouter = capturedView.getConnectionRouterType();
                    var SetRouterCmd = Java.extend(GEFCommand, {
                        execute: function() { capturedView.setConnectionRouterType(capturedNewRouter); },
                        undo: function() { capturedView.setConnectionRouterType(oldRouter); },
                        canExecute: function() { return true; },
                        canUndo: function() { return true; },
                        getLabel: function() { return "Set View Router"; }
                    });
                    compound.add(new SetRouterCmd());
                })(routerView, routerValue);

                results.push({
                    op: "setViewRouter",
                    viewId: routerView.getId(),
                    routerType: operation.routerType
                });
            }
            else if (operation.op === "layoutView") {
                // Apply Dagre layout to a view (undoable)
                var layoutView = idMap[operation.viewId] || findViewById(model, operation.viewId);
                if (!layoutView) {
                    throw new Error("layoutView: cannot find view: " + operation.viewId);
                }

                // Compute layout without applying it
                if (typeof layoutDagreHeadless === "undefined" || !layoutDagreHeadless) {
                    throw new Error("layoutView: Dagre layout module not loaded");
                }

                var layoutResult = layoutDagreHeadless.computeLayout(layoutView, {
                    rankdir: operation.rankdir || 'TB',
                    nodesep: operation.nodesep || 50,
                    ranksep: operation.ranksep || 50,
                    edgesep: operation.edgesep || 10,
                    marginx: operation.marginx || 20,
                    marginy: operation.marginy || 20
                });

                // Create undoable commands for each node position change
                var nodesPositioned = 0;
                for (var lni = 0; lni < layoutResult.nodes.length; lni++) {
                    var nodeInfo = layoutResult.nodes[lni];
                    (function(capturedElement, capturedOldBounds, capturedNewBounds) {
                        var LayoutNodeCmd = Java.extend(GEFCommand, {
                            execute: function() { capturedElement.setBounds(capturedNewBounds); },
                            undo: function() { capturedElement.setBounds(capturedOldBounds); },
                            canExecute: function() { return true; },
                            canUndo: function() { return true; },
                            getLabel: function() { return "Layout Node"; }
                        });
                        compound.add(new LayoutNodeCmd());
                    })(nodeInfo.element, nodeInfo.oldBounds, nodeInfo.newBounds);
                    nodesPositioned++;
                }

                // Create undoable commands for clearing bendpoints
                var edgesRouted = 0;
                for (var lei = 0; lei < layoutResult.connections.length; lei++) {
                    var connInfo = layoutResult.connections[lei];
                    (function(capturedConn, capturedOldBendpoints) {
                        var ClearBendpointsCmd = Java.extend(GEFCommand, {
                            execute: function() { capturedConn.getBendpoints().clear(); },
                            undo: function() {
                                var bp = capturedConn.getBendpoints();
                                for (var bpi = 0; bpi < capturedOldBendpoints.length; bpi++) {
                                    bp.add(capturedOldBendpoints[bpi]);
                                }
                            },
                            canExecute: function() { return true; },
                            canUndo: function() { return true; },
                            getLabel: function() { return "Clear Bendpoints"; }
                        });
                        compound.add(new ClearBendpointsCmd());
                    })(connInfo.connection, connInfo.oldBendpoints);
                    edgesRouted++;
                }

                results.push({
                    op: "layoutView",
                    viewId: layoutView.getId(),
                    nodesPositioned: nodesPositioned,
                    edgesRouted: edgesRouted
                });
            }

            // R1: record boundary if this operation added sub-commands
            if (compound.size() > _opStartP2) {
                opBoundaries.push(_opStartP2);
            }
        }

        // Third pass: delete operations — run after all creates and mutations are queued
        // This ensures same-batch create+delete works correctly (element is in model by
        // the time the delete executes in the compound command).
        for (var p3 = 0; p3 < operations.length; p3++) {
            var op3 = operations[p3];
            var _opStartP3 = compound.size(); // R1: track operation boundary
            if (op3.op === "deleteConnectionFromView") {
                var viewForConnDel3 = idMap[op3.viewId] || findElementById(model, op3.viewId);
                if (!viewForConnDel3) {
                    throw new Error("deleteConnectionFromView: cannot find view: " + op3.viewId);
                }
                var connIdToDel3 = op3.connectionId;
                var connToDel3 = findConnectionInView(viewForConnDel3, connIdToDel3);
                if (!connToDel3) {
                    throw new Error("deleteConnectionFromView: cannot find connection: " + connIdToDel3);
                }
                var connRelId3 = null;
                if (typeof connToDel3.getArchimateRelationship === 'function' && connToDel3.getArchimateRelationship()) {
                    connRelId3 = connToDel3.getArchimateRelationship().getId();
                }
                (function(capturedSrc3, capturedTgt3, capturedConn3) {
                    var DelConnCmd3 = Java.extend(GEFCommand, {
                        execute: function() {
                            if (capturedSrc3 && typeof capturedSrc3.getSourceConnections === 'function') {
                                capturedSrc3.getSourceConnections().remove(capturedConn3);
                            }
                            if (capturedTgt3 && typeof capturedTgt3.getTargetConnections === 'function') {
                                capturedTgt3.getTargetConnections().remove(capturedConn3);
                            }
                        },
                        undo: function() {
                            if (capturedSrc3 && typeof capturedSrc3.getSourceConnections === 'function') {
                                capturedSrc3.getSourceConnections().add(capturedConn3);
                            }
                            if (capturedTgt3 && typeof capturedTgt3.getTargetConnections === 'function') {
                                capturedTgt3.getTargetConnections().add(capturedConn3);
                            }
                        },
                        canExecute: function() { return true; },
                        canUndo: function() { return true; },
                        getLabel: function() { return "Delete connection from view"; }
                    });
                    compound.add(new DelConnCmd3());
                })(connToDel3.getSource ? connToDel3.getSource() : null, connToDel3.getTarget ? connToDel3.getTarget() : null, connToDel3);
                results.push({
                    op: "deleteConnectionFromView",
                    connectionId: connIdToDel3,
                    viewId: viewForConnDel3.getId(),
                    relationshipId: connRelId3
                });
            }
            else if (op3.op === "deleteElement") {
                var elemToDelete3 = idMap[op3.id] || findElementById(model, op3.id);
                if (!elemToDelete3) {
                    throw new Error("Cannot find element to delete: " + op3.id);
                }
                var elemName3 = elemToDelete3.getName ? elemToDelete3.getName() : '';
                var elemId3 = elemToDelete3.getId();
                var doCascade3 = op3.cascade !== false;
                if (doCascade3) {
                    var relRefs3 = findRelationshipsForElement(model, elemId3);
                    for (var ri3 = 0; ri3 < relRefs3.length; ri3++) {
                        var relRef3 = relRefs3[ri3];
                        var allViews3 = findAllViews(model);
                        for (var vi3 = 0; vi3 < allViews3.length; vi3++) {
                            var connRefs3 = findConnectionsForRelationship(allViews3[vi3], relRef3.relationship.getId());
                            for (var ci3 = 0; ci3 < connRefs3.length; ci3++) {
                                (function(cConn, cSrc, cTgt) {
                                    var RCC3 = Java.extend(GEFCommand, {
                                        execute: function() {
                                            if (cSrc && typeof cSrc.getSourceConnections === 'function') cSrc.getSourceConnections().remove(cConn);
                                            if (cTgt && typeof cTgt.getTargetConnections === 'function') cTgt.getTargetConnections().remove(cConn);
                                        },
                                        undo: function() {
                                            if (cSrc && typeof cSrc.getSourceConnections === 'function') cSrc.getSourceConnections().add(cConn);
                                            if (cTgt && typeof cTgt.getTargetConnections === 'function') cTgt.getTargetConnections().add(cConn);
                                        },
                                        canExecute: function() { return true; },
                                        canUndo: function() { return true; },
                                        getLabel: function() { return "Remove connection from view"; }
                                    });
                                    compound.add(new RCC3());
                                })(connRefs3[ci3].connection, connRefs3[ci3].source, connRefs3[ci3].target);
                            }
                        }
                        (function(cRel, cFolder) {
                            var RRC3 = Java.extend(GEFCommand, {
                                execute: function() { if (cFolder && typeof cFolder.getElements === 'function') cFolder.getElements().remove(cRel); },
                                undo: function() { if (cFolder && typeof cFolder.getElements === 'function') cFolder.getElements().add(cRel); },
                                canExecute: function() { return true; },
                                canUndo: function() { return true; },
                                getLabel: function() { return "Remove relationship"; }
                            });
                            compound.add(new RRC3());
                        })(relRef3.relationship, relRef3.parentFolder);
                    }
                    var allViewsForElem3 = findAllViews(model);
                    for (var vei3 = 0; vei3 < allViewsForElem3.length; vei3++) {
                        var visualRefs3 = findVisualsForElement(allViewsForElem3[vei3], elemId3);
                        for (var vri3 = 0; vri3 < visualRefs3.length; vri3++) {
                            var attachedConns3 = findConnectionsForVisual(visualRefs3[vri3].visual);
                            for (var aci3 = 0; aci3 < attachedConns3.length; aci3++) {
                                (function(cConn, cSrc, cTgt) {
                                    var RAC3 = Java.extend(GEFCommand, {
                                        execute: function() {
                                            if (cSrc && typeof cSrc.getSourceConnections === 'function') cSrc.getSourceConnections().remove(cConn);
                                            if (cTgt && typeof cTgt.getTargetConnections === 'function') cTgt.getTargetConnections().remove(cConn);
                                        },
                                        undo: function() {
                                            if (cSrc && typeof cSrc.getSourceConnections === 'function') cSrc.getSourceConnections().add(cConn);
                                            if (cTgt && typeof cTgt.getTargetConnections === 'function') cTgt.getTargetConnections().add(cConn);
                                        },
                                        canExecute: function() { return true; },
                                        canUndo: function() { return true; },
                                        getLabel: function() { return "Remove attached connection"; }
                                    });
                                    compound.add(new RAC3());
                                })(attachedConns3[aci3].connection, attachedConns3[aci3].source, attachedConns3[aci3].target);
                            }
                            (function(cVis, cCont) {
                                var RV3 = Java.extend(GEFCommand, {
                                    execute: function() { if (cCont && typeof cCont.getChildren === 'function') cCont.getChildren().remove(cVis); },
                                    undo: function() { if (cCont && typeof cCont.getChildren === 'function') cCont.getChildren().add(cVis); },
                                    canExecute: function() { return true; },
                                    canUndo: function() { return true; },
                                    getLabel: function() { return "Remove visual from view"; }
                                });
                                compound.add(new RV3());
                            })(visualRefs3[vri3].visual, visualRefs3[vri3].parent);
                        }
                    }
                }
                (function(cElem, cId) {
                    var DE3 = Java.extend(GEFCommand, {
                        execute: function() {
                            var cParent = cElem.eContainer();
                            if (cParent && typeof cParent.getElements === 'function') cParent.getElements().remove(cElem);
                        },
                        undo: function() {
                            var cParent = cElem.eContainer();
                            if (cParent && typeof cParent.getElements === 'function') cParent.getElements().add(cElem);
                        },
                        canExecute: function() { return true; },
                        canUndo: function() { return true; },
                        getLabel: function() { return "Delete " + cId; }
                    });
                    compound.add(new DE3());
                })(elemToDelete3, elemId3);
                results.push({ op: "deleteElement", id: elemId3, name: elemName3, cascade: doCascade3 });
            }
            else if (op3.op === "deleteRelationship") {
                var relToDelete3 = idMap[op3.id] || findElementById(model, op3.id);
                if (!relToDelete3) {
                    throw new Error("Cannot find relationship to delete: " + op3.id);
                }
                var relName3 = relToDelete3.getName ? relToDelete3.getName() : '';
                var relId3 = relToDelete3.getId();
                var allViewsForRel3 = findAllViews(model);
                for (var vrdi3 = 0; vrdi3 < allViewsForRel3.length; vrdi3++) {
                    var relConnRefs3 = findConnectionsForRelationship(allViewsForRel3[vrdi3], relId3);
                    for (var vrci3 = 0; vrci3 < relConnRefs3.length; vrci3++) {
                        (function(cConn, cSrc, cTgt) {
                            var RRC2 = Java.extend(GEFCommand, {
                                execute: function() {
                                    if (cSrc && typeof cSrc.getSourceConnections === 'function') cSrc.getSourceConnections().remove(cConn);
                                    if (cTgt && typeof cTgt.getTargetConnections === 'function') cTgt.getTargetConnections().remove(cConn);
                                },
                                undo: function() {
                                    if (cSrc && typeof cSrc.getSourceConnections === 'function') cSrc.getSourceConnections().add(cConn);
                                    if (cTgt && typeof cTgt.getTargetConnections === 'function') cTgt.getTargetConnections().add(cConn);
                                },
                                canExecute: function() { return true; },
                                canUndo: function() { return true; },
                                getLabel: function() { return "Remove connection from view"; }
                            });
                            compound.add(new RRC2());
                        })(relConnRefs3[vrci3].connection, relConnRefs3[vrci3].source, relConnRefs3[vrci3].target);
                    }
                }
                (function(cRel, cId) {
                    var DR3 = Java.extend(GEFCommand, {
                        execute: function() {
                            var cParent = cRel.eContainer();
                            if (cParent && typeof cParent.getElements === 'function') cParent.getElements().remove(cRel);
                        },
                        undo: function() {
                            var cParent = cRel.eContainer();
                            if (cParent && typeof cParent.getElements === 'function') cParent.getElements().add(cRel);
                        },
                        canExecute: function() { return true; },
                        canUndo: function() { return true; },
                        getLabel: function() { return "Delete Relationship " + cId; }
                    });
                    compound.add(new DR3());
                })(relToDelete3, relId3);
                results.push({ op: "deleteRelationship", id: relId3, name: relName3 });
            }
            else if (op3.op === "deleteView") {
                var viewToDelete3 = idMap[op3.viewId] || findElementById(model, op3.viewId);
                if (!viewToDelete3) {
                    throw new Error("deleteView: cannot find view: " + op3.viewId);
                }
                var delViewName3 = viewToDelete3.getName ? viewToDelete3.getName() : '';
                var delViewId3 = viewToDelete3.getId();
                (function(cView) {
                    var DV3 = Java.extend(GEFCommand, {
                        execute: function() {
                            var cParent = cView.eContainer();
                            if (cParent && typeof cParent.getElements === 'function') cParent.getElements().remove(cView);
                        },
                        undo: function() {
                            var cParent = cView.eContainer();
                            if (cParent && typeof cParent.getElements === 'function') cParent.getElements().add(cView);
                        },
                        canExecute: function() { return true; },
                        canUndo: function() { return true; },
                        getLabel: function() { return "Delete View"; }
                    });
                    compound.add(new DV3());
                })(viewToDelete3);
                results.push({ op: "deleteView", viewId: delViewId3, viewName: delViewName3 });
            }

            // R1: record boundary if this delete added sub-commands
            if (compound.size() > _opStartP3) {
                opBoundaries.push(_opStartP3);
            }
        }

        // --- Chunked Execution ---
        // R1: Add sentinel boundary for operation-aligned chunking
        opBoundaries.push(compound.size());

        // If the compound command exceeds the max sub-command threshold, split into
        // multiple CompoundCommands to avoid GEF/Eclipse silent rollback on large batches.
        // R1: Splits only at operation boundaries — never mid-operation.
        var maxSubCmds = config.maxSubCommandsPerBatch;
        var totalSubCmds = compound.size();

        if (totalSubCmds <= maxSubCmds || maxSubCmds <= 0) {
            // Small enough — execute as single compound command (original behavior)
            executeCommand(model, compound);
        } else if (config.granularity === "per-operation" && opBoundaries.length > 1) {
            // R2: Execute each operation as its own CompoundCommand for maximum isolation
            var commandList = compound.getCommands();
            for (var opI = 0; opI < opBoundaries.length - 1; opI++) {
                var opStart = opBoundaries[opI];
                var opEnd = opBoundaries[opI + 1];
                var opChunk = new CompoundCommand(label + " [op " + (opI + 1) + "/" + (opBoundaries.length - 1) + "]");
                for (var ci = opStart; ci < opEnd; ci++) {
                    opChunk.add(commandList.get(ci));
                }

                executeCommand(model, opChunk);

                // Verify each operation wasn't silently rolled back
                if (config.postExecuteVerify && createdElementIds.length + createdRelationshipIds.length > 0) {
                    try {
                        var Thread = Java.type("java.lang.Thread");
                        Thread.sleep(20);
                    } catch (sleepErr) { /* ignore */ }

                    var rollbackDetected = _verifyCreatedObjects(model, createdElementIds, createdRelationshipIds);
                    if (rollbackDetected) {
                        throw new Error(
                            "Silent batch rollback detected after op " + (opI + 1) +
                            ": " + rollbackDetected.missing + " of " + rollbackDetected.total +
                            " created objects not found. " +
                            "Op had " + opChunk.size() + " sub-commands."
                        );
                    }
                }
            }
        } else {
            // R1: Operation-aligned chunking — never split mid-operation
            var commandList = compound.getCommands();
            var chunkIndex = 0;
            var opIdx = 0;

            while (opIdx < opBoundaries.length - 1) {
                chunkIndex++;
                var chunkLabel = label + " [chunk " + chunkIndex + "]";
                var chunk = new CompoundCommand(chunkLabel);
                var chunkStartCmd = opBoundaries[opIdx];
                var chunkEndCmd = chunkStartCmd;
                var opsInChunk = 0;

                // Greedily add whole operations until adding the next would exceed threshold
                while (opIdx < opBoundaries.length - 1) {
                    var opEndCmd = opBoundaries[opIdx + 1];
                    var chunkSizeIfAdded = opEndCmd - chunkStartCmd;

                    if (opsInChunk > 0 && chunkSizeIfAdded > maxSubCmds) {
                        break; // adding this op would exceed limit
                    }

                    chunkEndCmd = opEndCmd;
                    opIdx++;
                    opsInChunk++;

                    // If a single operation exceeds the limit, still take it (forced)
                    if (chunkSizeIfAdded > maxSubCmds) {
                        break;
                    }
                }

                for (var ci = chunkStartCmd; ci < chunkEndCmd; ci++) {
                    chunk.add(commandList.get(ci));
                }

                executeCommand(model, chunk);

                // Verify chunk wasn't silently rolled back
                if (config.postExecuteVerify && createdElementIds.length + createdRelationshipIds.length > 0) {
                    // Brief pause to allow any async rollback to settle
                    try {
                        var Thread = Java.type("java.lang.Thread");
                        Thread.sleep(20);
                    } catch (sleepErr) { /* ignore */ }

                    var rollbackDetected = _verifyCreatedObjects(model, createdElementIds, createdRelationshipIds);
                    if (rollbackDetected) {
                        throw new Error(
                            "Silent batch rollback detected after chunk " + chunkIndex +
                            ": " + rollbackDetected.missing + " of " + rollbackDetected.total +
                            " created objects not found in model folders after execution. " +
                            "The GEF command stack likely rejected the CompoundCommand. " +
                            "Chunk had " + chunk.size() + " sub-commands (" + opsInChunk + " operations)."
                        );
                    }
                }
            }
        }

        // --- Post-Execution Verification ---
        // Even for single (non-chunked) commands, verify created objects persist.
        if (config.postExecuteVerify && (createdElementIds.length > 0 || createdRelationshipIds.length > 0)) {
            // Brief pause to allow any async rollback to settle
            try {
                var Thread2 = Java.type("java.lang.Thread");
                Thread2.sleep(50);
            } catch (sleepErr2) { /* ignore */ }

            var rollback = _verifyCreatedObjects(model, createdElementIds, createdRelationshipIds);
            if (rollback) {
                throw new Error(
                    "Silent batch rollback detected: " + rollback.missing + " of " + rollback.total +
                    " created objects not found in model folders after execution. " +
                    "The GEF command stack likely rejected the CompoundCommand (" +
                    totalSubCmds + " sub-commands). " +
                    "Missing IDs: " + rollback.missingIds.slice(0, 5).join(", ") +
                    (rollback.missingIds.length > 5 ? " (+" + (rollback.missingIds.length - 5) + " more)" : "")
                );
            }
        }

        // R3: Post-execution result refresh — re-read IDs from committed EMF objects
        // This ensures results reflect the actual committed state, not pre-execution state.
        // Prevents stale tempId→realId mappings if server-side chunking altered execution.
        for (var ri = 0; ri < results.length; ri++) {
            var r = results[ri];
            if (r.element && typeof r.element.getId === 'function') {
                r.realId = r.element.getId();
                delete r.element;
            }
            if (r.relationship && typeof r.relationship.getId === 'function') {
                r.realId = r.relationship.getId();
                // Refresh source/target IDs from committed state
                var relSrc = r.relationship.getSource ? r.relationship.getSource() : null;
                var relTgt = r.relationship.getTarget ? r.relationship.getTarget() : null;
                if (relSrc) r.source = relSrc.getId();
                if (relTgt) r.target = relTgt.getId();
                delete r.relationship;
            }
        }

        return results;
    }

    /**
     * Verify that created objects actually exist in model folders after command execution.
     * Detects silent rollback by the GEF command stack.
     *
     * @param {Object} model - IArchimateModel
     * @param {Array<string>} elementIds - IDs of created elements to verify
     * @param {Array<string>} relationshipIds - IDs of created relationships to verify
     * @returns {Object|null} null if all OK, or { missing, total, missingIds } if rollback detected
     * @private
     */
    function _verifyCreatedObjects(model, elementIds, relationshipIds) {
        var allIds = elementIds.concat(relationshipIds);
        if (allIds.length === 0) return null;

        var missingIds = [];
        for (var v = 0; v < allIds.length; v++) {
            var found = findElementById(model, allIds[v]);
            if (!found) {
                missingIds.push(allIds[v]);
            }
        }

        if (missingIds.length > 0) {
            return {
                missing: missingIds.length,
                total: allIds.length,
                missingIds: missingIds
            };
        }
        return null;
    }

    /**
     * Find visual object by ID in a view
     */
    function findVisualObjectInView(view, visualId) {
        var children = view.getChildren();
        for (var i = 0; i < children.size(); i++) {
            var child = children.get(i);
            if (child.getId() === visualId) {
                return child;
            }
            // Check nested children (groups, etc.)
            if (typeof child.getChildren === "function") {
                var found = findVisualObjectInView(child, visualId);
                if (found) return found;
            }
        }
        return null;
    }

    /**
     * Find visual object by ID across all views in the model
     * @param {Object} model - IArchimateModel
     * @param {string} visualId - Visual object ID
     * @returns {Object|null} Visual object or null
     */
    function findVisualObjectInModel(model, visualId) {
        var folders = model.getFolders();
        for (var i = 0; i < folders.size(); i++) {
            var folder = folders.get(i);
            var result = findVisualObjectInModelFolder(folder, visualId);
            if (result) return result;
        }
        return null;
    }

    /**
     * Recursively search folder for visual object by ID
     */
    function findVisualObjectInModelFolder(folder, visualId) {
        var elements = folder.getElements();
        for (var i = 0; i < elements.size(); i++) {
            var element = elements.get(i);
            // Check if it's a view (has getChildren method)
            if (typeof element.getChildren === "function") {
                var found = findVisualObjectInView(element, visualId);
                if (found) return found;
            }
        }

        var subfolders = folder.getFolders();
        for (var j = 0; j < subfolders.size(); j++) {
            var subfolder = subfolders.get(j);
            var found = findVisualObjectInModelFolder(subfolder, visualId);
            if (found) return found;
        }

        return null;
    }

    /**
     * Find connection by ID across all views in the model
     * @param {Object} model - IArchimateModel
     * @param {string} connectionId - Connection ID
     * @returns {Object|null} Connection or null
     */
    function findConnectionInModel(model, connectionId) {
        var folders = model.getFolders();
        for (var i = 0; i < folders.size(); i++) {
            var folder = folders.get(i);
            var result = findConnectionInModelFolder(folder, connectionId);
            if (result) return result;
        }
        return null;
    }

    /**
     * Recursively search folder for connection by ID
     */
    function findConnectionInModelFolder(folder, connectionId) {
        var elements = folder.getElements();
        for (var i = 0; i < elements.size(); i++) {
            var element = elements.get(i);
            // Check if it's a view (has getChildren method)
            if (typeof element.getChildren === "function") {
                var found = findConnectionInView(element, connectionId);
                if (found) return found;
            }
        }

        var subfolders = folder.getFolders();
        for (var j = 0; j < subfolders.size(); j++) {
            var subfolder = subfolders.get(j);
            var found = findConnectionInModelFolder(subfolder, connectionId);
            if (found) return found;
        }

        return null;
    }

    /**
     * Find connection by ID within a view by searching source connections on all visual objects
     */
    function findConnectionInView(view, connectionId) {
        var children = view.getChildren();
        for (var i = 0; i < children.size(); i++) {
            var child = children.get(i);
            // Check source connections on this visual object
            if (typeof child.getSourceConnections === "function") {
                var conns = child.getSourceConnections();
                for (var k = 0; k < conns.size(); k++) {
                    var conn = conns.get(k);
                    if (conn.getId() === connectionId) {
                        return conn;
                    }
                }
            }
            // Recurse into nested children (groups, etc.)
            if (typeof child.getChildren === "function") {
                var found = findConnectionInView(child, connectionId);
                if (found) return found;
            }
        }
        return null;
    }

    /**
     * Find view by ID in model
     * Uses EMF traversal only (no $() dependency) for server compatibility
     * @param {Object} model - IArchimateModel
     * @param {string} id - View ID
     * @returns {Object|null} View or null
     */
    function findViewById(model, id) {
        // Use EMF folder search only (no $() which requires CurrentModel context)
        var folders = model.getFolders();
        for (var i = 0; i < folders.size(); i++) {
            var folder = folders.get(i);
            var view = findViewInFolder(folder, id);
            if (view) return view;
        }
        return null;
    }

    /**
     * Recursively search folder for view by ID
     */
    function findViewInFolder(folder, id) {
        var elements = folder.getElements();
        for (var i = 0; i < elements.size(); i++) {
            var element = elements.get(i);
            if (element.getId() === id) {
                return element;
            }
        }

        var subfolders = folder.getFolders();
        for (var j = 0; j < subfolders.size(); j++) {
            var subfolder = subfolders.get(j);
            var found = findViewInFolder(subfolder, id);
            if (found) return found;
        }

        return null;
    }

    /**
     * Find element by ID in model
     * @param {Object} model - IArchimateModel
     * @param {string} id - Element ID
     * @returns {Object|null} Element or null
     */
    function findElementById(model, id) {
        var folders = model.getFolders();
        for (var i = 0; i < folders.size(); i++) {
            var folder = folders.get(i);
            var element = findInFolder(folder, id);
            if (element) return element;
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
            var subfolder = subfolders.get(j);
            var found = findInFolder(subfolder, id);
            if (found) return found;
        }

        return null;
    }

    // Export module
    var undoableCommands = {
        createElement: createElement,
        createRelationship: createRelationship,
        setProperty: setProperty,
        updateName: updateName,
        updateDocumentation: updateDocumentation,
        deleteElement: deleteElement,
        executeBatch: executeBatch,
        findElementById: findElementById,
        findViewById: findViewById,
        getCommandStack: getCommandStack,

        /**
         * Register a listener on the model's command stack to detect external changes
         * (e.g., user pressing Ctrl+Z, or command stack rejecting a command).
         *
         * The callback fires on any command stack event NOT initiated by executeBatch().
         * Typical use: trigger modelSnapshot.refreshSnapshot() on external undo/redo.
         *
         * @param {Object} model - IArchimateModel
         * @param {Function} callback - Called with (eventType) on command stack changes.
         *   eventType is a string: "execute", "undo", "redo", or "flush"
         * @returns {Object} listener handle with .remove() method to unregister
         */
        registerCommandStackListener: function(model, callback) {
            var CommandStackListener = Java.type("org.eclipse.gef.commands.CommandStackListener");
            var commandStack = getCommandStack(model);

            var listener = new (Java.extend(CommandStackListener, {
                commandStackChanged: function(event) {
                    try {
                        callback("changed");
                    } catch (e) {
                        // Swallow errors in callback to avoid crashing the command stack
                        if (typeof console !== "undefined" && console.error) {
                            console.error("CommandStackListener callback error: " + e);
                        }
                    }
                }
            }))();

            commandStack.addCommandStackListener(listener);

            return {
                remove: function() {
                    try {
                        commandStack.removeCommandStackListener(listener);
                    } catch (e) { /* ignore */ }
                }
            };
        }
    };

    // Export globally for JArchi
    if (typeof globalThis !== "undefined") {
        globalThis.undoableCommands = undoableCommands;
    } else if (typeof global !== "undefined") {
        global.undoableCommands = undoableCommands;
    }

    // CommonJS for Node.js build tools
    if (typeof module !== "undefined" && module.exports) {
        module.exports = undoableCommands;
    }

})();
