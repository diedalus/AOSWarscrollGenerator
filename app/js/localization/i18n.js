// Small i18n provider that loads ./<lang>.json relative to this file.
// Robustness: tries several candidate URLs and logs helpful messages if files are missing.
//
// Usage:
//  - Wrap your app with I18nProvider
//  - Use useI18n() inside components: const { t, lang, setLang } = useI18n()
const { createContext, useContext, useState, useEffect } = React;

const I18nContext = createContext({
  lang: "en",
  setLang: () => {},
  t: (key) => key,
  ready: false,
});

async function fetchFirstAvailable(urls) {
  const errors = [];
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) {
        errors.push({ url, status: res.status });
        continue;
      }
      const json = await res.json();
      console.info("[i18n] loaded translations from:", url);
      return { url, json };
    } catch (err) {
      errors.push({ url, error: String(err) });
    }
  }
  const err = new Error("No translation files found");
  err.details = errors;
  throw err;
}

export function I18nProvider({ children }) {
  const initialLang = (() => {
    const stored = localStorage.getItem("language");
    if (stored) return stored;
    if (navigator.language && navigator.language.startsWith("de")) return "de";
    return "en";
  })();

  const [lang, setLangState] = useState(initialLang);
  const [messages, setMessages] = useState({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    setReady(false);

    (async () => {
      // Candidate URLs to try (in order). The module-relative URL is preferred.
      const candidates = [];

      // 1) module-relative: ./de.json (works when the JSON is next to this file)
      try {
        const moduleRelative = new URL(`./${lang}.json`, import.meta.url).toString();
        candidates.push(moduleRelative);
      } catch (e) {
        // import.meta.url may not be supported in some environments; ignore
      }

      // 2) absolute under the expected folder (helpful for dev servers)
      try {
        const abs = `${location.origin}/app/js/localization/${lang}.json`;
        candidates.push(abs);
      } catch (e) {}

      // 3) site-root fallback (if you kept de.json at repo root / served root)
      try {
        const root = `${location.origin}/${lang}.json`;
        candidates.push(root);
      } catch (e) {}

      // Remove duplicates while preserving order
      const uniqCandidates = [...new Set(candidates)];

      try {
        const { json } = await fetchFirstAvailable(uniqCandidates);
        if (!mounted) return;
        setMessages(json || {});
        setReady(true);
        try {
          document.documentElement.lang = lang === "de" ? "de" : "en";
        } catch (e) {}
      } catch (e) {
        // If nothing found, log detailed info and continue with an empty messages object.
        console.warn("[i18n] Failed to load translations:", e);
        if (e.details) {
          e.details.forEach((d) =>
            console.warn("[i18n] attempt:", d.url, d.status ? `status=${d.status}` : d.error)
          );
        }
        if (!mounted) return;
        setMessages({});
        setReady(true);
        try {
          document.documentElement.lang = lang === "de" ? "de" : "en";
        } catch (err) {}
      }
    })();

    return () => {
      mounted = false;
    };
  }, [lang]);

  const setLang = (l) => {
    localStorage.setItem("language", l);
    setLangState(l);
  };

  const t = (key) => {
    if (!key) return "";
    // support nested keys "namespace.key"
    const parts = key.split(".");
    let o = messages;
    for (const p of parts) {
      if (o && Object.prototype.hasOwnProperty.call(o, p)) {
        o = o[p];
      } else {
        return key; // fallback to the key itself if missing
      }
    }
    return typeof o === "string" ? o : key;
  };

  return React.createElement(
    I18nContext.Provider,
    { value: { lang, setLang, t, ready } },
    children
  );
}

export function useI18n() {
  return useContext(I18nContext);
}