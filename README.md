# gh-pr-reviewer

`gh-pr-reviewer` is a Next.js app that reviews GitHub pull requests with OpenAI and streams the result back to the browser.

Paste a canonical GitHub PR URL, choose a review focus and mode, and the app will:

- fetch PR metadata and changed files from GitHub
- reject PRs that exceed the current MVP limits
- stream review progress over Server-Sent Events
- return a structured review with a summary, prioritized findings, test gaps, suggested fixes, and coverage metadata

## What it does

The UI is built around a single workflow:

1. Paste a GitHub pull request URL.
2. Preview the PR metadata.
3. Run either a `fast` or `deep` review.
4. Inspect streamed findings grouped by priority.

Supported review focuses:

- `general`
- `bugs`
- `security`
- `tests`

Supported review modes:

- `fast`: quick pass for the highest-risk issues
- `deep`: gathers more supporting context before reviewing

## Requirements

- Node.js 20+
- A GitHub token in `GITHUB_TOKEN`
- An OpenAI API key in `OPENAI_API_KEY`

## Environment variables

Create a local env file:

```bash
cp .env.example .env.local
```

Set the required values:

```bash
GITHUB_TOKEN=your_github_token
OPENAI_API_KEY=your_openai_api_key
```

Optional model overrides:

```bash
OPENAI_MODEL_FAST=gpt-5-mini
OPENAI_MODEL_DEEP=gpt-5.3-codex
```

Legacy fallback:

```bash
OPENAI_MODEL=...
```

Model selection works like this:

- `OPENAI_MODEL_FAST` overrides the fast review model
- `OPENAI_MODEL_DEEP` overrides the deep review model
- `OPENAI_MODEL` is used as a legacy fallback
- otherwise the app defaults to `gpt-5-mini` for fast mode and `gpt-5.3-codex` for deep mode

## Local development

Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## API

### Preview endpoint

`GET /api/review-preview/:owner/:repo/:prNumber`

Returns basic PR metadata used by the landing page preview.

### Review endpoint

`GET /api/review/:owner/:repo/:prNumber?focus=general|bugs|security|tests&mode=fast|deep`

Returns a `text/event-stream` response. The stream emits:

- `stage`
- `pr`
- `comment`
- `test_gap`
- `suggested_fix`
- `summary_delta`
- `complete`
- `error`

Completed reviews are cached in-memory by `owner/repo/pr?focus=...&mode=...` for the lifetime of the server process.

## Current limits

The review pipeline currently rejects pull requests above these thresholds:

- at most `18` changed files
- at most `12` reviewable files after filtering
- at most `900` changed lines
- at most `60,000` diff characters

Deep review also caps how much extra context it pulls in from the repository.

## Notes

- The URL parser only accepts canonical GitHub pull request URLs in the form `https://github.com/{owner}/{repo}/pull/{number}`.
- The landing page currently labels the experience as `Public repos only`.
- GitHub access is entirely determined by the configured token and the repository visibility/permissions behind it.
- Cache storage is process-local and non-persistent.

## Stack

- Next.js App Router
- React 19
- TypeScript
- Vercel AI SDK
- OpenAI
- Octokit
- Tailwind CSS 4
