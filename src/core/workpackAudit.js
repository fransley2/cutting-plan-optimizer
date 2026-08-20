/** Persists audit data without allowing an audit failure to invalidate the completed action. */
export async function persistWorkpackAudit(writeAudit, payload, onFailure = () => {}) {
  try {
    return { ok: true, event: await writeAudit(payload) };
  } catch (error) {
    onFailure(error);
    return { ok: false, error };
  }
}
