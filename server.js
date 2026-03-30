const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: process.env.CLIENT_URL || '*',
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(express.static('.'));

// Database connection with reconnection logic
let db;

function connectToDatabase() {
    db = mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'malawi_water',
        port: process.env.DB_PORT || 3306,
        connectTimeout: 60000,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0
    });

    db.connect((err) => {
        if (err) {
            console.error('Database connection failed:', err);
            setTimeout(connectToDatabase, 5000);
            return;
        }
        console.log('Connected to MySQL database');
        initializeDatabase();
    });

    db.on('error', (err) => {
        console.error('Database error:', err);
        if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
            console.log('Reconnecting to database...');
            connectToDatabase();
        }
    });
}

// Helper function to execute queries safely
function executeQuery(query, params, callback) {
    if (!db) {
        console.log('Database not connected, reconnecting...');
        connectToDatabase();
        setTimeout(() => {
            if (db) {
                db.query(query, params, callback);
            } else {
                callback(new Error('Database connection failed'), null);
            }
        }, 1000);
        return;
    }
    
    db.query(query, params, (err, results) => {
        if (err && (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET')) {
            console.log('Connection lost, reconnecting...');
            connectToDatabase();
            setTimeout(() => {
                if (db) {
                    db.query(query, params, callback);
                } else {
                    callback(err, null);
                }
            }, 1000);
        } else {
            callback(err, results);
        }
    });
}

// Initialize database tables
function initializeDatabase() {
    const createSnapshotTable = `
        CREATE TABLE IF NOT EXISTS historical_snapshots (
            id INT AUTO_INCREMENT PRIMARY KEY,
            district VARCHAR(100),
            snapshot_date DATE,
            functional_count INT DEFAULT 0,
            partially_functional_count INT DEFAULT 0,
            not_functional_count INT DEFAULT 0,
            abandoned_count INT DEFAULT 0,
            total_count INT DEFAULT 0,
            functional_rate DECIMAL(5,2),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_district_date (district, snapshot_date),
            INDEX idx_district_date (district, snapshot_date)
        )
    `;
    
    const createChangeLogTable = `
        CREATE TABLE IF NOT EXISTS status_change_log (
            id INT AUTO_INCREMENT PRIMARY KEY,
            water_point_id VARCHAR(100),
            district VARCHAR(100),
            old_status VARCHAR(100),
            new_status VARCHAR(100),
            changed_by VARCHAR(100),
            notes TEXT,
            changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_water_point (water_point_id),
            INDEX idx_changed_at (changed_at),
            INDEX idx_district (district)
        )
    `;
    
    executeQuery(createSnapshotTable, [], (err) => {
        if (err) console.error('Error creating snapshot table:', err);
        else console.log('Historical snapshots table ready');
    });
    
    executeQuery(createChangeLogTable, [], (err) => {
        if (err) console.error('Error creating change log table:', err);
        else console.log('Status change log table ready');
    });
}

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
    const token = req.cookies.token;
    
    if (!token) {
        return res.status(401).json({ error: 'Access denied' });
    }
    
    try {
        const verified = jwt.verify(token, JWT_SECRET);
        req.user = verified;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// ============ AUTH ENDPOINTS ============

app.get('/api/me', authenticateToken, (req, res) => {
    res.json(req.user);
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    executeQuery(
        'SELECT * FROM officers WHERE username = ? OR email = ?',
        [username, username],
        async (err, results) => {
            if (err || results.length === 0) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            
            const user = results[0];
            const validPassword = await bcrypt.compare(password, user.password);
            
            if (!validPassword) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            
            const token = jwt.sign(
                { 
                    id: user.id, 
                    username: user.username,
                    full_name: user.full_name,
                    district: user.district,
                    role: user.role 
                },
                JWT_SECRET,
                { expiresIn: '7d' }
            );
            
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 7 * 24 * 60 * 60 * 1000
            });
            
            res.json({
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    full_name: user.full_name,
                    district: user.district,
                    role: user.role
                }
            });
        }
    );
});

app.post('/api/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true });
});

