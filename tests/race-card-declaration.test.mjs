import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRaceCardFromDeclaration,
  parseDeclarationText
} from "../scripts/build-race-card-from-declaration.mjs";

test("parseDeclarationText converts declaration rows into race-card entries", () => {
  const parsed = parseDeclarationText(`
# header
2 | LATE HORSE | 3y d e | TOROK (IRE) | SHORTY | 58 | A.ÇELİK | K.BALTACI | SER. GÜL | 59 | 2-133
1 | SCRATCHED HORSE | 3y d e | TIZWAY (USA) | PEACE TALK (USA) | 58 | - | Y.YILDIZ | CEMKESER | 68 | 132322 | KOŞMAZ
bad row
`);

  assert.equal(parsed.entries.length, 2);
  assert.equal(parsed.entries[0].programNo, 1);
  assert.equal(parsed.entries[0].horseName, "SCRATCHED HORSE");
  assert.equal(parsed.entries[0].jockey, null);
  assert.equal(parsed.entries[0].scratch, true);
  assert.equal(parsed.entries[1].horseName, "LATE HORSE");
  assert.equal(parsed.entries[1].handicapPoint, 59);
  assert.equal(parsed.warnings.length, 1);
});

test("buildRaceCardFromDeclaration wraps entries with race source and quality metadata", () => {
  const payload = buildRaceCardFromDeclaration({
    text: "1 | RUNNER | 3y d e | TOROK | DAM | 58 | H.KARATAŞ | TRAINER | OWNER | 90 | 1111",
    race: {
      id: "fixture-race",
      date: "2026-06-06",
      venue: "Ankara",
      raceNo: 1,
      raceTime: "16:00",
      name: "Fixture Koşusu",
      class: "G2",
      ageBreed: "3 Yaşlı İngilizler",
      distance: 2200,
      surface: "Çim"
    },
    source: {
      name: "Fixture",
      url: "https://example.com"
    }
  });

  assert.equal(payload.race.name, "Fixture Koşusu");
  assert.equal(payload.source.name, "Fixture");
  assert.equal(payload.entries.length, 1);
  assert.equal(payload.quality.warningCount, 0);
});
