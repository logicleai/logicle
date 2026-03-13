# File Analysis As The Single Source Of Truth

## Goal

Make file analysis the only heavy step that understands file structure.
Text extraction and token counting should consume its output instead of duplicating file parsing work.

## Current Model

For each uploaded file, analysis is split into two layers:

- A pure analyzer that takes `buffer + mimeType` and returns per-format analysis data plus optional extracted text.
- A runtime layer that persists a serialized analysis payload in `FileAnalysis` and writes extracted text to an optional storage sidecar.

The persisted analysis should answer these questions without re-parsing the file:

- What kind of file is this?
- What are the structural features needed for token estimation?
- Is there extracted text?
- Where can that text be read from?

## Design Rules

- Token estimation never writes to the database.
- Token estimation may trigger analysis, but only consumes analysis output.
- Text extraction should read analysis output first and fall back to direct extraction only when analysis-backed text is unavailable.
- The pure analyzer should stay buffer-in, payload-out.
- Persistence concerns stay in the runtime/service layer, not in the pure extractor.

## Boundaries

The pure analyzer returns:

- Per-format `AnalyzerPayload`
- Optional extracted text

The runtime layer is responsible for:

- Serializing analyzer output into the persisted `FileAnalysis.payload`
- Choosing and writing the extracted-text sidecar path
- Storing sidecar references in the serialized payload
- Warming PDF token-estimation cache entries

## Serialized Contract

`FileAnalysis.payload` remains per-format, and includes:

- Stable file kind and analyzer version
- Size and document structure metadata
- PDF token features such as `pageCount` and `visionPageCount`
- `extractedTextPath` when extracted text has been persisted to storage

For model-specific tokenizers, the system should serialize source text or model-agnostic features, not provider-specific token counts.

## Flow

1. File upload completes.
2. The runtime loads the file and calls the pure analyzer.
3. The runtime stores serialized analysis metadata plus an optional extracted-text sidecar.
4. Token estimation asks for analysis if needed and reads serialized features from it.
5. Text extraction reads analysis-backed extracted text first, then falls back if the sidecar is unavailable.

## Practical Consequences

- PDFs no longer need to be re-parsed during token estimation when analysis already ran.
- Knowledge and file-to-text conversion can reuse the same extracted text sidecar.
- We keep database rows small while still making analysis the source of truth.
- Sidecar read failures are soft failures: callers can fall back instead of failing outright.
