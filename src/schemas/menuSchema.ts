const MENU_ITEM_TYPES = new Set(['folder', 'link', 'divider']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isOptionalString = (value: unknown) => value === undefined || typeof value === 'string';
const isOptionalBoolean = (value: unknown) => value === undefined || typeof value === 'boolean';
const isOptionalStringArray = (value: unknown) =>
  value === undefined || (Array.isArray(value) && value.every((entry) => typeof entry === 'string'));

function isMenuItem(value: unknown, ancestors: Set<object>): boolean {
  if (!isRecord(value) || ancestors.has(value)) return false;
  if (typeof value.id !== 'string' || value.id.length === 0) return false;
  if (typeof value.text !== 'string' || value.text.length === 0) return false;
  if (!isOptionalString(value.path) || !isOptionalString(value.icon)) return false;
  if (!isOptionalStringArray(value.roles) || !isOptionalStringArray(value.permissions)) return false;
  if (!isOptionalBoolean(value.expanded) || !isOptionalBoolean(value.external) || !isOptionalBoolean(value.hidden)) {
    return false;
  }
  if (!isOptionalStringArray(value.position) || !isOptionalString(value.propigAppId)) return false;
  if (value.type !== undefined && (typeof value.type !== 'string' || !MENU_ITEM_TYPES.has(value.type))) return false;
  if (value.badge !== undefined && typeof value.badge !== 'string' && typeof value.badge !== 'number') return false;

  if (value.sub !== undefined) {
    if (!Array.isArray(value.sub)) return false;
    ancestors.add(value);
    const validSub = value.sub.every(
      (entry) => typeof entry === 'string' || isMenuItem(entry, ancestors),
    );
    ancestors.delete(value);
    if (!validSub) return false;
  }

  return true;
}

export function validateMenuItem(item: unknown): boolean {
  return isMenuItem(item, new Set());
}

export function validateSiteData(data: unknown): boolean {
  if (!isRecord(data)) return false;
  if (typeof data.name !== 'string' || data.name.length === 0) return false;
  if (typeof data.icon !== 'string' || data.icon.length === 0) return false;
  if (!Array.isArray(data.menu) || !Array.isArray(data.trash)) return false;

  return data.menu.every(validateMenuItem) && data.trash.every(validateMenuItem);
}

export function validateAllSites(data: unknown): boolean {
  return isRecord(data) && Object.values(data).every(validateSiteData);
}
