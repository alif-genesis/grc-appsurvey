import { GENESIS_LOGO_URL, withBasePath } from '../services';

type AdminChromeProps = {
  eyebrow: string;
  title: string;
  currentPath?: string;
  homeHref?: string;
  actions?: Array<{
    href: string;
    label: string;
    secondary?: boolean;
  }>;
};

type AdminAction = NonNullable<AdminChromeProps['actions']>[number];

const defaultAdminActions: AdminAction[] = [
  { href: '/control', label: 'Control Panel' },
  { href: '/admin', label: 'Monitoring' },
  { href: '/monitoring', label: 'Hasil Survey' },
  { href: '/blasting', label: 'Blasting' },
  { href: '/list', label: 'List Layanan' },
];

export function AdminHeader({ eyebrow, title, currentPath = '', homeHref = '/admin', actions = [] }: AdminChromeProps) {
  const navActions: AdminAction[] = actions.length > 0 ? actions : defaultAdminActions;

  return (
    <header className="admin-topbar">
      <div className="admin-title-row">
        <a className="admin-brand-mark" href={withBasePath(homeHref)} aria-label="Dashboard Admin">
          <img src={GENESIS_LOGO_URL} alt="Genesis" width={280} height={100} decoding="async" />
        </a>
        <div>
          <p>{eyebrow}</p>
          <h1>{title}</h1>
        </div>
      </div>

      <nav className="admin-nav" aria-label="Navigasi admin">
        {navActions.map((action) => (
          <a
            key={action.href}
            className={[
              'admin-link',
              action.secondary ? 'secondary-admin-link' : '',
              action.href === currentPath ? 'active-admin-link' : '',
            ].filter(Boolean).join(' ')}
            href={withBasePath(action.href)}
          >
            {action.label}
          </a>
        ))}
        <a className="admin-link secondary-admin-link" href={withBasePath('/api/logout')}>
          Logout
        </a>
      </nav>
    </header>
  );
}

export function AdminFooter() {
  return (
    <footer className="app-footer">
      © 2026 PT. Genetika Solusi Bisnis
    </footer>
  );
}
