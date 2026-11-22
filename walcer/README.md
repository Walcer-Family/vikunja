# Walcer family skin

## Branches

    v2.8.0 (upstream tag)
     ├─ walcer        branding only (this README, art, names, email sender)
     ├─ walcer-viz    dependency graph: project "Graph" view + Dependencies page
     ├─ walcer-tree   indented "Tree" project view
     └─ family        merge of the three  <- what tasks.walcer.family runs

Work on a feature branch, never directly on `family`; then merge into it
(`git checkout family && git merge walcer walcer-viz walcer-tree`). CI builds
`walcer` and `family` to `ghcr.io/walcer-family/vikunja:<branch>-<sha7>`.
Upgrading: rebase each feature branch onto the new tag, then rebuild `family`
from the new tag by merging all three again.

This branch (`walcer`) is upstream Vikunja plus a small, rebase-friendly reskin:

- **Art**: every logo, icon and llama image is replaced *in place* (same
  filename, same pixel size), so upstream code is untouched. Regenerate with
  `cd walcer && node gen.mjs` (needs python3 + fonttools, and Playwright).
  The monogram and wordmark come from Playfair Display (OFL, `fonts/`).
- **Text**: "Vikunja" → "Tasks" in page titles, the PWA name and email
  strings (`pkg/i18n/lang/en.json`); the email sender is "Walcer Tasks".
- **Build**: `.github/workflows/walcer-image.yml` pushes
  `ghcr.io/walcer-family/vikunja:walcer` on every push to this branch.

Rebasing onto a newer release: `git rebase --onto vX.Y.Z v2.8.0 walcer`, then
re-run `node gen.mjs` if upstream changed any image, and fix any conflicts in
`en.json` by re-applying the Vikunja → Tasks rename.
