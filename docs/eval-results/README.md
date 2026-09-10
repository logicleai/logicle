# Evaluation results

Versioned evidence produced by `apps/backend/scripts/eval.ts` may be kept here when it contains
only synthetic or explicitly approved data. Store both the markdown report and its `--runs-out`
artifact so confidence intervals and reports can be regenerated without paying for another run.

Never commit mined production transcripts, drafts, tenant identifiers, or filenames here. The
context-compression reference chats are synthetic anonymized shape fixtures defined in
`apps/backend/lib/eval/scenarios/contextCompression.ts`.

The 2026-09-10 files retain the initial `gpt-4.1-mini` recent-window/tool-retrieval baseline, then
the query-aware prefetch matrices for `gpt-4.1-mini`, `gpt-5-latest`, and
`claude-sonnet-latest`. `context-compression-decision-2026-09-10.md` records the cross-model
decision, production-shape aggregates, and limitations. The focused version-8 Claude regression
captures the search-loop fix discovered while inspecting provider behavior.

Keep each `.runs.json` file with its report; it is the auditable transcript and usage record behind
the aggregate table.
