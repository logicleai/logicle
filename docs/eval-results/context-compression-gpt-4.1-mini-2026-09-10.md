# Evaluation report

## Overall

| arm | runs | success | score | in tok | cache read | out tok | cost | tools |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| compression-off | 30 | 100% | 1.00 | 8974 | 4228 | 18 | $0.00235 | 0.0 |
| compression-keep-0 | 30 | 83% | 0.83 | 8823 | 832 | 54 | $0.00337 | 0.9 |
| compression-keep-1 | 30 | 77% | 0.77 | 7876 | 1148 | 31 | $0.00286 | 0.3 |
| compression-keep-2 | 30 | 77% | 0.77 | 7876 | 1391 | 31 | $0.00278 | 0.3 |
| compression-keep-4 | 30 | 73% | 0.73 | 7492 | 1587 | 29 | $0.00257 | 0.1 |

## compression-recent-attachment

| arm | runs | success | score | history est. before→after | summarized | in tok | cache read | out tok | cost | tools | turns | setup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| compression-off | 5 | 100% | 1.00 | 7326→7326 | 0.0 | 7509 | 0 | 7 | $0.00301 | 0.0 | 1.0 | — |
| compression-keep-0 | 5 | 100% | 1.00 | 7321→678 | 1.0 | 9068 | 614 | 40 | $0.00351 | 1.0 | 1.0 | — |
| compression-keep-1 | 5 | 100% | 1.00 | 7323→7323 | 0.0 | 7762 | 0 | 8 | $0.00312 | 0.0 | 1.0 | — |
| compression-keep-2 | 5 | 100% | 1.00 | 7324→7324 | 0.0 | 7763 | 0 | 8 | $0.00312 | 0.0 | 1.0 | — |
| compression-keep-4 | 5 | 100% | 1.00 | 7323→7323 | 0.0 | 7762 | 0 | 8 | $0.00312 | 0.0 | 1.0 | — |

### compression-keep-0 vs compression-off

- cost per conversation: ▲ $0.00049 (+16%) — 95% CI [$0.00037, $0.00061]
- input tokens per conversation: ▲ 1559 (+21%) — 95% CI [1557, 1560]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: never — this arm costs $0.00049 more per conversation, before its $0 of indexing

### compression-keep-1 vs compression-off

- cost per conversation: ▲ $0.00010 (+3%) — 95% CI [$0.00010, $0.00010]
- input tokens per conversation: ▲ 252 (+3%) — 95% CI [250, 255]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: never — this arm costs $0.00010 more per conversation, before its $0 of indexing

### compression-keep-2 vs compression-off

- cost per conversation: ▲ $0.00010 (+3%) — 95% CI [$0.00010, $0.00010]
- input tokens per conversation: ▲ 254 (+3%) — 95% CI [251, 257]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: never — this arm costs $0.00010 more per conversation, before its $0 of indexing

### compression-keep-4 vs compression-off

- cost per conversation: ▲ $0.00010 (+3%) — 95% CI [$0.00010, $0.00010]
- input tokens per conversation: ▲ 253 (+3%) — 95% CI [250, 256]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: never — this arm costs $0.00010 more per conversation, before its $0 of indexing

## compression-middle-attachment

| arm | runs | success | score | history est. before→after | summarized | in tok | cache read | out tok | cost | tools | turns | setup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| compression-off | 5 | 100% | 1.00 | 7638→7638 | 0.0 | 7843 | 0 | 28 | $0.00318 | 0.0 | 1.0 | — |
| compression-keep-0 | 5 | 40% | 0.40 | 7636→1297 | 1.0 | 5072 | 333 | 43 | $0.00200 | 0.4 | 1.0 | — |
| compression-keep-1 | 5 | 80% | 0.80 | 7633→1295 | 1.0 | 8382 | 333 | 53 | $0.00334 | 0.8 | 1.0 | — |
| compression-keep-2 | 5 | 80% | 0.80 | 7637→1297 | 1.0 | 8384 | 333 | 56 | $0.00334 | 0.8 | 1.0 | — |
| compression-keep-4 | 5 | 100% | 1.00 | 7634→7634 | 0.0 | 8094 | 0 | 27 | $0.00328 | 0.0 | 1.0 | — |

