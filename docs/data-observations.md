# Data Observations

## 2025 Gazi Window Snapshot

Command used:

```bash
npm run fetch:tjk-race-index -- --start 01.03.2025 --end 29.06.2025 --page 1 --pages 10 --until-empty
npm run import:tjk-race-index -- --input data/processed/tjk/kosu-sorgulama
npm run score:gazi-race-similarity -- --year 2025 --limit 15
```

Result:

- 10 new pages fetched for `01.03.2025 - 29.06.2025`.
- 500 rows fetched in that run.
- 12 processed JSON files were imported from the local runtime folder.
- 600 input rows were read.
- 517 unique TJK race records exist in SQLite after duplicate protection.

## Top Similarity Findings

The broader sample produced meaningful Gazi-like race candidates:

- `2025-06-08 İstanbul race 9`: 3 yaşlı İngilizler, G1 / Dişi, 2100m çim, score 95.
- `2025-06-07 Ankara race 6`: 3 yaşlı İngilizler, G2, 2200m çim, score 94.
- `2025-06-08 İstanbul race 6`: 3 yaşlı İngilizler, G2, 2200m çim, score 94.

This is a strong sign that the structural scoring approach is useful. It surfaced the expected Gazi prep profile without hard-coding race names.

## Named Race Recognition Findings

After importing `TumOnemliKosular`, 2025 Gazi route names were matched by `source_race_id`:

- `2025-05-18`: Bİ'TALİH ERKEK TAY DENEME, winner TONBİ, G1, 1600m çim.
- `2025-05-18`: DİŞİ TAY DENEME, winner AMAZING TOUCH, G1, 1600m çim.
- `2025-06-07`: MEHMET AKİF ERSOY, winner SPECIAL MAN, G2, 2200m çim.
- `2025-06-08`: SAİT AKSON, winner HANDSOME KING, G2, 2200m çim.
- `2025-06-08`: Bİ'TALİH KISRAK, winner BOON NAM, G1, 2100m çim.
- `2025-06-29`: GAZİ, winner CUTHA, G1, 2400m çim.

This unlocks a much better product experience: structural similarity can find candidates, while named race recognition can label important context for humans.

## Current Limitation

The race index layer does not reliably expose canonical race names such as:

- Mehmet Akif Ersoy Koşusu
- Sait Akson Koşusu
- Kısrak Koşusu

It gives us race class, date, venue, race number, distance, surface and winner time. That is enough for structural similarity, but not enough for clean named-race labeling.

## Next Question

The next useful data step is named race recognition:

```text
race index record -> canonical important race name
```

Possible routes:

- TJK important races query pages.
- Daily result detail pages.
- Program PDFs.
- A small manually curated mapping for known prep races, then later automated.

The right approach is probably hybrid: start with a curated mapping for known Gazi prep races, then use official detail sources to automate more names.
