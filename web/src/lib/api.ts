/**
 * API client and hooks for TelePlay backend.
 * Auth is now handled by Neon Auth (JWKS-based JWT).
 */
import axios from 'axios';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Types
export interface User {
    id: number;
    telegram_id: number | null;
    neon_auth_id: string | null;
    username: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    created_at: string;
    last_active: string;
}

export interface Folder {
    id: number;
    name: string;
    parent_id: number | null;
    user_id: number;
    created_at: string;
    updated_at: string;
    file_count: number;
    children?: Folder[];
}

export interface TelegramFile {
    id: number;
    user_id: number;
    folder_id: number | null;
    file_id: string;
    file_unique_id: string;
    file_name: string;
    file_size: number;
    mime_type: string | null;
    file_type: 'video' | 'audio' | 'document' | 'image';
    duration: number | null;
    width: number | null;
    height: number | null;
    created_at: string;
    updated_at: string;
    stream_url: string;
    thumbnail_url: string | null;
    last_pos?: number;
    public_hash?: string;
    public_stream_url?: string;
}

export interface FileListResponse {
    files: TelegramFile[];
    total: number;
    page: number;
    per_page: number;
}

export interface BotInfo {
    username: string;
    name?: string;
    server_version: string;
}

export interface StorageStats {
    total_size: number;
    limit: number;
}

// API client
export const api = axios.create({
    baseURL: '/api',
});

// Add auth token to requests (Neon Auth JWT from localStorage)
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Handle 401 and 429 errors
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        if (error.response?.status === 401) {
            // Token expired or invalid — redirect to login
            localStorage.removeItem('access_token');
            localStorage.removeItem('user');
            window.location.href = '/login';
            return Promise.reject(error);
        } else if (error.response?.status === 429) {
            console.log('[API] 429 Too Many Requests - rate limited');
            error.message = 'Too many requests. Please wait a moment and try again.';
        }
        
        return Promise.reject(error);
    }
);

// ============== Auth Hooks ==============

export const useCurrentUser = () => {
    return useQuery({
        queryKey: ['currentUser'],
        queryFn: async () => {
            const { data } = await api.get<User>('/auth/me');
            return data;
        },
        retry: false,
    });
};

export const useBotInfo = () => {
    return useQuery({
        queryKey: ['botInfo'],
        queryFn: async () => {
            const { data } = await api.get<BotInfo>('/auth/bot/info');
            return data;
        },
        staleTime: Infinity, // Bot info doesn't change during session
    });
};

export const useNeonAuthUrl = () => {
    return useQuery({
        queryKey: ['neonAuthUrl'],
        queryFn: async () => {
            const { data } = await api.get<{ auth_url: string }>('/auth/neon-auth-url');
            return data.auth_url;
        },
        staleTime: Infinity,
    });
};

// ============== Files Hooks ==============

export interface UploadProgress {
    loaded: number;
    total: number;
    percent: number;
    fileName: string;
}

export const useUploadFile = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ 
            file, 
            folderId, 
            onProgress 
        }: { 
            file: globalThis.File; 
            folderId?: number | null; 
            onProgress?: (progress: UploadProgress) => void;
        }) => {
            const formData = new FormData();
            formData.append('file', file);
            
            const params = new URLSearchParams();
            if (folderId !== null && folderId !== undefined) {
                params.append('folder_id', String(folderId));
            }
            
            const token = localStorage.getItem('access_token');
            const url = `/api/files/upload${params.toString() ? '?' + params.toString() : ''}`;
            
            // Use XMLHttpRequest for progress tracking
            return new Promise<TelegramFile>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', url);
                
                if (token) {
                    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
                }
                
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable && onProgress) {
                        onProgress({
                            loaded: e.loaded,
                            total: e.total,
                            percent: Math.round((e.loaded / e.total) * 100),
                            fileName: file.name,
                        });
                    }
                };
                
                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve(JSON.parse(xhr.responseText));
                    } else {
                        try {
                            const err = JSON.parse(xhr.responseText);
                            reject(new Error(err.detail || 'Upload failed'));
                        } catch {
                            reject(new Error(`Upload failed (${xhr.status})`));
                        }
                    }
                };
                
                xhr.onerror = () => reject(new Error('Network error during upload'));
                xhr.send(formData);
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['files'] });
            queryClient.invalidateQueries({ queryKey: ['folders'] });
            queryClient.invalidateQueries({ queryKey: ['storage'] });
        },
    });
};

export const useUploadLink = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({
            url,
            filename,
            folderId
        }: {
            url: string;
            filename?: string;
            folderId?: number | null;
        }) => {
            const { data } = await api.post<TelegramFile>('/files/upload-link', {
                url,
                filename,
                folder_id: folderId,
            });
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['files'] });
            queryClient.invalidateQueries({ queryKey: ['folders'] });
            queryClient.invalidateQueries({ queryKey: ['storage'] });
        },
    });
};


export const useFiles = (folderId?: number | null, fileType?: string, search?: string, page = 1) => {
    return useQuery({
        queryKey: ['files', folderId, fileType, search, page],
        queryFn: async () => {
            const params: Record<string, any> = {};
            if (folderId !== undefined) params.folder_id = folderId;
            if (fileType) params.file_type = fileType;
            if (search) params.search = search;
            params.page = page;
            params.per_page = 50; // Load 50 files per page
            const { data } = await api.get<FileListResponse>('/files', { params });
            return data;
        },
        staleTime: 30000, // Keep data fresh for 30s to avoid over-fetching
    });
};

