/**
 * Main FileBrowser component - the core of the web interface
 */
import { useEffect, useCallback, useRef, useState } from 'react';
import { FolderPlus, Grid, List, Search, ChevronRight, Home, RefreshCw, Clipboard, ArrowUp, Film, Music, Image as ImageIcon, FileText, Menu, Upload, X } from 'lucide-react';
import { useFiles, useFolders, useUpdateFile, useUpdateFolder, useDeleteFolder, useDeleteFiles, useMoveFiles, TelegramFile, Folder, useRecentFiles, useContinueWatching, useDeleteFolders, useMoveFolders, useUploadFile, useUploadLink, UploadProgress, formatFileSize } from '../lib/api';
import { useAppStore } from '../lib/store';
import FileCard from './FileCard';
import FolderCard from './FolderCard';
import NewFolderModal from './NewFolderModal';
import MoveFileModal from './MoveFileModal';
import DeleteConfirmModal from './DeleteConfirmModal';
import RenameModal from './RenameModal';
import Sidebar from './Sidebar';
import Toasts from './Toasts';
import LinkUploadModal from './LinkUploadModal';

export default function FileBrowser() {
    const {
        currentFolderId,
        setCurrentFolderId,
        breadcrumbs,
        setBreadcrumbs,
        selectedFileIds,
        selectFile,
        selectedFolderIds,
        selectFolder,
        clearSelection,
        selectAll,
        viewMode,
        setViewMode,
        previewFile,
        setPreviewFile,
        showNewFolder,
        setShowNewFolder,
        moveItems,
        setMoveItems,
        deleteConfirm,
        setDeleteConfirm,
        searchQuery,
        setSearchQuery,
        fileTypeFilter,
        setFileTypeFilter,
        renameFile,
        setRenameFile,
        renameFolder,
        setRenameFolder,
        clipboard,
        setClipboard,
        selectionBox,
        setSelectionBox,
        activeSection,
        addToast,
        setSelectedFiles,
        setTriggerUpload,
        setTriggerUploadFromLink
    } = useAppStore();

    // Pagination state
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [allFiles, setAllFiles] = useState<TelegramFile[]>([]);
    const [showLinkUpload, setShowLinkUpload] = useState(false);

    // Data Fetching
    const { data: filesList, isLoading: filesLoading, refetch: refetchFiles } = useFiles(currentFolderId, fileTypeFilter || undefined, searchQuery || undefined, page);
    const { data: recentFiles, isLoading: recentLoading, refetch: refetchRecent } = useRecentFiles(50);
    const { data: cwFiles, isLoading: cwLoading, refetch: refetchCW } = useContinueWatching(50);
    

    // For files section, accumulate files from all pages
    useEffect(() => {
        if (filesList && activeSection === 'files') {
            setAllFiles(prev => {
                const existingIds = new Set(prev.map(f => f.id));
                const newFiles = filesList.files.filter(f => !existingIds.has(f.id));
                return [...prev, ...newFiles];
            });
            setHasMore(filesList.page * filesList.per_page < filesList.total);
        }
    }, [filesList, activeSection]);

    // Determine which files to show
    let displayFiles: TelegramFile[] | undefined;
    let isLoading = false;

    if (activeSection === 'recent') {
        displayFiles = recentFiles?.files;
        isLoading = recentLoading;
    } else if (activeSection === 'continue_watching') {
        displayFiles = cwFiles?.files;
        isLoading = cwLoading;
    } else {
        displayFiles = allFiles;
        isLoading = filesLoading;
    }

    // Folders only show in 'files' mode
    const { data: folders, isLoading: foldersLoading, refetch: refetchFolders } = useFolders(currentFolderId);
    const showFolders = activeSection === 'files' && !searchQuery && !fileTypeFilter;

    // Combined loading state
    isLoading = isLoading || (activeSection === 'files' && foldersLoading);
    
    // Mutations
    const deleteFilesMutation = useDeleteFiles();
    const deleteFolderMutation = useDeleteFolder();
    const deleteFoldersMutation = useDeleteFolders();
    const updateFileMutation = useUpdateFile();
    const moveFilesMutation = useMoveFiles();
    const moveFoldersMutation = useMoveFolders();
    const updateFolderMutation = useUpdateFolder();

    const containerRef = useRef<HTMLDivElement>(null);
    const [isSelecting, setIsSelecting] = useState(false);
    const [isSidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 768);
    const selectionStart = useRef({ x: 0, y: 0 });

    // Upload state
    const uploadMutation = useUploadFile();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [uploadQueue, setUploadQueue] = useState<{ file: globalThis.File; progress: UploadProgress | null; status: 'pending' | 'uploading' | 'done' | 'error'; error?: string }[]>([]);
    const [showUploadPanel, setShowUploadPanel] = useState(false);
    const dragCounter = useRef(0);

    // Set up the callbacks so Sidebar can trigger them
    useEffect(() => {
        setTriggerUpload(() => {
            fileInputRef.current?.click();
        });
        setTriggerUploadFromLink(() => {
            setShowLinkUpload(true);
        });
        return () => {
            setTriggerUpload(null);
            setTriggerUploadFromLink(null);
        };
    }, [setTriggerUpload, setTriggerUploadFromLink]);

    // handle refresh
    const handleRefresh = useCallback(() => {
        if (activeSection === 'files') {
            refetchFiles();
            refetchFolders();
        } else if (activeSection === 'recent') {
            refetchRecent();
        } else if (activeSection === 'continue_watching') {
            refetchCW();
        }
    }, [activeSection, refetchFiles, refetchFolders, refetchRecent, refetchCW]);

    // Upload handlers
    const processUploadQueue = useCallback(async (files: globalThis.File[]) => {
        const items = files.map(f => ({ file: f, progress: null as UploadProgress | null, status: 'pending' as const }));
        setUploadQueue(prev => [...prev, ...items]);
        setShowUploadPanel(true);

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            setUploadQueue(prev => prev.map((item, idx) => 
                item.file === file ? { ...item, status: 'uploading' as const } : item
            ));

            try {
                await uploadMutation.mutateAsync({
                    file,
                    folderId: currentFolderId,
                    onProgress: (progress) => {
                        setUploadQueue(prev => prev.map(item => 
                            item.file === file ? { ...item, progress } : item
                        ));
                    },
                });
                setUploadQueue(prev => prev.map(item => 
                    item.file === file ? { ...item, status: 'done' as const, progress: { loaded: 1, total: 1, percent: 100, fileName: file.name } } : item
                ));
                addToast(`Uploaded ${file.name}`, 'success');
            } catch (err: any) {
                setUploadQueue(prev => prev.map(item => 
                    item.file === file ? { ...item, status: 'error' as const, error: err.message } : item
                ));
                addToast(`Failed to upload ${file.name}`, 'error');
            }
        }

        // Reset accumulated files for re-fetch
        setPage(1);
        setAllFiles([]);
        setHasMore(true);
        handleRefresh();
    }, [currentFolderId, uploadMutation, addToast, handleRefresh]);

    const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length > 0) processUploadQueue(files);
        e.target.value = '';
    }, [processUploadQueue]);

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current++;
        if (e.dataTransfer.types.includes('Files')) {
            setIsDragOver(true);
        }
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current--;
        if (dragCounter.current === 0) {
            setIsDragOver(false);
        }
    }, []);

    const handleDragOverEvent = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDropFiles = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current = 0;
        setIsDragOver(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) processUploadQueue(files);
    }, [processUploadQueue]);

    // Handle drag-drop file to folder
    const handleFileDrop = useCallback(async (fileId: number, folderId: number) => {
        await updateFileMutation.mutateAsync({ id: fileId, folder_id: folderId });
    }, [updateFileMutation]);

    // Handle file rename
    const handleRenameFile = useCallback(async (newName: string) => {
        if (!renameFile) return;
        await updateFileMutation.mutateAsync({ id: renameFile.id, file_name: newName });
        setRenameFile(null);
    }, [renameFile, updateFileMutation, setRenameFile]);

    // Handle folder rename
    const handleRenameFolder = useCallback(async (newName: string) => {
        if (!renameFolder) return;
        await updateFolderMutation.mutateAsync({ id: renameFolder.id, name: newName });
        setRenameFolder(null);
    }, [renameFolder, updateFolderMutation, setRenameFolder]);

    // Navigate to folder
    const navigateToFolder = useCallback((folder: Folder | null) => {
        if (folder === null) {
            setCurrentFolderId(null);
            setBreadcrumbs([{ id: null, name: 'My Files' }]);
        } else {
            setCurrentFolderId(folder.id);
            setBreadcrumbs([...breadcrumbs, { id: folder.id, name: folder.name }]);
        }
        clearSelection();
    }, [breadcrumbs, clearSelection, setBreadcrumbs, setCurrentFolderId]);

    // Navigate via breadcrumbs
    const navigateToBreadcrumb = useCallback((index: number) => {
        const target = breadcrumbs[index];
        setCurrentFolderId(target.id);
        setBreadcrumbs(breadcrumbs.slice(0, index + 1));
        clearSelection();
    }, [breadcrumbs, clearSelection, setBreadcrumbs, setCurrentFolderId]);

    // Handle delete confirmation
    const handleDeleteConfirm = async () => {
        if (!deleteConfirm) return;
        const { type, items } = deleteConfirm;
        
        try {
            if (type === 'file') {
                const ids = items.map(i => i.id);
                await deleteFilesMutation.mutateAsync(ids);
            } else if (type === 'folder') {
                const ids = items.map(i => i.id);
                if (ids.length > 1) {
                    await deleteFoldersMutation.mutateAsync(ids);
                } else {
                    await deleteFolderMutation.mutateAsync({ id: ids[0] });
                }
            } else if (type === 'multiple') {
                 // Split into files and folders
                 const fileIds = items.filter(i => 'file_name' in i).map(i => i.id);
                 const folderIds = items.filter(i => 'name' in i && !('file_name' in i)).map(i => i.id);
                 
                 const promises = [];
                 if (fileIds.length > 0) promises.push(deleteFilesMutation.mutateAsync(fileIds));
                 if (folderIds.length > 0) promises.push(deleteFoldersMutation.mutateAsync(folderIds));
                 
                 await Promise.all(promises);
            }
            setDeleteConfirm(null);
            clearSelection();
            addToast('Items deleted successfully', 'success');
        } catch (error) {
            console.error('Delete failed:', error);
            addToast('Failed to delete items', 'error');
        }
    };



    // Handle Paste
    const handlePaste = useCallback(async () => {
        if (!clipboard) return;

        try {
            if (clipboard.mode === 'cut') {
                if (clipboard.files.length > 0) {
                    await moveFilesMutation.mutateAsync({
                        ids: clipboard.files.map(f => f.id),
                        folderId: currentFolderId
                    });
                }
                if (clipboard.folders.length > 0) {
                    await moveFoldersMutation.mutateAsync({
                        ids: clipboard.folders.map(f => f.id),
                        folderId: currentFolderId
                    });
                }
                setClipboard(null);
            } else if (clipboard.mode === 'copy') {
                alert("Copying files is not yet supported. Only Move (Cut) is supported.");
            }
        } catch (error) {
            console.error('Paste failed:', error);
        }
    }, [clipboard, currentFolderId, moveFilesMutation, moveFoldersMutation, setClipboard]);


    // Selection Box Logic
    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return; // Only left click
        // If clicking on a card or button, ignore
        if ((e.target as HTMLElement).closest('.file-card') || 
            (e.target as HTMLElement).closest('button') ||
            (e.target as HTMLElement).closest('.sidebar')) return;

        setIsSelecting(true);
        // Determine relative position in the container
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
            const startX = e.clientX - rect.left + containerRef.current!.scrollLeft;
            const startY = e.clientY - rect.top + containerRef.current!.scrollTop;
            selectionStart.current = { x: startX, y: startY };
            setSelectionBox({ x1: startX, y1: startY, x2: startX, y2: startY, active: true });
        }
        
        if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
            clearSelection();
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isSelecting || !containerRef.current) return;
        
        const rect = containerRef.current.getBoundingClientRect();
        const currentX = e.clientX - rect.left + containerRef.current.scrollLeft;
        const currentY = e.clientY - rect.top + containerRef.current.scrollTop;

        setSelectionBox({
            x1: selectionStart.current.x,
            y1: selectionStart.current.y,
            x2: currentX,
            y2: currentY,
            active: true
        });

        // Calculate selection
        const box = {
            left: Math.min(selectionStart.current.x, currentX),
            top: Math.min(selectionStart.current.y, currentY),
            right: Math.max(selectionStart.current.x, currentX),
            bottom: Math.max(selectionStart.current.y, currentY),
        };

        const fileIdsToSelect: number[] = [];
        const folderIdsToSelect: number[] = [];
        
        // Check files
        const fileElements = containerRef.current.querySelectorAll('[data-file-id]');
        fileElements.forEach((el) => {
            const elRect = (el as HTMLElement).getBoundingClientRect();
            const elLeft = elRect.left - rect.left + containerRef.current!.scrollLeft;
            const elTop = elRect.top - rect.top + containerRef.current!.scrollTop;
            const elRight = elLeft + elRect.width;
            const elBottom = elTop + elRect.height;

            if (elLeft < box.right && elRight > box.left && elTop < box.bottom && elBottom > box.top) {
                fileIdsToSelect.push(Number((el as HTMLElement).dataset.fileId));
            }
        });

        // Check folders
        const folderElements = containerRef.current.querySelectorAll('[data-folder-id]');
        folderElements.forEach((el) => {
            const elRect = (el as HTMLElement).getBoundingClientRect();
            const elLeft = elRect.left - rect.left + containerRef.current!.scrollLeft;
            const elTop = elRect.top - rect.top + containerRef.current!.scrollTop;
            const elRight = elLeft + elRect.width;
            const elBottom = elTop + elRect.height;

            if (elLeft < box.right && elRight > box.left && elTop < box.bottom && elBottom > box.top) {
                folderIdsToSelect.push(Number((el as HTMLElement).dataset.folderId));
            }
        });

        if (fileIdsToSelect.length > 0 || folderIdsToSelect.length > 0) {
            selectAll(fileIdsToSelect, folderIdsToSelect);
        } else {
            clearSelection();
        }
    };

    const handleMouseUp = () => {
        if (isSelecting) {
            setIsSelecting(false);
            setSelectionBox(null);
        }
    };

    // Handle File Open / Play
    const handleFileOpen = (file: TelegramFile) => {
        if (file.file_type === 'video' || file.file_type === 'audio') {
            setPreviewFile(file);
        } else {
            // For now, do nothing or show a toast
            // Maybe implement lightbox for images later
            if (file.file_type === 'image') {
                 // Future: Lightbox
            }
            // Prevent opening empty player
        }
    };

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if input/textarea is focused
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            // Ctrl+Shift+N - New Folder
            if (e.ctrlKey && e.shiftKey && (e.key === 'N' || e.key === 'n')) {
                e.preventDefault();
                setShowNewFolder(true);
                return;
            }

            // F5 or Ctrl+R - Refresh
            if (e.key === 'F5' || (e.ctrlKey && e.key === 'r')) {
                e.preventDefault();
                handleRefresh();
                return;
            }

            // Escape - close modals or clear selection
            if (e.key === 'Escape') {
                if (previewFile) setPreviewFile(null);
                else if (showNewFolder) setShowNewFolder(false);
                else if (moveItems) setMoveItems(null);
                else if (deleteConfirm) setDeleteConfirm(null);
                else clearSelection();
            }

            // Ctrl+A - select all
            if (e.ctrlKey && e.key === 'a' && displayFiles) {
                e.preventDefault();
                const allFileIds = displayFiles.map(f => f.id);
                const allFolderIds = folders?.map(f => f.id) || [];
                selectAll(allFileIds, allFolderIds);
            }

            // Delete - delete selected
            if (e.key === 'Delete' && (selectedFileIds.size > 0 || selectedFolderIds.size > 0)) {
                e.preventDefault();
                const selectedFiles = displayFiles?.filter(f => selectedFileIds.has(f.id)) || [];
                const selectedFolders = folders?.filter(f => selectedFolderIds.has(f.id)) || [];
                if (selectedFiles.length > 0 || selectedFolders.length > 0) {
                    setDeleteConfirm({ type: 'multiple', items: [...selectedFiles, ...selectedFolders] });
                }
            }

            // F2 - rename selected
            if (e.key === 'F2') {
                e.preventDefault();
                if (selectedFileIds.size === 1) {
                    const file = displayFiles?.find(f => selectedFileIds.has(f.id));
                    if (file) setRenameFile(file);
                } else if (selectedFolderIds.size === 1) {
                    const folder = folders?.find(f => selectedFolderIds.has(f.id));
                    if (folder) setRenameFolder(folder);
                }
            }

            // Backspace - go to parent folder
            if (e.key === 'Backspace' && breadcrumbs.length > 1) {
                navigateToBreadcrumb(breadcrumbs.length - 2);
            }

            // Ctrl+C - Copy
            if (e.ctrlKey && e.key === 'c' && (selectedFileIds.size > 0 || selectedFolderIds.size > 0)) {
                e.preventDefault();
                const selectedFiles = displayFiles?.filter(f => selectedFileIds.has(f.id)) || [];
                const selectedFolders = folders?.filter(f => selectedFolderIds.has(f.id)) || [];
                setClipboard({ mode: 'copy', files: selectedFiles, folders: selectedFolders });
            }

            // Ctrl+X - Cut
            if (e.ctrlKey && e.key === 'x' && (selectedFileIds.size > 0 || selectedFolderIds.size > 0)) {
                e.preventDefault();
                const selectedFiles = displayFiles?.filter(f => selectedFileIds.has(f.id)) || [];
                const selectedFolders = folders?.filter(f => selectedFolderIds.has(f.id)) || [];
                setClipboard({ mode: 'cut', files: selectedFiles, folders: selectedFolders });
            }

            // Ctrl+V - Paste
            if (e.ctrlKey && e.key === 'v' && clipboard && (clipboard.files.length > 0 || clipboard.folders.length > 0)) {
                e.preventDefault();
                handlePaste();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        previewFile, showNewFolder, moveItems, deleteConfirm, 
        selectedFileIds, displayFiles, breadcrumbs, clipboard, 
        currentFolderId, handlePaste, handleRefresh,
        setPreviewFile, setShowNewFolder, setMoveItems, setDeleteConfirm, 
        clearSelection, selectAll, setRenameFile, navigateToBreadcrumb, setClipboard, folders
    ]);

    // Keep selectedFiles in sync with selectedFileIds
    useEffect(() => {
        const selectedFiles = displayFiles?.filter(f => selectedFileIds.has(f.id)) || [];
        setSelectedFiles(selectedFiles);
    }, [selectedFileIds, displayFiles, setSelectedFiles]);

    // Infinite scrolling
    useEffect(() => {
        const handleScroll = () => {
            if (containerRef.current && !isLoading && hasMore && activeSection === 'files') {
                const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
                if (scrollTop + clientHeight >= scrollHeight - 100) {
                    // Load more files
                    setPage(prev => prev + 1);
                }
            }
        };

        const container = containerRef.current;
        if (container) {
            container.addEventListener('scroll', handleScroll);
            return () => container.removeEventListener('scroll', handleScroll);
        }
    }, [isLoading, hasMore, activeSection]);

    // Reset pagination when filters change
    useEffect(() => {
        setPage(1);
        setAllFiles([]);
        setHasMore(true);
    }, [currentFolderId, fileTypeFilter, searchQuery, activeSection]);

    return (
        <div className="flex h-screen bg-dark-950 text-white selection:bg-primary-500/30 overflow-hidden">
            <Sidebar isOpen={isSidebarOpen} onClose={() => setSidebarOpen(false)} />
            
            <main className={`flex-1 flex flex-col min-w-0 relative bg-gradient-to-br from-dark-950 to-dark-900 transition-[margin] duration-300 ease-in-out ${isSidebarOpen ? 'md:ml-64' : 'ml-0'}`}>
                {/* Header */}
                <header className="h-16 border-b border-white/[0.06] flex items-center justify-between px-4 sm:px-6 bg-dark-900/50 backdrop-blur-sm z-30 sticky top-0">
                    {/* Left: Hamburger & Search & Breadcrumbs */}
                    <div className="flex items-center gap-3 md:gap-6 flex-1 min-w-0">
                        {/* Hamburger */}
                        <button 
                            onClick={() => setSidebarOpen(!isSidebarOpen)}
                            className="p-2 -ml-2 text-dark-400 hover:text-white"
                        >
                            <Menu className="w-6 h-6" />
                        </button>

                        {/* Search */}
                        <div className="relative w-full max-w-[130px] sm:max-w-xs md:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
                            <input
                                type="text"
                                placeholder="Search..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-dark-800/50 border border-white/[0.06] rounded-lg pl-9 pr-3 py-1.5 text-sm text-white focus:outline-none focus:border-primary-500/50 focus:bg-dark-800 transition-all"
                            />
                        </div>
                        
                        {/* Vertical Div */}
                        <div className="hidden sm:block w-px h-6 bg-white/[0.1]"></div>

                        {/* Breadcrumbs */}
                        <nav className="flex items-center gap-0.5 overflow-hidden hidden sm:flex">
                            {breadcrumbs.map((crumb, index) => (
                                <div key={crumb.id || 'root'} className="flex items-center min-w-0">
                                    {index > 0 && <ChevronRight className="w-4 h-4 text-dark-600 mx-1 shrink-0" />}
                                    <button 
                                        onClick={() => navigateToBreadcrumb(index)}
                                        className={`px-2 py-1 rounded-md text-sm truncate max-w-[150px] transition-colors ${index === breadcrumbs.length - 1 
                                            ? 'text-white font-medium bg-white/[0.05]'
                                            : 'text-dark-400 hover:text-white hover:bg-white/[0.05]'
                                            }`}
                                    >
                                        {index === 0 && <Home className="w-3.5 h-3.5" />}
                                        {crumb.name}
                                    </button>
                                </div>
                            ))}
                        </nav>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 sm:gap-3">
                         {/* Filter buttons with Icons */}
                        <div className="hidden md:flex items-center bg-dark-800/50 rounded-lg p-0.5 border border-white/[0.06] mr-2">
                             <button
                                onClick={() => setFileTypeFilter(null)}
                                title="All Files"
                                className={`p-1.5 rounded-md transition-all ${
                                    !fileTypeFilter ? 'bg-primary-600 text-white shadow-sm' : 'text-dark-400 hover:text-white hover:bg-white/[0.05]'
                                }`}
                            >
                                <Grid className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setFileTypeFilter('video')}
                                title="Videos"
                                className={`p-1.5 rounded-md transition-all ${
                                    fileTypeFilter === 'video' ? 'bg-primary-600 text-white shadow-sm' : 'text-dark-400 hover:text-white hover:bg-white/[0.05]'
                                }`}
                            >
                                <Film className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setFileTypeFilter('audio')}
                                title="Audio"
                                className={`p-1.5 rounded-md transition-all ${
                                    fileTypeFilter === 'audio' ? 'bg-primary-600 text-white shadow-sm' : 'text-dark-400 hover:text-white hover:bg-white/[0.05]'
                                }`}
                            >
                                <Music className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setFileTypeFilter('image')}
                                title="Images"
                                className={`p-1.5 rounded-md transition-all ${
                                    fileTypeFilter === 'image' ? 'bg-primary-600 text-white shadow-sm' : 'text-dark-400 hover:text-white hover:bg-white/[0.05]'
                                }`}
                            >
                                <ImageIcon className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setFileTypeFilter('document')}
                                title="Documents"
                                className={`p-1.5 rounded-md transition-all ${
                                    fileTypeFilter === 'document' ? 'bg-primary-600 text-white shadow-sm' : 'text-dark-400 hover:text-white hover:bg-white/[0.05]'
                                }`}
                            >
                                <FileText className="w-4 h-4" />
                            </button>
                        </div>
 
                         <div className="flex items-center gap-1 bg-dark-800/50 rounded-lg p-0.5 border border-white/[0.06]">
                             <button
                                 onClick={handleRefresh}
                                 disabled={isLoading}
                                 className={`p-1.5 rounded-md text-dark-400 hover:text-white hover:bg-white/[0.05] transition-all active:scale-95 ${isLoading ? 'animate-spin' : ''}`}
                                 title="Refresh"
                             >
                                 <RefreshCw className="w-4 h-4" />
                             </button>
                             <div className="w-px h-3 bg-white/[0.1] mx-1"></div>
                             <button
                                 onClick={() => setViewMode('grid')}
                                 className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-primary-600 text-white shadow-sm' : 'text-dark-400 hover:text-white hover:bg-white/[0.05]'}`}
                             >
                                 <Grid className="w-4 h-4" />
                             </button>
                             <button
                                 onClick={() => setViewMode('list')}
                                 className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-primary-600 text-white shadow-sm' : 'text-dark-400 hover:text-white hover:bg-white/[0.05]'}`}
                             >
                                 <List className="w-4 h-4" />
                             </button>
                         </div>


                        {clipboard && (clipboard.files.length > 0 || clipboard.folders.length > 0) && (
                            <button
                                onClick={handlePaste}
                                className="ml-2 btn-secondary py-1.5 px-3 text-xs flex items-center gap-2 bg-primary-500/10 text-primary-300 border-primary-500/20 hover:bg-primary-500/20"
                            >
                                <Clipboard className="w-3.5 h-3.5" />
                                Paste ({clipboard.files.length + clipboard.folders.length})
                            </button>
                        )}


                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            className="hidden"
                            onChange={handleFileInputChange}
                        />
                    </div>
                </header>

                {/* Content Area */}
                <div 
                    ref={containerRef}
                    className="flex-1 overflow-auto p-6 relative outline-none"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    tabIndex={0}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDragOver={handleDragOverEvent}
                    onDrop={handleDropFiles}
                >
                    {/* Drag & Drop Overlay */}
                    {isDragOver && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-dark-950/80 backdrop-blur-sm border-2 border-dashed border-primary-500 rounded-xl m-4 pointer-events-none">
                            <div className="text-center animate-scale-in">
                                <div className="w-20 h-20 rounded-2xl bg-primary-500/20 flex items-center justify-center mx-auto mb-4 border border-primary-500/30">
                                    <Upload className="w-10 h-10 text-primary-400" />
                                </div>
                                <h3 className="text-xl font-bold text-white mb-1">Drop files here</h3>
                                <p className="text-dark-400">Files will be uploaded to the current folder</p>
                            </div>
                        </div>
                    )}
                    {isLoading && !displayFiles ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 animate-fade-in">
                            {[...Array(10)].map((_, i) => (
                                <div key={i} className="aspect-video bg-dark-800/50 rounded-xl animate-pulse"></div>
                            ))}
                        </div>
                    ) : (
                        <>
                             {/* Unified View */}
                             {(showFolders && folders?.length ? folders.length : 0) + (displayFiles?.length || 0) > 0 ? (
                                <div className={viewMode === 'grid'
                                    ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 pb-20'
                                    : 'flex flex-col gap-2 pb-20'
                                }>
                                    {/* Folders */}
                                    {showFolders && folders?.map((folder) => (
                                        <FolderCard
                                            key={folder.id}
                                            folder={folder}
                                            viewMode={viewMode}
                                            selected={selectedFolderIds.has(folder.id)}
                                            onSelect={(multi) => selectFolder(folder.id, multi)}
                                            onOpen={() => navigateToFolder(folder)}
                                            onFileDrop={handleFileDrop}
                                        />
                                    ))}
                                    
                                    {/* Files */}
                                    {displayFiles?.map((file) => (
                                        <FileCard
                                            key={file.id}
                                            file={file}
                                            viewMode={viewMode}
                                            selected={selectedFileIds.has(file.id)}
                                            onSelect={(multi) => selectFile(file.id, multi)}
                                            onPlay={() => handleFileOpen(file)}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-center pb-20 animate-fade-in">
                                    <div className="w-24 h-24 rounded-3xl bg-dark-800/50 flex items-center justify-center border border-white/[0.04] mb-6 shadow-2xl">
                                        <Upload className="w-10 h-10 text-dark-600" />
                                    </div>
                                    <h3 className="text-xl font-bold text-white mb-2">No files yet</h3>
                                    <p className="text-dark-400 max-w-xs mb-4">
                                        Drag & drop files here, click Upload, or send files to your Telegram bot
                                    </p>
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="btn-primary py-2.5 px-6 text-sm flex items-center gap-2"
                                    >
                                        <Upload className="w-4 h-4" />
                                        Upload Files
                                    </button>
                                </div>
                            )}

                            {/* Selection Rectangle Overlay */}
                            {selectionBox?.active && (
                                <div 
                                    className="absolute bg-primary-500/10 border border-primary-500/30 pointer-events-none rounded sm z-50 backdrop-blur-[1px]"
                                    style={{
                                        left: Math.min(selectionBox.x1, selectionBox.x2),
                                        top: Math.min(selectionBox.y1, selectionBox.y2),
                                        width: Math.abs(selectionBox.x1 - selectionBox.x2),
                                        height: Math.abs(selectionBox.y1 - selectionBox.y2),
                                    }}
                                />
                            )}
                        </>
                    )}

                    {/* Loading indicator for infinite scroll */}
                    {activeSection === 'files' && isLoading && hasMore && (
                        <div className="flex justify-center py-4">
                            <div className="w-6 h-6 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin"></div>
                        </div>
                    )}

                    {/* No more files message */}
                    {activeSection === 'files' && !hasMore && allFiles.length > 0 && (
                        <div className="text-center py-4 text-dark-400">
                            No more files
                        </div>
                    )}
                </div>
            </main>
            
            <Toasts />

            {/* Upload Progress Panel */}
            {showUploadPanel && uploadQueue.length > 0 && (
                <div className="fixed bottom-6 right-6 w-96 max-h-80 glass-panel shadow-2xl z-50 animate-slide-up overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                        <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                            <Upload className="w-4 h-4 text-primary-400" />
                            Uploads ({uploadQueue.filter(u => u.status === 'done').length}/{uploadQueue.length})
                        </h4>
                        <button
                            onClick={() => {
                                setShowUploadPanel(false);
                                if (uploadQueue.every(u => u.status === 'done' || u.status === 'error')) {
                                    setUploadQueue([]);
                                }
                            }}
                            className="p-1 rounded hover:bg-white/[0.08] text-dark-400 hover:text-white transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="overflow-y-auto max-h-60 no-scrollbar">
                        {uploadQueue.map((item, i) => (
                            <div key={i} className="px-4 py-2.5 border-b border-white/[0.04] last:border-0">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs text-white truncate max-w-[240px]">{item.file.name}</span>
                                    <span className="text-xs text-dark-400 shrink-0 ml-2">
                                        {item.status === 'done' ? '✓' : 
                                         item.status === 'error' ? '✗' : 
                                         item.status === 'uploading' ? `${item.progress?.percent || 0}%` : 
                                         'Waiting'}
                                    </span>
                                </div>
                                <div className="h-1 bg-dark-800 rounded-full overflow-hidden">
                                    <div 
                                        className={`h-full rounded-full transition-all duration-300 ${
                                            item.status === 'done' ? 'bg-emerald-500' :
                                            item.status === 'error' ? 'bg-red-500' :
                                            'bg-gradient-to-r from-primary-500 to-primary-400'
                                        }`}
                                        style={{ width: `${item.status === 'done' ? 100 : item.status === 'error' ? 100 : item.progress?.percent || 0}%` }}
                                    />
                                </div>
                                {item.status === 'error' && (
                                    <p className="text-xs text-red-400 mt-1">{item.error}</p>
                                )}
                                {item.status === 'uploading' && item.progress && (
                                    <p className="text-xs text-dark-500 mt-0.5">{formatFileSize(item.progress.loaded)} / {formatFileSize(item.progress.total)}</p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Modals */}
            {showNewFolder && (
                <NewFolderModal
                    parentId={currentFolderId}
                    onClose={() => setShowNewFolder(false)}
                />
            )}

            {showLinkUpload && (
                <LinkUploadModal
                    folderId={currentFolderId}
                    onClose={() => setShowLinkUpload(false)}
                    addToast={addToast}
                    onSuccess={handleRefresh}
                />
            )}

                {moveItems && (
                    <MoveFileModal
                        items={moveItems}
                        onClose={() => setMoveItems(null)}
                    />
                )}

            {deleteConfirm && (
                <DeleteConfirmModal
                    type={deleteConfirm.type}
                    count={deleteConfirm.items.length}
                    name={deleteConfirm.items.length === 1 
                        ? (deleteConfirm.type === 'file' ? (deleteConfirm.items[0] as TelegramFile).file_name : (deleteConfirm.items[0] as Folder).name)
                        : undefined
                    }
                    onConfirm={handleDeleteConfirm}
                    onClose={() => setDeleteConfirm(null)}
                />
            )}

            {/* Rename modals */}
            <RenameModal
                isOpen={!!renameFile}
                onClose={() => setRenameFile(null)}
                onRename={handleRenameFile}
                currentName={renameFile?.file_name || ''}
                itemType="file"
            />

            <RenameModal
                isOpen={!!renameFolder}
                onClose={() => setRenameFolder(null)}
                onRename={handleRenameFolder}
                currentName={renameFolder?.name || ''}
                itemType="folder"
            />
        </div>
    );
}
