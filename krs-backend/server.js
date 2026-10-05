require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { User, MataKuliah, Kelas, Kelulusan, Pengajuan, Pesan } = require('./models');

const SECRET = process.env.JWT_SECRET || 'ganti-ini';
const SEMESTER = process.env.SEMESTER || '2026-Ganjil';
const HEX = /^[a-f\d]{24}$/i;
const str = (v) => String(v == null ? '' : v); // cegah NoSQL injection ({"$ne": ...})

const app = express();
app.use(cors());
app.use(express.json());

// ---------- Helper ----------
const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    if (e.code === 11000) return res.status(409).json({ error: 'Data duplikat (username/email/NIM/NIP/kode sudah ada)' });
    if (e.name === 'ValidationError' || e.name === 'CastError') return res.status(400).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  });

// Autentikasi + pembatasan role (RBAC)
const auth = (...roles) => (req, res, next) => {
  try {
    req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET);
  } catch {
    return res.status(401).json({ error: 'Belum login' });
  }
  if (roles.length && !roles.includes(req.user.role)) return res.status(403).json({ error: 'Akses ditolak' });
  next();
};

// Cari mahasiswa/dosen lewat NIM/NIP atau ID
const cari = (role, kunci) => {
  kunci = str(kunci);
  return User.findOne({ role, $or: [{ [role === 'mahasiswa' ? 'nim' : 'nip']: kunci }, ...(HEX.test(kunci) ? [{ _id: kunci }] : [])] });
};

// ---------- Auth ----------
app.post('/api/auth/login', wrap(async (req, res) => {
  const u = await User.findOne({ username: str(req.body.username), aktif: true });
  if (!u || !(await bcrypt.compare(str(req.body.password), u.password_hash)))
    return res.status(401).json({ error: 'Username atau password salah' });

  const token = jwt.sign({ id: u.id, role: u.role, pid: u.role === 'admin' ? null : u.id }, SECRET, { expiresIn: '8h' });
  res.json({ token, role: u.role, nama: u.nama || u.username });
}));

// ---------- Mahasiswa ----------
app.get('/api/kelas', auth(), wrap(async (req, res) => {
  const [kelas, mk] = await Promise.all([Kelas.find().sort({ kode_mk: 1, hari: 1 }), MataKuliah.find()]);
  const nm = Object.fromEntries(mk.map((m) => [m.kode, m]));
  res.json(kelas.map((k) => ({
    ...k.toJSON(),
    nama: nm[k.kode_mk] && nm[k.kode_mk].nama,
    sks: nm[k.kode_mk] && nm[k.kode_mk].sks,
    sisa_kuota: k.kuota_maksimal - k.kuota_terisi
  })));
}));

// Rule engine validasi instan: bentrok jadwal, kuota, prasyarat
async function validasi(mhsId, kelasIds) {
  const errors = [];
  if (!Array.isArray(kelasIds) || !kelasIds.length) return ['Belum ada kelas dipilih'];

  const ids = [...new Set(kelasIds.map(str))];
  const kelas = await Kelas.find({ _id: { $in: ids.filter((i) => HEX.test(i)) } });
  if (kelas.length !== ids.length) errors.push('Ada kelas yang tidak ditemukan');
  if (!kelas.length) return errors;

  const mk = await MataKuliah.find({ kode: { $in: kelas.map((k) => k.kode_mk) } });
  const namaMk = Object.fromEntries(mk.map((m) => [m.kode, m.nama]));

  // 1. Bentrok jadwal (dan mata kuliah ganda)
  for (let i = 0; i < kelas.length; i++) {
    for (let j = i + 1; j < kelas.length; j++) {
      const a = kelas[i], b = kelas[j];
      if (a.kode_mk === b.kode_mk) errors.push(`${namaMk[a.kode_mk]} dipilih lebih dari satu kelas`);
      else if (a.hari === b.hari && a.jam_mulai < b.jam_selesai && b.jam_mulai < a.jam_selesai)
        errors.push(`Jadwal bentrok: ${namaMk[a.kode_mk]} dengan ${namaMk[b.kode_mk]}`);
    }
  }
  // 2. Kuota
  kelas.filter((k) => k.kuota_terisi >= k.kuota_maksimal)
    .forEach((k) => errors.push(`Kelas ${namaMk[k.kode_mk]} (${k.hari}) sudah penuh`));

  // 3. Prasyarat
  const lulus = await Kelulusan.find({ mahasiswa_id: mhsId, lulus: true });
  const sudahLulus = new Set(lulus.map((l) => l.kode_mk));
  mk.forEach((m) => {
    const kurang = m.prasyarat.filter((s) => !sudahLulus.has(s));
    if (kurang.length) errors.push(`${m.nama}: prasyarat belum terpenuhi (${kurang.join(', ')})`);
  });
  return errors;
}

