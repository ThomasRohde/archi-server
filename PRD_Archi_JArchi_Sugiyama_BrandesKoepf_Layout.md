# PRD — Hierarchical (Sugiyama) + Brandes–Köpf Layout for ArchiMate Views in Archi (jArchi Script)

**Document status:** Developer-ready PRD (v1.0)  
**Target platform:** Archi® + jArchi Scripting Plugin  
**Primary outcome:** Automatic hierarchical layout for an ArchiMate View (layered drawing) with **no element overlap**.

> **Why this PRD exists:** ArchiMate views can become hard to read as they grow; a Sugiyama-style layered layout produces readable hierarchies (layers + reduced crossings), while Brandes–Köpf provides a compact, visually pleasing x-coordinate assignment within that framework. citeturn2search16turn2search10

---

## 1. Background & Context

### 1.1 Problem statement
Archi users often spend significant time manually arranging elements in ArchiMate views for readability (consistent direction, low crossings, and non-overlapping nodes). The requirement is to implement an **automatic hierarchical layout** that:
- Works on a selected ArchiMate view (diagram)
- Produces a **layered** (hierarchical) drawing
- Uses **Brandes–Köpf** for node positioning
- Ensures **elements do not overlap** (hard requirement)
- Is implemented as a **jArchi script** (JavaScript running inside Archi)

jArchi provides APIs to access and modify views and diagram objects including bounds (x, y, width, height), enabling automated layout directly in the tool. citeturn2search32turn2search33turn2search1

### 1.2 Definitions
- **View**: An Archi diagram (ArchiMate View) containing visual objects and connections. citeturn2search32turn2search1
- **Visual object**: Diagram object referencing a concept (element) or a non-concept visual (group/note/etc.) with bounds and style properties. citeturn2search33turn2search32
- **Layer/rank**: Discrete row/column in a hierarchical layout.
- **Proper layering**: Long edges are subdivided so edges connect only adjacent layers (often via dummy nodes). citeturn2search10turn2search16

---

## 2. Goals, Non-goals, and Success Metrics

### 2.1 Goals (must-have)
1. **Hierarchical layout** of a single ArchiMate view using the Sugiyama pipeline (cycle handling, layering, crossing reduction, coordinate assignment). citeturn2search16turn2search10
2. **Brandes–Köpf** horizontal coordinate assignment with block alignment + horizontal compaction and balanced 4-way sweep. citeturn2search10
3. **No overlaps** between laid out visual objects (rectangles) within the layout scope.
4. **Configurable orientation**: Top-to-bottom (default), optionally left-to-right.
5. **Configurable spacing**: node spacing (horizontal), layer spacing (vertical).
6. **Works via jArchi**: read view contents, compute layout, write bounds using jArchi commands so it is undoable.

jArchi scripts can modify views and rely on a command stack enabling Undo/Redo for script actions; users can undo changes after running scripts. citeturn2search48turn2search43turn2search38

### 2.2 Non-goals (v1)
- Perfect global optimum for crossings (NP-hard); we will use common heuristics (median/barycenter sweeps). citeturn2search16turn2search19
- Sophisticated edge routing (orthogonal routing with port constraints). We will rely on Archi’s view routing settings when possible and optionally clear/set bendpoints. (Future.) citeturn2search32turn2search33
- Full support for nested layouts inside Groups/Containers in v1 (see scope & limitations). Coordinates are relative to parent for nested objects, which complicates global layout; v1 focuses on top-level objects with an optional iterative container mode. citeturn2search3turn2search32

### 2.3 Success metrics
- **0 overlaps** in the targeted layout scope (verified by rectangle intersection test).
- **≥ 80% of edges** have non-negative “downward” direction in the selected orientation (after cycle breaking/restoration, when applicable).
- Layout runtime:
  - ≤ 2s for 200 nodes / 300 edges on a typical developer workstation.
  - ≤ 10s for 1,000 nodes / 2,000 edges (best effort).

