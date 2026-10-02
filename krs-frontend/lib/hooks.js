'use client';
import { useEffect, useRef, useState } from 'react';
import { getSession } from './api';

// Pastikan sudah login dengan role yang benar
export function useSesi(role) {
  const [sesi, setSesi] = useState(null);
  useEffect(() => {
    const s = getSession();
    if (!s || s.role !== role) location.href = '/';
    else setSesi(s);
  }, [role]);
  return sesi;
}

// Panggil fn berulang tiap `ms` milidetik (pengganti WebSocket)
export function usePolling(fn, ms, langsung = false) {
  const ref = useRef(fn);
  ref.current = fn; // selalu pakai fungsi terbaru
  useEffect(() => {
    const jalan = () => Promise.resolve(ref.current()).catch(() => {});
    if (langsung) jalan();
    const t = setInterval(jalan, ms);
    return () => clearInterval(t);
  }, [ms]);
}
