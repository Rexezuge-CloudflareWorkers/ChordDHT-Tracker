export async function verifyAdmin(token: string): Promise<boolean> {
  const res = await fetch('/tracker/admin/verify', { headers: { Authorization: `Bearer ${token}` } });
  return res.ok;
}