app.post('/api/krs/validasi', auth('mahasiswa'), wrap(async (req, res) => {
  const errors = await validasi(req.user.pid, req.body.kelas_ids);
  res.json({ valid: errors.length === 0, errors });
}));

// Kirim pengajuan: validasi ulang, lalu kuota dipesan secara atomik (tanpa transaksi)
app.post('/api/krs', auth('mahasiswa'), wrap(async (req, res) => {
  const ids = [...new Set((req.body.kelas_ids || []).map(str))];

  const ada = await Pengajuan.findOne({ mahasiswa_id: req.user.pid, semester: SEMESTER, status: { $in: ['pending', 'approved'] } });
  if (ada) return res.status(409).json({ error: 'Pengajuan KRS semester ini sudah ada' });

  const errors = await validasi(req.user.pid, ids);
  if (errors.length) return res.status(400).json({ errors });

  // Ambil 1 kursi per kelas; hanya berhasil kalau kuota masih tersisa saat itu juga
  const lepas = (list) => Kelas.updateMany({ _id: { $in: list } }, { $inc: { kuota_terisi: -1 } });
  const dipesan = [];
  for (const id of ids) {
    const r = await Kelas.updateOne({ _id: id, $expr: { $lt: ['$kuota_terisi', '$kuota_maksimal'] } }, { $inc: { kuota_terisi: 1 } });
    if (r.modifiedCount !== 1) {
      await lepas(dipesan);
      return res.status(400).json({ errors: ['Ada kelas yang baru saja penuh, silakan pilih ulang'] });
    }
    dipesan.push(id);
  }

  let p;
  try {
    p = await Pengajuan.create({ mahasiswa_id: req.user.pid, semester: SEMESTER, kelas_ids: ids });
  } catch (e) {
    await lepas(dipesan);
    throw e;
  }

  res.status(201).json({ id: p.id, status: 'pending' });
}));

app.get('/api/krs/saya', auth('mahasiswa'), wrap(async (req, res) => {
  const list = await Pengajuan.find({ mahasiswa_id: req.user.pid }).sort({ _id: -1 });
  const kelas = await Kelas.find({ _id: { $in: list.flatMap((p) => p.kelas_ids) } });
  const mk = await MataKuliah.find({ kode: { $in: kelas.map((k) => k.kode_mk) } });
  const namaMk = Object.fromEntries(mk.map((m) => [m.kode, `${m.kode} ${m.nama}`]));
  const kodeKelas = Object.fromEntries(kelas.map((k) => [k.id, k.kode_mk]));
  res.json(list.map((p) => ({
    id: p.id, semester: p.semester, status: p.status, catatan: p.catatan, created_at: p.created_at,
    mata_kuliah: p.kelas_ids.map((k) => namaMk[kodeKelas[String(k)]]).filter(Boolean).join('; ')
  })));
}));

app.get('/api/dosen/status', auth('mahasiswa'), wrap(async (req, res) => {
  const m = await User.findById(req.user.pid);
  const d = m && m.dosen_pa_id && (await User.findById(m.dosen_pa_id));
  // online = dosen mengirim ping dalam 30 detik terakhir
  res.json(d ? { id: d.id, nama: d.nama, last_seen: d.last_seen,
    status_online: !!(d.last_seen && Date.now() - d.last_seen.getTime() < 30000) } : null);
}));

// ---------- Dosen PA ----------
// Dosen memanggil ini tiap ~15 detik selama halamannya terbuka (penanda online)
app.post('/api/dosen/ping', auth('dosen_pa'), wrap(async (req, res) => {
  await User.updateOne({ _id: req.user.pid }, { last_seen: new Date() });
  res.json({ ok: true });
}));

