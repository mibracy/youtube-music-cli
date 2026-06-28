.DEFAULT_GOAL := help

COMPOSE := docker compose -f docker-compose.yml

.PHONY: help build up down logs restart shell diagnose check-env

help:
	@echo "Available targets:"
	@echo "  make build     - Rebuild the bot Docker image"
	@echo "  make up        - Start the bot in the background"
	@echo "  make down      - Stop the bot"
	@echo "  make restart   - Restart the running bot container"
	@echo "  make logs      - Follow bot logs"
	@echo "  make shell     - Open a shell inside the bot container"
	@echo "  make diagnose  - Run health checks inside the container"

check-env:
	@test -f .env || { echo "Missing .env file. Copy .env.example to .env and fill in your credentials."; exit 1; }

build: check-env
	$(COMPOSE) build --no-cache

up: check-env
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

restart:
	$(COMPOSE) restart bot

logs:
	$(COMPOSE) logs -f bot

shell:
	$(COMPOSE) exec bot sh

diagnose:
	$(COMPOSE) exec bot bun run discord-bot/diagnostic.ts
