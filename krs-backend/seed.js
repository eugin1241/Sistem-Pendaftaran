// Data contoh untuk uji coba. Jalankan: npm run seed (aman dijalankan berulang: data lama dihapus)
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const M = require('./models');

(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/krs_klabat');
  await Promise.all(Object.values(M).map((m) => m.deleteMany({})));

  const hash = await bcrypt.hash('password123', 10);
  const akun = (username, role, extra = {}) =>
    M.User.create({ username, email: `${username}@contoh.ac.id`, password_hash: hash, role, ...extra });

  await akun('admin', 'admin');
  const dosen = await akun('dosen1', 'dosen_pa', { nip: '1001', nama: 'Dosen PA Satu' });
  const mhs = await akun('mhs1', 'mahasiswa', { nim: '10001', nama: 'Mahasiswa Satu', prodi: 'Informatika', ip_semester: 3.4, dosen_pa_id: dosen._id });

  await M.MataKuliah.insertMany([
    { kode: 'IF101', nama: 'Algoritma', sks: 3, prasyarat: [] },
    { kode: 'IF201', nama: 'Struktur Data', sks: 3, prasyarat: ['IF101'] },
    { kode: 'IF301', nama: 'Basis Data', sks: 3, prasyarat: ['IF201'] }
  ]);
  await M.Kelas.insertMany([
    { kode_mk: 'IF201', hari: 'Senin', jam_mulai: '08:00', jam_selesai: '10:00', ruang: 'R1', kuota_maksimal: 30 },
    { kode_mk: 'IF301', hari: 'Senin', jam_mulai: '09:00', jam_selesai: '11:00', ruang: 'R2', kuota_maksimal: 30 },
    { kode_mk: 'IF301', hari: 'Selasa', jam_mulai: '08:00', jam_selesai: '10:00', ruang: 'R2', kuota_maksimal: 1 }
  ]);
  await M.Kelulusan.create({ mahasiswa_id: mhs._id, kode_mk: 'IF101', lulus: true });

  console.log('Seed selesai. Login: admin / dosen1 / mhs1, password: password123');
  await mongoose.disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
