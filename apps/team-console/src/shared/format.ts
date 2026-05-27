export function formatElapsed(ms: number): string {
  if (ms < 1000) return "<1s";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  if (minutes < 60) return `${minutes}m${remSec > 0 ? ` ${remSec}s` : ""}`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return `${hours}h ${remMin}m`;
}

export function errorFirstLine(error: string | null | undefined): string {
  if (!error) return "";
  const line = error.split("\n")[0];
  return line.length > 80 ? line.slice(0, 80) + "..." : line;
}
