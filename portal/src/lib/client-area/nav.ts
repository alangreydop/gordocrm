import type { ClientAreaSectionSlug } from '../../../../src/lib/client-area/contracts';

export interface ClientAreaNavItem {
  slug: ClientAreaSectionSlug;
  href: string;
  label: string;
  icon: string;
}

export const CLIENT_AREA_NAV: ClientAreaNavItem[] = [
  { slug: 'inicio', href: '/inicio', label: 'Inicio', icon: 'home' },
  { slug: 'proyectos', href: '/proyectos', label: 'Producción', icon: 'folder' },
  { slug: 'revisiones', href: '/revisiones', label: 'Revisiones', icon: 'eye' },
  { slug: 'archivos', href: '/archivos', label: 'Entregas', icon: 'download' },
  { slug: 'mensajes', href: '/mensajes', label: 'Mensajes', icon: 'message' },
  { slug: 'facturacion', href: '/facturacion', label: 'Facturación', icon: 'receipt' },
  { slug: 'perfil', href: '/perfil', label: 'Perfil', icon: 'user' },
];

export function isActiveNav(href: string, pathname: string): boolean {
  if (href === '/inicio') return pathname === '/inicio' || pathname === '/';
  return pathname.startsWith(href);
}