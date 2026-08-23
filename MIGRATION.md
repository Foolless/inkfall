# Moving INKFALL into its own repository

This directory is self-contained. Nothing in it imports from, builds with, or depends on
the app that currently surrounds it, and nothing in that app references anything here.
Moving it out is a copy, not a refactor.

Two options. Pick based on whether you care about keeping the commit history.

---

## Option A — keep the history (recommended)

`git subtree split` rewrites just this directory's commits into a standalone branch whose
root is `inkfall/`, then you push that branch to the new empty repo.

```bash
# 1. Create the new repository on GitHub first — empty, no README, no .gitignore,
#    no license. Anything pre-committed there will collide with the pushed history.

# 2. From a clone of the current repo, on the branch holding this work:
git checkout claude/squid-platformer-prd-5unztb
git subtree split --prefix=inkfall -b inkfall-standalone

# 3. Push that branch as the new repo's main:
git push git@github.com:<owner>/inkfall.git inkfall-standalone:main

# 4. Clone the result and confirm the layout is correct — PRD.md should be at
#    docs/PRD.md, not inkfall/docs/PRD.md:
git clone git@github.com:<owner>/inkfall.git /tmp/inkfall-check
ls /tmp/inkfall-check          # README.md  MIGRATION.md  .gitignore  docs/

# 5. Only once step 4 looks right, remove this directory from the original repo:
git rm -r inkfall
git commit -m "Move INKFALL to its own repository"
```

`git subtree split` reads history and writes a new branch; it does not modify your working
tree or the original branch. Step 5 is the only destructive step, which is why it comes
after verification.

## Option B — start clean

If the design history isn't worth carrying:

```bash
mkdir ../inkfall && cp -r inkfall/. ../inkfall/
cd ../inkfall && git init -b main && git add . && git commit -m "INKFALL: initial commit"
git remote add origin git@github.com:<owner>/inkfall.git && git push -u origin main
```

---

## After the move

**Delete this file.** It only describes a migration that has already happened.

Then update the two places that still name the old home:

| File | What to change |
|---|---|
| `README.md` | Remove the "About this directory" section at the bottom |
| `docs/PRD.md` | §16 Resolved, row 6 — replace the migration note with the new repo URL |

## What M1 adds

This repo is currently **documentation only** — by design. The PRD's milestone M1 is what
creates the actual project, and it should add, at the root:

```
package.json        vite + typescript + vitest, zero runtime dependencies
tsconfig.json       strict: true
vite.config.ts
index.html
src/                per the module layout in docs/PRD.md §12.2
```

They are deliberately not scaffolded ahead of time — an empty `package.json` with no source
behind it is clutter that goes stale before anyone runs it. The `.gitignore` here already
covers what that toolchain produces.

## A note on repository settings

Set the new repo's default branch to `main` and leave branch protection off until there is
CI to protect. The PRD (§12.8) specifies typecheck, lint, tests and a bundle-size assertion
on every push — wire that up in M1, then require it.
