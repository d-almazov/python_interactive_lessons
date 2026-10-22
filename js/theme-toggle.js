/* Перемикач світлої / темної теми (так само, як на d-almazov.github.io).
   Вибір зберігається в localStorage; без вибору тема йде за системною. */
(() => {
  const STORAGE_KEY = "theme";
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const systemTheme = () => (media.matches ? "dark" : "light");

  const storedTheme = () => {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return value === "light" || value === "dark" ? value : null;
    } catch (e) {
      return null;
    }
  };

  const button = document.querySelector("[data-theme-toggle]");

  const applyTheme = (theme) => {
    document.documentElement.dataset.theme = theme;
    if (!button) return;
    button.setAttribute("aria-pressed", String(theme === "dark"));
    button.setAttribute("aria-label", theme === "dark" ? "Увімкнути світлу тему" : "Увімкнути темну тему");
    button.title = theme === "dark" ? "Світла тема" : "Темна тема";
  };

  applyTheme(storedTheme() || systemTheme());

  button?.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
    applyTheme(next);
  });

  media.addEventListener("change", () => {
    if (!storedTheme()) applyTheme(systemTheme());
  });
})();
