#!/usr/bin/env node
import {
  NodeOAuthClientProvider,
  StatelessHTTPTransport,
  connectToRemoteServer,
  createLazyAuthCoordinator,
  debugLog,
  discoverOAuthServerInfo,
  log,
  parseCommandLineArgs,
  setupSignalHandlers,
  version
} from "./chunk-RYZEA2QV.js";

// src/client.ts
import { EventEmitter } from "events";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ListResourcesResultSchema, ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
async function runClient(serverUrl, callbackPort, headers, transportStrategy = "http-first", host, staticOAuthClientMetadata, staticOAuthClientInfo, authTimeoutMs, serverUrlHash, protocolMode = "auto") {
  const events = new EventEmitter();
  const authCoordinator = createLazyAuthCoordinator(serverUrlHash, callbackPort, events, authTimeoutMs);
  log("Discovering OAuth server configuration...");
  const discoveryResult = await discoverOAuthServerInfo(serverUrl, headers);
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
  const authProvider = new NodeOAuthClientProvider({
    serverUrl: discoveryResult.authorizationServerUrl,
    callbackPort,
    host,
    clientName: "MCP CLI Client",
    staticOAuthClientMetadata,
    staticOAuthClientInfo,
    serverUrlHash,
    authorizationServerMetadata: discoveryResult.authorizationServerMetadata,
    protectedResourceMetadata: discoveryResult.protectedResourceMetadata,
    wwwAuthenticateScope: discoveryResult.wwwAuthenticateScope,
    events
  });
  const client = new Client(
    {
      name: "mcp-remote",
      version
    },
    {
      capabilities: {}
    }
  );
  let server = null;
  const authInitializer = async () => {
    const authState = await authCoordinator.initializeAuth();
    server = authState.server;
    if (authState.skipBrowserAuth) {
      log("Authentication was completed by another instance - will use tokens from disk...");
      await new Promise((res) => setTimeout(res, 1e3));
    }
    return {
      waitForAuthCode: authState.waitForAuthCode,
      skipBrowserAuth: authState.skipBrowserAuth,
      callbackPort: authState.callbackPort
    };
  };
  try {
    const transport = await connectToRemoteServer(
      client,
      serverUrl,
      authProvider,
      headers,
      authInitializer,
      transportStrategy,
      /* @__PURE__ */ new Set(),
      protocolMode
    );
    if (transport instanceof StatelessHTTPTransport) {
      log("Connected using stateless transport (2026-07-28)");
      const toolsResponse = await new Promise((resolve, reject) => {
        transport.onmessage = (message) => {
          if ("id" in message && message.id === 1) {
            resolve(message);
          }
        };
        transport.onerror = reject;
        transport.send({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }).catch(reject);
      });
      log("Tools:", JSON.stringify(toolsResponse, null, 2));
      await transport.close();
      if (server) server.close();
      process.exit(0);
      return;
    }
    transport.onmessage = (message) => {
      log("Received message:", JSON.stringify(message, null, 2));
    };
    transport.onerror = (error) => {
      log("Transport error:", error);
    };
    transport.onclose = () => {
      log("Connection closed.");
      process.exit(0);
    };
    const cleanup = async () => {
      log("\nClosing connection...");
      await client.close();
      if (server) {
        server.close();
      }
    };
    setupSignalHandlers(cleanup);
    log("Connected successfully!");
    try {
      log("Requesting tools list...");
      const tools = await client.request({ method: "tools/list" }, ListToolsResultSchema);
      log("Tools:", JSON.stringify(tools, null, 2));
    } catch (e) {
      log("Error requesting tools list:", e);
    }
    try {
      log("Requesting resource list...");
      const resources = await client.request({ method: "resources/list" }, ListResourcesResultSchema);
      log("Resources:", JSON.stringify(resources, null, 2));
    } catch (e) {
      log("Error requesting resources list:", e);
    }
    log("Exiting OK...");
    if (server) {
      server.close();
    }
    process.exit(0);
  } catch (error) {
    log("Fatal error:", error);
    if (server) {
      server.close();
    }
    process.exit(1);
  }
}
parseCommandLineArgs(process.argv.slice(2), "Usage: npx tsx client.ts <https://server-url> [callback-port] [--debug]").then(
  ({
    serverUrl,
    callbackPort,
    headers,
    transportStrategy,
    host,
    staticOAuthClientMetadata,
    staticOAuthClientInfo,
    authTimeoutMs,
    serverUrlHash,
    protocolMode
  }) => {
    return runClient(
      serverUrl,
      callbackPort,
      headers,
      transportStrategy,
      host,
      staticOAuthClientMetadata,
      staticOAuthClientInfo,
      authTimeoutMs,
      serverUrlHash,
      protocolMode
    );
  }
).catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
