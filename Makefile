# ==============================================================================
# LLM Control Engine — Makefile
# ==============================================================================
# Convenience targets wrapping npm and Docker commands.
# Usage: make <target>
# ==============================================================================

.PHONY: help install build dev test lint format clean docker-build docker-up docker-down release

# Default target
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

# -- Development ---------------------------------------------------------------
install: ## Install all dependencies
	npm ci

build: ## Compile TypeScript
	npm run build:clean

dev: ## Start dev server with hot reload
	npm run dev

# -- Quality -------------------------------------------------------------------
test: ## Run test suite
	npm run test

test-watch: ## Run tests in watch mode
	npm run test:watch

coverage: ## Run tests with coverage report
	npm run test:coverage

lint: ## Lint source and test files
	npm run lint

lint-fix: ## Lint and auto-fix
	npm run lint:fix

format: ## Format all TypeScript files
	npm run format
	
typecheck: ## Run TypeScript type checker
	npm run typecheck

check: lint typecheck test ## Run all quality gates

# -- Docker --------------------------------------------------------------------
docker-build: ## Build production Docker image
	docker build --target production -t llm-engine .

docker-test: ## Run tests inside Docker
	docker build --target test -t llm-engine:test .

docker-up: ## Start docker compose stack (engine + ollama)
	docker compose up -d

docker-down: ## Stop docker compose stack
	docker compose down

docker-logs: ## Tail docker compose logs
	docker compose logs -f

# -- Release -------------------------------------------------------------------
release: check build ## Run all checks then trigger release
	npm run release

pack-dry: ## Preview npm pack contents
	npm pack --dry-run

# -- Cleanup -------------------------------------------------------------------
clean: ## Remove build artifacts and caches
	rm -rf dist coverage reports node_modules/.cache
	@echo "Cleaned build artifacts."

nuke: clean ## Full clean including node_modules
	rm -rf node_modules
	@echo "Nuked node_modules. Run 'make install' to restore."
