/**
 * monitorUI.js - SWT monitor dialog for server status and logs
 *
 * Creates a modeless SWT dialog showing server status, operation counter,
 * log display, and control buttons. Integrates with loggingQueue for
 * real-time log updates.
 *
 * @module server/monitorUI
 * @requires lib/core/swtImports
 * @requires server/loggingQueue
 */

(function() {
    "use strict";

    // Guard against double-loading
    if (typeof globalThis !== "undefined" && typeof globalThis.monitorUI !== "undefined") {
        return;
    }

    /**
     * Monitor UI management
     */
    var monitorUI = {
        /**
         * UI component references
         * @type {Object}
         */
        shell: null,
        statusLabel: null,
        operationCountLabel: null,
        logText: null,
        stopButton: null,
        monoFont: null,

        /**
         * Configuration
         */
        config: {
            host: "127.0.0.1",
            port: 8765,
            onStop: null,
            onClose: null
        },

        /**
         * Internal state
         * @private
         */
        _isShuttingDown: false,
        _serverRunning: true,

        /**
         * Create monitor dialog
         * @param {Object} options - Configuration options
         * @param {string} options.host - Server host
         * @param {number} options.port - Server port
         * @param {Function} options.onStop - Callback for stop button
         * @param {Function} options.onClose - Callback for close event
         */
        createMonitorDialog: function(options) {
            // Store configuration
            this.config.host = options.host || "127.0.0.1";
            this.config.port = options.port || 8765;
            this.config.onStop = options.onStop || null;
            this.config.onClose = options.onClose || null;

            // Get SWT types
            var SWT = swtImports.SWT;
            var Display = swtImports.Display;
            var Shell = swtImports.Shell;
            var Composite = swtImports.Composite;
            var Label = swtImports.Label;
            var Text = swtImports.Text;
            var Button = swtImports.Button;
            var GridLayout = swtImports.GridLayout;
            var GridData = swtImports.GridData;
            var Font = swtImports.Font;

            var display = Display.getDefault();

            // Create modeless shell with parent (stays on top of parent)
            // Use the 'shell' variable provided by JArchi (Archi main window)
            this.shell = new Shell(shell, SWT.MODELESS | SWT.CLOSE | SWT.TITLE | SWT.BORDER | SWT.RESIZE | SWT.MAX | SWT.MIN);
            this.shell.setText("Model API Server Monitor");
            this.shell.setSize(1400, 700);

            // Layout
            var layout = new GridLayout(1, false);
            layout.marginWidth = 10;
            layout.marginHeight = 10;
            this.shell.setLayout(layout);

            // Create composite for enhanced status bar with multiple labels
            var statusBar = new Composite(this.shell, SWT.NONE);
            var statusBarLayout = new GridLayout(3, false);
            statusBarLayout.marginWidth = 0;
            statusBarLayout.marginHeight = 0;
            statusBar.setLayout(statusBarLayout);
            statusBar.setLayoutData(new GridData(SWT.FILL, SWT.CENTER, true, false));

            // Server status with color indicator
            var statusIndicator = new Label(statusBar, SWT.NONE);
            statusIndicator.setText("● ");
            statusIndicator.setForeground(display.getSystemColor(SWT.COLOR_GREEN));

            this.statusLabel = new Label(statusBar, SWT.NONE);
            this.statusLabel.setText("Server: Listening on " + this.config.host + ":" + this.config.port);
            this.statusLabel.setLayoutData(new GridData(SWT.FILL, SWT.CENTER, true, false));

            // Operation counter
            this.operationCountLabel = new Label(statusBar, SWT.NONE);
            this.operationCountLabel.setText("Operations: 0 queued, 0 completed");
            this.operationCountLabel.setLayoutData(new GridData(SWT.RIGHT, SWT.CENTER, false, false));

            // Separator
            var separator1 = new Label(this.shell, SWT.SEPARATOR | SWT.HORIZONTAL);
            separator1.setLayoutData(new GridData(SWT.FILL, SWT.CENTER, true, false));

            // Log text area
            this.logText = new Text(this.shell, SWT.MULTI | SWT.READ_ONLY | SWT.BORDER | SWT.V_SCROLL | SWT.H_SCROLL);
            var logGridData = new GridData(SWT.FILL, SWT.FILL, true, true);
            logGridData.heightHint = 300;
            this.logText.setLayoutData(logGridData);

            // Set monospace font
            var fontData = this.logText.getFont().getFontData()[0];
            this.monoFont = new Font(display, fontData.getName(), fontData.getHeight(), SWT.NORMAL);
            this.logText.setFont(this.monoFont);

            // Add font disposal listener
            var self = this;
            this.shell.addListener(SWT.Dispose, function() {
                if (self.monoFont && !self.monoFont.isDisposed()) {
                    self.monoFont.dispose();
                }
            });

            // Button container
            var buttonContainer = new Composite(this.shell, SWT.NONE);
            buttonContainer.setLayout(new GridLayout(3, false));
            buttonContainer.setLayoutData(new GridData(SWT.RIGHT, SWT.CENTER, true, false));

            // Clear button
            var clearButton = new Button(buttonContainer, SWT.PUSH);
            clearButton.setText("Clear");
            clearButton.setLayoutData(new GridData(SWT.RIGHT, SWT.CENTER, false, false));
            clearButton.addListener(SWT.Selection, function() {
                self.logText.setText("");
            });

            // Export button
            var exportButton = new Button(buttonContainer, SWT.PUSH);
            exportButton.setText("Export Log");
            exportButton.setLayoutData(new GridData(SWT.RIGHT, SWT.CENTER, false, false));
            exportButton.addListener(SWT.Selection, function() {
                self._exportLog();
            });

            // Stop button
            this.stopButton = new Button(buttonContainer, SWT.PUSH);
            this.stopButton.setText("Stop Server");
            this.stopButton.setLayoutData(new GridData(SWT.RIGHT, SWT.CENTER, false, false));
            this.stopButton.addListener(SWT.Selection, function() {
                self._onStopButton();
            });

            // Close handler
            this.shell.addListener(SWT.Close, function(event) {
                self._onCloseAttempt(event);
            });

            // Center on screen
            var monitor = display.getPrimaryMonitor();
            var bounds = monitor.getBounds();
            var shellBounds = this.shell.getBounds();
            var x = bounds.x + (bounds.width - shellBounds.width) / 2;
            var y = bounds.y + (bounds.height - shellBounds.height) / 2;
            this.shell.setLocation(x, y);

            // Show dialog
            this.shell.open();
        },

        /**
         * Update status label
         * @param {string} message - Status message
         */
        updateStatus: function(message) {
            if (this.statusLabel && !this.statusLabel.isDisposed()) {
                this.statusLabel.setText(message);
            }
        },

        /**
         * Update operation counter
         * @param {number} queued - Number of queued operations
         * @param {number} completed - Number of completed operations
         */
        updateOperationCount: function(queued, completed) {
            if (this.operationCountLabel && !this.operationCountLabel.isDisposed()) {
                this.operationCountLabel.setText("Operations: " + queued + " queued, " + completed + " completed");
            }
        },

        /**
         * Close the monitor dialog
         */
        close: function() {
            if (this.shell && !this.shell.isDisposed()) {
                this.shell.close();
            }
        },

        /**
         * Export log to file
         * @private
         */
        _exportLog: function() {
            var FileDialog = Java.type("org.eclipse.swt.widgets.FileDialog");
            var SWT = swtImports.SWT;

            var dialog = new FileDialog(this.shell, SWT.SAVE);
            dialog.setFilterExtensions(["*.txt", "*.*"]);
            dialog.setFilterNames(["Text Files (*.txt)", "All Files (*.*)"]);
            dialog.setFileName("server-log-" + new Date().toISOString().replace(/:/g, "-").replace(/\./g, "-") + ".txt");

            var filePath = dialog.open();
            if (filePath) {
                try {
                    var PrintWriter = Java.type("java.io.PrintWriter");
                    var writer = new PrintWriter(filePath);
                    writer.print(this.logText.getText());
                    writer.close();

                    if (loggingQueue) {
                        loggingQueue.log("Log exported to: " + filePath);
                    }
                } catch (e) {
                    if (loggingQueue) {
                        loggingQueue.error("Failed to export log: " + e);
                    }
                }
            }
        },

        /**
         * Handle stop button click
         * @private
         */
        _onStopButton: function() {
            var MessageDialog = Java.type("org.eclipse.jface.dialogs.MessageDialog");
            var queuedOps = operationQueue ? operationQueue.getQueuedCount() : 0;
            var message = "Stop the server?";

            if (queuedOps > 0) {
                message += "\n\n" + queuedOps + " queued operation(s) will be lost.";
            }

            var confirmed = MessageDialog.openConfirm(
                this.shell,
                "Confirm Shutdown",
                message
            );

            if (confirmed && this.config.onStop) {
                this.config.onStop();
            }
        },

        /**
         * Handle close attempt (window X button)
         * @private
         */
        _onCloseAttempt: function(event) {
            // If already shutting down, allow close
            if (this._isShuttingDown) {
                return;  // Allow close
            }

            // If server still running and not shutting down, prevent close and trigger shutdown
            if (this._serverRunning && this.config.onClose) {
                event.doit = false;  // Prevent immediate close

                var self = this;
                // Call shutdown with callback to close after shutdown completes
                this.config.onClose(function() {
                    // After shutdown completes, close the shell
                    var Display = swtImports.Display;
                    var display = Display.getDefault();

                    if (display && !self.shell.isDisposed()) {
                        display.asyncExec(function() {
                            if (!self.shell.isDisposed()) {
                                self.shell.close();
                            }
                        });
                    }
                });
            }
        },

        /**
         * Mark server as stopped (allows close without confirmation)
         */
        markServerStopped: function() {
            this._serverRunning = false;
            this._isShuttingDown = true;
        }
    };

    // Export globally for JArchi
    if (typeof globalThis !== "undefined") {
        globalThis.monitorUI = monitorUI;
    } else if (typeof global !== "undefined") {
        global.monitorUI = monitorUI;
    }

    // CommonJS for Node.js build tools
    if (typeof module !== "undefined" && module.exports) {
        module.exports = monitorUI;
    }

})();
