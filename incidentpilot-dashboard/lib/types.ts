// Shapes follow the DPR (sections 6 and 7). Keep in sync with the FastAPI/Pydantic schemas.
export type Severity = "critical" | "high" | "medium";
export type IncidentStatus = "open" | "investigating" | "action_pending" | "monitoring" | "resolved";
export type Level = "INFO" | "WARN" | "ERROR";
export type InvStatus = "queued" | "running" | "completed" | "failed";

export interface Incident {
  id: string; title: string; severity: Severity; status: IncidentStatus;
  service: string; suspect: string; started_at: string; resolved_at?: string;
}
export interface LogEvent {
  id: string; incident_id: string; service: string; timestamp: string; level: Level; message: string;
}
export interface Recommendation {
  action_id: string; title: string; risk: "low" | "medium" | "high"; requires_approval: boolean; description: string;
}
export interface Report {
  summary: string;
  root_cause: { hypothesis: string; confidence: number; evidence_ids: string[] };
  affected_services: string[];
  alternatives: string[];
  recommendations: Recommendation[];
  limitations: string[];
  similar_incidents: { id: string; title: string; note: string }[];
}
export interface Investigation {
  investigation_id: string; incident_id: string; status: InvStatus;
  stage: number; // completed stages, 0 to 4
  duration_s?: number; error?: string; report?: Report;
}
export interface AuditEvent {
  id: string; incident_id: string; created_at: string; event_type: string; actor: string; text: string;
}
export interface Bundle {
  incident: Incident; logs: LogEvent[]; audit: AuditEvent[]; investigation?: Investigation;
  metric: { name: string; series: number[]; tail: number[]; threshold: number };
  recovered: boolean; recovery_note: string;
}

export const STAGES = ["Collect logs and metrics", "Run known-signature checks", "Draft root cause", "Validate evidence and output"];
