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
const JWT_SECRET = process.env.JWT_SECRET || 'kitobxon-secret-change-in-production';
const MAX_USERS = 7;
const MAX_STORAGE_BYTES = 500 * 1024 * 1024;
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const AVATARS_DIR = path.join(__dirname, 'avatars');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(AVATARS_DIR)) fs.mkdirSync(AVATARS_DIR, { recursive: true });

const db = new Database(path.join(__dirname, 'kitobxon.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    avatar_filename TEXT DEFAULT NULL,
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
  CREATE TABLE IF NOT EXISTS reading_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    pages INTEGER NOT NULL,
    log_date TEXT NOT NULL,
    note TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/avatars', express.static(AVATARS_DIR));

// Multer for files
const fileStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({
  storage: fileStorage,
  limits: { fileSize: MAX_STORAGE_BYTES },
  fileFilter: (req, file, cb) => {
    const row = db.prepare('SELECT SUM(size) as total FROM files').get();
    const used = row.total || 0;
    if (used >= MAX_STORAGE_BYTES) return cb(new Error('Хранилище заполнено (500МБ)'));
    cb(null, true);
  }
});

// Multer for avatars
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, AVATARS_DIR),
  filename: (req, file, cb) => {
    cb(null, `avatar-${req.user.id}${path.extname(file.originalname)}`);
  }
});
const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Только изображения'));
    cb(null, true);
  }
});

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Токен не предоставлен' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Недействительный токен' }); }
}
function adminMiddleware(req, res, next) {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Только для администратора' });
  next();
}

// ── AUTH ──────────────────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Введите логин и пароль' });
  if (username.length < 3) return res.status(400).json({ error: 'Логин: минимум 3 символа' });
  if (password.length < 6) return res.status(400).json({ error: 'Пароль: минимум 6 символов' });
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count >= MAX_USERS) return res.status(403).json({ error: 'Достигнут лимит в 7 пользователей.' });
  const isAdmin = userCount.count === 0 ? 1 : 0;
  const hashed = await bcrypt.hash(password, 10);
  try {
    const result = db.prepare('INSERT INTO users (username, password, is_admin) VALUES (?, ?, ?)').run(username, hashed, isAdmin);
    const token = jwt.sign({ id: result.lastInsertRowid, username, is_admin: isAdmin }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username, is_admin: isAdmin, avatar: null });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Этот логин уже занят' });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(401).json({ error: 'Неверный логин или пароль' });
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Неверный логин или пароль' });
  const token = jwt.sign({ id: user.id, username: user.username, is_admin: user.is_admin }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username: user.username, is_admin: user.is_admin, avatar: user.avatar_filename });
});

// ── AVATAR ────────────────────────────────────────────────────────
app.post('/api/avatar', authMiddleware, (req, res) => {
  uploadAvatar.single('avatar')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Файл не выбран' });
    db.prepare('UPDATE users SET avatar_filename = ? WHERE id = ?').run(req.file.filename, req.user.id);
    res.json({ avatar: req.file.filename });
  });
});

// ── FILES ─────────────────────────────────────────────────────────
app.post('/api/upload', authMiddleware, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Файл не выбран' });
    const row = db.prepare('SELECT SUM(size) as total FROM files').get();
    const used = row.total || 0;
    if (used + req.file.size > MAX_STORAGE_BYTES) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Недостаточно места' });
    }
    db.prepare('INSERT INTO files (filename, original_name, size, uploaded_by, uploaded_by_username) VALUES (?, ?, ?, ?, ?)')
      .run(req.file.filename, req.file.originalname, req.file.size, req.user.id, req.user.username);
    res.json({ message: 'Файл загружен', filename: req.file.originalname });
  });
});

app.get('/api/files', authMiddleware, (req, res) => {
  const files = db.prepare('SELECT id, original_name, size, uploaded_by_username, created_at FROM files ORDER BY created_at DESC').all();
  const storageRow = db.prepare('SELECT SUM(size) as total FROM files').get();
  res.json({ files, usedBytes: storageRow.total || 0, maxBytes: MAX_STORAGE_BYTES });
});

app.get('/api/download/:id', authMiddleware, (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'Файл не найден' });
  const filePath = path.join(UPLOADS_DIR, file.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Файл отсутствует на диске' });
  res.download(filePath, file.original_name);
});

app.delete('/api/files/:id', authMiddleware, (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'Файл не найден' });
  if (!req.user.is_admin && file.uploaded_by !== req.user.id)
    return res.status(403).json({ error: 'Нет прав на удаление' });
  const filePath = path.join(UPLOADS_DIR, file.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.prepare('DELETE FROM files WHERE id = ?').run(req.params.id);
  res.json({ message: 'Файл удалён' });
});

