# Contributing to ArchiMate Model API Server

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## How to Contribute

### Reporting Bugs

If you find a bug, please create an issue with:
- A clear, descriptive title
- Steps to reproduce the problem
- Expected vs actual behavior
- Your environment (Archi version, jArchi version, OS)
- Any relevant logs or error messages

### Suggesting Enhancements

Enhancement suggestions are welcome! Please create an issue with:
- A clear description of the feature
- Why it would be useful
- Examples of how it would work
- Any relevant mockups or specifications

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Follow the existing code style** 
   - Use consistent indentation (4 spaces)
   - Add comments for complex logic
   - Follow jArchi/GraalJS best practices
3. **Test your changes** 
   - Verify the server starts correctly
   - Test all affected API endpoints
   - Ensure undo functionality works
4. **Update documentation** 
   - Update README.md if adding features
   - Update openapi.yaml for API changes
   - Add inline code comments
5. **Commit with [Conventional Commits](https://www.conventionalcommits.org/) format**
   - Commits are validated locally by `commitlint` + `husky` — non-conforming messages are rejected
   - Format: `<type>(<optional scope>): <description>`
   - **Types:** `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `ci`, `build`, `style`, `revert`
   - **Examples:**
     ```
     feat: add WebSocket support for real-time updates
     fix: correct rate limit counter reset timing
     docs: update API examples in README
     feat!: redesign query endpoint response format   ← breaking change
     chore: update vitest to v2
     refactor(endpoints): extract shared validation logic
     ```
   - Use `!` after the type/scope to indicate a **breaking change** (triggers major version bump)
   - Include issue references in the body or footer: `Closes #42`
6. **Submit the pull request**
   - Describe what changes you made and why
   - Link to any related issues
   - Merging to `master` triggers **release-please** to open/update a Release PR automatically

## Development Setup

1. Clone the repository to your Archi scripts directory
2. Open an Archi model and view
3. Run "Model API Server" from the Scripts menu
4. Make changes to the code
5. Restart the server to test changes

## Code Structure

- `scripts/Model API Server.ajs` - Main entry point
- `scripts/lib/core/` - Core infrastructure (requires, undo)
- `scripts/lib/server/` - Server implementation
- `scripts/lib/server/endpoints/` - Modular API endpoints
- `context/` - Development documentation

## Testing

Manual testing checklist:
- [ ] Server starts without errors
- [ ] Monitor UI displays correctly
- [ ] `/health` endpoint responds
- [ ] Model queries return correct data
- [ ] Model modifications work and are undoable (Ctrl+Z)
- [ ] View creation and layout works
- [ ] Rate limiting activates correctly
- [ ] Server shutdown is clean

## Questions?

Feel free to ask questions by creating an issue or starting a discussion on the Archi forum.

## Releases

Releases are fully automated via [release-please](https://github.com/googleapis/release-please):

1. **Conventional Commits** drive version bumps:
   - `feat:` → minor version bump (1.1.0 → 1.2.0)
   - `fix:` → patch version bump (1.1.0 → 1.1.1)
   - `feat!:` or `BREAKING CHANGE:` → major version bump (1.1.0 → 2.0.0)
2. When commits land on `master`, release-please opens/updates a **Release PR**
3. The Release PR accumulates changes and auto-generates the changelog
4. **Merging the Release PR** creates a GitHub Release with:
   - Git tag (`v1.2.0`)
   - Auto-generated changelog
   - Downloadable `archi-server-scripts-{version}.zip` archive

You never need to manually edit `CHANGELOG.md`, bump versions, or create tags.

## Code of Conduct

Be respectful, constructive, and professional in all interactions.

---

Thank you for contributing! 🎉
