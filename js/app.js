class CloudStorageApp {
    constructor() {
        this.storage = new StorageManager();
        this.auth = new AuthManager();
        this.initializeApp();
    }

    initializeApp() {
        this.cacheElements();
        this.attachEventListeners();
        this.checkAuth();
    }

    cacheElements() {
        this.fileGrid = document.getElementById('fileGrid');
        this.uploadModal = new bootstrap.Modal(document.getElementById('uploadModal'));
        this.previewModal = new bootstrap.Modal(document.getElementById('previewModal'));
        this.storageProgress = document.getElementById('storageProgress');
        this.storageText = document.getElementById('storageText');
        this.breadcrumb = document.getElementById('breadcrumb');
        this.currentFolderEl = document.getElementById('currentFolder');
        this.dropZone = document.getElementById('dropZone');
        this.fileInput = document.getElementById('fileInput');
        this.authSection = document.getElementById('authSection');
    }

    attachEventListeners() {
        // File upload
        this.dropZone.addEventListener('click', () => this.fileInput.click());
        this.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dropZone.classList.add('dragover');
        });
        this.dropZone.addEventListener('dragleave', () => {
            this.dropZone.classList.remove('dragover');
        });
        this.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dropZone.classList.remove('dragover');
            this.handleFileUpload(e.dataTransfer.files);
        });
        
        this.fileInput.addEventListener('change', (e) => {
            this.handleFileUpload(e.target.files);
        });

        // Navigation
        document.getElementById('allFilesBtn').addEventListener('click', () => {
            this.storage.navigateTo('');
            this.renderFiles();
        });

        document.getElementById('imagesBtn').addEventListener('click', () => {
            this.filterFiles('image');
        });

        document.getElementById('documentsBtn').addEventListener('click', () => {
            this.filterFiles('document');
        });

        document.getElementById('videosBtn').addEventListener('click', () => {
            this.filterFiles('video');
        });

        document.getElementById('newFolderBtn').addEventListener('click', () => {
            this.createNewFolder();
        });

        // Search functionality
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'form-control me-2';
        searchInput.placeholder = 'Search files...';
        searchInput.addEventListener('input', (e) => {
            this.searchFiles(e.target.value);
        });
        
        const navbar = document.querySelector('.navbar .container-fluid');
        navbar.appendChild(searchInput);
    }

    checkAuth() {
        if (!this.auth.isAuthenticated()) {
            this.showAuthForms();
        } else {
            this.renderAuthSection();
            this.renderFiles();
            this.updateStorageInfo();
        }
    }

    showAuthForms() {
        const authHtml = `
            <div class="modal fade" id="authModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Login / Register</h5>
                        </div>
                        <div class="modal-body">
                            <ul class="nav nav-tabs mb-3" id="authTabs">
                                <li class="nav-item">
                                    <a class="nav-link active" data-bs-toggle="tab" href="#login">Login</a>
                                </li>
                                <li class="nav-item">
                                    <a class="nav-link" data-bs-toggle="tab" href="#register">Register</a>
                                </li>
                            </ul>
                            <div class="tab-content">
                                <div class="tab-pane active" id="login">
                                    <form id="loginForm">
                                        <div class="mb-3">
                                            <label>Username</label>
                                            <input type="text" class="form-control" id="loginUsername" required>
                                        </div>
                                        <div class="mb-3">
                                            <label>PIN (4 digits)</label>
                                            <input type="password" class="form-control" id="loginPin" maxlength="4" pattern="\d{4}" required>
                                        </div>
                                        <button type="submit" class="btn btn-primary w-100">Login</button>
                                    </form>
                                </div>
                                <div class="tab-pane" id="register">
                                    <form id="registerForm">
                                        <div class="mb-3">
                                            <label>Username</label>
                                            <input type="text" class="form-control" id="registerUsername" required>
                                        </div>
                                        <div class="mb-3">
                                            <label>PIN (4 digits)</label>
                                            <input type="password" class="form-control" id="registerPin" maxlength="4" pattern="\d{4}" required>
                                        </div>
                                        <div class="mb-3">
                                            <label>Confirm PIN</label>
                                            <input type="password" class="form-control" id="confirmPin" maxlength="4" pattern="\d{4}" required>
                                        </div>
                                        <button type="submit" class="btn btn-primary w-100">Register</button>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', authHtml);
        const authModal = new bootstrap.Modal(document.getElementById('authModal'));
        authModal.show();

        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const username = document.getElementById('loginUsername').value;
            const pin = document.getElementById('loginPin').value;
            
            const result = this.auth.login(username, pin);
            if (result.success) {
                authModal.hide();
                this.checkAuth();
                this.showToast('Login successful!', 'success');
            } else {
                this.showToast(result.message, 'error');
            }
        });

        document.getElementById('registerForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const username = document.getElementById('registerUsername').value;
            const pin = document.getElementById('registerPin').value;
            const confirmPin = document.getElementById('confirmPin').value;
            
            if (pin !== confirmPin) {
                this.showToast('PINs do not match', 'error');
                return;
            }
            
            const result = this.auth.register(username, pin);
            if (result.success) {
                authModal.hide();
                this.checkAuth();
                this.showToast('Registration successful!', 'success');
            } else {
                this.showToast(result.message, 'error');
            }
        });
    }

    renderAuthSection() {
        const user = this.auth.getCurrentUser();
        this.authSection.innerHTML = `
            <span class="text-white me-3">
                <i class="fas fa-user me-1"></i>${user.username}
            </span>
            <button class="btn btn-light btn-sm" id="logoutBtn">
                <i class="fas fa-sign-out-alt"></i> Logout
            </button>
        `;

        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.auth.logout();
            location.reload();
        });
    }

    renderFiles() {
        const files = this.storage.getCurrentFiles();
        const breadcrumbs = this.storage.getBreadcrumbs();
        
        this.renderBreadcrumbs(breadcrumbs);
        
        if (files.length === 0) {
            this.fileGrid.innerHTML = `
                <div class="col-12 text-center py-5">
                    <i class="fas fa-folder-open fa-4x text-muted mb-3"></i>
                    <h5 class="text-muted">This folder is empty</h5>
                    <p class="text-muted">Upload files or create a new folder to get started</p>
                </div>
            `;
            return;
        }

        let html = '';
        files.forEach(file => {
            html += this.createFileCard(file);
        });

        this.fileGrid.innerHTML = html;

        // Add click events to file cards
        document.querySelectorAll('.file-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.file-actions')) {
                    const fileId = card.dataset.id;
                    this.handleFileClick(fileId);
                }
            });
        });

        // Add action button events
        document.querySelectorAll('.delete-file').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const fileId = btn.dataset.id;
                this.deleteFile(fileId);
            });
        });

        document.querySelectorAll('.download-file').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const fileId = btn.dataset.id;
                this.downloadFile(fileId);
            });
        });
    }

    createFileCard(file) {
        const isFolder = file.type === 'folder';
        const icon = this.getFileIcon(file);
        const size = file.size ? this.storage.formatFileSize(file.size) : '';
        const date = new Date(file.createdAt || file.uploadedAt).toLocaleDateString();
        
        return `
            <div class="col-md-4 col-lg-3 mb-3">
                <div class="card file-card ${isFolder ? 'folder-card' : ''}" data-id="${file.id}">
                    <div class="card-body position-relative">
                        <div class="file-actions btn-group btn-group-sm">
                            <button class="btn btn-light download-file" data-id="${file.id}" title="Download">
                                <i class="fas fa-download"></i>
                            </button>
                            <button class="btn btn-light delete-file" data-id="${file.id}" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                        <div class="text-center">
                            <div class="file-icon ${this.getFileTypeClass(file)}">
                                <i class="${icon}"></i>
                            </div>
                            <div class="file-name">${file.name}</div>
                            <div class="file-meta">
                                ${!isFolder ? size : ''} • ${date}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    getFileIcon(file) {
        if (file.type === 'folder') return 'fas fa-folder';
        
        const icons = {
            'image': 'fas fa-file-image',
            'video': 'fas fa-file-video',
            'audio': 'fas fa-file-audio',
            'pdf': 'fas fa-file-pdf',
            'document': 'fas fa-file-word',
            'spreadsheet': 'fas fa-file-excel',
            'presentation': 'fas fa-file-powerpoint',
            'archive': 'fas fa-file-archive',
            'other': 'fas fa-file'
        };
        
        return icons[file.type] || icons.other;
    }

    getFileTypeClass(file) {
        if (file.type === 'folder') return '';
        return `file-type-${file.type}`;
    }

    renderBreadcrumbs(breadcrumbs) {
        let html = '';
        breadcrumbs.forEach((crumb, index) => {
            if (index === breadcrumbs.length - 1) {
                html += `<li class="breadcrumb-item active">${crumb.name}</li>`;
            } else {
                html += `<li class="breadcrumb-item"><a href="#" data-path="${crumb.path}">${crumb.name}</a></li>`;
            }
        });

        this.breadcrumb.innerHTML = html;

        // Add click events to breadcrumb links
        document.querySelectorAll('.breadcrumb-item a').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const path = link.dataset.path;
                this.storage.navigateTo(path);
                this.renderFiles();
            });
        });
    }

    updateStorageInfo() {
        const used = this.storage.getStorageUsage();
        const percentage = (used / this.storage.maxStorageSize) * 100;
        
        this.storageProgress.style.width = percentage + '%';
        this.storageText.textContent = `${this.storage.formatFileSize(used)} / 500 MB`;
    }

    handleFileUpload(files) {
        if (!files || files.length === 0) return;

        const uploadList = document.getElementById('uploadList');
        uploadList.innerHTML = '<p>Uploading...</p>';

        this.storage.uploadFiles(files, (progress) => {
            // Update progress if needed
        }).then(() => {
            uploadList.innerHTML = '<p class="text-success">Upload complete!</p>';
            setTimeout(() => {
                this.uploadModal.hide();
                uploadList.innerHTML = '';
            }, 1500);
            
            this.renderFiles();
            this.updateStorageInfo();
            this.showToast('Files uploaded successfully!', 'success');
        }).catch(error => {
            uploadList.innerHTML = '<p class="text-danger">Upload failed!</p>';
            this.showToast('Upload failed: ' + error.message, 'error');
        });
    }

    handleFileClick(fileId) {
        const findFile = (items) => {
            for (const item of items) {
                if (item.id === fileId) return item;
                if (item.type === 'folder' && item.items) {
                    const found = findFile(item.items);
                    if (found) return found;
                }
            }
            return null;
        };

        const file = findFile(this.storage.files);
        
        if (file.type === 'folder') {
            this.storage.navigateToFolder(file);
            this.renderFiles();
        } else {
            this.previewFile(file);
        }
    }

    previewFile(file) {
        const previewTitle = document.getElementById('previewTitle');
        const previewContent = document.getElementById('previewContent');
        
        previewTitle.textContent = file.name;

        if (file.type === 'image') {
            previewContent.innerHTML = `<img src="${file.data}" class="img-fluid" alt="${file.name}">`;
        } else if (file.type === 'video') {
            previewContent.innerHTML = `
                <video controls class="w-100">
                    <source src="${file.data}" type="${file.mimeType}">
                    Your browser does not support the video tag.
                </video>
            `;
        } else if (file.type === 'audio') {
            previewContent.innerHTML = `
                <audio controls class="w-100">
                    <source src="${file.data}" type="${file.mimeType}">
                    Your browser does not support the audio tag.
                </audio>
            `;
        } else if (file.type === 'pdf') {
            previewContent.innerHTML = `
                <embed src="${file.data}" type="application/pdf" width="100%" height="500px" />
            `;
        } else {
            previewContent.innerHTML = `
                <div class="text-center py-5">
                    <i class="fas fa-file fa-4x text-muted mb-3"></i>
                    <h5>Cannot preview this file type</h5>
                    <button class="btn btn-primary mt-3 download-file" data-id="${file.id}">
                        <i class="fas fa-download me-2"></i>Download
                    </button>
                </div>
            `;
        }

        this.previewModal.show();
    }

    deleteFile(fileId) {
        if (confirm('Are you sure you want to delete this item?')) {
            this.storage.deleteFile(fileId);
            this.renderFiles();
            this.updateStorageInfo();
            this.showToast('Item deleted successfully', 'success');
        }
    }

    downloadFile(fileId) {
        const findFile = (items) => {
            for (const item of items) {
                if (item.id === fileId) return item;
                if (item.type === 'folder' && item.items) {
                    const found = findFile(item.items);
                    if (found) return found;
                }
            }
            return null;
        };

        const file = findFile(this.storage.files);
        
        if (file && file.data) {
            const link = document.createElement('a');
            link.href = file.data;
            link.download = file.name;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    createNewFolder() {
        const name = prompt('Enter folder name:');
        if (name && name.trim()) {
            this.storage.createFolder(name.trim());
            this.renderFiles();
            this.showToast('Folder created successfully', 'success');
        }
    }

    filterFiles(type) {
        const allFiles = [];
        
        const collectFiles = (items) => {
            for (const item of items) {
                if (item.type === type || (type === 'document' && 
                    ['pdf', 'document', 'spreadsheet', 'presentation'].includes(item.type))) {
                    allFiles.push(item);
                }
                if (item.type === 'folder' && item.items) {
                    collectFiles(item.items);
                }
            }
        };
        
        collectFiles(this.storage.files);
        
        if (allFiles.length === 0) {
            this.fileGrid.innerHTML = `
                <div class="col-12 text-center py-5">
                    <i class="fas fa-search fa-4x text-muted mb-3"></i>
                    <h5 class="text-muted">No ${type}s found</h5>
                </div>
            `;
            return;
        }

        let html = '';
        allFiles.forEach(file => {
            html += this.createFileCard(file);
        });

        this.fileGrid.innerHTML = html;
    }

    searchFiles(query) {
        if (!query.trim()) {
            this.renderFiles();
            return;
        }

        const results = this.storage.searchFiles(query);
        
        if (results.length === 0) {
            this.fileGrid.innerHTML = `
                <div class="col-12 text-center py-5">
                    <i class="fas fa-search fa-4x text-muted mb-3"></i>
                    <h5 class="text-muted">No files found matching "${query}"</h5>
                </div>
            `;
            return;
        }

        let html = '';
        results.forEach(file => {
            html += this.createFileCard(file);
        });

        this.fileGrid.innerHTML = html;
    }

    showToast(message, type = 'info') {
        const toastContainer = document.querySelector('.toast-container') || 
            (() => {
                const container = document.createElement('div');
                container.className = 'toast-container';
                document.body.appendChild(container);
                return container;
            })();

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <i class="fas ${this.getToastIcon(type)} me-2"></i>
            <span>${message}</span>
        `;

        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.remove();
            if (toastContainer.children.length === 0) {
                toastContainer.remove();
            }
        }, 3000);
    }

    getToastIcon(type) {
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            info: 'fa-info-circle'
        };
        return icons[type] || icons.info;
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    window.app = new CloudStorageApp();
});