Create venv, install deps, then run migrations:

`alembic upgrade head`

Run API:

`uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`

LLM inference is handled by 0G via nextjs API at `http://localhost:3000/api/inference`