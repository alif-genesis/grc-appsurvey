'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { serviceToSlug, serviceTypes, withBasePath } from '../services';

type BlastPerson = {
  id: string;
  name: string;
  whatsapp: string;
  email: string;
  serviceType: string;
};

type BlastHistory = {
  id: string;
  channel: 'WhatsApp' | 'Email';
  personName: string;
  whatsapp: string;
  email: string;
  serviceType: string;
  surveyLink: string;
  message: string;
  status: 'Sukses' | 'Gagal';
  error?: string;
  createdAt: string;
};

type EmailBlastResult = Omit<BlastHistory, 'id' | 'channel' | 'createdAt'>;

const PEOPLE_STORAGE_KEY = 'genesis-blasting-people';
const HISTORY_STORAGE_KEY = 'genesis-blasting-history';

const emptyPerson = {
  name: '',
  whatsapp: '',
  email: '',
  serviceType: serviceTypes[0] ?? '',
};

const createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const loadFromStorage = <T,>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? JSON.parse(stored) as T : fallback;
  } catch {
    return fallback;
  }
};

const saveToStorage = <T,>(key: string, value: T) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
};

const getSurveyLink = (serviceType: string) => withBasePath(`/${serviceToSlug(serviceType)}`);

const buildMessage = (person: BlastPerson, channel: BlastHistory['channel']) => {
  const link = getSurveyLink(person.serviceType);
  const target = channel === 'WhatsApp' ? person.whatsapp : person.email;
  return `Halo ${person.name}, mohon isi survei ${person.serviceType} melalui link ${link}. Dikirim ke ${target}.`;
};

