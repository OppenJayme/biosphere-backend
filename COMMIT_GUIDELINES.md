# Commit Message Guidelines

This document outlines the commit message format and conventions for the frontend project. All team members should follow these guidelines to maintain consistent, readable, and searchable commit history.

## Format

```
<type>(<optional-scope>): <short-description>

<optional-body>
<optional-footer>
```

### Type

Must be one of the following:

| Type | Description | Example |
|------|-------------|---------|
| **feat** | A new feature | `feat: add user authentication module` |
| **fix** | A bug fix | `fix: resolve login timeout issue` |
| **docs** | Documentation changes only | `docs: update API endpoint docs` |
| **style** | Code formatting (whitespace, semicolons, etc.) | `style: format auth module spacing` |
| **refactor** | Code restructuring without feature/fix changes | `refactor: simplify password validation logic` |
| **perf** | Performance improvements | `perf: optimize database query on dashboard` |
| **test** | Adding or updating tests | `test: add unit tests for payment handler` |
| **chore** | Maintenance tasks, dependency updates, build tools | `chore: upgrade React to 19.0` |
| **config** | Configuration file changes | `config: update Claude.md with new context` |
| **ci** | CI/CD pipeline changes | `ci: add GitHub Actions workflow` |

### Scope (Optional)

Scope specifies what part of the codebase the commit affects. Useful for larger projects.

Examples:
- `feat(api):` - API changes
- `feat(components):` - Component changes
- `fix(styles):` - Style fixes
- `chore(deps):` - Dependency updates
- `docs(setup):` - Setup documentation

### Short Description

- Use **imperative mood**: "add" not "added" or "adds"
- **Don't capitalize** the first letter
- **No period** at the end
- Keep under **50 characters**

✅ **Good:**
- `feat: add dark mode toggle`
- `fix: resolve race condition in payment flow`
- `chore: bump TypeScript to 5.3`
- `style: format component spacing`

❌ **Bad:**
- `feat: Added dark mode toggle`
- `fix: Fixed the race condition issue.`
- `chore: Upgrading TypeScript version`
- `WIP: stuff`

## Body (Optional)

Used for longer commits that need explanation.

- Separate from subject with a blank line
- Explain **what** and **why**, not how
- Wrap at 72 characters
- Use bullet points for multiple changes

Example:
```
feat: implement user dashboard

- Add sidebar navigation with collapsible sections
- Create stat cards with real-time data
- Integrate chart library for analytics
- Add dark mode support

This allows users to quickly view key metrics
and customize their dashboard layout.
```

## Footer (Optional)

Use for referencing issues or breaking changes.

```
Closes #456
Refs #123, #124
BREAKING CHANGE: Login endpoint now requires 2FA authentication
```

## Examples

### Simple Feature
```
feat: add two-factor authentication
```

### Bug Fix with Scope
```
fix(auth): resolve JWT expiration on token refresh
```

### Documentation
```
docs: add setup instructions for local development
```

### Dependency Update
```
chore(deps): upgrade React to 19.0
```

### Style/Formatting
```
style: format component imports alphabetically
```

### Refactoring
```
refactor(hooks): extract common state logic into custom hook
```

### Design Skills Installation
```
config: install Claude Code design skills

- Add TasteSkill for design consistency
- Add Web Design Guidelines auditing
- Include ImageToCode for design-to-code conversion
- Setup Playwright CLI for automated testing
```

### Test Addition
```
test: add integration tests for checkout flow

- Test payment form validation
- Test order confirmation email
- Test inventory deduction

Covers edge cases for multi-item orders.
```

## Rules

1. ✅ Use **lowercase** after type and scope
2. ✅ Use **imperative mood** (command form)
3. ✅ **No capitalization** of first letter
4. ✅ **No period** at end of subject line
5. ✅ **One blank line** between subject and body
6. ✅ Keep subject **under 50 characters**
7. ✅ Wrap body text **at 72 characters**
8. ✅ Reference issues when relevant

## Quick Commit Examples by Scenario

### Starting a new feature
```
git commit -m "feat(components): create new Header component"
```

### Fixing a bug discovered in code review
```
git commit -m "fix(hooks): prevent memory leak in useEffect cleanup"
```

### Updating dependencies
```
git commit -m "chore(deps): update ESLint to 8.50.0"
```

### Improving performance
```
git commit -m "perf(images): implement lazy loading for gallery"
```

### Adding tests
```
git commit -m "test(form): add validation tests for email field"
```

### Refactoring code
```
git commit -m "refactor(utils): consolidate helper functions"
```

## Why This Matters

- **Consistency**: Makes history readable and professional
- **Searchability**: `git log --grep="feat"` finds all features; `git log --oneline` stays clean
- **Automation**: Tools like `commitlint`, release generators, and changelog builders rely on this format
- **Context**: Clear messages help future developers understand decisions and intent
- **Tools**: GitHub, Jira, Linear, and deployment systems parse these messages automatically
- **Code Review**: Reviewers can understand what changed without reading the diff

## Git Log Examples

```bash
# View all commits in one line
git log --oneline

# View commits by type
git log --grep="feat" --oneline

# View commits in last 7 days
git log --since="7 days ago" --oneline

# View commits by author
git log --author="Charles" --oneline
```

## Best Practices

- Commit **frequently** (small, logical chunks)
- **Never** use generic messages like "update", "fix stuff", or "WIP"
- **Reference** related issues: `Closes #123`
- **Review your commit** before pushing: `git log -1` or `git show --name-only`
- **Don't be vague**: "Update code" → "refactor(validation): simplify email validation logic"

## Questions?

Reference this document during code review. Ask in Slack or your team channel if you're unsure about a commit type.

---

Last updated: 2026-08-27
