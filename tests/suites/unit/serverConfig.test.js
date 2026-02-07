/**
 * Unit Tests for serverConfig.js
 *
 * Tests validation and normalization logic without requiring a running server.
 */

import { describe, it, expect } from 'vitest';
import serverConfig from '../../../scripts/lib/server/serverConfig.js';

describe('serverConfig', () => {
  describe('normalizeElementType', () => {
    it('normalizes camelCase to kebab-case', () => {
      expect(serverConfig.normalizeElementType('businessActor')).toBe('business-actor');
      expect(serverConfig.normalizeElementType('applicationComponent')).toBe('application-component');
      expect(serverConfig.normalizeElementType('technologyService')).toBe('technology-service');
    });

    it('normalizes PascalCase to kebab-case', () => {
      expect(serverConfig.normalizeElementType('BusinessActor')).toBe('business-actor');
      expect(serverConfig.normalizeElementType('ApplicationComponent')).toBe('application-component');
      expect(serverConfig.normalizeElementType('DataObject')).toBe('data-object');
    });

    it('normalizes snake_case to kebab-case', () => {
      expect(serverConfig.normalizeElementType('business_actor')).toBe('business-actor');
      expect(serverConfig.normalizeElementType('application_component')).toBe('application-component');
      expect(serverConfig.normalizeElementType('work_package')).toBe('work-package');
    });

    it('normalizes UPPER_CASE to kebab-case', () => {
      expect(serverConfig.normalizeElementType('BUSINESS_ACTOR')).toBe('business-actor');
      expect(serverConfig.normalizeElementType('APPLICATION_COMPONENT')).toBe('application-component');
    });

    it('normalizes types with spaces to kebab-case', () => {
      expect(serverConfig.normalizeElementType('business actor')).toBe('business-actor');
      expect(serverConfig.normalizeElementType('application component')).toBe('application-component');
    });

    it('handles already normalized types', () => {
      expect(serverConfig.normalizeElementType('business-actor')).toBe('business-actor');
      expect(serverConfig.normalizeElementType('application-component')).toBe('application-component');
      expect(serverConfig.normalizeElementType('node')).toBe('node');
    });

    it('trims leading and trailing whitespace', () => {
      expect(serverConfig.normalizeElementType('  business-actor  ')).toBe('business-actor');
      expect(serverConfig.normalizeElementType('\tapplication-component\n')).toBe('application-component');
    });

    it('collapses multiple hyphens', () => {
      expect(serverConfig.normalizeElementType('business--actor')).toBe('business-actor');
      expect(serverConfig.normalizeElementType('application---component')).toBe('application-component');
    });

    it('removes leading and trailing hyphens', () => {
      expect(serverConfig.normalizeElementType('-business-actor-')).toBe('business-actor');
      expect(serverConfig.normalizeElementType('--application-component--')).toBe('application-component');
    });

    it('handles null and undefined', () => {
      expect(serverConfig.normalizeElementType(null)).toBe(null);
      expect(serverConfig.normalizeElementType(undefined)).toBe(undefined);
    });

    it('handles non-string types', () => {
      expect(serverConfig.normalizeElementType(123)).toBe(123);
      expect(serverConfig.normalizeElementType({})).toEqual({});
    });

    it('handles empty string', () => {
      expect(serverConfig.normalizeElementType('')).toBe('');
    });
  });

  describe('isValidElementType', () => {
    it('validates business layer types', () => {
      expect(serverConfig.isValidElementType('business-actor')).toBe(true);
      expect(serverConfig.isValidElementType('business-role')).toBe(true);
      expect(serverConfig.isValidElementType('business-process')).toBe(true);
      expect(serverConfig.isValidElementType('business-function')).toBe(true);
      expect(serverConfig.isValidElementType('business-service')).toBe(true);
      expect(serverConfig.isValidElementType('business-object')).toBe(true);
    });

    it('validates application layer types', () => {
      expect(serverConfig.isValidElementType('application-component')).toBe(true);
      expect(serverConfig.isValidElementType('application-function')).toBe(true);
      expect(serverConfig.isValidElementType('application-service')).toBe(true);
      expect(serverConfig.isValidElementType('data-object')).toBe(true);
    });

    it('validates technology layer types', () => {
      expect(serverConfig.isValidElementType('node')).toBe(true);
      expect(serverConfig.isValidElementType('device')).toBe(true);
      expect(serverConfig.isValidElementType('system-software')).toBe(true);
      expect(serverConfig.isValidElementType('artifact')).toBe(true);
    });

    it('validates strategy layer types', () => {
      expect(serverConfig.isValidElementType('resource')).toBe(true);
      expect(serverConfig.isValidElementType('capability')).toBe(true);
      expect(serverConfig.isValidElementType('value-stream')).toBe(true);
      expect(serverConfig.isValidElementType('course-of-action')).toBe(true);
    });

    it('validates motivation layer types', () => {
      expect(serverConfig.isValidElementType('stakeholder')).toBe(true);
      expect(serverConfig.isValidElementType('goal')).toBe(true);
      expect(serverConfig.isValidElementType('requirement')).toBe(true);
      expect(serverConfig.isValidElementType('principle')).toBe(true);
    });

    it('validates implementation & migration layer types', () => {
      expect(serverConfig.isValidElementType('work-package')).toBe(true);
      expect(serverConfig.isValidElementType('deliverable')).toBe(true);
      expect(serverConfig.isValidElementType('plateau')).toBe(true);
      expect(serverConfig.isValidElementType('gap')).toBe(true);
    });

    it('validates physical layer types', () => {
      expect(serverConfig.isValidElementType('equipment')).toBe(true);
      expect(serverConfig.isValidElementType('facility')).toBe(true);
      expect(serverConfig.isValidElementType('material')).toBe(true);
    });

    it('validates other types', () => {
      expect(serverConfig.isValidElementType('location')).toBe(true);
      expect(serverConfig.isValidElementType('grouping')).toBe(true);
      expect(serverConfig.isValidElementType('junction')).toBe(true);
    });

    it('validates types with normalization (camelCase)', () => {
      expect(serverConfig.isValidElementType('businessActor')).toBe(true);
      expect(serverConfig.isValidElementType('applicationComponent')).toBe(true);
      expect(serverConfig.isValidElementType('dataObject')).toBe(true);
    });

    it('validates types with normalization (PascalCase)', () => {
      expect(serverConfig.isValidElementType('BusinessActor')).toBe(true);
      expect(serverConfig.isValidElementType('ApplicationComponent')).toBe(true);
      expect(serverConfig.isValidElementType('DataObject')).toBe(true);
    });

    it('validates types with normalization (snake_case)', () => {
      expect(serverConfig.isValidElementType('business_actor')).toBe(true);
      expect(serverConfig.isValidElementType('application_component')).toBe(true);
      expect(serverConfig.isValidElementType('data_object')).toBe(true);
    });

    it('rejects invalid element types', () => {
      expect(serverConfig.isValidElementType('invalid-type')).toBe(false);
      expect(serverConfig.isValidElementType('not-a-real-element')).toBe(false);
      expect(serverConfig.isValidElementType('foo-bar')).toBe(false);
    });

    it('rejects empty string', () => {
      expect(serverConfig.isValidElementType('')).toBe(false);
    });
  });

  describe('isValidRelationshipType', () => {
    it('validates all relationship types', () => {
      expect(serverConfig.isValidRelationshipType('composition-relationship')).toBe(true);
      expect(serverConfig.isValidRelationshipType('aggregation-relationship')).toBe(true);
      expect(serverConfig.isValidRelationshipType('assignment-relationship')).toBe(true);
      expect(serverConfig.isValidRelationshipType('realization-relationship')).toBe(true);
      expect(serverConfig.isValidRelationshipType('serving-relationship')).toBe(true);
      expect(serverConfig.isValidRelationshipType('access-relationship')).toBe(true);
      expect(serverConfig.isValidRelationshipType('influence-relationship')).toBe(true);
      expect(serverConfig.isValidRelationshipType('triggering-relationship')).toBe(true);
      expect(serverConfig.isValidRelationshipType('flow-relationship')).toBe(true);
      expect(serverConfig.isValidRelationshipType('specialization-relationship')).toBe(true);
      expect(serverConfig.isValidRelationshipType('association-relationship')).toBe(true);
    });

    it('rejects invalid relationship types', () => {
      expect(serverConfig.isValidRelationshipType('invalid-relationship')).toBe(false);
      expect(serverConfig.isValidRelationshipType('composition')).toBe(false);
      expect(serverConfig.isValidRelationshipType('serving')).toBe(false);
      expect(serverConfig.isValidRelationshipType('')).toBe(false);
    });
  });

  describe('getCorsOrigin', () => {
    it('returns null when CORS is disabled', () => {
      const originalCorsEnabled = serverConfig.security.corsEnabled;
      serverConfig.security.corsEnabled = false;

      expect(serverConfig.getCorsOrigin('http://localhost:3000')).toBe(null);

      // Restore original value
      serverConfig.security.corsEnabled = originalCorsEnabled;
    });

    it('returns wildcard when corsAllowAll is true', () => {
      const originalCorsAllowAll = serverConfig.security.corsAllowAll;
      serverConfig.security.corsAllowAll = true;

      expect(serverConfig.getCorsOrigin('http://example.com')).toBe('*');
      expect(serverConfig.getCorsOrigin('http://localhost:3000')).toBe('*');

      // Restore original value
      serverConfig.security.corsAllowAll = originalCorsAllowAll;
    });

    it('returns null when request origin is missing', () => {
      expect(serverConfig.getCorsOrigin(null)).toBe(null);
      expect(serverConfig.getCorsOrigin(undefined)).toBe(null);
      expect(serverConfig.getCorsOrigin('')).toBe(null);
    });

    it('returns matching origin when in allowed list', () => {
      expect(serverConfig.getCorsOrigin('http://localhost:3000')).toBe('http://localhost:3000');
      expect(serverConfig.getCorsOrigin('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000');
    });

    it('returns null when origin not in allowed list', () => {
      expect(serverConfig.getCorsOrigin('http://evil.com')).toBe(null);
      expect(serverConfig.getCorsOrigin('http://example.com:3000')).toBe(null);
      expect(serverConfig.getCorsOrigin('https://localhost:3000')).toBe(null);
    });
  });

  describe('configuration structure', () => {
    it('has valid server configuration', () => {
      expect(serverConfig.server).toBeDefined();
      expect(serverConfig.server.port).toBe(8765);
      expect(serverConfig.server.host).toBe('127.0.0.1');
      expect(serverConfig.server.version).toBeDefined();
      expect(typeof serverConfig.server.version).toBe('string');
    });

    it('has valid rate limit configuration', () => {
      expect(serverConfig.rateLimit).toBeDefined();
      expect(serverConfig.rateLimit.enabled).toBeDefined();
      expect(typeof serverConfig.rateLimit.maxRequests).toBe('number');
      expect(typeof serverConfig.rateLimit.windowMs).toBe('number');
      expect(typeof serverConfig.rateLimit.blockDurationMs).toBe('number');
    });

    it('has valid request configuration', () => {
      expect(serverConfig.request).toBeDefined();
      expect(typeof serverConfig.request.maxBodySize).toBe('number');
      expect(typeof serverConfig.request.maxChangesPerRequest).toBe('number');
    });

    it('has valid operations configuration', () => {
      expect(serverConfig.operations).toBeDefined();
      expect(typeof serverConfig.operations.timeoutMs).toBe('number');
      expect(typeof serverConfig.operations.processorInterval).toBe('number');
      expect(typeof serverConfig.operations.maxOpsPerCycle).toBe('number');
    });

    it('has valid security configuration', () => {
      expect(serverConfig.security).toBeDefined();
      expect(serverConfig.security.corsEnabled).toBeDefined();
      expect(Array.isArray(serverConfig.security.corsOrigins)).toBe(true);
      expect(serverConfig.security.headers).toBeDefined();
      expect(typeof serverConfig.security.headers).toBe('object');
    });

    it('has complete element types list', () => {
      expect(Array.isArray(serverConfig.validElementTypes)).toBe(true);
      expect(serverConfig.validElementTypes.length).toBeGreaterThan(50);
    });

    it('has complete relationship types list', () => {
      expect(Array.isArray(serverConfig.validRelationshipTypes)).toBe(true);
      expect(serverConfig.validRelationshipTypes).toHaveLength(11);
    });
  });
});
