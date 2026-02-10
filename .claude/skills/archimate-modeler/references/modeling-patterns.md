# ArchiMate Modeling Patterns as BOM Examples

## Pattern 1: Layered Service Chain

The canonical ArchiMate pattern connecting Business -> Application -> Technology via services.

```json
{
  "version": "1.0",
  "description": "Layered service chain: Customer -> Business Service -> App -> Technology",
  "changes": [
    { "op": "createElement", "type": "business-actor", "name": "Customer", "tempId": "e-customer" },
    { "op": "createElement", "type": "business-service", "name": "Order Processing", "tempId": "e-biz-svc" },
    { "op": "createElement", "type": "business-process", "name": "Handle Order", "tempId": "e-biz-proc" },
    { "op": "createElement", "type": "application-service", "name": "Order Service", "tempId": "e-app-svc" },
    { "op": "createElement", "type": "application-component", "name": "Order System", "tempId": "e-app-comp" },
    { "op": "createElement", "type": "technology-service", "name": "Database Service", "tempId": "e-tech-svc" },
    { "op": "createElement", "type": "node", "name": "Database Server", "tempId": "e-node" },

    { "op": "createRelationship", "type": "serving-relationship", "sourceId": "e-biz-svc", "targetId": "e-customer", "tempId": "r-serves-cust" },
    { "op": "createRelationship", "type": "realization-relationship", "sourceId": "e-biz-proc", "targetId": "e-biz-svc", "tempId": "r-realizes-bsvc" },
    { "op": "createRelationship", "type": "serving-relationship", "sourceId": "e-app-svc", "targetId": "e-biz-proc", "tempId": "r-app-serves-biz" },
    { "op": "createRelationship", "type": "realization-relationship", "sourceId": "e-app-comp", "targetId": "e-app-svc", "tempId": "r-realizes-asvc" },
    { "op": "createRelationship", "type": "serving-relationship", "sourceId": "e-tech-svc", "targetId": "e-app-comp", "tempId": "r-tech-serves-app" },
    { "op": "createRelationship", "type": "realization-relationship", "sourceId": "e-node", "targetId": "e-tech-svc", "tempId": "r-realizes-tsvc" },

    { "op": "createView", "name": "Layered Service View", "viewpoint": "layered", "tempId": "v-layered" },
    { "op": "addToView", "viewId": "v-layered", "elementId": "e-customer", "tempId": "vis-customer", "x": 200, "y": 10 },
    { "op": "addToView", "viewId": "v-layered", "elementId": "e-biz-svc", "tempId": "vis-bsvc", "x": 200, "y": 100 },
    { "op": "addToView", "viewId": "v-layered", "elementId": "e-biz-proc", "tempId": "vis-bproc", "x": 200, "y": 190 },
    { "op": "addToView", "viewId": "v-layered", "elementId": "e-app-svc", "tempId": "vis-asvc", "x": 200, "y": 290 },
    { "op": "addToView", "viewId": "v-layered", "elementId": "e-app-comp", "tempId": "vis-acomp", "x": 200, "y": 380 },
    { "op": "addToView", "viewId": "v-layered", "elementId": "e-tech-svc", "tempId": "vis-tsvc", "x": 200, "y": 470 },
    { "op": "addToView", "viewId": "v-layered", "elementId": "e-node", "tempId": "vis-node", "x": 200, "y": 560 },

    { "op": "addConnectionToView", "viewId": "v-layered", "relationshipId": "r-serves-cust", "sourceVisualId": "vis-bsvc", "targetVisualId": "vis-customer" },
    { "op": "addConnectionToView", "viewId": "v-layered", "relationshipId": "r-realizes-bsvc", "sourceVisualId": "vis-bproc", "targetVisualId": "vis-bsvc" },
    { "op": "addConnectionToView", "viewId": "v-layered", "relationshipId": "r-app-serves-biz", "sourceVisualId": "vis-asvc", "targetVisualId": "vis-bproc" },
    { "op": "addConnectionToView", "viewId": "v-layered", "relationshipId": "r-realizes-asvc", "sourceVisualId": "vis-acomp", "targetVisualId": "vis-asvc" },
    { "op": "addConnectionToView", "viewId": "v-layered", "relationshipId": "r-tech-serves-app", "sourceVisualId": "vis-tsvc", "targetVisualId": "vis-acomp" },
    { "op": "addConnectionToView", "viewId": "v-layered", "relationshipId": "r-realizes-tsvc", "sourceVisualId": "vis-node", "targetVisualId": "vis-tsvc" }
  ]
}
```

