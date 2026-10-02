export const API = process.env.NEXT_PUBLIC_API || 'http://localhost:3000';

export const getSession = () => {
  try { return JSON.parse(localStorage.getItem('sesi')); } catch { return null; }
};
export const setSession = (s) => localStorage.setItem('sesi', JSON.stringify(s));
export const logout = () => { localStorage.removeItem('sesi'); location.href = '/'; };

// ID profil (mahasiswa/dosen) diambil dari payload JWT
export const pidOf = (s) =>
  JSON.parse(atob(s.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).pid;

export async function api(path, opts = {}) {
  const s = getSession();
  const res = await fetch(API + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(s ? { Authorization: 'Bearer ' + s.token } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && s) logout();
  if (!res.ok) throw data;
  return data;
}

