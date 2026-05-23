import { GENESIS_LOGO_URL, withBasePath } from '../services';

type AdminChromeProps = {
  eyebrow: string;
  title: string;
  currentPath?: string;
  actions?: Array<{
    href: string;
    label: string;
    secondary?: boolean;
  }>;
};

export function AdminHeader({ eyebrow, title, currentPath = '', actions = [] }: AdminChromeProps) {
  const visibleActions = actions.filter((action) => action.href !== currentPath);

  return (
    <header className="admin-topbar">
      <div className="admin-title-row">
        <a className="admin-brand-mark" href={withBasePath('/admin')} aria-label="Dashboard Admin">
          <img src={GENESIS_LOGO_URL} alt="Genesis" />
        </a>
        <div>
          <p>{eyebrow}</p>
          <h1>{title}</h1>
        </div>
      </div>

      <nav className="admin-nav" aria-label="Navigasi admin">
        {visibleActions.map((action) => (
          <a
            key={action.href}
            className={action.secondary ? 'admin-link secondary-admin-link' : 'admin-link'}
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
