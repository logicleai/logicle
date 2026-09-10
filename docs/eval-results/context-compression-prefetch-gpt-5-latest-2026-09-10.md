# Evaluation report

## Overall

| arm | runs | success | score | in tok | cache read | out tok | cost | tools |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| compression-off | 18 | 100% | 1.00 | 8997 | 4361 | 30 | $0.0105 | 0.0 |
| compression-keep-0 | 18 | 100% | 1.00 | 4741 | 2214 | 84 | $0.00650 | 1.1 |
| compression-prefetch-keep-0 | 18 | 100% | 1.00 | 2472 | 975 | 32 | $0.00357 | 0.0 |
| compression-prefetch-keep-1 | 18 | 100% | 1.00 | 5825 | 1022 | 46 | $0.0104 | 0.1 |

## compression-recent-attachment

| arm | runs | success | score | history est. before→after | summarized | in tok | cache read | out tok | cost | tools | turns | setup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| compression-off | 3 | 100% | 1.00 | 7326→7326 | 0.0 | 7517 | 0 | 23 | $0.0153 | 0.0 | 1.0 | — |
| compression-keep-0 | 3 | 100% | 1.00 | 7322→829 | 1.0 | 2851 | 1372 | 63 | $0.00399 | 1.0 | 1.0 | — |
| compression-prefetch-keep-0 | 3 | 100% | 1.00 | 7321→956 | 1.0 | 1466 | 0 | 24 | $0.00322 | 0.0 | 1.0 | — |
| compression-prefetch-keep-1 | 3 | 100% | 1.00 | 7320→7320 | 0.0 | 7832 | 0 | 26 | $0.0160 | 0.0 | 1.0 | — |

### compression-keep-0 vs compression-off

- cost per conversation: ▼ $-0.01132 (-74%) — 95% CI [$-0.01136, $-0.01128]
- input tokens per conversation: ▼ -4666 (-62%) — 95% CI [-4673, -4659]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.0113 saved per conversation

### compression-prefetch-keep-0 vs compression-off

- cost per conversation: ▼ $-0.01209 (-79%) — 95% CI [$-0.01212, $-0.01205]
- input tokens per conversation: ▼ -6051 (-81%) — 95% CI [-6059, -6039]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.0121 saved per conversation

### compression-prefetch-keep-1 vs compression-off

- cost per conversation: ▲ $0.00067 (+4%) — 95% CI [$0.00059, $0.00076]
- input tokens per conversation: ▲ 315 (+4%) — 95% CI [311, 318]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: never — this arm costs $0.00067 more per conversation, before its $0 of indexing

## compression-middle-attachment

| arm | runs | success | score | history est. before→after | summarized | in tok | cache read | out tok | cost | tools | turns | setup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| compression-off | 3 | 100% | 1.00 | 7636→7636 | 0.0 | 7855 | 0 | 41 | $0.0162 | 0.0 | 1.0 | — |
| compression-keep-0 | 3 | 100% | 1.00 | 7636→1447 | 1.0 | 4134 | 2018 | 76 | $0.00555 | 1.0 | 1.0 | — |
| compression-prefetch-keep-0 | 3 | 100% | 1.00 | 7637→1566 | 1.0 | 2103 | 0 | 31 | $0.00458 | 0.0 | 1.0 | — |
| compression-prefetch-keep-1 | 3 | 100% | 1.00 | 7634→1560 | 1.0 | 2101 | 0 | 45 | $0.00474 | 0.0 | 1.0 | — |

### compression-keep-0 vs compression-off

- cost per conversation: ▼ $-0.01065 (-66%) — 95% CI [$-0.01070, $-0.01061]
- input tokens per conversation: ▼ -3721 (-47%) — 95% CI [-3737, -3709]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.0106 saved per conversation

### compression-prefetch-keep-0 vs compression-off

- cost per conversation: ▼ $-0.01162 (-72%) — 95% CI [$-0.01170, $-0.01149]
- input tokens per conversation: ▼ -5752 (-73%) — 95% CI [-5754, -5750]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.0116 saved per conversation

