# Evaluation report

## Overall

| arm | runs | success | score | in tok | cache read | out tok | cost | tools |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| compression-off | 30 | 100% | 1.00 | 8977 | 4868 | 13 | $0.00215 | 0.0 |
| compression-keep-0 | 30 | 100% | 1.00 | 4230 | 1677 | 58 | $0.00128 | 1.0 |
| compression-prefetch-keep-0 | 30 | 100% | 1.00 | 2434 | 538 | 13 | $0.00083 | 0.0 |
| compression-prefetch-keep-1 | 30 | 100% | 1.00 | 5606 | 1399 | 13 | $0.00184 | 0.0 |

## compression-recent-attachment

| arm | runs | success | score | history est. before→after | summarized | in tok | cache read | out tok | cost | tools | turns | setup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| compression-off | 5 | 100% | 1.00 | 7323→7323 | 0.0 | 7510 | 0 | 7 | $0.00302 | 0.0 | 1.0 | — |
| compression-keep-0 | 5 | 100% | 1.00 | 7325→805 | 1.0 | 2766 | 1280 | 47 | $0.00080 | 1.0 | 1.0 | — |
| compression-prefetch-keep-0 | 5 | 100% | 1.00 | 7324→920 | 1.0 | 1448 | 0 | 8 | $0.00059 | 0.0 | 1.0 | — |
| compression-prefetch-keep-1 | 5 | 100% | 1.00 | 7325→7325 | 0.0 | 7859 | 0 | 8 | $0.00316 | 0.0 | 1.0 | — |

### compression-keep-0 vs compression-off

- cost per conversation: ▼ $-0.00222 (-74%) — 95% CI [$-0.00222, $-0.00221]
- input tokens per conversation: ▼ -4744 (-63%) — 95% CI [-4754, -4733]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.00222 saved per conversation

### compression-prefetch-keep-0 vs compression-off

- cost per conversation: ▼ $-0.00242 (-80%) — 95% CI [$-0.00243, $-0.00242]
- input tokens per conversation: ▼ -6062 (-81%) — 95% CI [-6068, -6056]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.00242 saved per conversation

### compression-prefetch-keep-1 vs compression-off

- cost per conversation: ▲ $0.00014 (+5%) — 95% CI [$0.00014, $0.00014]
- input tokens per conversation: ▲ 349 (+5%) — 95% CI [346, 352]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: never — this arm costs $0.00014 more per conversation, before its $0 of indexing

## compression-middle-attachment

| arm | runs | success | score | history est. before→after | summarized | in tok | cache read | out tok | cost | tools | turns | setup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| compression-off | 5 | 100% | 1.00 | 7637→7637 | 0.0 | 7844 | 0 | 28 | $0.00318 | 0.0 | 1.0 | — |
| compression-keep-0 | 5 | 100% | 1.00 | 7635→1421 | 1.0 | 4036 | 1152 | 63 | $0.00137 | 1.0 | 1.0 | — |
| compression-prefetch-keep-0 | 5 | 100% | 1.00 | 7635→1522 | 1.0 | 2073 | 0 | 25 | $0.00087 | 0.0 | 1.0 | — |
| compression-prefetch-keep-1 | 5 | 100% | 1.00 | 7634→1520 | 1.0 | 2073 | 0 | 27 | $0.00087 | 0.0 | 1.0 | — |

### compression-keep-0 vs compression-off

- cost per conversation: ▼ $-0.00181 (-57%) — 95% CI [$-0.00204, $-0.00158]
- input tokens per conversation: ▼ -3808 (-49%) — 95% CI [-3818, -3800]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.00181 saved per conversation

### compression-prefetch-keep-0 vs compression-off

- cost per conversation: ▼ $-0.00231 (-73%) — 95% CI [$-0.00232, $-0.00231]
- input tokens per conversation: ▼ -5771 (-74%) — 95% CI [-5776, -5766]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.00231 saved per conversation

