'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useSesi } from '../../lib/hooks';
import Shell from '../../components/Shell';

export default function Page() {
  const sesi = useSesi('admin');
  return sesi ? <View /> : null;
}

const KOSONG = { username: '', email: '', password: '', role: 'mahasiswa', nama: '', nim: '', nip: '', prodi: '', dosen_pa_id: '' };
const HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

function View() {
  const [tab, setTab] = useState('akun');
  const [users, setUsers] = useState([]);
  const [kelas, setKelas] = useState([]);
  const [f, setF] = useState(KOSONG);
  const [mk, setMk] = useState({ kode: '', nama: '', sks: 3, prasyarat: '' });
  const [editKode, setEditKode] = useState(null); // kode mata kuliah yang sedang diedit, null = mode tambah
  const [mataKuliah, setMataKuliah] = useState([]);
  const [kl, setKl] = useState({ kode_mk: '', hari: 'Senin', jam_mulai: '08:00', jam_selesai: '10:00', ruang: '', kuota_maksimal: 30 });
  const [kg, setKg] = useState({ mahasiswa_id: '', kode_mk: '', lulus: 1 });
  const [kelulusan, setKelulusan] = useState([]);
  const [info, setInfo] = useState('');
  const dosenList = users.filter((x) => x.role === 'dosen_pa' && x.aktif);

  const muat = () => {
    api('/api/admin/users').then(setUsers);
    api('/api/kelas').then(setKelas);
    api('/api/admin/mata-kuliah').then(setMataKuliah);
    api('/api/admin/kelulusan').then(setKelulusan);
  };
  useEffect(() => { muat(); }, []);

  const editMk = (m) => {
    setEditKode(m.kode);
    setMk({ kode: m.kode, nama: m.nama, sks: m.sks, prasyarat: (m.prasyarat || []).join(', ') });
  };
  const batalEditMk = () => { setEditKode(null); setMk({ kode: '', nama: '', sks: 3, prasyarat: '' }); };
  const simpanMk = () => {
    const body = { ...mk, prasyarat: mk.prasyarat.split(',').map((s) => s.trim()).filter(Boolean) };
    const panggil = editKode
      ? api('/api/admin/mata-kuliah/' + editKode, { method: 'PUT', body })
      : api('/api/admin/mata-kuliah', { method: 'POST', body });
    jalan(() => panggil.then(batalEditMk), editKode ? 'Mata kuliah diperbarui' : 'Mata kuliah ditambah');
  };

  // Jalankan aksi lalu tampilkan hasilnya
  const jalan = async (fn, ok) => {
    try { await fn(); setInfo(ok); muat(); } catch (e) { setInfo(e.error || 'Gagal'); }
  };
  const set = (obj, setObj, k) => (e) => setObj({ ...obj, [k]: e.target.value });

  return (
    <Shell
      judul={tab === 'akun' ? 'Kelola Akun' : 'Data Akademik'}
      menu={[{ key: 'akun', label: 'Akun' }, { key: 'akademik', label: 'Data Akademik' }]}
      aktif={tab} onPilih={setTab}
      nama="Admin" role="Administrator" info={info}
    >

      {tab === 'akun' && (
        <>
          <div className="card">
            <h3>Tambah Akun</h3>
            <div className="grid">
              <input placeholder="Username" value={f.username} onChange={set(f, setF, 'username')} />
              <input placeholder="Email" value={f.email} onChange={set(f, setF, 'email')} />
              <input placeholder="Password" type="password" value={f.password} onChange={set(f, setF, 'password')} />
              <select value={f.role} onChange={set(f, setF, 'role')}>
                <option value="mahasiswa">Mahasiswa</option><option value="dosen_pa">Dosen PA</option><option value="admin">Admin</option>
              </select>
              {f.role !== 'admin' && <input placeholder="Nama lengkap" value={f.nama} onChange={set(f, setF, 'nama')} />}
              {f.role === 'mahasiswa' && <input placeholder="NIM" value={f.nim} onChange={set(f, setF, 'nim')} />}
              {f.role === 'mahasiswa' && <input placeholder="Prodi" value={f.prodi} onChange={set(f, setF, 'prodi')} />}
              {f.role === 'mahasiswa' && (
                <select value={f.dosen_pa_id} onChange={set(f, setF, 'dosen_pa_id')}>
                  <option value="">— Pilih Dosen PA —</option>
                  {dosenList.map((d) => <option key={d.id} value={d.id}>{d.nama}</option>)}
                </select>
              )}
              {f.role === 'dosen_pa' && <input placeholder="NIP" value={f.nip} onChange={set(f, setF, 'nip')} />}
            </div>
            <div className="row"><button onClick={() => jalan(() => api('/api/admin/users', { method: 'POST', body: f }).then(() => setF(KOSONG)), 'Akun dibuat')}>Simpan</button></div>
          </div>

          <div className="card scroll">
            <h3>Daftar Akun</h3>
            <table>
              <thead><tr><th>Username</th><th>Nama</th><th>Role</th><th>ID</th><th>Dosen PA</th><th>Status</th><th>Aksi</th></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.username}</td><td>{u.nama}</td><td>{u.role}</td><td>{u.nim || u.nip}</td>
                    <td>
                      {u.role === 'mahasiswa' ? (
                        <select value={u.dosen_pa_id || ''} onChange={(e) => jalan(() => api('/api/admin/users/' + u.id, { method: 'PUT', body: { dosen_pa_id: e.target.value } }), 'Dosen PA diperbarui')}>
                          <option value="">— belum ada —</option>
                          {dosenList.map((d) => <option key={d.id} value={d.id}>{d.nama}</option>)}
                        </select>
                      ) : '-'}
                    </td>
                    <td>{u.aktif ? 'Aktif' : 'Nonaktif'}</td>
                    <td className="row" style={{ margin: 0 }}>
                      <button className="abu" onClick={() => { const p = prompt('Password baru:'); p && jalan(() => api('/api/admin/users/' + u.id, { method: 'PUT', body: { password: p } }), 'Password direset'); }}>Reset</button>
                      <button className={u.aktif ? 'merah' : 'hijau'} onClick={() => jalan(() => api('/api/admin/users/' + u.id, { method: 'PUT', body: { aktif: !u.aktif } }), 'Status diubah')}>{u.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'akademik' && (
        <div className="grid">
          <div>
            <div className="card">
              <h3>{editKode ? `Ubah Mata Kuliah (${editKode})` : 'Tambah Mata Kuliah'}</h3>
              <input placeholder="Kode (mis. IF101)" value={mk.kode} disabled={!!editKode} onChange={set(mk, setMk, 'kode')} />
              <div style={{ height: 6 }} />
              <input placeholder="Nama" value={mk.nama} onChange={set(mk, setMk, 'nama')} />
              <div style={{ height: 6 }} />
              <input placeholder="SKS" type="number" value={mk.sks} onChange={set(mk, setMk, 'sks')} />
              <div style={{ height: 6 }} />
              <input placeholder="Prasyarat (kode, pisahkan koma)" value={mk.prasyarat} onChange={set(mk, setMk, 'prasyarat')} />
              <div className="row">
                <button onClick={simpanMk}>{editKode ? 'Simpan Perubahan' : 'Simpan'}</button>
                {editKode && <button className="abu" onClick={batalEditMk}>Batal</button>}
              </div>
            </div>
            <div className="card">
              <h3>Daftar Mata Kuliah</h3>
              {mataKuliah.map((m) => (
                <div key={m.kode} className="kelas" style={{ justifyContent: 'space-between' }}>
                  <span><b className="mono">{m.kode}</b> {m.nama} ({m.sks} SKS){m.prasyarat && m.prasyarat.length > 0 && <span className="jadwal"> · syarat: {m.prasyarat.join(', ')}</span>}</span>
                  <span className="row" style={{ margin: 0 }}>
                    <button className="abu" onClick={() => editMk(m)}>Ubah</button>
                    <button className="merah" onClick={() => confirm(`Hapus mata kuliah ${m.kode}?`) && jalan(() => api('/api/admin/mata-kuliah/' + m.kode, { method: 'DELETE' }), 'Mata kuliah dihapus')}>Hapus</button>
                  </span>
                </div>
              ))}
              {!mataKuliah.length && <p style={{ color: 'var(--text-soft)', fontSize: 14 }}>Belum ada mata kuliah.</p>}
            </div>
            <div className="card">
              <h3>Tambah / Koreksi Riwayat Kelulusan</h3>
              <input placeholder="ID mahasiswa" value={kg.mahasiswa_id} onChange={set(kg, setKg, 'mahasiswa_id')} />
              <div style={{ height: 6 }} />
              <input placeholder="Kode mata kuliah" value={kg.kode_mk} onChange={set(kg, setKg, 'kode_mk')} />
              <div style={{ height: 6 }} />
              <select value={kg.lulus} onChange={set(kg, setKg, 'lulus')}><option value={1}>Lulus</option><option value={0}>Tidak lulus</option></select>
              <div className="row"><button onClick={() => jalan(() => api('/api/admin/kelulusan', { method: 'POST', body: { ...kg, lulus: Number(kg.lulus) } }), 'Riwayat disimpan')}>Simpan</button></div>
            </div>
            <div className="card scroll">
              <h3>Daftar Riwayat Kelulusan</h3>
              <table>
                <thead><tr><th>NIM</th><th>Mahasiswa</th><th>Mata Kuliah</th><th>Status</th></tr></thead>
                <tbody>
                  {kelulusan.map((r) => (
                    <tr key={r.id}>
                      <td className="mono">{r.nim}</td><td>{r.mahasiswa}</td>
                      <td><span className="mono">{r.kode_mk}</span> {r.mata_kuliah}</td>
                      <td>{r.lulus ? 'Lulus' : 'Tidak lulus'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!kelulusan.length && <p style={{ color: 'var(--text-soft)', fontSize: 14 }}>Belum ada data.</p>}
            </div>
          </div>
          <div>
            <div className="card">
              <h3>Tambah Kelas</h3>
              <input placeholder="Kode mata kuliah" value={kl.kode_mk} onChange={set(kl, setKl, 'kode_mk')} />
              <div style={{ height: 6 }} />
              <select value={kl.hari} onChange={set(kl, setKl, 'hari')}>{HARI.map((h) => <option key={h}>{h}</option>)}</select>
              <div className="row"><input type="time" value={kl.jam_mulai} onChange={set(kl, setKl, 'jam_mulai')} /><input type="time" value={kl.jam_selesai} onChange={set(kl, setKl, 'jam_selesai')} /></div>
              <div className="row"><input placeholder="Ruang" value={kl.ruang} onChange={set(kl, setKl, 'ruang')} /><input type="number" placeholder="Kuota" value={kl.kuota_maksimal} onChange={set(kl, setKl, 'kuota_maksimal')} /></div>
              <div className="row"><button onClick={() => jalan(() => api('/api/admin/kelas', { method: 'POST', body: kl }), 'Kelas ditambah')}>Simpan</button></div>
            </div>
            <div className="card">
              <h3>Daftar Kelas</h3>
              {kelas.map((k) => (
                <div key={k.id} className="kelas" style={{ justifyContent: 'space-between' }}>
                  <span className="mono">{k.kode_mk} · {k.hari} {k.jam_mulai.slice(0, 5)}–{k.jam_selesai.slice(0, 5)} · {k.kuota_terisi}/{k.kuota_maksimal}</span>
                  <button className="merah" onClick={() => confirm('Hapus kelas ini?') && jalan(() => api('/api/admin/kelas/' + k.id, { method: 'DELETE' }), 'Kelas dihapus')}>Hapus</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
