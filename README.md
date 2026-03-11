# DocVerify — SSC CGL Document Cross-Verification

> Know if your documents will get you rejected — before it's too late.

Thousands of SSC CGL candidates are disqualified at document verification for minor name mismatches and expired certificates, after clearing both exams and years of preparation. DocVerify uses Claude Vision AI to cross-verify your documents before you submit.

## What it checks

- Name spelling consistency across all documents
- Date of birth format and value match
- Father's name discrepancies
- Category / caste certificate validity
- Certificate expiry dates
- Educational qualification match

## How it works

1. Upload photos of your documents (Aadhaar, marksheets, caste certificate, etc.)
2. Claude Vision extracts identity fields from each document
3. Cross-verifies all fields for consistency
4. Returns a field-by-field report with CRITICAL / WARNING / OK severity
5. Actionable next steps in plain English

## Tech stack

- React 18 + Vite
- Claude Vision API (claude-sonnet-4-20250514)
- Runs entirely in the browser — no backend, no data storage

## Run locally

```bash
npm install
npm run dev
```

You'll need an [Anthropic API key](https://console.anthropic.com) to use the full version. A demo mode is available without a key.

## Context

This is a proof of concept for a larger product vision: an AI-powered government application assistant that guides Indian citizens through complex multi-language bureaucratic processes — understanding deadlines, generating document checklists, verifying completeness, and cross-checking consistency across documents.

Built with Claude Vision API. Designed for millions of Indians navigating government applications in multiple languages.

---

*Built by Anirudh PK · [LinkedIn](https://linkedin.com/in/anirudh-pk-0a5252154)*
