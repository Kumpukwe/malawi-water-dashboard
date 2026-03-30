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
app.use(express.static('.')); // Serve static files

// Database connection
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'malawi_water',
    port: process.env.DB_PORT || 3306
});

db.connect((err) => {
    if (err) {
        console.error('Database connection failed:', err);
        return;
    }
    console.log('Connected to MySQL database');
    
    // Create tables if they don't exist
    initializeDatabase();
});

// Initialize database tables
function initializeDatabase() {
    // Create historical_snapshots table
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
    
    // Create status_change_log table
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
    
    db.query(createSnapshotTable, (err) => {
        if (err) console.error('Error creating snapshot table:', err);
        else console.log('Historical snapshots table ready');
    });
    
    db.query(createChangeLogTable, (err) => {
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

// ============ TREND ANALYSIS ENDPOINTS ============

// Get historical trends for a district
app.get('/api/trends', (req, res) => {
    const { district, startDate, endDate, period = '6months' } = req.query;
    
    let startDateParam = startDate;
    if (!startDateParam && period) {
        const now = new Date();
        switch(period) {
            case '3months':
                startDateParam = new Date(now.setMonth(now.getMonth() - 3)).toISOString().split('T')[0];
                break;
            case '6months':
                startDateParam = new Date(now.setMonth(now.getMonth() - 6)).toISOString().split('T')[0];
                break;
            case '1year':
                startDateParam = new Date(now.setFullYear(now.getFullYear() - 1)).toISOString().split('T')[0];
                break;
            case '2years':
                startDateParam = new Date(now.setFullYear(now.getFullYear() - 2)).toISOString().split('T')[0];
                break;
            default:
                startDateParam = new Date(now.setMonth(now.getMonth() - 6)).toISOString().split('T')[0];
        }
    }
    
    const endDateParam = endDate || new Date().toISOString().split('T')[0];
    
    let query = `
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
        AND snapshot_date <= ?
        ORDER BY snapshot_date ASC
    `;
    
    db.query(query, [district, startDateParam, endDateParam], (err, results) => {
        if (err) {
            console.error('Trends fetch error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// Get district comparison trends
app.get('/api/trends/comparison', (req, res) => {
    const { districts, metric = 'functional_rate' } = req.query;
    
    if (!districts) {
        return res.status(400).json({ error: 'Districts parameter required' });
    }
    
    const districtList = districts.split(',');
    const placeholders = districtList.map(() => '?').join(',');
    
    const query = `
        SELECT 
            district,
            snapshot_date as date,
            functional_rate,
            functional_count,
            total_count
        FROM historical_snapshots
        WHERE district IN (${placeholders})
        AND snapshot_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
        ORDER BY district, snapshot_date ASC
    `;
    
    db.query(query, districtList, (err, results) => {
        if (err) {
            console.error('Comparison fetch error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        // Group by district
        const grouped = {};
        results.forEach(row => {
            if (!grouped[row.district]) {
                grouped[row.district] = [];
            }
            grouped[row.district].push({
                date: row.date,
                value: parseFloat(row.functional_rate),
                functional: row.functional_count,
                total: row.total_count
            });
        });
        
        res.json(grouped);
    });
});

// Get monthly summary for a district
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
            SUM(abandoned_count) as total_abandoned
        FROM historical_snapshots
        WHERE district = ?
        AND snapshot_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
        GROUP BY DATE_FORMAT(snapshot_date, '%Y-%m')
        ORDER BY month DESC
    `;
    
    db.query(query, [district], (err, results) => {
        if (err) {
            console.error('Monthly summary error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// Get trend statistics (improvement rate, best/worst months)
app.get('/api/trend-stats', (req, res) => {
    const { district } = req.query;
    
    const query = `
        SELECT 
            MIN(snapshot_date) as first_date,
            MAX(snapshot_date) as last_date,
            MIN(functional_rate) as min_rate,
            MAX(functional_rate) as max_rate,
            (
                SELECT functional_rate 
                FROM historical_snapshots h2 
                WHERE h2.district = ? 
                ORDER BY snapshot_date ASC 
                LIMIT 1
            ) as first_rate,
            (
                SELECT functional_rate 
                FROM historical_snapshots h2 
                WHERE h2.district = ? 
                ORDER BY snapshot_date DESC 
                LIMIT 1
            ) as last_rate,
            COUNT(*) as total_snapshots
        FROM historical_snapshots
        WHERE district = ?
        AND snapshot_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
    `;
    
    db.query(query, [district, district, district], (err, results) => {
        if (err) {
            console.error('Trend stats error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results[0]);
    });
});

// Record status change
app.post('/api/record-status-change', authenticateToken, (req, res) => {
    const { water_point_id, old_status, new_status, notes } = req.body;
    
    // First get the district for this water point
    db.query(
        'SELECT district FROM water_points WHERE water_point_id = ?',
        [water_point_id],
        (err, results) => {
            if (err || results.length === 0) {
                return res.status(500).json({ error: 'Water point not found' });
            }
            
            const district = results[0].district;
            
            const insertQuery = `
                INSERT INTO status_change_log 
                (water_point_id, district, old_status, new_status, changed_by, notes)
                VALUES (?, ?, ?, ?, ?, ?)
            `;
            
            db.query(insertQuery, [water_point_id, district, old_status, new_status, req.user.username, notes], (err) => {
                if (err) {
                    console.error('Status change log error:', err);
                    return res.status(500).json({ error: 'Database error' });
                }
                res.json({ success: true });
            });
        }
    );
});

// Get status change history for a water point
app.get('/api/status-history', (req, res) => {
    const { water_point_id } = req.query;
    
    const query = `
        SELECT 
            old_status,
            new_status,
            changed_by,
            notes,
            changed_at
        FROM status_change_log
        WHERE water_point_id = ?
        ORDER BY changed_at DESC
        LIMIT 20
    `;
    
    db.query(query, [water_point_id], (err, results) => {
        if (err) {
            console.error('Status history error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// ============ EXISTING AUTH ENDPOINTS ============

app.get('/api/me', authenticateToken, (req, res) => {
    res.json(req.user);
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    db.query(
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
    
    db.query(
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
    
    console.log('Data request:', { table, district, type }); // Debug log
    
    // First, check if the table exists
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
    
    console.log('Query:', query);
    console.log('Params:', params);
    
    db.query(query, params, (err, results) => {
        if (err) {
            console.error('Data fetch error:', err);
            return res.status(500).json({ error: err.message, query: query });
        }
        
        console.log('Data results:', results);
        
        // If no results, return empty array
        if (!results || results.length === 0) {
            return res.json([]);
        }
        
        res.json(results);
    });
});
    

app.get('/mapdata', (req, res) => {
    const { table, district, type } = req.query;
    
    console.log('Map data request:', { table, district, type });
    
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
    
    query += ` LIMIT 1000`; // Limit results for performance
    
    db.query(query, params, (err, results) => {
        if (err) {
            console.error('Map data fetch error:', err);
            return res.status(500).json({ error: err.message });
        }
        
        console.log('Map data points:', results.length);
        res.json(results);
    });
});
    
app.get('/districts', (req, res) => {
    const { table } = req.query;
    
    console.log('Districts request for table:', table);
    
    // Try different possible column names
    let query = `
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
    
    db.query(query, [table, table], (err, results) => {
        if (err) {
            console.error('Districts fetch error:', err);
            return res.status(500).json({ error: err.message });
        }
        
        const districts = results.map(r => r.district_name).filter(Boolean);
        console.log('Districts found:', districts);
        res.json(districts);
    });
});
        
  
app.get('/types', (req, res) => {
    const { table } = req.query;
    
    console.log('Types request for table:', table);
    
    // Try different possible column names
    let query = `
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
    
    db.query(query, [table, table], (err, results) => {
        if (err) {
            console.error('Types fetch error:', err);
            return res.status(500).json({ error: err.message });
        }
        
        const types = results.map(r => r.water_type).filter(Boolean);
        console.log('Types found:', types);
        res.json(types);
    });
});
        
app.get('/national', (req, res) => {
    db.query(`
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
    `, (err, results) => {
        if (err) {
            console.error('National fetch error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// ============ CRON JOB FOR DAILY SNAPSHOTS ============

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
    
    db.query(query, (err) => {
        if (err) console.error('Snapshot recording error:', err);
        else console.log('Daily snapshot recorded at', new Date().toISOString());
    });
}

// Debug endpoint to check database structure
app.get('/api/debug', (req, res) => {
    db.query('SHOW TABLES', (err, tables) => {
        if (err) {
            return res.json({ error: err.message });
        }
        
        // Get structure of water_points table
        db.query('DESCRIBE water_points', (err2, structure) => {
            res.json({
                tables: tables,
                water_points_structure: structure,
                error: err2 ? err2.message : null
            });
        });
    });
});

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
}, 60000); // Check every minute

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});