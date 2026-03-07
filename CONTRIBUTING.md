# Contributing to omni-link

## Development Setup

```bash
git clone https://github.com/Sebdysart/omni-link.git
cd omni-link
npm install
npm run build
```

## Local Quality Bar

Run these before opening a pull request:

```bash
npm run lint
npm run format:check
npm test
npm run smoke:cli
npm run benchmark:smoke
```

## Commit Convention

- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation changes
- `test:` for tests
- `chore:` for tooling and maintenance

## Pull Requests

- Keep changes scoped to one logical concern.
- Add or update tests for behavior changes.
- Call out cross-repo impact when touching contracts, types, or routes.
