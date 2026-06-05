import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";

const defaultApiIndexPath = "data/padok-api-index.json";
const uriPrefix = "padok://endpoint/";

export const loadApiIndex = async (apiIndexPath = defaultApiIndexPath) => {
  return JSON.parse(await readFile(apiIndexPath, "utf8"));
};

export const buildResourceList = (apiIndex) => {
  return (apiIndex.endpoints ?? []).map((endpoint) => ({
    uri: `${uriPrefix}${endpoint.id}`,
    name: endpoint.id,
    description: endpoint.description,
    mimeType: "application/json"
  }));
};

const findEndpointByUri = (apiIndex, uri) => {
  const endpointId = String(uri ?? "").startsWith(uriPrefix)
    ? String(uri).slice(uriPrefix.length)
    : null;

  return (apiIndex.endpoints ?? []).find((endpoint) => endpoint.id === endpointId) ?? null;
};

export const readEndpointResource = async (apiIndex, uri) => {
  const endpoint = findEndpointByUri(apiIndex, uri);
  if (!endpoint) {
    throw new Error(`Unknown Padok resource: ${uri}`);
  }

  const text = await readFile(endpoint.path, "utf8");

  return {
    uri,
    mimeType: "application/json",
    text
  };
};

const success = (id, result) => ({
  jsonrpc: "2.0",
  id,
  result
});

const failure = (id, error) => ({
  jsonrpc: "2.0",
  id,
  error: {
    code: -32000,
    message: error?.message ?? "Unknown Padok MCP error"
  }
});

export const handleMcpRequest = async (apiIndex, request) => {
  if (request.method === "initialize") {
    return success(request.id, {
      protocolVersion: request.params?.protocolVersion ?? "2024-11-05",
      capabilities: {
        resources: {}
      },
      serverInfo: {
        name: "padok-mcp",
        version: "0.1.0"
      }
    });
  }

  if (request.method === "resources/list") {
    return success(request.id, {
      resources: buildResourceList(apiIndex)
    });
  }

  if (request.method === "resources/read") {
    return success(request.id, {
      contents: [await readEndpointResource(apiIndex, request.params?.uri)]
    });
  }

  if (request.method === "tools/list") {
    return success(request.id, {
      tools: []
    });
  }

  if (request.method === "prompts/list") {
    return success(request.id, {
      prompts: []
    });
  }

  if (request.method === "notifications/initialized") {
    return null;
  }

  return failure(request.id, new Error(`Unsupported method: ${request.method}`));
};

const main = async () => {
  const apiIndex = await loadApiIndex(process.argv[2] ?? defaultApiIndexPath);
  const input = createInterface({
    input: process.stdin,
    crlfDelay: Infinity
  });

  for await (const line of input) {
    if (!line.trim()) continue;

    let response;
    try {
      response = await handleMcpRequest(apiIndex, JSON.parse(line));
    } catch (error) {
      response = failure(null, error);
    }

    if (response) {
      process.stdout.write(`${JSON.stringify(response)}\n`);
    }
  }
};

if (process.argv[1]?.endsWith("padok-mcp-server.mjs")) {
  main();
}
