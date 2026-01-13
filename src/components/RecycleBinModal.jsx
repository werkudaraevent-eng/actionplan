import { useState, useEffect } from 'react';
import { X, Trash2, RotateCcw, Loader2, AlertCircle } from 'lucide-react';

export default function RecycleBinModal({ 
  isOpen, 
  onClose, 
  fetchDeletedPlans, 
  onRestore,
  onPermanentDelete,
  isAdmin 
}) {
  const [deletedPlans, setDeletedPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadDeletedPlans();
    }
  }, [isOpen]);

  const loadDeletedPlans = async () => {
    setLoading(true);
    try {
      const data = await fetchDeletedPlans();
      setDeletedPlans(data);
    } catch (error) {
      console.error('Failed to load deleted plans:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (id) => {
    setRestoringId(id);
    try {
      await onRestore(id);
      setDeletedPlans((prev) => prev.filter((p) => p.id !== id));
    } catch (error) {
      console.error('Restore failed:', error);
      alert('Failed to restore. Please try again.');
    } finally {
      setRestoringId(null);
    }
  };

  const handlePermanentDelete = async (id) => {
    if (!window.confirm('This will permanently delete the item. This action cannot be undone. Continue?')) {
      return;
    }
    
    setDeletingId(id);
    try {
      await onPermanentDelete(id);
      setDeletedPlans((prev) => prev.filter((p) => p.id !== id));
    } catch (error) {
      console.error('Permanent delete failed:', error);
      alert('Failed to delete permanently. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Recycle Bin</h2>
              <p className="text-sm text-gray-500">
                {deletedPlans.length} deleted item{deletedPlans.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-teal-500 animate-spin mb-3" />
              <p className="text-gray-500">Loading deleted items...</p>
            </div>
          ) : deletedPlans.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <Trash2 className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-600 font-medium">Recycle Bin is Empty</p>
              <p className="text-gray-400 text-sm mt-1">Deleted items will appear here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {deletedPlans.map((plan) => (
                <div
                  key={plan.id}
                  className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800 truncate">
                        {plan.action_plan || plan.goal_strategy || 'Untitled'}
                      </p>
                      <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                        <span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-medium">
                          {plan.month}
                        </span>
                        <span>•</span>
                        <span>
                          {plan.deleted_by ? (
                            <>Deleted by <span className="font-medium text-gray-700">{plan.deleted_by}</span> on {formatDate(plan.deleted_at)}</>
                          ) : (
                            <>Deleted on {formatDate(plan.deleted_at)}</>
                          )}
                        </span>
                      </div>
                      {plan.indicator && (
                        <p className="text-sm text-gray-400 mt-1 truncate">
                          KPI: {plan.indicator}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleRestore(plan.id)}
                        disabled={restoringId === plan.id || deletingId === plan.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-teal-600 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {restoringId === plan.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RotateCcw className="w-4 h-4" />
                        )}
                        Restore
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => handlePermanentDelete(plan.id)}
                          disabled={restoringId === plan.id || deletingId === plan.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50"
                          title="Permanently delete"
                        >
                          {deletingId === plan.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl flex-shrink-0">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <AlertCircle className="w-4 h-4" />
            <span>Items in the recycle bin can be restored at any time.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
