const express = require('express');
const mysql = require('mysql');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serve static files (index.html, script.js)

// Determine environment
const isDevelopment = process.env.NODE_ENV === 'development';

// Database configuration based on environment
let dbConfig;

if (isDevelopment) {
    // LOCAL XAMPP CONFIGURATION
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
    // RAILWAY PRODUCTION CONFIGURATION
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

// Create database connection
const db = mysql.createConnection(dbConfig);

// Test database connection
db.connect((err) => {
    if (err) {
        console.error('❌ Database connection failed:', {
            environment: isDevelopment ? 'XAMPP' : 'Railway',
            error: err.message
        });
    } else {
        console.log(`✅ Connected to MySQL database (${isDevelopment ? 'XAMPP' : 'Railway'})`);
    }
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

// Root endpoint - serve the dashboard
app.get("/", (req, res) => {
    res.sendFile(__dirname + "/index.html");
});

// API info endpoint
app.get("/api-info", (req, res) => {
    res.json({
        message: "Malawi Water Dashboard API is running",
        environment: isDevelopment ? "Development (XAMPP)" : "Production (Railway)",
        endpoints: {
            data: "/data?table=nsanje&district=TA_NAME&type=WATER_TYPE",
            districts: "/districts?table=nsanje",
            types: "/types?table=nsanje",
            mapdata: "/mapdata?table=nsanje&district=TA_NAME&type=WATER_TYPE",
            national: "/national",
            test: "/test-db"
        }
    });
});

// Test database endpoint
app.get("/test-db", (req, res) => {
    db.query("SELECT 1 + 1 AS result, NOW() AS server_time, DATABASE() AS current_database", (err, results) => {
        if (err) {
            return res.status(500).json({ 
                error: "Database connection failed", 
                details: err.message,
                environment: isDevelopment ? "development" : "production"
            });
        }
        res.json({ 
            success: true, 
            message: `Database connected successfully (${isDevelopment ? 'XAMPP' : 'Railway'})`,
            data: results[0]
        });
    });
});

// Data endpoint
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

// Districts endpoint
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

// Types endpoint
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

// Map data endpoint
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

// National endpoint
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 API running on port ${PORT}`);
    console.log(`📊 Environment: ${isDevelopment ? 'DEVELOPMENT (XAMPP)' : 'PRODUCTION (Railway)'}`);
});