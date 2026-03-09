class StorageManager {
    constructor() {
        this.storageKey = 'privateCloudStorage';
        this.maxStorageSize = 500 * 1024 * 1024; // 500MB limit
        this.currentPath = '';
        this.files = [];
        this.loadFiles();
    }

    loadFiles() {
        const stored = localStorage.getItem(this.storageKey);
        if (stored) {
            try {
                this.files = JSON.parse(stored);
            } catch (e) {
                this.files = [];
            }
        } else {
            // Initialize with sample folders
            this.files = [
                {
                    id: 'folder1',
                    name: 'Documents',
                    type: 'folder',
                    path: '/',
                    size: 0,
                    createdAt: new Date().toISOString(),
                    items: []
                },
                {
                    id: 'folder2',
                    name: 'Images',
                    type: 'folder',
                    path: '/',
                    size: 0,
                    createdAt: new Date().toISOString(),
                    items: []
                }
            ];
            this.saveFiles();
        }
    }

    saveFiles() {
        localStorage.setItem(this.storageKey, JSON.stringify(this.files));
    }

    getCurrentFiles() {
        if (this.currentPath === '') {
            return this.files.filter(f => f.path === '/');
        }
        
        const currentFolder = this.findFolder(this.currentPath);
        return currentFolder ? currentFolder.items || [] : [];
    }

    findFolder(path) {
        if (path === '' || path === '/') return null;
        
        const parts = path.split('/').filter(p => p);
        let current = this.files;
        let folder = null;
        
        for (const part of parts) {
            const found = current.find(f => f.type === 'folder' && f.name === part);
            if (found) {
                folder = found;
                current = found.items || [];
            } else {
                return null;
            }
        }
        
        return folder;
    }

    createFolder(name) {
        const newFolder = {
            id: 'folder_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            name: name,
            type: 'folder',
            path: this.currentPath,
            size: 0,
            createdAt: new Date().toISOString(),
            items: []
        };

        if (this.currentPath === '') {
            this.files.push(newFolder);
        } else {
            const currentFolder = this.findFolder(this.currentPath);
            if (currentFolder) {
                if (!currentFolder.items) currentFolder.items = [];
                currentFolder.items.push(newFolder);
            }
        }

        this.saveFiles();
        return newFolder;
    }

    uploadFiles(files, onProgress) {
        const uploadPromises = [];
        
        for (const file of files) {
            const promise = new Promise((resolve, reject) => {
                const reader = new FileReader();
                
                reader.onload = (e) => {
                    const fileData = {
                        id: 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                        name: file.name,
                        type: this.getFileType(file.type),
                        mimeType: file.type,
                        size: file.size,
                        path: this.currentPath,
                        data: e.target.result,
                        lastModified: file.lastModified,
                        uploadedAt: new Date().toISOString()
                    };

                    if (this.currentPath === '') {
                        this.files.push(fileData);
                    } else {
                        const currentFolder = this.findFolder(this.currentPath);
                        if (currentFolder) {
                            if (!currentFolder.items) currentFolder.items = [];
                            currentFolder.items.push(fileData);
                        }
                    }

                    if (onProgress) {
                        onProgress(100);
                    }
                    
                    resolve(fileData);
                };

                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            
            uploadPromises.push(promise);
        }

        return Promise.all(uploadPromises).then(results => {
            this.saveFiles();
            return results;
        });
    }

    deleteFile(fileId) {
        const deleteFromArray = (array) => {
            const index = array.findIndex(f => f.id === fileId);
            if (index !== -1) {
                array.splice(index, 1);
                return true;
            }
            
            for (const item of array) {
                if (item.type === 'folder' && item.items) {
                    if (deleteFromArray(item.items)) {
                        return true;
                    }
                }
            }
            
            return false;
        };

        deleteFromArray(this.files);
        this.saveFiles();
    }

    getFileType(mimeType) {
        if (mimeType.startsWith('image/')) return 'image';
        if (mimeType.startsWith('video/')) return 'video';
        if (mimeType.startsWith('audio/')) return 'audio';
        if (mimeType.includes('pdf')) return 'pdf';
        if (mimeType.includes('document')) return 'document';
        if (mimeType.includes('sheet')) return 'spreadsheet';
        if (mimeType.includes('presentation')) return 'presentation';
        if (mimeType.includes('zip') || mimeType.includes('compress')) return 'archive';
        return 'other';
    }

    getStorageUsage() {
        let totalSize = 0;
        
        const calculateSize = (items) => {
            for (const item of items) {
                if (item.type === 'folder' && item.items) {
                    calculateSize(item.items);
                } else if (item.size) {
                    totalSize += item.size;
                }
            }
        };
        
        calculateSize(this.files);
        return totalSize;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    navigateTo(path) {
        this.currentPath = path;
    }

    navigateToFolder(folder) {
        const newPath = this.currentPath ? 
            this.currentPath + '/' + folder.name : 
            folder.name;
        this.currentPath = newPath;
    }

    navigateUp() {
        if (this.currentPath) {
            const parts = this.currentPath.split('/');
            parts.pop();
            this.currentPath = parts.join('/');
        }
    }

    getBreadcrumbs() {
        if (!this.currentPath) return [{ name: 'Home', path: '' }];
        
        const parts = this.currentPath.split('/');
        const breadcrumbs = [{ name: 'Home', path: '' }];
        let currentPath = '';
        
        for (const part of parts) {
            currentPath = currentPath ? currentPath + '/' + part : part;
            breadcrumbs.push({ name: part, path: currentPath });
        }
        
        return breadcrumbs;
    }

    searchFiles(query) {
        const results = [];
        
        const searchIn = (items) => {
            for (const item of items) {
                if (item.name.toLowerCase().includes(query.toLowerCase())) {
                    results.push(item);
                }
                if (item.type === 'folder' && item.items) {
                    searchIn(item.items);
                }
            }
        };
        
        searchIn(this.files);
        return results;
    }
}