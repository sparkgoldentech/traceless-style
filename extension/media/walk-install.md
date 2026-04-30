# Install traceless-style

Inside your project, run:

```bash
npm install traceless-style
npx traceless-style init
```

`init` writes:
- `app/layout.tsx` — `<TracelessRoot />` + the CSS import
- `package.json` — `dev` / `build` scripts wired to traceless-style
- `traceless-style.config.js` — sane defaults
- `.vscode/extensions.json` — recommends THIS extension to teammates

That's it. Run `npm run dev` and start writing styles.
