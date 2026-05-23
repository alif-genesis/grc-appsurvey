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

type BlastPersonDraft = Pick<BlastPerson, 'name' | 'whatsapp' | 'email' | 'serviceTypes'>;

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
const MAX_EMAIL_RECIPIENTS = 5;
const EMAIL_BATCH_DELAY_MS = 3000;

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

const sleep = (ms: number) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

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
  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>([]);
  const [history, setHistory] = useState<BlastHistory[]>([]);
  const [newPerson, setNewPerson] = useState(emptyPerson);
  const [editDrafts, setEditDrafts] = useState<Record<string, BlastPersonDraft>>({});
  const [isEmailBlasting, setIsEmailBlasting] = useState(false);
  const [isWhatsAppBlasting, setIsWhatsAppBlasting] = useState(false);
  const [isPeopleLoading, setIsPeopleLoading] = useState(false);
  const [blastNotice, setBlastNotice] = useState('');
  const [peopleSearch, setPeopleSearch] = useState('');
  const [peopleServiceFilter, setPeopleServiceFilter] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [historyServiceFilter, setHistoryServiceFilter] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState('');

  useEffect(() => {
    loadPeople();
    refreshHistory();
  }, []);

  const readyPeople = useMemo(
    () => people.filter((person) => person.name.trim() && getPersonServices(person).length > 0),
    [people],
  );

  const selectedReadyPeople = useMemo(() => (
    readyPeople.filter((person) => selectedPersonIds.includes(person.id))
  ), [readyPeople, selectedPersonIds]);

  const blastTargets = selectedReadyPeople;

  const filteredPeople = useMemo(() => {
    const query = peopleSearch.trim().toLowerCase();
    return people.filter((person) => {
      const services = getPersonServices(person);
      const matchesSearch = !query || [
        person.name,
        person.whatsapp,
        person.email,
        services.join(' '),
      ].join(' ').toLowerCase().includes(query);
      const matchesService = !peopleServiceFilter || services.includes(peopleServiceFilter);
      return matchesSearch && matchesService;
    });
  }, [people, peopleSearch, peopleServiceFilter]);

  const filteredHistory = useMemo(() => {
    const query = historySearch.trim().toLowerCase();
    return history.filter((row) => {
      const monitoringStatus = getMonitoringStatus(row);
      const matchesSearch = !query || [
        row.personName,
        row.whatsapp,
        row.email,
        row.serviceType,
        row.surveyLink,
        monitoringStatus,
      ].join(' ').toLowerCase().includes(query);
      const matchesService = !historyServiceFilter || row.serviceType === historyServiceFilter;
      const matchesStatus = !historyStatusFilter || monitoringStatus === historyStatusFilter;
      return matchesSearch && matchesService && matchesStatus;
    });
  }, [history, historySearch, historyServiceFilter, historyStatusFilter]);

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

  const readErrorResponse = async (response: Response, fallback: string) => {
    try {
      const payload = await response.json() as { error?: string };
      return payload.error || fallback;
    } catch {
      return fallback;
    }
  };

  const loadPeople = async () => {
    setIsPeopleLoading(true);
    try {
      const response = await fetch(withBasePath('/api/blast/people'), { cache: 'no-store' });
      const payload = await response.json() as { people?: BlastPerson[]; error?: string };

      if (!response.ok) throw new Error(payload.error || 'Gagal mengambil daftar orang.');

      let loadedPeople = payload.people ?? [];
      const storedPeople = loadFromStorage<BlastPerson[]>(PEOPLE_STORAGE_KEY, []);

      if (loadedPeople.length === 0 && storedPeople.length > 0) {
        const migratedPeople = await Promise.all(storedPeople.map(async (person) => {
          const migrationResponse = await fetch(withBasePath('/api/blast/people'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: person.name,
              whatsapp: person.whatsapp,
              email: person.email,
              serviceTypes: getPersonServices(person),
            }),
          });
          if (!migrationResponse.ok) return null;
          const migrationPayload = await migrationResponse.json() as { person?: BlastPerson };
          return migrationPayload.person ?? null;
        }));
        loadedPeople = migratedPeople.filter((person): person is BlastPerson => Boolean(person));
        window.localStorage.removeItem(PEOPLE_STORAGE_KEY);
      }

      setPeople(loadedPeople);
      setSelectedPersonIds(loadedPeople.map((person) => person.id));
    } catch (error) {
      setBlastNotice(error instanceof Error ? error.message : 'Gagal mengambil daftar orang.');
    } finally {
      setIsPeopleLoading(false);
    }
  };

  const addPerson = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const response = await fetch(withBasePath('/api/blast/people'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPerson),
      });
      const payload = await response.json() as { person?: BlastPerson; error?: string };

      if (!response.ok || !payload.person) {
        throw new Error(payload.error || 'Gagal menambahkan orang.');
      }

      setPeople((current) => [payload.person as BlastPerson, ...current]);
      setSelectedPersonIds((current) => [payload.person!.id, ...current]);
      setNewPerson(emptyPerson);
      setBlastNotice('User berhasil ditambahkan ke Supabase.');
    } catch (error) {
      setBlastNotice(error instanceof Error ? error.message : 'Gagal menambahkan orang.');
    }
  };

  const startEditPerson = (person: BlastPerson) => {
    setEditDrafts((current) => ({
      ...current,
      [person.id]: {
        name: person.name,
        whatsapp: person.whatsapp,
        email: person.email,
        serviceTypes: getPersonServices(person),
      },
    }));
  };

  const cancelEditPerson = (id: string) => {
    setEditDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const updatePersonDraft = (id: string, field: keyof Omit<BlastPersonDraft, 'serviceTypes'>, value: string) => {
    setEditDrafts((current) => ({
      ...current,
      [id]: {
        ...current[id],
        [field]: value,
      },
    }));
  };

  const savePerson = async (id: string, updates: Partial<BlastPersonDraft>) => {
    try {
      const response = await fetch(withBasePath(`/api/blast/people/${id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error(await readErrorResponse(response, 'Gagal menyimpan perubahan user.'));
      }

      const payload = await response.json() as { person?: BlastPerson };
      if (payload.person) {
        setPeople((current) => current.map((person) => (
            person.id === id ? payload.person as BlastPerson : person
        )));
      }
      return true;
    } catch (error) {
      setBlastNotice(error instanceof Error ? error.message : 'Gagal menyimpan perubahan user.');
      return false;
    }
  };

  const saveEditedPerson = async (id: string) => {
    const draft = editDrafts[id];
    if (!draft) return;

    const saved = await savePerson(id, draft);
    if (saved) {
      cancelEditPerson(id);
      setBlastNotice('Perubahan user berhasil disimpan ke Supabase.');
    }
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
    setEditDrafts((current) => {
      const draft = current[id];
      if (!draft) return current;
      const currentServices = draft.serviceTypes;
      const exists = currentServices.includes(service);
      const serviceList = exists
        ? currentServices.filter((item) => item !== service)
        : [...currentServices, service];
      return {
        ...current,
        [id]: {
          ...draft,
          serviceTypes: serviceList,
        },
      };
    });
  };

  const deletePerson = async (id: string) => {
    try {
      const response = await fetch(withBasePath(`/api/blast/people/${id}`), { method: 'DELETE' });
      if (!response.ok) {
        throw new Error(await readErrorResponse(response, 'Gagal menghapus user.'));
      }

      setPeople((current) => current.filter((person) => person.id !== id));
      setSelectedPersonIds((current) => current.filter((personId) => personId !== id));
      setBlastNotice('User berhasil dihapus dari Supabase.');
    } catch (error) {
      setBlastNotice(error instanceof Error ? error.message : 'Gagal menghapus user.');
    }
  };

  const toggleSelectedPerson = (id: string) => {
    setSelectedPersonIds((current) => (
      current.includes(id) ? current.filter((personId) => personId !== id) : [...current, id]
    ));
  };

  const toggleAllSelectedPeople = () => {
    const readyIds = readyPeople.map((person) => person.id);
    setSelectedPersonIds((current) => (
      readyIds.every((id) => current.includes(id)) ? [] : readyIds
    ));
  };

  const clearSelectedPeople = () => {
    setSelectedPersonIds([]);
  };

  const startWhatsAppBlast = async () => {
    const now = new Date().toISOString();
    const rows = blastTargets
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

    if (rows.length === 0) return;

    setIsWhatsAppBlasting(true);
    setBlastNotice('');

    try {
      const response = await fetch(withBasePath('/api/blast/history'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: rows }),
      });
      const payload = await response.json() as { records?: BlastHistory[]; error?: string };

      if (!response.ok) throw new Error(payload.error || 'Gagal menyimpan riwayat WhatsApp.');

      setHistory((current) => [...(payload.records ?? rows), ...current]);
      refreshHistory();
      setBlastNotice(`${rows.length} blast WhatsApp dummy disimpan ke Supabase.`);
    } catch (error) {
      setBlastNotice(error instanceof Error ? error.message : 'Gagal menyimpan riwayat WhatsApp.');
    } finally {
      setIsWhatsAppBlasting(false);
    }
  };

  const startEmailBlast = async () => {
    const recipients = blastTargets.filter((person) => person.email.trim());
    if (recipients.length === 0) return;

    setIsEmailBlasting(true);
    setBlastNotice('');

    try {
      const batches = Array.from(
        { length: Math.ceil(recipients.length / MAX_EMAIL_RECIPIENTS) },
        (_, index) => recipients.slice(index * MAX_EMAIL_RECIPIENTS, (index + 1) * MAX_EMAIL_RECIPIENTS),
      );
      const allRows: BlastHistory[] = [];

      for (const [index, batch] of batches.entries()) {
        setBlastNotice(`Mengirim batch ${index + 1}/${batches.length} (${batch.length} penerima)...`);

        const response = await fetch(withBasePath('/api/blast/email'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipients: batch }),
        });
        const payload = await response.json() as { results?: EmailBlastResult[]; error?: string };

        if (!response.ok) {
          throw new Error(payload.error || `Email blast batch ${index + 1} gagal diproses.`);
        }

        const now = new Date().toISOString();
        const rows = (payload.results ?? []).map((result) => ({
          channel: 'Email' as const,
          createdAt: now,
          ...result,
        }));

        allRows.push(...rows);
        setHistory((current) => [...rows, ...current]);

        if (index < batches.length - 1) {
          setBlastNotice(`Batch ${index + 1}/${batches.length} selesai. Menunggu 3 detik sebelum batch berikutnya...`);
          await sleep(EMAIL_BATCH_DELAY_MS);
        }
      }

      refreshHistory();

      const successCount = allRows.filter((row) => row.status === 'Sukses').length;
      const failedCount = allRows.length - successCount;
      setBlastNotice(`Email blast selesai: ${successCount} sukses, ${failedCount} gagal/dilewati dari ${recipients.length} penerima.`);
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
          <a className="admin-link secondary-admin-link" href={withBasePath('/api/logout')}>Logout</a>
        </div>
      </div>

      <section className="blast-action-grid">
        <button
          type="button"
          className="blast-action-card"
          onClick={startEmailBlast}
          disabled={
            isEmailBlasting
            || blastTargets.every((person) => !person.email.trim())
          }
        >
          <span>{isEmailBlasting ? 'Mengirim Email...' : 'Start Blast Email'}</span>
          <small>{blastTargets.filter((person) => person.email.trim()).length} penerima siap, batch {MAX_EMAIL_RECIPIENTS} orang</small>
        </button>
        <button
          type="button"
          className="blast-action-card"
          onClick={startWhatsAppBlast}
          disabled={isWhatsAppBlasting || blastTargets.every((person) => !person.whatsapp.trim())}
        >
          <span>{isWhatsAppBlasting ? 'Menyimpan WhatsApp...' : 'Start Blast WhatsApp'}</span>
          <small>{blastTargets.filter((person) => person.whatsapp.trim()).length} penerima siap</small>
        </button>
      </section>
      {blastNotice && <p className="blast-notice">{blastNotice}</p>}

      <section className="table-card blast-section">
        <div className="section-heading-row">
          <h2>User Management</h2>
          <div className="inline-actions">
            <span>{isPeopleLoading ? 'Memuat user...' : `${selectedReadyPeople.length} dipilih dari ${people.length} orang`}</span>
            {selectedPersonIds.length > 0 && (
              <button type="button" className="text-button danger-button" onClick={clearSelectedPeople}>
                Uncheck Semua
              </button>
            )}
          </div>
        </div>

        <div className="filter-row">
          <label>
            Cari Orang
            <input
              value={peopleSearch}
              onChange={(event) => setPeopleSearch(event.target.value)}
              placeholder="Nama, email, WhatsApp, layanan"
            />
          </label>
          <label>
            Filter Layanan
            <select value={peopleServiceFilter} onChange={(event) => setPeopleServiceFilter(event.target.value)}>
              <option value="">Semua layanan</option>
              {serviceTypes.map((service) => (
                <option key={service} value={service}>{service}</option>
              ))}
            </select>
          </label>
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
        ) : filteredPeople.length === 0 ? (
          <p>Tidak ada user yang cocok dengan filter.</p>
        ) : (
          <div className="blast-table-wrapper">
            <table className="blast-table">
              <thead>
                <tr>
                  <th>
                    <button type="button" className="text-button" onClick={toggleAllSelectedPeople}>
                      Pilih Semua
                    </button>
                  </th>
                  <th>Nama</th>
                  <th>WhatsApp</th>
                  <th>Email</th>
                  <th>Layanan</th>
                  <th>Link</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredPeople.map((person) => {
                  const draft = editDrafts[person.id];
                  const isEditing = Boolean(draft);
                  const visiblePerson = draft ? { ...person, ...draft } : person;
                  const visibleServices = getPersonServices(visiblePerson);

                  return (
                    <tr key={person.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedPersonIds.includes(person.id)}
                          onChange={() => toggleSelectedPerson(person.id)}
                        />
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            value={visiblePerson.name}
                            onChange={(event) => updatePersonDraft(person.id, 'name', event.target.value)}
                          />
                        ) : (
                          <span className="table-plain-text">{person.name}</span>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            value={visiblePerson.whatsapp}
                            onChange={(event) => updatePersonDraft(person.id, 'whatsapp', event.target.value)}
                          />
                        ) : (
                          <span className="table-plain-text">{person.whatsapp || '-'}</span>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            type="email"
                            value={visiblePerson.email}
                            onChange={(event) => updatePersonDraft(person.id, 'email', event.target.value)}
                          />
                        ) : (
                          <span className="table-plain-text">{person.email || '-'}</span>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <div className="service-checkbox-list compact-service-list">
                            {serviceTypes.map((service) => (
                              <label key={service} className="service-checkbox-item">
                                <input
                                  type="checkbox"
                                  checked={visibleServices.includes(service)}
                                  onChange={() => togglePersonService(person.id, service)}
                                />
                                <span>{service}</span>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <div className="person-service-list">
                            {visibleServices.map((service) => (
                              <span key={service}>{service}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>
                        {visibleServices.length === 0 ? (
                          <span>Belum ada layanan</span>
                        ) : visibleServices.length > 1 ? (
                          <span>{visibleServices.length} layanan dalam 1 link email</span>
                        ) : (
                          <a href={getSurveyLink(visibleServices[0])}>{getSurveyLink(visibleServices[0])}</a>
                        )}
                      </td>
                      <td>
                        <div className="row-action-list">
                          {isEditing ? (
                            <>
                              <button type="button" className="text-button" onClick={() => saveEditedPerson(person.id)}>
                                Simpan
                              </button>
                              <button type="button" className="text-button" onClick={() => cancelEditPerson(person.id)}>
                                Batal
                              </button>
                            </>
                          ) : (
                            <button type="button" className="text-button" onClick={() => startEditPerson(person)}>
                              Edit
                            </button>
                          )}
                          <button type="button" className="text-button danger-button" onClick={() => deletePerson(person.id)}>
                            Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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

        <div className="filter-row history-filter-row">
          <label>
            Cari Riwayat
            <input
              value={historySearch}
              onChange={(event) => setHistorySearch(event.target.value)}
              placeholder="Nama, email, WhatsApp, layanan, status"
            />
          </label>
          <label>
            Filter Layanan
            <select value={historyServiceFilter} onChange={(event) => setHistoryServiceFilter(event.target.value)}>
              <option value="">Semua layanan</option>
              {serviceTypes.map((service) => (
                <option key={service} value={service}>{service}</option>
              ))}
            </select>
          </label>
          <label>
            Filter Status
            <select value={historyStatusFilter} onChange={(event) => setHistoryStatusFilter(event.target.value)}>
              <option value="">Semua status</option>
              <option value="Terima, belum buka email/link">Terima, belum buka email/link</option>
              <option value="Terima, buka email, belum isi">Terima, buka email, belum isi</option>
              <option value="Terima, buka link, belum isi">Terima, buka link, belum isi</option>
              <option value="Terima dan sudah isi">Terima dan sudah isi</option>
              <option value="Gagal dikirim">Gagal dikirim</option>
            </select>
          </label>
        </div>

        {history.length === 0 ? (
          <p>Belum ada riwayat blast.</p>
        ) : filteredHistory.length === 0 ? (
          <p>Tidak ada riwayat yang cocok dengan filter.</p>
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
                {filteredHistory.map((row) => (
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
