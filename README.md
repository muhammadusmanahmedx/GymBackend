# GymManager Backend

Minimal NestJS + Mongoose scaffold.

Prereqs:
- Node.js 18+
- npm
- Docker (optional, to run MongoDB)

Quick start:

1. Copy `.env.example` to `.env` and edit if needed.

2. Start MongoDB locally via Docker:

```bash
cd backend
docker-compose up -d
```

3. Install dependencies and run dev server:

```bash
cd backend
npm install
npm run start:dev
```

The server will be available at `http://localhost:3001`.

Notes:
- `src/app.module.ts` uses `MONGO_URI` from environment or falls back to `mongodb://localhost:27017/gymdb`.
- Add modules/schemas as needed for your application.
