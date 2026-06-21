# Vercel Agent

An experiment hooking up a chat UI to **eve** — Vercel's new framework for building agents.

## What's here

- `eve/` — the agent built with the eve framework, connected to the Vercel AI Gateway
- `frontend/` — a Next.js chat UI that talks to the eve agent

## Setup

### Eve agent

The `eve/.env.local` file must point to the Vercel AI Gateway:

```
AI_GATEWAY_API_KEY=<your key>
```

### Frontend

```bash
cd frontend
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000)

This will also launch eve in the background.