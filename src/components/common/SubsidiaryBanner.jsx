import { Building2 } from 'lucide-react';
import { useCompanyContext } from '../../context/CompanyContext';

/**
 * SubsidiaryBanner — A read-only contextual badge that shows which
 * subsidiary the current operation targets. Reduces "context anxiety"
 * in modals where data is being created or imported.
 *
 * @param {string}  [icon]    - Emoji prefix (default: 🏢)
 * @param {string}  [prefix]  - Text before the company name (default: 'Target Subsidiary')
 * @param {string}  [variant] - 'default' | 'import' — alters color scheme
 */
export default function SubsidiaryBanner({ icon = '🏢', prefix = 'Target Subsidiary', variant = 'default' }) {
    const { activeCompany } = useCompanyContext();

    // Only show when we have a resolved company context
    if (!activeCompany?.name) return null;

    const styles = variant === 'import'
        ? 'bg-blue-50 border-blue-200 text-blue-800'
        : 'bg-gray-50 border-gray-200 text-gray-700';

    const nameStyles = variant === 'import'
        ? 'text-blue-900 font-bold'
        : 'text-gray-900 font-bold';

    return (
        <div className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border text-sm ${styles}`}>
            <Building2 className="w-4 h-4 flex-shrink-0 opacity-60" />
            <span>
                {icon} {prefix}: <span className={nameStyles}>{activeCompany.name}</span>
            </span>
        </div>
    );
}