---

## 3. Users & Use Cases

### 3.1 Primary users
- Enterprise Architects / Modellers using Archi to maintain ArchiMate views.
- Power users who already run jArchi automation.

### 3.2 Core use cases
1. **Auto-layout current view**: user selects a view and runs script to layout the entire view.
2. **Auto-layout selection**: user selects a subset of objects and runs script to layout only those objects (induced subgraph).
3. **Layout with constraints**: user chooses direction, spacing, and whether to treat certain relationship types as “hierarchy edges”.

---

## 4. Scope & Assumptions

### 4.1 Layout scope options
- **Whole view** (default)
- **Selection only** (nodes + any internal connections)

### 4.2 Supported diagram content (v1)
- **ArchiMate concept objects** (Archimate diagram objects)
- **Connections** referencing ArchiMate relationships between two objects in the view
- Optional: include “junction”/relationship objects if present

jArchi provides view APIs to add/move objects and relationships; diagram objects expose bounds that can be set. citeturn2search32turn2search33

### 4.3 Out of scope (v1)
- Non-ArchiMate connections created via `createConnection()` (kept but not used for layout graph). citeturn2search32
- Nested layouts inside groups/containers by default (see Section 10.3 for planned extension). Nested coordinate systems are relative to parent containers. citeturn2search3turn2search32

### 4.4 Engine/runtime assumptions
- jArchi runs on GraalVM JS in recent versions; `bounds` may be represented as a Java Map/Proxy object where property access can differ across engines, so the script must handle both styles safely. citeturn2search36turn2search45

---

## 5. Functional Requirements

### FR-1 — Launch & Target selection
- The script must determine the **target view** in this priority order:
  1) currently open/active view in UI (if available)
  2) view in current selection
  3) prompt user to pick a view

jArchi scripts assume a selected model or view can be active; the API supports opening views in the UI and working with views as objects. citeturn2search48turn2search32turn2search1

### FR-2 — Choose layout scope
- Option A: layout all top-level objects in the view
- Option B: layout only selected objects
- In “selection” mode, include edges where both endpoints are in the selection.

### FR-3 — Build a layered graph from a view
- Nodes represent diagram objects (visual components) referencing ArchiMate elements.
- Edges represent diagram connections referencing ArchiMate relationships.
- Multiple edges between same pair are supported.
- Self-loops are ignored for layering purposes (but kept visually).

### FR-4 — Orientation
- Default: **Top-to-bottom** layering (y increases down)
- Optional: **Left-to-right** layering (x increases right), achieved by swapping axes after computation.

### FR-5 — Cycle handling
- If the induced graph is cyclic, apply a **cycle-breaking heuristic**:
  - Greedy feedback arc heuristic (remove sinks/sources, otherwise pick node with max(out-in))
  - Mark reversed edges so they can be visually tagged or restored.

Layered graph drawing typically starts by making the graph acyclic via edge reversals when necessary. citeturn2search16turn2search19

### FR-6 — Layer assignment
- Assign an integer layer to each node such that edges go from lower to higher layers.
- Use **longest-path layering** for v1 (fast and simple).
- Add optional constraints:
  - fixed layer for “anchor” nodes
  - max nodes per layer (soft; future)

### FR-7 — Properization (dummy nodes)
- For any edge that spans > 1 layer, insert dummy nodes so all edges are between adjacent layers.
- Keep dummy nodes internal; do not create diagram objects.

Proper layered graphs (no long edges) are a standard requirement for Brandes–Köpf-style coordinate assignment. citeturn2search10turn2search16

### FR-8 — Crossing minimization
- Apply iterative sweeps (down and up) using **barycenter/median heuristic** per layer.
- Stop after configurable max iterations or when crossings no longer improve.

Crossing minimization is a core phase in Sugiyama-style layout and is typically solved with heuristics in practice. citeturn2search16turn2search19

