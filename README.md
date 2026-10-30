# IncidentPilot

IncidentPilot is an AI-assisted incident investigation app with a FastAPI backend and a Next.js dashboard.

## Project structure

- [`backend/`](./backend/) — investigation workflow and API. See [backend setup and API documentation](./backend/README.md).
- [`incidentpilot-dashboard/`](./incidentpilot-dashboard/) — Next.js dashboard. See [dashboard setup](./incidentpilot-dashboard/README.md).

Keep local environment files and raw logs out of Git. Configure the backend with its own `.env` file and use `incidentpilot-dashboard/.env.example` as the frontend configuration template.