// Daftar pengajuan mahasiswa bimbingan, lengkap dengan detail mata kuliah yang diajukan
app.get('/api/dosen/pengajuan', auth('dosen_pa'), wrap(async (req, res) => {
  const mhs = await User.find({ role: 'mahasiswa', dosen_pa_id: req.user.pid });
  const byId = Object.fromEntries(mhs.map((m) => [m.id, m]));
  const list = await Pengajuan.find({ mahasiswa_id: { $in: mhs.map((m) => m._id) } }).sort({ _id: -1 });
  list.sort((a, b) => (b.status === 'pending') - (a.status === 'pending')); // pending di atas

  // Detail kelas + mata kuliah diambil sekali untuk semua pengajuan
  const kelas = await Kelas.find({ _id: { $in: list.flatMap((p) => p.kelas_ids) } });
  const mk = await MataKuliah.find({ kode: { $in: kelas.map((k) => k.kode_mk) } });
  const infoMk = Object.fromEntries(mk.map((m) => [m.kode, m]));
  const infoKelas = Object.fromEntries(kelas.map((k) => [k.id, k]));

  res.json(list.map((p) => {
    const m = byId[String(p.mahasiswa_id)];
    const mata_kuliah = p.kelas_ids.map((id) => infoKelas[String(id)]).filter(Boolean).map((k) => ({
      kode: k.kode_mk,
      nama: infoMk[k.kode_mk] && infoMk[k.kode_mk].nama,
      sks: infoMk[k.kode_mk] ? infoMk[k.kode_mk].sks : 0,
      hari: k.hari, jam_mulai: k.jam_mulai, jam_selesai: k.jam_selesai, ruang: k.ruang
    }));
    return { id: p.id, status: p.status, catatan: p.catatan, created_at: p.created_at,
      mahasiswa_id: m.id, nim: m.nim, nama: m.nama, ip_semester: m.ip_semester,
      mata_kuliah, total_sks: mata_kuliah.reduce((s, x) => s + (x.sks || 0), 0) };
  }));
}));

app.patch('/api/krs/:id/keputusan', auth('dosen_pa'), wrap(async (req, res) => {
  const { status, catatan } = req.body;
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Status harus approved atau rejected' });
  if (status === 'rejected' && !catatan) return res.status(400).json({ error: 'Catatan wajib diisi saat menolak' });
  if (!HEX.test(req.params.id)) return res.status(404).json({ error: 'Pengajuan pending tidak ditemukan' });

  const bimbingan = await User.find({ role: 'mahasiswa', dosen_pa_id: req.user.pid }).select('_id');
  // Ubah status hanya jika masih pending (mencegah diproses dua kali)
  const p = await Pengajuan.findOneAndUpdate(
    { _id: req.params.id, status: 'pending', mahasiswa_id: { $in: bimbingan.map((m) => m._id) } },
    { status, catatan: catatan ? str(catatan) : null }, { new: true });
  if (!p) return res.status(404).json({ error: 'Pengajuan pending tidak ditemukan' });

  if (status === 'rejected') // lepas kuota yang dikunci
    await Kelas.updateMany({ _id: { $in: p.kelas_ids } }, { $inc: { kuota_terisi: -1 } });
  res.json({ id: p.id, status });
}));

// ---------- Chat (polling: klien meminta pesan baru tiap beberapa detik) ----------
// ?after=<id pesan terakhir> -> hanya pesan yang lebih baru
app.get('/api/chat/:mahasiswaId', auth('mahasiswa', 'dosen_pa'), wrap(async (req, res) => {
  const m = HEX.test(req.params.mahasiswaId) && (await User.findOne({ _id: req.params.mahasiswaId, role: 'mahasiswa' }));
  const boleh = m && (req.user.role === 'mahasiswa' ? req.user.pid === m.id : req.user.pid === String(m.dosen_pa_id));
  if (!boleh) return res.status(403).json({ error: 'Akses ditolak' });
  const after = str(req.query.after);
  res.json(await Pesan.find({ mahasiswa_id: m._id, ...(HEX.test(after) ? { _id: { $gt: after } } : {}) }).sort({ _id: 1 }));
}));

app.post('/api/chat', auth('mahasiswa', 'dosen_pa'), wrap(async (req, res) => {
  const isi = str(req.body.isi).trim().slice(0, 2000);
  if (!isi) return res.status(400).json({ error: 'Pesan kosong' });
  let m;
  if (req.user.role === 'mahasiswa') {
    m = await User.findById(req.user.pid);
    if (!m || !m.dosen_pa_id) return res.status(400).json({ error: 'Anda belum memiliki dosen PA' });
  } else {
    const mid = str(req.body.mahasiswa_id);
    m = HEX.test(mid) && (await User.findOne({ _id: mid, role: 'mahasiswa', dosen_pa_id: req.user.pid }));
    if (!m) return res.status(403).json({ error: 'Akses ditolak' });
  }
  const p = await Pesan.create({ mahasiswa_id: m._id, dosen_pa_id: m.dosen_pa_id, pengirim: req.user.role, isi });
  res.status(201).json(p);
}));

