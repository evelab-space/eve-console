# eve console

Vercel-style front door for eve. Sign in with GitHub (the eve GitHub App's user authorization), pick an
account or organisation where the App is installed, and see its repositories. No database: the user's
GitHub token lives in an encrypted cookie.

Env: `PUBLIC_URL`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_SLUG`, `SESSION_SECRET`
(≥32 chars), `CHAT_URL`. Image: `ghcr.io/<owner>/eve-console:sha-<commit>` built by `.github/workflows/image.yaml`.
