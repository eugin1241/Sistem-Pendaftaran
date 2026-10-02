'use client';
import { useState } from 'react';
import { api, setSession } from '../lib/api';

const HOME = { mahasiswa: '/mahasiswa', dosen_pa: '/dosen', admin: '/admin' };

const PERAN = {
  mahasiswa: { label: 'Mahasiswa', placeholder: 'Username (contoh: mhs1)', demo: 'mhs1 / password123' },
  dosen_pa: { label: 'Dosen PA', placeholder: 'Username (contoh: dosen1)', demo: 'dosen1 / password123' },
  admin: { label: 'Admin', placeholder: 'Username (contoh: admin)', demo: 'admin / password123' },
};

export default function Login() {
  const [role, setRole] = useState('mahasiswa');
  const [f, setF] = useState({ username: '', password: '' });
  const [err, setErr] = useState('');

  const pilihPeran = (r) => { setRole(r); setErr(''); };

  const masuk = async (e) => {
    e.preventDefault();
    try {
      const s = await api('/api/auth/login', { method: 'POST', body: { ...f, role } });
      if (s.role !== role) {
        setErr(`Akun ini bukan akun ${PERAN[role].label}`);
        return;
      }
      setSession(s);
      location.href = HOME[s.role];
    } catch (x) {
      setErr(x.error || 'Tidak dapat terhubung ke server');
    }
  };

  return (
    <div className="auth">
      <section className="auth-hero">
        <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#4DA8E0" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 11l9-8 9 8v10H3z" /><path d="M10 21v-6h4v6" />
        </svg>
        <h1>KRS Online</h1>
        <p className="lead">Universitas Charlie: pilih mata kuliah, ajukan KRS, dan konsultasi dengan dosen PA dalam satu tempat.</p>
        <p className="langkah"><b>1</b> Mahasiswa memilih kelas, dicek otomatis: jadwal, kuota, prasyarat</p>
        <p className="langkah"><b>2</b> Dosen PA menyetujui atau menolak pengajuan</p>
        <p className="langkah"><b>3</b> Konsultasi langsung dengan dosen PA lewat chat</p>
      </section>

      <section className="auth-panel">
        <form className="auth-card" onSubmit={masuk}>
          <div className="row">
            {Object.entries(PERAN).map(([key, p]) => (
              <button
                key={key}
                type="button"
                className={role === key ? '' : 'abu'}
                onClick={() => pilihPeran(key)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <label>Username</label>
          <input placeholder={PERAN[role].placeholder} value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
          <label>Kata sandi</label>
          <input type="password" placeholder="Kata sandi" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          {err && <p className="err">{err}</p>}
          <button className="btn-masuk">Masuk sebagai {PERAN[role].label}</button>
          <div className="demo">
            <b>Akun demo {PERAN[role].label}:</b><br />
            {PERAN[role].demo}
          </div>
        </form>
      </section>
    </div>
  );
}