### compression-prefetch-keep-1 vs compression-off

- cost per conversation: ▼ $-0.01146 (-71%) — 95% CI [$-0.01152, $-0.01142]
- input tokens per conversation: ▼ -5754 (-73%) — 95% CI [-5760, -5748]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.0115 saved per conversation

## compression-recent-assistant

| arm | runs | success | score | history est. before→after | summarized | in tok | cache read | out tok | cost | tools | turns | setup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| compression-off | 3 | 100% | 1.00 | 6926→6926 | 0.0 | 7118 | 7115 | 22 | $0.00169 | 0.0 | 1.0 | — |
| compression-keep-0 | 3 | 100% | 1.00 | 6926→683 | 1.0 | 2585 | 1236 | 66 | $0.00374 | 1.0 | 1.0 | — |
| compression-prefetch-keep-0 | 3 | 100% | 1.00 | 6926→740 | 1.0 | 1266 | 842 | 18 | $0.00124 | 0.0 | 1.0 | — |
| compression-prefetch-keep-1 | 3 | 100% | 1.00 | 6926→6926 | 0.0 | 7438 | 4957 | 23 | $0.00623 | 0.0 | 1.0 | — |

### compression-keep-0 vs compression-off

- cost per conversation: ▲ $0.00204 (+121%) — 95% CI [$0.00203, $0.00206]
- input tokens per conversation: ▼ -4533 (-64%) — 95% CI [-4534, -4533]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: never — this arm costs $0.00204 more per conversation, before its $0 of indexing

### compression-prefetch-keep-0 vs compression-off

- cost per conversation: ▼ $-0.00046 (-27%) — not separable at this sample size — 95% CI [$-0.00117, $0.00093] includes 0
- input tokens per conversation: ▼ -5852 (-82%) — 95% CI [-5852, -5852]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.00046 saved per conversation

### compression-prefetch-keep-1 vs compression-off

- cost per conversation: ▲ $0.00453 (+268%) — 95% CI [$0.00004, $0.0135]
- input tokens per conversation: ▲ 320 (+4%) — 95% CI [320, 320]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: never — this arm costs $0.00453 more per conversation, before its $0 of indexing

## compression-far-tool-output

| arm | runs | success | score | history est. before→after | summarized | in tok | cache read | out tok | cost | tools | turns | setup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| compression-off | 3 | 100% | 1.00 | 9539→9539 | 0.0 | 9689 | 9686 | 25 | $0.00225 | 0.0 | 1.0 | — |
| compression-keep-0 | 3 | 100% | 1.00 | 9539→3317 | 1.0 | 8040 | 3968 | 70 | $0.00978 | 1.0 | 1.0 | — |
| compression-prefetch-keep-0 | 3 | 100% | 1.00 | 9539→3365 | 1.0 | 3983 | 2653 | 27 | $0.00351 | 0.0 | 1.0 | — |
| compression-prefetch-keep-1 | 3 | 100% | 1.00 | 9539→3365 | 1.0 | 3983 | 0 | 30 | $0.00832 | 0.0 | 1.0 | — |

### compression-keep-0 vs compression-off

- cost per conversation: ▲ $0.00754 (+335%) — 95% CI [$0.00751, $0.00756]
- input tokens per conversation: ▼ -1649 (-17%) — 95% CI [-1650, -1646]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: never — this arm costs $0.00754 more per conversation, before its $0 of indexing

### compression-prefetch-keep-0 vs compression-off

- cost per conversation: ▲ $0.00127 (+56%) — not separable at this sample size — 95% CI [$-0.00113, $0.00603] includes 0
- input tokens per conversation: ▼ -5706 (-59%) — 95% CI [-5706, -5706]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: never — this arm costs $0.00127 more per conversation, before its $0 of indexing

### compression-prefetch-keep-1 vs compression-off

