# IncidentPilot frontend

Next.js 14 (app router), TypeScript, Tailwind. Built from the project DPR.

    npm install
    npm run dev        # http://localhost:3000

With no env set it connects to the hosted IncidentPilot API.
Try: INC-2041, Investigate, click an evidence chip, Review fix, Approve and run.
Left column, Demo controls: trigger the failure, make the next investigation fail (error and retry path), reset.

## Using the real FastAPI backend

    cp .env.example .env.local     # optionally set NEXT_PUBLIC_API_URL, restart dev server

lib/api.ts is the only file that knows URLs. It uses the DPR endpoints:
GET /api/incidents, GET /api/incidents/{id}, GET /api/incidents/{id}/logs, POST /api/incidents/{id}/investigate,
GET /api/investigations/{id}, POST /api/incidents/{id}/remediations/{action_id}/approve, POST /api/demo/reset.

The backend exposes GET /api/incidents, GET /api/incidents/{id}/logs, and POST /api/incidents/{id}/remediations/{action_id}/approve in addition to the investigation routes. GET /api/incidents/{id} returns latest_investigation_id, audit_events, metrics
({name, series, tail, threshold}) and recovery_note. If your backend differs, change getBundle() in lib/api.ts.
The UI polls every 2 s while connected (SSE is a P1 item in the DPR; add it later if needed).
