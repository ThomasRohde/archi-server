# JArchi 1.11 / Archi 5.7 API Reference

This document covers new APIs and features added in JArchi versions 1.7 through 1.11, for use with Archi 5.4 through 5.7.

## JArchi 1.11 (August 28, 2025)

### Connection Router Type on Views

Access and modify the connection router type for views:

```javascript
// Get the router type
var view = $(selection).filter("view").first();
var routerType = view.routerType;
// Returns: "manual", "manhattan", or "shortest_path"

// Set the router type
view.routerType = "manhattan";
```

### getFillColor() Default Behavior

`diagramObject.getFillColor()` now returns the default fill color if no custom color is set (previously returned `null`):

```javascript
var obj = $(selection).filter("diagram-model-object").first();
var color = obj.getFillColor(); // Always returns a color value now
```

---

## JArchi 1.10 (May 6, 2025)

### Move Diagram Objects with add()

The `add(object, x, y)` method now moves existing diagram objects to a new parent:

```javascript
var view = $(selection).filter("view").first();
var groupElement = view.find("group").first();
var elementToMove = view.find("business-process").first();

// Move element into the group at position (50, 50)
groupElement.add(elementToMove, 50, 50);
```

### Default Bounds

Width and height of -1 now use defaults for all object types:

```javascript
// Create element with default size
var obj = view.add(element, 100, 100, -1, -1);
// Uses the default dimensions for that element type
```

---

## JArchi 1.9 (March 24, 2025)

### Chrome Debugger Support

Debug scripts using Chrome DevTools. See [Chrome Debugger Guide](chrome-debugger-guide.md).

```javascript
// Add breakpoint in code
debugger;
```

### model.isSet()

Check if a model is currently selected/loaded:

```javascript
if (!model.isSet()) {
    window.alert("Please open a model first!");
    exit();
}
```

---

## JArchi 1.8 (February 3, 2025)

**Requires Archi 5.5 or later**

### GraalVM 24.1.2

Updated to GraalVM 24.1.2 with improved performance and Java 21 support.

### duplicate() Function

Duplicate elements and views:

```javascript
// Duplicate an element
var element = $(selection).filter("element").first();
var copy = element.duplicate();
copy.name = element.name + " (Copy)";

// Duplicate a view
var view = $(selection).filter("view").first();
var viewCopy = view.duplicate();
viewCopy.name = view.name + " (Copy)";
```

### delete() with keepChildren

Delete elements while preserving children:

```javascript
var group = view.find("group").first();
// Delete group but keep its children in the view
group.delete(false);
```

### Line Style API

Get and set line styles for diagram objects:

```javascript
var connection = $(selection).filter("relationship").first();

// Get line style (returns 0, 1, 2, or 3)
var style = connection.getLineStyle();

// Set line style
connection.setLineStyle(1); // Curved

// Line style values:
// 0 = Straight (default)
// 1 = Curved
// 2 = Orthogonal
// 3 = Direct
```

### Removed APIs

⚠️ **Breaking Changes:**

| Removed | Replacement |
|---------|-------------|
| `exec()` | `$.child_process.exec()` |
| `getArgs()` | `$.args` |

```javascript
// Old (removed):
// var result = exec("dir");
// var args = getArgs();

// New:
var result = $.child_process.exec("dir");
var args = $.args;
```

---

## JArchi 1.7 (October 9, 2024)

### Z-Position Support

Control the z-order (stacking) of diagram objects:

```javascript
var obj = $(selection).filter("diagram-model-object").first();

// Get current z-position (0 = back, higher = front)
var zPos = obj.zPos;

// Bring to front
obj.zPos = 999;

// Send to back
obj.zPos = 0;

// Move forward one step
obj.zPos = obj.zPos + 1;
```

### Enhanced Export Options

SVG and PDF export now support additional options:

```javascript
// Export with options
$.model.renderViewToSVG(view, filePath, {
    // Export options
});
```

### collection#parents(selector)

Filter parent elements with a selector:

```javascript
var element = $(selection).first();

// Get all parent application components
var appParents = element.parents("application-component");

// Get immediate parent of specific type
var container = element.parent("grouping");
```

### 20 Shortcut Key Slots

Scripts can now be assigned to 20 shortcut keys (up from 10).

---

## Archi 5.7 Features (September 23, 2025)

### Select Objects of Same Type

New UI action that can be scripted:

```javascript
// Select all elements of the same type as current selection
var selectedType = $(selection).first().type;
var sameType = $(selection).view().find(selectedType);
// Use Archi's selection mechanism to select these
```

### Improved Connection Bendpoints

Better handle display for connection bendpoints - relevant for bendpoint manipulation scripts.

### Incremental Tree Display

Large models now load tree nodes incrementally - scripts accessing the model tree should handle lazy loading.

---

## Migration Checklist

When updating scripts for JArchi 1.11:

### Required Changes

- [ ] Replace `exec()` with `$.child_process.exec()`
- [ ] Replace `getArgs()` with `$.args`
- [ ] Test scripts with GraalVM 24.1.2

### Recommended Updates

- [ ] Use `model.isSet()` for model validation
- [ ] Leverage `duplicate()` for copy operations
- [ ] Use line style APIs for style management
- [ ] Add z-position support for layer management
- [ ] Consider Chrome debugger for development

### New Opportunities

- [ ] Connection router type management
- [ ] Enhanced export options
- [ ] Parent selector filtering
- [ ] Default bounds simplification

---

## Code Examples

### Complete Element Duplication

```javascript
/**
 * Duplicate selected elements with all properties
 */
$(selection).filter("element").each(function(element) {
    var copy = element.duplicate();
    copy.name = element.name + " (Copy)";
    
    // Copy properties
    element.prop().forEach(function(key) {
        copy.prop(key, element.prop(key));
    });
    
    console.log("Duplicated: " + element.name);
});
```

### Z-Order Management

```javascript
/**
 * Arrange selected elements by type (applications front, technology back)
 */
var zLayers = {
    "technology": 0,
    "physical": 100,
    "application": 200,
    "business": 300,
    "strategy": 400,
    "motivation": 500
};

$(selection).filter("diagram-model-object").each(function(obj) {
    var layer = obj.concept ? obj.concept.type.split("-")[0] : "application";
    var baseZ = zLayers[layer] || 200;
    obj.zPos = baseZ;
});
```

### Router Type Utility

```javascript
/**
 * Set all views to Manhattan routing
 */
$("view").each(function(view) {
    if (view.routerType !== "manhattan") {
        view.routerType = "manhattan";
        console.log("Updated: " + view.name);
    }
});
```

## See Also

- [JArchi Wiki](https://github.com/archimatetool/archi-scripting-plugin/wiki)
- [Chrome Debugger Guide](chrome-debugger-guide.md)
- [JArchi Scripting Guide](jarchi-scripting-guide.md)
