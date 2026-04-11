# AgentFlow

AI Workforce Platform — fully local, self-hosted.

## Architecture

- **Backend**: FastAPI + SQLAlchemy + PostgreSQL
- **Frontend**: Next.js 15 + React
- **Auth**: JWT (bcrypt passwords)
- **Storage**: Local filesystem
- **DB**: PostgreSQL + pgvector (for embeddings)

## Quick Start

### 1. Start PostgreSQL

```bash
docker-compose up -d
```

### 2. Install backend dependencies

```bash
cd backend
pip install -e .
```

### 3. Run migrations

```bash
alembic upgrade head
```

### 4. Configure environment

```bash
cp .env.example .env
# Edit .env — set JWT_SECRET
```

### 5. Start backend

```bash
cd ..
python3 -m uvicorn backend.main:app --reload --port 8000
```

### 6. Install frontend dependencies

```bash
cd frontend
npm install
```

### 7. Start frontend

```bash
npm run dev
```

Open http://localhost:3000 and create an account.

## First Steps

1. **Sign up** at /signup
2. **Settings → LLM Providers** → connect your Anthropic/OpenAI/etc API key
3. **Tools → New Integration** — paste API docs, AI generates tools
4. **Agents → New** — create an agent that uses tools
5. **Chat** — describe a task and the orchestrator handles it