### compression-keep-0 vs compression-off

- cost per conversation: ▼ $-0.00118 (-37%) — not separable at this sample size — 95% CI [$-0.00243, $0.00016] includes 0
- input tokens per conversation: ▼ -2771 (-35%) — not separable at this sample size — 95% CI [-6083, 541] includes 0
- score: ▼ -0.60 (-60%) — 95% CI [-1.00, -0.20]
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.00118 saved per conversation

### compression-keep-1 vs compression-off

- cost per conversation: ▲ $0.00016 (+5%) — not separable at this sample size — 95% CI [$-0.00119, $0.00093] includes 0
- input tokens per conversation: ▲ 539 (+7%) — not separable at this sample size — 95% CI [-2774, 2198] includes 0
- score: ▼ -0.20 (-20%) — not separable at this sample size — 95% CI [-0.60, 0.00] includes 0
- break-even: never — this arm costs $0.00016 more per conversation, before its $0 of indexing

### compression-keep-2 vs compression-off

- cost per conversation: ▲ $0.00016 (+5%) — not separable at this sample size — 95% CI [$-0.00118, $0.00093] includes 0
- input tokens per conversation: ▲ 542 (+7%) — not separable at this sample size — 95% CI [-2772, 2202] includes 0
- score: ▼ -0.20 (-20%) — not separable at this sample size — 95% CI [-0.60, 0.00] includes 0
- break-even: never — this arm costs $0.00016 more per conversation, before its $0 of indexing

### compression-keep-4 vs compression-off

- cost per conversation: ▲ $0.00010 (+3%) — 95% CI [$0.00010, $0.00010]
- input tokens per conversation: ▲ 252 (+3%) — 95% CI [249, 254]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: never — this arm costs $0.00010 more per conversation, before its $0 of indexing

## compression-recent-assistant

| arm | runs | success | score | history est. before→after | summarized | in tok | cache read | out tok | cost | tools | turns | setup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| compression-off | 5 | 100% | 1.00 | 6926→6926 | 0.0 | 7113 | 5530 | 5 | $0.00119 | 0.0 | 1.0 | — |
| compression-keep-0 | 5 | 100% | 1.00 | 6926→605 | 1.0 | 8619 | 0 | 42 | $0.00351 | 1.0 | 1.0 | — |
| compression-keep-1 | 5 | 100% | 1.00 | 6926→6926 | 0.0 | 7367 | 5837 | 6 | $0.00121 | 0.0 | 1.0 | — |
| compression-keep-2 | 5 | 100% | 1.00 | 6926→6926 | 0.0 | 7367 | 5837 | 6 | $0.00121 | 0.0 | 1.0 | — |
| compression-keep-4 | 5 | 100% | 1.00 | 6926→6926 | 0.0 | 7367 | 7296 | 6 | $0.00077 | 0.0 | 1.0 | — |

### compression-keep-0 vs compression-off

- cost per conversation: ▲ $0.00232 (+194%) — 95% CI [$0.00149, $0.00274]
- input tokens per conversation: ▲ 1506 (+21%) — 95% CI [1506, 1506]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: never — this arm costs $0.00232 more per conversation, before its $0 of indexing

### compression-keep-1 vs compression-off

- cost per conversation: ▲ $0.00001 (+1%) — not separable at this sample size — 95% CI [$-0.00084, $0.00091] includes 0
- input tokens per conversation: ▲ 254 (+4%) — 95% CI [254, 254]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: never — this arm costs $0.00001 more per conversation, before its $0 of indexing

### compression-keep-2 vs compression-off

- cost per conversation: ▲ $0.00001 (+1%) — not separable at this sample size — 95% CI [$-0.00084, $0.00091] includes 0
- input tokens per conversation: ▲ 254 (+4%) — 95% CI [254, 254]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: never — this arm costs $0.00001 more per conversation, before its $0 of indexing

