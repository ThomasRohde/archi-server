# Manual Verification: Duplicate Detection

This document describes how to manually verify the duplicate detection feature works correctly.

## Prerequisites

1. Start Archi with the Model API Server running
2. Open at least one view (required for undo support)
3. Ensure server is running on localhost:8765

## Test 1: Detect Duplicate Element

### Step 1: Check server health
```powershell
curl -s http://localhost:8765/health | ConvertFrom-Json
```

Expected: Server is healthy and model is loaded

### Step 2: Create first element
```powershell
$body = @{
    changes = @(
        @{
            op = "createElement"
            type = "business-actor"
            name = "TestDuplicateActor"
            tempId = "t1"
        }
    )
} | ConvertTo-Json -Depth 10

curl -s -X POST http://localhost:8765/model/apply `
  -H "Content-Type: application/json" `
  -d $body | ConvertFrom-Json
```

Expected: Returns operationId, status "queued"

### Step 3: Wait and check operation status
```powershell
# Replace OP_ID with the operationId from step 2
curl -s "http://localhost:8765/ops/status?opId=OP_ID" | ConvertFrom-Json
```

Expected: status "complete", result contains mapping t1 → real ID

### Step 4: Try to create duplicate (should fail)
```powershell
$body2 = @{
    changes = @(
        @{
            op = "createElement"
            type = "business-actor"
            name = "TestDuplicateActor"  # Same name and type
            tempId = "t2"
        }
    )
} | ConvertTo-Json -Depth 10

curl -s -X POST http://localhost:8765/model/apply `
  -H "Content-Type: application/json" `
  -d $body2 | ConvertFrom-Json
```

**Expected Response:**
```json
{
  "error": {
    "code": "ValidationError",
    "message": "Error: Change 0 (createElement): element 'TestDuplicateActor' of type 'business-actor' already exists (id: [real-id-from-step-3])"
  }
}
```

HTTP Status: **400 Bad Request**

## Test 2: Allow Same Name, Different Type

### Create element with same name but different type (should succeed)
```powershell
$body3 = @{
    changes = @(
        @{
            op = "createElement"
            type = "business-role"  # Different type
            name = "TestDuplicateActor"  # Same name
            tempId = "t3"
        }
    )
} | ConvertTo-Json -Depth 10

curl -s -X POST http://localhost:8765/model/apply `
  -H "Content-Type: application/json" `
  -d $body3 | ConvertFrom-Json
```

**Expected:** Status 200, operationId returned (should succeed because type is different)

## Test 3: Detect Intra-Batch Duplicate Elements

```powershell
$body4 = @{
    changes = @(
        @{
            op = "createElement"
            type = "business-actor"
            name = "BatchDuplicateTest"
            tempId = "t10"
        },
        @{
            op = "createElement"
            type = "business-actor"
            name = "BatchDuplicateTest"  # Duplicate in same batch
            tempId = "t11"
        }
    )
} | ConvertTo-Json -Depth 10

curl -s -X POST http://localhost:8765/model/apply `
  -H "Content-Type: application/json" `
  -d $body4 | ConvertFrom-Json
```

**Expected Response:**
```json
{
  "error": {
    "code": "ValidationError",
    "message": "Error: Change 1 (createElement): element 'BatchDuplicateTest' of type 'business-actor' already created earlier in this batch (tempId: t10)"
  }
}
```

HTTP Status: **400 Bad Request**

## Test 4: Detect Duplicate Relationship

### Step 1: Create two elements first
```powershell
$elementsBody = @{
    changes = @(
        @{
            op = "createElement"
            type = "business-actor"
            name = "RelSource"
            tempId = "ts1"
        },
        @{
            op = "createElement"
            type = "business-service"
            name = "RelTarget"
            tempId = "tt1"
        }
    )
} | ConvertTo-Json -Depth 10

$elemResponse = curl -s -X POST http://localhost:8765/model/apply `
  -H "Content-Type: application/json" `
  -d $elementsBody | ConvertFrom-Json

# Wait and get IDs
Start-Sleep -Seconds 2
$elemStatus = curl -s "http://localhost:8765/ops/status?opId=$($elemResponse.operationId)" | ConvertFrom-Json
$sourceId = $elemStatus.result[0].id
$targetId = $elemStatus.result[1].id
```

### Step 2: Create first relationship
```powershell
$rel1Body = @{
    changes = @(
        @{
            op = "createRelationship"
            type = "serving-relationship"
            sourceId = $sourceId
            targetId = $targetId
            tempId = "tr1"
        }
    )
} | ConvertTo-Json -Depth 10

$rel1Response = curl -s -X POST http://localhost:8765/model/apply `
  -H "Content-Type: application/json" `
  -d $rel1Body | ConvertFrom-Json

# Wait for completion
Start-Sleep -Seconds 2
```

### Step 3: Try to create duplicate relationship (should fail)
```powershell
$rel2Body = @{
    changes = @(
        @{
            op = "createRelationship"
            type = "serving-relationship"  # Same type
            sourceId = $sourceId           # Same source
            targetId = $targetId           # Same target
            tempId = "tr2"
        }
    )
} | ConvertTo-Json -Depth 10

curl -s -X POST http://localhost:8765/model/apply `
  -H "Content-Type: application/json" `
  -d $rel2Body | ConvertFrom-Json
```

**Expected Response:**
```json
{
  "error": {
    "code": "ValidationError",
    "message": "Error: Change 0 (createRelationship): relationship of type 'serving-relationship' from '[source-id]' to '[target-id]' already exists (id: [relationship-id])"
  }
}
```

HTTP Status: **400 Bad Request**

## Test 5: Allow Different Relationship Type

```powershell
# Same source/target but different relationship type (should succeed)
$rel3Body = @{
    changes = @(
        @{
            op = "createRelationship"
            type = "assignment-relationship"  # Different type
            sourceId = $sourceId
            targetId = $targetId
            tempId = "tr3"
        }
    )
} | ConvertTo-Json -Depth 10

curl -s -X POST http://localhost:8765/model/apply `
  -H "Content-Type: application/json" `
  -d $rel3Body | ConvertFrom-Json
```

**Expected:** Status 200, operationId returned (should succeed)

## Cleanup

After testing, you can delete the test elements using Archi's UI or via the API.

## Summary

The duplicate detection feature should:
- ✅ Block creation of elements with identical name + type
- ✅ Allow elements with same name but different type
- ✅ Detect duplicates within a single batch request
- ✅ Block creation of relationships with identical source + target + type
- ✅ Allow different relationship types between same elements
- ✅ Include existing element/relationship ID in error messages for reference
