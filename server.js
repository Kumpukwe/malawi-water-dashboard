const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

dotenv.config();

const app = express();
app.use(cors({
    origin: ['https://malawi-water-dashboard.up.railway.app', 'http://localhost:3000'],
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(__dirname));

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'malawi-water-dashboard-secret-key-2026';

// Determine environment
const isDevelopment = process.env.NODE_ENV === 'development';

// Database configuration
let dbConfig;

if (isDevelopment) {
    console.log('🔧 Running in DEVELOPMENT mode with XAMPP');
    dbConfig = {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'malawi_districts_water',
        port: process.env.DB_PORT || 3306,
        connectionLimit: 10
    };
} else {
    console.log('🚀 Running in PRODUCTION mode with Railway MySQL');
    dbConfig = {
        host: process.env.MYSQLHOST,
        user: process.env.MYSQLUSER,
        password: process.env.MYSQLPASSWORD,
        database: process.env.MYSQLDATABASE,
        port: process.env.MYSQLPORT || 3306,
        connectionLimit: 10
    };
}

const db = mysql.createConnection(dbConfig);

db.connect((err) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
    } else {
        console.log(`✅ Connected to MySQL database`);
    }
});

// ============ AUTHENTICATION TABLES ============
const createUsersTable = `
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'officer', 'viewer') DEFAULT 'viewer',
    district VARCHAR(50),
    full_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL
)`;

db.query(createUsersTable, (err) => {
    if (err) console.error('Error creating users table:', err);
    else console.log('✅ Users table ready');
});

// Create default users
const createDefaultUsers = `
INSERT IGNORE INTO users (username, email, password, role, district, full_name) VALUES 
('admin', 'admin@baseflow.com', ?, 'admin', NULL, 'System Administrator'),
('officer', 'officer@baseflow.com', ?, 'officer', 'nsanje', 'District Officer'),
('viewer', 'viewer@baseflow.com', ?, 'viewer', NULL, 'Public Viewer')`;

bcrypt.hash('admin123', 10, (err, adminHash) => {
    if (err) return;
    bcrypt.hash('officer123', 10, (err, officerHash) => {
        if (err) return;
        bcrypt.hash('viewer123', 10, (err, viewerHash) => {
            if (err) return;
            db.query(createDefaultUsers, [adminHash, officerHash, viewerHash], (err) => {
                if (err) console.error('Error creating default users:', err);
                else console.log('✅ Default users created');
            });
        });
    });
});

// ============ AUTHENTICATION MIDDLEWARE ============
const authenticateToken = (req, res, next) => {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Access denied. Please login.' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

const authorizeRole = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
        }
        next();
    };
};

// ============ AUTHENTICATION ENDPOINTS ============

// Register new user (admin only)
app.post('/api/register', authenticateToken, authorizeRole('admin'), (req, res) => {
    const { username, email, password, role, district, full_name } = req.body;
    
    if (!username || !email || !password) {
        return res.status(400).json({ error: 'Username, email, and password required' });
    }
    
    bcrypt.hash(password, 10, (err, hash) => {
        if (err) return res.status(500).json({ error: 'Error hashing password' });
        
        const sql = `INSERT INTO users (username, email, password, role, district, full_name) 
                     VALUES (?, ?, ?, ?, ?, ?)`;
        db.query(sql, [username, email, hash, role || 'viewer', district, full_name], (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(400).json({ error: 'Username or email already exists' });
                }
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ success: true, message: 'User created successfully' });
        });
    });
});

// Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    
    const sql = 'SELECT * FROM users WHERE username = ? OR email = ?';
    db.query(sql, [username, username], (err, users) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }
        
        const user = users[0];
        bcrypt.compare(password, user.password, (err, isValid) => {
            if (err || !isValid) {
                return res.status(401).json({ error: 'Invalid username or password' });
            }
            
            // Update last login
            db.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
            
            // Create token
            const token = jwt.sign(
                { id: user.id, username: user.username, role: user.role, district: user.district },
                JWT_SECRET,
                { expiresIn: '24h' }
            );
            
            // Set cookie
            res.cookie('token', token, {
                httpOnly: true,
                secure: !isDevelopment,
                sameSite: 'strict',
                maxAge: 24 * 60 * 60 * 1000
            });
            
            res.json({
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    district: user.district,
                    full_name: user.full_name
                },
                token
            });
        });
    });
});

