# Evaluation report

## Overall

| arm | runs | success | score | in tok | cache read | out tok | cost | tools |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| compression-off | 18 | 100% | 1.00 | 16552 | 5360 | 167 | $0.0307 | 0.0 |
| compression-keep-0 | 18 | 100% | 1.00 | 9460 | 5895 | 193 | $0.0120 | 1.2 |
| compression-prefetch-keep-0 | 18 | 100% | 1.00 | 5825 | 2269 | 86 | $0.0102 | 0.2 |
| compression-prefetch-keep-1 | 18 | 100% | 1.00 | 15697 | 7727 | 182 | $0.0233 | 0.4 |

## compression-recent-attachment

| arm | runs | success | score | history est. before→after | summarized | in tok | cache read | out tok | cost | tools | turns | setup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| compression-off | 3 | 100% | 1.00 | 13173→13173 | 0.0 | 13638 | 0 | 10 | $0.0342 | 0.0 | 1.0 | — |
| compression-keep-0 | 3 | 100% | 1.00 | 13173→1230 | 1.0 | 5450 | 3417 | 136 | $0.00712 | 1.0 | 1.0 | — |
| compression-prefetch-keep-0 | 3 | 100% | 1.00 | 13173→1363 | 1.0 | 2810 | 753 | 10 | $0.00539 | 0.0 | 1.0 | — |
| compression-prefetch-keep-1 | 3 | 100% | 1.00 | 13173→13173 | 0.0 | 14618 | 1129 | 33 | $0.0343 | 0.0 | 1.0 | — |

### compression-keep-0 vs compression-off

- cost per conversation: ▼ $-0.02707 (-79%) — 95% CI [$-0.02809, $-0.02523]
- input tokens per conversation: ▼ -8188 (-60%) — 95% CI [-8191, -8184]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.0271 saved per conversation

### compression-prefetch-keep-0 vs compression-off

- cost per conversation: ▼ $-0.02880 (-84%) — 95% CI [$-0.02967, $-0.02707]
- input tokens per conversation: ▼ -10827 (-79%) — 95% CI [-10829, -10825]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.0288 saved per conversation

### compression-prefetch-keep-1 vs compression-off

- cost per conversation: ▲ $0.00008 (+0%) — not separable at this sample size — 95% CI [$-0.00015, $0.00054] includes 0
- input tokens per conversation: ▲ 980 (+7%) — 95% CI [977, 983]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: never — this arm costs $0.00008 more per conversation, before its $0 of indexing

## compression-middle-attachment

| arm | runs | success | score | history est. before→after | summarized | in tok | cache read | out tok | cost | tools | turns | setup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| compression-off | 3 | 100% | 1.00 | 14034→14034 | 0.0 | 14750 | 0 | 63 | $0.0375 | 0.0 | 1.0 | — |
| compression-keep-0 | 3 | 100% | 1.00 | 14034→2277 | 1.0 | 7692 | 4931 | 187 | $0.00976 | 1.0 | 1.0 | — |
| compression-prefetch-keep-0 | 3 | 100% | 1.00 | 14034→2405 | 1.0 | 3930 | 1129 | 86 | $0.00809 | 0.0 | 1.0 | — |
| compression-prefetch-keep-1 | 3 | 100% | 1.00 | 14034→2405 | 1.0 | 3934 | 1129 | 76 | $0.00800 | 0.0 | 1.0 | — |

### compression-keep-0 vs compression-off

- cost per conversation: ▼ $-0.02775 (-74%) — 95% CI [$-0.02786, $-0.02755]
- input tokens per conversation: ▼ -7058 (-48%) — 95% CI [-7065, -7050]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.0278 saved per conversation

### compression-prefetch-keep-0 vs compression-off

- cost per conversation: ▼ $-0.02942 (-78%) — 95% CI [$-0.02948, $-0.02931]
- input tokens per conversation: ▼ -10820 (-73%) — 95% CI [-10824, -10816]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.0294 saved per conversation

