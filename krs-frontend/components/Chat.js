'use client';
import { useEffect, useRef, useState } from 'react';

export default function Chat({ judul, pesan, saya, onKirim }) {
  const [isi, setIsi] = useState('');
  const bawah = useRef(null);
  useEffect(() => { bawah.current && bawah.current.scrollIntoView({ behavior: 'smooth' }); }, [pesan]);
  const kirim = (e) => {
    e.preventDefault();
    if (!isi.trim()) return;
    onKirim(isi.trim());
    setIsi('');
  };
  return (
    <div className="card">
      <h3>{judul}</h3>
      <div className="pesan">
        {pesan.map((p) => (
          <div key={p.id} className={'bubble ' + (p.pengirim === saya ? 'saya' : 'lawan')}>{p.isi}</div>
        ))}
        <div ref={bawah} />
      </div>
      <form onSubmit={kirim} className="row">
        <input value={isi} onChange={(e) => setIsi(e.target.value)} placeholder="Tulis pesan..." />
        <button>Kirim</button>
      </form>
    </div>
  );
}