// Logout
app.post('/api/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true, message: 'Logged out successfully' });
});

// Get current user
app.get('/api/me', (req, res) => {
    const token = req.cookies.token;
    if (!token) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        
        const sql = 'SELECT id, username, email, role, district, full_name, created_at, last_login FROM users WHERE id = ?';
        db.query(sql, [decoded.id], (err, users) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (users.length === 0) return res.status(401).json({ error: 'User not found' });
            res.json(users[0]);
        });
    });
});

// Get all users (admin only)
app.get('/api/users', authenticateToken, authorizeRole('admin'), (req, res) => {
    const sql = 'SELECT id, username, email, role, district, full_name, created_at, last_login FROM users';
    db.query(sql, (err, users) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(users);
    });
});

// ============ DATA ENTRY ENDPOINTS ============

// Add new water point
app.post('/api/add-water-point', authenticateToken, (req, res) => {
    const { district, name, ta, type, status, latitude, longitude, officer_name, notes } = req.body;
    
    if (!district || !name || !ta || !type || !status) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Check if officer has permission for this district
    if (req.user.role === 'officer' && req.user.district && req.user.district !== district) {
        return res.status(403).json({ error: 'You can only add data for your district' });
    }
    
    // First check if the table exists
    db.query(`SHOW TABLES LIKE '${district}'`, (err, tables) => {
        if (err || tables.length === 0) {
            return res.status(400).json({ error: 'Invalid district' });
        }
        
        const sql = `
            INSERT INTO \`${district}\` 
            (Name, TA, Type, Functionality_Status, Latitude, Longitude, officer_name, notes, date_recorded)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;
        
        db.query(sql, [name, ta, type, status, latitude || null, longitude || null, officer_name || req.user.username, notes || null], (err, result) => {
            if (err) {
                console.error('Insert error:', err);
                return res.status(500).json({ error: 'Database error', details: err.message });
            }
            res.json({ success: true, message: 'Water point added successfully', id: result.insertId });
        });
    });
});

// Update water point status
app.put('/api/update-water-point/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { district, status, notes } = req.body;
    
    if (!district || !status) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Check permission
    if (req.user.role === 'officer' && req.user.district && req.user.district !== district) {
        return res.status(403).json({ error: 'You can only update data for your district' });
    }
    
    const sql = `UPDATE \`${district}\` SET Functionality_Status = ?, notes = ?, last_updated = NOW() WHERE id = ?`;
    db.query(sql, [status, notes || null, id], (err, result) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Water point not found' });
        }
        res.json({ success: true, message: 'Water point updated successfully' });
    });
});

// Get alerts for low functionality
app.get('/api/alerts', authenticateToken, (req, res) => {
    let districts = [];
    let districtFilter = '';
    
    if (req.user.role === 'officer' && req.user.district) {
        districts = [req.user.district];
    } else {
        districts = [
            "nsanje", "chikwawa", "blantyre", "chiradzulo", "thyolo",
            "mulanje", "phalombe", "zomba", "machinga", "mangochi",
            "balaka", "ntcheu", "dedza", "salima", "lilongwe",
            "mchinji", "dowa", "ntchisi", "kasungu", "nkhotakota",
            "nkhatabay", "mzimba", "karonga", "chitipa", "likoma"
        ];
    }
    
    const results = [];
    let completed = 0;
    
    if (districts.length === 0) {
        return res.json([]);
    }
    
    districts.forEach(district => {
        const sql = `
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN Functionality_Status IN ('Not functional', 'Partially functional but in need of repair') THEN 1 ELSE 0 END) as critical,
                ROUND(SUM(CASE WHEN Functionality_Status IN ('Not functional', 'Partially functional but in need of repair') THEN 1 ELSE 0 END) / COUNT(*) * 100, 1) as critical_pct
            FROM \`${district}\`
        `;
        
        db.query(sql, (err, rows) => {
            if (!err && rows.length > 0) {
                results.push({
                    district: district,
                    total: rows[0].total,
                    critical: rows[0].critical,
                    critical_pct: rows[0].critical_pct
                });
            }
            completed++;
            if (completed === districts.length) {
                // Filter districts with >20% non-functional/partial
                const alerts = results.filter(r => r.critical_pct > 20);
                res.json(alerts);
            }
        });
    });
});