### compression-keep-4 vs compression-off

- cost per conversation: ▼ $-0.00043 (-36%) — 95% CI [$-0.00126, $-0.00001]
- input tokens per conversation: ▲ 254 (+4%) — 95% CI [254, 254]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.00043 saved per conversation

## compression-far-tool-output

| arm | runs | success | score | history est. before→after | summarized | in tok | cache read | out tok | cost | tools | turns | setup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| compression-off | 5 | 100% | 1.00 | 9533→9533 | 0.0 | 9642 | 9472 | 20 | $0.00105 | 0.0 | 1.0 | — |
| compression-keep-0 | 5 | 60% | 0.60 | 9533→3221 | 1.0 | 11838 | 3277 | 65 | $0.00386 | 0.8 | 1.0 | — |
| compression-keep-1 | 5 | 80% | 0.80 | 9533→3221 | 1.0 | 11840 | 717 | 63 | $0.00462 | 0.8 | 1.0 | — |
| compression-keep-2 | 5 | 80% | 0.80 | 9533→3221 | 1.0 | 11837 | 2176 | 60 | $0.00418 | 0.8 | 1.0 | — |
| compression-keep-4 | 5 | 40% | 0.40 | 9533→3221 | 1.0 | 9828 | 2227 | 77 | $0.00339 | 0.6 | 1.0 | — |

### compression-keep-0 vs compression-off

- cost per conversation: ▲ $0.00281 (+268%) — 95% CI [$0.00119, $0.00443]
- input tokens per conversation: ▲ 2196 (+23%) — not separable at this sample size — 95% CI [-1862, 4237] includes 0
- score: ▼ -0.40 (-40%) — not separable at this sample size — 95% CI [-0.80, 0.00] includes 0
- break-even: never — this arm costs $0.00281 more per conversation, before its $0 of indexing

### compression-keep-1 vs compression-off

- cost per conversation: ▲ $0.00357 (+341%) — 95% CI [$0.00193, $0.00463]
- input tokens per conversation: ▲ 2198 (+23%) — not separable at this sample size — 95% CI [-1856, 4234] includes 0
- score: ▼ -0.20 (-20%) — not separable at this sample size — 95% CI [-0.60, 0.00] includes 0
- break-even: never — this arm costs $0.00357 more per conversation, before its $0 of indexing

### compression-keep-2 vs compression-off

- cost per conversation: ▲ $0.00313 (+299%) — 95% CI [$0.00171, $0.00416]
- input tokens per conversation: ▲ 2195 (+23%) — not separable at this sample size — 95% CI [-1862, 4236] includes 0
- score: ▼ -0.20 (-20%) — not separable at this sample size — 95% CI [-0.60, 0.00] includes 0
- break-even: never — this arm costs $0.00313 more per conversation, before its $0 of indexing

### compression-keep-4 vs compression-off

- cost per conversation: ▲ $0.00234 (+223%) — 95% CI [$0.00111, $0.00357]
- input tokens per conversation: ▲ 186 (+2%) — not separable at this sample size — 95% CI [-3880, 4251] includes 0
- score: ▼ -0.60 (-60%) — 95% CI [-1.00, -0.20]
- break-even: never — this arm costs $0.00234 more per conversation, before its $0 of indexing

## compression-irrelevant-old-bulk

| arm | runs | success | score | history est. before→after | summarized | in tok | cache read | out tok | cost | tools | turns | setup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| compression-off | 5 | 100% | 1.00 | 9234→9234 | 0.0 | 9329 | 7373 | 4 | $0.00153 | 0.0 | 1.0 | — |
| compression-keep-0 | 5 | 100% | 1.00 | 9234→2792 | 1.0 | 3289 | 0 | 5 | $0.00132 | 0.0 | 1.0 | — |
| compression-keep-1 | 5 | 100% | 1.00 | 9234→2792 | 1.0 | 3289 | 0 | 5 | $0.00132 | 0.0 | 1.0 | — |
| compression-keep-2 | 5 | 100% | 1.00 | 9234→2792 | 1.0 | 3289 | 0 | 5 | $0.00132 | 0.0 | 1.0 | — |
| compression-keep-4 | 5 | 100% | 1.00 | 9234→2792 | 1.0 | 3289 | 0 | 5 | $0.00132 | 0.0 | 1.0 | — |

