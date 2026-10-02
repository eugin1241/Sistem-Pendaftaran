'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useSesi, usePolling } from '../../lib/hooks';
import ChatPoll from '../../components/ChatPoll';
import Shell from '../../components/Shell';

export default function Page() {
  const sesi = useSesi('dosen_pa');
  return sesi ? <View sesi={sesi} /> : null;
}

function View({ sesi }) {
  const [daftar, setDaftar] = useState([]);
  const [aktif, setAktif] = useState(null);
  const pendingRef = useRef(null);
  const [info, setInfo] = useState('');

  const muat = () => api('/api/dosen/pengajuan').then((d) => {
    const n = d.filter((x) => x.status === 'pending').length;
    if (pendingRef.current !== null && n > pendingRef.current) setInfo('Ada pengajuan baru dari mahasiswa');
    pendingRef.current = n;
    setDaftar(d);
  });
  useEffect(() => { muat(); }, []);
  usePolling(muat, 5000);                                                  // cek pengajuan baru
  usePolling(() => api('/api/dosen/ping', { method: 'POST' }), 15000, true); // penanda online

  const buka = (p) => setAktif(p);

  const putuskan = async (p, status) => {
    let catatan = null;
    if (status === 'rejected') {
      catatan = prompt('Catatan perbaikan untuk mahasiswa:');
      if (!catatan) return;
    }
    try {
      await api(`/api/krs/${p.id}/keputusan`, { method: 'PATCH', body: { status, catatan } });
      setInfo(`Pengajuan ${p.nama} ${status === 'approved' ? 'disetujui' : 'ditolak'}.`);
      muat();
    } catch (e) {
      setInfo(e.error || 'Gagal memproses');
    }
  };

  return (
    <Shell
      judul="Pengajuan Mahasiswa"
      sub={`${daftar.filter((x) => x.status === 'pending').length} menunggu keputusan`}
      menu={[{ key: 'pengajuan', label: 'Pengajuan & Chat' }]} aktif="pengajuan"
      nama={sesi.nama} role="Dosen PA" info={info}
    >
      <div className="grid">
        <div className="card">
          <h3>Pengajuan Mahasiswa Bimbingan</h3>
          {!daftar.length && <p>Belum ada pengajuan.</p>}
          {daftar.map((p) => (
            <div key={p.id} className={'item ' + p.status + (aktif && aktif.id === p.id ? ' aktif' : '')} onClick={() => buka(p)}>
              <b>{p.nama}</b> <span className="mono">({p.nim})</span> · IP {p.ip_semester} <span className={'badge ' + p.status}>{p.status}</span>
              {p.status === 'pending' && (
                <div className="row" onClick={(e) => e.stopPropagation()}>
                  <button className="hijau" onClick={() => putuskan(p, 'approved')}>Setujui</button>
                  <button className="merah" onClick={() => putuskan(p, 'rejected')}>Tolak</button>
                </div>
              )}
            </div>
          ))}
        </div>
        {aktif ? (
          <ChatPoll key={aktif.mahasiswa_id} judul={`Chat dengan ${aktif.nama}`} mid={aktif.mahasiswa_id} saya="dosen_pa" />
        ) : (
          <div className="card">Pilih mahasiswa untuk membuka chat.</div>
        )}
      </div>
    </Shell>
  );
}
