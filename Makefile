.PHONY: help build up down restart logs clean test shell exec health stats

# Variables
CONTAINER_NAME := bun-sandbox
IMAGE_NAME := bun-sandbox
COMPOSE_FILE := docker-compose.yml

# Colors for output
RED := \033[0;31m
GREEN := \033[0;32m
YELLOW := \033[1;33m
NC := \033[0m # No Color

help: ## Show this help message
	@echo "$(GREEN)Bun Sandbox Docker Commands$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-15s$(NC) %s\n", $$1, $$2}'
	@echo ""

build: ## Build the Docker image
	@echo "$(YELLOW)Building Docker image...$(NC)"
	docker compose -f $(COMPOSE_FILE) build
	@echo "$(GREEN)Build complete$(NC)"

build-no-cache: ## Build the Docker image without cache
	@echo "$(YELLOW)Building Docker image (no cache)...$(NC)"
	docker compose -f $(COMPOSE_FILE) build --no-cache
	@echo "$(GREEN)Build complete$(NC)"

up: ## Start the sandbox container
	@echo "$(YELLOW)Starting sandbox container...$(NC)"
	docker compose -f $(COMPOSE_FILE) up -d
	@echo "$(GREEN)Container started$(NC)"
	@$(MAKE) health

down: ## Stop and remove the sandbox container
	@echo "$(YELLOW)Stopping sandbox container...$(NC)"
	docker compose -f $(COMPOSE_FILE) down
	@echo "$(GREEN)Container stopped$(NC)"

restart: ## Restart the sandbox container
	@echo "$(YELLOW)Restarting sandbox container...$(NC)"
	docker compose -f $(COMPOSE_FILE) restart
	@echo "$(GREEN)Container restarted$(NC)"
	@$(MAKE) health

logs: ## Show container logs (follow mode)
	docker compose -f $(COMPOSE_FILE) logs -f

logs-tail: ## Show last 100 lines of logs
	docker compose -f $(COMPOSE_FILE) logs --tail=100

clean: ## Stop container and remove images
	@echo "$(YELLOW)Cleaning up...$(NC)"
	docker compose -f $(COMPOSE_FILE) down -v
	docker rmi $(IMAGE_NAME) 2>/dev/null || true
	@echo "$(GREEN)Cleanup complete$(NC)"

shell: ## Open a shell in the running container
	docker exec -it $(CONTAINER_NAME) /bin/sh

exec: ## Execute a command in the container (usage: make exec CMD="ls -la")
	docker exec -it $(CONTAINER_NAME) $(CMD)

health: ## Check container health
	@echo "$(YELLOW)Checking container health...$(NC)"
	@if docker ps --filter "name=$(CONTAINER_NAME)" --filter "status=running" --format '{{.Names}}' | grep -q $(CONTAINER_NAME); then \
		echo "$(GREEN)Container is running$(NC)"; \
		docker exec $(CONTAINER_NAME) wget --quiet --tries=1 --spider http://localhost:9999/health && \
		echo "$(GREEN)Health check passed$(NC)" || \
		echo "$(RED)Health check failed$(NC)"; \
	else \
		echo "$(RED)Container is not running$(NC)"; \
	fi

stats: ## Show container resource usage
	docker stats $(CONTAINER_NAME) --no-stream

inspect: ## Inspect container configuration
	docker inspect $(CONTAINER_NAME) | jq '.[0]'

ps: ## Show container status
	docker compose -f $(COMPOSE_FILE) ps

test: ## Run a test code snippet
	@echo "$(YELLOW)Running test code...$(NC)"
	./scripts/run-sandbox.sh "console.log('Test from Makefile:', Bun.version)"

test-error: ## Test error handling
	@echo "$(YELLOW)Testing error handling...$(NC)"
	./scripts/run-sandbox.sh "throw new Error('Test error')"

scan: ## Scan image for vulnerabilities
	@echo "$(YELLOW)Scanning image for vulnerabilities...$(NC)"
	docker scan $(IMAGE_NAME) || echo "$(YELLOW)Note: docker scan requires Docker Scout$(NC)"

size: ## Show image size
	@echo "$(YELLOW)Image size:$(NC)"
	@docker images $(IMAGE_NAME) --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"

pull: ## Pull latest base image
	@echo "$(YELLOW)Pulling latest base image...$(NC)"
	docker pull oven/bun:1-alpine
	@echo "$(GREEN)Pull complete$(NC)"

prune: ## Remove unused Docker resources
	@echo "$(YELLOW)Pruning unused Docker resources...$(NC)"
	docker system prune -f
	@echo "$(GREEN)Prune complete$(NC)"

# Development commands
dev: build up ## Build and start for development

dev-rebuild: build-no-cache up ## Rebuild (no cache) and start

watch: ## Watch logs in real-time
	@$(MAKE) logs

# Production commands
prod-build: ## Build for production
	@echo "$(YELLOW)Building for production...$(NC)"
	docker compose -f $(COMPOSE_FILE) build --no-cache
	@echo "$(GREEN)Production build complete$(NC)"

prod-up: prod-build up ## Build and deploy for production

# Security commands
security-check: ## Run security checks
	@echo "$(YELLOW)Running security checks...$(NC)"
	@echo "Checking for non-root user..."
	@docker inspect $(IMAGE_NAME) | jq -r '.[0].Config.User' | grep -q sandbox && \
		echo "$(GREEN)✓ Running as non-root user$(NC)" || \
		echo "$(RED)✗ Not running as non-root user$(NC)"
	@echo "Checking for read-only root filesystem..."
	@docker inspect $(CONTAINER_NAME) | jq -r '.[0].HostConfig.ReadonlyRootfs' | grep -q true && \
		echo "$(GREEN)✓ Read-only root filesystem enabled$(NC)" || \
		echo "$(RED)✗ Read-only root filesystem disabled$(NC)"
	@echo "Checking capabilities..."
	@docker inspect $(CONTAINER_NAME) | jq -r '.[0].HostConfig.CapDrop[]' | grep -q ALL && \
		echo "$(GREEN)✓ All capabilities dropped$(NC)" || \
		echo "$(RED)✗ Not all capabilities dropped$(NC)"

# Info commands
info: ## Show container information
	@echo "$(GREEN)Container Information$(NC)"
	@echo "$(YELLOW)Status:$(NC)"
	@docker ps --filter "name=$(CONTAINER_NAME)" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
	@echo ""
	@echo "$(YELLOW)Resource Usage:$(NC)"
	@docker stats $(CONTAINER_NAME) --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" 2>/dev/null || echo "Container not running"
	@echo ""
	@echo "$(YELLOW)Image Size:$(NC)"
	@docker images $(IMAGE_NAME) --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"
