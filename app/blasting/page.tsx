'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { PUBLIC_SURVEY_URL, serviceToSlug, withBasePath, withSurveyParam } from '../services';
import { AdminFooter, AdminHeader } from '../admin/admin-chrome';

type BlastPerson = {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  name: string;
  email: string;
  serviceType?: string;
  serviceTypes: string[];
};

type BlastPersonDraft = Pick<BlastPerson, 'name' | 'email' | 'serviceTypes'>;

type BlastHistory = {
  id: string;
  blastGroupId?: string | null;
  personName: string;
  email: string;
  senderId?: string;
  senderLabel?: string;
  senderEmail?: string;
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

type EmailBlastResult = Omit<BlastHistory, 'createdAt'>;
type ImportPerson = Pick<BlastPerson, 'name' | 'email' | 'serviceTypes'> & {
  rowNumber: number;
};
type EmailSender = {
  id: string;
  label: string;
  email: string;
};
type PeopleSortMode = 'date-desc' | 'date-asc' | 'name-asc' | 'name-desc';
type BlastResultDialog = {
  title: string;
  message: string;
  successCount: number;
  failedCount: number;
  totalCount: number;
};
type HistoryDeleteDialog = {
  kind: 'clear' | 'selected';
  count: number;
  ids?: string[];
};

const PEOPLE_STORAGE_KEY = 'genesis-blasting-people';
const MAX_EMAIL_RECIPIENTS = 5;
const EMAIL_BATCH_DELAY_MS = 3000;

const createEmptyPerson = (services: string[] = []) => ({
  name: '',
  email: '',
  serviceTypes: services[0] ? [services[0]] : [],
});

const sleep = (ms: number) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const getSurveyLink = (serviceType: string, campaignId = '') => withSurveyParam(withBasePath(`/${serviceToSlug(serviceType)}`), campaignId);
const getPersonServices = (person: Pick<BlastPerson, 'serviceType' | 'serviceTypes'>) => (
  person.serviceTypes?.length ? person.serviceTypes : person.serviceType ? [person.serviceType] : []
);

const getSenderDisplayLabel = (row: Pick<BlastHistory, 'senderEmail' | 'senderLabel'>) => {
  if (row.senderEmail?.toLowerCase() === 'tusesdjid@mail.komdigi.go.id') {
    return 'Sekretariat DJID';
  }

  return row.senderLabel || row.senderEmail || '';
};

const formatDateTime = (value?: string | null) => (
  value ? new Date(value).toLocaleString('id-ID') : '-'
);

const downloadBlobFile = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => {
    window.URL.revokeObjectURL(url);
  }, 0);
};

const getManualBlastLink = (row: BlastHistory, groupSize = 1) => {
  const target = row.blastGroupId && groupSize > 1
    ? `${PUBLIC_SURVEY_URL}/multi-survey`
    : row.surveyLink;
  const trackUrl = new URL(withBasePath('/api/track/click'), PUBLIC_SURVEY_URL);
  if (row.blastGroupId) {
    trackUrl.searchParams.set('blastGroupId', row.blastGroupId);
  } else {
    trackUrl.searchParams.set('blastId', row.id);
  }
  trackUrl.searchParams.set('target', target);
  return trackUrl.toString();
};

const getMonitoringStatus = (row: BlastHistory) => {
  if (row.status === 'Gagal') return 'Gagal dikirim';
  if (row.submittedAt) return 'Terima dan sudah isi';
  if (row.clickedAt) return 'Terima, buka link, belum isi';
  if (row.openedAt) return 'Terima, buka email, belum isi';
  if (row.sentAt || row.status === 'Sukses') return 'Terima, belum buka email/link';
  return 'Belum terkirim';
};

const getMonitoringStatusClass = (row: BlastHistory) => {
  if (row.status === 'Gagal') return 'failed-pill';
  if (row.submittedAt) return 'done-pill';
  if (row.clickedAt) return 'link-opened-pill';
  if (row.openedAt) return 'email-opened-pill';
  if (row.sentAt || row.status === 'Sukses') return 'sent-pill';
  return 'pending-pill';
};

const normalizeColumnName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const normalizeServiceName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

const getImportValue = (row: Record<string, unknown>, aliases: string[]) => {
  const aliasSet = new Set(aliases.map(normalizeColumnName));
  const match = Object.entries(row).find(([key]) => aliasSet.has(normalizeColumnName(key)));
  return match ? String(match[1] ?? '').trim() : '';
};

const normalizeExcelRows = (rawRows: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(rawRows)) {
    throw new Error('Format Excel tidak valid.');
  }

  if (rawRows.length === 0) return [];

  if (rawRows.every((sheet) => (
    sheet
    && typeof sheet === 'object'
    && !Array.isArray(sheet)
    && Array.isArray((sheet as { data?: unknown }).data)
  ))) {
    return rawRows.flatMap((sheet) => normalizeExcelRows((sheet as { data: unknown }).data));
  }

  if (rawRows.every((row) => row && !Array.isArray(row) && typeof row === 'object')) {
    return rawRows as Record<string, unknown>[];
  }

  if (!rawRows.every(Array.isArray)) {
    throw new Error('Format baris Excel tidak valid.');
  }

  const [headerRow, ...bodyRows] = rawRows as unknown[][];
  const headers = headerRow.map((cell) => String(cell ?? '').trim());
  return bodyRows.map((cells) => headers.reduce<Record<string, unknown>>((acc, header, index) => {
    acc[header || `Kolom ${index + 1}`] = cells[index] ?? '';
    return acc;
  }, {}));
};