### compression-prefetch-keep-1 vs compression-off

- cost per conversation: ▼ $-0.02951 (-79%) — 95% CI [$-0.02977, $-0.02934]
- input tokens per conversation: ▼ -10816 (-73%) — 95% CI [-10821, -10811]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.0295 saved per conversation

## compression-recent-assistant

| arm | runs | success | score | history est. before→after | summarized | in tok | cache read | out tok | cost | tools | turns | setup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| compression-off | 3 | 100% | 1.00 | 13248→13248 | 0.0 | 13498 | 8997 | 10 | $0.0132 | 0.0 | 1.0 | — |
| compression-keep-0 | 3 | 100% | 1.00 | 13248→1081 | 1.0 | 5020 | 3587 | 137 | $0.00567 | 1.0 | 1.0 | — |
| compression-prefetch-keep-0 | 3 | 100% | 1.00 | 13248→1154 | 1.0 | 3374 | 1956 | 138 | $0.00531 | 0.3 | 1.0 | — |
| compression-prefetch-keep-1 | 3 | 100% | 1.00 | 13248→13248 | 0.0 | 38988 | 34327 | 532 | $0.0238 | 1.7 | 1.0 | — |

### compression-keep-0 vs compression-off

- cost per conversation: ▼ $-0.00748 (-57%) — not separable at this sample size — 95% CI [$-0.02817, $0.00287] includes 0
- input tokens per conversation: ▼ -8478 (-63%) — 95% CI [-8478, -8478]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.00748 saved per conversation

### compression-prefetch-keep-0 vs compression-off

- cost per conversation: ▼ $-0.00784 (-60%) — not separable at this sample size — 95% CI [$-0.02828, $0.00358] includes 0
- input tokens per conversation: ▼ -10124 (-75%) — 95% CI [-11015, -8342]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.00784 saved per conversation

### compression-prefetch-keep-1 vs compression-off

- cost per conversation: ▲ $0.0107 (+81%) — not separable at this sample size — 95% CI [$-0.01001, $0.0279] includes 0
- input tokens per conversation: ▲ 25490 (+189%) — 95% CI [980, 45193]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: never — this arm costs $0.0107 more per conversation, before its $0 of indexing

## compression-far-tool-output

| arm | runs | success | score | history est. before→after | summarized | in tok | cache read | out tok | cost | tools | turns | setup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| compression-off | 3 | 100% | 1.00 | 16593→16593 | 0.0 | 17559 | 11705 | 11 | $0.0171 | 0.0 | 1.0 | — |
| compression-keep-0 | 3 | 100% | 1.00 | 16593→5453 | 1.0 | 14425 | 8292 | 157 | $0.0186 | 1.0 | 1.0 | — |
| compression-prefetch-keep-0 | 3 | 100% | 1.00 | 16593→5511 | 1.0 | 7180 | 1129 | 26 | $0.0156 | 0.0 | 1.0 | — |
| compression-prefetch-keep-1 | 3 | 100% | 1.00 | 16593→5511 | 1.0 | 7180 | 1129 | 26 | $0.0156 | 0.0 | 1.0 | — |

### compression-keep-0 vs compression-off

- cost per conversation: ▲ $0.00147 (+9%) — not separable at this sample size — 95% CI [$-0.02545, $0.0150] includes 0
- input tokens per conversation: ▼ -3134 (-18%) — 95% CI [-3137, -3133]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: never — this arm costs $0.00147 more per conversation, before its $0 of indexing

### compression-prefetch-keep-0 vs compression-off

- cost per conversation: ▼ $-0.00147 (-9%) — not separable at this sample size — 95% CI [$-0.02839, $0.0121] includes 0
- input tokens per conversation: ▼ -10379 (-59%) — 95% CI [-10379, -10379]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.00147 saved per conversation

### compression-prefetch-keep-1 vs compression-off

- cost per conversation: ▼ $-0.00147 (-9%) — not separable at this sample size — 95% CI [$-0.02837, $0.0121] includes 0
- input tokens per conversation: ▼ -10379 (-59%) — 95% CI [-10379, -10379]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.00147 saved per conversation

