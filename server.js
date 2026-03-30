const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

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

// Database Connection Pool (FIXED)
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'malawi_water',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

// Query helper function
function executeQuery(query, params, callback) {
    pool.query(query, params, (err, results) => {
        if (err) {
            console.error('Query error:', err);
            callback(err, null);
        } else {
            callback(null, results);
        }
    });
}

// Test connection
pool.getConnection((err, connection) => {
    if (err) {
        console.error('Database connection failed:', err);
    } else {
        console.log('Connected to MySQL database');
        connection.release();
        initializeDatabase();
    }
});

// Initialize database tables
function initializeDatabase() {
    const createWaterPointsTable = `
        CREATE TABLE IF NOT EXISTS water_points (
            id INT AUTO_INCREMENT PRIMARY KEY,
            water_point_id VARCHAR(100) UNIQUE,
            district VARCHAR(100),
            name VARCHAR(255),
            ta VARCHAR(255),
            type VARCHAR(100),
            status VARCHAR(100),
            latitude DECIMAL(10, 6),
            longitude DECIMAL(10, 6),
            officer_name VARCHAR(100),
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `;
    
    const createOfficersTable = `
        CREATE TABLE IF NOT EXISTS officers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(100) UNIQUE,
            email VARCHAR(255) UNIQUE,
            password VARCHAR(255),
            full_name VARCHAR(255),
            district VARCHAR(100),
            role VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;
    
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
            UNIQUE KEY unique_district_date (district, snapshot_date)
        )
    `;
    
    executeQuery(createWaterPointsTable, [], (err) => {
        if (err) console.error('Error creating water_points table:', err);
        else console.log('Water points table ready');
    });
    
    executeQuery(createOfficersTable, [], (err) => {
        if (err) console.error('Error creating officers table:', err);
        else console.log('Officers table ready');
    });
    
    executeQuery(createSnapshotTable, [], (err) => {
        if (err) console.error('Error creating snapshot table:', err);
        else console.log('Historical snapshots table ready');
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
    `;
    
    executeQuery(query, [table], (err, results) => {
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
    `;
    
    executeQuery(query, [table], (err, results) => {
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

// ============ TEST ENDPOINTS ============

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

app.get('/api/debug-db', (req, res) => {
    executeQuery('SHOW TABLES', [], (err, tables) => {
        executeQuery('SELECT * FROM water_points LIMIT 5', [], (err2, sample) => {
            res.json({
                tables: tables || [],
                sample_data: sample || [],
                errors: {
                    tables_error: err?.message,
                    sample_error: err2?.message
                }
            });
        });
    });
});

// ============ ADD SAMPLE DATA ============

app.post('/api/add-sample-data', (req, res) => {
    const sampleData = [
        ['WP001', 'nsanje', 'Borehole A', 'TA Nsanje', 'Borehole', 'Functional', -16.9167, 35.2667],
        ['WP002', 'nsanje', 'Well B', 'TA Nsanje', 'Well', 'Not functional', -16.9200, 35.2700],
        ['WP003', 'blantyre', 'Borehole C', 'TA Blantyre', 'Borehole', 'Functional', -15.7861, 35.0058],
        ['WP004', 'lilongwe', 'Tap D', 'TA Lilongwe', 'Tap Stand', 'Partially functional but in need of repair', -13.9833, 33.7833],
        ['WP005', 'zomba', 'Well E', 'TA Zomba', 'Well', 'Functional', -15.3833, 35.3333]
    ];
    
    const query = `INSERT IGNORE INTO water_points (water_point_id, district, name, ta, type, status, latitude, longitude) VALUES ?`;
    
    executeQuery(query, [sampleData], (err, result) => {
        if (err) {
            res.json({ error: err.message });
        } else {
            res.json({ success: true, inserted: result.affectedRows });
        }
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});