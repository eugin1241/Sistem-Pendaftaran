'use client';
import { useEffect, useRef, useState } from 'react';
import { api, pidOf } from '../../lib/api';
import { useSesi, usePolling } from '../../lib/hooks';
import ChatPoll from '../../components/ChatPoll';
import Shell from '../../components/Shell';

export default function Page() {
  const sesi = useSesi('mahasiswa');
  return sesi ? <View sesi={sesi} /> : null;
}

const jam = (t) => t.slice(0, 5);

function View({ sesi }) {
  const pid = pidOf(sesi);
  const [kelas, setKelas] = useState([]);
  const [pilih, setPilih] = useState([]);
  const [cek, setCek] = useState(null);
  const [krs, setKrs] = useState([]);
  const [dosen, setDosen] = useState(null);
  const krsRef = useRef([]);
  const [menuAktif, setMenuAktif] = useState('krs');
  const [info, setInfo] = useState('');

  const muatKelas = () => api('/api/kelas').then(setKelas);
  const muatKrs = () => api('/api/krs/saya').then((baru) => {
    baru.forEach((b) => {
      const lama = krsRef.current.find((x) => x.id === b.id);
      if (lama && lama.status === 'pending' && b.status !== 'pending')
        setInfo(`KRS ${b.status === 'approved' ? 'disetujui' : 'ditolak'} oleh dosen PA${b.catatan ? ': ' + b.catatan : ''}`);
    });
    krsRef.current = baru;
    setKrs(baru);
  });

  useEffect(() => {
    muatKelas(); muatKrs();
    api('/api/dosen/status').then(setDosen);
  }, []);

  // Validasi instan setiap pilihan berubah
  useEffect(() => {
    if (!pilih.length) return setCek(null);
    api('/api/krs/validasi', { method: 'POST', body: { kelas_ids: pilih } }).then(setCek);
  }, [pilih]);

  // Cek status KRS dan status dosen tiap 5 detik
  usePolling(() => { muatKrs(); api('/api/dosen/status').then(setDosen); }, 5000);

  const toggle = (id) => setPilih((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const sks = kelas.filter((k) => pilih.includes(k.id)).reduce((a, k) => a + k.sks, 0);
  const terkunci = krs.some((k) => k.status === 'pending' || k.status === 'approved');

  const ajukan = async () => {
    try {
      await api('/api/krs', { method: 'POST', body: { kelas_ids: pilih } });
      setInfo('Pengajuan terkirim. Menunggu persetujuan dosen PA.');
      setPilih([]); muatKrs(); muatKelas();
    } catch (e) {
      setInfo((e.errors || [e.error || 'Gagal mengirim pengajuan']).join('; '));
    }
  };

  return (
    <Shell
      judul={menuAktif === 'krs' ? `Halo, ${sesi.nama}` : 'Konsultasi Dosen PA'}
      sub={menuAktif === 'krs' ? `Total dipilih: ${sks} SKS` : ''}
      menu={[{ key: 'krs', label: 'Isi KRS' }, { key: 'chat', label: 'Konsultasi Dosen PA' }]}
      aktif={menuAktif} onPilih={setMenuAktif}
      nama={sesi.nama} role="Mahasiswa" info={info}
    >

      {menuAktif === 'krs' && (
        <div>
          <div className="card">
            <h3>Pilih Mata Kuliah</h3>
            {kelas.map((k) => {
              const penuh = k.sisa_kuota <= 0;
              return (
                <label key={k.id} className="kelas">
                  <input type="checkbox" checked={pilih.includes(k.id)} disabled={terkunci || (penuh && !pilih.includes(k.id))} onChange={() => toggle(k.id)} />
                  <span>
                    <b className="mono">{k.kode_mk}</b> {k.nama} ({k.sks} SKS)<br />
                    <span className="jadwal">{k.hari} {jam(k.jam_mulai)}–{jam(k.jam_selesai)} · {k.ruang} · {penuh ? 'kelas penuh' : `sisa kuota ${k.sisa_kuota}`}</span>
                  </span>
                </label>
              );
            })}
            <p><b>Total: {sks} SKS</b></p>
            {cek && cek.errors.map((e, i) => <p key={i} className="err">⚠ {e}</p>)}
            {cek && cek.valid && <p className="ok">✓ Semua pilihan valid</p>}
            <button onClick={ajukan} disabled={terkunci || !cek || !cek.valid}>Kirim Pengajuan KRS</button>
            {terkunci && <p className="ok">Anda sudah punya pengajuan aktif semester ini.</p>}
          </div>

          <div className="card">
            <h3>Status Pengajuan</h3>
            {!krs.length && <p>Belum ada pengajuan.</p>}
            {krs.map((k) => (
              <div key={k.id} className={'status-row ' + k.status}>
                <span className={'badge ' + k.status}>{k.status}</span> {k.semester}<br />
                {k.mata_kuliah}
                {k.catatan && <div className="err">Catatan dosen: {k.catatan}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {menuAktif === 'chat' && (
        <ChatPoll
          judul={dosen ? `Dosen PA: ${dosen.nama} ${dosen.status_online ? '🟢 Online' : '⚪ Offline' + (dosen.last_seen ? ' · terakhir ' + new Date(dosen.last_seen).toLocaleString('id-ID') : '')}` : 'Konsultasi'}
          mid={pid} saya="mahasiswa"
        />
      )}
    </Shell>
  );
}
