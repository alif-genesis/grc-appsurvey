export const serviceTypes = [
  'Layanan Pengajuan Pembayaran Permintaan LS Belanja Non Pegawai dan LS Pihak Ketiga',
  'Layanan Pengajuan Revisi POK Anggaran',
  'Layanan Pengajuan Revisi Anggaran Melalui Kementerian Keuangan',
  'Layanan Pembuatan Konten Media Sosial/Media Luar Ruang Ditjen Ekosistem Digital',
  'Layanan Peminjaman Arsip',
  'Layanan Permohonan Pemeliharaan Barang Milik Negara',
  'Layanan Permohonan Kebutuhan Persediaan',
  'Layanan Permohonan Usulan Kebutuhan BMN',
  'Layanan Penyusunan Penelaahan Permasalahan Hukum Bidang Ekosistem Digital',
  'Layanan Pengusulan Surat Izin Perjalanan Dinas Luar Negeri Ditjen Ekosistem Digital',
  'Layanan Penyusunan/Penyempurnaan Rancangan Peraturan dan Instrumen Hukum',
  'Layanan Pengajuan Cuti Di Luar Tanggungan Negara',
  'Layanan Pengajuan KP4 (Kartu Permohonan Penambahan Penghasilan Pegawai)',
  'Layanan Pengajuan Pensiun',
  'Layanan Pengajuan Usulan Perpindahan Pegawai',
  'Layanan Pengajuan Tugas Belajar',
  'Layanan Pencantuman Gelar',
  'Layanan Kenaikan Pangkat',
  'Layanan Kenaikan Gaji Berkala',
  'Layanan Pengajuan Izin Perceraian',
  'Layanan Penanganan Insiden Website DJED',
];

export const GENESIS_LOGO_URL = 'https://genetikasolusibisnis.co.id/wp-content/uploads/2022/09/genetika-1-warna.png';
export const KOMDIGI_LOGO_URL = 'https://upload.wikimedia.org/wikipedia/commons/f/fc/Logo_Kementerian_Komunikasi_dan_Digital_Republik_Indonesia_%282024_full_version%29.svg';

export const serviceToSlug = (service: string) =>
  service
    .trim()
    .toLowerCase()
    .replace(/&/g, 'dan')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const withBasePath = (path: string) => {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
  if (!path.startsWith('/')) return `${basePath}/${path}`;
  return `${basePath}${path}`;
};

const normalizePathValue = (value: string) =>
  value
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .join('-')
    .toLowerCase();

export const getServiceFromPath = (pathname: string) => {
  const decodedPath = decodeURIComponent(pathname).replace(/^\/+|\/+$/g, '');
  if (!decodedPath) return '';

  const normalizedPath = serviceToSlug(normalizePathValue(decodedPath));
  return serviceTypes.find((service) => serviceToSlug(service) === normalizedPath) || '';
};
