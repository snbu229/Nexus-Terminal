import { NavLink, Outlet } from 'react-router';

const NAV = [
  { to: '/servers', label: 'Servers' },
  { to: '/terminals', label: 'Terminals' },
  { to: '/agents', label: 'Agents' },
  { to: '/approvals', label: 'Approvals' },
];

export function Shell() {
  return (
    <div className="shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <div className="dev-banner" role="region" aria-label="Development build">
        Development build, no authentication, mock data
      </div>
      <header className="brand">
        <strong>Nexus</strong>
      </header>
      <nav aria-label="Primary" className="nav">
        <ul>
          {NAV.map((n) => (
            <li key={n.to}>
              <NavLink to={n.to}>{n.label}</NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main id="main" tabIndex={-1} className="main">
        <Outlet />
      </main>
    </div>
  );
}