const ALLOWED_TABLES = [
    "nsanje", "chikwawa", "blantyre", "chiradzulo", "thyolo",
    "mulanje", "phalombe", "zomba", "machinga", "mangochi",
    "balaka", "ntcheu", "dedza", "salima", "lilongwe",
    "mchinji", "dowa", "ntchisi", "kasungu", "nkhotakota",
    "nkhatabay", "mzimba", "karonga", "chitipa", "likoma"
];

const TABLES = [
    "balaka", "blantyre", "chitipa", "dedza", "dowa",
    "karonga", "kasungu", "likoma", "lilongwe", "machinga",
    "mangochi", "mchinji", "mulanje", "mzimba", "nkhatabay",
    "nkhotakota", "nsanje", "ntcheu", "ntchisi", "phalombe",
    "salima", "zomba"
];

// Root endpoint - serve dashboard
app.get("/", (req, res) => {
    res.sendFile(__dirname + "/index.html");
});

// Public endpoints (no authentication required)
app.get("/test-db", (req, res) => {
    db.query("SELECT 1 + 1 AS result, NOW() AS server_time, DATABASE() AS current_database", (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, data: results[0] });
    });
});

app.get("/data", (req, res) => {
    const table = req.query.table || "nsanje";
    const TA = req.query.district;
    const type = req.query.type;

    if (!ALLOWED_TABLES.includes(table.toLowerCase())) {
        return res.status(400).json({ error: "Invalid table" });
    }

    let sql = `SELECT \`Functionality_Status\` AS status, COUNT(*) AS total FROM \`${table}\``;
    const params = [];
    const conditions = [];

    if (TA) {
        conditions.push("`TA` = ?");
        params.push(TA);
    }

    if (type) {
        conditions.push("`Type` = ?");
        params.push(type);
    }

    if (conditions.length > 0) {
        sql += " WHERE " + conditions.join(" AND ");
    }

    sql += " GROUP BY `Functionality_Status`";

    db.query(sql, params, (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

app.get("/districts", (req, res) => {
    const table = req.query.table || "nsanje";

    if (!ALLOWED_TABLES.includes(table.toLowerCase())) {
        return res.status(400).json({ error: "Invalid table" });
    }

    db.query(`SELECT DISTINCT \`TA\` FROM \`${table}\` ORDER BY \`TA\``, (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results.map(r => r.TA));
    });
});

app.get("/types", (req, res) => {
    const table = req.query.table || "nsanje";

    if (!ALLOWED_TABLES.includes(table.toLowerCase())) {
        return res.status(400).json({ error: "Invalid table" });
    }

    db.query(`SELECT DISTINCT \`Type\` FROM \`${table}\` ORDER BY \`Type\``, (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results.map(r => r.Type));
    });
});

app.get("/mapdata", (req, res) => {
    const table = req.query.table || "nsanje";
    const TA = req.query.district;
    const type = req.query.type;

    if (!ALLOWED_TABLES.includes(table.toLowerCase())) {
        return res.status(400).json({ error: "Invalid table" });
    }

    let sql = `SELECT Name, Type, Latitude, Longitude, Functionality_Status AS status FROM \`${table}\` WHERE Latitude IS NOT NULL AND Longitude IS NOT NULL`;
    const params = [];

    if (TA) {
        sql += " AND `TA` = ?";
        params.push(TA);
    }

    if (type) {
        sql += " AND `Type` = ?";
        params.push(type);
    }

    db.query(sql, params, (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

app.get("/national", (req, res) => {
    const queries = TABLES.map(table => 
        `SELECT '${table}' AS district, 
        COUNT(*) AS total,
        SUM(CASE WHEN \`Functionality_Status\` = 'Functional' THEN 1 ELSE 0 END) AS functional,
        SUM(CASE WHEN \`Functionality_Status\` = 'Not functional' THEN 1 ELSE 0 END) AS not_functional,
        SUM(CASE WHEN \`Functionality_Status\` = 'Partially functional but in need of repair' THEN 1 ELSE 0 END) AS partial,
        SUM(CASE WHEN \`Functionality_Status\` = 'No longer exists or abandoned' THEN 1 ELSE 0 END) AS abandoned
        FROM \`${table}\``
    );

    const sql = queries.join(" UNION ALL ") + " ORDER BY district";

    db.query(sql, (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`🚀 API running on port ${PORT}`);
});