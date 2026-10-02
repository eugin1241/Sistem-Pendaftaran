'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { usePolling } from '../lib/hooks';
import Chat from './Chat';

// Chat tanpa WebSocket: ambil pesan baru tiap 3 detik, kirim lewat POST.
// mid = ID mahasiswa pemilik percakapan.
export default function ChatPoll({ judul, mid, saya }) {
  const [pesan, setPesan] = useState([]);

  const ambil = () =>
    api(`/api/chat/${mid}` + (pesan.length ? `?after=${pesan[pesan.length - 1].id}` : '')).then((baru) => {
      if (baru.length) setPesan((p) => [...p, ...baru.filter((b) => !p.some((x) => x.id === b.id))]);
    });

  useEffect(() => { ambil(); }, []);
  usePolling(ambil, 3000);

  const kirim = async (isi) => {
    await api('/api/chat', { method: 'POST', body: { isi, mahasiswa_id: mid } });
    ambil();
  };

  return <Chat judul={judul} pesan={pesan} saya={saya} onKirim={kirim} />;
}
