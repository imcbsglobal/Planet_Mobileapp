// Service tokens accepted by the trip API (`services` on /api/vehicle/trips/).
// The tokens are a fixed choice list shared by the Start Trip form and the
// trip history shown on the vehicle screen — send the token, never the label.
export const SERVICE_OPTIONS = [
  { key: 'washing', label: 'Washing', icon: 'water-outline' },
  { key: 'alignment', label: 'Alignment', icon: 'git-commit-outline' },
  { key: 'airChecking', label: 'Air Checking', icon: 'flag-outline' },
  { key: 'greaseOil', label: 'Grease / Oil', icon: 'flask-outline' },
] as const;

export type ServiceKey = (typeof SERVICE_OPTIONS)[number]['key'];

const SERVICE_LABELS: Record<string, string> = SERVICE_OPTIONS.reduce(
  (acc, option) => {
    acc[option.key] = option.label;
    return acc;
  },
  {} as Record<string, string>
);

export const serviceLabel = (key: string): string => SERVICE_LABELS[key] || key;

/**
 * Turns whatever the trips endpoint hands back — an array, a comma separated
 * string or nothing — into a readable list such as "Washing · Air Checking".
 */
export const formatServices = (services: unknown): string => {
  const list = Array.isArray(services)
    ? services
    : typeof services === 'string' && services.trim()
      ? services.split(',')
      : [];
  return list
    .map((token) => serviceLabel(String(token).trim()))
    .filter(Boolean)
    .join(' · ');
};
