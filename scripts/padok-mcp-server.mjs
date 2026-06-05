import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";

const defaultApiIndexPath = "data/padok-api-index.json";
const uriPrefix = "padok://endpoint/";
const endpointPathById = (apiIndex, endpointId) => {
  const endpoint = (apiIndex.endpoints ?? []).find((candidate) => candidate.id === endpointId);
  if (!endpoint) throw new Error(`Unknown Padok endpoint: ${endpointId}`);
  return endpoint.path;
};

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

const readEndpointJson = async (apiIndex, endpointId) => {
  return JSON.parse(await readFile(endpointPathById(apiIndex, endpointId), "utf8"));
};

const asContent = (payload) => ({
  content: [
    {
      type: "text",
      text: JSON.stringify(payload, null, 2)
    }
  ]
});

const clampLimit = (value, fallback = 5) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(20, Math.max(1, parsed));
};

export const buildToolList = () => [
  {
    name: "padok.decision_brief",
    description: "Return the current Gazi decision brief with picks, model performance, calibration, and next actions.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: "padok.candidate_comparison",
    description: "Return the current side-by-side Gazi candidate comparison with strengths, cautions, route, actor, and readiness signals.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 20,
          default: 6
        }
      },
      additionalProperties: false
    }
  },
  {
    name: "padok.signal_calibration",
    description: "Return readiness signal calibration with feature separations, metric summaries, and miss diagnostics.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 20,
          default: 8
        }
      },
      additionalProperties: false
    }
  },
  {
    name: "padok.race_day_watchlist",
    description: "Return race-day Gazi watchlist groups: core contenders, upside watch, risk flags, and data checklist.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: "padok.model_summary",
    description: "Return readiness model backtest summary, blind spots, and recent surprise reviews.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: "padok.top_candidates",
    description: "Return top readiness candidates by lens.",
    inputSchema: {
      type: "object",
      properties: {
        lens: {
          type: "string",
          enum: ["score", "upside", "lowRisk", "uncertainty"],
          default: "score"
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 20,
          default: 5
        }
      },
      additionalProperties: false
    }
  },
  {
    name: "padok.horse_profile",
    description: "Return one horse's readiness rankings, score parts, actor context, and historical matches.",
    inputSchema: {
      type: "object",
      properties: {
        horseName: {
          type: "string"
        }
      },
      required: ["horseName"],
      additionalProperties: false
    }
  }
];

const normalizeName = (value) => String(value ?? "").trim().toLocaleUpperCase("tr-TR");

export const callPadokTool = async (apiIndex, name, args = {}) => {
  if (name === "padok.decision_brief") {
    return asContent(await readEndpointJson(apiIndex, "decision-brief"));
  }

  if (name === "padok.candidate_comparison") {
    const comparison = await readEndpointJson(apiIndex, "candidate-comparison");
    const limit = clampLimit(args.limit, 6);

    return asContent({
      ...comparison,
      candidates: (comparison.candidates ?? []).slice(0, limit)
    });
  }

  if (name === "padok.signal_calibration") {
    const calibration = await readEndpointJson(apiIndex, "signal-calibration");
    const limit = clampLimit(args.limit, 8);

    return asContent({
      ...calibration,
      signals: (calibration.signals ?? []).slice(0, limit),
      missDiagnostics: (calibration.missDiagnostics ?? []).slice(0, limit)
    });
  }

  if (name === "padok.race_day_watchlist") {
    return asContent(await readEndpointJson(apiIndex, "race-day-watchlist"));
  }

  if (name === "padok.model_summary") {
    const modelBacktest = await readEndpointJson(apiIndex, "model-backtest");

    return asContent({
      summary: modelBacktest.summary,
      blindSpots: (modelBacktest.blindSpots ?? []).slice(0, 6),
      recentSeasons: (modelBacktest.seasons ?? []).slice(-4).reverse().map((season) => ({
        year: season.year,
        topPickName: season.topPickName,
        topPickFinish: season.topPickFinish,
        winnerName: season.winnerName,
        winnerScoreRank: season.winnerScoreRank,
        surpriseReview: season.surpriseReview
      }))
    });
  }

  if (name === "padok.top_candidates") {
    const readiness = await readEndpointJson(apiIndex, "readiness-report");
    const lens = args.lens ?? "score";
    const limit = clampLimit(args.limit);
    const entries = readiness.rankings?.[lens];
    if (!entries) throw new Error(`Unknown readiness lens: ${lens}`);

    return asContent({
      sourceYear: readiness.sourceYear,
      lens,
      candidates: entries.slice(0, limit).map((entry) => ({
        rank: entry.rank,
        horseName: entry.horseName,
        gaziFinishPosition: entry.gaziFinishPosition,
        value: entry.lensValue,
        badge: entry.badge,
        reason: entry.reason,
        meta: entry.meta
      }))
    });
  }

  if (name === "padok.horse_profile") {
    const readiness = await readEndpointJson(apiIndex, "readiness-report");
    const targetName = normalizeName(args.horseName);
    if (!targetName) throw new Error("horseName is required.");

    const lensRows = Object.entries(readiness.rankings ?? {}).map(([lens, entries]) => {
      const entry = entries.find((candidate) => normalizeName(candidate.horseName) === targetName);
      return entry ? { lens, entry } : null;
    }).filter(Boolean);
    const scoreEntry = lensRows.find((row) => row.lens === "score")?.entry ?? lensRows[0]?.entry;

    if (!scoreEntry) throw new Error(`Horse not found in readiness report: ${args.horseName}`);

    return asContent({
      sourceYear: readiness.sourceYear,
      horseName: scoreEntry.horseName,
      gaziFinishPosition: scoreEntry.gaziFinishPosition,
      rankings: lensRows.map(({ lens, entry }) => ({
        lens,
        rank: entry.rank,
        value: entry.lensValue,
        badge: entry.badge,
        reason: entry.reason,
        meta: entry.meta
      })),
      readiness: scoreEntry.readiness,
      actorContext: scoreEntry.actorContext,
      profileSummary: scoreEntry.profileSummary,
      historicalMatches: scoreEntry.historicalMatches
    });
  }

  throw new Error(`Unknown Padok tool: ${name}`);
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
        resources: {},
        tools: {}
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
      tools: buildToolList()
    });
  }

  if (request.method === "tools/call") {
    return success(request.id, await callPadokTool(apiIndex, request.params?.name, request.params?.arguments ?? {}));
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