### compression-prefetch-keep-1 vs compression-off

- cost per conversation: ▼ $-0.00231 (-73%) — 95% CI [$-0.00231, $-0.00231]
- input tokens per conversation: ▼ -5772 (-74%) — 95% CI [-5777, -5767]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.00231 saved per conversation

## compression-recent-assistant

| arm | runs | success | score | history est. before→after | summarized | in tok | cache read | out tok | cost | tools | turns | setup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| compression-off | 5 | 100% | 1.00 | 6926→6926 | 0.0 | 7113 | 5530 | 5 | $0.00119 | 0.0 | 1.0 | — |
| compression-keep-0 | 5 | 100% | 1.00 | 6926→670 | 1.0 | 2516 | 922 | 49 | $0.00081 | 1.0 | 1.0 | — |
| compression-prefetch-keep-0 | 5 | 100% | 1.00 | 6926→712 | 1.0 | 1254 | 0 | 6 | $0.00051 | 0.0 | 1.0 | — |
| compression-prefetch-keep-1 | 5 | 100% | 1.00 | 6926→6926 | 0.0 | 7462 | 5837 | 6 | $0.00124 | 0.0 | 1.0 | — |

### compression-keep-0 vs compression-off

- cost per conversation: ▼ $-0.00039 (-32%) — not separable at this sample size — 95% CI [$-0.00121, $0.00010] includes 0
- input tokens per conversation: ▼ -4597 (-65%) — 95% CI [-4598, -4596]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.00039 saved per conversation

### compression-prefetch-keep-0 vs compression-off

- cost per conversation: ▼ $-0.00068 (-57%) — 95% CI [$-0.00151, $-0.00027]
- input tokens per conversation: ▼ -5859 (-82%) — 95% CI [-5859, -5859]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.00068 saved per conversation

### compression-prefetch-keep-1 vs compression-off

- cost per conversation: ▲ $0.00005 (+4%) — not separable at this sample size — 95% CI [$-0.00080, $0.00095] includes 0
- input tokens per conversation: ▲ 349 (+5%) — 95% CI [349, 349]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: never — this arm costs $0.00005 more per conversation, before its $0 of indexing

## compression-far-tool-output

| arm | runs | success | score | history est. before→after | summarized | in tok | cache read | out tok | cost | tools | turns | setup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| compression-off | 5 | 100% | 1.00 | 9539→9539 | 0.0 | 9648 | 9472 | 8 | $0.00103 | 0.0 | 1.0 | — |
| compression-keep-0 | 5 | 100% | 1.00 | 9539→3297 | 1.0 | 7892 | 4608 | 59 | $0.00187 | 1.0 | 1.0 | — |
| compression-prefetch-keep-0 | 5 | 100% | 1.00 | 9539→3330 | 1.0 | 3934 | 1536 | 9 | $0.00113 | 0.0 | 1.0 | — |
| compression-prefetch-keep-1 | 5 | 100% | 1.00 | 9539→3330 | 1.0 | 3934 | 1536 | 9 | $0.00113 | 0.0 | 1.0 | — |

### compression-keep-0 vs compression-off

- cost per conversation: ▲ $0.00084 (+81%) — 95% CI [$0.00014, $0.00154]
- input tokens per conversation: ▼ -1756 (-18%) — 95% CI [-1756, -1756]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: never — this arm costs $0.00084 more per conversation, before its $0 of indexing

### compression-prefetch-keep-0 vs compression-off

- cost per conversation: ▲ $0.00010 (+9%) — not separable at this sample size — 95% CI [$-0.00036, $0.00056] includes 0
- input tokens per conversation: ▼ -5714 (-59%) — 95% CI [-5714, -5714]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: never — this arm costs $0.00010 more per conversation, before its $0 of indexing

### compression-prefetch-keep-1 vs compression-off

