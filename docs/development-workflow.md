# Development workflow

Fleet GPS uses trunk-based development with short-lived branches. `main` is the stable integration branch and is not a normal working branch; normal changes must not be committed or pushed directly to it.

## Branches

Refresh local `main`, then create a focused branch from the current `main`. Use one of these branch prefixes:

- `feat/<short-description>`
- `fix/<short-description>`
- `refactor/<short-description>`
- `docs/<short-description>`
- `chore/<short-description>`

Keep branches short-lived and keep unrelated changes in separate branches and pull requests.

## Pull requests and validation

Every normal change targets `main` through a concise pull request. Required GitHub CI must pass before merge.

User-facing or visual work requires human visual acceptance before merge. Backend and tooling work requires tests and review appropriate to its risk and scope. A pull request should explain what changed, why it changed, and how it was validated.

## Merge policy

Use **Squash and merge** only. The pull request title becomes the resulting commit on `main`, so it should describe that outcome. Use this title grammar:

- `feat: ...`
- `fix: ...`
- `refactor: ...`
- `docs: ...`
- `chore: ...`

Intermediate commits on a branch do not all need perfect Conventional Commit titles because the pull request is squashed.

After merge, delete the branch, refresh local `main` from `origin/main`, and create the next branch from that updated `main`.

## Releases and hotfixes

Create release tags only from `main`, never from a feature branch. A GitHub Release records a repository release; it does not imply production deployment.

Hotfixes follow the same workflow: a `fix/...` branch, pull request, required CI, and squash merge. A direct push to `main` is reserved for an exceptional repository-recovery situation and is not part of normal development.

No `develop` or long-lived release branches are used.
