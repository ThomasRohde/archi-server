/**
 * loggingQueue.js - Thread-safe logging queue with display timer
 *
 * Provides thread-safe logging with timestamps and automatic log flushing
 * to SWT UI components. Uses ConcurrentLinkedQueue for thread-safety and
 * Display.timerExec for periodic flushing to UI thread.
 *
 * @module server/loggingQueue
 */

(function() {
    "use strict";

    // Guard against double-loading
    if (typeof globalThis !== "undefined" && typeof globalThis.loggingQueue !== "undefined") {
        return;
    }

    // Java imports
    var ConcurrentLinkedQueue = Java.type("java.util.concurrent.ConcurrentLinkedQueue");
    var System = Java.type("java.lang.System");
    var lineSeparator = System.lineSeparator();  // Platform-specific line separator

    /**
     * Logging queue with thread-safe operations and UI flush timer
     */
    var loggingQueue = {
        /**
         * Thread-safe queue for log messages
         * @type {java.util.concurrent.ConcurrentLinkedQueue}
         */
        queue: new ConcurrentLinkedQueue(),

        /**
         * Configuration options
         */
        config: {
            maxLines: 2000,              // Maximum lines in log display
            maxLinesPerCycle: 200,       // Maximum lines to flush per cycle
            flushInterval: 100,          // Flush interval in milliseconds
            timestampFormat: "HH:MM:SS.mmm"
        },

        /**
         * Timer state
         * @private
         */
        _timerRunning: false,
        _displayRef: null,
        _logTextWidget: null,

        /**
         * Load logging config from serverConfig if present
         * @private
         */
        _applyConfig: function() {
            if (typeof serverConfig === "undefined" || !serverConfig.logging) {
                return;
            }
            var cfg = serverConfig.logging;
            if (typeof cfg.maxLines === "number") this.config.maxLines = cfg.maxLines;
            if (typeof cfg.maxLinesPerCycle === "number") this.config.maxLinesPerCycle = cfg.maxLinesPerCycle;
            if (typeof cfg.flushInterval === "number") this.config.flushInterval = cfg.flushInterval;
        },

        /**
         * Log a message with timestamp (thread-safe)
         * Note: Does not output to console directly - use flush timer instead
         * @param {string} message - Message to log
         * @param {string} [level="INFO"] - Log level (INFO, WARN, ERROR)
         */
        log: function(message, level) {
            level = level || "INFO";
            var timestamp = new Date().toISOString().substr(11, 12);  // HH:MM:SS.mmm
            var prefix = level === "INFO" ? "" : level + ": ";
            this.queue.offer("[" + timestamp + "] " + prefix + message);
        },

        /**
         * Log info message (convenience method)
         * @param {string} message - Message to log
         */
        info: function(message) {
            this.log(message, "INFO");
        },

        /**
         * Log warning message (convenience method)
         * @param {string} message - Message to log
         */
        warn: function(message) {
            this.log(message, "WARN");
        },

        /**
         * Log error message (convenience method)
         * @param {string} message - Message to log
         */
        error: function(message) {
            this.log(message, "ERROR");
        },

        /**
         * Start periodic log flush timer
         * @param {org.eclipse.swt.widgets.Display} display - SWT Display reference
         * @param {org.eclipse.swt.widgets.Text} logText - SWT Text widget for log display
         */
        startFlushTimer: function(display, logText) {
            if (this._timerRunning) {
                return;
            }

            this._applyConfig();
            this._timerRunning = true;
            this._displayRef = display;
            this._logTextWidget = logText;

            this._scheduleFlush();
        },

        /**
         * Stop the log flush timer
         */
        stopFlushTimer: function() {
            this._timerRunning = false;
        },

        /**
         * Schedule next flush cycle (internal)
         * @private
         */
        _scheduleFlush: function() {
            var self = this;
            var Runnable = Java.type("java.lang.Runnable");

            var FlushRunnable = Java.extend(Runnable, {
                run: function() {
                    // Check if timer is still running and widget is valid
                    if (!self._timerRunning) {
                        return;
                    }
                    
                    // Check widget validity, but continue timer even if disposed
                    // (this allows other Display activity to continue)
                    var widgetValid = self._logTextWidget && !self._logTextWidget.isDisposed();

                    if (widgetValid) {
                        // Drain up to maxLinesPerCycle lines from queue
                        var lines = [];
                        var maxLines = self.config.maxLinesPerCycle;
                        while (lines.length < maxLines && !self.queue.isEmpty()) {
                            lines.push(self.queue.poll());
                        }

                        // Append to log text and console (safe: we're on UI thread)
                        if (lines.length > 0) {
                            try {
                                // Output to console (safe here since we're on UI thread)
                                lines.forEach(function(line) {
                                    console.log(line);
                                });

                                var currentText = self._logTextWidget.getText();
                                var newText = currentText + (currentText.length > 0 ? lineSeparator : "") + lines.join(lineSeparator);

                                // Limit total lines to config.maxLines
                                var allLines = newText.split(lineSeparator);
                                if (allLines.length > self.config.maxLines) {
                                    allLines = allLines.slice(-self.config.maxLines);
                                    newText = allLines.join(lineSeparator);
                                }

                                self._logTextWidget.setText(newText);

                                // Auto-scroll to end
                                self._logTextWidget.setSelection(self._logTextWidget.getCharCount());
                            } catch (e) {
                                // Silently handle errors during flush
                            }
                        }
                    }

                    // Schedule next flush regardless of whether widget is valid
                    // This keeps the Display thread active even during idle periods
                    if (self._timerRunning) {
                        self._scheduleFlush();
                    }
                }
            });

            this._displayRef.timerExec(this.config.flushInterval, new FlushRunnable());
        }
    };

    // Export globally for JArchi
    if (typeof globalThis !== "undefined") {
        globalThis.loggingQueue = loggingQueue;
    } else if (typeof global !== "undefined") {
        global.loggingQueue = loggingQueue;
    }

    // CommonJS for Node.js build tools
    if (typeof module !== "undefined" && module.exports) {
        module.exports = loggingQueue;
    }

})();
