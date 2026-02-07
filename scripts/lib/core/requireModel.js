/**
 * requireModel.js
 *
 * Provides a robust way to get a model reference in jArchi scripts,
 * handling cases where no model is selected in the UI or multiple models are loaded.
 *
 * @module requireModel
 */

(function() {
    "use strict";

    // Guard against double-loading
    if (typeof globalThis !== "undefined" && typeof globalThis.requireModel !== "undefined") {
        return;
    }

    /**
     * Returns a loaded model proxy, even if the user hasn't selected a model in the UI.
     *
     * Behaviour:
     *  1) If the global 'model' binding is set, return it.
     *  2) Else, fall back to $.model.getLoadedModels().
     *  3) If multiple models are loaded, prompt with window.promptSelection().
     *
     * @param {Object} [options] - Configuration options
     * @param {boolean} [options.setAsCurrent=true] - Call chosen.setAsCurrent() so subsequent code using 'model' works
     * @param {boolean} [options.promptIfMultiple=true] - If false, pick the first loaded model deterministically
     * @param {string} [options.title="Choose model"] - Title for the selection prompt
     * @param {boolean} [options.returnRawModel=false] - If true, return the underlying EMF IArchimateModel instead of jArchi proxy
     * @returns {Object} An ArchimateModelProxy/CurrentModel (default) or IArchimateModel (if returnRawModel=true)
     * @throws {Error} If no model is loaded or user cancels selection
     *
     * @example
     * load(__DIR__ + "lib/core/requireModel.js");
     *
     * // Get current model proxy, prompting if multiple are loaded
     * const model = requireModel();
     * console.log("Working with model: " + model.name);
     *
     * @example
     * // Get raw EMF model for direct API access
     * const model = requireModel({ returnRawModel: true });
     * const folders = model.getFolders(); // EMF API
     *
     * @example
     * // Don't prompt, just use first loaded model
     * const model = requireModel({ promptIfMultiple: false });
     *
     * @example
     * // Get model without setting as current
     * const model = requireModel({ setAsCurrent: false });
     */
    function requireModel(options) {
        options = options || {};
        const setAsCurrent = options.setAsCurrent !== false;
        const promptIfMultiple = options.promptIfMultiple !== false;
        const title = options.title || "Choose model";
        const returnRawModel = options.returnRawModel === true;

        // 1) Prefer CurrentModel binding when available
        try {
            if (typeof model !== "undefined" &&
                model &&
                typeof model.isSet === "function" &&
                model.isSet()) {
                // Return raw model if requested
                if (returnRawModel) {
                    return getRawModelFromProxy(model);
                }
                return model; // CurrentModel extends ArchimateModelProxy
            }
        } catch (e) {
            // Ignore and fall back to loaded models list
        }

        // 2) Get all loaded models
        const models = $.model.getLoadedModels(); // Returns List<ArchimateModelProxy>
        if (!models || models.size() === 0) {
            throw new Error("No model is loaded in Archi. Open a model and re-run the script.");
        }

        // 3) Only one loaded => use it
        if (models.size() === 1) {
            const m = models.get(0);
            if (setAsCurrent && typeof m.setAsCurrent === "function") {
                m.setAsCurrent(); // Make it the global current model
            }
            // Return raw model if requested
            if (returnRawModel) {
                return getRawModelFromProxy(m);
            }
            return m;
        }

        // 4) Multiple models loaded
        if (!promptIfMultiple) {
            const m = models.get(0);
            if (setAsCurrent && typeof m.setAsCurrent === "function") {
                m.setAsCurrent();
            }
            // Return raw model if requested
            if (returnRawModel) {
                return getRawModelFromProxy(m);
            }
            return m;
        }

        // Build display labels (stable + unique even if names repeat)
        const labels = [];
        for (let i = 0; i < models.size(); i++) {
            const m = models.get(i);
            const name = (m && m.name) ? m.name : "(unnamed)";
            labels.push(`${i + 1}: ${name}`);
        }

        // promptSelection returns the selected label (string) or null/undefined on cancel
        const selectedLabel = window.promptSelection(title, labels);

        if (!selectedLabel) {
            throw new Error("No model selected. Script cancelled.");
        }

        const idx = labels.indexOf(String(selectedLabel));
        if (idx < 0) {
            throw new Error("Selection did not match any loaded model (unexpected).");
        }

        const chosen = models.get(idx);
        if (setAsCurrent && typeof chosen.setAsCurrent === "function") {
            chosen.setAsCurrent();
        }

        // Return raw model if requested
        if (returnRawModel) {
            return getRawModelFromProxy(chosen);
        }
        return chosen;
    }

    /**
     * Extract the underlying EMF IArchimateModel from a jArchi proxy.
     * This is needed when you want to use the EMF API directly (getFolders(), etc.)
     * instead of the jArchi proxy API.
     *
     * IMPORTANT: Prioritizes getting model from active editor when available,
     * as editor models have command stacks attached (needed for undo/redo operations).
     *
     * @param {Object} proxy - jArchi model proxy (ArchimateModelProxy or CurrentModel)
     * @returns {Object} The underlying IArchimateModel EMF object with command stack
     * @throws {Error} If the raw model cannot be extracted
     */
    function getRawModelFromProxy(proxy) {
        try {
            var proxyName = proxy.name;

            // PRIORITY 1: Try to get from active editor first (has command stack)
            try {
                var PlatformUI = Java.type("org.eclipse.ui.PlatformUI");
                var IArchimateModel = Java.type("com.archimatetool.model.IArchimateModel");

                var workbench = PlatformUI.getWorkbench();
                var window = workbench.getActiveWorkbenchWindow();

                if (window) {
                    var page = window.getActivePage();
                    if (page) {
                        var activeEditor = page.getActiveEditor();
                        if (activeEditor) {
                            var editorModel = activeEditor.getAdapter(IArchimateModel.class);
                            if (editorModel && editorModel.getName() === proxyName) {
                                // Found in active editor - this has a command stack!
                                return editorModel;
                            }
                        }
                    }
                }
            } catch (editorError) {
                // No active editor, continue to fallback
            }

            // PRIORITY 2: Search all open editors for the model (they all have command stacks)
            try {
                var PlatformUI = Java.type("org.eclipse.ui.PlatformUI");
                var IArchimateModel = Java.type("com.archimatetool.model.IArchimateModel");

                var workbench = PlatformUI.getWorkbench();
                var windows = workbench.getWorkbenchWindows();

                for (var w = 0; w < windows.length; w++) {
                    var window = windows[w];
                    var pages = window.getPages();

                    for (var p = 0; p < pages.length; p++) {
                        var page = pages[p];
                        var editorRefs = page.getEditorReferences();

                        for (var e = 0; e < editorRefs.length; e++) {
                            var editorRef = editorRefs[e];
                            var editor = editorRef.getEditor(false); // false = don't restore if not already open

                            if (editor) {
                                var editorModel = editor.getAdapter(IArchimateModel.class);
                                if (editorModel && editorModel.getName() === proxyName) {
                                    // Found in an open editor - has command stack!
                                    return editorModel;
                                }
                            }
                        }
                    }
                }
            } catch (searchError) {
                // Continue to next fallback
            }

            // PRIORITY 3: Get from IEditorModelManager (may not have command stack)
            var IEditorModelManager = Java.type("com.archimatetool.editor.model.IEditorModelManager");
            var models = IEditorModelManager.INSTANCE.getModels();

            if (!models || models.isEmpty()) {
                throw new Error("No models loaded in IEditorModelManager");
            }

            // If only one model loaded, return it
            if (models.size() === 1) {
                return models.get(0);
            }

            // Multiple models - find by name match
            for (var i = 0; i < models.size(); i++) {
                var rawModel = models.get(i);
                if (rawModel.getName() === proxyName) {
                    return rawModel;
                }
            }

            // Last resort: return first model
            return models.get(0);

        } catch (e) {
            throw new Error("Failed to extract raw model: " + e.message);
        }
    }

    // Export globally for JArchi
    if (typeof globalThis !== "undefined") {
        globalThis.requireModel = requireModel;
    } else if (typeof global !== "undefined") {
        global.requireModel = requireModel;
    }

    // CommonJS for Node.js build tools
    if (typeof module !== "undefined" && module.exports) {
        module.exports = requireModel;
    }
})();
