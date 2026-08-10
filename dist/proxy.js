#!/usr/bin/env node
import {
  NodeOAuthClientProvider,
  PROTOCOL_2026_07_28,
  StatelessHTTPTransport,
  connectToRemoteServer,
  createLazyAuthCoordinator,
  debugLog,
  discoverOAuthServerInfo,
  isCallbackServerListening,
  isLocalHttpServer,
  log,
  mcpProxy,
  parseCommandLineArgs,
  setupSignalHandlers,
  waitForCallbackServer
} from "./chunk-EKI5T2ER.js";

// src/proxy.ts
import { EventEmitter } from "events";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
async function runProxy(serverUrl, callbackPort, headers, transportStrategy = "http-first", host, staticOAuthClientMetadata, staticOAuthClientInfo, authorizeResource, ignoredTools, authTimeoutMs, serverUrlHash, protocolMode = "auto") {
  const events = new EventEmitter();
  const skipOAuthSetup = isLocalHttpServer(serverUrl);
  const authCoordinator = createLazyAuthCoordinator(serverUrlHash, callbackPort, events, authTimeoutMs);
  let discoveryResult;
  let initialAuthState;
  let effectiveCallbackPort = callbackPort;
  let server;
  if (skipOAuthSetup) {
    log("Local HTTP MCP server detected \u2014 skipping OAuth callback server");
    discoveryResult = {
      authorizationServerUrl: serverUrl,
      authorizationServerMetadata: void 0,
      protectedResourceMetadata: void 0,
      wwwAuthenticateScope: void 0
    };
    initialAuthState = {
      skipBrowserAuth: true,
      callbackPort: 0,
      waitForAuthCode: async () => {
        throw new Error("OAuth is disabled for local HTTP MCP servers");
      }
    };
  } else {
    log("Discovering OAuth server configuration...");
    discoveryResult = await discoverOAuthServerInfo(serverUrl, headers);
    if (discoveryResult.protectedResourceMetadata) {
      log(`Discovered authorization server: ${discoveryResult.authorizationServerUrl}`);
      if (discoveryResult.protectedResourceMetadata.scopes_supported) {
        debugLog("Protected Resource Metadata scopes", {
          scopes_supported: discoveryResult.protectedResourceMetadata.scopes_supported
        });
      }
    } else {
      debugLog("No Protected Resource Metadata found, using server URL as authorization server");
    }
    log(`Ensuring OAuth callback server is listening...`);
    initialAuthState = await authCoordinator.initializeAuth({ force: true });
    effectiveCallbackPort = initialAuthState.callbackPort;
    server = initialAuthState.server;
    if (!initialAuthState.skipBrowserAuth) {
      await waitForCallbackServer(effectiveCallbackPort);
    }
    if (!initialAuthState.skipBrowserAuth && !await isCallbackServerListening(effectiveCallbackPort)) {
      throw new Error(`OAuth callback server failed to start on port ${effectiveCallbackPort}`);
    }
    log(`OAuth callback server ready on port ${effectiveCallbackPort}`);
  }
  const authProvider = new NodeOAuthClientProvider({
    serverUrl: discoveryResult.authorizationServerUrl,
    callbackPort: effectiveCallbackPort,
    host,
    clientName: "MCP CLI Proxy",
    staticOAuthClientMetadata,
    staticOAuthClientInfo,
    authorizeResource,
    serverUrlHash,
    authorizationServerMetadata: discoveryResult.authorizationServerMetadata,
    protectedResourceMetadata: discoveryResult.protectedResourceMetadata,
    wwwAuthenticateScope: discoveryResult.wwwAuthenticateScope,
    events
  });
  const localTransport = new StdioServerTransport();
  const authInitializer = async (forceReauth = false) => {
    if (skipOAuthSetup) {
      return {
        waitForAuthCode: initialAuthState.waitForAuthCode,
        skipBrowserAuth: true,
        callbackPort: 0
      };
    }
    if (forceReauth) {
      events.emit("reset-auth-code");
    }
    const authState = await authCoordinator.initializeAuth(forceReauth ? { force: true } : void 0);
    server = authState.server;
    effectiveCallbackPort = authState.callbackPort;
    authProvider.setCallbackPort(effectiveCallbackPort);
    if (authState.skipBrowserAuth) {
      log("Authentication was completed by another instance - will use tokens from disk");
      await new Promise((res) => setTimeout(res, 1e3));
    }
    return {
      waitForAuthCode: authState.waitForAuthCode,
      skipBrowserAuth: authState.skipBrowserAuth,
      callbackPort: effectiveCallbackPort
    };
  };
  try {
    const remoteTransport = await connectToRemoteServer(
      null,
      serverUrl,
      authProvider,
      headers,
      authInitializer,
      transportStrategy,
      /* @__PURE__ */ new Set(),
      protocolMode
    );
    const remoteProtocolMode = remoteTransport instanceof StatelessHTTPTransport ? PROTOCOL_2026_07_28 : "legacy";
    const discoverResult = remoteTransport instanceof StatelessHTTPTransport ? remoteTransport.discoverResult : void 0;
    mcpProxy({
      transportToClient: localTransport,
      transportToServer: remoteTransport,
      ignoredTools,
      authInitializer,
      authProvider,
      serverUrl,
      events,
      callbackPort: effectiveCallbackPort,
      remoteProtocolMode,
      discoverResult
    });
    await localTransport.start();
    log("Local STDIO server running");
    log(`Proxy established successfully between local STDIO and remote ${remoteTransport.constructor.name}`);
    log("Press Ctrl+C to exit");
    const cleanup = async () => {
      await remoteTransport.close();
      await localTransport.close();
      if (server) {
        server.close();
      }
    };
    setupSignalHandlers(cleanup);
  } catch (error) {
    log("Fatal error:", error);
    if (error instanceof Error && error.message.includes("self-signed certificate in certificate chain")) {
      log(`You may be behind a VPN!

If you are behind a VPN, you can try setting the NODE_EXTRA_CA_CERTS environment variable to point
to the CA certificate file. If using claude_desktop_config.json, this might look like:

{
  "mcpServers": {
    "\${mcpServerName}": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://remote.mcp.server/sse"
      ],
      "env": {
        "NODE_EXTRA_CA_CERTS": "\${your CA certificate file path}.pem"
      }
    }
  }
}
        `);
    }
    if (server) {
      server.close();
    }
    process.exit(1);
  }
}
parseCommandLineArgs(process.argv.slice(2), "Usage: npx tsx proxy.ts <https://server-url> [callback-port] [--debug]").then(
  ({
    serverUrl,
    callbackPort,
    headers,
    transportStrategy,
    host,
    debug,
    staticOAuthClientMetadata,
    staticOAuthClientInfo,
    authorizeResource,
    ignoredTools,
    authTimeoutMs,
    serverUrlHash,
    protocolMode
  }) => {
    return runProxy(
      serverUrl,
      callbackPort,
      headers,
      transportStrategy,
      host,
      staticOAuthClientMetadata,
      staticOAuthClientInfo,
      authorizeResource,
      ignoredTools,
      authTimeoutMs,
      serverUrlHash,
      protocolMode
    );
  }
).catch((error) => {
  log("Fatal error:", error);
  process.exit(1);
});