// ── READING LOGS ──────────────────────────────────────────────────
// Admin: log pages for a user
app.post('/api/admin/reading', authMiddleware, adminMiddleware, (req, res) => {
  const { user_id, pages, log_date, note } = req.body;
  if (!user_id || !pages || !log_date) return res.status(400).json({ error: 'Укажите пользователя, страницы и дату' });
  if (pages < 1 || pages > 9999) return res.status(400).json({ error: 'Количество страниц: 1–9999' });
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(user_id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  db.prepare('INSERT INTO reading_logs (user_id, pages, log_date, note) VALUES (?, ?, ?, ?)').run(user_id, pages, log_date, note || '');
  res.json({ message: 'Запись добавлена' });
});

// Admin: delete a reading log entry
app.delete('/api/admin/reading/:id', authMiddleware, adminMiddleware, (req, res) => {
  db.prepare('DELETE FROM reading_logs WHERE id = ?').run(req.params.id);
  res.json({ message: 'Запись удалена' });
});

// Admin: get all logs for a user
app.get('/api/admin/reading/:user_id', authMiddleware, adminMiddleware, (req, res) => {
  const logs = db.prepare('SELECT * FROM reading_logs WHERE user_id = ? ORDER BY log_date DESC').all(req.params.user_id);
  res.json({ logs });
});

// Leaderboard — all users total & weekly
app.get('/api/leaderboard', authMiddleware, (req, res) => {
  const users = db.prepare('SELECT id, username, avatar_filename FROM users WHERE is_admin = 0').all();
  const now = new Date();
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const result = users.map(u => {
    const total = db.prepare('SELECT COALESCE(SUM(pages),0) as total FROM reading_logs WHERE user_id = ?').get(u.id).total;
    const weekly = db.prepare('SELECT COALESCE(SUM(pages),0) as total FROM reading_logs WHERE user_id = ? AND log_date >= ?').get(u.id, weekAgo).total;
    return { ...u, total_pages: total, weekly_pages: weekly };
  });

  result.sort((a, b) => b.total_pages - a.total_pages);
  res.json({ leaderboard: result });
});

// Chart data — all users daily pages over last 60 days
app.get('/api/chart', authMiddleware, (req, res) => {
  const users = db.prepare('SELECT id, username, avatar_filename FROM users WHERE is_admin = 0').all();
  const days = 60;
  const dates = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }

  const series = users.map(u => {
    const logs = db.prepare('SELECT log_date, SUM(pages) as pages FROM reading_logs WHERE user_id = ? AND log_date >= ? GROUP BY log_date')
      .all(u.id, dates[0]);
    const logMap = {};
    logs.forEach(l => logMap[l.log_date] = l.pages);
    let cumulative = 0;
    const data = dates.map(d => {
      cumulative += (logMap[d] || 0);
      return cumulative;
    });
    return { username: u.username, avatar: u.avatar_filename, data };
  });

  res.json({ dates, series });
});

// ── ADMIN ROUTES ──────────────────────────────────────────────────
app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
  const users = db.prepare('SELECT id, username, is_admin, avatar_filename, created_at FROM users ORDER BY created_at ASC').all();
  res.json({ users, count: users.length, maxUsers: MAX_USERS });
});

app.delete('/api/admin/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  const targetId = parseInt(req.params.id);
  if (targetId === req.user.id) return res.status(400).json({ error: 'Нельзя удалить себя' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  const userFiles = db.prepare('SELECT * FROM files WHERE uploaded_by = ?').all(targetId);
  userFiles.forEach(f => { const fp = path.join(UPLOADS_DIR, f.filename); if (fs.existsSync(fp)) fs.unlinkSync(fp); });
  db.prepare('DELETE FROM files WHERE uploaded_by = ?').run(targetId);
  db.prepare('DELETE FROM reading_logs WHERE user_id = ?').run(targetId);
  db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
  res.json({ message: 'Пользователь удалён' });
});

app.get('/api/stats', authMiddleware, (req, res) => {
  const storageRow = db.prepare('SELECT SUM(size) as total FROM files').get();
  const fileCount = db.prepare('SELECT COUNT(*) as count FROM files').get();
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  const totalPages = db.prepare('SELECT COALESCE(SUM(pages),0) as total FROM reading_logs').get();
  res.json({
    usedBytes: storageRow.total || 0, maxBytes: MAX_STORAGE_BYTES,
    fileCount: fileCount.count, userCount: userCount.count,
    maxUsers: MAX_USERS, totalPages: totalPages.total
  });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`Китобхон запущен на http://localhost:${PORT}`));
