import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, loadLanguage } from '../../i18n';

function handleLanguageChange(e: React.ChangeEvent<HTMLSelectElement>): void {
  void loadLanguage(e.target.value);
}

function LanguageSelector() {
  const { t, i18n } = useTranslation();
  const current = (i18n.resolvedLanguage ?? i18n.language ?? 'en').split('-', 1)[0];
  const value = (SUPPORTED_LANGUAGES as readonly string[]).includes(current) ? current : 'en';

  return (
    <select
      aria-label={t('language.label')}
      value={value}
      onChange={handleLanguageChange}
      className="text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded px-2 py-1.5 cursor-pointer"
    >
      {(SUPPORTED_LANGUAGES as readonly string[]).map((lng) => (
        <option key={lng} value={lng}>
          {t(lng === 'de' ? 'language.german' : 'language.english')}
        </option>
      ))}
    </select>
  );
}

export { LanguageSelector };
