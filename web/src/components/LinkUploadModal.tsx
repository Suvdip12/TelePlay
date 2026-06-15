/**
 * LinkUploadModal - modal for uploading a file via a direct link
 */
import { useState } from 'react';
import { X, Link } from 'lucide-react';
import { useUploadLink } from '../lib/api';

interface LinkUploadModalProps {
    folderId: number | null;
    onClose: () => void;
    addToast: (message: string, type: 'success' | 'error' | 'info') => void;
    onSuccess?: () => void;
}

export default function LinkUploadModal({ folderId, onClose, addToast, onSuccess }: LinkUploadModalProps) {
    const [url, setUrl] = useState('');
    const [filename, setFilename] = useState('');
    const uploadLink = useUploadLink();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!url.trim()) return;

        try {
            addToast('Download and Telegram upload started in background...', 'info');
            onClose(); // Close the modal early so user doesn't wait blocked
            
            await uploadLink.mutateAsync({
                url: url.trim(),
                filename: filename.trim() || undefined,
                folderId: folderId,
            });
            
            addToast('Link upload completed successfully!', 'success');
            if (onSuccess) onSuccess();
        } catch (err: any) {
            addToast(err.message || 'Link upload failed', 'error');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="glass-card w-full max-w-md p-6 animate-slide-up">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Link className="w-5 h-5 text-primary-400" />
                        Upload from Link
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-dark-700 rounded">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <label className="block text-sm text-dark-300 mb-1">Direct File URL</label>
                    <input
                        type="url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://example.com/video.mp4"
                        autoFocus
                        required
                        className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/50 mb-3"
                    />

                    <label className="block text-sm text-dark-300 mb-1">File Name (Optional)</label>
                    <input
                        type="text"
                        value={filename}
                        onChange={(e) => setFilename(e.target.value)}
                        placeholder="e.g. MyVideo.mp4"
                        className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/50 mb-4"
                    />

                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-dark-400 hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!url.trim() || uploadLink.isPending}
                            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {uploadLink.isPending ? 'Starting...' : 'Upload'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
