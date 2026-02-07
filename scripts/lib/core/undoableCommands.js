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
            case "implementation-event": return factory.createImplementationMigrationEvent();
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
     * Delete element (undoable)
     * @param {Object} model - IArchimateModel
     * @param {Object} element - Element to delete
     */
    function deleteElement(model, element) {
        var DeleteCommand = Java.extend(GEFCommand, {
            execute: function() {
                EcoreUtil.delete(element, true);
            },
            undo: function() {
                throw new Error("Undo of delete not yet implemented");
            },
            canExecute: function() {
                return true;
            },
            canUndo: function() {
                return false; // TODO: Implement proper undo for delete
            },
            getLabel: function() {
                return "Delete " + element.getName();
            }
        });

        executeCommand(model, new DeleteCommand());
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
    function executeBatch(model, label, operations) {
        var compound = new CompoundCommand(label);
        var results = [];
        var idMap = {}; // Map tempId -> created object

        // First pass: create all elements
        for (var i = 0; i < operations.length; i++) {
            var op = operations[i];

            if (op.op === "createElement") {
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
            }
        }

        // Second pass: create relationships and other operations
        for (var j = 0; j < operations.length; j++) {
            var operation = operations[j];

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

                // Add to folder
                var relFolder = getFolderForType(model, operation.type);
                var relAddCmd = createAddToFolderCommand(
                    "Add Relationship",
                    relFolder,
                    rel
                );
                compound.add(relAddCmd);

                results.push({
                    op: "createRelationship",
                    tempId: operation.tempId,
                    realId: rel.getId(),
                    type: operation.type,
                    source: source.getId(),
                    target: target.getId(),
                    relationship: rel
                });
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

                    var AddPropCmd = Java.extend(GEFCommand, {
                        execute: function() {
                            props.add(newProperty);
                        },
                        undo: function() {
                            props.remove(newProperty);
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
                var viewForAdd = findViewById(model, operation.viewId);
                if (!viewForAdd) {
                    throw new Error("Cannot find view: " + operation.viewId);
                }

                var elementToAdd = idMap[operation.elementId] || findElementById(model, operation.elementId);
                if (!elementToAdd) {
                    throw new Error("Cannot find element: " + operation.elementId);
                }

                // Default dimensions
                var addX = typeof operation.x === "number" ? operation.x : 100;
                var addY = typeof operation.y === "number" ? operation.y : 100;
                var addWidth = typeof operation.width === "number" ? operation.width : 120;
                var addHeight = typeof operation.height === "number" ? operation.height : 55;

                // Create visual object using EMF factory
                var visualObj = factory.createDiagramModelArchimateObject();
                visualObj.setArchimateElement(elementToAdd);

                // Set bounds
                var bounds = factory.createBounds();
                bounds.setX(addX);
                bounds.setY(addY);
                bounds.setWidth(addWidth < 0 ? 120 : addWidth);
                bounds.setHeight(addHeight < 0 ? 55 : addHeight);
                visualObj.setBounds(bounds);

                // Create command to add to view (undoable)
                // IMPORTANT: Use IIFE to capture variables by value, not by reference
                // Without this, the closure would capture the last values from the loop
                (function(capturedView, capturedVisual) {
                    var AddToViewCmd = Java.extend(GEFCommand, {
                        execute: function() {
                            capturedView.getChildren().add(capturedVisual);
                        },
                        undo: function() {
                            capturedView.getChildren().remove(capturedVisual);
                        },
                        canExecute: function() { return true; },
                        canUndo: function() { return true; },
                        getLabel: function() { return "Add to View"; }
                    });
                    compound.add(new AddToViewCmd());
                })(viewForAdd, visualObj);

                // Store visual object in map for connection references
                if (operation.tempId) {
                    idMap[operation.tempId] = visualObj;
                }
                // Also store by visual object ID
                idMap[visualObj.getId()] = visualObj;

                results.push({
                    op: "addToView",
                    tempId: operation.tempId || null,
                    visualId: visualObj.getId(),
                    viewId: viewForAdd.getId(),
                    elementId: elementToAdd.getId ? elementToAdd.getId() : elementToAdd.id,
                    x: addX,
                    y: addY,
                    width: bounds.getWidth(),
                    height: bounds.getHeight()
                });
            }
            else if (operation.op === "addConnectionToView") {
                // Add relationship as visual connection using EMF
                var viewForConn = findViewById(model, operation.viewId);
                if (!viewForConn) {
                    throw new Error("Cannot find view: " + operation.viewId);
                }

                var relationship = idMap[operation.relationshipId] || findElementById(model, operation.relationshipId);
                if (!relationship) {
                    throw new Error("Cannot find relationship: " + operation.relationshipId);
                }

                // Find source and target visual objects from idMap or search view
                var sourceVisual = idMap[operation.sourceVisualId];
                var targetVisual = idMap[operation.targetVisualId];

                // If not in idMap, search in view children
                if (!sourceVisual) {
                    sourceVisual = findVisualObjectInView(viewForConn, operation.sourceVisualId);
                }
                if (!targetVisual) {
                    targetVisual = findVisualObjectInView(viewForConn, operation.targetVisualId);
                }

                if (!sourceVisual) {
                    throw new Error("Cannot find source visual object: " + operation.sourceVisualId);
                }
                if (!targetVisual) {
                    throw new Error("Cannot find target visual object: " + operation.targetVisualId);
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
                            throw new Error(
                                "Direction mismatch: visual source/target are swapped vs relationship. " +
                                "Relationship: '" + (relSource.getName ? relSource.getName() : relSourceId) + "' → '" + 
                                (relTarget.getName ? relTarget.getName() : relTargetId) + "'. " +
                                "Visual: '" + (sourceElem.getName ? sourceElem.getName() : sourceElemId) + "' → '" + 
                                (targetElem.getName ? targetElem.getName() : targetElemId) + "'. " +
                                "Swap sourceVisualId and targetVisualId to match relationship direction."
                            );
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

                results.push({
                    op: "addConnectionToView",
                    connectionId: connection.getId(),
                    viewId: viewForConn.getId(),
                    relationshipId: relationship.getId ? relationship.getId() : relationship.id,
                    sourceVisualId: sourceVisual.getId ? sourceVisual.getId() : sourceVisual.id,
                    targetVisualId: targetVisual.getId ? targetVisual.getId() : targetVisual.id
                });
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
                // Delete element or relationship with optional cascading
                var elemToDelete = idMap[operation.id] || findElementById(model, operation.id);
                if (!elemToDelete) {
                    throw new Error("Cannot find element to delete: " + operation.id);
                }

                var elemName = elemToDelete.getName ? elemToDelete.getName() : '';
                var elemId = elemToDelete.getId();
                
                // Capture parent folder for undo
                var parentFolder = elemToDelete.eContainer();
                
                // Use IIFE to capture variables
                (function(capturedElem, capturedParent, capturedId) {
                    var DeleteCmd = Java.extend(GEFCommand, {
                        _removedConnections: null,
                        execute: function() {
                            // If cascading, also remove from views
                            if (operation.cascade !== false) {
                                EcoreUtil.delete(capturedElem, true);
                            } else {
                                // Just remove from parent folder
                                if (capturedParent && typeof capturedParent.getElements === 'function') {
                                    capturedParent.getElements().remove(capturedElem);
                                }
                            }
                        },
                        undo: function() {
                            // Re-add to parent folder
                            if (capturedParent && typeof capturedParent.getElements === 'function') {
                                capturedParent.getElements().add(capturedElem);
                            }
                        },
                        canExecute: function() { return true; },
                        canUndo: function() { return operation.cascade === false; }, // Full cascade delete not undoable
                        getLabel: function() { return "Delete " + capturedId; }
                    });
                    compound.add(new DeleteCmd());
                })(elemToDelete, parentFolder, elemId);

                results.push({
                    op: "deleteElement",
                    id: elemId,
                    name: elemName,
                    cascade: operation.cascade !== false
                });
            }
            else if (operation.op === "deleteRelationship") {
                // Delete relationship (alias for deleteElement with relationship)
                var relToDelete = idMap[operation.id] || findElementById(model, operation.id);
                if (!relToDelete) {
                    throw new Error("Cannot find relationship to delete: " + operation.id);
                }

                var relName = relToDelete.getName ? relToDelete.getName() : '';
                var relId = relToDelete.getId();
                var relParent = relToDelete.eContainer();
                
                (function(capturedRel, capturedParent, capturedId) {
                    var DeleteRelCmd = Java.extend(GEFCommand, {
                        execute: function() {
                            EcoreUtil.delete(capturedRel, true);
                        },
                        undo: function() {
                            if (capturedParent && typeof capturedParent.getElements === 'function') {
                                capturedParent.getElements().add(capturedRel);
                            }
                        },
                        canExecute: function() { return true; },
                        canUndo: function() { return false; },
                        getLabel: function() { return "Delete Relationship " + capturedId; }
                    });
                    compound.add(new DeleteRelCmd());
                })(relToDelete, relParent, relId);

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

                // Update accessType for access relationships
                if (operation.accessType !== undefined && typeof relToUpdate.setAccessType === 'function') {
                    var IAccessRelationship = Java.type("com.archimatetool.model.IAccessRelationship");
                    var accessPkg = pkg.getAccessRelationship_AccessType();
                    var accessCmd = new EObjectFeatureCommand(
                        "Set Access Type",
                        relToUpdate,
                        accessPkg,
                        operation.accessType
                    );
                    compound.add(accessCmd);
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
                var viewForNote = findViewById(model, operation.viewId);
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
                var viewForGroup = findViewById(model, operation.viewId);
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
        }

        // Execute the entire batch as one undoable operation
        executeCommand(model, compound);

        return results;
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
        getCommandStack: getCommandStack
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
