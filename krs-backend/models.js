const mongoose = require('mongoose');
const { Schema, model } = mongoose;
const ObjectId = Schema.Types.ObjectId;

// Semua respons JSON: _id -> id (string), sembunyikan password_hash
mongoose.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = String(ret._id);
    delete ret._id; delete ret.__v; delete ret.password_hash;
    return ret;
  }
});

// Satu koleksi untuk semua akun; profil mahasiswa/dosen langsung menempel di dokumen
const User = model('User', new Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password_hash: { type: String, required: true },
  role: { type: String, enum: ['mahasiswa', 'dosen_pa', 'admin'], required: true },
  aktif: { type: Boolean, default: true },
  nama: String,
  // mahasiswa
  nim: { type: String, unique: true, sparse: true },
  prodi: String,
  ip_semester: { type: Number, default: 0 },
  dosen_pa_id: { type: ObjectId, ref: 'User' },
  // dosen PA
  nip: { type: String, unique: true, sparse: true },
  last_seen: Date               // diperbarui oleh ping dosen (penanda online)
}));

const MataKuliah = model('MataKuliah', new Schema({
  kode: { type: String, required: true, unique: true },
  nama: { type: String, required: true },
  sks: { type: Number, required: true },
  prasyarat: { type: [String], default: [] }   // contoh: ['IF101','IF102']
}));

const Kelas = model('Kelas', new Schema({
  kode_mk: { type: String, required: true },
  hari: { type: String, enum: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'], required: true },
  jam_mulai: { type: String, required: true },    // 'HH:MM'
  jam_selesai: { type: String, required: true },
  ruang: String,
  kuota_maksimal: { type: Number, required: true, min: 0 },
  kuota_terisi: { type: Number, default: 0, min: 0 }
}));

const Kelulusan = model('Kelulusan', (() => {
  const s = new Schema({
    mahasiswa_id: { type: ObjectId, required: true },
    kode_mk: { type: String, required: true },
    lulus: { type: Boolean, required: true }
  });
  s.index({ mahasiswa_id: 1, kode_mk: 1 }, { unique: true });
  return s;
})());

const Pengajuan = model('Pengajuan', new Schema({
  mahasiswa_id: { type: ObjectId, required: true, index: true },
  semester: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  catatan: { type: String, default: null },
  kelas_ids: [{ type: ObjectId, ref: 'Kelas' }],
  created_at: { type: Date, default: Date.now }
}));

const Pesan = model('Pesan', new Schema({
  mahasiswa_id: { type: ObjectId, required: true, index: true },
  dosen_pa_id: { type: ObjectId, required: true },
  pengirim: { type: String, enum: ['mahasiswa', 'dosen_pa'], required: true },
  isi: { type: String, required: true },
  dibaca: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now }
}));

module.exports = { User, MataKuliah, Kelas, Kelulusan, Pengajuan, Pesan };
