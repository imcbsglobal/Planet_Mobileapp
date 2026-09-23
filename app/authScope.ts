import * as SecureStore from 'expo-secure-store';

export interface UserScope {
  isAdmin: boolean;
  role: string;
  company: string;
  branches: string[];
  departments: string[];
  menuKeys: string[];
}

const safeParseArray = (raw: string | null): string[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
};

export async function getUserScope(): Promise<UserScope> {
  const [role, company, branchesRaw, departmentRaw, menuKeysRaw] = await Promise.all([
    SecureStore.getItemAsync('role'),
    SecureStore.getItemAsync('company'),
    SecureStore.getItemAsync('branches'),
    SecureStore.getItemAsync('department'),
    SecureStore.getItemAsync('menuKeys'),
  ]);

  return {
    isAdmin: (role || '').trim().toLowerCase() === 'admin',
    role: role || '',
    company: company || '',
    branches: safeParseArray(branchesRaw),
    departments: safeParseArray(departmentRaw),
    menuKeys: safeParseArray(menuKeysRaw),
  };
}

export function isAllowed(value: string | undefined | null, allowedList: string[]): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return allowedList.some((a) => a.trim().toLowerCase() === v);
}

export function hasMenuKey(scope: UserScope, key: string): boolean {
  return scope.menuKeys.includes(key);
}