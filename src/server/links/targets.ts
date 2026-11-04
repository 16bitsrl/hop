/**
 * Identity of rules and A/B variants. Clicks record "rule:<id>" or "variant:<id>", so editing or
 * moving a rule does not hand its past clicks to another one. Rules saved before they had an id are
 * known by their position, which is what their clicks recorded.
 */
type WithId = { id?: string };

export function withIds<T extends WithId>(items: T[]): (T & { id: string })[] {
  return items.map((item, i) => ({ ...item, id: item.id ?? String(i) }));
}

/** Keeps the ids the link already has (once each) and gives every other entry a new one. */
export function assignIds<T extends WithId>(incoming: T[], existing: WithId[] = []): (T & { id: string })[] {
  const known = new Set(withIds(existing).map((x) => x.id));
  const used = new Set<string>();
  return incoming.map((item) => {
    const id = item.id && known.has(item.id) && !used.has(item.id) ? item.id : crypto.randomUUID().slice(0, 8);
    used.add(id);
    return { ...item, id };
  });
}
