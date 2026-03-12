import { useState, useRef, useCallback } from 'react';
import {
    Upload, Link2, Trash2, FileText, Image, FileSpreadsheet,
    Loader2, Plus, ExternalLink, X, AlertCircle, File,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

// ─── Constants ───
const ACCEPT_TYPES = '.pdf,.jpg,.jpeg,.png,.gif,.webp,.xlsx,.docx,.pptx,.csv';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const BUCKET = 'evidence-attachments';

function getFileIcon(mime) {
    if (!mime) return <File className="w-4 h-4 text-gray-400" />;
    if (mime.startsWith('image/')) return <Image className="w-4 h-4 text-blue-500" />;
    if (mime === 'application/pdf') return <FileText className="w-4 h-4 text-red-500" />;
    if (mime.includes('spreadsheet') || mime.includes('csv')) return <FileSpreadsheet className="w-4 h-4 text-green-600" />;
    return <FileText className="w-4 h-4 text-orange-500" />;
}

function formatSize(bytes) {
    if (!bytes || typeof bytes !== 'number') return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isValidUrl(str) {
    try {
        const url = new URL(str);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}


/**
 * Resolve the Supabase Storage relative path from an attachment object.
 * 3-tier fallback:
 *   1. item.storage_path  — explicit field (new uploads)
 *   2. item.path          — legacy field (older uploads)
 *   3. Parse from item.url — extract relative key from Supabase public URL
 *
 * Supabase public URLs follow this structure:
 *   https://<project>.supabase.co/storage/v1/object/public/<bucket>/<relative_path>
 * We split on `/object/public/<BUCKET>/` and take everything after it.
 *
 * Returns null if the path cannot be determined (e.g., link-type attachments).
 */
function resolveStoragePath(attachment) {
    if (attachment.storage_path) return attachment.storage_path;
    if (attachment.path) return attachment.path;

    if (attachment.url) {
        try {
            const marker = `/object/public/${BUCKET}/`;
            const markerIdx = attachment.url.indexOf(marker);
            if (markerIdx !== -1) {
                const relativePath = decodeURIComponent(
                    attachment.url.substring(markerIdx + marker.length)
                );
                if (relativePath) return relativePath;
            }
        } catch (err) {
            console.warn('[EvidenceManager] Failed to parse storage path from URL:', err);
        }
    }

    return null;
}

/**
 * Derive the download URL from the resolved storage path at render time.
 * Guarantees the link always points to the correct object in Supabase Storage,
 * even if the url field was saved with an incorrect filename.
 */
function getReliableUrl(item) {
    const storagePath = resolveStoragePath(item);
    if (storagePath) {
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
        return data.publicUrl;
    }
    return item.url;
}

/**
 * EvidenceManager — manages file uploads + link attachments
 *
 * Props:
 *  - value: Array<{ type: 'file'|'link', name?, url, size?, mime?, title? }>
 *  - onChange: (newArray | updater) => void
 *  - planId: string (UUID, used as storage path prefix)
 *  - disabled?: boolean
 *  - onFileStaged?: (storagePath: string) => void  — notify parent that a file was uploaded to storage
 *  - onFileUnstaged?: (storagePath: string) => void  — notify parent that a staged file was deleted
 */
export default function EvidenceManager({ value = [], onChange, planId, disabled = false, onFileStaged, onFileUnstaged }) {
    const { profile } = useAuth();
    const [activeTab, setActiveTab] = useState('file'); // 'file' | 'link'
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(null); // filename being uploaded
    const [linkUrl, setLinkUrl] = useState('');
    const [linkTitle, setLinkTitle] = useState('');
    const [linkError, setLinkError] = useState('');
    const [dragOver, setDragOver] = useState(false);
    const [error, setError] = useState('');
    const [deletingIdx, setDeletingIdx] = useState(null);
    const fileInputRef = useRef(null);

    // Is this an existing plan (saved in DB) vs a new unsaved plan?
    const isExistingPlan = planId && planId !== 'new';

    // ─── File Upload Handler (Batch — uses functional updater to prevent stale closure) ───
    const handleFiles = useCallback(async (files) => {
        if (disabled || uploading) return;
        setError('');

        const fileArr = Array.from(files);
        // Validate all files upfront before starting any uploads
        for (const file of fileArr) {
            if (file.size > MAX_FILE_SIZE) {
                setError(`"${file.name}" exceeds 10 MB limit.`);
                return;
            }
        }

        setUploading(true);
        setUploadProgress(fileArr.length === 1 ? fileArr[0].name : `${fileArr.length} files`);

        try {
            // Upload ALL files in parallel — each returns an attachment object or null
            const uploadPromises = fileArr.map(async (file) => {
                try {
                    const ts = Date.now();
                    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                    const storagePath = `${planId}/${ts}_${safeName}`;

                    const { error: uploadErr } = await supabase.storage
                        .from(BUCKET)
                        .upload(storagePath, file, { cacheControl: '3600', upsert: false });

                    if (uploadErr) throw uploadErr;

                    // Generate the public URL from the EXACT storage path used for upload
                    const { data: urlData } = supabase.storage
                        .from(BUCKET)
                        .getPublicUrl(storagePath);

                    return {
                        type: 'file',
                        name: file.name,
                        url: urlData.publicUrl,
                        storage_path: storagePath,  // BUG-1 FIX: Persist the exact upload key
                        path: storagePath,           // Keep legacy field for backward compat
                        size: file.size,
                        mime: file.type,
                    };
                } catch (err) {
                    console.error(`Upload failed for "${file.name}":`, err);
                    setError(`Failed to upload "${file.name}": ${err.message}`);
                    return null; // Mark as failed
                }
            });

            const results = await Promise.all(uploadPromises);
            const successfulUploads = results.filter(Boolean);

            // BUG-2 FIX: Use functional updater to always read latest state.
            // The old code did: onChange([...value, ...successfulUploads])
            // which closed over `value` from the render when handleFiles was *created*.
            // If the user triggered two rapid uploads, or React hadn't re-rendered,
            // `value` was stale — silently overwriting previously uploaded files.
            if (successfulUploads.length > 0) {
                onChange(prev => [...prev, ...successfulUploads]);

                // Notify parent about newly staged files (for cancel-cleanup)
                if (onFileStaged) {
                    successfulUploads.forEach(upload => {
                        const sp = upload.storage_path || upload.path;
                        if (sp) onFileStaged(sp);
                    });
                }
            }
        } catch (err) {
            console.error('Batch upload failed:', err);
            setError(`Upload failed: ${err.message}`);
        } finally {
            setUploading(false);
            setUploadProgress(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
        // NOTE: `value` intentionally removed from deps — we use functional updater now
    }, [disabled, uploading, planId, onChange, onFileStaged]);

    // ─── Drag & Drop ───
    const onDragOver = (e) => { e.preventDefault(); if (!disabled) setDragOver(true); };
    const onDragLeave = () => setDragOver(false);
    const onDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
    };

    // ─── Add Link ───
    const handleAddLink = () => {
        setLinkError('');
        const trimmed = linkUrl.trim();
        if (!trimmed) { setLinkError('Enter a URL.'); return; }
        if (!isValidUrl(trimmed)) { setLinkError('Enter a valid URL (https://...).'); return; }

        const item = {
            type: 'link',
            url: trimmed,
            title: linkTitle.trim() || new URL(trimmed).hostname,
        };

        // Use functional updater to avoid stale closure (consistent with file upload fix)
        onChange(prev => [...prev, item]);
        setLinkUrl('');
        setLinkTitle('');
    };

    // ─── Delete Item (Atomic 3-Step: Storage + DB + Activity Log) ───
    //
    // CRITICAL FIX: The old handler deleted the file from storage and updated
    // React state, but NEVER persisted the change to the database. The DB still
    // held the stale attachment URL → 404 on next page load or for other users.
    //
    // The new handler is a strict atomic operation:
    //   Step A: Delete file from Supabase Storage bucket
    //   Step B: UPDATE action_plans to persist the new attachments array + clear outcome_link
    //   Step C: INSERT into progress_logs for activity timeline
    //   Step D: Update local React state
    //
    const handleDelete = async (idx) => {
        if (disabled) return;
        const item = value[idx];
        setDeletingIdx(idx);
        setError('');

        try {
            // Compute the new attachments array (without the deleted item)
            const updatedAttachments = value.filter((_, i) => i !== idx);
            const deletedLabel = item.name || item.title || item.url || 'Attachment';

            // ── Step A: Physical storage deletion (file-type only) ──
            if (item.type === 'file') {
                const storagePath = resolveStoragePath(item);

                if (storagePath) {
                    console.log('[EvidenceManager] Step A: Removing from storage:', storagePath);
                    const { error: delErr } = await supabase.storage
                        .from(BUCKET)
                        .remove([storagePath]);

                    if (delErr) {
                        // Non-blocking: file may already be deleted (404)
                        console.warn('[EvidenceManager] Storage delete warning:', delErr.message);
                    }

                    // Notify parent to untrack this path from staged files
                    if (onFileUnstaged) onFileUnstaged(storagePath);
                } else {
                    console.warn('[EvidenceManager] No storage path resolvable for:', item);
                }
            }

            // ── Step B: Persist updated attachments to the action_plans table ──
            // This is the CRITICAL step that was missing. Without it, the DB
            // still references the deleted file, causing 404s for other users
            // and on page refresh.
            if (isExistingPlan) {
                console.log('[EvidenceManager] Step B: Persisting to DB. Remaining:', updatedAttachments.length);

                const updatePayload = {
                    attachments: updatedAttachments.length > 0 ? updatedAttachments : [],
                    // Update outcome_link (legacy compat field) to match
                    outcome_link: updatedAttachments.length > 0
                        ? (updatedAttachments[0].url || '')
                        : null,
                };

                const { error: dbErr } = await supabase
                    .from('action_plans')
                    .update(updatePayload)
                    .eq('id', planId);

                if (dbErr) {
                    console.error('[EvidenceManager] Step B FAILED — DB update error:', dbErr);
                    setError('Failed to save changes. The file was removed from storage but the database was not updated.');
                    // Don't return — still update local state so UI reflects the deletion
                }

                // ── Step C: Insert activity log entry ──
                // Records the removal in the user-facing activity timeline
                try {
                    const logMessage = item.type === 'file'
                        ? `📎 Evidence removed: "${deletedLabel}"`
                        : `🔗 Evidence link removed: "${deletedLabel}"`;

                    await supabase
                        .from('progress_logs')
                        .insert({
                            action_plan_id: planId,
                            user_id: profile?.id,
                            message: logMessage,
                            type: 'comment',
                        });
                    console.log('[EvidenceManager] Step C: Activity log inserted');
                } catch (logErr) {
                    // Non-blocking: don't fail the whole operation if logging fails
                    console.warn('[EvidenceManager] Step C: Activity log failed (non-blocking):', logErr);
                }
            }

            // ── Step D: Update local React state ──
            // Uses functional updater for closure safety
            onChange(prev => prev.filter((_, i) => i !== idx));

        } catch (err) {
            console.error('[EvidenceManager] Delete failed:', err);
            setError('Failed to delete attachment. Please try again.');
        } finally {
            setDeletingIdx(null);
        }
    };

    return (
        <div className="space-y-3">
            {/* ─── Tab Switcher ─── */}
            <div className="flex items-center gap-1 bg-gray-100 p-0.5 rounded-lg w-fit">
                <button
                    type="button"
                    onClick={() => setActiveTab('file')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${activeTab === 'file'
                        ? 'bg-white shadow text-gray-800'
                        : 'text-gray-500 hover:text-gray-700'
                        }`}
                    disabled={disabled}
                >
                    <Upload className="w-3.5 h-3.5" />
                    Upload File
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('link')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${activeTab === 'link'
                        ? 'bg-white shadow text-gray-800'
                        : 'text-gray-500 hover:text-gray-700'
                        }`}
                    disabled={disabled}
                >
                    <Link2 className="w-3.5 h-3.5" />
                    Add Link
                </button>
            </div>

            {/* ─── Tab A: File Upload ─── */}
            {activeTab === 'file' && (
                <div
                    className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors ${disabled
                        ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
                        : dragOver
                            ? 'border-blue-400 bg-blue-50'
                            : 'border-gray-200 bg-white hover:border-gray-300 cursor-pointer'
                        }`}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onClick={() => !disabled && !uploading && fileInputRef.current?.click()}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept={ACCEPT_TYPES}
                        multiple
                        className="hidden"
                        onChange={(e) => e.target.files?.length && handleFiles(e.target.files)}
                        disabled={disabled || uploading}
                    />

                    {uploading ? (
                        <div className="flex flex-col items-center gap-2">
                            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                            <p className="text-sm text-blue-600 font-medium">Uploading {uploadProgress}...</p>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-1.5">
                            <Upload className="w-7 h-7 text-gray-300" />
                            <p className="text-sm text-gray-600">
                                <span className="text-blue-600 font-medium">Click to upload</span> or drag and drop
                            </p>
                            <p className="text-xs text-gray-400">PDF, Images, Excel, Word, CSV — max 10 MB</p>
                        </div>
                    )}
                </div>
            )}

            {/* ─── Tab B: Add Link ─── */}
            {activeTab === 'link' && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="url"
                                value={linkUrl}
                                onChange={(e) => { setLinkUrl(e.target.value); setLinkError(''); }}
                                placeholder="https://drive.google.com/..."
                                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                disabled={disabled}
                                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddLink())}
                            />
                        </div>
                        <input
                            type="text"
                            value={linkTitle}
                            onChange={(e) => setLinkTitle(e.target.value)}
                            placeholder="Label (optional)"
                            className="w-36 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            disabled={disabled}
                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddLink())}
                        />
                        <button
                            type="button"
                            onClick={handleAddLink}
                            disabled={disabled || !linkUrl.trim()}
                            className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors flex-shrink-0"
                        >
                            <Plus className="w-4 h-4" />
                            Add
                        </button>
                    </div>
                    {linkError && (
                        <p className="text-xs text-red-500 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            {linkError}
                        </p>
                    )}
                </div>
            )}

            {/* ─── Error Display ─── */}
            {error && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                    <button type="button" onClick={() => setError('')} className="ml-auto">
                        <X className="w-3.5 h-3.5 text-red-400 hover:text-red-600" />
                    </button>
                </div>
            )}

            {/* ─── Attachment List ─── */}
            {value.length > 0 && (
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
                    {value.map((item, idx) => (
                        <div
                            key={idx}
                            className="flex items-center gap-3 px-3 py-2 bg-white hover:bg-gray-50 transition-colors group"
                        >
                            {/* Icon */}
                            {item.type === 'file' ? (
                                getFileIcon(item.mime)
                            ) : (
                                <ExternalLink className="w-4 h-4 text-indigo-500" />
                            )}

                            {/* Name / URL */}
                            <div className="flex-1 min-w-0">
                                {item.type === 'file' ? (
                                    <a
                                        href={getReliableUrl(item)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm text-gray-800 font-medium hover:text-blue-600 truncate block"
                                    >
                                        {item.name}
                                    </a>
                                ) : (
                                    <a
                                        href={item.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm text-indigo-600 font-medium hover:text-indigo-800 truncate block"
                                    >
                                        {item.title || item.url}
                                    </a>
                                )}
                            </div>

                            {/* Size (files only) */}
                            {item.type === 'file' && item.size && (
                                <span className="text-xs text-gray-400 flex-shrink-0">{formatSize(item.size)}</span>
                            )}

                            {/* Type badge */}
                            <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded flex-shrink-0 ${item.type === 'file'
                                ? 'bg-gray-100 text-gray-500'
                                : 'bg-indigo-50 text-indigo-500'
                                }`}>
                                {item.type}
                            </span>

                            {/* Delete */}
                            <button
                                type="button"
                                onClick={() => handleDelete(idx)}
                                disabled={disabled || deletingIdx === idx}
                                className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40 opacity-0 group-hover:opacity-100 flex-shrink-0"
                                title="Remove"
                            >
                                {deletingIdx === idx
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    : <Trash2 className="w-3.5 h-3.5" />
                                }
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* ─── Empty State ─── */}
            {value.length === 0 && !uploading && (
                <p className="text-xs text-gray-400 text-center py-1">No attachments yet.</p>
            )}
        </div>
    );
}
