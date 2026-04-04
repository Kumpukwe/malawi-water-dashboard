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
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
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
        initializeDatabase();
    }
});

// Initialize database tables
function initializeDatabase() {
    const createHistoricalTable = `
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
    
    executeQuery(createHistoricalTable, [], (err) => {
        if (err) console.error('Error creating historical table:', err);
        else console.log('Historical snapshots table ready');
    });
}

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
        
        if (!results || results.length === 0) {
            const currentQuery = `
                SELECT 
                    COUNT(*) as total_count,
                    SUM(CASE WHEN Functionality_Status = 'Functional' THEN 1 ELSE 0 END) as functional_count,
                    SUM(CASE WHEN Functionality_Status = 'Partially functional but in need of repair' THEN 1 ELSE 0 END) as partially_functional_count,
                    SUM(CASE WHEN Functionality_Status = 'Not functional' THEN 1 ELSE 0 END) as not_functional_count,
                    SUM(CASE WHEN Functionality_Status = 'No longer exists or abandoned' THEN 1 ELSE 0 END) as abandoned_count
                FROM ${district}
            `;
            
            executeQuery(currentQuery, [], (err2, currentData) => {
                if (err2 || !currentData || currentData.length === 0) {
                    return res.json([]);
                }
                
                const total = currentData[0].total_count || 0;
                const functional = currentData[0].functional_count || 0;
                const functionalRate = total > 0 ? (functional / total) * 100 : 0;
                
                res.json([{
                    date: new Date().toISOString().split('T')[0],
                    functional_count: functional,
                    partially_functional_count: currentData[0].partially_functional_count || 0,
                    not_functional_count: currentData[0].not_functional_count || 0,
                    abandoned_count: currentData[0].abandoned_count || 0,
                    total_count: total,
                    functional_rate: functionalRate
                }]);
            });
        } else {
            res.json(results);
        }
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
            SUM(not_functional_count) as total_not_functional,
            MAX(snapshot_date) as latest_date
        FROM historical_snapshots
        WHERE district = ?
        AND snapshot_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
        GROUP BY DATE_FORMAT(snapshot_date, '%Y-%m')
        ORDER BY month DESC
        LIMIT 6
    `;
    
    executeQuery(query, [district], (err, results) => {
        if (err) {
            console.error('Monthly summary error:', err);
            return res.status(500).json({ error: err.message });
        }
        
        res.json(results || []);
    });
});

app.get('/api/record-snapshot', (req, res) => {
    executeQuery("SHOW TABLES", [], (err, tables) => {
        if (err) {
            return res.json({ error: err.message });
        }
        
        const districtTables = tables.map(t => Object.values(t)[0]).filter(t => 
            !['users', 'historical_snapshots', 'status_change_log'].includes(t)
        );
        
        let completed = 0;
        let errors = [];
        
        if (districtTables.length === 0) {
            return res.json({ message: "No district tables found", success: false });
        }
        
        districtTables.forEach(tableName => {
            const query = `
                INSERT INTO historical_snapshots 
                (district, snapshot_date, functional_count, partially_functional_count, not_functional_count, abandoned_count, total_count, functional_rate)
                VALUES (
                    '${tableName}',
                    CURDATE(),
                    (SELECT COUNT(*) FROM ${tableName} WHERE Functionality_Status = 'Functional'),
                    (SELECT COUNT(*) FROM ${tableName} WHERE Functionality_Status = 'Partially functional but in need of repair'),
                    (SELECT COUNT(*) FROM ${tableName} WHERE Functionality_Status = 'Not functional'),
                    (SELECT COUNT(*) FROM ${tableName} WHERE Functionality_Status = 'No longer exists or abandoned'),
                    (SELECT COUNT(*) FROM ${tableName}),
                    ROUND((SELECT COUNT(*) FROM ${tableName} WHERE Functionality_Status = 'Functional') / NULLIF((SELECT COUNT(*) FROM ${tableName}), 0) * 100, 2)
                )
                ON DUPLICATE KEY UPDATE
                    functional_count = VALUES(functional_count),
                    partially_functional_count = VALUES(partially_functional_count),
                    not_functional_count = VALUES(not_functional_count),
                    abandoned_count = VALUES(abandoned_count),
                    total_count = VALUES(total_count),
                    functional_rate = VALUES(functional_rate)
            `;
            
            executeQuery(query, [], (err2) => {
                if (err2) errors.push(`${tableName}: ${err2.message}`);
                completed++;
                if (completed === districtTables.length) {
                    res.json({ 
                        success: errors.length === 0, 
                        message: `Snapshots recorded for ${districtTables.length} districts`,
                        errors: errors
                    });
                }
            });
        });
    });
});

// Force add a test snapshot from 45 days ago to create trend data
app.get('/api/force-test-snapshot', (req, res) => {
    const getCurrentData = `
        SELECT 
            COUNT(*) as total_count,
            SUM(CASE WHEN Functionality_Status = 'Functional' THEN 1 ELSE 0 END) as functional_count,
            SUM(CASE WHEN Functionality_Status = 'Partially functional but in need of repair' THEN 1 ELSE 0 END) as partially_count,
            SUM(CASE WHEN Functionality_Status = 'Not functional' THEN 1 ELSE 0 END) as not_functional_count,
            SUM(CASE WHEN Functionality_Status = 'No longer exists or abandoned' THEN 1 ELSE 0 END) as abandoned_count
        FROM nsanje
    `;
    
    executeQuery(getCurrentData, [], (err, current) => {
        if (err) {
            return res.json({ error: err.message });
        }
        
        const data = current[0];
        const total = data.total_count || 1;
        const functional = data.functional_count || 0;
        const currentRate = (functional / total) * 100;
        
        const insertQuery = `
            INSERT INTO historical_snapshots 
            (district, snapshot_date, functional_count, partially_functional_count, not_functional_count, abandoned_count, total_count, functional_rate)
            VALUES (
                'nsanje',
                DATE_SUB(CURDATE(), INTERVAL 45 DAY),
                ${Math.round(functional * 0.85)},
                ${data.partially_count || 0},
                ${data.not_functional_count || 0},
                ${data.abandoned_count || 0},
                ${total},
                ${(currentRate * 0.85).toFixed(2)}
            )
            ON DUPLICATE KEY UPDATE
                functional_count = VALUES(functional_count),
                functional_rate = VALUES(functional_rate)
        `;
        
        executeQuery(insertQuery, [], (err2, result) => {
            if (err2) {
                res.json({ error: err2.message });
            } else {
                res.json({ 
                    success: true, 
                    message: "Test snapshot added from 45 days ago",
                    current_rate: currentRate.toFixed(2) + "%",
                    old_rate: (currentRate * 0.85).toFixed(2) + "%",
                    affectedRows: result.affectedRows
                });
            }
        });
    });
});

// View existing snapshots
app.get('/api/view-snapshots', (req, res) => {
    executeQuery("SELECT * FROM historical_snapshots WHERE district = 'nsanje' ORDER BY snapshot_date", [], (err, results) => {
        if (err) {
            res.json({ error: err.message });
        } else {
            res.json({ 
                count: results.length,
                snapshots: results
            });
        }
    });
});

// ============ TEST ENDPOINTS ============

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