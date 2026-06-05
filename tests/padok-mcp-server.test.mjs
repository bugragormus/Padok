import assert from "node:assert/strict";
import test from "node:test";
import {
  buildResourceList,
  buildToolList,
  callPadokTool,
  handleMcpRequest,
  loadApiIndex,
  readEndpointResource
} from "../scripts/padok-mcp-server.mjs";

test("Padok MCP server exposes static API artifacts as resources", async () => {
  const apiIndex = await loadApiIndex("data/padok-api-index.json");
  const resources = buildResourceList(apiIndex);

  assert.ok(resources.some((resource) => resource.uri === "padok://endpoint/readiness-report"));
  assert.ok(resources.some((resource) => resource.uri === "padok://endpoint/decision-brief"));
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

test("Padok MCP tools return model summary and top candidates", async () => {
  const apiIndex = await loadApiIndex("data/padok-api-index.json");
  const tools = buildToolList();

  assert.ok(tools.some((tool) => tool.name === "padok.model_summary"));
  assert.ok(tools.some((tool) => tool.name === "padok.decision_brief"));
  assert.ok(tools.some((tool) => tool.name === "padok.top_candidates"));
  assert.ok(tools.some((tool) => tool.name === "padok.horse_profile"));

  const summaryResult = await callPadokTool(apiIndex, "padok.model_summary");
  const summary = JSON.parse(summaryResult.content[0].text);

  assert.equal(summary.summary.seasonCount, 6);
  assert.ok(summary.blindSpots.length > 0);

  const briefResult = await callPadokTool(apiIndex, "padok.decision_brief");
  const brief = JSON.parse(briefResult.content[0].text);

  assert.ok(brief.picks.scoreLeader.horseName);

  const candidatesResult = await callPadokTool(apiIndex, "padok.top_candidates", {
    lens: "score",
    limit: 3
  });
  const candidates = JSON.parse(candidatesResult.content[0].text);

  assert.equal(candidates.lens, "score");
  assert.equal(candidates.candidates.length, 3);
  assert.equal(candidates.candidates[0].rank, 1);
});

test("Padok MCP horse_profile returns one horse across readiness lenses", async () => {
  const apiIndex = await loadApiIndex("data/padok-api-index.json");
  const result = await callPadokTool(apiIndex, "padok.horse_profile", {
    horseName: "SPECIAL MAN"
  });
  const profile = JSON.parse(result.content[0].text);

  assert.equal(profile.horseName, "SPECIAL MAN");
  assert.ok(profile.rankings.some((ranking) => ranking.lens === "score"));
  assert.ok(profile.readiness.parts.some((part) => part.label === "aktör geçmişi"));
});

test("Padok MCP request handler supports tool calls", async () => {
  const apiIndex = await loadApiIndex("data/padok-api-index.json");
  const response = await handleMcpRequest(apiIndex, {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "padok.top_candidates",
      arguments: {
        lens: "upside",
        limit: 2
      }
    }
  });
  const payload = JSON.parse(response.result.content[0].text);

  assert.equal(payload.lens, "upside");
  assert.equal(payload.candidates.length, 2);
});
