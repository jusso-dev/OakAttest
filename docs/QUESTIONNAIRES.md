# Questionnaire automation

`/engagements/[id]/questionnaires` turns external security questionnaires into a governed workflow.

## Intake

- Accepted formats: CSV, XLSX, DOCX, and text-based PDF.
- Files are limited to 8 MB and 2,000 extracted questions.
- Importer records source filename, format, SHA-256, declared classification, uploader, due date, and user timezone.
- Classification is checked against the engagement before parsing. A workspace cannot accept data above its handling boundary.
- Source files are parsed in memory and are not retained. Questions and source hash are retained for auditability.

## Answer workflow

1. Manager imports and assigns questions.
2. Contributor saves a new answer version with one or more accepted, checksum-verified evidence citations.
3. Burl may draft from accepted RAG chunks. Its output must contain valid source markers and remains a draft.
4. Contributor explicitly submits the latest version.
5. A different authorised reviewer approves it or requests changes.
6. Manager finalises only when every latest answer is approved and cited. Finalisation locks the questionnaire.

AI cannot submit, approve, or finalise. Evidence text and questionnaire prompts are treated as untrusted input.
Each citation snapshots filename and SHA-256; RAG citations also retain chunk number and excerpt.

## Export

CSV export includes answer status/version/source, citations, assignment, review notes, and timestamps rendered in
the requesting user's saved IANA timezone. Formula-leading spreadsheet cells are escaped. Every export is audited.
