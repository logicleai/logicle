# File Analysis As The Single Source Of Truth

## Goal

Make file analysis the only heavy step that understands file structure.
Everything else, especially token estimation and text extraction, should consume its serialized output.

## Target Model

For each uploaded file, analysis produces a serialized artifact with two layers:

- `FileAnalysis.payload` in the database for compact metadata and token-relevant features.
- Optional sidecar text in storage for large extracted text that should not live in the database row.

The artifact should answer these questions without re-parsing the file:

- What kind of file is this?
- What are the structural features needed for token estimation?
- Is there extracted text?
- Where can that text be read from?

## Design Rules

- Token estimation never writes to the database.
- Token estimation may trigger analysis, but only consumes analysis output.
- Text extraction should read analysis output first and fall back to direct extraction only as a compatibility path.
- The pure analyzer should stay buffer-in, artifact-out.
- Persistence concerns stay in the runtime/service layer, not in the pure extractor.

## Serialized Contract

The analysis artifact should carry:

- Stable file kind and analyzer version.
- Size and document structure metadata.
- PDF token features such as `pageCount` and `visionPageCount`.
- A reference to extracted text when present.

For model-specific tokenizers, we should serialize source text or model-agnostic features, not provider-specific token counts.

## Flow

1. File upload completes.
2. Analysis runs once and stores metadata plus optional extracted-text sidecar.
3. Token estimation asks for analysis if needed.
4. Token estimation reads serialized features and extracted text from analysis output.
5. Prompt conversion and knowledge retrieval also read extracted text from analysis output.

## Practical Consequences

- PDFs no longer need to be re-parsed during token estimation when analysis already ran.
- Knowledge/file-to-text conversion can reuse the same extracted text sidecar.
- We keep database rows small while still making analysis the source of truth.
- If we later want zero persisted text, we can swap the sidecar for a lazy text provider without changing callers.

## Next Steps

- Extend the artifact so history token estimation can also resolve prior attached files through analysis-backed features.
- Move more format-specific extraction details behind the analysis contract and reduce direct extractor usage.
- Consider a dedicated `FileAnalysisArtifact` DTO if we want to version sidecar metadata separately from UI-facing analysis payload.