export default function BlastingPage() {
  const [people, setPeople] = useState<BlastPerson[]>([]);
  const [history, setHistory] = useState<BlastHistory[]>([]);
  const [newPerson, setNewPerson] = useState(emptyPerson);
  const [isEmailBlasting, setIsEmailBlasting] = useState(false);
  const [blastNotice, setBlastNotice] = useState('');

  useEffect(() => {
    setPeople(loadFromStorage<BlastPerson[]>(PEOPLE_STORAGE_KEY, []));
    setHistory(loadFromStorage<BlastHistory[]>(HISTORY_STORAGE_KEY, []));
  }, []);

  useEffect(() => {
    saveToStorage(PEOPLE_STORAGE_KEY, people);
  }, [people]);

  useEffect(() => {
    saveToStorage(HISTORY_STORAGE_KEY, history);
  }, [history]);

  const readyPeople = useMemo(
    () => people.filter((person) => person.name.trim() && person.serviceType.trim()),
    [people],
  );

  const addPerson = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const person: BlastPerson = {
      id: createId(),
      name: newPerson.name.trim(),
      whatsapp: newPerson.whatsapp.trim(),
      email: newPerson.email.trim(),
      serviceType: newPerson.serviceType,
    };

    setPeople((current) => [person, ...current]);
    setNewPerson(emptyPerson);
  };

  const updatePerson = (id: string, field: keyof Omit<BlastPerson, 'id'>, value: string) => {
    setPeople((current) => current.map((person) => (
      person.id === id ? { ...person, [field]: value } : person
    )));
  };

  const deletePerson = (id: string) => {
    setPeople((current) => current.filter((person) => person.id !== id));
  };

  const startWhatsAppBlast = () => {
    const now = new Date().toISOString();
    const rows = readyPeople
      .filter((person) => person.whatsapp.trim())
      .map((person) => ({
        id: createId(),
        channel: 'WhatsApp' as const,
        personName: person.name,
        whatsapp: person.whatsapp,
        email: person.email,
        serviceType: person.serviceType,
        surveyLink: getSurveyLink(person.serviceType),
        message: buildMessage(person, 'WhatsApp'),
        status: 'Sukses' as const,
        createdAt: now,
      }));

    setHistory((current) => [...rows, ...current]);
    setBlastNotice(`${rows.length} blast WhatsApp dummy ditambahkan ke riwayat.`);
  };

  const startEmailBlast = async () => {
    const recipients = readyPeople.filter((person) => person.email.trim());
    if (recipients.length === 0) return;

    setIsEmailBlasting(true);
    setBlastNotice('');

    try {
      const response = await fetch(withBasePath('/api/blast/email'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients }),
      });
      const payload = await response.json() as { results?: EmailBlastResult[]; error?: string };

      if (!response.ok) {
        throw new Error(payload.error || 'Email blast gagal diproses.');
      }

      const now = new Date().toISOString();
      const rows = (payload.results ?? []).map((result) => ({
        id: createId(),
        channel: 'Email' as const,
        createdAt: now,
        ...result,
      }));

      setHistory((current) => [...rows, ...current]);

      const successCount = rows.filter((row) => row.status === 'Sukses').length;
      const failedCount = rows.length - successCount;
      setBlastNotice(`Email blast selesai: ${successCount} sukses, ${failedCount} gagal.`);
    } catch (error) {
      setBlastNotice(error instanceof Error ? error.message : 'Email blast gagal diproses.');
    } finally {
      setIsEmailBlasting(false);
    }
  };

  const clearHistory = () => {
    setHistory([]);
  };

  return (
    <main className="page-shell admin-shell">
      <div className="survey-header admin-header">
        <div className="brand-block">
          <img
            className="brand-image"
            src="https://genetikasolusibisnis.co.id/wp-content/uploads/2022/09/genetika-1-warna.png"
            alt="Genesis"
          />
          <div className="admin-brand-text">
            <p className="agency">Admin Dashboard</p>
            <h1>Blasting</h1>
          </div>
        </div>
      </div>

      <div className="admin-link-row">
        <div className="admin-actions">
          <a className="admin-link" href={withBasePath('/admin')}>Kembali ke Admin</a>
          <a className="admin-link" href={withBasePath('/')}>Pilih Layanan</a>
        </div>
      </div>

      <section className="blast-action-grid">
        <button
          type="button"
          className="blast-action-card"
          onClick={startEmailBlast}
          disabled={isEmailBlasting || readyPeople.every((person) => !person.email.trim())}
        >
          <span>{isEmailBlasting ? 'Mengirim Email...' : 'Start Blast Email'}</span>
          <small>{readyPeople.filter((person) => person.email.trim()).length} penerima siap</small>
        </button>
        <button
          type="button"
          className="blast-action-card"
          onClick={startWhatsAppBlast}
          disabled={readyPeople.every((person) => !person.whatsapp.trim())}
        >
          <span>Start Blast WhatsApp</span>
          <small>{readyPeople.filter((person) => person.whatsapp.trim()).length} penerima siap</small>
        </button>
      </section>
      {blastNotice && <p className="blast-notice">{blastNotice}</p>}

      <section className="table-card blast-section">
        <div className="section-heading-row">
          <h2>User Management</h2>
          <span>{people.length} orang</span>
        </div>

        <form className="add-person-form" onSubmit={addPerson}>
          <label>
            Nama
            <input
              value={newPerson.name}
              onChange={(event) => setNewPerson((current) => ({ ...current, name: event.target.value }))}
              placeholder="Alif"
              required
            />
          </label>
          <label>
            WhatsApp
            <input
              value={newPerson.whatsapp}
              onChange={(event) => setNewPerson((current) => ({ ...current, whatsapp: event.target.value }))}
              placeholder="085695763976"
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={newPerson.email}
              onChange={(event) => setNewPerson((current) => ({ ...current, email: event.target.value }))}
              placeholder="nama@email.com"
            />
          </label>
          <label>
            Layanan
            <select
              value={newPerson.serviceType}
              onChange={(event) => setNewPerson((current) => ({ ...current, serviceType: event.target.value }))}
              required
            >
              {serviceTypes.map((service) => (
                <option key={service} value={service}>{service}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="download-button">Add People</button>
        </form>

        {people.length === 0 ? (
          <p>Belum ada user. Tambahkan orang terlebih dahulu untuk mulai blast.</p>
        ) : (
          <div className="blast-table-wrapper">
            <table className="blast-table">
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>WhatsApp</th>
                  <th>Email</th>
                  <th>Layanan</th>
                  <th>Link</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {people.map((person) => (
                  <tr key={person.id}>
                    <td>
                      <input
                        value={person.name}
                        onChange={(event) => updatePerson(person.id, 'name', event.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        value={person.whatsapp}
                        onChange={(event) => updatePerson(person.id, 'whatsapp', event.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="email"
                        value={person.email}
                        onChange={(event) => updatePerson(person.id, 'email', event.target.value)}
                      />
                    </td>
                    <td>
                      <select
                        value={person.serviceType}
                        onChange={(event) => updatePerson(person.id, 'serviceType', event.target.value)}
                      >
                        {serviceTypes.map((service) => (
                          <option key={service} value={service}>{service}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <a href={getSurveyLink(person.serviceType)}>{getSurveyLink(person.serviceType)}</a>
                    </td>
                    <td>
                      <button type="button" className="text-button danger-button" onClick={() => deletePerson(person.id)}>
                        Hapus
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="table-card blast-section">
        <div className="section-heading-row">
          <h2>Riwayat Blast</h2>
          {history.length > 0 && (
            <button type="button" className="text-button" onClick={clearHistory}>Bersihkan Riwayat</button>
          )}
        </div>

        {history.length === 0 ? (
          <p>Belum ada riwayat blast.</p>
        ) : (
          <div className="blast-table-wrapper">
            <table className="blast-table history-table">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Channel</th>
                  <th>Nama</th>
                  <th>Tujuan</th>
                  <th>Layanan</th>
                  <th>Link</th>
                  <th>Status</th>
                  <th>Error</th>
                  <th>Pesan</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.createdAt).toLocaleString('id-ID')}</td>
                    <td>{row.channel}</td>
                    <td>{row.personName}</td>
                    <td>{row.channel === 'WhatsApp' ? row.whatsapp : row.email}</td>
                    <td>{row.serviceType}</td>
                    <td><a href={row.surveyLink}>{row.surveyLink}</a></td>
                    <td><span className={`status-pill ${row.status === 'Gagal' ? 'failed-pill' : ''}`}>{row.status}</span></td>
                    <td>{row.error || '-'}</td>
                    <td>{row.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
