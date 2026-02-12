/**
 * logTab.js - Log tab for the server monitor dialog
 *
 * Creates the log display tab with a monospace text area, clear button,
 * and export button. The log text widget is returned for integration
 * with the loggingQueue flush timer.
 *
 * @module server/tabs/logTab
 * @requires lib/core/swtImports
 */

(function() {
    "use strict";

    // Guard against double-loading
    if (typeof globalThis !== "undefined" && typeof globalThis.logTab !== "undefined") {
        return;
    }

    var logTab = {
        /**
         * Create the Log tab content
         * @param {TabFolder} tabFolder - Parent TabFolder widget
         * @param {Display} display - SWT Display
         * @param {Object} options - Options
         * @param {Object} options.monitorUI - Reference to monitorUI for export delegation
         * @returns {Object} { tabItem, logText, composite }
         */
        create: function(tabFolder, display, options) {
            var SWT = swtImports.SWT;
            var TabItem = swtImports.TabItem;
            var Composite = swtImports.Composite;
            var GridLayout = swtImports.GridLayout;
            var GridData = swtImports.GridData;
            var Text = swtImports.Text;
            var Button = swtImports.Button;
            var Font = swtImports.Font;

            // Create tab item
            var tabItem = new TabItem(tabFolder, SWT.NONE);
            tabItem.setText("Log");

            // Tab content composite
            var composite = new Composite(tabFolder, SWT.NONE);
            var layout = new GridLayout(1, false);
            layout.marginWidth = 5;
            layout.marginHeight = 5;
            composite.setLayout(layout);
            tabItem.setControl(composite);

            // Log text area
            var logText = new Text(composite,
                SWT.MULTI | SWT.READ_ONLY | SWT.BORDER | SWT.V_SCROLL | SWT.H_SCROLL);
            var logGridData = new GridData(SWT.FILL, SWT.FILL, true, true);
            logText.setLayoutData(logGridData);

            // Monospace font
            var fontData = logText.getFont().getFontData()[0];
            var monoFont = new Font(display, "Consolas", fontData.getHeight(), SWT.NORMAL);
            logText.setFont(monoFont);

            // Button row
            var buttonContainer = new Composite(composite, SWT.NONE);
            buttonContainer.setLayout(new GridLayout(2, false));
            buttonContainer.setLayoutData(new GridData(SWT.RIGHT, SWT.CENTER, true, false));

            // Clear button
            var clearButton = new Button(buttonContainer, SWT.PUSH);
            clearButton.setText("Clear");
            clearButton.addListener(SWT.Selection, function() {
                logText.setText("");
            });

            // Export button
            var exportButton = new Button(buttonContainer, SWT.PUSH);
            exportButton.setText("Export Log");
            exportButton.addListener(SWT.Selection, function() {
                if (options && options.monitorUI && options.monitorUI._exportLog) {
                    options.monitorUI._exportLog();
                }
            });

            // Font disposal on composite dispose
            composite.addListener(SWT.Dispose, function() {
                if (monoFont && !monoFont.isDisposed()) {
                    monoFont.dispose();
                }
            });

            return {
                tabItem: tabItem,
                logText: logText,
                composite: composite
            };
        }
    };

    // Export globally for JArchi
    if (typeof globalThis !== "undefined") {
        globalThis.logTab = logTab;
    } else if (typeof global !== "undefined") {
        global.logTab = logTab;
    }

})();
