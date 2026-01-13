import { useState, useEffect } from 'react';
import { AlertTriangle, X, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger', // 'danger' | 'warning' | 'info'
  loading = false,
  requireReason = false, // Enable deletion reason form
}) {
  const [reason, setReason] = useState('');
  const [customDetail, setCustomDetail] = useState('');
  const [deleteReasonOptions, setDeleteReasonOptions] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  // Fetch delete reasons when modal opens with requireReason
  useEffect(() => {
    if (isOpen && requireReason) {
      const fetchDeleteReasons = async () => {
        setLoadingOptions(true);
        try {
          const { data, error } = await supabase
            .from('dropdown_options')
            .select('id, label, sort_order')
            .eq('category', 'delete_reason')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });
          
          if (error) throw error;
          setDeleteReasonOptions(data || []);
        } catch (err) {
          console.error('Failed to fetch delete reasons:', err);
          setDeleteReasonOptions([]);
        } finally {
          setLoadingOptions(false);
        }
      };
      fetchDeleteReasons();
    }
  }, [isOpen, requireReason]);

  // Reset states when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setReason(''); // Start empty - force explicit selection
      setCustomDetail('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      icon: 'bg-red-100 text-red-600',
      button: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
    },
    warning: {
      icon: 'bg-amber-100 text-amber-600',
      button: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500',
    },
    info: {
      icon: 'bg-blue-100 text-blue-600',
      button: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
    },
  };

  const styles = variantStyles[variant] || variantStyles.danger;

  // Validation: disable confirm if no reason selected, or "Other" selected but empty
  const isNoReasonSelected = reason === '';
  const isOtherEmpty = reason === 'Other' && customDetail.trim() === '';
  const isConfirmDisabled = loading || (requireReason && (isNoReasonSelected || isOtherEmpty));

  const handleConfirm = () => {
    if (requireReason) {
      const finalReason = reason === 'Other' 
        ? `Other: ${customDetail.trim()}` 
        : reason;
      onConfirm(finalReason);
    } else {
      onConfirm();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div 
        className="bg-white rounded-xl shadow-xl max-w-md w-full animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 pb-4">
          <div className="flex items-start gap-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${styles.icon}`}>
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
              <p className="mt-1 text-sm text-gray-500">{message}</p>
            </div>
            <button
              onClick={onClose}
              disabled={loading}
              className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Deletion Reason Form */}
        {requireReason && (
          <div className="px-6 pb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Why are you deleting this?
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={loadingOptions}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 ${
                isNoReasonSelected ? 'border-gray-300 text-gray-500' : 'border-gray-300 text-gray-900'
              } ${loadingOptions ? 'bg-gray-50' : ''}`}
            >
              <option value="" disabled>
                {loadingOptions ? 'Loading options...' : '-- Select a reason --'}
              </option>
              {deleteReasonOptions.map((opt) => (
                <option key={opt.id} value={opt.label}>{opt.label}</option>
              ))}
            </select>

            {/* Conditional "Other" textarea */}
            {reason === 'Other' && (
              <div className="mt-3">
                <textarea
                  value={customDetail}
                  onChange={(e) => setCustomDetail(e.target.value)}
                  placeholder="Please specify the reason..."
                  rows={3}
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none ${
                    isOtherEmpty ? 'border-red-300 bg-red-50' : 'border-gray-300'
                  }`}
                />
                {isOtherEmpty && (
                  <p className="mt-1 text-xs text-red-500">
                    Please provide a reason to continue
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
            className={`flex-1 px-4 py-2.5 text-white rounded-lg transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${styles.button}`}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
