/**
 * scriptEndpoints.js - Custom script execution endpoint
 *
 * Handles executing arbitrary JArchi code via POST /scripts/run.
 * Includes temp file management and console output capture.
 *
 * @module server/endpoints/scriptEndpoints
 * @requires server/loggingQueue
 * @requires server/modelSnapshot
 */

(function() {
    "use strict";

    // Guard against double-loading
    if (typeof globalThis !== "undefined" && typeof globalThis.scriptEndpoints !== "undefined") {
        return;
    }

    // Java imports for script file handling
    var System = Java.type("java.lang.System");
    var JavaString = Java.type("java.lang.String");
    var File = Java.type("java.io.File");
    var Files = Java.type("java.nio.file.Files");
    var StandardCharsets = Java.type("java.nio.charset.StandardCharsets");
    var UUID = Java.type("java.util.UUID");

    // CommandHandler initialization state
    // NOTE: CommandHandler.compoundcommands is a private field and cannot be initialized
    // from GraalVM JavaScript. Scripts using JArchi proxy setters (element.name = "...")
    // will fail with NPE. Use /model/apply with updateElement operation instead.

    function formatScriptError(err) {
        if (err && err.stack) {
            var stackLines = String(err.stack).split(/\r?\n/);
            if (stackLines.length > 10) {
                stackLines = stackLines.slice(0, 10).concat(["...(truncated)"]);
            }
            return stackLines.join("\n");
        }
        if (err && err.message) {
            return String(err.name ? err.name + ": " + err.message : err.message);
        }
        return String(err);
    }

    function countWarnings(output) {
        if (!output || !output.length) {
            return 0;
        }
        var warnings = 0;
        for (var i = 0; i < output.length; i++) {
            var entry = output[i];
            if (entry && entry.level === "log" && entry.message && entry.message.indexOf("__") !== -1) {
                warnings++;
            }
        }
        return warnings;
    }

    function appendSummary(output, success, durationMs) {
        var warnings = countWarnings(output);
        output.push({
            level: "log",
            message: "Script summary: success=" + success + ", durationMs=" + durationMs + ", warnings=" + warnings
        });
    }

    /**
     * Script execution endpoint handlers
     */
    var scriptEndpoints = {
        /**
         * Handle POST /scripts/run - Execute JArchi script code
         * 
         * Executes arbitrary JArchi script code using the load() function.
         * The script runs synchronously on the UI thread.
         * 
         * Request body:
         *   - code: string (required) - JavaScript code to execute
         * 
         * Response:
         *   - success: boolean - Whether execution completed without error
         *   - output: array - Captured console output lines
         *   - files: array - File paths created/modified (if script sets __scriptResult.files)
         *   - result: any - Return value (if script sets __scriptResult.value)
         *   - error: string - Error message if execution failed
         *   - durationMs: number - Execution time in milliseconds
         * 
         * Scripts can communicate results by setting global __scriptResult:
         *   __scriptResult = { files: ["path/to/file.png"], value: "any data" };
         * 
         * @param {Object} request - HTTP request object with body.code
         * @param {Object} response - HTTP response object
         * @param {Object} serverState - Server state object
         * @param {string} scriptsDir - Path to scripts directory (__DIR__ from main script)
         */
        handleScriptRun: function(request, response, serverState, scriptsDir) {
            var startTime = Date.now();
            
            // Validate request
            if (!request.body || !Object.prototype.hasOwnProperty.call(request.body, "code")) {
                response.statusCode = 400;
                response.body = {
                    error: {
                        code: "ValidationError",
                        message: "Missing 'code' field in request body"
                    }
                };
                return;
            }

            if (typeof request.body.code !== "string") {
                response.statusCode = 400;
                response.body = {
                    error: {
                        code: "ValidationError",
                        message: "'code' must be a string"
                    }
                };
                return;
            }

            // Enforce script code length limit
            var maxCodeLen = 51200; // 50 KB default
            if (typeof serverConfig !== "undefined" && serverConfig.request && serverConfig.request.maxScriptCodeLength) {
                maxCodeLen = serverConfig.request.maxScriptCodeLength;
            }
            if (request.body.code.length > maxCodeLen) {
                response.statusCode = 413;
                response.body = {
                    error: {
                        code: "PayloadTooLarge",
                        message: "Script code exceeds maximum length of " + maxCodeLen + " characters (" + request.body.code.length + " provided)"
                    }
                };
                return;
            }

            // Initialize global result containers BEFORE any output is captured
            // These must be on globalThis to survive across load() boundary
            globalThis.__apiScriptOutput = [];
            globalThis.__apiScriptResult = { files: [], value: null };
            globalThis.__apiScriptsDir = scriptsDir;

            // Save original console methods on globalThis BEFORE the wrapper file
            // is loaded. Inside the wrapper, `var console = {...}` is hoisted,
            // which would shadow the host `console` object.  By stashing the
            // originals here (outside the `load()` boundary) we guarantee the
            // references point at the real host methods and can never re-enter
            // through the shadowed object.
            globalThis.__origConsoleLog      = console.log;
            globalThis.__origConsolePrint    = console.print;
            globalThis.__origConsolePrintln  = console.println;
            globalThis.__origConsoleError    = console.error;

            var scriptCode = request.body.code;
            if (/\b__DIR__\b/.test(scriptCode)) {
                scriptCode = scriptCode.replace(/\b__DIR__\b/g, "__scriptsDir__");
                globalThis.__apiScriptOutput.push({
                    level: "log",
                    message: "__DIR__ replaced with __scriptsDir__ for API execution."
                });
            }
            
            if (typeof loggingQueue !== "undefined" && loggingQueue) {
                loggingQueue.log("[" + request.requestId + "] Script run: " + scriptCode.length + " chars");
            }

            // Create temp file for script
            var tempDir = new File(System.getProperty("java.io.tmpdir"));
            var scriptId = UUID.randomUUID().toString().substring(0, 8);
            var tempFile = new File(tempDir, "jarchi_script_" + scriptId + ".ajs");
            
            if (/__scriptResult\s*=/.test(scriptCode)) {
                globalThis.__apiScriptOutput.push({
                    level: "log",
                    message: "__scriptResult reassignment detected; mutate properties instead."
                });
            }
            
            try {
                // Wrap script code to capture output and results
                // Use globalThis for all shared state to survive load() boundary
                var wrappedCode = [
                    "// Auto-generated wrapper for API script execution",
                    "// Original console methods were saved to globalThis BEFORE this",
                    "// file was loaded — see scriptEndpoints.js.  We reference them",
                    "// via globalThis so the var-hoisted `console` shadow below can",
                    "// never cause infinite recursion.",
                    "var __originalConsoleLog     = globalThis.__origConsoleLog;",
                    "var __originalConsolePrint   = globalThis.__origConsolePrint;",
                    "var __originalConsolePrintln = globalThis.__origConsolePrintln;",
                    "var __originalConsoleError   = globalThis.__origConsoleError;",
                    "",
                    "// Re-entrancy guard: in GraalVM, load() runs in the global scope so",
                    "// 'var console = {...}' replaces the global console.  If the host's",
                    "// original console.log internally calls console.log, it hits our",
                    "// wrapper again causing infinite recursion.  The guard prevents this.",
                    "var __consoleGuard = false;",
                    "",
                    "// Shadow the entire console binding with a plain JS object.",
                    "// GraalVM's host-backed console object silently ignores property",
                    "// assignment, so patching individual methods (console.log = fn) fails.",
                    "// A var declaration in the wrapper scope shadows the host binding.",
                    "var console = {",
                    "    log: function() {",
                    "        if (__consoleGuard) return;",
                    "        __consoleGuard = true;",
                    "        try {",
                    "            var args = Array.prototype.slice.call(arguments);",
                    "            var msg = args.map(function(a) { return String(a); }).join(' ');",
                    "            globalThis.__apiScriptOutput.push({ level: 'log', message: msg });",
                    "            __originalConsoleLog.apply(null, args);",
                    "        } finally { __consoleGuard = false; }",
                    "    },",
                    "    print: function() {",
                    "        if (__consoleGuard) return;",
                    "        __consoleGuard = true;",
                    "        try {",
                    "            var args = Array.prototype.slice.call(arguments);",
                    "            var msg = args.map(function(a) { return String(a); }).join('');",
                    "            globalThis.__apiScriptOutput.push({ level: 'print', message: msg });",
                    "            __originalConsolePrint.apply(null, args);",
                    "        } finally { __consoleGuard = false; }",
                    "    },",
                    "    println: function() {",
                    "        if (__consoleGuard) return;",
                    "        __consoleGuard = true;",
                    "        try {",
                    "            var args = Array.prototype.slice.call(arguments);",
                    "            var msg = args.map(function(a) { return String(a); }).join('');",
                    "            globalThis.__apiScriptOutput.push({ level: 'println', message: msg });",
                    "            __originalConsolePrintln.apply(null, args);",
                    "        } finally { __consoleGuard = false; }",
                    "    },",
                    "    error: function() {",
                    "        if (__consoleGuard) return;",
                    "        __consoleGuard = true;",
                    "        try {",
                    "            var args = Array.prototype.slice.call(arguments);",
                    "            var msg = args.map(function(a) { return String(a); }).join(' ');",
                    "            globalThis.__apiScriptOutput.push({ level: 'error', message: msg });",
                    "            __originalConsoleError.apply(null, args);",
                    "        } finally { __consoleGuard = false; }",
                    "    },",
                    "    warn: function() {",
                    "        if (__consoleGuard) return;",
                    "        __consoleGuard = true;",
                    "        try {",
                    "            var args = Array.prototype.slice.call(arguments);",
                    "            var msg = args.map(function(a) { return String(a); }).join(' ');",
                    "            globalThis.__apiScriptOutput.push({ level: 'warn', message: msg });",
                    "            __originalConsoleLog.apply(null, args);",
                    "        } finally { __consoleGuard = false; }",
                    "    }",
                    "};",
                    "",
                    "// Provide __scriptsDir__ for loading libs (JArchi overrides __DIR__)",
                    "var __scriptsDir__ = globalThis.__apiScriptsDir;",
                    "",
                    "// Provide __scriptResult for user scripts to set output",
                    "try {",
                    "    var __desc = Object.getOwnPropertyDescriptor(globalThis, '__scriptResult');",
                    "    if (!__desc || __desc.configurable) {",
                    "        Object.defineProperty(globalThis, '__scriptResult', {",
                    "            configurable: true,",
                    "            get: function() { return globalThis.__apiScriptResult; },",
                    "            set: function(_) {",
                    "                globalThis.__apiScriptOutput.push({ level: 'log', message: '__scriptResult reassignment ignored; mutate properties instead.' });",
                    "            }",
                    "        });",
                    "    }",
                    "} catch (e) {",
                    "    // Ignore defineProperty errors",
                    "}",
                    "var __scriptResult = globalThis.__apiScriptResult;",
                    "",
                    "// === API Helper Functions (Preamble) ===",
                    "// These helpers provide model access without requiring UI selection context",
                    "",
                    "/**",
                    " * Get the first loaded model. Use this instead of $() which requires UI context.",
                    " * @returns {Object|null} The first loaded model, or null if no model is loaded.",
                    " */",
                    "function getModel() {",
                    "    var models = $.model.getLoadedModels();",
                    "    return models && models.size() > 0 ? models.get(0) : null;",
                    "}",
                    "",
                    "/**",
                    " * Find elements in the model, with safe handling of no-argument case.",
                    " * @param {string} [type] - Element type selector (e.g., 'business-actor', 'application-component').",
                    " *                          If omitted, returns all elements.",
                    " * @returns {Array} Array of matching elements with id, name, type properties.",
                    " */",
                    "function findElements(type) {",
                    "    var model = getModel();",
                    "    if (!model) return [];",
                    "    var selector = type ? type : 'element';",
                    "    var results = [];",
                    "    var elements = model.find(selector);",
                    "    elements.each(function(e) {",
                    "        results.push({",
                    "            id: e.id,",
                    "            name: e.name || '',",
                    "            type: e.type,",
                    "            documentation: e.documentation || ''",
                    "        });",
                    "    });",
                    "    return results;",
                    "}",
                    "",
                    "/**",
                    " * Find views in the model, with safe handling of no-argument case.",
                    " * @param {string} [name] - Optional name pattern to filter views.",
                    " * @returns {Array} Array of matching views with id, name, type properties.",
                    " */",
                    "function findViews(name) {",
                    "    var model = getModel();",
                    "    if (!model) return [];",
                    "    var results = [];",
                    "    var views = model.find('view');",
                    "    views.each(function(v) {",
                    "        if (!name || v.name.indexOf(name) !== -1) {",
                    "            results.push({",
                    "                id: v.id,",
                    "                name: v.name || '',",
                    "                type: v.type",
                    "            });",
                    "        }",
                    "    });",
                    "    return results;",
                    "}",
                    "",
                    "/**",
                    " * Find relationships in the model.",
                    " * @param {string} [type] - Relationship type selector (e.g., 'serving-relationship').",
                    " *                          If omitted, returns all relationships.",
                    " * @returns {Array} Array of matching relationships.",
                    " */",
                    "function findRelationships(type) {",
                    "    var model = getModel();",
                    "    if (!model) return [];",
                    "    var selector = type ? type : 'relationship';",
                    "    var results = [];",
                    "    var rels = model.find(selector);",
                    "    rels.each(function(r) {",
                    "        results.push({",
                    "            id: r.id,",
                    "            name: r.name || '',",
                    "            type: r.type,",
                    "            sourceId: r.source ? r.source.id : null,",
                    "            targetId: r.target ? r.target.id : null",
                    "        });",
                    "    });",
                    "    return results;",
                    "}",
                    "",
                    "// Auto-bind $ to the loaded model so $() selectors work",
                    "// without requiring UI selection context.",
                    "var __autoModel = (function() {",
                    "    try {",
                    "        var models = $.model.getLoadedModels();",
                    "        return models && models.size() > 0 ? models.get(0) : null;",
                    "    } catch(e) { return null; }",
                    "})();",
                    "if (__autoModel) {",
                    "    var __original$ = $;",
                    "    var __$Guard = false;",
                    "    $ = function(selector) {",
                    "        if (__$Guard) {",
                    "            return __original$.apply(null, arguments);",
                    "        }",
                    "        __$Guard = true;",
                    "        try {",
                    "            if (arguments.length === 1) {",
                    "                return __original$(selector, __autoModel);",
                    "            }",
                    "            return __original$.apply(null, arguments);",
                    "        } finally { __$Guard = false; }",
                    "    };",
                    "    // Copy static properties (e.g. $.model)",
                    "    for (var __k in __original$) {",
                    "        if (__original$.hasOwnProperty(__k)) { $[__k] = __original$[__k]; }",
                    "    }",
                    "}",
                    "",
                    "// Pre-bind 'model' for convenience — scripts can use model.find() directly",
                    "var model = getModel();",
                    "",
                    "// Execute user script — last expression value is captured by load()",
                    scriptCode,
                    ""
                ].join("\n");
                
                // Write to temp file
                Files.write(tempFile.toPath(), 
                    new JavaString(wrappedCode).getBytes(StandardCharsets.UTF_8));
                
                if (typeof loggingQueue !== "undefined" && loggingQueue) {
                    loggingQueue.log("[" + request.requestId + "] Temp script: " + tempFile.getAbsolutePath());
                }
                
                // NOTE: JArchi proxy property setters (element.name = "...") will fail with NPE
                // because CommandHandler.compoundcommands is private and cannot be initialized.
                // Use /model/apply with updateElement operation for property modifications.
                
                // Execute script using load()
                // GraalVM's load() returns the completion value of the last expression,
                // so we capture it to populate the result field.
                var execError = null;
                var loadResult;
                try {
                    loadResult = load(tempFile.getAbsolutePath());
                } catch (e) {
                    execError = e;
                }
                
                // Capture load() return value if script didn't explicitly set result
                if (loadResult !== undefined && loadResult !== null) {
                    if (globalThis.__apiScriptResult && 
                        (globalThis.__apiScriptResult.value === undefined || globalThis.__apiScriptResult.value === null)) {
                        globalThis.__apiScriptResult.value = loadResult;
                    }
                }
                
                // Collect results from globalThis
                var output = globalThis.__apiScriptOutput || [];
                var files = globalThis.__apiScriptResult ? (globalThis.__apiScriptResult.files || []) : [];
                var resultValue = globalThis.__apiScriptResult ? globalThis.__apiScriptResult.value : null;
                
                // Clean up globals
                delete globalThis.__apiScriptOutput;
                delete globalThis.__apiScriptResult;
                delete globalThis.__apiScriptsDir;
                delete globalThis.__origConsoleLog;
                delete globalThis.__origConsolePrint;
                delete globalThis.__origConsolePrintln;
                delete globalThis.__origConsoleError;
                
                // Refresh model snapshot after script execution
                if (typeof modelSnapshot !== "undefined" && modelSnapshot && serverState.modelRef) {
                    try {
                        modelSnapshot.refreshSnapshot(serverState.modelRef);
                    } catch (e) {
                        if (typeof loggingQueue !== "undefined" && loggingQueue) {
                            loggingQueue.warn("[" + request.requestId + "] Failed to refresh snapshot: " + e);
                        }
                    }
                }
                
                var durationMs = Date.now() - startTime;
                
                if (execError) {
                    // Provide more helpful error message for common $() selector failure
                    var errorMsg = formatScriptError(execError);
                    if (errorMsg.indexOf("Could not get the currently selected model") !== -1) {
                        var detailedError = errorMsg;
                        errorMsg = "$() requires UI selection context which is not available via API. " +
                            "Use the pre-bound helpers instead: 'model' (pre-bound to loaded model), " +
                            "getModel(), findElements(type), findViews(name), findRelationships(type). " +
                            "Example: model.find('element').each(function(e) { console.log(e.name); });";
                        output.push({ level: "error", message: detailedError });
                    }
                    
                    if (typeof loggingQueue !== "undefined" && loggingQueue) {
                        loggingQueue.error("[" + request.requestId + "] Script error: " + execError);
                    }
                    
                    appendSummary(output, false, durationMs);
                    response.body = {
                        success: false,
                        error: errorMsg,
                        output: output,
                        files: files,
                        durationMs: durationMs
                    };
                } else {
                    if (typeof loggingQueue !== "undefined" && loggingQueue) {
                        loggingQueue.log("[" + request.requestId + "] Script completed in " + durationMs + "ms");
                    }
                    appendSummary(output, true, durationMs);
                    response.body = {
                        success: true,
                        output: output,
                        files: files,
                        result: resultValue,
                        durationMs: durationMs
                    };
                }
                
            } catch (e) {
                var durationMs = Date.now() - startTime;
                
                if (typeof loggingQueue !== "undefined" && loggingQueue) {
                    loggingQueue.error("[" + request.requestId + "] Script execution failed: " + e);
                }
                
                response.statusCode = 500;
                response.body = {
                    success: false,
                    error: {
                        code: "ScriptExecutionError",
                        message: formatScriptError(e)
                    },
                    durationMs: durationMs
                };
            } finally {
                // Cleanup temp file
                try {
                    if (tempFile.exists()) {
                        tempFile.delete();
                    }
                } catch (e) { /* ignore cleanup errors */ }
            }
        }
    };

    // Export globally for JArchi
    if (typeof globalThis !== "undefined") {
        globalThis.scriptEndpoints = scriptEndpoints;
    } else if (typeof global !== "undefined") {
        global.scriptEndpoints = scriptEndpoints;
    }

    // CommonJS for Node.js build tools
    if (typeof module !== "undefined" && module.exports) {
        module.exports = scriptEndpoints;
    }

})();
