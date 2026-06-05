import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { buildContextHistory } from "../scripts/build-gazi-context-history.mjs";

const writeJson = async (dir, fileName, payload) => {
  const path = join(dir, fileName);
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return path;
};

test("buildContextHistory aggregates jockey, owner, and pedigree entities from participation reports", async () => {
  const dir = await mkdtemp(join(tmpdir(), "padok-context-"));
  await mkdir(dir, { recursive: true });
  const inputPath = await writeJson(dir, "gazi-participation-2025.json", {
    sourceYear: 2025,
    rows: [
      {
        horseName: "A",
        gaziFinishPosition: 1,
        gaziJockeyName: "JOCKEY",
        owner: "OWNER",
        sire: "SIRE",
        dam: "DAM",
        damsire: "DAMSIRE"
      },
      {
        horseName: "B",
        gaziFinishPosition: 4,
        gaziJockeyName: "JOCKEY",
        owner: "OWNER",
        sire: "SIRE",
        dam: "OTHER DAM",
        damsire: "DAMSIRE"
      }
    ]
  });

  const payload = await buildContextHistory({ inputPaths: [inputPath] });

  assert.equal(payload.summary.seasonCount, 1);
  assert.ok(payload.summary.entityCount > 0);
  assert.equal(payload.byType.jockey[0].entityName, "JOCKEY");
  assert.equal(payload.byType.jockey[0].starts, 2);
  assert.equal(payload.byType.jockey[0].topThree, 1);
  assert.equal(payload.byType.owner[0].entityName, "OWNER");
  assert.equal(payload.byType.sire[0].entityName, "SIRE");
});