### compression-keep-0 vs compression-off

- cost per conversation: ▼ $-0.00020 (-13%) — not separable at this sample size — 95% CI [$-0.00131, $0.00035] includes 0
- input tokens per conversation: ▼ -6040 (-65%) — 95% CI [-6040, -6040]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.00020 saved per conversation

### compression-keep-1 vs compression-off

- cost per conversation: ▼ $-0.00020 (-13%) — not separable at this sample size — 95% CI [$-0.00131, $0.00035] includes 0
- input tokens per conversation: ▼ -6040 (-65%) — 95% CI [-6040, -6040]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.00020 saved per conversation

### compression-keep-2 vs compression-off

- cost per conversation: ▼ $-0.00020 (-13%) — not separable at this sample size — 95% CI [$-0.00131, $0.00035] includes 0
- input tokens per conversation: ▼ -6040 (-65%) — 95% CI [-6040, -6040]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.00020 saved per conversation

### compression-keep-4 vs compression-off

- cost per conversation: ▼ $-0.00020 (-13%) — not separable at this sample size — 95% CI [$-0.00131, $0.00035] includes 0
- input tokens per conversation: ▼ -6040 (-65%) — 95% CI [-6040, -6040]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.00020 saved per conversation

## compression-mixed-depth

| arm | runs | success | score | history est. before→after | summarized | in tok | cache read | out tok | cost | tools | turns | setup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| compression-off | 5 | 100% | 1.00 | 12213→12213 | 0.0 | 12411 | 2995 | 45 | $0.00414 | 0.0 | 1.0 | — |
| compression-keep-0 | 5 | 100% | 1.00 | 12212→1528 | 2.0 | 15054 | 768 | 128 | $0.00600 | 2.0 | 1.0 | — |
| compression-keep-1 | 5 | 0% | 0.00 | 12213→8162 | 1.0 | 8614 | 0 | 52 | $0.00353 | 0.0 | 1.0 | — |
| compression-keep-2 | 5 | 0% | 0.00 | 12211→8160 | 1.0 | 8613 | 0 | 49 | $0.00352 | 0.0 | 1.0 | — |
| compression-keep-4 | 5 | 0% | 0.00 | 12214→8163 | 1.0 | 8614 | 0 | 49 | $0.00352 | 0.0 | 1.0 | — |

### compression-keep-0 vs compression-off

- cost per conversation: ▲ $0.00186 (+45%) — 95% CI [$0.00114, $0.00257]
- input tokens per conversation: ▲ 2643 (+21%) — 95% CI [2639, 2647]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: never — this arm costs $0.00186 more per conversation, before its $0 of indexing

### compression-keep-1 vs compression-off

- cost per conversation: ▼ $-0.00061 (-15%) — 95% CI [$-0.00121, $-0.00001]
- input tokens per conversation: ▼ -3797 (-31%) — 95% CI [-3799, -3795]
- score: ▼ -1.00 (-100%) — 95% CI [-1.00, -1.00]
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.00061 saved per conversation

### compression-keep-2 vs compression-off

- cost per conversation: ▼ $-0.00061 (-15%) — 95% CI [$-0.00121, $-0.00001]
- input tokens per conversation: ▼ -3798 (-31%) — 95% CI [-3801, -3796]
- score: ▼ -1.00 (-100%) — 95% CI [-1.00, -1.00]
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.00061 saved per conversation

### compression-keep-4 vs compression-off

- cost per conversation: ▼ $-0.00061 (-15%) — 95% CI [$-0.00121, $-0.00001]
- input tokens per conversation: ▼ -3797 (-31%) — 95% CI [-3799, -3794]
- score: ▼ -1.00 (-100%) — 95% CI [-1.00, -1.00]
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.00061 saved per conversation
