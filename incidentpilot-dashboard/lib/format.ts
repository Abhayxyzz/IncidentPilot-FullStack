export const fmtTime = (s: string) => (s.includes("T") ? new Date(s).toLocaleTimeString("en-GB") : s);
export const nowLabel = () => new Date().toLocaleTimeString("en-GB");
