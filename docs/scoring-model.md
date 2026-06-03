# Scoring Model Notes

This document explains the first exploratory Gazi race similarity score.

## Goal

The first score does not predict the Gazi result. It answers a simpler question:

Which imported races look structurally similar to the Gazi Kosusu profile?

Target profile:

- 3 yasli
- Ingiliz
- Cim
- 2400m

## Current Factors

The current exploratory score is a 100-point style additive score:

- Distance: maximum 35
- Surface: maximum 25
- Breed: maximum 20
- Age condition: maximum 15
- Race class: maximum 5

Distance and surface are weighted heavily because Gazi is primarily a stamina-on-turf test. Breed and age are eligibility filters. Race class is useful but deliberately smaller at this stage because early imported race index rows do not yet include named race identity for every important race.

## Signal Tiers

The script also emits a `signalTier` because one numeric score can hide important nuance:

- `target-race`: Gazi itself
- `core-prep`: 3 yasli Ingiliz, cim, 2000m+
- `stamina-proxy`: 3 yasli Ingiliz, 2000m+, non-turf
- `classic-speed`: 3 yasli Ingiliz, cim, roughly 1600m
- `surface-breed`: Ingiliz + cim, but weaker age/distance match
- `weak-context`: useful context only

This matters because a 1600m turf classic can show class and speed, while a 2100m dirt race can show stamina. Neither should be silently treated as the same kind of evidence.

Named race recognition can override structural tiers for known Gazi-route races:

- GAZI -> `target-race`
- MEHMET AKIF ERSOY -> `core-prep`
- SAIT AKSON -> `core-prep`
- KISRAK -> `core-prep`
- ERKEK TAY DENEME -> `classic-speed`
- DISI TAY DENEME -> `classic-speed`

## Why This Is Separate From Horse Scoring

Race similarity and horse performance are different layers.

Race similarity asks:

```text
Does this race resemble the Gazi setup?
```

Horse scoring asks:

```text
How did this horse perform in useful contexts?
```

We need both, but mixing them too early would hide mistakes. First we score races, then we use high-similarity races as stronger evidence for horse-level features.

## Current Named Race Recognition

Named race recognition is now available through the TJK `TumOnemliKosular` layer and daily result imports. It can override structural tiers for these known Gazi-route race families:

- Mehmet Akif Ersoy Kosusu
- Sait Akson Kosusu
- Kisrak Kosusu
- Erkek Tay Deneme
- Disi Tay Deneme

Those names are not always present in the first race index layer. The current system uses official important race rows and daily result imports to attach canonical names and horse-level entries.

The first broader 2025 snapshot already surfaced high-value structural matches:

- 2025-06-07 Ankara, G2, 2200m, cim, 3 yasli Ingilizler.
- 2025-06-08 Istanbul, G2, 2200m, cim, 3 yasli Ingilizler.
- 2025-06-08 Istanbul, G1 / Disi, 2100m, cim, 3 yasli Ingilizler.

This suggests the structural score is useful, but structural similarity should not replace canonical named-race context.

## Next Improvement

The next scoring improvement is not another race-level score. It is horse-level route participation:

```text
Gazi horse -> which route races it ran -> which route races it skipped -> Gazi finish
```

This is needed because a horse can be Gazi-relevant without running in Mehmet Akif Ersoy, Sait Akson, or another tracked route race.
