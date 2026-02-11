/**
 * Unit tests for semantic BOM verification — tempId ordering enforcement.
 *
 * Validates that forward references to createElement tempIds are correctly
 * rejected, and that properly-ordered BOMs pass.
 */
import { describe, expect, test } from 'vitest';
import { validateBomSemantics } from '../src/commands/verify';

// ── Order enforcement ────────────────────────────────────────────────────────

describe('createElement ordering', () => {
  test('correctly ordered BOM passes', async () => {
    const changes = [
      { op: 'createElement', type: 'application-service', name: 'Svc', tempId: 'e-svc' },
      { op: 'createElement', type: 'application-component', name: 'Comp', tempId: 'e-comp' },
      { op: 'createRelationship', type: 'serving-relationship', sourceId: 'e-svc', targetId: 'e-comp', tempId: 'r1' },
    ];
    const result = await validateBomSemantics(changes, [], { resolveNames: false });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('forward-referencing createElement fails', async () => {
    const changes = [
      { op: 'createRelationship', type: 'serving-relationship', sourceId: 'e-svc', targetId: 'e-comp', tempId: 'r1' },
      { op: 'createElement', type: 'application-service', name: 'Svc', tempId: 'e-svc' },
      { op: 'createElement', type: 'application-component', name: 'Comp', tempId: 'e-comp' },
    ];
    const result = await validateBomSemantics(changes, [], { resolveNames: false });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('before it is available');
  });

  test('partial forward reference fails (only one element created later)', async () => {
    const changes = [
      { op: 'createElement', type: 'application-service', name: 'Svc', tempId: 'e-svc' },
      { op: 'createRelationship', type: 'serving-relationship', sourceId: 'e-svc', targetId: 'e-comp', tempId: 'r1' },
      { op: 'createElement', type: 'application-component', name: 'Comp', tempId: 'e-comp' },
    ];
    const result = await validateBomSemantics(changes, [], { resolveNames: false });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].message).toContain('e-comp');
    expect(result.errors[0].message).toContain('before it is available');
  });
});

// ── Other ordering ───────────────────────────────────────────────────────────

describe('createRelationship ordering', () => {
  test('addToView referencing later createRelationship tempId fails', async () => {
    const changes = [
      { op: 'createElement', type: 'business-actor', name: 'A', tempId: 'e-a' },
      { op: 'createElement', type: 'business-actor', name: 'B', tempId: 'e-b' },
      { op: 'addToView', viewId: 'id-view-1', elementId: 'e-a', tempId: 'vis-a' },
      { op: 'addToView', viewId: 'id-view-1', elementId: 'e-b', tempId: 'vis-b' },
      { op: 'addConnectionToView', viewId: 'id-view-1', relationshipId: 'r1', sourceVisualId: 'vis-a', targetVisualId: 'vis-b' },
      { op: 'createRelationship', type: 'association-relationship', sourceId: 'e-a', targetId: 'e-b', tempId: 'r1' },
    ];
    const result = await validateBomSemantics(changes, [], { resolveNames: false });
    expect(result.valid).toBe(false);
    // r1 is referenced by addConnectionToView before it's created
    expect(result.errors.some(e => e.message.includes('r1') && e.message.includes('before it is available'))).toBe(true);
  });
});

describe('real IDs bypass ordering checks', () => {
  test('real IDs (id-...) are always accepted', async () => {
    const changes = [
      { op: 'createRelationship', type: 'serving-relationship', sourceId: 'id-abc123', targetId: 'id-def456', tempId: 'r1' },
    ];
    const result = await validateBomSemantics(changes, [], { resolveNames: false });
    expect(result.valid).toBe(true);
  });
});

describe('delete operations (phase 3)', () => {
  test('delete can reference tempIds created earlier', async () => {
    const changes = [
      { op: 'createElement', type: 'business-actor', name: 'ToDelete', tempId: 'e-del' },
      { op: 'deleteElement', id: 'e-del' },
    ];
    const result = await validateBomSemantics(changes, [], { resolveNames: false });
    expect(result.valid).toBe(true);
  });

  test('deleteConnectionFromView can reference earlier connection tempId', async () => {
    const changes = [
      { op: 'createElement', type: 'business-actor', name: 'A', tempId: 'e-a' },
      { op: 'createElement', type: 'business-actor', name: 'B', tempId: 'e-b' },
      { op: 'createRelationship', type: 'association-relationship', sourceId: 'e-a', targetId: 'e-b', tempId: 'r-ab' },
      { op: 'addToView', viewId: 'id-view-1', elementId: 'e-a', tempId: 'vis-a' },
      { op: 'addToView', viewId: 'id-view-1', elementId: 'e-b', tempId: 'vis-b' },
      { op: 'addConnectionToView', viewId: 'id-view-1', relationshipId: 'r-ab', sourceVisualId: 'vis-a', targetVisualId: 'vis-b', tempId: 'conn-ab' },
      { op: 'deleteConnectionFromView', viewId: 'id-view-1', connectionId: 'conn-ab' },
    ];
    const result = await validateBomSemantics(changes, [], { resolveNames: false });
    expect(result.valid).toBe(true);
  });
});

describe('visual ID semantics', () => {
  test('rejects element tempIds used as connection visual IDs', async () => {
    const changes = [
      { op: 'createElement', type: 'business-actor', name: 'A', tempId: 'e-a' },
      { op: 'createElement', type: 'business-actor', name: 'B', tempId: 'e-b' },
      { op: 'createRelationship', type: 'association-relationship', sourceId: 'e-a', targetId: 'e-b', tempId: 'r-ab' },
      { op: 'addToView', viewId: 'id-view-1', elementId: 'e-a', tempId: 'vis-a' },
      { op: 'addToView', viewId: 'id-view-1', elementId: 'e-b', tempId: 'vis-b' },
      // Intentional mistake: using element tempIds instead of visual tempIds
      { op: 'addConnectionToView', viewId: 'id-view-1', relationshipId: 'r-ab', sourceVisualId: 'e-a', targetVisualId: 'e-b' },
    ];
    const result = await validateBomSemantics(changes, [], { resolveNames: false });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('non-visual tempId'))).toBe(true);
    expect(result.errors.some((e) => (e.hint ?? '').includes('addToView.tempId'))).toBe(true);
  });

  test('unknown visual tempIds explain resolve-name limitation', async () => {
    const changes = [
      {
        op: 'addConnectionToView',
        viewId: 'id-view-1',
        relationshipId: 'id-rel-1',
        sourceVisualId: 'missing-source-visual',
        targetVisualId: 'missing-target-visual',
      },
    ];
    const result = await validateBomSemantics(changes, [], { resolveNames: false });
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) =>
        (e.hint ?? '').includes('cannot reconstruct visual IDs')
      )
    ).toBe(true);
  });
});