## Pattern 2: Application Cooperation

Multiple applications communicating via services.

```json
{
  "version": "1.0",
  "description": "Application cooperation: CRM <-> Order System via services",
  "changes": [
    { "op": "createElement", "type": "application-component", "name": "CRM System", "tempId": "e-crm" },
    { "op": "createElement", "type": "application-component", "name": "Order System", "tempId": "e-order" },
    { "op": "createElement", "type": "application-service", "name": "Customer Data Service", "tempId": "e-cust-svc" },
    { "op": "createElement", "type": "application-interface", "name": "Customer API", "tempId": "e-cust-api" },
    { "op": "createElement", "type": "data-object", "name": "Customer Record", "tempId": "e-cust-data" },

    { "op": "createRelationship", "type": "realization-relationship", "sourceId": "e-crm", "targetId": "e-cust-svc", "tempId": "r-crm-realizes" },
    { "op": "createRelationship", "type": "assignment-relationship", "sourceId": "e-cust-api", "targetId": "e-cust-svc", "tempId": "r-api-assigned" },
    { "op": "createRelationship", "type": "serving-relationship", "sourceId": "e-cust-svc", "targetId": "e-order", "tempId": "r-svc-serves-order" },
    { "op": "createRelationship", "type": "access-relationship", "sourceId": "e-cust-svc", "targetId": "e-cust-data", "tempId": "r-access-data", "accessType": 1 }
  ]
}
```

## Pattern 3: Actor-Role-Process

Separating organizational actors from roles for flexibility.

```json
{
  "version": "1.0",
  "description": "Actor-Role-Process pattern",
  "changes": [
    { "op": "createElement", "type": "business-actor", "name": "Claims Department", "tempId": "e-dept" },
    { "op": "createElement", "type": "business-role", "name": "Claims Handler", "tempId": "e-role" },
    { "op": "createElement", "type": "business-process", "name": "Handle Insurance Claim", "tempId": "e-proc" },
    { "op": "createElement", "type": "business-service", "name": "Claim Processing", "tempId": "e-svc" },
    { "op": "createElement", "type": "business-object", "name": "Insurance Claim", "tempId": "e-obj" },

    { "op": "createRelationship", "type": "assignment-relationship", "sourceId": "e-dept", "targetId": "e-role", "tempId": "r-actor-role" },
    { "op": "createRelationship", "type": "assignment-relationship", "sourceId": "e-role", "targetId": "e-proc", "tempId": "r-role-proc" },
    { "op": "createRelationship", "type": "realization-relationship", "sourceId": "e-proc", "targetId": "e-svc", "tempId": "r-proc-svc" },
    { "op": "createRelationship", "type": "access-relationship", "sourceId": "e-proc", "targetId": "e-obj", "tempId": "r-access-obj", "accessType": 3 }
  ]
}
```

## Pattern 4: Microservices Architecture

Modeling microservices at the Application Layer.

```json
{
  "version": "1.0",
  "description": "Microservices pattern with container deployment",
  "changes": [
    { "op": "createElement", "type": "application-component", "name": "Order Service", "tempId": "e-order-ms" },
    { "op": "createElement", "type": "application-service", "name": "Order Processing", "tempId": "e-order-svc" },
    { "op": "createElement", "type": "application-interface", "name": "Order API (REST)", "tempId": "e-order-api" },
    { "op": "createElement", "type": "application-function", "name": "Validate Order", "tempId": "e-validate" },
    { "op": "createElement", "type": "application-function", "name": "Process Payment", "tempId": "e-payment" },

    { "op": "createElement", "type": "artifact", "name": "order-service:latest", "tempId": "e-image" },
    { "op": "createElement", "type": "node", "name": "Kubernetes Cluster", "tempId": "e-k8s" },
    { "op": "createElement", "type": "system-software", "name": "Container Runtime", "tempId": "e-runtime" },

    { "op": "createRelationship", "type": "realization-relationship", "sourceId": "e-order-ms", "targetId": "e-order-svc", "tempId": "r-ms-realizes-svc" },
    { "op": "createRelationship", "type": "assignment-relationship", "sourceId": "e-order-api", "targetId": "e-order-svc", "tempId": "r-api-svc" },
    { "op": "createRelationship", "type": "composition-relationship", "sourceId": "e-order-ms", "targetId": "e-validate", "tempId": "r-comp-validate" },
    { "op": "createRelationship", "type": "composition-relationship", "sourceId": "e-order-ms", "targetId": "e-payment", "tempId": "r-comp-payment" },

    { "op": "createRelationship", "type": "realization-relationship", "sourceId": "e-image", "targetId": "e-order-ms", "tempId": "r-artifact-realizes" },
    { "op": "createRelationship", "type": "assignment-relationship", "sourceId": "e-runtime", "targetId": "e-image", "tempId": "r-runtime-image" },
    { "op": "createRelationship", "type": "composition-relationship", "sourceId": "e-k8s", "targetId": "e-runtime", "tempId": "r-k8s-runtime" }
  ]
}
```

