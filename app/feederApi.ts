import * as SecureStore from 'expo-secure-store';

// ── Base config ──────────────────────────────────────────────────────────────
const BASE_URL = 'https://planet.imcbs.com/api';

// Matches the key login.tsx uses: `await SecureStore.setItemAsync('token', data.token)`
const TOKEN_KEY = 'token';

const getAuthHeaders = async () => {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Token ${token}` } : {}),
  };
};

// ── Generic helpers ──────────────────────────────────────────────────────────
async function request(path: string, options: RequestInit = {}) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      message = body?.detail || body?.message || JSON.stringify(body);
    } catch {
      // ignore parse errors, keep default message
    }
    throw new Error(message);
  }

  // 204 No Content (e.g. DELETE) has no body
  if (res.status === 204) return null;
  return res.json();
}

// Master list endpoints return either a plain array [{id, code, name}, ...]
// or occasionally a paginated {results: [...]} shape. This normalizes both.
async function listMaster(path: string): Promise<MasterItem[]> {
  const data = await request(path);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

// ── Types ────────────────────────────────────────────────────────────────────
export interface MasterItem {
  id: number;
  code?: string;
  name: string;
}

export interface Feeder {
  id?: number;
  uniqueCode?: string | null;
  name: string;
  address?: string;
  location?: string;
  area?: string;
  district?: string;
  state?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  reputedName?: string;
  reputedPhone?: string;
  software?: string;
  businessNature?: string;
  branch?: string;
  corporate?: string | null;
  noOfSystem?: number | string;
  pinCode?: string;
  country?: string;
  installDate?: string; // YYYY-MM-DD
  remark?: string;
  softwareAmount?: string;
  totalCost?: string | null;
  modules?: string[];
  status?: string;
  admStatus?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ── Feeder CRUD ──────────────────────────────────────────────────────────────
export const feederApi = {
  list: async (params?: { search?: string }): Promise<Feeder[]> => {
    const qs = params?.search ? `?search=${encodeURIComponent(params.search)}` : '';
    const data = await request(`/feeder/feeders/${qs}`);
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.results)) return data.results;
    return [];
  },
  get: (id: number): Promise<Feeder> => request(`/feeder/feeders/${id}/`),
  create: (payload: Feeder): Promise<Feeder> =>
      request('/key-requests/new-installation/', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: number, payload: Feeder): Promise<Feeder> =>
    request(`/feeder/feeders/${id}/`, { method: 'PATCH', body: JSON.stringify(payload) }),
  remove: (id: number): Promise<null> =>
    request(`/feeder/feeders/${id}/`, { method: 'DELETE' }),
};

// ── Master data ──────────────────────────────────────────────────────────────
export const branchApi = { list: () => listMaster('/master/branch/') };
export const stateApi = { list: () => listMaster('/master/state/') };
export const districtApi = { list: () => listMaster('/master/district/') };
export const countryApi = { list: () => listMaster('/master/country/') };
export const softwareApi = { list: () => listMaster('/master/software/') };
export const businessNatureApi = { list: () => listMaster('/master/business-nature/') };
export const corporateApi = { list: () => listMaster('/master/corporate/') };
export const moduleApi = { list: () => listMaster('/master/module/') };