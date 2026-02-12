/**
 * settingsTab.js - Settings tab for the server monitor dialog
 *
 * Displays all server configuration values organized in groups.
 * Rate limiting and operation processing settings are editable at runtime
 * (session-only, not persisted). All other settings are read-only.
 *
 * @module server/tabs/settingsTab
 * @requires lib/core/swtImports
 * @requires server/serverConfig
 */

(function() {
    "use strict";

    // Guard against double-loading
    if (typeof globalThis !== "undefined" && typeof globalThis.settingsTab !== "undefined") {
        return;
    }

    /**
     * Helper to create a read-only label pair (key: value) in a 2-column group
     * @param {Composite} parent - Parent composite
     * @param {string} labelText - Key label
     * @param {string} valueText - Value text
     * @returns {Label} The value label widget
     */
    function createReadOnlyRow(parent, labelText, valueText) {
        var SWT = swtImports.SWT;
        var Label = swtImports.Label;
        var GridData = swtImports.GridData;

        var keyLabel = new Label(parent, SWT.NONE);
        keyLabel.setText(labelText);

        var valueLabel = new Label(parent, SWT.NONE);
        valueLabel.setText(String(valueText));
        valueLabel.setLayoutData(new GridData(SWT.FILL, SWT.CENTER, true, false));

        return valueLabel;
    }

    /**
     * Helper to create an editable text field row in a 2-column group
     * @param {Composite} parent - Parent composite
     * @param {string} labelText - Key label
     * @param {string} valueText - Initial value
     * @returns {Text} The text input widget
     */
    function createEditableRow(parent, labelText, valueText) {
        var SWT = swtImports.SWT;
        var Label = swtImports.Label;
        var Text = swtImports.Text;
        var GridData = swtImports.GridData;

        var keyLabel = new Label(parent, SWT.NONE);
        keyLabel.setText(labelText);

        var textField = new Text(parent, SWT.SINGLE | SWT.BORDER);
        textField.setText(String(valueText));
        var gd = new GridData(SWT.FILL, SWT.CENTER, true, false);
        gd.widthHint = 150;
        textField.setLayoutData(gd);

        return textField;
    }

    /**
     * Helper to create a checkbox row in a 2-column group
     * @param {Composite} parent - Parent composite
     * @param {string} labelText - Key label
     * @param {boolean} checked - Initial state
     * @returns {Button} The checkbox widget
     */
    function createCheckboxRow(parent, labelText, checked) {
        var SWT = swtImports.SWT;
        var Label = swtImports.Label;
        var Button = swtImports.Button;
        var GridData = swtImports.GridData;

        var keyLabel = new Label(parent, SWT.NONE);
        keyLabel.setText(labelText);

        var checkbox = new Button(parent, SWT.CHECK);
        checkbox.setSelection(checked);
        checkbox.setLayoutData(new GridData(SWT.LEFT, SWT.CENTER, false, false));

        return checkbox;
    }

    /**
     * Create a labeled Group with 2-column GridLayout
     * @param {Composite} parent - Parent composite
     * @param {string} title - Group title
     * @returns {Group} The created Group widget
     */
    function createGroup(parent, title) {
        var SWT = swtImports.SWT;
        var Group = swtImports.Group;
        var GridLayout = swtImports.GridLayout;
        var GridData = swtImports.GridData;

        var group = new Group(parent, SWT.NONE);
        group.setText(title);
        var groupLayout = new GridLayout(2, false);
        groupLayout.marginWidth = 10;
        groupLayout.marginHeight = 8;
        group.setLayout(groupLayout);
        group.setLayoutData(new GridData(SWT.FILL, SWT.TOP, true, false));

        return group;
    }

    var settingsTab = {
        /**
         * Create the Settings tab content
         * @param {TabFolder} tabFolder - Parent TabFolder widget
         * @param {Display} display - SWT Display
         * @returns {Object} { tabItem, composite }
         */
        create: function(tabFolder, display) {
            var SWT = swtImports.SWT;
            var TabItem = swtImports.TabItem;
            var Composite = swtImports.Composite;
            var GridLayout = swtImports.GridLayout;
            var GridData = swtImports.GridData;
            var Button = swtImports.Button;
            var ScrolledComposite = swtImports.ScrolledComposite;
            var MessageDialog = Java.type("org.eclipse.jface.dialogs.MessageDialog");

            // Create tab item
            var tabItem = new TabItem(tabFolder, SWT.NONE);
            tabItem.setText("Settings");

            // Outer composite to hold scrolled area + buttons
            var outerComposite = new Composite(tabFolder, SWT.NONE);
            var outerLayout = new GridLayout(1, false);
            outerLayout.marginWidth = 5;
            outerLayout.marginHeight = 5;
            outerComposite.setLayout(outerLayout);
            tabItem.setControl(outerComposite);

            // Scrolled composite for settings groups
            var scrolled = new ScrolledComposite(outerComposite, SWT.V_SCROLL | SWT.H_SCROLL);
            scrolled.setLayoutData(new GridData(SWT.FILL, SWT.FILL, true, true));
            scrolled.setExpandHorizontal(true);
            scrolled.setExpandVertical(true);

            // Inner composite for all groups
            var innerComposite = new Composite(scrolled, SWT.NONE);
            var innerLayout = new GridLayout(1, false);
            innerLayout.marginWidth = 5;
            innerLayout.marginHeight = 5;
            innerComposite.setLayout(innerLayout);

            // Snapshot original editable values for Reset
            var originalValues = {
                rateLimitEnabled: serverConfig.rateLimit.enabled,
                rateLimitMaxRequests: serverConfig.rateLimit.maxRequests,
                rateLimitWindowMs: serverConfig.rateLimit.windowMs,
                rateLimitBlockDurationMs: serverConfig.rateLimit.blockDurationMs,
                operationsTimeoutMs: serverConfig.operations.timeoutMs,
                operationsMaxOpsPerCycle: serverConfig.operations.maxOpsPerCycle,
                operationsProcessorInterval: serverConfig.operations.processorInterval
            };

            // Widget references for editable fields
            var widgets = {};

            // --- Server Group (read-only) ---
            var serverGroup = createGroup(innerComposite, "Server");
            createReadOnlyRow(serverGroup, "Host:", serverConfig.server.host);
            createReadOnlyRow(serverGroup, "Port:", serverConfig.server.port);
            createReadOnlyRow(serverGroup, "Version:", serverConfig.server.version);

            // --- Rate Limiting Group (editable) ---
            var rateLimitGroup = createGroup(innerComposite, "Rate Limiting (editable)");
            widgets.enabled = createCheckboxRow(rateLimitGroup, "Enabled:",
                serverConfig.rateLimit.enabled);
            widgets.maxRequests = createEditableRow(rateLimitGroup, "Max Requests (per window):",
                serverConfig.rateLimit.maxRequests);
            widgets.windowMs = createEditableRow(rateLimitGroup, "Window (ms):",
                serverConfig.rateLimit.windowMs);
            widgets.blockDurationMs = createEditableRow(rateLimitGroup, "Block Duration (ms):",
                serverConfig.rateLimit.blockDurationMs);

            // --- Operation Processing Group (editable) ---
            var opsGroup = createGroup(innerComposite, "Operation Processing (editable)");
            widgets.timeoutMs = createEditableRow(opsGroup, "Timeout (ms):",
                serverConfig.operations.timeoutMs);
            widgets.maxOpsPerCycle = createEditableRow(opsGroup, "Max Ops Per Cycle:",
                serverConfig.operations.maxOpsPerCycle);
            widgets.processorInterval = createEditableRow(opsGroup, "Processor Interval (ms):",
                serverConfig.operations.processorInterval);

            // --- Request Limits Group (read-only) ---
            var requestGroup = createGroup(innerComposite, "Request Limits");
            createReadOnlyRow(requestGroup, "Max Body Size:",
                Math.round(serverConfig.request.maxBodySize / 1024) + " KB");
            createReadOnlyRow(requestGroup, "Max Changes Per Request:",
                serverConfig.request.maxChangesPerRequest);
            createReadOnlyRow(requestGroup, "Max Script Code Length:",
                Math.round(serverConfig.request.maxScriptCodeLength / 1024) + " KB");

            // --- CORS & Security Group (read-only) ---
            var securityGroup = createGroup(innerComposite, "CORS & Security");
            createReadOnlyRow(securityGroup, "CORS Enabled:",
                serverConfig.security.corsEnabled ? "Yes" : "No");
            createReadOnlyRow(securityGroup, "CORS Allow All:",
                serverConfig.security.corsAllowAll ? "Yes" : "No");
            createReadOnlyRow(securityGroup, "Allowed Origins:",
                serverConfig.security.corsOrigins.join(", ") || "(none)");

            // Security headers
            var headerKeys = Object.keys(serverConfig.security.headers);
            for (var i = 0; i < headerKeys.length; i++) {
                createReadOnlyRow(securityGroup, headerKeys[i] + ":",
                    serverConfig.security.headers[headerKeys[i]]);
            }

            // --- Logging Group (read-only) ---
            var loggingGroup = createGroup(innerComposite, "Logging");
            createReadOnlyRow(loggingGroup, "Max Lines:", serverConfig.logging.maxLines);
            createReadOnlyRow(loggingGroup, "Max Lines Per Cycle:", serverConfig.logging.maxLinesPerCycle);
            createReadOnlyRow(loggingGroup, "Flush Interval (ms):", serverConfig.logging.flushInterval);
            createReadOnlyRow(loggingGroup, "Include Request ID:",
                serverConfig.logging.includeRequestId ? "Yes" : "No");

            // Set scrolled composite content and size
            scrolled.setContent(innerComposite);
            scrolled.setMinSize(innerComposite.computeSize(SWT.DEFAULT, SWT.DEFAULT));

            // --- Button row ---
            var buttonContainer = new Composite(outerComposite, SWT.NONE);
            buttonContainer.setLayout(new GridLayout(2, false));
            buttonContainer.setLayoutData(new GridData(SWT.RIGHT, SWT.CENTER, true, false));

            // Apply button
            var applyButton = new Button(buttonContainer, SWT.PUSH);
            applyButton.setText("Apply");
            applyButton.addListener(SWT.Selection, function() {
                try {
                    // Validate numeric fields
                    var newMaxRequests = parseInt(widgets.maxRequests.getText(), 10);
                    var newWindowMs = parseInt(widgets.windowMs.getText(), 10);
                    var newBlockDurationMs = parseInt(widgets.blockDurationMs.getText(), 10);
                    var newTimeoutMs = parseInt(widgets.timeoutMs.getText(), 10);
                    var newMaxOpsPerCycle = parseInt(widgets.maxOpsPerCycle.getText(), 10);
                    var newProcessorInterval = parseInt(widgets.processorInterval.getText(), 10);

                    // Validation
                    var errors = [];
                    if (isNaN(newMaxRequests) || newMaxRequests <= 0) {
                        errors.push("Max Requests must be a positive number");
                    }
                    if (isNaN(newWindowMs) || newWindowMs <= 0) {
                        errors.push("Window must be a positive number");
                    }
                    if (isNaN(newBlockDurationMs) || newBlockDurationMs <= 0) {
                        errors.push("Block Duration must be a positive number");
                    }
                    if (isNaN(newTimeoutMs) || newTimeoutMs <= 0) {
                        errors.push("Timeout must be a positive number");
                    }
                    if (isNaN(newMaxOpsPerCycle) || newMaxOpsPerCycle <= 0) {
                        errors.push("Max Ops Per Cycle must be a positive number");
                    }
                    if (isNaN(newProcessorInterval) || newProcessorInterval <= 0) {
                        errors.push("Processor Interval must be a positive number");
                    }

                    if (errors.length > 0) {
                        MessageDialog.openError(
                            tabFolder.getShell(),
                            "Validation Error",
                            errors.join("\n")
                        );
                        return;
                    }

                    // Apply to serverConfig
                    serverConfig.rateLimit.enabled = widgets.enabled.getSelection();
                    serverConfig.rateLimit.maxRequests = newMaxRequests;
                    serverConfig.rateLimit.windowMs = newWindowMs;
                    serverConfig.rateLimit.blockDurationMs = newBlockDurationMs;
                    serverConfig.operations.timeoutMs = newTimeoutMs;
                    serverConfig.operations.maxOpsPerCycle = newMaxOpsPerCycle;
                    serverConfig.operations.processorInterval = newProcessorInterval;

                    if (typeof loggingQueue !== "undefined") {
                        loggingQueue.log("Settings applied (session-only)");
                    }
                } catch (e) {
                    if (typeof loggingQueue !== "undefined") {
                        loggingQueue.error("Failed to apply settings: " + e);
                    }
                }
            });

            // Reset button
            var resetButton = new Button(buttonContainer, SWT.PUSH);
            resetButton.setText("Reset");
            resetButton.addListener(SWT.Selection, function() {
                // Restore original values to serverConfig
                serverConfig.rateLimit.enabled = originalValues.rateLimitEnabled;
                serverConfig.rateLimit.maxRequests = originalValues.rateLimitMaxRequests;
                serverConfig.rateLimit.windowMs = originalValues.rateLimitWindowMs;
                serverConfig.rateLimit.blockDurationMs = originalValues.rateLimitBlockDurationMs;
                serverConfig.operations.timeoutMs = originalValues.operationsTimeoutMs;
                serverConfig.operations.maxOpsPerCycle = originalValues.operationsMaxOpsPerCycle;
                serverConfig.operations.processorInterval = originalValues.operationsProcessorInterval;

                // Update widgets
                widgets.enabled.setSelection(originalValues.rateLimitEnabled);
                widgets.maxRequests.setText(String(originalValues.rateLimitMaxRequests));
                widgets.windowMs.setText(String(originalValues.rateLimitWindowMs));
                widgets.blockDurationMs.setText(String(originalValues.rateLimitBlockDurationMs));
                widgets.timeoutMs.setText(String(originalValues.operationsTimeoutMs));
                widgets.maxOpsPerCycle.setText(String(originalValues.operationsMaxOpsPerCycle));
                widgets.processorInterval.setText(String(originalValues.operationsProcessorInterval));

                if (typeof loggingQueue !== "undefined") {
                    loggingQueue.log("Settings reset to startup values");
                }
            });

            return {
                tabItem: tabItem,
                composite: outerComposite
            };
        }
    };

    // Export globally for JArchi
    if (typeof globalThis !== "undefined") {
        globalThis.settingsTab = settingsTab;
    } else if (typeof global !== "undefined") {
        global.settingsTab = settingsTab;
    }

})();