const parseImportServices = (row: Record<string, unknown>, services: string[]) => {
  const serviceAliases = new Set(['layanan', 'jenislayanan', 'service', 'servicetype'].map(normalizeColumnName));
  const serviceSource = Object.entries(row)
    .filter(([key]) => serviceAliases.has(normalizeColumnName(key)))
    .map(([, value]) => String(value ?? ''))
    .join(',');
  const serviceCandidates = serviceSource.split(/[,;|\n]/g).map((item) => item.trim()).filter(Boolean);

  Object.entries(row).forEach(([key, value]) => {
    const normalizedKey = normalizeServiceName(key);
    const serviceFromHeader = services.find((service) => (
      normalizeServiceName(service) === normalizedKey || serviceToSlug(service) === key.trim().toLowerCase()
    ));
    const isChecked = ['1', 'yes', 'ya', 'true', 'x', 'v'].includes(String(value ?? '').trim().toLowerCase());

    if (serviceFromHeader && isChecked) {
      serviceCandidates.push(serviceFromHeader);
    }
  });

  return Array.from(new Set(serviceCandidates.map((candidate) => (
    services.find((service) => (
      normalizeServiceName(service) === normalizeServiceName(candidate)
      || serviceToSlug(service) === candidate.toLowerCase().trim()
    ))
  )).filter((service): service is string => Boolean(service))));
};

