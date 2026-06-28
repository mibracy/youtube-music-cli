# Makefile for youtube-music-cli
# Wraps Bun/npm scripts for convenience.

.PHONY: help install dev dev-watch prebuild build build-all start test test-file format format-check lint lint-fix typecheck clean build-web dev-web

help: ## Show this help message
	@grep -E '^[a-zA-Z0-9_-]+:.*##' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?##"}; {printf "  %-15s %s\n", $$1, $$2}'

install: ## Install dependencies with Bun
	bun install

dev: ## Run the CLI in development mode
	bun run dev

dev-watch: ## Run the CLI in development watch mode
	bun run dev:watch

prebuild: ## Run format, lint:fix, and typecheck (matches package.json prebuild)
	bun run format && bun run lint:fix && bun run typecheck

build: typecheck ## Build the CLI binary to dist/source/cli.js
	bun build source/cli.tsx --outfile dist/source/cli.js --target bun --footer "//Copyright (c) 2026 involvex" --production

build-all: build build-web ## Build the CLI and the web UI

start: ## Run the built CLI binary
	bun run start

test: ## Run the full test suite (build + AVA)
	bun run test

test-file: ## Run a specific test file (set FILE=tests/<file>.test.js)
	bunx ava $(FILE)

format: ## Format code with Prettier
	bun run format

format-check: ## Check formatting without modifying files
	bun run format:check

lint: ## Lint code with ESLint
	bun run lint

lint-fix: ## Fix linting issues automatically
	bun run lint:fix

typecheck: ## Type-check without emitting
	bun run typecheck

clean: ## Remove the dist/ directory
	bun run clean

build-web: ## Build the web UI
	bun run build:web

dev-web: ## Run the web UI dev server
	bun run dev:web
