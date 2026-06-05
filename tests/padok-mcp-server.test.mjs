import assert from "node:assert/strict";
import test from "node:test";
import {
  buildResourceList,
  handleMcpRequest,
  loadApiIndex,
  readEndpointResource
} from "../scripts/padok-mcp-server.mjs";

test("Padok MCP server exposes static API artifacts as resources", async () => {
  const apiIndex = await loadApiIndex("data/padok-api-index.json");
  const resources = buildResourceList(apiIndex);

  assert.ok(resources.some((resource) => resource.uri === "padok://endpoint/readiness-report"));
  assert.ok(resources.some((resource) => resource.uri === "padok://endpoint/model-backtest"));

  const readiness = await readEndpointResource(apiIndex, "padok://endpoint/readiness-report");
  const payload = JSON.parse(readiness.text);

  assert.equal(readiness.mimeType, "application/json");
  assert.ok(payload.rankings.score.length > 0);
});

test("Padok MCP request handler supports initialize, list, and read", async () => {
  const apiIndex = await loadApiIndex("data/padok-api-index.json");
  const initResponse = await handleMcpRequest(apiIndex, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05"
    }
  });

  assert.equal(initResponse.result.serverInfo.name, "padok-mcp");

  const listResponse = await handleMcpRequest(apiIndex, {
    jsonrpc: "2.0",
    id: 2,
    method: "resources/list"
  });

  assert.ok(listResponse.result.resources.length >= 4);

  const readResponse = await handleMcpRequest(apiIndex, {
    jsonrpc: "2.0",
    id: 3,
    method: "resources/read",
    params: {
      uri: "padok://endpoint/model-backtest"
    }
  });
  const modelBacktest = JSON.parse(readResponse.result.contents[0].text);

  assert.equal(modelBacktest.summary.seasonCount, 6);
});