export default function BlastingPage() {
  const [people, setPeople] = useState<BlastPerson[]>([]);
  const [availableServices, setAvailableServices] = useState<string[]>([]);
  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>([]);
  const [history, setHistory] = useState<BlastHistory[]>([]);
  const [newPerson, setNewPerson] = useState(createEmptyPerson([]));
  const [editDrafts, setEditDrafts] = useState<Record<string, BlastPersonDraft>>({});
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportPerson[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importMessage, setImportMessage] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [isEmailBlasting, setIsEmailBlasting] = useState(false);
  const [isResettingBlast, setIsResettingBlast] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isPeopleLoading, setIsPeopleLoading] = useState(false);
  const [blastNotice, setBlastNotice] = useState('');
  const [blastResultDialog, setBlastResultDialog] = useState<BlastResultDialog | null>(null);
  const [peopleSearch, setPeopleSearch] = useState('');
  const [peopleServiceFilter, setPeopleServiceFilter] = useState('');
  const [peopleSort, setPeopleSort] = useState<PeopleSortMode>('date-desc');
  const [historySearch, setHistorySearch] = useState('');
  const [historyServiceFilter, setHistoryServiceFilter] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState('');
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<string[]>([]);
  const [isDeletingHistory, setIsDeletingHistory] = useState(false);
  const [isDownloadingPeople, setIsDownloadingPeople] = useState(false);
  const [isDownloadingHistory, setIsDownloadingHistory] = useState(false);
  const [historyDeleteDialog, setHistoryDeleteDialog] = useState<HistoryDeleteDialog | null>(null);
  const [activeCampaignId, setActiveCampaignId] = useState('');
  const [emailSenders, setEmailSenders] = useState<EmailSender[]>([]);
  const [selectedSenderId, setSelectedSenderId] = useState('');

  useEffect(() => {
    const initialize = async () => {
      const names = await loadServices();
      await loadPeople(names);
    };
    void initialize();
    loadEmailSenders();
    refreshHistory();
  }, []);

  useEffect(() => {
    setPeople((current) => {
      const next = current.map((person) => ({
        ...person,
        serviceTypes: getPersonServices(person).filter((service) => availableServices.includes(service)),
      }));
      setSelectedPersonIds((currentIds) => currentIds.filter((id) => (
        next.some((person) => person.id === id && person.serviceTypes.length > 0)
      )));
      return next;
    });
  }, [availableServices]);

  const loadEmailSenders = async () => {
    try {
      const response = await fetch(withBasePath('/api/blast/senders'), { cache: 'no-store' });
      const payload = await response.json() as { sender?: EmailSender; senders?: EmailSender[]; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Gagal mengambil daftar sender.');
      const senders = payload.sender ? [payload.sender] : payload.senders ?? [];
      setEmailSenders(senders);
      setSelectedSenderId(senders[0]?.id || '');
    } catch (error) {
      setEmailSenders([]);
      setSelectedSenderId('');
      setBlastNotice(error instanceof Error ? error.message : 'Gagal mengambil daftar sender.');
    }
  };

  const loadServices = async () => {
    try {
      const response = await fetch(withBasePath('/api/services/?admin=1'), { cache: 'no-store' });
      const payload = await response.json() as { campaignId?: string; services?: Array<{ name: string }> };
      setActiveCampaignId(payload.campaignId || '');
      const names = payload.services?.map((service) => service.name).filter(Boolean);
      if (names) {
        setAvailableServices(names);
        setPeople((current) => current
          .map((person) => ({
            ...person,
            serviceTypes: getPersonServices(person).filter((service) => names.includes(service)),
          })));
        setPeopleServiceFilter((current) => (current && !names.includes(current) ? '' : current));
        setHistoryServiceFilter((current) => (current && !names.includes(current) ? '' : current));
        setNewPerson((current) => ({
          ...current,
          serviceTypes: current.serviceTypes.filter((service) => names.includes(service)).length
            ? current.serviceTypes.filter((service) => names.includes(service))
            : names[0] ? [names[0]] : [],
        }));
        return names;
      }
    } catch {
      setAvailableServices([]);
    }
    return [];
  };

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
        person.email,
        services.join(' '),
      ].join(' ').toLowerCase().includes(query);
      const matchesService = !peopleServiceFilter || services.includes(peopleServiceFilter);
      return matchesSearch && matchesService;
    }).sort((left, right) => {
      if (peopleSort === 'name-asc' || peopleSort === 'name-desc') {
        const comparison = left.name.localeCompare(right.name, 'id', { sensitivity: 'base' });
        return peopleSort === 'name-asc' ? comparison : -comparison;
      }

      const leftTime = new Date(left.createdAt || 0).getTime();
      const rightTime = new Date(right.createdAt || 0).getTime();
      return peopleSort === 'date-asc' ? leftTime - rightTime : rightTime - leftTime;
    });
  }, [people, peopleSearch, peopleServiceFilter, peopleSort]);

  const filteredHistory = useMemo(() => {
    const query = historySearch.trim().toLowerCase();
    return history.filter((row) => {
      const monitoringStatus = getMonitoringStatus(row);
      const matchesSearch = !query || [
        row.personName,
        row.email,
        row.senderLabel,
        row.senderEmail,
        row.serviceType,
        row.surveyLink,
        monitoringStatus,
      ].join(' ').toLowerCase().includes(query);
      const matchesService = !historyServiceFilter || row.serviceType === historyServiceFilter;
      const matchesStatus = !historyStatusFilter
        || monitoringStatus === historyStatusFilter
        || (historyStatusFilter === 'Belum isi' && row.status !== 'Gagal' && !row.submittedAt);
      return matchesSearch && matchesService && matchesStatus;
    }).sort((left, right) => (
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
    ));
  }, [history, historySearch, historyServiceFilter, historyStatusFilter]);

  const historyGroupSizes = useMemo(() => {
    const sizes = new Map<string, number>();
    history.forEach((row) => {
      if (!row.blastGroupId) return;
      sizes.set(row.blastGroupId, (sizes.get(row.blastGroupId) ?? 0) + 1);
    });
    return sizes;
  }, [history]);

  const getHistoryManualBlastLink = (row: BlastHistory) => (
    getManualBlastLink(row, row.blastGroupId ? historyGroupSizes.get(row.blastGroupId) ?? 1 : 1)
  );

  const filteredHistoryIds = useMemo(() => (
    filteredHistory.map((row) => row.id)
  ), [filteredHistory]);

  const selectedFilteredHistoryCount = useMemo(() => (
    filteredHistoryIds.filter((id) => selectedHistoryIds.includes(id)).length
  ), [filteredHistoryIds, selectedHistoryIds]);

  const isAllFilteredHistorySelected = filteredHistoryIds.length > 0
    && selectedFilteredHistoryCount === filteredHistoryIds.length;

  const refreshHistory = async () => {
    try {
      setHistoryStatusFilter('');
      const response = await fetch(withBasePath('/api/blast/history'), { cache: 'no-store' });
      const payload = await response.json() as { records?: BlastHistory[]; error?: string };

      if (!response.ok) throw new Error(payload.error || 'Gagal mengambil monitoring blast.');

      const records = payload.records ?? [];
      setHistory(records);
      setSelectedHistoryIds((current) => current.filter((id) => records.some((row) => row.id === id)));
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

  const loadPeople = async (servicesOverride = availableServices) => {
    setIsPeopleLoading(true);
    try {
      const response = await fetch(withBasePath('/api/blast/people'), { cache: 'no-store' });
      const payload = await response.json() as { people?: BlastPerson[]; error?: string };

      if (!response.ok) throw new Error(payload.error || 'Gagal mengambil daftar orang.');

      const loadedPeople = (payload.people ?? []).map((person) => ({
        ...person,
        serviceTypes: getPersonServices(person).filter((service) => servicesOverride.includes(service)),
      }));
      window.localStorage.removeItem(PEOPLE_STORAGE_KEY);

      setPeople(loadedPeople);
      setSelectedPersonIds((current) => current.filter((id) => (
        loadedPeople.some((person) => person.id === id && person.serviceTypes.length > 0)
      )));
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
      setNewPerson(createEmptyPerson(availableServices));
      setBlastNotice('User berhasil ditambahkan ke Supabase.');
    } catch (error) {
      setBlastNotice(error instanceof Error ? error.message : 'Gagal menambahkan orang.');
    }
  };

  const handleImportFile = async (file?: File | null) => {
    if (!file) return;

    setImportFileName(file.name);
    setImportMessage('');

    try {
      const { default: readSheet } = await import('read-excel-file/browser');
      const rows = normalizeExcelRows(await readSheet(file));
      const parsedRows = rows.map((row, index) => ({
        rowNumber: index + 2,
        name: getImportValue(row, ['nama', 'name', 'nama lengkap', 'namalengkap']),
        email: getImportValue(row, ['email', 'alamat email', 'alamatemail', 'e-mail']),
        serviceTypes: parseImportServices(row, availableServices),
      })).filter((row) => row.name && row.serviceTypes.length > 0);

      setImportRows(parsedRows);
      setImportMessage(`${parsedRows.length} data siap diimport dari ${rows.length} baris Excel.`);
    } catch (error) {
      setImportRows([]);
      setImportMessage(error instanceof Error ? error.message : 'File Excel gagal dibaca.');
    }
  };

  const submitImportPeople = async () => {
    if (importRows.length === 0) return;

    setIsImporting(true);
    setImportMessage('Mengimport data ke Supabase...');

    try {
      const importedPeople: BlastPerson[] = [];
      let failedCount = 0;

      for (const row of importRows) {
        const response = await fetch(withBasePath('/api/blast/people'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(row),
        });
        const payload = await response.json() as { person?: BlastPerson };

        if (response.ok && payload.person) {
          importedPeople.push(payload.person);
        } else {
          failedCount += 1;
        }
      }

      setPeople((current) => [...importedPeople, ...current]);
      setSelectedPersonIds((current) => [...importedPeople.map((person) => person.id), ...current]);
      setImportRows([]);
      setImportFileName('');
      setImportMessage(`Sukses import ${importedPeople.length} user${failedCount ? `, ${failedCount} gagal` : ''}. Data sudah masuk tabel.`);
      setBlastNotice(`Import Excel selesai: ${importedPeople.length} user masuk ke Supabase.`);
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : 'Import Excel gagal diproses.');
    } finally {
      setIsImporting(false);
    }
  };

  const downloadImportTemplate = async () => {
    const { default: writeXlsxFile } = await import('write-excel-file/browser');
    const rows = [
      {
        Nama: 'Nama Responden 1',
        Email: 'responden1@example.com',
        Layanan: availableServices.slice(0, 2).join(', '),
      },
      {
        Nama: 'Nama Responden 2',
        Email: 'responden2@example.com',
        Layanan: availableServices[0] || '',
      },
    ];
    const columns = [
      { header: 'Nama', width: 28, cell: (row: typeof rows[number]) => ({ value: row.Nama }) },
      { header: 'Email', width: 30, cell: (row: typeof rows[number]) => ({ value: row.Email }) },
      { header: 'Layanan', width: 80, cell: (row: typeof rows[number]) => ({ value: row.Layanan }) },
    ];

    await writeXlsxFile(rows, { columns }).toFile('template-import-user-blasting.xlsx');
  };

  const downloadPeopleExcel = async (rowsToDownload = filteredPeople) => {
    if (rowsToDownload.length === 0) return;

    setIsDownloadingPeople(true);
    setBlastNotice('Membuat file Excel daftar responden...');

    try {
      const { default: writeXlsxFile } = await import('write-excel-file/browser');
      const rows = rowsToDownload.map((person, index) => {
        const services = getPersonServices(person);
        return {
          nomor: index + 1,
          nama: person.name,
          email: person.email || '-',
          layanan: services.join(', '),
          link: services.length > 1
            ? `${services.length} layanan dalam 1 link email`
            : services[0] ? getSurveyLink(services[0], activeCampaignId) : '',
          createdAt: formatDateTime(person.createdAt),
          updatedAt: formatDateTime(person.updatedAt),
        };
      });
      const columns = [
        { header: 'No.', width: 8, cell: (row: typeof rows[number]) => ({ value: row.nomor }) },
        { header: 'Nama', width: 30, cell: (row: typeof rows[number]) => ({ value: row.nama }) },
        { header: 'Email', width: 34, cell: (row: typeof rows[number]) => ({ value: row.email }) },
        { header: 'Layanan', width: 72, cell: (row: typeof rows[number]) => ({ value: row.layanan }) },
        { header: 'Link', width: 72, cell: (row: typeof rows[number]) => ({ value: row.link }) },
        { header: 'Tanggal Ditambahkan', width: 22, cell: (row: typeof rows[number]) => ({ value: row.createdAt }) },
        { header: 'Tanggal Diubah', width: 22, cell: (row: typeof rows[number]) => ({ value: row.updatedAt }) },
      ];

      await writeXlsxFile(rows, { columns }).toFile(`daftar-responden-${new Date().toISOString().slice(0, 10)}.xlsx`);
      setBlastNotice(`File Excel daftar responden dibuat (${rowsToDownload.length} orang).`);
    } catch (error) {
      setBlastNotice(error instanceof Error ? error.message : 'Download Excel daftar responden gagal.');
    } finally {
      setIsDownloadingPeople(false);
    }
  };

  const startEditPerson = (person: BlastPerson) => {
    setEditDrafts((current) => ({
      ...current,
      [person.id]: {
        name: person.name,
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

  const getPeopleSortLabel = () => {
    if (peopleSort === 'name-asc') return 'A-Z';
    if (peopleSort === 'name-desc') return 'Z-A';
    return 'Date Added';
  };

  const togglePeopleSort = () => {
    setPeopleSort((current) => {
      if (current === 'name-asc') return 'name-desc';
      if (current === 'name-desc') return 'date-desc';
      return 'name-asc';
    });
  };

  const toggleSelectedHistory = (id: string) => {
    setSelectedHistoryIds((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ));
  };

  const toggleAllFilteredHistory = () => {
    setSelectedHistoryIds((current) => {
      if (isAllFilteredHistorySelected) {
        return current.filter((id) => !filteredHistoryIds.includes(id));
      }

      return Array.from(new Set([...current, ...filteredHistoryIds]));
    });
  };

  const startEmailBlast = async () => {
    const recipients = blastTargets.filter((person) => person.email.trim());
    if (recipients.length === 0) return;
    if (!selectedSenderId) {
      setBlastNotice('Pilih sender email terlebih dahulu.');
      return;
    }

    setIsEmailBlasting(true);
    setBlastNotice('');
    setBlastResultDialog(null);
    const allRows: BlastHistory[] = [];

    try {
      const batches = Array.from(
        { length: Math.ceil(recipients.length / MAX_EMAIL_RECIPIENTS) },
        (_, index) => recipients.slice(index * MAX_EMAIL_RECIPIENTS, (index + 1) * MAX_EMAIL_RECIPIENTS),
      );

      for (const [index, batch] of batches.entries()) {
        setBlastNotice(`Mengirim batch ${index + 1}/${batches.length} (${batch.length} penerima)...`);

        const response = await fetch(withBasePath('/api/blast/email'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipients: batch, senderId: selectedSenderId }),
        });
        const payload = await response.json() as { results?: EmailBlastResult[]; error?: string };

        if (!response.ok) {
          throw new Error(payload.error || `Email blast batch ${index + 1} gagal diproses.`);
        }

        const now = new Date().toISOString();
        const rows = (payload.results ?? []).map((result) => ({
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
      setBlastResultDialog({
        title: 'Blast Email Selesai',
        message: 'Sukses/gagal dihitung per layanan. Penerima dihitung per orang.',
        successCount,
        failedCount,
        totalCount: recipients.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Email blast gagal diproses.';
      const successCount = allRows.filter((row) => row.status === 'Sukses').length;
      const failedCount = allRows.length - successCount;
      setBlastNotice(message);
      setBlastResultDialog({
        title: 'Blast Email Berhenti',
        message,
        successCount,
        failedCount,
        totalCount: recipients.length,
      });
    } finally {
      setIsEmailBlasting(false);
    }
  };

  const requestClearHistory = () => {
    if (history.length === 0 || isDeletingHistory) return;
    setHistoryDeleteDialog({ kind: 'clear', count: history.length });
  };

  const clearHistory = async () => {
    setIsDeletingHistory(true);

    try {
      const response = await fetch(withBasePath('/api/blast/history'), { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error || 'Gagal membersihkan riwayat blast.');
      }
      setHistory([]);
      setSelectedHistoryIds([]);
      setBlastNotice('Riwayat blast dibersihkan.');
    } catch (error) {
      setBlastNotice(error instanceof Error ? error.message : 'Gagal membersihkan riwayat blast.');
    } finally {
      setIsDeletingHistory(false);
      setHistoryDeleteDialog(null);
    }
  };

  const requestDeleteSelectedHistory = () => {
    if (selectedHistoryIds.length === 0 || isDeletingHistory) return;
    setHistoryDeleteDialog({
      kind: 'selected',
      count: selectedHistoryIds.length,
      ids: [...selectedHistoryIds],
    });
  };

  const deleteSelectedHistory = async (idsToDelete = selectedHistoryIds) => {
    if (idsToDelete.length === 0) return;
    setIsDeletingHistory(true);

    try {
      const response = await fetch(withBasePath('/api/blast/history'), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsToDelete }),
      });
      const payload = await response.json().catch(() => ({})) as { deletedIds?: string[]; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Gagal menghapus riwayat blast pilihan.');

      const deletedIds = payload.deletedIds?.length ? payload.deletedIds : [];
      if (deletedIds.length === 0) {
        throw new Error('Tidak ada riwayat terpilih yang terhapus. Refresh riwayat lalu coba lagi.');
      }

      setHistory((current) => current.filter((row) => !deletedIds.includes(row.id)));
      setSelectedHistoryIds((current) => current.filter((id) => !deletedIds.includes(id)));
      setBlastNotice(`${deletedIds.length} riwayat blast pilihan berhasil dihapus.`);
    } catch (error) {
      setBlastNotice(error instanceof Error ? error.message : 'Gagal menghapus riwayat blast pilihan.');
    } finally {
      setIsDeletingHistory(false);
      setHistoryDeleteDialog(null);
    }
  };

  const confirmHistoryDelete = () => {
    if (!historyDeleteDialog) return;
    if (historyDeleteDialog.kind === 'clear') {
      void clearHistory();
      return;
    }
    void deleteSelectedHistory(historyDeleteDialog.ids ?? []);
  };

  const downloadHistoryExcel = async (rowsToDownload = filteredHistory, filenamePrefix = 'riwayat-blast') => {
    if (rowsToDownload.length === 0) return;

    setIsDownloadingHistory(true);
    setBlastNotice('Membuat file Excel riwayat blast...');

    try {
      const response = await fetch(withBasePath('/api/blast/history/export'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records: rowsToDownload.map((row) => ({
            id: row.id,
            createdAt: row.createdAt,
            personName: row.personName,
            email: row.email,
            senderLabel: row.senderLabel,
            senderEmail: row.senderEmail,
            serviceType: row.serviceType,
            surveyLink: row.surveyLink,
            manualLink: getHistoryManualBlastLink(row),
            status: row.status,
            error: row.error,
            sentAt: row.sentAt,
            openedAt: row.openedAt,
            clickedAt: row.clickedAt,
            submittedAt: row.submittedAt,
          })),
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || 'Download Excel riwayat blast gagal.');
      }

      const blob = await response.blob();
      const filename = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      downloadBlobFile(blob, filename);
      setBlastNotice(`File Excel riwayat blast dibuat (${rowsToDownload.length} baris).`);
    } catch (error) {
      setBlastNotice(error instanceof Error ? error.message : 'Download Excel riwayat blast gagal.');
    } finally {
      setIsDownloadingHistory(false);
    }
  };

  const copyManualBlastLink = async (row: BlastHistory) => {
    const link = getHistoryManualBlastLink(row);
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API tidak tersedia.');
      }
      await navigator.clipboard.writeText(link);
      setBlastNotice(`Link japri untuk ${row.personName} disalin.`);
    } catch {
      window.prompt('Salin link ini:', link);
    }
  };

  const requestResetBlast = () => {
    if (isResettingBlast || isEmailBlasting) return;
    setIsResetConfirmOpen(true);
  };

  const resetBlast = async () => {
    setIsResettingBlast(true);
    setBlastNotice('Mereset data blast survey aktif...');

    try {
      const response = await fetch(withBasePath('/api/blast/reset'), { method: 'POST' });
      const payload = await response.json() as {
        deleted?: { blastRecords?: number; surveyRecords?: number };
        error?: string;
      };

      if (!response.ok) throw new Error(payload.error || 'Reset blast gagal diproses.');

      window.localStorage.removeItem(PEOPLE_STORAGE_KEY);
      window.localStorage.removeItem('genesis-survey-records');
      setHistory([]);
      setEditDrafts({});
      setHistorySearch('');
      setHistoryServiceFilter('');
      setHistoryStatusFilter('');
      setNewPerson(createEmptyPerson(availableServices));
      setBlastNotice(
        `Reset blast selesai: ${payload.deleted?.blastRecords ?? 0} riwayat blast dan ${payload.deleted?.surveyRecords ?? 0} response survey dihapus. Daftar responden tetap aman.`,
      );
    } catch (error) {
      setBlastNotice(error instanceof Error ? error.message : 'Reset blast gagal diproses.');
    } finally {
      setIsResettingBlast(false);
      setIsResetConfirmOpen(false);
    }
  };

  return (
    <main className="page-shell admin-shell">
      <AdminHeader
        eyebrow="Admin"
        title="Blasting"
        currentPath="/blasting"
        actions={[
          { href: '/control', label: 'Kelola Survey', secondary: true },
          { href: '/admin', label: 'Monitoring' },
          { href: '/monitoring', label: 'Hasil Survey' },
          { href: '/blasting', label: 'Blasting' },
          { href: '/list', label: 'List Layanan' },
          { href: '/work-units', label: 'Satuan Kerja' },
        ]}
      />

      {blastNotice && <p className="blast-notice">{blastNotice}</p>}

      <section className="table-card blast-section reset-blast-panel">
        <div className="section-heading-row">
          <div>
            <h2>Reset Blast</h2>
            <span>Bersihkan riwayat blast dan jawaban survey aktif tanpa menghapus daftar responden.</span>
          </div>
          <button
            type="button"
            className="text-button danger-button"
            onClick={requestResetBlast}
            disabled={isResettingBlast || isEmailBlasting}
          >
            {isResettingBlast ? 'Mereset...' : 'Reset Blast'}
          </button>
        </div>
      </section>

      <section className="table-card blast-section">
        <div className="section-heading-row">
          <div className="section-left-actions">
            <button type="button" className="text-button" onClick={loadEmailSenders}>Refresh</button>
            <h2>Sender Email</h2>
          </div>
        </div>
        <div className="sender-picker">
          {emailSenders.length === 0 ? (
            <p className="sender-empty-state">Sender belum dikonfigurasi.</p>
          ) : emailSenders.map((sender) => {
            return (
              <button
                key={sender.id}
                type="button"
                className="sender-choice is-selected sender-choice-static"
                aria-pressed="true"
              >
                <span className="sender-choice-check">✓</span>
                <span>
                  <strong>{sender.label}</strong>
                  <small>{sender.email}</small>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="table-card blast-section">
        <div className="section-heading-row">
          <h2>Daftar Responden</h2>
          <div className="inline-actions">
            <span>{isPeopleLoading ? 'Memuat user...' : `${selectedReadyPeople.length} dipilih dari ${people.length} orang`}</span>
            <button
              type="button"
              className="text-button"
              onClick={() => { void downloadPeopleExcel(); }}
              disabled={filteredPeople.length === 0 || isDownloadingPeople}
            >
              {isDownloadingPeople ? 'Membuat Excel...' : 'Download Excel'}
            </button>
            <button type="button" className="text-button" onClick={() => setIsImportOpen(true)}>
              Import Excel
            </button>
          </div>
        </div>

        <div className="filter-row">
          <label>
            Cari Orang
            <input
              value={peopleSearch}
              onChange={(event) => setPeopleSearch(event.target.value)}
              placeholder="Nama, email, layanan"
            />
          </label>
          <label>
            Filter Layanan
            <select value={peopleServiceFilter} onChange={(event) => setPeopleServiceFilter(event.target.value)}>
              <option value="">Semua layanan</option>
              {availableServices.map((service) => (
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
              placeholder="Nama responden"
              required
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={newPerson.email}
              onChange={(event) => setNewPerson((current) => ({ ...current, email: event.target.value }))}
              placeholder="responden@example.com"
            />
          </label>
          <label>
            Layanan
            <div className="service-checkbox-list">
              {availableServices.map((service) => (
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
          <div className="blast-table-wrapper people-table-scroll">
            <table className="blast-table people-table">
              <thead>
                <tr>
                  <th>
                    <button type="button" className="text-button" onClick={toggleAllSelectedPeople}>
                      Pilih Semua
                    </button>
                  </th>
                  <th>
                    <button type="button" className="table-sort-button" onClick={togglePeopleSort}>
                      Nama
                      <span>{getPeopleSortLabel()}</span>
                    </button>
                  </th>
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
                  const canSelectPerson = visibleServices.length > 0;

                  return (
                    <tr key={person.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={canSelectPerson && selectedPersonIds.includes(person.id)}
                          onChange={() => toggleSelectedPerson(person.id)}
                          disabled={!canSelectPerson}
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
                            {availableServices.map((service) => (
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
                          <span className="error-message validation-message">Belum ada layanan aktif. Edit dan pilih layanan dulu.</span>
                        ) : visibleServices.length > 1 ? (
                          <span>{visibleServices.length} layanan dalam 1 link email</span>
                        ) : (
                          <a href={getSurveyLink(visibleServices[0], activeCampaignId)}>{getSurveyLink(visibleServices[0], activeCampaignId)}</a>
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

      <section className="blast-action-grid">
        <button
          type="button"
          className="blast-action-card"
          onClick={startEmailBlast}
          disabled={
            isEmailBlasting
            || !selectedSenderId
            || blastTargets.every((person) => !person.email.trim())
          }
        >
          <span>{isEmailBlasting ? 'Mengirim Email...' : 'Start Blast Email'}</span>
          <small>{selectedSenderId ? `${blastTargets.filter((person) => person.email.trim()).length} penerima siap, batch ${MAX_EMAIL_RECIPIENTS} orang` : 'Pilih sender email terlebih dahulu'}</small>
        </button>
      </section>

      <section className="table-card blast-section">
        <div className="section-heading-row">
          <div className="section-left-actions">
            <button type="button" className="text-button" onClick={refreshHistory}>Refresh</button>
            <h2>Riwayat Blast</h2>
          </div>
          <div className="inline-actions">
            {history.length > 0 && (
              <button
                type="button"
                className="download-button compact-download-button"
                onClick={() => { void downloadHistoryExcel(); }}
                disabled={filteredHistory.length === 0 || isDownloadingHistory}
              >
                {isDownloadingHistory ? 'Membuat Excel...' : 'Download Excel'}
              </button>
            )}
            {history.length > 0 && (
              <button
                type="button"
                className="text-button"
                onClick={requestClearHistory}
                disabled={isDeletingHistory}
              >
                Bersihkan Riwayat
              </button>
            )}
          </div>
        </div>

        <div className="filter-row history-filter-row">
          <label>
            Cari Riwayat
            <input
              value={historySearch}
              onChange={(event) => setHistorySearch(event.target.value)}
              placeholder="Nama, email, layanan, status"
            />
          </label>
          <label>
            Filter Layanan
            <select value={historyServiceFilter} onChange={(event) => setHistoryServiceFilter(event.target.value)}>
              <option value="">Semua layanan</option>
              {availableServices.map((service) => (
                <option key={service} value={service}>{service}</option>
              ))}
            </select>
          </label>
          <label>
            Filter Status
            <select value={historyStatusFilter} onChange={(event) => setHistoryStatusFilter(event.target.value)}>
              <option value="">Semua status</option>
              <option value="Belum isi">Belum isi</option>
              <option value="Terima, belum buka email/link">Terima, belum buka email/link</option>
              <option value="Terima, buka email, belum isi">Terima, buka email, belum isi</option>
              <option value="Terima, buka link, belum isi">Terima, buka link, belum isi</option>
              <option value="Terima dan sudah isi">Terima dan sudah isi</option>
              <option value="Gagal dikirim">Gagal dikirim</option>
            </select>
          </label>
          <div className="history-selection-actions" aria-label="Aksi riwayat blast">
            <button
              type="button"
              className="text-button"
              onClick={toggleAllFilteredHistory}
              disabled={filteredHistoryIds.length === 0 || isDeletingHistory}
            >
              {isAllFilteredHistorySelected ? 'Batal Pilih Semua' : 'Pilih Semua'}
            </button>
            <button
              type="button"
              className="text-button danger-button"
              onClick={requestDeleteSelectedHistory}
              disabled={selectedHistoryIds.length === 0 || isDeletingHistory}
            >
              {isDeletingHistory ? 'Menghapus...' : `Hapus Riwayat${selectedHistoryIds.length ? ` (${selectedHistoryIds.length})` : ''}`}
            </button>
          </div>
        </div>

        {history.length === 0 ? (
          <p>Belum ada riwayat blast.</p>
        ) : filteredHistory.length === 0 ? (
          <p>Tidak ada riwayat yang cocok dengan filter.</p>
        ) : (
          <div className="blast-table-wrapper limited-table-scroll">
            <table className="blast-table history-table">
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Waktu</th>
                  <th>Nama</th>
                  <th>Tujuan</th>
                  <th>Sender</th>
                  <th>Layanan</th>
                  <th>Link</th>
                  <th>Terkirim</th>
                  <th>Email Dibuka</th>
                  <th>Link Dibuka</th>
                  <th>Sudah Isi</th>
                  <th>Monitoring</th>
                  <th>Error</th>
                  <th>Pilih</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((row, index) => (
                  <tr key={`${row.id}-${row.serviceType}-${index}`}>
                    <td>{index + 1}</td>
                    <td>{new Date(row.createdAt).toLocaleString('id-ID')}</td>
                    <td>{row.personName}</td>
                    <td>
                      <span className="channel-badge email-channel">Email</span>
                      <span className="history-target">{row.email}</span>
                    </td>
                    <td>
                      {row.senderEmail ? (
                        <span className="sender-pill">
                          <strong>{getSenderDisplayLabel(row)}</strong>
                          <small>{row.senderEmail}</small>
                        </span>
                      ) : '-'}
                    </td>
                    <td>{row.serviceType}</td>
                    <td>
                      <div className="history-link-actions">
                        <a className="history-link" href={getHistoryManualBlastLink(row)}>Buka link</a>
                        <button type="button" className="history-link" onClick={() => copyManualBlastLink(row)}>
                          Salin link
                        </button>
                      </div>
                    </td>
                    <td>{formatDateTime(row.sentAt)}</td>
                    <td>{formatDateTime(row.openedAt)}</td>
                    <td>{formatDateTime(row.clickedAt)}</td>
                    <td>{formatDateTime(row.submittedAt)}</td>
                    <td>
                      <span className={`status-pill ${getMonitoringStatusClass(row)}`}>
                        {getMonitoringStatus(row)}
                      </span>
                    </td>
                    <td>{row.error || '-'}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedHistoryIds.includes(row.id)}
                        onChange={() => toggleSelectedHistory(row.id)}
                        aria-label={`Pilih riwayat blast ${row.personName}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isImportOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="import-title">
          <div className="import-modal">
            <div className="section-heading-row">
              <div>
                <p className="agency">Daftar Responden</p>
                <h2 id="import-title">Import Excel</h2>
              </div>
              <button
                type="button"
                className="text-button danger-button"
                onClick={() => setIsImportOpen(false)}
                disabled={isImporting}
              >
                Tutup
              </button>
            </div>

            <div className="import-help">
              <p>Gunakan kolom: Nama, Email, Layanan.</p>
              <p>Untuk beberapa layanan, pisahkan dengan koma di kolom Layanan.</p>
              <button type="button" className="download-button import-template-button" onClick={downloadImportTemplate}>
                Download Template Excel
              </button>
            </div>

            <label className="import-file-picker">
              Pilih file Excel
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(event) => handleImportFile(event.target.files?.[0])}
                disabled={isImporting}
              />
            </label>

            {importMessage && <p className="blast-notice">{importMessage}</p>}
            {importFileName && <p className="table-plain-text">File: {importFileName}</p>}

            {importRows.length > 0 && (
              <div className="import-preview">
                <div className="section-heading-row">
                  <h3>Preview</h3>
                  <span>{importRows.length} user siap masuk tabel</span>
                </div>
                <div className="blast-table-wrapper limited-table-scroll">
                  <table className="blast-table">
                    <thead>
                      <tr>
                        <th>Baris</th>
                        <th>Nama</th>
                        <th>Email</th>
                        <th>Layanan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importRows.slice(0, 8).map((row) => (
                        <tr key={`${row.rowNumber}-${row.email}`}>
                          <td>{row.rowNumber}</td>
                          <td>{row.name}</td>
                          <td>{row.email || '-'}</td>
                          <td>{row.serviceTypes.join(', ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {importRows.length > 8 && <p className="table-plain-text">Menampilkan 8 data pertama.</p>}
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="download-button"
                onClick={submitImportPeople}
                disabled={isImporting || importRows.length === 0}
              >
                {isImporting ? 'Mengimport...' : 'Submit Import'}
              </button>
              <button
                type="button"
                className="admin-link secondary-admin-link"
                onClick={() => setIsImportOpen(false)}
                disabled={isImporting}
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
      {historyDeleteDialog && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="history-delete-title">
          <div className="confirm-modal">
            <div>
              <p className="agency">Konfirmasi Hapus</p>
              <h2 id="history-delete-title">
                {historyDeleteDialog.kind === 'clear' ? 'Bersihkan Riwayat Blast?' : 'Hapus Riwayat Terpilih?'}
              </h2>
            </div>
            <p>
              {historyDeleteDialog.kind === 'clear'
                ? `Aksi ini akan menghapus seluruh ${historyDeleteDialog.count} riwayat blast untuk survey aktif.`
                : `Aksi ini akan menghapus ${historyDeleteDialog.count} riwayat blast yang sedang dipilih.`}
            </p>
            <p className="confirm-warning">Data yang sudah dihapus tidak bisa dikembalikan dari halaman ini.</p>
            <div className="modal-actions">
              <button
                type="button"
                className="admin-link secondary-admin-link"
                onClick={() => setHistoryDeleteDialog(null)}
                disabled={isDeletingHistory}
              >
                Batal
              </button>
              <button
                type="button"
                className="download-button danger-download-button"
                onClick={confirmHistoryDelete}
                disabled={isDeletingHistory}
              >
                {isDeletingHistory ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
      {isResetConfirmOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="reset-blast-title">
          <div className="confirm-modal">
            <div>
              <p className="agency">Konfirmasi Reset</p>
              <h2 id="reset-blast-title">Reset Blast?</h2>
            </div>
            <p>
              Aksi ini akan menghapus riwayat blast, status link, dan seluruh jawaban survey untuk survey aktif.
            </p>
            <p className="confirm-warning">Daftar responden, layanan, dan satuan kerja tetap aman.</p>
            <div className="modal-actions">
              <button
                type="button"
                className="admin-link secondary-admin-link"
                onClick={() => setIsResetConfirmOpen(false)}
                disabled={isResettingBlast}
              >
                Batal
              </button>
              <button
                type="button"
                className="download-button danger-download-button"
                onClick={() => { void resetBlast(); }}
                disabled={isResettingBlast}
              >
                {isResettingBlast ? 'Mereset...' : 'Ya, Reset'}
              </button>
            </div>
          </div>
        </div>
      )}
      {blastResultDialog && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="blast-result-title">
          <div className="blast-result-modal">
            <div>
              <p className="agency">Ringkasan Blast</p>
              <h2 id="blast-result-title">{blastResultDialog.title}</h2>
            </div>
            <div className="blast-result-grid">
              <div>
                <span>Sukses</span>
                <strong>{blastResultDialog.successCount}</strong>
              </div>
              <div>
                <span>Gagal</span>
                <strong>{blastResultDialog.failedCount}</strong>
              </div>
              <div>
                <span>Penerima</span>
                <strong>{blastResultDialog.totalCount}</strong>
              </div>
            </div>
            <p>{blastResultDialog.message}</p>
            <div className="modal-actions">
              <button
                type="button"
                className="download-button"
                onClick={() => setBlastResultDialog(null)}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
      <AdminFooter />
    </main>
  );
}