- cost per conversation: ▲ $0.00010 (+9%) — not separable at this sample size — 95% CI [$-0.00036, $0.00056] includes 0
- input tokens per conversation: ▼ -5714 (-59%) — 95% CI [-5714, -5714]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: never — this arm costs $0.00010 more per conversation, before its $0 of indexing

## compression-irrelevant-old-bulk

| arm | runs | success | score | history est. before→after | summarized | in tok | cache read | out tok | cost | tools | turns | setup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| compression-off | 5 | 100% | 1.00 | 9234→9234 | 0.0 | 9329 | 9216 | 4 | $0.00097 | 0.0 | 1.0 | — |
| compression-keep-0 | 5 | 100% | 1.00 | 9234→2864 | 1.0 | 3455 | 0 | 5 | $0.00139 | 0.0 | 1.0 | — |
| compression-prefetch-keep-0 | 5 | 100% | 1.00 | 9234→2897 | 1.0 | 3487 | 1331 | 5 | $0.00100 | 0.0 | 1.0 | — |
| compression-prefetch-keep-1 | 5 | 100% | 1.00 | 9234→2897 | 1.0 | 3487 | 666 | 5 | $0.00120 | 0.0 | 1.0 | — |

### compression-keep-0 vs compression-off

- cost per conversation: ▲ $0.00042 (+43%) — 95% CI [$0.00042, $0.00042]
- input tokens per conversation: ▼ -5874 (-63%) — 95% CI [-5874, -5874]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: never — this arm costs $0.00042 more per conversation, before its $0 of indexing

### compression-prefetch-keep-0 vs compression-off

- cost per conversation: ▲ $0.00003 (+3%) — not separable at this sample size — 95% CI [$-0.00037, $0.00043] includes 0
- input tokens per conversation: ▼ -5842 (-63%) — 95% CI [-5842, -5842]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: never — this arm costs $0.00003 more per conversation, before its $0 of indexing

### compression-prefetch-keep-1 vs compression-off

- cost per conversation: ▲ $0.00023 (+24%) — not separable at this sample size — 95% CI [$-0.00017, $0.00043] includes 0
- input tokens per conversation: ▼ -5842 (-63%) — 95% CI [-5842, -5842]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: never — this arm costs $0.00023 more per conversation, before its $0 of indexing

## compression-mixed-depth

| arm | runs | success | score | history est. before→after | summarized | in tok | cache read | out tok | cost | tools | turns | setup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| compression-off | 5 | 100% | 1.00 | 12220→12220 | 0.0 | 12417 | 4992 | 24 | $0.00351 | 0.0 | 1.0 | — |
| compression-keep-0 | 5 | 100% | 1.00 | 12218→1728 | 2.0 | 4713 | 2099 | 123 | $0.00145 | 2.0 | 1.0 | — |
| compression-prefetch-keep-0 | 5 | 100% | 1.00 | 12219→1871 | 2.0 | 2410 | 358 | 25 | $0.00090 | 0.0 | 1.0 | — |
| compression-prefetch-keep-1 | 5 | 100% | 1.00 | 12219→8278 | 1.0 | 8824 | 358 | 26 | $0.00346 | 0.0 | 1.0 | — |

### compression-keep-0 vs compression-off

- cost per conversation: ▼ $-0.00206 (-59%) — 95% CI [$-0.00240, $-0.00169]
- input tokens per conversation: ▼ -7703 (-62%) — 95% CI [-7709, -7698]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.00206 saved per conversation

### compression-prefetch-keep-0 vs compression-off

- cost per conversation: ▼ $-0.00261 (-74%) — 95% CI [$-0.00283, $-0.00250]
- input tokens per conversation: ▼ -10007 (-81%) — 95% CI [-10013, -10000]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.00261 saved per conversation

### compression-prefetch-keep-1 vs compression-off

- cost per conversation: ▼ $-0.00004 (-1%) — not separable at this sample size — 95% CI [$-0.00026, $0.00006] includes 0
- input tokens per conversation: ▼ -3593 (-29%) — 95% CI [-3596, -3590]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.00004 saved per conversation
