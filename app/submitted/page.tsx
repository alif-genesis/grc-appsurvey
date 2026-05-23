import { KOMDIGI_LOGO_URL } from '../services';

export default function SubmittedPage() {
  return (
    <main className="submitted-page">
      <section className="submitted-panel">
        <img
          className="brand-image"
          src={KOMDIGI_LOGO_URL}
          alt="Logo Komdigi"
        />
        <h1>Survey Sudah Disubmit</h1>
        <p>Terima kasih. Jawaban Anda telah kami terima.</p>
      </section>
    </main>
  );
}