## compression-irrelevant-old-bulk

| arm | runs | success | score | history est. before→after | summarized | in tok | cache read | out tok | cost | tools | turns | setup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| compression-off | 3 | 100% | 1.00 | 16377→16377 | 0.0 | 17188 | 11457 | 863 | $0.0252 | 0.0 | 1.0 | — |
| compression-keep-0 | 3 | 100% | 1.00 | 16377→4729 | 1.0 | 15158 | 9663 | 290 | $0.0186 | 1.3 | 1.0 | — |
| compression-prefetch-keep-0 | 3 | 100% | 1.00 | 16377→4794 | 1.0 | 13078 | 7521 | 208 | $0.0175 | 1.0 | 1.0 | — |
| compression-prefetch-keep-1 | 3 | 100% | 1.00 | 16377→4794 | 1.0 | 13077 | 7521 | 357 | $0.0190 | 1.0 | 1.0 | — |

### compression-keep-0 vs compression-off

- cost per conversation: ▼ $-0.00668 (-26%) — not separable at this sample size — 95% CI [$-0.02837, $0.00868] includes 0
- input tokens per conversation: ▼ -2030 (-12%) — not separable at this sample size — 95% CI [-4232, 2373] includes 0
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.00668 saved per conversation

### compression-prefetch-keep-0 vs compression-off

- cost per conversation: ▼ $-0.00777 (-31%) — not separable at this sample size — 95% CI [$-0.02944, $0.00759] includes 0
- input tokens per conversation: ▼ -4110 (-24%) — 95% CI [-4110, -4109]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.00777 saved per conversation

### compression-prefetch-keep-1 vs compression-off

- cost per conversation: ▼ $-0.00628 (-25%) — not separable at this sample size — 95% CI [$-0.02755, $0.00908] includes 0
- input tokens per conversation: ▼ -4111 (-24%) — 95% CI [-4114, -4109]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.00628 saved per conversation

## compression-mixed-depth

| arm | runs | success | score | history est. before→after | summarized | in tok | cache read | out tok | cost | tools | turns | setup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| compression-off | 3 | 100% | 1.00 | 21958→21958 | 0.0 | 22678 | 0 | 47 | $0.0572 | 0.0 | 1.0 | — |
| compression-keep-0 | 3 | 100% | 1.00 | 21958→2745 | 2.0 | 9015 | 5478 | 254 | $0.0125 | 2.0 | 1.0 | — |
| compression-prefetch-keep-0 | 3 | 100% | 1.00 | 21958→2938 | 2.0 | 4576 | 1129 | 47 | $0.00931 | 0.0 | 1.0 | — |
| compression-prefetch-keep-1 | 3 | 100% | 1.00 | 21958→14524 | 1.0 | 16384 | 1129 | 67 | $0.0390 | 0.0 | 1.0 | — |

### compression-keep-0 vs compression-off

- cost per conversation: ▼ $-0.04469 (-78%) — 95% CI [$-0.04488, $-0.04444]
- input tokens per conversation: ▼ -13663 (-60%) — 95% CI [-13673, -13652]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.0447 saved per conversation

### compression-prefetch-keep-0 vs compression-off

- cost per conversation: ▼ $-0.04786 (-84%) — 95% CI [$-0.04812, $-0.04760]
- input tokens per conversation: ▼ -18102 (-80%) — 95% CI [-18107, -18097]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.0479 saved per conversation

### compression-prefetch-keep-1 vs compression-off

- cost per conversation: ▼ $-0.01814 (-32%) — 95% CI [$-0.01833, $-0.01789]
- input tokens per conversation: ▼ -6294 (-28%) — 95% CI [-6300, -6288]
- score: = 0.00 (0%) — not separable at this sample size — 95% CI [0.00, 0.00] includes 0
- break-even: 0 conversation(s) — $0 of indexing, repaid at $0.0181 saved per conversation
