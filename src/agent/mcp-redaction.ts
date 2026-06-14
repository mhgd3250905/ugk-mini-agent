/**
 * Strip credentials from MCP transport errors before they reach the API/UI.
 * HTTP transports can carry Authorization headers, and lower layers may echo
 * those headers in error messages.
 */
export function redactMcpSensitiveMessage(message: string): string {
	return message
		.replace(/\b(authorization)\s*[:=]\s*(bearer|basic)\s+[^\s,;"]+/gi, "$1: $2 [redacted]")
		.replace(/\b(bearer|basic)\s+[^\s,;"]+/gi, "$1 [redacted]")
		.replace(/\b(authorization|token|apikey|api-key)\s*[:=]\s*[^\s,;"]+/gi, "$1 [redacted]")
		.replace(/\b[A-Za-z0-9+/=_-]{32,}\b/g, "[redacted]");
}
