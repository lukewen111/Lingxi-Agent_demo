export function formatAnonymousVisitorName(visitorId: string) {
  let hash = 0;
  for (const char of visitorId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `Visitor #${String(hash % 1_000_000).padStart(6, '0')}`;
}
