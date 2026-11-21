# Walcer family skin

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
