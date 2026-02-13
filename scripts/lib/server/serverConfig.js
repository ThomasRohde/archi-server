/**
 * serverConfig.js - Centralized configuration for Model API Server
 *
 * All production hardening parameters (rate limits, timeouts, body size limits,
 * CORS origins, security headers) are configurable from this single module.
 *
 * @module server/serverConfig
 */

(function() {
    "use strict";

    // Guard against double-loading
    if (typeof globalThis !== "undefined" && typeof globalThis.serverConfig !== "undefined") {
        return;
    }

    /**
     * Server configuration with production defaults
     * @type {Object}
     */
    var serverConfig = {
        /**
         * Server network settings
         */
        server: {
            port: 8765,
            host: "127.0.0.1",
            version: "1.6.1"
        },

        /**
         * Rate limiting configuration
         * Uses sliding window algorithm per client IP
         */
        rateLimit: {
            enabled: true,
            maxRequests: 600,           // Max requests per window (increased for integration testing)
            windowMs: 60000,            // Window size in milliseconds (1 minute)
            blockDurationMs: 60000      // How long to block after limit exceeded (1 minute)
        },

        /**
         * Request body limits
         */
        request: {
            maxBodySize: 1048576,       // 1 MB max request body
            maxChangesPerRequest: 1000, // Max changes in single apply request
            maxScriptCodeLength: 51200  // 50 KB max script code length for /scripts/run
        },

        /**
         * Operation processing configuration
         */
        operations: {
            timeoutMs: 60000,           // Operation timeout (60 seconds)
            processorInterval: 50,      // Processor cycle interval in milliseconds
            maxOpsPerCycle: 10,         // Maximum operations to process per cycle
            cleanupInterval: 100,       // Cleanup every N cycles (~5 seconds)
            maxOperationAge: 3600000,   // Max age for completed operations (1 hour)
            maxSubCommandsPerBatch: 50, // Max GEF sub-commands per CompoundCommand (lowered from 100 per R8)
            postExecuteVerify: true,    // Verify created objects exist after command execution
            snapshotRefreshDelayMs: 100 // Delay before snapshot refresh to allow async rollback to settle
        },

        /**
         * Idempotency handling for POST /model/apply
         */
        idempotency: {
            enabled: true,
            ttlMs: 86400000,            // 24 hours
            maxRecords: 10000,          // In-memory bounded registry
            cleanupIntervalMs: 300000   // Cleanup cadence (5 minutes)
        },

        /**
         * Graceful shutdown configuration
         */
        shutdown: {
            timeoutMs: 10000,           // Wait up to 10 seconds for in-flight operations
            checkIntervalMs: 100        // Check interval during shutdown
        },

        /**
         * CORS and security headers
         */
        security: {
            corsEnabled: true,
            corsOrigins: ["http://localhost:3000", "http://127.0.0.1:3000"],  // Allowed origins (empty = block all CORS)
            corsAllowAll: false,        // Set true for wildcard (not recommended for production)
            headers: {
                "X-Content-Type-Options": "nosniff",
                "X-Frame-Options": "DENY",
                "X-XSS-Protection": "1; mode=block",
                "Cache-Control": "no-store",
                "Pragma": "no-cache"
            }
        },

        /**
         * Logging configuration
         */
        logging: {
            maxLines: 2000,             // Maximum lines in log display
            maxLinesPerCycle: 200,      // Maximum lines to flush per cycle
            flushInterval: 100,         // Flush interval in milliseconds
            includeRequestId: true      // Include request ID in log entries
        },

        /**
         * Valid ArchiMate element types for validation
         * @see https://www.archimatetool.com/
         */
        validElementTypes: [
            // Strategy Layer
            "resource", "capability", "value-stream", "course-of-action",
            // Business Layer
            "business-actor", "business-role", "business-collaboration",
            "business-interface", "business-process", "business-function",
            "business-interaction", "business-event", "business-service",
            "business-object", "contract", "representation", "product",
            // Application Layer
            "application-component", "application-collaboration",
            "application-interface", "application-function",
            "application-interaction", "application-process",
            "application-event", "application-service", "data-object",
            // Technology Layer
            "node", "device", "system-software", "technology-collaboration",
            "technology-interface", "path", "communication-network",
            "technology-function", "technology-process", "technology-interaction",
            "technology-event", "technology-service", "artifact",
            // Physical Layer
            "equipment", "facility", "distribution-network", "material",
            // Motivation Layer
            "stakeholder", "driver", "assessment", "goal", "outcome",
            "principle", "requirement", "constraint", "meaning", "value",
            // Implementation & Migration Layer
            "work-package", "deliverable", "implementation-event", "plateau", "gap",
            // Other
            "location", "grouping", "junction"
        ],

        /**
         * Valid ArchiMate relationship types for validation
         */
        validRelationshipTypes: [
            "composition-relationship",
            "aggregation-relationship",
            "assignment-relationship",
            "realization-relationship",
            "serving-relationship",
            "access-relationship",
            "influence-relationship",
            "triggering-relationship",
            "flow-relationship",
            "specialization-relationship",
            "association-relationship"
        ],

        /**
         * Normalize element type to canonical kebab-case format
         * Handles common variations: PascalCase, camelCase, snake_case, UPPER_CASE, spaces
         * @param {string} type - Element type in any format
         * @returns {string} Normalized kebab-case type (e.g., "business-actor")
         */
        normalizeElementType: function(type) {
            if (!type || typeof type !== "string") {
                return type;
            }
            // Handle special cases first (exact match for already normalized)
            if (this.validElementTypes.indexOf(type) !== -1) {
                return type;
            }
            // Normalize: trim, lowercase, replace underscores/spaces with hyphens
            var normalized = type.trim()
                .replace(/([a-z])([A-Z])/g, '$1-$2')  // camelCase/PascalCase to kebab
                .replace(/[_\s]+/g, '-')              // underscores and spaces to hyphens
                .replace(/-+/g, '-')                  // collapse multiple hyphens
                .replace(/^-|-$/g, '')                // trim leading/trailing hyphens
                .toLowerCase();
            return normalized;
        },

        /**
         * Check if an element type is valid (with normalization)
         * @param {string} type - Element type to validate (any format)
         * @returns {boolean} True if valid after normalization
         */
        isValidElementType: function(type) {
            var normalized = this.normalizeElementType(type);
            return this.validElementTypes.indexOf(normalized) !== -1;
        },

        /**
         * Check if a relationship type is valid
         * @param {string} type - Relationship type to validate
         * @returns {boolean} True if valid
         */
        isValidRelationshipType: function(type) {
            return this.validRelationshipTypes.indexOf(type) !== -1;
        },

        /**
         * Get CORS origin header value based on request origin
         * @param {string} requestOrigin - Origin header from request
         * @returns {string|null} Allowed origin or null if not allowed
         */
        getCorsOrigin: function(requestOrigin) {
            if (!this.security.corsEnabled) {
                return null;
            }
            if (this.security.corsAllowAll) {
                return "*";
            }
            if (!requestOrigin) {
                return null;
            }
            if (this.security.corsOrigins.indexOf(requestOrigin) !== -1) {
                return requestOrigin;
            }
            return null;
        }
    };

    // Export globally for JArchi
    if (typeof globalThis !== "undefined") {
        globalThis.serverConfig = serverConfig;
    } else if (typeof global !== "undefined") {
        global.serverConfig = serverConfig;
    }

    // CommonJS for Node.js build tools
    if (typeof module !== "undefined" && module.exports) {
        module.exports = serverConfig;
    }

})();
