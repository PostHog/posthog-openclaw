---
'@posthog/openclaw': patch
---

Publish a compiled `dist/` so the package can actually load when installed via `openclaw plugins install @posthog/openclaw`.

The previous release shipped only TypeScript sources (`index.ts` + `src/`). OpenClaw's plugin loader rejects this with:

```
package install requires compiled runtime output for TypeScript entry ./index.ts: expected ./dist/index.js, ./dist/index.mjs, ./dist/index.cjs, ./index.js, ./index.mjs, ./index.cjs
```

Changes:

- Add a `tsconfig.build.json` that emits to `./dist` with declarations and source maps.
- Add a `build` script (`pnpm clean && tsc -p tsconfig.build.json`) and run it from `prepublishOnly`.
- Point `main`, `types`, `exports`, and `openclaw.extensions` at `./dist/index.js`.
- Swap `files` from raw sources to `dist` + `openclaw.plugin.json`.
- Replace the unbundled `rimraf` reference in `clean` with a Node-only one-liner so `pnpm build` works on a fresh checkout without extra devDeps.
