# Evaluation report

## Overall

| arm | runs | success | score | in tok | cache read | out tok | cost | tools |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| compression-prefetch-keep-0 | 6 | 100% | 1.00 | 8257 | 4584 | 178 | $0.0119 | 0.7 |

## compression-recent-assistant

| arm | runs | success | score | history est. before→after | summarized | in tok | cache read | out tok | cost | tools | turns | setup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| compression-prefetch-keep-0 | 3 | 100% | 1.00 | 13248→1172 | 1.0 | 3415 | 1601 | 120 | $0.00606 | 0.3 | 1.0 | — |

## compression-irrelevant-old-bulk

| arm | runs | success | score | history est. before→after | summarized | in tok | cache read | out tok | cost | tools | turns | setup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| compression-prefetch-keep-0 | 3 | 100% | 1.00 | 16377→4812 | 1.0 | 13099 | 7568 | 236 | $0.0177 | 1.0 | 1.0 | — |
