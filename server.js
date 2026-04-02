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

// Database Connection Pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'railway',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

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

pool.getConnection((err, connection) => {
    if (err) {
        console.error('Database connection failed:', err);
    } else {
        console.log('Connected to MySQL database');
        connection.release();
    }
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

const authenticateToken = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Access denied' });
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
        'SELECT * FROM users WHERE username = ? OR email = ?',
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
                { id: user.id, username: user.username, full_name: user.full_name, district: user.district, role: user.role },
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
                user: { id: user.id, username: user.username, full_name: user.full_name, district: user.district, role: user.role }
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
    const tableName = district.toLowerCase();
    
    const query = `INSERT INTO ${tableName} (water_point_id, Name, Type, TA, Functionality_Status, Latitude, Longitude) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    
    executeQuery(query, [water_point_id, name, type, ta, status, latitude, longitude], (err, result) => {
        if (err) {
            console.error('Error adding water point:', err);
            return res.status(500).json({ error: 'Database error: ' + err.message });
        }
        res.json({ success: true, water_point_id });
    });
});

// ============ DATA ENDPOINTS ============

app.get('/data', (req, res) => {
    const { table, district, type } = req.query;
    const tableName = table.toLowerCase();
    
    let query = `
        SELECT Functionality_Status as status, COUNT(*) as total 
        FROM ${tableName}
        WHERE 1=1
    `;
    const params = [];
    
    if (district && district !== '') {
        query += ` AND TA = ?`;
        params.push(district);
    }
    
    if (type && type !== '') {
        query += ` AND Type = ?`;
        params.push(type);
    }
    
    query += ` GROUP BY Functionality_Status`;
    
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
    const tableName = table.toLowerCase();
    
    let query = `
        SELECT 
            water_point_id,
            Name,
            Type,
            Functionality_Status as status,
            Latitude,
            Longitude
        FROM ${tableName}
        WHERE Latitude IS NOT NULL AND Longitude IS NOT NULL
    `;
    const params = [];
    
    if (district && district !== '') {
        query += ` AND TA = ?`;
        params.push(district);
    }
    
    if (type && type !== '') {
        query += ` AND Type = ?`;
        params.push(type);
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
    const tableName = table.toLowerCase();
    
    const query = `
        SELECT DISTINCT TA as district_name 
        FROM ${tableName}
        WHERE TA IS NOT NULL AND TA != ''
    `;
    
    executeQuery(query, [], (err, results) => {
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
    const tableName = table.toLowerCase();
    
    const query = `
        SELECT DISTINCT Type as water_type 
        FROM ${tableName}
        WHERE Type IS NOT NULL AND Type != ''
    `;
    
    executeQuery(query, [], (err, results) => {
        if (err) {
            console.error('Types fetch error:', err);
            return res.status(500).json({ error: err.message });
        }
        const types = (results || []).map(r => r.water_type).filter(Boolean);
        res.json(types);
    });
});

app.get('/national', (req, res) => {
    executeQuery("SHOW TABLES", [], (err, tables) => {
        if (err) {
            console.error('National fetch error:', err);
            return res.status(500).json({ error: err.message });
        }
        
        const districtTables = tables.map(t => Object.values(t)[0]).filter(t => 
            !['users', 'historical_snapshots', 'status_change_log'].includes(t)
        );
        
        let completed = 0;
        const results = [];
        
        if (districtTables.length === 0) {
            return res.json([]);
        }
        
        districtTables.forEach(tableName => {
            const query = `
                SELECT 
                    '${tableName}' as district,
                    COUNT(*) as total,
                    SUM(CASE WHEN Functionality_Status = 'Functional' THEN 1 ELSE 0 END) as functional,
                    SUM(CASE WHEN Functionality_Status = 'Partially functional but in need of repair' THEN 1 ELSE 0 END) as partial,
                    SUM(CASE WHEN Functionality_Status = 'Not functional' THEN 1 ELSE 0 END) as not_functional,
                    SUM(CASE WHEN Functionality_Status = 'No longer exists or abandoned' THEN 1 ELSE 0 END) as abandoned
                FROM ${tableName}
            `;
            
            executeQuery(query, [], (err2, row) => {
                if (!err2 && row && row.length > 0) {
                    results.push(row[0]);
                }
                completed++;
                if (completed === districtTables.length) {
                    res.json(results);
                }
            });
        });
    });
});

// ============ TEST & DEBUG ENDPOINTS ============

app.get('/api/test', (req, res) => {
    executeQuery("SHOW TABLES", [], (err, tables) => {
        if (err) {
            res.json({ error: err.message, hasData: false });
        } else {
            const districtTables = tables.map(t => Object.values(t)[0]).filter(t => 
                !['users', 'historical_snapshots', 'status_change_log'].includes(t)
            );
            res.json({ 
                hasData: districtTables.length > 0,
                districtCount: districtTables.length,
                tables: districtTables
            });
        }
    });
});

app.get('/api/debug-tables', (req, res) => {
    executeQuery("SHOW TABLES", [], (err, results) => {
        if (err) {
            res.json({ error: err.message });
        } else {
            const tables = results.map(row => Object.values(row)[0]);
            res.json({ 
                tables: tables,
                count: tables.length,
                database: process.env.DB_NAME
            });
        }
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});