// Theme + wallpaper: shared between the boot-time initializer (so pages with
// no <Layout/>, like the identify screen, still get the right look before
// first paint) and the Layout settings menu (for live switching).
export const WALLPAPERS = ['inferno', 'anubis', 'dust2', 'extra', 'none']
export const WP_URL = {
  inferno: '/bg/inferno.webp', anubis: '/bg/anubis.jpg',
  dust2: '/bg/dust2.jpg', extra: '/bg/extra.jpg',
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
}

export function applyWallpaper(wallpaper) {
  const url = WP_URL[wallpaper]
  document.documentElement.style.setProperty('--wallpaper', url ? `url('${url}')` : 'none')
}

export function initTheme() {
  applyTheme(localStorage.getItem('fc-theme') || 'dark')
  applyWallpaper(localStorage.getItem('fc-wallpaper') || 'inferno')
}