// ---------- Admin: akun pengguna (CRUD) ----------
app.get('/api/admin/users', auth('admin'), wrap(async (req, res) => {
  res.json(await User.find().sort({ _id: 1 }));
}));

app.post('/api/admin/users', auth('admin'), wrap(async (req, res) => {
  const { username, email, password, role, nama, nim, nip, prodi, dosen_pa_id } = req.body;
  if (!username || !email || !password || !['mahasiswa', 'dosen_pa', 'admin'].includes(role))
    return res.status(400).json({ error: 'username, email, password, dan role wajib valid' });
  if (!/^\S+@\S+\.\S+$/.test(str(email))) return res.status(400).json({ error: 'Format email tidak valid' });
  if (role !== 'admin' && !nama) return res.status(400).json({ error: 'Nama wajib diisi' });
  if (role === 'mahasiswa' && !nim) return res.status(400).json({ error: 'NIM wajib diisi' });
  if (role === 'dosen_pa' && !nip) return res.status(400).json({ error: 'NIP wajib diisi' });

  const data = { username: str(username), email: str(email), password_hash: await bcrypt.hash(str(password), 10), role };
  if (role === 'mahasiswa') {
    Object.assign(data, { nama: str(nama), nim: str(nim), prodi: prodi ? str(prodi) : undefined });
    if (dosen_pa_id) { // boleh berisi NIP atau ID dosen
      const d = await cari('dosen_pa', dosen_pa_id);
      if (!d) return res.status(400).json({ error: 'Dosen PA tidak ditemukan' });
      data.dosen_pa_id = d._id;
    }
  }
  if (role === 'dosen_pa') Object.assign(data, { nama: str(nama), nip: str(nip) });
  const u = await User.create(data);
  res.status(201).json({ id: u.id });
}));

app.put('/api/admin/users/:id', auth('admin'), wrap(async (req, res) => {
  const { email, nama, password, aktif, dosen_pa_id } = req.body;
  const u = HEX.test(req.params.id) && (await User.findById(req.params.id));
  if (!u) return res.status(404).json({ error: 'Akun tidak ditemukan' });
  if (email) u.email = str(email);
  if (password) u.password_hash = await bcrypt.hash(str(password), 10); // reset password
  if (aktif !== undefined) u.aktif = !!aktif;
  if (nama && u.role !== 'admin') u.nama = str(nama);
  if (u.role === 'mahasiswa' && dosen_pa_id !== undefined) { // ganti / kosongkan dosen PA
    if (!dosen_pa_id) u.dosen_pa_id = undefined;
    else {
      const d = await cari('dosen_pa', dosen_pa_id);
      if (!d) return res.status(400).json({ error: 'Dosen PA tidak ditemukan' });
      u.dosen_pa_id = d._id;
    }
  }
  await u.save();
  res.json({ ok: true });
}));

// Hapus = nonaktifkan (data riwayat tetap utuh)
app.delete('/api/admin/users/:id', auth('admin'), wrap(async (req, res) => {
  if (HEX.test(req.params.id)) await User.updateOne({ _id: req.params.id }, { aktif: false });
  res.json({ ok: true });
}));

// ---------- Admin: data akademik ----------
app.get('/api/admin/mata-kuliah', auth('admin'), wrap(async (req, res) => {
  res.json(await MataKuliah.find().sort({ kode: 1 }));
}));

app.post('/api/admin/mata-kuliah', auth('admin'), wrap(async (req, res) => {
  const { kode, nama, sks, prasyarat } = req.body;
  if (!kode || !nama || !sks) return res.status(400).json({ error: 'kode, nama, dan sks wajib diisi' });
  await MataKuliah.create({ kode: str(kode), nama: str(nama), sks: Number(sks), prasyarat: Array.isArray(prasyarat) ? prasyarat.map(str) : [] });
  res.status(201).json({ kode });
}));