- cost per conversation: ▲ $0.00607 (+270%) — 95% CI [$0.00585, $0.00628]
- input tokens per conversation: ▼ -5706 (-59%) — 95% CI [-5706, -5706]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: never — this arm costs $0.00607 more per conversation, before its $0 of indexing

## compression-irrelevant-old-bulk

| arm | runs | success | score | history est. before→after | summarized | in tok | cache read | out tok | cost | tools | turns | setup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| compression-off | 3 | 100% | 1.00 | 9234→9234 | 0.0 | 9365 | 9362 | 23 | $0.00215 | 0.0 | 1.0 | — |
| compression-keep-0 | 3 | 100% | 1.00 | 9234→2884 | 1.0 | 5931 | 2344 | 97 | $0.00881 | 0.7 | 1.0 | — |
| compression-prefetch-keep-0 | 3 | 100% | 1.00 | 9234→2932 | 1.0 | 3531 | 2352 | 26 | $0.00314 | 0.0 | 1.0 | — |
| compression-prefetch-keep-1 | 3 | 100% | 1.00 | 9234→2932 | 1.0 | 4744 | 1176 | 74 | $0.00826 | 0.3 | 1.0 | — |

### compression-keep-0 vs compression-off

- cost per conversation: ▲ $0.00666 (+309%) — 95% CI [$0.00515, $0.00749]
- input tokens per conversation: ▼ -3434 (-37%) — 95% CI [-5846, -2228]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: never — this arm costs $0.00666 more per conversation, before its $0 of indexing

### compression-prefetch-keep-0 vs compression-off

- cost per conversation: ▲ $0.00098 (+46%) — not separable at this sample size — 95% CI [$-0.00116, $0.00520] includes 0
- input tokens per conversation: ▼ -5834 (-62%) — 95% CI [-5834, -5834]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: never — this arm costs $0.00098 more per conversation, before its $0 of indexing

### compression-prefetch-keep-1 vs compression-off

- cost per conversation: ▲ $0.00611 (+284%) — 95% CI [$0.00518, $0.00791]
- input tokens per conversation: ▼ -4621 (-49%) — 95% CI [-5834, -2196]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: never — this arm costs $0.00611 more per conversation, before its $0 of indexing

## compression-mixed-depth

| arm | runs | success | score | history est. before→after | summarized | in tok | cache read | out tok | cost | tools | turns | setup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| compression-off | 3 | 100% | 1.00 | 12218→12218 | 0.0 | 12438 | 0 | 48 | $0.0255 | 0.0 | 1.0 | — |
| compression-keep-0 | 3 | 100% | 1.00 | 12219→1774 | 2.0 | 4905 | 2349 | 131 | $0.00716 | 2.0 | 1.0 | — |
| compression-prefetch-keep-0 | 3 | 100% | 1.00 | 12219→1946 | 2.0 | 2485 | 0 | 64 | $0.00574 | 0.0 | 1.0 | — |
| compression-prefetch-keep-1 | 3 | 100% | 1.00 | 12219→8313 | 1.0 | 8851 | 0 | 75 | $0.0186 | 0.0 | 1.0 | — |

### compression-keep-0 vs compression-off

- cost per conversation: ▼ $-0.01830 (-72%) — 95% CI [$-0.01843, $-0.01820]
- input tokens per conversation: ▼ -7533 (-61%) — 95% CI [-7543, -7524]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.0183 saved per conversation

### compression-prefetch-keep-0 vs compression-off

- cost per conversation: ▼ $-0.01972 (-77%) — 95% CI [$-0.01993, $-0.01952]
- input tokens per conversation: ▼ -9953 (-80%) — 95% CI [-9958, -9950]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.0197 saved per conversation

### compression-prefetch-keep-1 vs compression-off

- cost per conversation: ▼ $-0.00685 (-27%) — 95% CI [$-0.00698, $-0.00673]
- input tokens per conversation: ▼ -3587 (-29%) — 95% CI [-3593, -3581]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.00685 saved per conversation
