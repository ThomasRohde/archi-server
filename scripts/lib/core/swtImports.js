/**
 * Centralized SWT/JFace Imports Module
 * @module lib/core/swtImports
 * @description Provides a single point of import for commonly used SWT and JFace Java types.
 * This module eliminates the need to repeatedly import the same Java types in every script,
 * reducing duplication and maintenance burden.
 *
 * @example
 * // Using with load() - recommended for JArchi scripts
 * load(__DIR__ + "lib/core/swtImports.js");
 * const { SWT, GridDataFactory, TitleAreaDialog } = swtImports;
 *
 * @example
 * // Using with require() - for Node.js-style modules
 * const { SWT, GridDataFactory, TitleAreaDialog } = require("./lib/core/swtImports");
 *
 * @version 1.0.0
 * @author Generated for JArchi Scripts
 * @lastModifiedDate 2026-01-08
 */

(function () {
    "use strict";

    // Guard against multiple loads - check global scope, not local
    if (typeof globalThis !== "undefined" && typeof globalThis.swtImports !== "undefined") {
        return;
    }
    if (typeof global !== "undefined" && typeof global.swtImports !== "undefined") {
        return;
    }

    // =========================================================================
    // SWT Core
    // =========================================================================

    /**
     * SWT constants class - contains style constants like SWT.NONE, SWT.BORDER, etc.
     * @type {JavaClass}
     */
    const SWT = Java.type("org.eclipse.swt.SWT");

    // =========================================================================
    // SWT Layouts
    // =========================================================================

    /**
     * Grid-based layout for SWT composites
     * @type {JavaClass}
     */
    const GridLayout = Java.type("org.eclipse.swt.layout.GridLayout");

    /**
     * Layout data for GridLayout - controls how widgets are positioned
     * @type {JavaClass}
     */
    const GridData = Java.type("org.eclipse.swt.layout.GridData");

    /**
     * Fill-based layout for SWT composites
     * @type {JavaClass}
     */
    const FillLayout = Java.type("org.eclipse.swt.layout.FillLayout");

    /**
     * Row-based layout for SWT composites
     * @type {JavaClass}
     */
    const RowLayout = Java.type("org.eclipse.swt.layout.RowLayout");

    /**
     * Layout data for RowLayout
     * @type {JavaClass}
     */
    const RowData = Java.type("org.eclipse.swt.layout.RowData");

    // =========================================================================
    // JFace Layout Factories (preferred for cleaner code)
    // =========================================================================

    /**
     * Factory for creating GridData with fluent API
     * @type {JavaClass}
     * @example
     * GridDataFactory.fillDefaults().grab(true, false).applyTo(widget);
     */
    const GridDataFactory = Java.type("org.eclipse.jface.layout.GridDataFactory");

    /**
     * Factory for creating GridLayout with fluent API
     * @type {JavaClass}
     * @example
     * GridLayoutFactory.fillDefaults().numColumns(2).applyTo(composite);
     */
    const GridLayoutFactory = Java.type("org.eclipse.jface.layout.GridLayoutFactory");

    // =========================================================================
    // SWT Widgets - Basic
    // =========================================================================

    /**
     * Display class - represents the connection between SWT and the OS
     * @type {JavaClass}
     */
    const Display = Java.type("org.eclipse.swt.widgets.Display");

    /**
     * Shell class - top-level window
     * @type {JavaClass}
     */
    const Shell = Java.type("org.eclipse.swt.widgets.Shell");

    /**
     * Composite widget - container for other widgets
     * @type {JavaClass}
     */
    const Composite = Java.type("org.eclipse.swt.widgets.Composite");

    /**
     * Label widget - displays text or images
     * @type {JavaClass}
     */
    const Label = Java.type("org.eclipse.swt.widgets.Label");

    /**
     * Button widget - push button, checkbox, radio button
     * @type {JavaClass}
     */
    const Button = Java.type("org.eclipse.swt.widgets.Button");

    /**
     * Text widget - single or multi-line text input
     * @type {JavaClass}
     */
    const Text = Java.type("org.eclipse.swt.widgets.Text");

    /**
     * Combo widget - dropdown selection
     * @type {JavaClass}
     */
    const Combo = Java.type("org.eclipse.swt.widgets.Combo");

    /**
     * List widget - scrollable list of items
     * @type {JavaClass}
     */
    const List = Java.type("org.eclipse.swt.widgets.List");

    /**
     * Group widget - labeled container with border
     * @type {JavaClass}
     */
    const Group = Java.type("org.eclipse.swt.widgets.Group");

    // =========================================================================
    // SWT Widgets - Advanced
    // =========================================================================

    /**
     * Table widget - displays data in rows and columns
     * @type {JavaClass}
     */
    const Table = Java.type("org.eclipse.swt.widgets.Table");

    /**
     * TableItem widget - item in a Table
     * @type {JavaClass}
     */
    const TableItem = Java.type("org.eclipse.swt.widgets.TableItem");

    /**
     * TableColumn widget - column in a Table
     * @type {JavaClass}
     */
    const TableColumn = Java.type("org.eclipse.swt.widgets.TableColumn");

    /**
     * Tree widget - displays hierarchical data
     * @type {JavaClass}
     */
    const Tree = Java.type("org.eclipse.swt.widgets.Tree");

    /**
     * TreeItem widget - item in a Tree
     * @type {JavaClass}
     */
    const TreeItem = Java.type("org.eclipse.swt.widgets.TreeItem");

    /**
     * Browser widget - embedded web browser
     * @type {JavaClass}
     */
    const Browser = Java.type("org.eclipse.swt.browser.Browser");

    // =========================================================================
    // SWT Widgets - Tabs and Containers
    // =========================================================================

    /**
     * TabFolder widget - container for tabbed content
     * @type {JavaClass}
     */
    const TabFolder = Java.type("org.eclipse.swt.widgets.TabFolder");

    /**
     * TabItem widget - tab in a TabFolder
     * @type {JavaClass}
     */
    const TabItem = Java.type("org.eclipse.swt.widgets.TabItem");

    /**
     * SashForm widget - resizable split container
     * @type {JavaClass}
     */
    const SashForm = Java.type("org.eclipse.swt.custom.SashForm");

    /**
     * ScrolledComposite widget - scrollable container
     * @type {JavaClass}
     */
    const ScrolledComposite = Java.type("org.eclipse.swt.custom.ScrolledComposite");

    /**
     * ExpandBar widget - collapsible sections
     * @type {JavaClass}
     */
    const ExpandBar = Java.type("org.eclipse.swt.widgets.ExpandBar");

    /**
     * ExpandItem widget - item in an ExpandBar
     * @type {JavaClass}
     */
    const ExpandItem = Java.type("org.eclipse.swt.widgets.ExpandItem");

    /**
     * CoolBar widget - moveable/resizable toolbar container
     * @type {JavaClass}
     */
    const CoolBar = Java.type("org.eclipse.swt.widgets.CoolBar");

    /**
     * CoolItem widget - item in a CoolBar
     * @type {JavaClass}
     */
    const CoolItem = Java.type("org.eclipse.swt.widgets.CoolItem");

    /**
     * ToolBar widget - container for tool items
     * @type {JavaClass}
     */
    const ToolBar = Java.type("org.eclipse.swt.widgets.ToolBar");

    /**
     * ToolItem widget - button or item in a ToolBar
     * @type {JavaClass}
     */
    const ToolItem = Java.type("org.eclipse.swt.widgets.ToolItem");

    // =========================================================================
    // SWT Graphics
    // =========================================================================

    /**
     * Point class - represents x,y coordinates
     * @type {JavaClass}
     */
    const Point = Java.type("org.eclipse.swt.graphics.Point");

    /**
     * Rectangle class - represents a rectangular area
     * @type {JavaClass}
     */
    const Rectangle = Java.type("org.eclipse.swt.graphics.Rectangle");

    /**
     * Color class - represents a color
     * @type {JavaClass}
     */
    const Color = Java.type("org.eclipse.swt.graphics.Color");

    /**
     * Font class - represents a font
     * @type {JavaClass}
     */
    const Font = Java.type("org.eclipse.swt.graphics.Font");

    /**
     * FontData class - font description data
     * @type {JavaClass}
     */
    const FontData = Java.type("org.eclipse.swt.graphics.FontData");

    /**
     * Image class - represents an image
     * @type {JavaClass}
     */
    const Image = Java.type("org.eclipse.swt.graphics.Image");

    /**
     * Cursor class - represents a mouse cursor
     * @type {JavaClass}
     */
    const Cursor = Java.type("org.eclipse.swt.graphics.Cursor");

    // =========================================================================
    // JFace Viewers
    // =========================================================================

    /**
     * AbstractTreeViewer class - base class for tree viewers
     * @type {JavaClass}
     */
    const AbstractTreeViewer = Java.type("org.eclipse.jface.viewers.AbstractTreeViewer");

    // =========================================================================
    // JFace Dialogs
    // =========================================================================

    /**
     * Base Dialog class - extend this for custom dialogs
     * @type {JavaClass}
     */
    const Dialog = Java.type("org.eclipse.jface.dialogs.Dialog");

    /**
     * TitleAreaDialog class - dialog with title area and image
     * @type {JavaClass}
     */
    const TitleAreaDialog = Java.type("org.eclipse.jface.dialogs.TitleAreaDialog");

    /**
     * MessageDialog class - standard message dialogs
     * @type {JavaClass}
     */
    const MessageDialog = Java.type("org.eclipse.jface.dialogs.MessageDialog");

    /**
     * InputDialog class - dialog for single text input
     * @type {JavaClass}
     */
    const InputDialog = Java.type("org.eclipse.jface.dialogs.InputDialog");

    /**
     * ProgressMonitorDialog class - dialog showing progress
     * @type {JavaClass}
     */
    const ProgressMonitorDialog = Java.type("org.eclipse.jface.dialogs.ProgressMonitorDialog");

    /**
     * FontDialog class - standard font selection dialog
     * @type {JavaClass}
     */
    const FontDialog = Java.type("org.eclipse.swt.widgets.FontDialog");

    /**
     * IDialogConstants - standard dialog button IDs
     * @type {JavaClass}
     */
    const IDialogConstants = Java.type("org.eclipse.jface.dialogs.IDialogConstants");

    /**
     * IMessageProvider - message types for TitleAreaDialog
     * @type {JavaClass}
     */
    const IMessageProvider = Java.type("org.eclipse.jface.dialogs.IMessageProvider");

    // =========================================================================
    // Archi-specific Types
    // =========================================================================

    /**
     * IArchiImages - Archi's image factory for icons
     * @type {JavaClass}
     */
    const IArchiImages = Java.type("com.archimatetool.editor.ui.IArchiImages");

    // =========================================================================
    // Java Utility Types (commonly used with SWT)
    // =========================================================================

    /**
     * Java File class - for file operations
     * @type {JavaClass}
     */
    const File = Java.type("java.io.File");

    /**
     * Java ArrayList class - for dynamic arrays
     * @type {JavaClass}
     */
    const ArrayList = Java.type("java.util.ArrayList");

    // =========================================================================
    // Export Object
    // =========================================================================

    /**
     * All SWT/JFace imports bundled together
     * @type {Object}
     */
    const swtImports = {
        // SWT Core
        SWT,

        // Layouts
        GridLayout,
        GridData,
        FillLayout,
        RowLayout,
        RowData,

        // JFace Layout Factories
        GridDataFactory,
        GridLayoutFactory,

        // Basic Widgets
        Display,
        Shell,
        Composite,
        Label,
        Button,
        Text,
        Combo,
        List,
        Group,

        // Advanced Widgets
        Table,
        TableItem,
        TableColumn,
        Tree,
        TreeItem,
        Browser,

        // Tabs and Containers
        TabFolder,
        TabItem,
        SashForm,
        ScrolledComposite,
        ExpandBar,
        ExpandItem,
        CoolBar,
        CoolItem,
        ToolBar,
        ToolItem,

        // Graphics
        Point,
        Rectangle,
        Color,
        Font,
        FontData,
        Image,
        Cursor,

        // JFace Viewers
        AbstractTreeViewer,

        // JFace Dialogs
        Dialog,
        TitleAreaDialog,
        MessageDialog,
        InputDialog,
        ProgressMonitorDialog,
        FontDialog,
        IDialogConstants,
        IMessageProvider,

        // Archi-specific
        IArchiImages,

        // Java Utilities
        File,
        ArrayList,

        /**
         * Helper to extend a Java class for creating custom implementations
         * @param {JavaClass} javaClass - The Java class to extend
         * @returns {JavaClass} Extended class ready for instantiation
         * @example
         * const MyDialog = swtImports.extend(swtImports.TitleAreaDialog);
         * const dialog = new MyDialog(shell, { ... });
         */
        extend: function(javaClass) {
            return Java.extend(javaClass);
        },

        /**
         * Pre-extended Dialog class for convenience
         * @type {JavaClass}
         */
        ExtendedDialog: Java.extend(Dialog),

        /**
         * Pre-extended TitleAreaDialog class for convenience
         * @type {JavaClass}
         */
        ExtendedTitleAreaDialog: Java.extend(TitleAreaDialog)
    };

    // =========================================================================
    // Module Export - Dual compatibility for load() and require()
    // =========================================================================

    // For load() pattern - expose as global
    if (typeof globalThis !== "undefined") {
        globalThis.swtImports = swtImports;
    } else if (typeof global !== "undefined") {
        global.swtImports = swtImports;
    } else {
        // Fallback for JArchi environment
        this.swtImports = swtImports;
    }

    // For require() pattern - CommonJS export
    if (typeof module !== "undefined" && module.exports) {
        module.exports = swtImports;
    }

})();
