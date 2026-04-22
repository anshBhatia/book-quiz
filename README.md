# Book Quiz App

A mobile-first Next.js app where a reader searches for a book, selects the right result, and gets a reflective multiple-choice quiz generated with Gemini.

## Setup

```bash
nvm use
npm install
cp .env.example .env.local
```

Add your Gemini key to `.env.local`:

```bash
GEMINI_API_KEY=AIza...
GEMINI_MODEL=gemini-2.5-flash
```

## Run Web App

```bash
npm run dev
```

Open `http://localhost:3000`.

## Phase 1 Script

```bash
npm run phase1
```

## Verify Types

```bash
npm run typecheck
npm run build
```
