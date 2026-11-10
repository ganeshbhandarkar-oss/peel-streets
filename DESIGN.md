# Peel Streets: design one-pager

**Pitch:** "Peel it, flip it, stick it, and the city moves." It's a hybrid-casual puzzle built around one tactile, instantly readable mechanic: peeling a sticker off a city map and slapping it back down somewhere else.

## Core loop (10–60 s per level)
1. **Read** the board: which source needs which destination, and where the gaps are.
2. **Peel** a sticker: a satisfying curl, a rip sound, and you see what's hidden underneath.
3. **Rotate or flip, then snap** onto an empty lot: bounce, a thunk, haptics.
4. **Solve**: cars, trams and water run along the route, with confetti and a star rating.
5. **Restore**: a building on the district map regains its colour. Then go to the next level.

Tension comes from a **peel budget** (par+2). Running out = **traffic jam** (fail state), the main monetisation moment.

## Meta
- 3 districts × 8 levels (Harbor Lane, Old Market, Skyline Park). Each solved level restores one building on the district skyline. A fully restored district gets a gold frame.
- Stars (1–3 against the solver-proven par) drive replay and the star total. Progress is saved locally.
- Later: decorate restored districts (soft currency sink), seasonal "festival" districts (LiveOps), and daily puzzles from a solver-backed generator.

## Monetisation plan (stubs in the prototype, clearly marked MOCK)
| Placement | Type | Prototype stub |
|---|---|---|
| Out of peels (jam) | Rewarded: +3 peels | Jam popup + bottom-bar "+3 Peels" |
| Undo after 3 free | Rewarded | Undo badge shows "AD" |
| Hint after 1 free per level | Rewarded | Hint badge shows "AD" |
| Between levels (from level ~8) | Interstitial, frequency-capped | not built |
| No-ads + hint pack, season pass | IAP | not built |

Rewarded first: the jam offer is a natural "so close" moment. Keep interstitials light until D1 is proven.

## KPIs to test
- **Marketability (pre-production):** CPI and **IPM** on US/UK/BR test campaigns vs a generic sort-puzzle benchmark. CTR on the 15 s creative. Target IPM above benchmark before building more content.
- **Retention:** D1 ≥ 40%, D7 ≥ 15% (hybrid-casual bar), session length, levels per session.
- **Funnel:** tutorial completion (levels 1–3), per-level start→complete and **fail (jam) rate**, peels used vs par, hint and undo use, and churn spikes by level (difficulty walls).
- **Monetisation:** rewarded views per DAU, jam → ad conversion, ARPDAU, % of payers for no-ads.
- The prototype already emits `level_start / level_complete / level_fail / hint_used / undo / ad_*` events (see `window.__peelEvents`) to rehearse the instrumentation.

## 15 s ad creative
- **0–2 s:** close-up of a jammed street. A thumb pinches a sticker corner and it curls up with a loud rip sound. Text: "Wrong road?"
- **2–7 s:** the sticker lifts and the hidden piece underneath is revealed. A flip in mid-air, a snap and a bounce.
- **7–11 s:** two more quick peels; the last one goes wrong and causes a near-fail "traffic jam" shake. The thumb undoes it and fixes it.
- **11–14 s:** cars, a tram and water rush along the finished route. Confetti. The district skyline lights up building by building.
- **14–15 s:** end card: "Peel Streets: fix the city one sticker at a time" + Play button.
- Variants to A/B: a fail-first hook (a jam in the first second), an ASMR peel-only cut, and "only 1% can solve this" with a 3-peel puzzle.

## Risks
- The mechanic could feel like a gimmick after 20 levels. Mitigate with new sticker rules per district and watch D7.
- Readability on small screens with 6×7 boards. Watch the misdrop rate.
- Puzzles that feel like trial and error because of hidden stacks. The edge-colour clue and the rubble tip were added for this. Watch fail rate on levels 17–19.
