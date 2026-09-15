# CodeVenture Python Lab

CodeVenture Python Lab is a Nuxt 4 migration of the prototype in `ref/`. It provides a browser-based Python workspace with Monaco editing, multi-file projects, Pyodide execution, `input()` support, and step-through debugging.

## Development

Requires Node.js 22.19 or newer.

```bash
npm install
npm run dev
```

The Python runtime and Monaco editor are loaded in the browser only. Project files are persisted locally in `localStorage`.

## Production

```bash
npm run build
npm run preview
```