### FR-9 — Coordinate assignment (Brandes–Köpf)
- Implement Brandes–Köpf “Fast and Simple Horizontal Coordinate Assignment”:
  - vertical alignment (median neighbor alignment with conflict handling)
  - horizontal compaction (block DAG compaction)
  - compute 4 variants (up/down × left/right) and balance the results

Brandes–Köpf defines these steps and explicitly describes four directional variants and balancing. citeturn2search10

### FR-10 — No overlap guarantee
- Enforce minimum separation constraints such that rectangles do not overlap:
  - within a layer: ensure adjacent nodes’ x-distance >= (w_left/2 + w_right/2 + nodeSpacing)
  - between layers: y-distance >= (h_layer_max + layerSpacing)

Brandes–Köpf’s formulation includes minimum separation constraints and notes separation can be chosen uniformly or per neighbor pair, which we leverage for varying node sizes. citeturn2search10

Additionally, perform a final **collision resolution pass**:
- For each layer, scan nodes left-to-right and push right minimally when overlap is detected.
- Propagate shifts to aligned blocks so constraints remain satisfied.

### FR-11 — Apply bounds to diagram objects
- Set each object’s bounds (x, y, width, height) using jArchi APIs.
- Respect existing widths/heights unless a “normalize sizes” option is chosen.

Diagram objects support bounds manipulation (getBounds/setBounds), and views can create/move objects with bounds. citeturn2search33turn2search32

### FR-12 — Connection routing (optional v1)
- Option to set view connection router to **MANHATTAN** or **BENDPOINT**.
- Option to clear bendpoints on affected connections.

Views can get/set the connection router; connections have bendpoint APIs. citeturn2search32turn2search28

### FR-13 — Undo/Redo and safety
- Changes must be undoable using Archi/jArchi command infrastructure.
- Script should warn users to back up models / run on test models.

jArchi documentation warns about running scripts without a backup and highlights that script actions can be undone via Archi Undo. citeturn2search48turn2search43

---

## 6. Non-functional Requirements

### NFR-1 — Performance
- Time complexity target: ~O((V+E) log(V+E)) for key phases; Brandes–Köpf coordinate assignment is linear-time in layered graph size. citeturn2search10
- Avoid quadratic crossing counting in large graphs; use approximate crossing measures.

### NFR-2 — Determinism
- With identical inputs and configuration, layout output must be deterministic.

### NFR-3 — Robustness
- Handle disconnected graphs (layout each component, then pack components).
- Handle nodes with missing or default bounds.

### NFR-4 — Compatibility
- Support Archi 5.x + jArchi 1.8+ baseline (GraalVM JS runtime). citeturn2search45turn2search48

---

## 7. UX / Interaction Design

### 7.1 Invocation
- Script appears under Scripts menu / Scripts Manager.
- Provide a dialog (SWT/JFace) with:
  - Target view (if ambiguous)
  - Scope: All / Selection
  - Orientation: TB / LR
  - Spacing: nodeSpacing, layerSpacing
  - Crossing sweeps: iterations (default 4)
  - Respect nesting: Off (default), Experimental
  - Router option: Leave / Manhattan / Bendpoint

jArchi integrates with Archi’s UI and supports menu-driven scripts; developers can build dialogs via SWT/JFace using Java interoperability. citeturn2search8turn2search31

### 7.2 Progress & logging
- Log to console:
  - nodes/edges counts
  - cycle reversals count
  - layers count
  - time per phase
  - final overlap check result

### 7.3 Failure modes
- If no view found: show message and abort.
- If view has <2 nodes: no-op.
- If bounds API behaves differently due to engine quirks: fall back to safe accessors.

---

## 8. Algorithm Design (Developer Spec)

### 8.1 Overview pipeline (Sugiyama)
1. **Extract graph** from view
2. **Cycle removal** (if needed)
3. **Layer assignment**
4. **Properization** (dummy nodes)
5. **Crossing minimization**
6. **Coordinate assignment** (Brandes–Köpf)
7. **De-dummy** (remove dummy nodes, create bend points if needed)
8. **Apply bounds**
9. **Overlap validation**

