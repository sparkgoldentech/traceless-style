# Jump · Find · Rename

Three navigation actions on any `$.btn` style accessor:

| Action | Shortcut | What happens |
|---|---|---|
| Jump to definition | `Ctrl+click` / `F12` | Cursor lands on the `btn:` declaration inside its `tl.create({...})` |
| Find all references | `Shift+F12` | Sidebar shows every `$.btn` in the file |
| Rename atomically | `F2` | Type the new name → renames declaration AND every usage in one undo step |

```ts
const $ = tl.create({
  btn:  { color: "red" },     // ← rename here
  card: { ... },
});

<button className={$.btn} />  // ← gets renamed too
<a       className={$.btn} />  // ← and here
```
