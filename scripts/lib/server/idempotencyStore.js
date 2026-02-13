/**
 * idempotencyStore.js - In-memory idempotency registry for /model/apply
 *
 * Tracks caller-provided idempotency keys with payload hashes and operation IDs.
 * Entries are in-memory only and expire via TTL (default 24h).
 *
 * @module server/idempotencyStore
 */

(function() {
    "use strict";

    // Guard against double-loading
    if (typeof globalThis !== "undefined" && typeof globalThis.idempotencyStore !== "undefined") {
        return;
    }

    var MessageDigest = Java.type("java.security.MessageDigest");
    var StandardCharsets = Java.type("java.nio.charset.StandardCharsets");
    var JavaString = Java.type("java.lang.String");

    var KEY_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;

    var records = {};
    var lruKeys = [];
    var lastCleanupMs = 0;

    function getConfig() {
        var cfg = (typeof serverConfig !== "undefined" && serverConfig.idempotency) ? serverConfig.idempotency : {};
        return {
            enabled: cfg.enabled !== false,
            ttlMs: cfg.ttlMs || 24 * 60 * 60 * 1000,
            maxRecords: cfg.maxRecords || 10000,
            cleanupIntervalMs: cfg.cleanupIntervalMs || 5 * 60 * 1000
        };
    }

    function nowMs() {
        return Date.now();
    }

    function toIso(ms) {
        return new Date(ms).toISOString();
    }

    function isExpired(record, atMs) {
        if (!record || !record.expiresAt) return true;
        return new Date(record.expiresAt).getTime() <= atMs;
    }

    function touchKey(key) {
        var idx = lruKeys.indexOf(key);
        if (idx >= 0) {
            lruKeys.splice(idx, 1);
        }
        lruKeys.push(key);
    }

    function removeKey(key) {
        if (records[key]) {
            delete records[key];
        }
        var idx = lruKeys.indexOf(key);
        if (idx >= 0) {
            lruKeys.splice(idx, 1);
        }
    }

    function trimToCapacity(maxRecords) {
        while (lruKeys.length > maxRecords) {
            var oldest = lruKeys.shift();
            if (oldest) {
                delete records[oldest];
            }
        }
    }

    function cleanupExpired(force) {
        var cfg = getConfig();
        var now = nowMs();
        if (!force && cfg.cleanupIntervalMs > 0 && (now - lastCleanupMs) < cfg.cleanupIntervalMs) {
            return;
        }

        var keys = Object.keys(records);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var record = records[key];
            if (isExpired(record, now)) {
                removeKey(key);
            }
        }
        lastCleanupMs = now;
    }

    function isPlainObject(value) {
        return value !== null && typeof value === "object" && !Array.isArray(value);
    }

    function stableStringify(value) {
        if (value === null || value === undefined) {
            return "null";
        }
        var t = typeof value;
        if (t === "string") return JSON.stringify(value);
        if (t === "number" || t === "boolean") return JSON.stringify(value);

        if (Array.isArray(value)) {
            var items = [];
            for (var i = 0; i < value.length; i++) {
                items.push(stableStringify(value[i]));
            }
            return "[" + items.join(",") + "]";
        }

        if (isPlainObject(value)) {
            var keys = Object.keys(value).sort();
            var parts = [];
            for (var j = 0; j < keys.length; j++) {
                var key = keys[j];
                parts.push(JSON.stringify(key) + ":" + stableStringify(value[key]));
            }
            return "{" + parts.join(",") + "}";
        }

        return JSON.stringify(String(value));
    }

    function hashString(input) {
        var digest = MessageDigest.getInstance("SHA-256");
        var bytes = new JavaString(input).getBytes(StandardCharsets.UTF_8);
        var hashBytes = digest.digest(bytes);
        var hex = "";
        for (var i = 0; i < hashBytes.length; i++) {
            var b = hashBytes[i] & 255;
            var h = b.toString(16);
            if (h.length === 1) h = "0" + h;
            hex += h;
        }
        return hex;
    }

    function canonicalizeApplyRequestBody(body) {
        var clone = {};
        if (body && typeof body === "object") {
            for (var key in body) {
                if (!body.hasOwnProperty(key)) continue;
                if (key === "idempotencyKey") continue;
                clone[key] = body[key];
            }
        }
        return clone;
    }

    function validationError(message, code) {
        var err = new Error(message);
        err.code = code || "ValidationError";
        return err;
    }

    var idempotencyStore = {
        isEnabled: function() {
            return getConfig().enabled;
        },

        validateKey: function(key) {
            if (key === undefined || key === null || key === "") {
                return null;
            }
            var normalized = String(key).trim();
            if (!KEY_PATTERN.test(normalized)) {
                throw validationError(
                    "Invalid idempotencyKey. Must match ^[A-Za-z0-9:_-]+$ and be 1-128 characters.",
                    "ValidationError"
                );
            }
            return normalized;
        },

        hashApplyRequestBody: function(body) {
            var canonical = canonicalizeApplyRequestBody(body || {});
            var serialized = stableStringify(canonical);
            return hashString(serialized);
        },

        reserve: function(key, payloadHash) {
            cleanupExpired(false);

            var cfg = getConfig();
            if (!cfg.enabled || !key) {
                return { status: "disabled" };
            }

            var now = nowMs();
            var existing = records[key];

            if (existing && isExpired(existing, now)) {
                removeKey(key);
                existing = null;
            }

            if (existing) {
                if (existing.payloadHash !== payloadHash) {
                    touchKey(key);
                    return {
                        status: "conflict",
                        record: existing
                    };
                }

                existing.lastSeenAt = toIso(now);
                existing.replayedCount = (existing.replayedCount || 0) + 1;
                touchKey(key);
                return {
                    status: "replay",
                    record: existing
                };
            }

            var expiresMs = now + cfg.ttlMs;
            var record = {
                key: key,
                payloadHash: payloadHash,
                operationId: null,
                status: "reserved",
                createdAt: toIso(now),
                firstSeenAt: toIso(now),
                lastSeenAt: toIso(now),
                expiresAt: toIso(expiresMs),
                replayedCount: 0
            };

            records[key] = record;
            touchKey(key);
            trimToCapacity(cfg.maxRecords);

            return {
                status: "new",
                record: record
            };
        },

        attachOperation: function(key, operationId) {
            if (!key || !operationId) return null;
            var record = records[key];
            if (!record) return null;

            record.operationId = operationId;
            record.status = "queued";
            record.lastSeenAt = toIso(nowMs());
            touchKey(key);
            return record;
        },

        markTerminal: function(key, operationId, status) {
            if (!key || !operationId) return null;
            var record = records[key];
            if (!record) return null;
            if (record.operationId !== operationId) return null;

            if (status === "complete" || status === "error") {
                record.status = status;
            }
            record.lastSeenAt = toIso(nowMs());
            touchKey(key);
            return record;
        },

        getRecord: function(key) {
            if (!key) return null;
            cleanupExpired(false);
            return records[key] || null;
        },

        buildResponseMeta: function(record, replayed) {
            if (!record) return null;
            return {
                key: record.key,
                replayed: replayed === true,
                firstSeenAt: record.firstSeenAt,
                expiresAt: record.expiresAt
            };
        },

        cleanupExpired: function() {
            cleanupExpired(true);
        }
    };

    if (typeof globalThis !== "undefined") {
        globalThis.idempotencyStore = idempotencyStore;
    } else if (typeof global !== "undefined") {
        global.idempotencyStore = idempotencyStore;
    }

    if (typeof module !== "undefined" && module.exports) {
        module.exports = idempotencyStore;
    }
})();