export const useFile = (fileId: number) => {
    return useQuery({
        queryKey: ['file', fileId],
        queryFn: async () => {
            const { data } = await api.get<TelegramFile>(`/files/${fileId}`);
            return data;
        },
        enabled: !!fileId,
    });
};

export const useUpdateFile = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, ...data }: { id: number; file_name?: string; folder_id?: number | null }) => {
            const { data: result } = await api.patch<TelegramFile>(`/files/${id}`, data);
            return result;
        },
        onSuccess: () => {
            // Invalidate both files and folders to ensure UI updates for moves
            queryClient.invalidateQueries({ queryKey: ['files'] });
            queryClient.invalidateQueries({ queryKey: ['folders'] });
            queryClient.invalidateQueries({ queryKey: ['folderTree'] });
        },
    });
};

export const useDeleteFile = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: number) => {
            await api.delete(`/files/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['files'] });
        },
    });
};

export const useDeleteFiles = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (ids: number[]) => {
            await api.post('/files/batch-delete', ids as any); // Axios automatically handles array as JSON body
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['files'] });
             queryClient.invalidateQueries({ queryKey: ['folders'] }); // Files might be inside folders affecting counts
             queryClient.invalidateQueries({ queryKey: ['storage'] });
        },
    });
};

export const useMoveFiles = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ ids, folderId }: { ids: number[]; folderId: number | null }) => {
            await api.post('/files/batch-move', { ids, folder_id: folderId });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['files'] });
            queryClient.invalidateQueries({ queryKey: ['folders'] });
            queryClient.invalidateQueries({ queryKey: ['folderTree'] });
        },
    });
};

export const useRecentFiles = (limit = 20) => {
    return useQuery<FileListResponse>({
        queryKey: ['files', 'recent', limit],
        queryFn: async () => {
             const { data } = await api.get<FileListResponse>('/files/recent', { params: { limit } });
             return data;
        },
    });
};

export const useContinueWatching = (limit = 20) => {
    return useQuery<FileListResponse>({
        queryKey: ['files', 'continue-watching', limit],
        queryFn: async () => {
             const { data } = await api.get<FileListResponse>('/files/continue-watching', { params: { limit } });
             return data;
        },
    });
};

export const useStorageStats = () => {
    return useQuery<StorageStats>({
        queryKey: ['storage'],
        queryFn: async () => {
             const { data } = await api.get<StorageStats>('/files/storage');
             return data;
        },
        staleTime: 60000,
    });
};

export const useUpdateProgress = () => {
    return useMutation({
        mutationFn: async ({ fileId, position, duration }: { fileId: number; position: number; duration?: number }) => {
            await api.post(`/files/${fileId}/progress`, { position, duration });
        },
    });
};

// ============== Folders Hooks ==============

export const useMoveFolders = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ ids, folderId }: { ids: number[]; folderId: number | null }) => {
            await api.post('/folders/batch-move', { ids, folder_id: folderId });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['folders'] });
            queryClient.invalidateQueries({ queryKey: ['folderTree'] });
        },
    });
};

export const useFolders = (parentId?: number | null) => {
    return useQuery({
        queryKey: ['folders', parentId],
        queryFn: async () => {
            const params: Record<string, any> = {};
            if (parentId !== undefined) params.parent_id = parentId;
            const { data } = await api.get<Folder[]>('/folders', { params });
            return data;
        },
        staleTime: 60000, // Folders change less often
    });
};

export const useFolderTree = () => {
    return useQuery({
        queryKey: ['folderTree'],
        queryFn: async () => {
            const { data } = await api.get<Folder[]>('/folders/tree');
            return data;
        },
        staleTime: 60000,
    });
};

export const useCreateFolder = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: { name: string; parent_id?: number | null }) => {
            const { data: result } = await api.post<Folder>('/folders', data);
            return result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['folders'] });
            queryClient.invalidateQueries({ queryKey: ['folderTree'] });
        },
    });
};

export const useUpdateFolder = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, ...data }: { id: number; name?: string; parent_id?: number | null }) => {
            const { data: result } = await api.patch<Folder>(`/folders/${id}`, data);
            return result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['folders'] });
            queryClient.invalidateQueries({ queryKey: ['folderTree'] });
        },
    });
};

export const useDeleteFolder = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, moveFilesTo }: { id: number; moveFilesTo?: number | null }) => {
            const params = moveFilesTo !== undefined ? { move_files_to: moveFilesTo } : {};
            await api.delete(`/folders/${id}`, { params });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['folders'] });
            queryClient.invalidateQueries({ queryKey: ['folderTree'] });
            queryClient.invalidateQueries({ queryKey: ['files'] });
        },
    });
};

export const useDeleteFolders = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (ids: number[]) => {
            await api.post('/folders/batch-delete', ids as any);
        },
        onSuccess: () => {
             queryClient.invalidateQueries({ queryKey: ['folders'] });
             queryClient.invalidateQueries({ queryKey: ['folderTree'] });
             queryClient.invalidateQueries({ queryKey: ['files'] });
             queryClient.invalidateQueries({ queryKey: ['storage'] });
        },
    });
};

// ============== Utilities ==============

export const formatFileSize = (bytes: number): string => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
};

export const formatDuration = (seconds: number | null): string => {
    if (!seconds) return '';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

export const getFileIcon = (fileType: string): string => {
    switch (fileType) {
        case 'video': return '🎬';
        case 'audio': return '🎵';
        case 'image': return '🖼️';
        case 'document': return '📄';
        default: return '📎';
    }
};