## Pattern 5: Capability-to-Application Mapping

Linking strategy to implementation.

```json
{
  "version": "1.0",
  "description": "Capability map with application realization",
  "changes": [
    { "op": "createElement", "type": "goal", "name": "Improve Customer Experience", "tempId": "e-goal" },
    { "op": "createElement", "type": "capability", "name": "Customer Management", "tempId": "e-cap-parent" },
    { "op": "createElement", "type": "capability", "name": "Customer Onboarding", "tempId": "e-cap-onboard" },
    { "op": "createElement", "type": "capability", "name": "Customer Support", "tempId": "e-cap-support" },
    { "op": "createElement", "type": "application-component", "name": "CRM Platform", "tempId": "e-crm" },
    { "op": "createElement", "type": "application-component", "name": "Support Portal", "tempId": "e-portal" },

    { "op": "createRelationship", "type": "realization-relationship", "sourceId": "e-cap-parent", "targetId": "e-goal", "tempId": "r-cap-goal" },
    { "op": "createRelationship", "type": "composition-relationship", "sourceId": "e-cap-parent", "targetId": "e-cap-onboard", "tempId": "r-cap-comp1" },
    { "op": "createRelationship", "type": "composition-relationship", "sourceId": "e-cap-parent", "targetId": "e-cap-support", "tempId": "r-cap-comp2" },
    { "op": "createRelationship", "type": "realization-relationship", "sourceId": "e-crm", "targetId": "e-cap-onboard", "tempId": "r-crm-cap" },
    { "op": "createRelationship", "type": "realization-relationship", "sourceId": "e-portal", "targetId": "e-cap-support", "tempId": "r-portal-cap" }
  ]
}
```

## Pattern 6: Migration Roadmap

Plateau/gap analysis for architecture transitions.

```json
{
  "version": "1.0",
  "description": "Migration roadmap: baseline -> transition -> target",
  "changes": [
    { "op": "createElement", "type": "plateau", "name": "Baseline Architecture", "tempId": "e-baseline" },
    { "op": "createElement", "type": "plateau", "name": "Transition 1", "tempId": "e-transition" },
    { "op": "createElement", "type": "plateau", "name": "Target Architecture", "tempId": "e-target" },
    { "op": "createElement", "type": "gap", "name": "Legacy to Cloud Migration", "tempId": "e-gap" },
    { "op": "createElement", "type": "work-package", "name": "Cloud Migration Project", "tempId": "e-wp" },
    { "op": "createElement", "type": "deliverable", "name": "Cloud Infrastructure", "tempId": "e-deliv" },

    { "op": "createRelationship", "type": "triggering-relationship", "sourceId": "e-baseline", "targetId": "e-transition", "tempId": "r-trig1" },
    { "op": "createRelationship", "type": "triggering-relationship", "sourceId": "e-transition", "targetId": "e-target", "tempId": "r-trig2" },
    { "op": "createRelationship", "type": "association-relationship", "sourceId": "e-gap", "targetId": "e-baseline", "tempId": "r-gap-base" },
    { "op": "createRelationship", "type": "association-relationship", "sourceId": "e-gap", "targetId": "e-transition", "tempId": "r-gap-trans" },
    { "op": "createRelationship", "type": "realization-relationship", "sourceId": "e-wp", "targetId": "e-deliv", "tempId": "r-wp-deliv" },
    { "op": "createRelationship", "type": "realization-relationship", "sourceId": "e-deliv", "targetId": "e-transition", "tempId": "r-deliv-plat" }
  ]
}
```

## View Layout Tips

After creating a view and adding elements/connections, apply auto-layout:

```bash
archicli view layout <viewId> --rankdir TB --ranksep 80 --nodesep 60
```

For left-to-right flows: `--rankdir LR`
For vertical hierarchy: `--rankdir TB` (default)

Export to image for review:
```bash
archicli view export <viewId> --scale 2 --format PNG
```
