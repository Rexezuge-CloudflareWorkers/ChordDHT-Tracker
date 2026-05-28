export function errorResponse(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message, detail: {} } }, { status });
}
