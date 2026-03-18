# Contributing to Creator Scout

Thanks for your interest in contributing!

## Getting Started

1. **Fork and clone** the repository
2. **Install dependencies:** `npm install`
3. **Set up environment:** Copy `.env.example` to `.env` and add your credentials (or use `docs/env.example.txt`)
4. **Run tests:** `npm test` (all 505 tests should pass)

## Development Workflow

- Run unit tests: `npm test`
- Run E2E tests: `npm run test:e2e` (requires configured browser/proxy)
- Run with debug logging: `npm run discover -- --debug`

## Submitting Changes

1. Create a branch from `main`
2. Make your changes
3. Ensure tests pass: `npm test`
4. Open a pull request with a clear description of the change

## Code Style

- TypeScript throughout
- Follow existing patterns in the codebase
- Use `npm run test` to verify before submitting
