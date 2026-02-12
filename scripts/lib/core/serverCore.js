/**
 * serverCore.js - HTTP Server wrapper for JArchi
 *
 * Provides a JavaScript wrapper around Java's com.sun.net.httpserver.HttpServer
 * with thread-safe logging, request/response handling, rate limiting, and security headers.
 *
 * Production hardening features:
 *   - Request body size limits
 *   - Per-IP rate limiting with sliding window
 *   - Request ID correlation for debugging
 *   - Configurable CORS with security headers
 *
 * Usage:
 *   load(__DIR__ + "lib/core/serverCore.js");
 *
 *   var server = serverCore.create({
 *       port: 8765,
 *       host: "127.0.0.1",
 *       onLog: function(msg) { console.log(msg); },
 *       display: Display
 *   });
 *
 *   server.addHandler("/health", "GET", function(request, response) {
 *       response.body = { status: "ok" };
 *   });
 *
 *   server.start();
 */

(function() {
    "use strict";

    // Guard against double-loading
    if (typeof globalThis !== "undefined" && typeof globalThis.serverCore !== "undefined") {
        return;
    }

    // Java imports
    var HttpServer = Java.type("com.sun.net.httpserver.HttpServer");
    var InetSocketAddress = Java.type("java.net.InetSocketAddress");
    var BufferedReader = Java.type("java.io.BufferedReader");
    var InputStreamReader = Java.type("java.io.InputStreamReader");
    var JavaString = Java.type("java.lang.String");
    var StandardCharsets = Java.type("java.nio.charset.StandardCharsets");
    var UUID = Java.type("java.util.UUID");
    var ConcurrentHashMap = Java.type("java.util.concurrent.ConcurrentHashMap");

    /**
     * Create a server instance
     *
     * @param {Object} config - Server configuration
     * @param {number} config.port - Port to listen on
     * @param {string} config.host - Host to bind to
     * @param {Function} config.onLog - Logging callback (thread-safe)
     * @param {Object} config.display - SWT Display instance
     */
    function create(config) {
        var port = config.port || 8765;
        var host = config.host || "127.0.0.1";
        var onLog = config.onLog || function(msg) { console.log(msg); };
        var display = config.display;

        var httpServer = null;
        var handlers = [];
        var state = "stopped"; // stopped, running, stopping

        // Rate limiting state: Map<clientIP, { timestamps: number[], blockedUntil: number }>
        var rateLimitState = new ConcurrentHashMap();

        /**
         * Generate a unique request ID
         * @returns {string} UUID-based request ID
         */
        function generateRequestId() {
            return UUID.randomUUID().toString().substring(0, 8);
        }

        /**
         * Get client IP from exchange
         * @param {com.sun.net.httpserver.HttpExchange} exchange
         * @returns {string} Client IP address
         */
        function getClientIP(exchange) {
            var remoteAddress = exchange.getRemoteAddress();
            return remoteAddress ? remoteAddress.getAddress().getHostAddress() : "unknown";
        }

        /**
         * Check rate limit for client IP
         * @param {string} clientIP - Client IP address
         * @returns {{ allowed: boolean, retryAfter: number }} Rate limit check result
         */
        function checkRateLimit(clientIP) {
            // Get config from serverConfig if available
            var rateLimitConfig = (typeof serverConfig !== "undefined") ? serverConfig.rateLimit : {
                enabled: true,
                maxRequests: 100,
                windowMs: 60000,
                blockDurationMs: 60000
            };

            if (!rateLimitConfig.enabled) {
                return { allowed: true, retryAfter: 0 };
            }

            var now = Date.now();
            var windowStart = now - rateLimitConfig.windowMs;

            // Get or create state for this IP
            var ipState = rateLimitState.get(clientIP);
            if (!ipState) {
                ipState = { timestamps: [], blockedUntil: 0 };
                rateLimitState.put(clientIP, ipState);
            }

            // Check if currently blocked
            if (ipState.blockedUntil > now) {
                var retryAfter = Math.ceil((ipState.blockedUntil - now) / 1000);
                return { allowed: false, retryAfter: retryAfter };
            }

            // Clean old timestamps (outside window)
            var timestamps = ipState.timestamps.filter(function(ts) {
                return ts > windowStart;
            });
            ipState.timestamps = timestamps;

            // Check if limit exceeded
            if (timestamps.length >= rateLimitConfig.maxRequests) {
                ipState.blockedUntil = now + rateLimitConfig.blockDurationMs;
                var retryAfter = Math.ceil(rateLimitConfig.blockDurationMs / 1000);
                return { allowed: false, retryAfter: retryAfter };
            }

            // Record this request
            ipState.timestamps.push(now);

            return { allowed: true, retryAfter: 0 };
        }

        /**
         * Log a message (thread-safe via callback)
         */
        function log(message, requestId) {
            var timestamp = new Date().toISOString();
            var prefix = requestId ? "[" + requestId + "] " : "";
            onLog(timestamp + " " + prefix + message);
        }

        /**
         * Parse request body as JSON with size limit
         * @param {com.sun.net.httpserver.HttpExchange} exchange
         * @param {string} requestId - Request ID for logging
         * @returns {{ success: boolean, body: Object|null, error: string|null }}
         */
        function parseRequestBody(exchange, requestId) {
            // Get max body size from config
            var maxBodySize = (typeof serverConfig !== "undefined") ? serverConfig.request.maxBodySize : 1048576;

            try {
                var inputStream = exchange.getRequestBody();
                var reader = new BufferedReader(new InputStreamReader(inputStream, StandardCharsets.UTF_8));
                var bodyBuilder = [];
                var totalSize = 0;
                var line;

                while ((line = reader.readLine()) !== null) {
                    var lineLength = line.length() + 1; // +1 for newline
                    totalSize += lineLength;

                    if (totalSize > maxBodySize) {
                        reader.close();
                        log("Request body too large: " + totalSize + " bytes (max: " + maxBodySize + ")", requestId);
                        return {
                            success: false,
                            body: null,
                            error: "Request body too large (max " + Math.floor(maxBodySize / 1024) + "KB)",
                            errorCode: "PayloadTooLarge"
                        };
                    }

                    bodyBuilder.push(line);
                }

                reader.close();

                var bodyStr = bodyBuilder.join("");
                if (bodyStr.length === 0) {
                    return { success: true, body: null, error: null };
                }

                return { success: true, body: JSON.parse(bodyStr), error: null };
            } catch (e) {
                log("ERROR: Failed to parse request body: " + e, requestId);
                return { success: false, body: null, error: "Invalid JSON: " + String(e), errorCode: "InvalidJson" };
            }
        }

        /**
         * Parse query string
         */
        function parseQuery(uri) {
            var query = {};
            var queryString = uri.getQuery();

            if (queryString) {
                var pairs = queryString.split("&");
                for (var i = 0; i < pairs.length; i++) {
                    var pair = pairs[i].split("=");
                    var key = decodeURIComponent(pair[0]);
                    var value = pair.length > 1 ? decodeURIComponent(pair[1]) : "";
                    query[key] = value;
                }
            }

            return query;
        }

        /**
         * Send JSON response with security headers
         * @param {com.sun.net.httpserver.HttpExchange} exchange
         * @param {number} statusCode
         * @param {Object} body
         * @param {Object} headers - Additional headers
         * @param {string} requestId - Request ID to include in response
         */
        function sendResponse(exchange, statusCode, body, headers, requestId) {
            try {
                headers = headers || {};
                headers["Content-Type"] = "application/json";

                // Add request ID header for correlation
                if (requestId) {
                    headers["X-Request-ID"] = requestId;
                }

                // Get security config
                var securityConfig = (typeof serverConfig !== "undefined") ? serverConfig.security : {
                    corsEnabled: true,
                    corsAllowAll: true,
                    corsOrigins: [],
                    headers: {}
                };

                // Handle CORS
                if (securityConfig.corsEnabled) {
                    var requestHeaders = exchange.getRequestHeaders();
                    var originHeader = requestHeaders.getFirst("Origin");
                    var allowedOrigin = null;

                    if (securityConfig.corsAllowAll) {
                        allowedOrigin = "*";
                    } else if (originHeader && securityConfig.corsOrigins.indexOf(String(originHeader)) !== -1) {
                        allowedOrigin = String(originHeader);
                    }

                    if (allowedOrigin) {
                        headers["Access-Control-Allow-Origin"] = allowedOrigin;
                        headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS";
                        headers["Access-Control-Allow-Headers"] = "Content-Type, X-Request-ID";
                        headers["Access-Control-Max-Age"] = "86400";
                    }
                }

                // Add security headers
                if (securityConfig.headers) {
                    for (var secHeader in securityConfig.headers) {
                        if (securityConfig.headers.hasOwnProperty(secHeader)) {
                            headers[secHeader] = securityConfig.headers[secHeader];
                        }
                    }
                }

                // Set headers
                var responseHeaders = exchange.getResponseHeaders();
                for (var key in headers) {
                    if (headers.hasOwnProperty(key)) {
                        responseHeaders.set(key, headers[key]);
                    }
                }

                // Include requestId in body if not already present
                if (requestId && body && typeof body === "object" && !body.requestId) {
                    body.requestId = requestId;
                }

                // Serialize body
                var responseBody = JSON.stringify(body, null, 2);
                var responseBytes = new JavaString(responseBody).getBytes(StandardCharsets.UTF_8);

                // Send response
                exchange.sendResponseHeaders(statusCode, responseBytes.length);
                var outputStream = exchange.getResponseBody();
                outputStream.write(responseBytes);
                outputStream.close();
            } catch (e) {
                log("ERROR: Failed to send response: " + e, requestId);
            }
        }

        /**
         * Create HTTP handler for a specific path and method
         */
        function createHandler(path, method, handlerFn) {
            var HttpHandler = Java.type("com.sun.net.httpserver.HttpHandler");

            // Use Java.extend to properly implement the interface
            var HandlerImpl = Java.extend(HttpHandler, {
                handle: function(exchange) {
                    var requestMethod = exchange.getRequestMethod();
                    var requestPath = exchange.getRequestURI().getPath();
                    var requestId = generateRequestId();
                    var clientIP = getClientIP(exchange);

                    try {
                        // Handle CORS preflight
                        if (requestMethod === "OPTIONS") {
                            sendResponse(exchange, 204, {}, {}, requestId);
                            return;
                        }

                        // Check rate limit
                        var rateLimitResult = checkRateLimit(clientIP);
                        if (!rateLimitResult.allowed) {
                            log("Rate limit exceeded for " + clientIP, requestId);
                            sendResponse(exchange, 429, {
                                error: {
                                    code: "TooManyRequests",
                                    message: "Rate limit exceeded. Try again in " + rateLimitResult.retryAfter + " seconds."
                                }
                            }, { "Retry-After": String(rateLimitResult.retryAfter) }, requestId);
                            return;
                        }

                        // Log request
                        log(requestMethod + " " + requestPath + " from " + clientIP, requestId);

                        // Method check (skip if wildcard "*")
                        if (method !== "*" && requestMethod !== method) {
                            sendResponse(exchange, 405, {
                                error: {
                                    code: "MethodNotAllowed",
                                    message: "Method " + requestMethod + " not allowed"
                                }
                            }, {}, requestId);
                            return;
                        }

                        // Parse body with size limit
                        var bodyResult = parseRequestBody(exchange, requestId);
                        if (!bodyResult.success) {
                            var statusCode = bodyResult.errorCode === "InvalidJson" ? 400 : 413;
                            var errorCode = bodyResult.errorCode || "PayloadTooLarge";
                            sendResponse(exchange, statusCode, {
                                error: {
                                    code: errorCode,
                                    message: bodyResult.error
                                }
                            }, {}, requestId);
                            return;
                        }

                        // Build request object
                        var request = {
                            method: requestMethod,
                            path: requestPath,
                            query: parseQuery(exchange.getRequestURI()),
                            body: bodyResult.body,
                            headers: {},
                            requestId: requestId,
                            clientIP: clientIP
                        };

                        // Build response object
                        var response = {
                            statusCode: 200,
                            body: {},
                            headers: {}
                        };

                        // Call handler (runs on HTTP thread pool)
                        handlerFn(request, response);

                        // Send response
                        sendResponse(exchange, response.statusCode, response.body, response.headers, requestId);

                    } catch (e) {
                        log("ERROR: Handler exception: " + e, requestId);
                        sendResponse(exchange, 500, {
                            error: {
                                code: "InternalError",
                                message: String(e)
                            }
                        }, {}, requestId);
                    }
                }
            });

            return new HandlerImpl();
        }

        /**
         * Add a handler for a specific path and method
         */
        function addHandler(path, method, handlerFn) {
            handlers.push({
                path: path,
                method: method,
                handler: handlerFn
            });
            return api; // Fluent API
        }

        /**
         * Start the server
         */
        function start() {
            try {
                // Create server
                var address = new InetSocketAddress(host, port);
                httpServer = HttpServer.create(address, 0);

                // CRITICAL: Use Display as executor to run handlers on UI thread
                // This allows handlers to safely call JS functions (same thread)
                // Display implements java.util.concurrent.Executor
                httpServer.setExecutor(display);

                // Register handlers
                for (var i = 0; i < handlers.length; i++) {
                    var h = handlers[i];
                    httpServer.createContext(h.path, createHandler(h.path, h.method, h.handler));
                }

                // Start server
                httpServer.start();
                state = "running";

                log("Server started on " + host + ":" + port);

            } catch (e) {
                log("ERROR: Failed to start server: " + e);
                throw e;
            }

            return api;
        }

        /**
         * Stop the server
         */
        function stop() {
            try {
                state = "stopping";
                log("Stopping server...");

                if (httpServer) {
                    httpServer.stop(0); // Stop immediately
                }

                // No need to shutdown executor - we're using Display

                state = "stopped";
                log("Server stopped");

            } catch (e) {
                log("ERROR: Failed to stop server: " + e);
            }

            return api;
        }

        /**
         * Get current server state
         */
        function getState() {
            return state;
        }

        /**
         * Get rate limit statistics for monitoring
         * @returns {Object} Rate limit stats
         */
        function getRateLimitStats() {
            var rateLimitConfig = (typeof serverConfig !== "undefined") ? serverConfig.rateLimit : {
                windowMs: 60000
            };

            var now = Date.now();
            var windowStart = now - rateLimitConfig.windowMs;
            var totalClients = 0;
            var blockedClients = 0;
            var requestsInWindow = 0;

            var iterator = rateLimitState.entrySet().iterator();
            while (iterator.hasNext()) {
                var entry = iterator.next();
                var ipState = entry.getValue();
                totalClients++;

                if (ipState.blockedUntil > now) {
                    blockedClients++;
                }

                var timestamps = ipState.timestamps;
                if (timestamps && timestamps.length) {
                    for (var i = 0; i < timestamps.length; i++) {
                        if (timestamps[i] > windowStart) {
                            requestsInWindow++;
                        }
                    }
                }
            }

            return {
                totalTrackedClients: totalClients,
                blockedClients: blockedClients,
                requestsInCurrentWindow: requestsInWindow
            };
        }

        // Public API
        var api = {
            addHandler: addHandler,
            start: start,
            stop: stop,
            getState: getState,
            getRateLimitStats: getRateLimitStats
        };

        return api;
    }

    // Export module
    var serverCore = {
        create: create
    };

    // Export globally for JArchi
    if (typeof globalThis !== "undefined") {
        globalThis.serverCore = serverCore;
    } else if (typeof global !== "undefined") {
        global.serverCore = serverCore;
    }

    // CommonJS for Node.js build tools
    if (typeof module !== "undefined" && module.exports) {
        module.exports = serverCore;
    }

})();
