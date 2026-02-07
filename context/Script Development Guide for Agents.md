# JArchi Script Development Guide for Coding Agents

This guide provides comprehensive instructions for AI coding agents (Claude, GPT, Copilot, etc.) on creating, migrating, and maintaining JArchi scripts. Follow these instructions precisely to produce working scripts.

---

## Table of Contents

1. [Environment Overview](#environment-overview)
2. [Script Template](#script-template)
3. [Loading Dependencies](#loading-dependencies)
4. [Java Interoperability](#java-interoperability)
5. [Creating Dialogs with BaseDialog](#creating-dialogs-with-basedialog)
6. [Working with the ArchiMate Model](#working-with-the-archiarchimate-model)
7. [Adding Scripts to the Menu System](#adding-scripts-to-the-menu-system)
8. [Documentation Requirements](#documentation-requirements)
9. [Common Pitfalls and Solutions](#common-pitfalls-and-solutions)
10. [Testing Scripts in Archi](#testing-scripts-in-archi)
11. [Migration Checklist](#migration-checklist)
12. [Complete Script Example](#complete-script-example)

---

## Environment Overview

### Critical Understanding

**JArchi scripts run in GraalVM JavaScript, NOT Node.js.**

Key differences from Node.js:
- No `require()` for local files - use `load()` instead
- No npm packages - only Java interop and built-in JavaScript
- Java classes are available via `Java.type()`
- The runtime provides special globals: `$`, `shell`, `selection`, `model`

### Runtime Globals Available

| Global | Description |
|--------|-------------|
| `$` | jArchi collection constructor - wrap elements to use collection methods |
| `$(selection)` | Currently selected elements in Archi |
| `$.model` | The currently open ArchiMate model |
| `shell` | The Eclipse SWT Shell (parent window) |
| `model` | Alias for `$.model` |
| `__DIR__` | Directory path of the current script (with trailing slash) |
| `__FILE__` | Full path of the current script |
| `console` | Console object for logging |
| `window` | Object with dialog utilities |

### JArchi Version Requirements

- Archi: 5.7+
- JArchi plugin: 1.11+
- Scripts in this repository use features from JArchi 1.11

---

## Script Template

Every top-level script (`.ajs` file in `scripts/` folder) should follow this template:

```javascript
/**
 * @name Script Name
 * @description Brief description of what the script does
 * @version 1.0.0
 * @author Your Name
 * @lastModifiedDate YYYY-MM-DD
 */

console.clear();
console.show();

// Load dependencies
load(__DIR__ + "lib/commonStyles.js");

// Wrap in IIFE for encapsulation
(function () {
    "use strict";

    try {
        // Main script logic here
        
        console.log("Script completed successfully");
    } catch (error) {
        console.error("Script failed: " + error.toString());
        window.alert("Error: " + error.message);
    }
})();
```

### Key Points

1. **Always clear console first**: `console.clear(); console.show();`
2. **Use IIFE pattern**: `(function() { ... })();` prevents variable pollution
3. **Use "use strict"**: Catches common JavaScript errors
4. **Use console for debugging**: `console.log/warn/error` with Chrome DevTools
5. **Wrap in try-catch**: Provide user-friendly error messages

---

## Loading Dependencies

### The `load()` Function

Use `load()` to include JavaScript files. This is NOT the same as `require()`.

```javascript
// Load from lib folder relative to script
load(__DIR__ + "lib/commonStyles.js");
load(__DIR__ + "lib/ui/BaseDialog.js");
load(__DIR__ + "lib/core/swtImports.js");
```

### Important Notes

- `__DIR__` includes a trailing path separator
- Files loaded with `load()` execute in global scope
- Loaded files typically expose variables to global scope or use module patterns
- Order matters - load dependencies before files that use them

### Available Library Modules

| Module | Path | Purpose |
|--------|------|---------|
| swtImports | `lib/core/swtImports.js` | SWT/JFace Java type imports |
| BaseDialog | `lib/ui/BaseDialog.js` | Dialog factory pattern |
| layouts | `lib/ui/layouts.js` | Layout helper utilities |
| WidgetFactory | `lib/ui/WidgetFactory.js` | Widget creation helpers |
| commonStyles | `lib/commonStyles.js` | CSS styles with dark mode |

### Using Loaded Modules

After loading, modules expose their exports as globals:

```javascript
// Load the module
load(__DIR__ + "lib/core/swtImports.js");

// Access exports from the global
const { SWT, GridDataFactory, TitleAreaDialog } = swtImports;

// Or access directly
const display = swtImports.Display.getCurrent();
```

---

## Java Interoperability

### Importing Java Classes

Use `Java.type()` to import Java classes:

```javascript
// SWT and JFace classes
const SWT = Java.type("org.eclipse.swt.SWT");
const GridDataFactory = Java.type("org.eclipse.jface.layout.GridDataFactory");
const TitleAreaDialog = Java.type("org.eclipse.jface.dialogs.TitleAreaDialog");
const Composite = Java.type("org.eclipse.swt.widgets.Composite");
const Label = Java.type("org.eclipse.swt.widgets.Label");
const Button = Java.type("org.eclipse.swt.widgets.Button");
const Text = Java.type("org.eclipse.swt.widgets.Text");

// Or use the swtImports module (recommended)
load(__DIR__ + "lib/core/swtImports.js");
const { SWT, GridDataFactory, Label, Button, Text } = swtImports;
```

### Extending Java Classes

Use `Java.extend()` to create JavaScript objects that extend Java classes:

```javascript
const TitleAreaDialog = Java.type("org.eclipse.jface.dialogs.TitleAreaDialog");
const ExtendedDialog = Java.extend(TitleAreaDialog);

// Create instance with method overrides
const dialog = new ExtendedDialog(shell, {
    createDialogArea: function(parent) {
        // Override implementation
    }
});
```

### Calling Superclass Methods (CRITICAL)

**This is the most common source of errors.**

❌ **WRONG** - `Java.super(this)` does NOT work in GraalVM:
```javascript
// THIS WILL FAIL
const dialog = new ExtendedDialog(shell, {
    configureShell: function(newShell) {
        Java.super(this).configureShell(newShell);  // BROKEN!
    }
});
```

✅ **CORRECT** - Store dialog in object and reference it:
```javascript
const myDialog = {
    dialog: new ExtendedDialog(shell, {
        configureShell: function(newShell) {
            Java.super(myDialog.dialog).configureShell(newShell);  // WORKS!
            newShell.setText("Title");
        },
        createDialogArea: function(parent) {
            const area = Java.super(myDialog.dialog).createDialogArea(parent);
            // Build UI here
            return area;
        }
    }),
    open: function() {
        return this.dialog.open() === 0;  // OK = 0
    }
};
```

### Using BaseDialog (Recommended)

The `BaseDialog` module handles this complexity for you:

```javascript
load(__DIR__ + "lib/ui/BaseDialog.js");

const myDialog = BaseDialog.create({
    title: "My Dialog",
    message: "Enter information:",
    size: { width: 500, height: 400 },
    createContents: function(parent, dlg) {
        // Create UI here - no Java.super needed!
        const label = new Label(parent, SWT.NONE);
        label.setText("Hello World");
    },
    onOk: function(dlg) {
        // Handle OK - return true to close
        return true;
    }
});

if (myDialog.open()) {
    console.log("User clicked OK");
}
```

---

## Creating Dialogs with BaseDialog

### Basic Dialog

```javascript
load(__DIR__ + "lib/ui/BaseDialog.js");
load(__DIR__ + "lib/core/swtImports.js");

const { SWT, Label, Text, GridDataFactory } = swtImports;

let userName = "";

const dialog = BaseDialog.create({
    title: "User Input",
    message: "Please enter your name:",
    size: { width: 400, height: 200 },
    
    createContents: function(parent, dlg) {
        // Create a text input
        const text = new Text(parent, SWT.BORDER);
        GridDataFactory.fillDefaults().grab(true, false).applyTo(text);
        
        // Store reference for onOk
        dlg.widgets.nameText = text;
    },
    
    onOk: function(dlg) {
        userName = dlg.widgets.nameText.getText().trim();
        if (userName === "") {
            dlg.setErrorMessage("Name cannot be empty");
            return false;  // Don't close
        }
        return true;  // Close dialog
    }
});

if (dialog.open()) {
    console.log("Hello, " + userName);
}
```

### Confirmation Dialog

```javascript
load(__DIR__ + "lib/ui/BaseDialog.js");

if (BaseDialog.confirm("Delete Item", "Are you sure you want to delete this item?")) {
    // User confirmed
    performDelete();
}
```

### Message Dialogs

```javascript
// Information
BaseDialog.info("Success", "Operation completed successfully.");

// Warning
BaseDialog.warn("Warning", "This action cannot be undone.");

// Error
BaseDialog.error("Error", "An error occurred: " + errorMessage);
```

---

## Working with the ArchiMate Model

### Accessing Model Elements

```javascript
// Get current model
const currentModel = $.model;

// Get selected elements
const selectedElements = $(selection).filter("element");

// Get current view (if selected)
const currentView = $(selection).filter("archimate-diagram-model").first();

// Find all elements of a type
const allBusinessProcesses = $("business-process");

// Find by name
const element = $("element").filter(e => e.name === "Customer");
```

### Working with Views

```javascript
// Get all views
const views = $("archimate-diagram-model");

// Get elements in a view
$(view).children().each(function(child) {
    if (child.concept) {
        console.log("Element: " + child.concept.name);
    }
});

// Find visual objects for a concept
const visualRefs = $(element).viewRefs();
```

### Creating Elements

```javascript
// Create a new element
const newProcess = model.createElement("business-process", "My Process");
newProcess.documentation = "Process documentation";

// Add to a folder
const folder = $("folder").filter(f => f.name === "Business").first();
folder.add(newProcess);
```

### Creating Relationships

```javascript
// Create a relationship
const rel = model.createRelationship("serving-relationship", source, target);
rel.name = "Serves";

// Add to view
const viewRef = view.add(rel, sourceView, targetView);
```

### Handling Unnamed Elements

Always handle potentially empty names:

```javascript
const displayName = element.name && element.name.trim() 
    ? element.name 
    : "-- unnamed --";
```

---

## Adding Scripts to the Menu System

### Create the Script File

Create your script in `scripts/YourScript.ajs` following the template.

### Registration

Scripts are executed directly from the Archi Scripts menu. No additional registration is required.
For API access via POST /scripts/run, scripts can be executed by sending the script code in the request body.
```

### Categories

Use existing categories when possible:
- `Analysis` - Scripts that analyze model content
- `Layout` - Scripts that arrange views
- `Export` - Scripts that export data
- `Utilities` - General-purpose tools
- `Model` - Scripts that modify model content

### Step 3: Create Tutorial (Optional)

Create `docs-source/YourScript.ajs.md` with JSDoc comments:

```markdown
/**
 * @tutorial YourScript
 */

# Your Script Name

Description of your script for the documentation site.

## Usage

1. Select elements
2. Run the script
3. ...

## Examples

...
```

Then run `npm run build` to generate the HTML tutorial.

---

## Documentation Requirements

### JSDoc Header

Every script file must have a JSDoc header:

```javascript
/**
 * @name Script Name
 * @description What the script does
 * @version 1.0.0
 * @author Your Name
 * @lastModifiedDate YYYY-MM-DD
 */
```

### Library Modules

Library modules (in `lib/`) need module-level JSDoc:

```javascript
/**
 * @module moduleName
 * @description What this module provides
 * @version 1.0.0
 * @author Your Name
 * @since JArchi 1.0
 * @lastModifiedDate YYYY-MM-DD
 */
```

### Functions

Document significant functions:

```javascript
/**
 * Process the selected elements and return results
 * @param {Object[]} elements - Array of ArchiMate elements
 * @param {Object} options - Processing options
 * @param {boolean} options.recursive - Whether to process recursively
 * @returns {Object[]} Processed results
 */
function processElements(elements, options) {
    // ...
}
```

---

## Common Pitfalls and Solutions

### Pitfall 1: Using `require()` Instead of `load()`

❌ **Wrong:**
```javascript
const utils = require("./lib/utils.js");  // Node.js style - FAILS
```

✅ **Correct:**
```javascript
load(__DIR__ + "lib/utils.js");  // JArchi style
```

### Pitfall 2: Using `Java.super(this)`

❌ **Wrong:**
```javascript
Java.super(this).configureShell(newShell);  // FAILS in GraalVM
```

✅ **Correct:**
```javascript
Java.super(myDialog.dialog).configureShell(newShell);  // Reference object
// Or use BaseDialog to avoid this entirely
```

### Pitfall 3: Multiple Arguments to `console.error()`

❌ **Wrong:**
```javascript
console.error("Error:", error, "in function", funcName);  // May fail
```

✅ **Correct:**
```javascript
console.error("Error: " + error.toString() + " in function " + funcName);
```

### Pitfall 4: Not Handling Empty Names

❌ **Wrong:**
```javascript
const name = element.name;  // May be null or empty
label.setText(name);
```

✅ **Correct:**
```javascript
const name = element.name && element.name.trim() ? element.name : "-- unnamed --";
label.setText(name);
```

### Pitfall 5: Forgetting to Dispose Resources

❌ **Wrong:**
```javascript
const color = new Color(display, 255, 0, 0);
// Using color...
// Forgot to dispose!
```

✅ **Correct:**
```javascript
const color = new Color(display, 255, 0, 0);
try {
    // Using color...
} finally {
    color.dispose();
}
```

### Pitfall 6: Not Checking Selection

❌ **Wrong:**
```javascript
const view = $(selection).first();  // Assumes something is selected
```

✅ **Correct:**
```javascript
const view = $(selection).filter("archimate-diagram-model").first();
if (!view) {
    window.alert("Please select a view first.");
    return;
}
```

### Pitfall 7: Path Separator Issues

❌ **Wrong:**
```javascript
load(__DIR__ + "/lib/utils.js");  // Double separator on Windows
```

✅ **Correct:**
```javascript
load(__DIR__ + "lib/utils.js");  // __DIR__ already has trailing separator
```

---

## Testing Scripts in Archi

### Basic Testing Workflow

1. **Open Archi** with a test model
2. **Open Scripts window**: Window → JArchi Scripts
3. **Navigate to your script** in the scripts folder
4. **Double-click** to run (or right-click → Run)
5. **Check Console** for errors: Window → Console

### Debugging Tips

1. **Add logging statements:**
   ```javascript
   console.log("DEBUG: variable = " + JSON.stringify(variable));
   ```

2. **Use Chrome DevTools** (JArchi 1.9+):
   - Start Archi with debugging enabled
   - Connect Chrome to `chrome://inspect`
   - See `context/Chrome Debugger Guide.md` for details

4. **Test incrementally:**
   - Test small sections of code
   - Add try-catch blocks around new code
   - Verify each step works before moving on

---

## Migration Checklist

When migrating a legacy script to use modern patterns:

- [ ] Add proper JSDoc header with all required fields
- [ ] Add `console.clear(); console.show();` at start
- [ ] Wrap main code in IIFE with `"use strict"`
- [ ] Replace inline Java.type() calls with swtImports module
- [ ] Replace manual dialog pattern with BaseDialog
- [ ] Replace verbose GridDataFactory calls with layouts module
- [ ] Replace manual widget creation with WidgetFactory (where appropriate)
- [ ] Add try-catch error handling
- [ ] Use console.log/warn/error for debugging output
- [ ] Handle empty element names properly
- [ ] Test in Archi

---

## Complete Script Example

Here's a complete working script following all conventions:

```javascript
/**
 * @name Element Counter
 * @description Counts elements by type in the current view or model
 * @version 1.0.0
 * @author Coding Agent
 * @lastModifiedDate 2026-01-08
 */

console.clear();
console.show();

// Load dependencies
load(__DIR__ + "lib/ui/BaseDialog.js");
load(__DIR__ + "lib/core/swtImports.js");
load(__DIR__ + "lib/ui/layouts.js");

(function () {
    "use strict";

    const { SWT, Table, TableColumn, TableItem, GridDataFactory } = swtImports;

    try {
        console.log("Script started");

        // Get current view or use full model
        const currentView = $(selection).filter("archimate-diagram-model").first();
        const scope = currentView ? $(currentView).children("element") : $("element");
        
        if (scope.size() === 0) {
            window.alert("No elements found.");
            return;
        }

        // Count elements by type
        const counts = {};
        scope.each(function (item) {
            const concept = item.concept || item;
            const typeName = concept.type || "unknown";
            counts[typeName] = (counts[typeName] || 0) + 1;
        });

        // Sort by count descending
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

        // Create results dialog
        const dialog = BaseDialog.create({
            title: "Element Counter Results",
            message: currentView 
                ? "Elements in view: " + currentView.name 
                : "Elements in model",
            size: { width: 500, height: 400 },

            createContents: function (parent, dlg) {
                // Create table
                const table = new Table(parent, SWT.BORDER | SWT.FULL_SELECTION);
                table.setHeaderVisible(true);
                table.setLinesVisible(true);
                GridDataFactory.fillDefaults().grab(true, true).applyTo(table);

                // Add columns
                const typeCol = new TableColumn(table, SWT.NONE);
                typeCol.setText("Element Type");
                typeCol.setWidth(300);

                const countCol = new TableColumn(table, SWT.RIGHT);
                countCol.setText("Count");
                countCol.setWidth(100);

                // Add rows
                sorted.forEach(function (entry) {
                    const item = new TableItem(table, SWT.NONE);
                    item.setText(0, entry[0]);
                    item.setText(1, String(entry[1]));
                });

                dlg.widgets.table = table;
            }
        });

        dialog.open();
        log.info("Script completed successfully");

    } catch (error) {
        log.error("Script failed: " + error.toString());
        console.error("Error: " + error.toString());
        window.alert("Error: " + error.message);
    }
})();
```

---

## Quick Reference Card

| Task | Pattern |
|------|---------|
| Load a library | `load(__DIR__ + "lib/filename.js");` |
| Import Java class | `const Cls = Java.type("full.class.Name");` |
| Use swtImports | `const { SWT, Label } = swtImports;` |
| Create dialog | `BaseDialog.create({ title, createContents, onOk });` |
| Get selection | `$(selection).filter("element")` |
| Get current view | `$(selection).filter("archimate-diagram-model").first()` |
| Get model | `$.model` or `model` |
| Handle empty name | `name && name.trim() ? name : "-- unnamed --"` |
| Log message | `log.info("message");` |
| Show alert | `window.alert("message");` |
| Confirm dialog | `BaseDialog.confirm("Title", "Question?")` |

---

*Last updated: 2026-01-08*
