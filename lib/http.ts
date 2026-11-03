export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
export const fail = (error: string, status = 400) => json({ error }, status);
export async function body(req: Request): Promise<any> {
  try { return await req.json(); } catch { return {}; }
}
