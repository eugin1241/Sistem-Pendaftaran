'use client';
import { logout } from '../lib/api';

// Kerangka dashboard: sidebar biru tua + area konten
export default function Shell({ judul, sub, menu = [], aktif, onPilih, nama, role, info, children }) {
  return (
    <div className="shell">
      <aside className="side">
        <div className="side-brand">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#4DA8E0" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 11l9-8 9 8v10H3z" /><path d="M10 21v-6h4v6" />
          </svg>
          KRS Online
        </div>
        <nav>
          {menu.map((m) => (
            <button key={m.key} className={'nav' + (m.key === aktif ? ' aktif' : '')} onClick={() => onPilih && onPilih(m.key)}>
              <span className="dot" /> {m.label}
            </button>
          ))}
        </nav>
        <div className="side-user">
          <div className="avatar">{String(nama || '?').charAt(0).toUpperCase()}</div>
          <div className="who"><b>{nama}</b><small>{role}</small></div>
          <button className="keluar" onClick={logout}>Keluar</button>
        </div>
      </aside>
      <main className="main">
        <div className="main-top">
          <h1>{judul}</h1>
          {sub && <span className="sub">{sub}</span>}
        </div>
        {info && <div className="info">{info}</div>}
        {children}
      </main>
    </div>
  );
}