Sugiyama-style layered drawing is commonly described as a phased pipeline including cycle removal, layering, crossing reduction and coordinate assignment. citeturn2search16turn2search19

### 8.2 Data structures

#### NodeRecord
- `id`: diagram object id
- `objRef`: jArchi visual object proxy
- `w`, `h`: width/height in pixels
- `layer`: int
- `order`: int (position within layer)
- `x`, `y`: computed
- `isDummy`: boolean

#### EdgeRecord
- `id`: connection id (or synthetic)
- `src`, `tgt`: NodeRecord references
- `reversed`: boolean
- `originalConnectionRef`: for diagram connection updates

#### Layer
- `index`
- `nodes[]` ordered
- `maxHeight`

### 8.3 View extraction

**Nodes to include**
- In v1: include diagram objects that reference ArchiMate concepts.

**Edges to include**
- Include diagram connections whose source and target are included nodes.

**Nested objects**
- Default: ignore children of groups; only layout root-level objects.
- Rationale: object coordinates are relative to the parent container when nested. citeturn2search3turn2search32

### 8.4 Bounds access & engine quirks

Because `bounds` may be returned as a Map/Proxy depending on runtime, implement a helper:
- `getBounds(obj)` returns `{x,y,width,height}`
- Try access order:
  1) `obj.bounds` fields (`bounds.x`)
  2) `obj.bounds['x']`
  3) `obj.getBounds()`

GraalVM vs Nashorn differences around Map/Proxy access have been discussed in jArchi issues; scripts must tolerate these variations. citeturn2search36turn2search33

### 8.5 Layer assignment (v1 longest path)
- Topologically sort DAG
- `layer[v] = 0` for sources
- For each edge (u→v): `layer[v] = max(layer[v], layer[u] + 1)`

### 8.6 Properization
- For edge (u→v) with `layer[v] - layer[u] > 1`:
  - create dummy nodes d1..dk on intermediate layers
  - replace edge with chain u→d1→...→dk→v

Brandes–Köpf assumes a proper layered graph; long edges are commonly subdivided by dummy vertices. citeturn2search10turn2search16

### 8.7 Crossing minimization (median/barycenter sweeps)
For each sweep direction:
- For each layer i:
  - compute barycenter of each node’s neighbors in adjacent layer
  - sort by barycenter (stable sort using previous order)
Repeat for configured iterations.

### 8.8 Brandes–Köpf coordinate assignment (adapted for varying widths)

#### 8.8.1 Vertical alignment
- Use median neighbors (upper or lower) based on sweep mode
- Detect conflicts and choose leftmost/rightmost alignment strategy

#### 8.8.2 Horizontal compaction
- Compress aligned nodes into blocks
- Compute x for blocks with separation constraints

Brandes–Köpf defines vertical alignment + horizontal compaction, computed in four variants and then balanced. citeturn2search10

#### 8.8.3 Variable separation (no overlap)
- Replace constant δ with pairwise δ(u,v) computed from widths:
  - `δ(u,v) = (w(u)/2 + w(v)/2 + nodeSpacing)`

The Brandes–Köpf paper describes the minimum separation constraint and notes separation can be uniform or varied; we leverage this to prevent overlaps with varying node sizes. citeturn2search10

### 8.9 Vertical placement
- y coordinate per layer:
  - `y(layer i) = sum_{j<i}(maxHeight(j) + layerSpacing)`

### 8.10 Component packing (disconnected graphs)
- Layout each connected component separately
- Pack components left-to-right (or top-to-bottom) with padding
- Ensure components do not overlap

---

## 9. Implementation in jArchi (Scripting)

### 9.1 High-level module structure
```
/scripts
  layout_hierarchical_sugiyama_bk.ajs
  /lib
    graph_extract.js
    sugiyama_layering.js
    crossing_minimization.js
    bk_coordinate_assignment.js
    overlap_resolve.js
    archi_apply_bounds.js
    ui_dialog.js
```

