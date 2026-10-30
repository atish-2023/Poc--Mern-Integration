import React from 'react';
import { NavLink, Link } from 'react-router-dom';

/**
 * Single source of truth for navigation links.
 * Reused on the Home page to avoid repeating slugs or labels.
 */
export const NAV_LINKS = [
  { label: 'Home', path: '/' },
  { label: 'About', path: '/poc-about', slug: 'poc-about' },
  { label: 'Pricing', path: '/poc-pricing', slug: 'poc-pricing' },
  { label: 'Contact', path: '/poc-contact', slug: 'poc-contact' },
];

export default function Header() {
  return (
    <header className="site-header">
      <div className="header-container">
        <Link to="/" className="brand-link">
          <span>PagePilot MERN POC</span>
        </Link>
        <nav>
          <ul className="nav-links">
            {NAV_LINKS.map((item) => (
              <li key={item.path} className="nav-item">
                <NavLink
                  to={item.path}
                  end={item.path === '/'}
                  className={({ isActive }) => (isActive ? 'active' : '')}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
