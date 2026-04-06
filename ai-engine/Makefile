# Grande&Gordo AI Engine - Makefile

.PHONY: help install backend frontend db migrate docker clean

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install all dependencies (backend + frontend)
	@echo "Installing backend dependencies..."
	cd backend && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt
	@echo "Installing frontend dependencies..."
	cd frontend && npm install

backend: ## Start backend server
	cd backend && source venv/bin/activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

worker: ## Start Celery worker
	cd backend && source venv/bin/activate && celery -A app.services.celery_app worker --loglevel=info --pool=solo

frontend: ## Start frontend dev server
	cd frontend && npm run dev

db: ## Start PostgreSQL and Redis with Docker
	docker compose up -d postgres redis
	@echo "Waiting for services to be ready..."
	@sleep 3

db-stop: ## Stop database services
	docker compose down

migrate: ## Run database migrations
	cd backend && source venv/bin/activate && alembic upgrade head

docker: ## Start all services with Docker Compose
	docker compose up -d
	@echo "Services started. Access:"
	@echo "  - Frontend: http://localhost:3000"
	@echo "  - Backend API: http://localhost:8000"
	@echo "  - API Docs: http://localhost:8000/docs"

docker-stop: ## Stop all Docker services
	docker compose down

docker-logs: ## Show logs from all services
	docker compose logs -f

docker-restart: ## Restart all services
	docker compose restart

clean: ## Clean up cache and build artifacts
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type d -name "*.egg-info" -exec rm -rf {} +
	find . -type d -name ".pytest_cache" -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	cd frontend && rm -rf node_modules build dist
	@echo "Cleanup complete"

test: ## Run tests
	cd backend && source venv/bin/activate && pytest -v

test-cov: ## Run tests with coverage
	cd backend && source venv/bin/activate && pytest -v --cov=app --cov-report=html

# Default target
all: docker
