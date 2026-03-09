const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'vaultdrop-secret-change-in-production';
const MAX_USERS = 7;
const MAX_STORAGE_BYTES = 500 * 1024 * 1024; // 500MB
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure uploads dir exists
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Init DB
const db = new Database(path.join(__dirname, 'vaultdrop.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    size INTEGER NOT NULL,
    uploaded_by INTEGER NOT NULL,
    uploaded_by_username TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
  );
`);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_STORAGE_BYTES },
  fileFilter: (req, file, cb) => {
    // Get current total storage
    const row = db.prepare('SELECT SUM(size) as total FROM files').get();
    const used = row.total || 0;
    if (used >= MAX_STORAGE_BYTES) {
      return cb(new Error('Хранилище заполнено (500МБ)'));
    }
    cb(null, true);
  }
});

// Auth middleware
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Токен не предоставлен' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Недействительный токен' });
  }
}

function adminMiddleware(req, res, next) {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Только для администратора' });
  next();
}

// ─── AUTH ROUTES ───────────────────────────────────────────────

// Register
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Имя пользователя и пароль обязательны' });
  if (username.length < 3) return res.status(400).json({ error: 'Имя пользователя должно содержать не менее 3 символов' });
  if (password.length < 6) return res.status(400).json({ error: 'Пароль должен содержать не менее 6 символов' });

  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count >= MAX_USERS) {
    return res.status(403).json({ error: 'Достигнут лимит в 7 пользователей. Регистрация закрыта.' });
  }

  const isAdmin = userCount.count === 0 ? 1 : 0;
  const hashed = await bcrypt.hash(password, 10);

  try {
    const stmt = db.prepare('INSERT INTO users (username, password, is_admin) VALUES (?, ?, ?)');
    const result = stmt.run(username, hashed, isAdmin);
    const token = jwt.sign({ id: result.lastInsertRowid, username, is_admin: isAdmin }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username, is_admin: isAdmin, message: isAdmin ? 'Добро пожаловать, Админ! Вы первый пользователь.' : 'Аккаунт создан!' });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Это имя пользователя уже занято' });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });

  const token = jwt.sign({ id: user.id, username: user.username, is_admin: user.is_admin }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username: user.username, is_admin: user.is_admin });
});

// ─── FILE ROUTES ───────────────────────────────────────────────

// Upload file
app.post('/api/upload', authMiddleware, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Файл не выбран' });

    // Check if adding this file would exceed 500MB
    const row = db.prepare('SELECT SUM(size) as total FROM files').get();
    const used = row.total || 0;
    if (used + req.file.size > MAX_STORAGE_BYTES) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Недостаточно места в хранилище' });
    }

    db.prepare('INSERT INTO files (filename, original_name, size, uploaded_by, uploaded_by_username) VALUES (?, ?, ?, ?, ?)')
      .run(req.file.filename, req.file.originalname, req.file.size, req.user.id, req.user.username);

    res.json({ message: 'Файл успешно загружен', filename: req.file.originalname });
  });
});

// List files
app.get('/api/files', authMiddleware, (req, res) => {
  const files = db.prepare('SELECT id, original_name, size, uploaded_by_username, created_at FROM files ORDER BY created_at DESC').all();
  const storageRow = db.prepare('SELECT SUM(size) as total FROM files').get();
  const usedBytes = storageRow.total || 0;
  res.json({ files, usedBytes, maxBytes: MAX_STORAGE_BYTES });
});

// Download file
app.get('/api/download/:id', authMiddleware, (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'Файл не найден' });

  const filePath = path.join(UPLOADS_DIR, file.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Файл отсутствует на диске' });

  res.download(filePath, file.original_name);
});

// Delete file (admin or owner)
app.delete('/api/files/:id', authMiddleware, (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'Файл не найден' });

  if (!req.user.is_admin && file.uploaded_by !== req.user.id) {
    return res.status(403).json({ error: 'Вы можете удалять только свои файлы' });
  }

  const filePath = path.join(UPLOADS_DIR, file.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.prepare('DELETE FROM files WHERE id = ?').run(req.params.id);

  res.json({ message: 'Файл удалён' });
});

// ─── ADMIN ROUTES ───────────────────────────────────────────────

// List users (admin only)
app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
  const users = db.prepare('SELECT id, username, is_admin, created_at FROM users ORDER BY created_at ASC').all();
  res.json({ users, count: users.length, maxUsers: MAX_USERS });
});

// Delete user (admin only, can't delete self)
app.delete('/api/admin/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  const targetId = parseInt(req.params.id);
  if (targetId === req.user.id) return res.status(400).json({ error: "Нельзя удалить самого себя" });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

  // Delete their files from disk too
  const userFiles = db.prepare('SELECT * FROM files WHERE uploaded_by = ?').all(targetId);
  userFiles.forEach(f => {
    const fp = path.join(UPLOADS_DIR, f.filename);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  });
  db.prepare('DELETE FROM files WHERE uploaded_by = ?').run(targetId);
  db.prepare('DELETE FROM users WHERE id = ?').run(targetId);

  res.json({ message: 'Пользователь и его файлы удалены' });
});

// Storage stats
app.get('/api/stats', authMiddleware, (req, res) => {
  const storageRow = db.prepare('SELECT SUM(size) as total FROM files').get();
  const fileCount = db.prepare('SELECT COUNT(*) as count FROM files').get();
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  res.json({
    usedBytes: storageRow.total || 0,
    maxBytes: MAX_STORAGE_BYTES,
    fileCount: fileCount.count,
    userCount: userCount.count,
    maxUsers: MAX_USERS
  });
});

// Serve SPA for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`VaultDrop running on http://localhost:${PORT}`);
});
