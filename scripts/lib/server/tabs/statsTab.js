/**
 * statsTab.js - Stats tab for the server monitor dialog
 *
 * Displays a live dashboard with server metrics, operation stats,
 * model summary, rate limiting status, and recent operations table.
 * Auto-refreshes every 3 seconds via Display.timerExec.
 *
 * @module server/tabs/statsTab
 * @requires lib/core/swtImports
 * @requires server/serverConfig
 * @requires server/operationQueue
 * @requires server/modelSnapshot
 */

(function() {
    "use strict";

    // Guard against double-loading
    if (typeof globalThis !== "undefined" && typeof globalThis.statsTab !== "undefined") {
        return;
    }

    var REFRESH_INTERVAL_MS = 3000;

    /**
     * Format milliseconds as a human-readable uptime string
     * @param {number} ms - Milliseconds
     * @returns {string} Formatted uptime (e.g., "1d 2h 30m 15s")
     */
    function formatUptime(ms) {
        var seconds = Math.floor(ms / 1000);
        var minutes = Math.floor(seconds / 60);
        var hours = Math.floor(minutes / 60);
        var days = Math.floor(hours / 24);
        hours = hours % 24;
        minutes = minutes % 60;
        seconds = seconds % 60;
        var parts = [];
        if (days > 0) parts.push(days + "d");
        if (hours > 0) parts.push(hours + "h");
        if (minutes > 0) parts.push(minutes + "m");
        parts.push(seconds + "s");
        return parts.join(" ");
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

    /**
     * Create a label pair (key + value) in a 2-column group
     * @param {Composite} parent - Parent composite
     * @param {string} labelText - Key label
     * @param {string} initialValue - Initial value text
     * @returns {Label} The value label widget (for updates)
     */
    function createStatRow(parent, labelText, initialValue) {
        var SWT = swtImports.SWT;
        var Label = swtImports.Label;
        var GridData = swtImports.GridData;

        var keyLabel = new Label(parent, SWT.NONE);
        keyLabel.setText(labelText);

        var valueLabel = new Label(parent, SWT.NONE);
        valueLabel.setText(String(initialValue));
        var gd = new GridData(SWT.FILL, SWT.CENTER, true, false);
        gd.widthHint = 200;
        valueLabel.setLayoutData(gd);

        return valueLabel;
    }

    var statsTab = {
        /**
         * Create the Stats tab content
         * @param {TabFolder} tabFolder - Parent TabFolder widget
         * @param {Display} display - SWT Display
         * @param {Object} options - Options
         * @returns {Object} { tabItem, composite, setServerState(state), dispose() }
         */
        create: function(tabFolder, display, options) {
            var SWT = swtImports.SWT;
            var TabItem = swtImports.TabItem;
            var Composite = swtImports.Composite;
            var GridLayout = swtImports.GridLayout;
            var GridData = swtImports.GridData;
            var Table = swtImports.Table;
            var TableItem = swtImports.TableItem;
            var TableColumn = swtImports.TableColumn;
            var ScrolledComposite = swtImports.ScrolledComposite;

            var Runnable = Java.type("java.lang.Runnable");
            var Runtime = Java.type("java.lang.Runtime");

            // Create tab item
            var tabItem = new TabItem(tabFolder, SWT.NONE);
            tabItem.setText("Stats");

            // Outer composite to hold scrolled area
            var outerComposite = new Composite(tabFolder, SWT.NONE);
            var outerLayout = new GridLayout(1, false);
            outerLayout.marginWidth = 5;
            outerLayout.marginHeight = 5;
            outerComposite.setLayout(outerLayout);
            tabItem.setControl(outerComposite);

            // Scrolled composite for stats content
            var scrolled = new ScrolledComposite(outerComposite, SWT.V_SCROLL | SWT.H_SCROLL);
            scrolled.setLayoutData(new GridData(SWT.FILL, SWT.FILL, true, true));
            scrolled.setExpandHorizontal(true);
            scrolled.setExpandVertical(true);

            // Inner composite - 2 column layout for groups side by side
            var innerComposite = new Composite(scrolled, SWT.NONE);
            var innerLayout = new GridLayout(2, true);
            innerLayout.marginWidth = 5;
            innerLayout.marginHeight = 5;
            innerComposite.setLayout(innerLayout);

            // --- Server Metrics Group ---
            var serverGroup = createGroup(innerComposite, "Server");
            var uptimeLabel = createStatRow(serverGroup, "Uptime:", "--");
            var totalMemLabel = createStatRow(serverGroup, "Total Memory:", "--");
            var usedMemLabel = createStatRow(serverGroup, "Used Memory:", "--");
            var freeMemLabel = createStatRow(serverGroup, "Free Memory:", "--");
            var maxMemLabel = createStatRow(serverGroup, "Max Memory:", "--");

            // --- Operations Group ---
            var opsGroup = createGroup(innerComposite, "Operations");
            var queuedLabel = createStatRow(opsGroup, "Queued:", "0");
            var processingLabel = createStatRow(opsGroup, "Processing:", "0");
            var completedLabel = createStatRow(opsGroup, "Completed:", "0");
            var errorsLabel = createStatRow(opsGroup, "Errors:", "0");
            var totalLabel = createStatRow(opsGroup, "Total:", "0");

            // --- Model Summary Group ---
            var modelGroup = createGroup(innerComposite, "Model Summary");
            var elementsLabel = createStatRow(modelGroup, "Elements:", "--");
            var relsLabel = createStatRow(modelGroup, "Relationships:", "--");
            var viewsLabel = createStatRow(modelGroup, "Views:", "--");

            // --- Rate Limiting Group ---
            var rateLimitGroup = createGroup(innerComposite, "Rate Limiting");
            var rateLimitStatusLabel = createStatRow(rateLimitGroup, "Status:", "--");
            var trackedClientsLabel = createStatRow(rateLimitGroup, "Tracked Clients:", "0");
            var blockedClientsLabel = createStatRow(rateLimitGroup, "Blocked Clients:", "0");
            var requestsInWindowLabel = createStatRow(rateLimitGroup, "Requests in Window:", "0");

            // --- Recent Operations Table ---
            // Spanning both columns
            var tableLabel = new swtImports.Label(innerComposite, SWT.NONE);
            tableLabel.setText("Recent Operations");
            var tableLabelGd = new GridData(SWT.LEFT, SWT.CENTER, false, false);
            tableLabelGd.horizontalSpan = 2;
            tableLabel.setLayoutData(tableLabelGd);

            var opsTable = new Table(innerComposite, SWT.BORDER | SWT.FULL_SELECTION);
            opsTable.setHeaderVisible(true);
            opsTable.setLinesVisible(true);
            var opsTableGd = new GridData(SWT.FILL, SWT.FILL, true, true);
            opsTableGd.horizontalSpan = 2;
            opsTableGd.heightHint = 180;
            opsTable.setLayoutData(opsTableGd);

            var columns = [
                { name: "Operation ID", width: 180 },
                { name: "Status", width: 80 },
                { name: "Created", width: 90 },
                { name: "Duration", width: 80 },
                { name: "Changes", width: 70 },
                { name: "Error", width: 350 }
            ];

            for (var c = 0; c < columns.length; c++) {
                var col = new TableColumn(opsTable, SWT.NONE);
                col.setText(columns[c].name);
                col.setWidth(columns[c].width);
            }

            // Set scrolled content
            scrolled.setContent(innerComposite);
            scrolled.setMinSize(innerComposite.computeSize(SWT.DEFAULT, SWT.DEFAULT));

            // --- Auto-refresh timer ---
            var disposed = false;
            var serverState = (options && options.serverState) ? options.serverState : null;

            function refreshStats() {
                if (disposed) return;
                if (outerComposite.isDisposed()) {
                    disposed = true;
                    return;
                }

                try {
                    // Memory metrics
                    var runtime = Runtime.getRuntime();
                    var totalMB = Math.round(runtime.totalMemory() / (1024 * 1024));
                    var freeMB = Math.round(runtime.freeMemory() / (1024 * 1024));
                    var usedMB = totalMB - freeMB;
                    var maxMB = Math.round(runtime.maxMemory() / (1024 * 1024));

                    totalMemLabel.setText(totalMB + " MB");
                    usedMemLabel.setText(usedMB + " MB");
                    freeMemLabel.setText(freeMB + " MB");
                    maxMemLabel.setText(maxMB + " MB");

                    // Uptime
                    if (serverState && serverState.startTime) {
                        uptimeLabel.setText(formatUptime(Date.now() - serverState.startTime));
                    }

                    // Operation stats
                    if (typeof operationQueue !== "undefined") {
                        var stats = operationQueue.getQueueStats();
                        queuedLabel.setText(String(stats.queued));
                        processingLabel.setText(String(stats.processing));
                        completedLabel.setText(String(stats.completed));
                        errorsLabel.setText(String(stats.error));
                        totalLabel.setText(String(stats.total));

                        // Recent operations table
                        var recentOps = operationQueue.listOperations({ limit: 20 });
                        opsTable.removeAll();
                        if (recentOps && recentOps.operations) {
                            var ops = recentOps.operations;
                            for (var i = 0; i < ops.length; i++) {
                                var op = ops[i];
                                var item = new TableItem(opsTable, SWT.NONE);
                                item.setText(0, op.operationId || "");
                                item.setText(1, op.status || "");
                                item.setText(2, op.createdAt ? op.createdAt.substr(11, 8) : "");
                                var duration = (op.completedAt && op.startedAt)
                                    ? String(new Date(op.completedAt).getTime() - new Date(op.startedAt).getTime()) + "ms"
                                    : "-";
                                item.setText(3, duration);
                                item.setText(4, String(op.changeCount || 0));
                                item.setText(5, op.error ? String(op.error).substring(0, 80) : "");
                            }
                        }
                    }

                    // Model summary
                    if (typeof modelSnapshot !== "undefined") {
                        var summary = modelSnapshot.getSummary();
                        elementsLabel.setText(String(summary.elements));
                        relsLabel.setText(String(summary.relationships));
                        viewsLabel.setText(String(summary.views));
                    }

                    // Rate limit stats
                    if (serverState && serverState.serverInstance &&
                        serverState.serverInstance.getRateLimitStats) {
                        var rlStats = serverState.serverInstance.getRateLimitStats();
                        rateLimitStatusLabel.setText(
                            serverConfig.rateLimit.enabled ? "Enabled" : "Disabled");
                        trackedClientsLabel.setText(String(rlStats.totalTrackedClients));
                        blockedClientsLabel.setText(String(rlStats.blockedClients));
                        requestsInWindowLabel.setText(String(rlStats.requestsInCurrentWindow));
                    }

                    // Re-compute scrolled area minimum size after label text changes
                    scrolled.setMinSize(innerComposite.computeSize(SWT.DEFAULT, SWT.DEFAULT));

                } catch (e) {
                    // Silently ignore refresh errors to avoid flooding logs
                }
            }

            // Self-rescheduling refresh timer
            var RefreshRunnable = Java.extend(Runnable, {
                run: function() {
                    if (disposed) return;
                    try {
                        refreshStats();
                    } catch (e) {
                        // Silently ignore
                    }
                    if (!disposed) {
                        display.timerExec(REFRESH_INTERVAL_MS, new RefreshRunnable());
                    }
                }
            });

            // Start refresh timer
            display.timerExec(REFRESH_INTERVAL_MS, new RefreshRunnable());

            return {
                tabItem: tabItem,
                composite: outerComposite,

                /**
                 * Set server state reference (called after server starts)
                 * @param {Object} state - Server state with startTime and serverInstance
                 */
                setServerState: function(state) {
                    serverState = state;
                },

                /**
                 * Stop the refresh timer
                 */
                dispose: function() {
                    disposed = true;
                }
            };
        }
    };

    // Export globally for JArchi
    if (typeof globalThis !== "undefined") {
        globalThis.statsTab = statsTab;
    } else if (typeof global !== "undefined") {
        global.statsTab = statsTab;
    }

})();