### 9.2 Key API touchpoints
- `view.add(element, x, y, width, height)` to create objects (not required for layout but referenced for understanding bounds). citeturn2search32
- `object.getBounds()` / `object.setBounds(map)` via diagram proxy APIs. citeturn2search33
- `view.connectionRouter` to set router style (optional). citeturn2search32

### 9.3 Applying bounds safely
- Use `setBounds({x, y, width, height})` on each diagram object.
- If object is nested (has parent), x/y are relative to that parent; v1 avoids moving nested children unless experimental mode is enabled. citeturn2search3turn2search32

### 9.4 Undo/Redo
- Ensure modifications are done through jArchi’s command system (normal API calls already do this).

jArchi is explicitly designed to ensure script-driven modifications are undoable via command stack integration. citeturn2search43turn2search38turn2search48

---

## 10. Edge Cases & Constraints

### 10.1 Multiple representations of the same concept
- A concept may appear multiple times in a view; treat each diagram object instance as distinct node.

### 10.2 Grouping / nesting
- Default: ignore nested children.
- Experimental: layout per container:
  - recursively layout children within each container bounds, then resize container to fit.

**Important:** nested coordinates are relative to the container, not the page. citeturn2search3

### 10.3 Relationships not present in the view
- Only use connections present in the view; do not infer from model-level relationships.

### 10.4 Unsupported visual types
- Notes, images: either fixed (not moved) or treated as non-graph “decorations”.

---

## 11. Validation & Test Plan

### 11.1 Unit-like tests (script-level)
- Graph extraction:
  - correct node/edge count from view
- Layering:
  - all edges go forward after cycle removal
- Properization:
  - all edges span exactly one layer after dummy insertion
- No-overlap:
  - rectangle intersection test returns false for all pairs in same scope

### 11.2 Integration tests (manual)
1. Small DAG (10 nodes) — verify readable layout
2. Diamond pattern — verify symmetry/stability
3. Cyclic graph — verify cycle breaking + visually acceptable results
4. Disconnected components — verify component packing
5. Mixed node sizes — verify no overlaps

### 11.3 Acceptance criteria
- A1: Running script on a view results in **no overlaps**.
- A2: Layout is undoable with a single Undo (or small number of Undos) and redoable.
- A3: Layout completes within target runtime for 200-node view.

jArchi Quick Start demonstrates that script actions can be undone via Archi Undo, reinforcing acceptance criterion A2. citeturn2search48

---

## 12. Telemetry / Logging

- Log per phase time and counts.
- Optional: write layout configuration into view properties (e.g., `layout.algorithm=sugiyama-bk`, timestamp).

---

## 13. Rollout Plan

### 13.1 MVP (v1)
- Whole-view layout, top-level objects only
- Sugiyama phases + BK coordinate assignment
- No overlap guarantee
- Simple dialog for parameters

### 13.2 v1.1
- Selection-only layout
- Optional router setting + bendpoint clearing

### 13.3 v2
- Nested container layout
- Size/port-aware coordinate assignment extensions (if required)

---

## 14. Appendix — Reference Links

- Brandes & Köpf paper (horizontal coordinate assignment) — [Fast and Simple Horizontal Coordinate Assignment](citeturn2search10)
- Sugiyama layered drawing overview — [Layered graph drawing overview](citeturn2search19) and handbook chapter excerpt citeturn2search16
- jArchi view API — [View wiki page](citeturn2search32)
- jArchi diagram model proxies (bounds, setBounds) — [Diagram Model Proxies](citeturn2search33)
- jArchi Quick Start (backup + undo) — [Quick Start](citeturn2search48)
- jArchi bounds engine quirks — [Issue #87](citeturn2search36)
- Nested coordinate behavior discussion — [Archi forum: Object Position Behaviour](citeturn2search3)

