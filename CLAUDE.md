# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ReadytoResizer is a Figma plugin that frames selected images with proper constraints and locked aspect ratios, enabling easy resizing of high-DPI screenshots to logical dimensions. Used for design research and UI verification/QA workflows.

## Build & Development Commands

```bash
npm run build        # Compile code.ts → code.js
npm run watch        # Compile with file watching (dev mode)
npm run lint         # Run ESLint
npm run lint:fix     # Auto-fix ESLint violations
```

After building, reload the plugin manually in Figma Desktop (no hot reload). UI changes to `ui.html` don't require a rebuild.

## Architecture

This is a **Figma plugin** with two isolated runtime contexts that communicate via `postMessage`:

1. **Plugin backend (`code.ts` → `code.js`)** — Runs in Figma's main thread with full Figma API access. Contains all node manipulation logic: filtering image nodes, creating frames, setting constraints, preserving parent hierarchy, and timestamp-based sorting.

2. **Plugin UI (`ui.html`)** — Runs in a sandboxed iframe. Single HTML file with embedded CSS and JavaScript (vanilla, no frameworks). Manages UI state (selection status, success messages) and sends typed messages to the backend.

**Message protocol** uses a discriminated union type (`UIMessage`) with three message types: `ui-ready`, `get-selection`, and `frame-images`.

**Key architectural detail:** When framing images, the plugin preserves the parent container (Sections, Groups) by reinserting frames at the original child index via `parent.insertChild()`. This prevents images from jumping out of their containers.

## Code Conventions

- TypeScript with `strict: true`, targeting ES6
- Discriminated union types for message passing
- Type guard functions for node filtering (e.g., `node is RectangleNode`)
- Unused variables prefixed with `_` (configured in ESLint)
- ESLint extends: `eslint:recommended`, `@typescript-eslint/recommended`, `@figma/figma-plugins/recommended`
- No runtime dependencies — only Figma API and dev tooling
