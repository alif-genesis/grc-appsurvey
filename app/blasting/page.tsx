'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { serviceToSlug, serviceTypes, withBasePath } from '../services';

type BlastPerson = {
  id: string;
  name: string;
  whatsapp: string;
  email: string;
  serviceType?: string;
  serviceTypes: string[];
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
  sentAt?: string | null;
  openedAt?: string | null;
  clickedAt?: string | null;
  submittedAt?: string | null;
};

type EmailBlastResult = Omit<BlastHistory, 'channel' | 'createdAt'>;

const PEOPLE_STORAGE_KEY = 'genesis-blasting-people';
const HISTORY_STORAGE_KEY = 'genesis-blasting-history';

const emptyPerson = {
  name: '',
  whatsapp: '',
  email: '',
  serviceTypes: serviceTypes[0] ? [serviceTypes[0]] : [],
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
const getMultiSurveyLink = () => withBasePath('/multi-survey');

const getPersonServices = (person: Pick<BlastPerson, 'serviceType' | 'serviceTypes'>) => (
  person.serviceTypes?.length ? person.serviceTypes : person.serviceType ? [person.serviceType] : []
);

const buildMessage = (person: BlastPerson, channel: BlastHistory['channel']) => {
  const services = getPersonServices(person);
  const link = services.length > 1 ? getMultiSurveyLink() : getSurveyLink(services[0]);
  const target = channel === 'WhatsApp' ? person.whatsapp : person.email;
  return `Halo ${person.name}, mohon isi survei ${services.join(', ')} melalui link ${link}. Dikirim ke ${target}.`;
};

const formatDateTime = (value?: string | null) => (
  value ? new Date(value).toLocaleString('id-ID') : '-'
);

const getMonitoringStatus = (row: BlastHistory) => {
  if (row.status === 'Gagal') return 'Gagal dikirim';
  if (row.submittedAt) return 'Terima dan sudah isi';
  if (row.clickedAt) return 'Terima, buka link, belum isi';
  if (row.openedAt) return 'Terima, buka email, belum isi';
  if (row.sentAt || row.status === 'Sukses') return 'Terima, belum buka email/link';
  return 'Belum terkirim';
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
    refreshHistory();
  }, []);

  useEffect(() => {
    saveToStorage(PEOPLE_STORAGE_KEY, people);
  }, [people]);

  useEffect(() => {
    saveToStorage(HISTORY_STORAGE_KEY, history);
  }, [history]);

  const readyPeople = useMemo(
    () => people.filter((person) => person.name.trim() && getPersonServices(person).length > 0),
    [people],
  );

  const refreshHistory = async () => {
    try {
      const response = await fetch(withBasePath('/api/blast/history'), { cache: 'no-store' });
      const payload = await response.json() as { records?: BlastHistory[]; error?: string };

      if (!response.ok) throw new Error(payload.error || 'Gagal mengambil monitoring blast.');

      setHistory(payload.records ?? []);
    } catch (error) {
      setBlastNotice(error instanceof Error ? error.message : 'Gagal mengambil monitoring blast.');
    }
  };

  const addPerson = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const person: BlastPerson = {
      id: createId(),
      name: newPerson.name.trim(),
      whatsapp: newPerson.whatsapp.trim(),
      email: newPerson.email.trim(),
      serviceTypes: newPerson.serviceTypes,
    };

    setPeople((current) => [person, ...current]);
    setNewPerson(emptyPerson);
  };

  const updatePerson = (id: string, field: keyof Omit<BlastPerson, 'id' | 'serviceTypes'>, value: string) => {
    setPeople((current) => current.map((person) => (
      person.id === id ? { ...person, [field]: value } : person
    )));
  };

  const toggleNewPersonService = (service: string) => {
    setNewPerson((current) => {
      const exists = current.serviceTypes.includes(service);
      const serviceList = exists
        ? current.serviceTypes.filter((item) => item !== service)
        : [...current.serviceTypes, service];
      return { ...current, serviceTypes: serviceList };
    });
  };

  const togglePersonService = (id: string, service: string) => {
    setPeople((current) => current.map((person) => {
      if (person.id !== id) return person;
      const currentServices = getPersonServices(person);
      const exists = currentServices.includes(service);
      const serviceList = exists
        ? currentServices.filter((item) => item !== service)
        : [...currentServices, service];
      return { ...person, serviceTypes: serviceList };
    }));
  };

  const deletePerson = (id: string) => {
    setPeople((current) => current.filter((person) => person.id !== id));
  };

  const startWhatsAppBlast = () => {
    const now = new Date().toISOString();
    const rows = readyPeople
      .filter((person) => person.whatsapp.trim())
      .flatMap((person) => getPersonServices(person).map((serviceType) => ({
          id: createId(),
          channel: 'WhatsApp' as const,
          personName: person.name,
          whatsapp: person.whatsapp,
          email: person.email,
          serviceType,
          surveyLink: getSurveyLink(serviceType),
          message: buildMessage(person, 'WhatsApp'),
          status: 'Sukses' as const,
          createdAt: now,
          sentAt: now,
        })));

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
        channel: 'Email' as const,
        createdAt: now,
        ...result,
      }));

      setHistory((current) => [...rows, ...current]);
      refreshHistory();

      const successCount = rows.filter((row) => row.status === 'Sukses').length;
      const failedCount = rows.length - successCount;
      setBlastNotice(`Email blast selesai: ${successCount} sukses, ${failedCount} gagal.`);
    } catch (error) {
      setBlastNotice(error instanceof Error ? error.message : 'Email blast gagal diproses.');
    } finally {
      setIsEmailBlasting(false);
    }
  };

  const clearHistory = async () => {
    try {
      const response = await fetch(withBasePath('/api/blast/history'), { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error || 'Gagal membersihkan riwayat blast.');
      }
      setHistory([]);
      setBlastNotice('Riwayat blast dibersihkan.');
    } catch (error) {
      setBlastNotice(error instanceof Error ? error.message : 'Gagal membersihkan riwayat blast.');
    }
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
            <div className="service-checkbox-list">
              {serviceTypes.map((service) => (
                <label key={service} className="service-checkbox-item">
                  <input
                    type="checkbox"
                    checked={newPerson.serviceTypes.includes(service)}
                    onChange={() => toggleNewPersonService(service)}
                  />
                  <span>{service}</span>
                </label>
              ))}
            </div>
          </label>
          <button type="submit" className="download-button" disabled={newPerson.serviceTypes.length === 0}>Add People</button>
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
                      <div className="service-checkbox-list compact-service-list">
                        {serviceTypes.map((service) => (
                          <label key={service} className="service-checkbox-item">
                            <input
                              type="checkbox"
                              checked={getPersonServices(person).includes(service)}
                              onChange={() => togglePersonService(person.id, service)}
                            />
                            <span>{service}</span>
                          </label>
                        ))}
                      </div>
                    </td>
                    <td>
                      {getPersonServices(person).length === 0 ? (
                        <span>Belum ada layanan</span>
                      ) : getPersonServices(person).length > 1 ? (
                        <span>{getPersonServices(person).length} layanan dalam 1 link email</span>
                      ) : (
                        <a href={getSurveyLink(getPersonServices(person)[0])}>{getSurveyLink(getPersonServices(person)[0])}</a>
                      )}
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
          <div className="inline-actions">
            <button type="button" className="text-button" onClick={refreshHistory}>Refresh</button>
            {history.length > 0 && (
              <button type="button" className="text-button" onClick={clearHistory}>Bersihkan Riwayat</button>
            )}
          </div>
        </div>

        {history.length === 0 ? (
          <p>Belum ada riwayat blast.</p>
        ) : (
          <div className="blast-table-wrapper">
            <table className="blast-table history-table">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Nama</th>
                  <th>Tujuan</th>
                  <th>Layanan</th>
                  <th>Link</th>
                  <th>Terkirim</th>
                  <th>Email Dibuka</th>
                  <th>Link Dibuka</th>
                  <th>Sudah Isi</th>
                  <th>Monitoring</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.createdAt).toLocaleString('id-ID')}</td>
                    <td>{row.personName}</td>
                    <td>{row.channel === 'WhatsApp' ? row.whatsapp : row.email}</td>
                    <td>{row.serviceType}</td>
                    <td><a href={row.surveyLink}>{row.surveyLink}</a></td>
                    <td>{formatDateTime(row.sentAt)}</td>
                    <td>{formatDateTime(row.openedAt)}</td>
                    <td>{formatDateTime(row.clickedAt)}</td>
                    <td>{formatDateTime(row.submittedAt)}</td>
                    <td>
                      <span className={`status-pill ${row.status === 'Gagal' ? 'failed-pill' : row.submittedAt ? 'done-pill' : ''}`}>
                        {getMonitoringStatus(row)}
                      </span>
                    </td>
                    <td>{row.error || '-'}</td>
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