app.post('/api/add-water-point', authenticateToken, (req, res) => {
    const { district, name, ta, type, status, latitude, longitude, officer_name, notes } = req.body;
    
    if (req.user.role !== 'admin' && req.user.district !== district) {
        return res.status(403).json({ error: 'You can only add water points to your assigned district' });
    }
    
    const water_point_id = `WP_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    
    executeQuery(
        `INSERT INTO water_points 
        (water_point_id, district, name, ta, type, status, latitude, longitude, officer_name, notes, created_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [water_point_id, district, name, ta, type, status, latitude, longitude, officer_name || req.user.username, notes],
        (err, result) => {
            if (err) {
                console.error('Error adding water point:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ success: true, water_point_id });
        }
    );
});

// ============ DATA ENDPOINTS ============

app.get('/data', (req, res) => {
    const { table, district, type } = req.query;
    
    let query = `
        SELECT status, COUNT(*) as total 
        FROM water_points 
        WHERE LOWER(district) = LOWER(?)
    `;
    const params = [table];
    
    if (district && district !== '') {
        query += ` AND (ta = ? OR traditional_authority = ?)`;
        params.push(district, district);
    }
    
    if (type && type !== '') {
        query += ` AND (type = ? OR water_point_type = ?)`;
        params.push(type, type);
    }
    
    query += ` GROUP BY status`;
    
    executeQuery(query, params, (err, results) => {
        if (err) {
            console.error('Data fetch error:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(results || []);
    });
});

app.get('/mapdata', (req, res) => {
    const { table, district, type } = req.query;
    
    let query = `
        SELECT 
            water_point_id,
            name as Name,
            type as Type,
            status,
            latitude as Latitude,
            longitude as Longitude
        FROM water_points 
        WHERE LOWER(district) = LOWER(?)
    `;
    const params = [table];
    
    if (district && district !== '') {
        query += ` AND (ta = ? OR traditional_authority = ?)`;
        params.push(district, district);
    }
    
    if (type && type !== '') {
        query += ` AND (type = ? OR water_point_type = ?)`;
        params.push(type, type);
    }
    
    query += ` LIMIT 1000`;
    
    executeQuery(query, params, (err, results) => {
        if (err) {
            console.error('Map data fetch error:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(results || []);
    });
});

app.get('/districts', (req, res) => {
    const { table } = req.query;
    
    const query = `
        SELECT DISTINCT ta as district_name 
        FROM water_points 
        WHERE LOWER(district) = LOWER(?) 
        AND (ta IS NOT NULL AND ta != '')
        UNION
        SELECT DISTINCT traditional_authority as district_name 
        FROM water_points 
        WHERE LOWER(district) = LOWER(?) 
        AND (traditional_authority IS NOT NULL AND traditional_authority != '')
    `;
    
    executeQuery(query, [table, table], (err, results) => {
        if (err) {
            console.error('Districts fetch error:', err);
            return res.status(500).json({ error: err.message });
        }
        const districts = (results || []).map(r => r.district_name).filter(Boolean);
        res.json(districts);
    });
});

app.get('/types', (req, res) => {
    const { table } = req.query;
    
    const query = `
        SELECT DISTINCT type as water_type 
        FROM water_points 
        WHERE LOWER(district) = LOWER(?) 
        AND (type IS NOT NULL AND type != '')
        UNION
        SELECT DISTINCT water_point_type as water_type 
        FROM water_points 
        WHERE LOWER(district) = LOWER(?) 
        AND (water_point_type IS NOT NULL AND water_point_type != '')
    `;
    
    executeQuery(query, [table, table], (err, results) => {
        if (err) {
            console.error('Types fetch error:', err);
            return res.status(500).json({ error: err.message });
        }
        const types = (results || []).map(r => r.water_type).filter(Boolean);
        res.json(types);
    });
});

app.get('/national', (req, res) => {
    const query = `
        SELECT 
            district,
            COUNT(*) as total,
            SUM(CASE WHEN status = 'Functional' THEN 1 ELSE 0 END) as functional,
            SUM(CASE WHEN status = 'Partially functional but in need of repair' THEN 1 ELSE 0 END) as partial,
            SUM(CASE WHEN status = 'Not functional' THEN 1 ELSE 0 END) as not_functional,
            SUM(CASE WHEN status = 'No longer exists or abandoned' THEN 1 ELSE 0 END) as abandoned
        FROM water_points
        GROUP BY district
        ORDER BY district
    `;
    
    executeQuery(query, [], (err, results) => {
        if (err) {
            console.error('National fetch error:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(results || []);
    });
});

// ============ TREND ANALYSIS ENDPOINTS ============

app.get('/api/trends', (req, res) => {
    const { district, period = '6months' } = req.query;
    
    let startDate;
    const now = new Date();
    switch(period) {
        case '3months':
            startDate = new Date(now.setMonth(now.getMonth() - 3)).toISOString().split('T')[0];
            break;
        case '6months':
            startDate = new Date(now.setMonth(now.getMonth() - 6)).toISOString().split('T')[0];
            break;
        case '1year':
            startDate = new Date(now.setFullYear(now.getFullYear() - 1)).toISOString().split('T')[0];
            break;
        default:
            startDate = new Date(now.setMonth(now.getMonth() - 6)).toISOString().split('T')[0];
    }
    
    const query = `
        SELECT 
            snapshot_date as date,
            functional_count,
            partially_functional_count,
            not_functional_count,
            abandoned_count,
            total_count,
            functional_rate
        FROM historical_snapshots
        WHERE district = ?
        AND snapshot_date >= ?
        ORDER BY snapshot_date ASC
    `;
    
    executeQuery(query, [district, startDate], (err, results) => {
        if (err) {
            console.error('Trends fetch error:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(results || []);
    });
});

app.get('/api/monthly-summary', (req, res) => {
    const { district } = req.query;
    
    const query = `
        SELECT 
            DATE_FORMAT(snapshot_date, '%Y-%m') as month,
            AVG(functional_rate) as avg_functional_rate,
            SUM(total_count) as total_points,
            SUM(functional_count) as total_functional,
            SUM(partially_functional_count) as total_partial,
            SUM(not_functional_count) as total_not_functional
        FROM historical_snapshots
        WHERE district = ?
        AND snapshot_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
        GROUP BY DATE_FORMAT(snapshot_date, '%Y-%m')
        ORDER BY month DESC
    `;
    
    executeQuery(query, [district], (err, results) => {
        if (err) {
            console.error('Monthly summary error:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(results || []);
    });
});

// ============ DEBUG ENDPOINT ============

app.get('/api/debug-db', (req, res) => {
    executeQuery('SHOW TABLES', [], (err, tables) => {
        executeQuery('DESCRIBE water_points', [], (err2, structure) => {
            executeQuery('SELECT * FROM water_points LIMIT 5', [], (err3, sample) => {
                res.json({
                    tables: tables || [],
                    structure: structure || [],
                    sample_data: sample || [],
                    errors: {
                        tables_error: err?.message,
                        structure_error: err2?.message,
                        sample_error: err3?.message
                    }
                });
            });
        });
    });
});

// ============ DAILY SNAPSHOT FUNCTION ============

function recordDailySnapshot() {
    const query = `
        INSERT INTO historical_snapshots 
        (district, snapshot_date, functional_count, partially_functional_count, not_functional_count, abandoned_count, total_count, functional_rate)
        SELECT 
            district,
            CURDATE() as snapshot_date,
            SUM(CASE WHEN status = 'Functional' THEN 1 ELSE 0 END) as functional_count,
            SUM(CASE WHEN status = 'Partially functional but in need of repair' THEN 1 ELSE 0 END) as partially_functional_count,
            SUM(CASE WHEN status = 'Not functional' THEN 1 ELSE 0 END) as not_functional_count,
            SUM(CASE WHEN status = 'No longer exists or abandoned' THEN 1 ELSE 0 END) as abandoned_count,
            COUNT(*) as total_count,
            ROUND((SUM(CASE WHEN status = 'Functional' THEN 1 ELSE 0 END) / COUNT(*)) * 100, 2) as functional_rate
        FROM water_points
        GROUP BY district
        ON DUPLICATE KEY UPDATE
            functional_count = VALUES(functional_count),
            partially_functional_count = VALUES(partially_functional_count),
            not_functional_count = VALUES(not_functional_count),
            abandoned_count = VALUES(abandoned_count),
            total_count = VALUES(total_count),
            functional_rate = VALUES(functional_rate)
    `;
    
    executeQuery(query, [], (err) => {
        if (err) console.error('Snapshot recording error:', err);
        else console.log('Daily snapshot recorded');
    });
}

// Start database connection
connectToDatabase();

// Record snapshot on server start
setTimeout(() => {
    recordDailySnapshot();
}, 5000);

// Schedule daily snapshot at midnight
setInterval(() => {
    const now = new Date();
    if (now.getHours() === 0 && now.getMinutes() === 0) {
        recordDailySnapshot();
    }
}, 60000);

// Simple test endpoint
app.get('/api/test', (req, res) => {
    executeQuery('SELECT COUNT(*) as count FROM water_points', [], (err, results) => {
        if (err) {
            res.json({ error: err.message, hasData: false });
        } else {
            res.json({ 
                hasData: results[0].count > 0,
                count: results[0].count,
                error: null 
            });
        }
    });
});
// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});