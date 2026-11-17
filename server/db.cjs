const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'virtual_office.sqlite');
const rawDb = new sqlite3.Database(DB_PATH);

rawDb.serialize(() => {
    rawDb.run('PRAGMA journal_mode = WAL');

    rawDb.run(`
        CREATE TABLE IF NOT EXISTS vo_user_presence (
            user_id INTEGER PRIMARY KEY,
            current_room TEXT DEFAULT 'open-space',
            status_text TEXT DEFAULT 'Active',
            is_remote INTEGER DEFAULT 0,
            forced_offline INTEGER DEFAULT 0,
            assistant_work_start TEXT DEFAULT '09:00',
            assistant_work_end TEXT DEFAULT '17:30',
            assistant_break_start TEXT DEFAULT '12:00',
            assistant_break_end TEXT DEFAULT '13:00',
            assistant_meeting_buffer INTEGER DEFAULT 30,
            assistant_prompt TEXT DEFAULT '',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    rawDb.run(`
        CREATE TABLE IF NOT EXISTS vo_dm_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id INTEGER NOT NULL,
            receiver_id INTEGER NOT NULL,
            sender_type TEXT DEFAULT 'user',
            text TEXT NOT NULL,
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    rawDb.run(`
        CREATE INDEX IF NOT EXISTS idx_vo_dm_pair
        ON vo_dm_messages (sender_id, receiver_id, is_read, created_at)
    `);

    // 3D Virtual Office: アバター座標カラムのマイグレーション
    rawDb.all(`PRAGMA table_info(vo_user_presence)`, (err, columns) => {
        if (err || !Array.isArray(columns)) return;
        const colNames = new Set(columns.map((c) => c.name));
        if (!colNames.has('pos_x')) {
            rawDb.run(`ALTER TABLE vo_user_presence ADD COLUMN pos_x REAL DEFAULT NULL`);
        }
        if (!colNames.has('pos_z')) {
            rawDb.run(`ALTER TABLE vo_user_presence ADD COLUMN pos_z REAL DEFAULT NULL`);
        }
        if (!colNames.has('rotation_y')) {
            rawDb.run(`ALTER TABLE vo_user_presence ADD COLUMN rotation_y REAL DEFAULT 0`);
        }
        if (!colNames.has('avatar_3d_config')) {
            rawDb.run(`ALTER TABLE vo_user_presence ADD COLUMN avatar_3d_config TEXT DEFAULT NULL`);
        }
        if (!colNames.has('emote')) {
            rawDb.run(`ALTER TABLE vo_user_presence ADD COLUMN emote TEXT DEFAULT NULL`);
        }
        if (!colNames.has('emote_expires_at')) {
            rawDb.run(`ALTER TABLE vo_user_presence ADD COLUMN emote_expires_at INTEGER DEFAULT NULL`);
        }
    });

    // A/B テスト・利用時間計測用テーブル (3D / 2D 滞在時間ログ)
    rawDb.run(`
        CREATE TABLE IF NOT EXISTS vo_view_mode_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            mode TEXT NOT NULL CHECK(mode IN ('3d', '2d')),
            duration_seconds INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    rawDb.run(`
        CREATE INDEX IF NOT EXISTS idx_vo_view_mode_user
        ON vo_view_mode_logs (user_id, mode, created_at)
    `);
});

function runAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        rawDb.run(sql, params, function (err) {
            if (err) return reject(err);
            resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

function getAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        rawDb.get(sql, params, (err, row) => {
            if (err) return reject(err);
            resolve(row || null);
        });
    });
}

function allAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        rawDb.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows || []);
        });
    });
}

module.exports = {
    rawDb,
    DB_PATH,
    runAsync,
    getAsync,
    allAsync
};