app.put('/api/admin/mata-kuliah/:kode', auth('admin'), wrap(async (req, res) => {
  const { nama, sks, prasyarat } = req.body;
  await MataKuliah.updateOne({ kode: str(req.params.kode) },
    { nama: str(nama), sks: Number(sks), prasyarat: Array.isArray(prasyarat) ? prasyarat.map(str) : [] }, { runValidators: true });
  res.json({ ok: true });
}));

app.delete('/api/admin/mata-kuliah/:kode', auth('admin'), wrap(async (req, res) => {
  const kode = str(req.params.kode);
  if ((await Kelas.exists({ kode_mk: kode })) || (await Kelulusan.exists({ kode_mk: kode })))
    return res.status(409).json({ error: 'Tidak bisa dihapus: mata kuliah ini masih dipakai kelas atau riwayat kelulusan' });
  await MataKuliah.deleteOne({ kode });
  res.json({ ok: true });
}));

app.post('/api/admin/kelas', auth('admin'), wrap(async (req, res) => {
  const { kode_mk, hari, jam_mulai, jam_selesai, ruang, kuota_maksimal } = req.body;
  if (!(await MataKuliah.exists({ kode: str(kode_mk) }))) return res.status(400).json({ error: 'Mata kuliah tidak ditemukan' });
  const k = await Kelas.create({ kode_mk: str(kode_mk), hari, jam_mulai, jam_selesai, ruang, kuota_maksimal });
  res.status(201).json({ id: k.id });
}));

app.put('/api/admin/kelas/:id', auth('admin'), wrap(async (req, res) => {
  if (!HEX.test(req.params.id)) return res.status(404).json({ error: 'Kelas tidak ditemukan' });
  const { hari, jam_mulai, jam_selesai, ruang, kuota_maksimal } = req.body;
  await Kelas.updateOne({ _id: req.params.id }, { hari, jam_mulai, jam_selesai, ruang, kuota_maksimal }, { runValidators: true });
  res.json({ ok: true });
}));

app.delete('/api/admin/kelas/:id', auth('admin'), wrap(async (req, res) => {
  if (!HEX.test(req.params.id)) return res.status(404).json({ error: 'Kelas tidak ditemukan' });
  if (await Pengajuan.exists({ kelas_ids: req.params.id }))
    return res.status(409).json({ error: 'Tidak bisa dihapus: kelas ini sudah dipakai pengajuan KRS' });
  await Kelas.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
}));

app.get('/api/admin/kelulusan', auth('admin'), wrap(async (req, res) => {
  const rows = await Kelulusan.find();
  const [mhs, mk] = await Promise.all([
    User.find({ _id: { $in: rows.map((r) => r.mahasiswa_id) } }),
    MataKuliah.find({ kode: { $in: rows.map((r) => r.kode_mk) } })
  ]);
  const m = Object.fromEntries(mhs.map((x) => [x.id, x]));
  const n = Object.fromEntries(mk.map((x) => [x.kode, x.nama]));
  res.json(rows.map((r) => ({
    id: r.id, nim: m[String(r.mahasiswa_id)].nim, mahasiswa: m[String(r.mahasiswa_id)].nama,
    kode_mk: r.kode_mk, mata_kuliah: n[r.kode_mk], lulus: r.lulus
  })).sort((a, b) => a.nim.localeCompare(b.nim) || a.kode_mk.localeCompare(b.kode_mk)));
}));

app.post('/api/admin/kelulusan', auth('admin'), wrap(async (req, res) => {
  const { mahasiswa_id, kode_mk, lulus } = req.body; // mahasiswa_id boleh berisi NIM
  if (!mahasiswa_id || !kode_mk || lulus === undefined) return res.status(400).json({ error: 'mahasiswa_id (NIM), kode_mk, lulus wajib diisi' });
  const m = await cari('mahasiswa', mahasiswa_id);
  if (!m) return res.status(404).json({ error: 'Mahasiswa tidak ditemukan' });
  if (!(await MataKuliah.exists({ kode: str(kode_mk) }))) return res.status(404).json({ error: 'Mata kuliah tidak ditemukan' });
  await Kelulusan.updateOne({ mahasiswa_id: m._id, kode_mk: str(kode_mk) }, { lulus: !!lulus }, { upsert: true }); // upsert = koreksi data
  res.json({ ok: true });
}));

const PORT = process.env.PORT || 3000;
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/krs_klabat')
  .then(() => app.listen(PORT, () => console.log(`API KRS berjalan di http://localhost:${PORT}`)))
  .catch((e) => { console.error('Gagal konek MongoDB:', e.message); process.exit(1); });