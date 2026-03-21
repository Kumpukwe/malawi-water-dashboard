/**
 * import_all.js
 * ─────────────────────────────────────────────────────────────────
 * Run ONCE to bulk-import every CSV in a folder into MySQL.
 * Each file becomes its own table named after the file.
 *
 * Usage:
 *   1. Put this file in your project root (same folder as server.js)
 *   2. Set CSV_FOLDER below to the path of your CSV folder
 *   3. Run:  node import_all.js
 * ─────────────────────────────────────────────────────────────────
 *
 * Requirements (install if missing):
 *   npm install mysql csv-parser
 */

const fs      = require("fs");
const path    = require("path");
const mysql   = require("mysql");
const csv     = require("csv-parser");

// ── CONFIG ────────────────────────────────────────────────────────
const CSV_FOLDER = "C:/Users/USER/Downloads/Districts";   // <-- change this to your folder path
                                    //     e.g. "C:/Users/USER/Desktop/districts"

const DB_CONFIG = {
    host:     "127.0.0.1",
    user:     "root",
    password: "",
    database: "malawi_districts_water",          // must already exist in MySQL
    multipleStatements: true
};
// ─────────────────────────────────────────────────────────────────

const db = mysql.createConnection(DB_CONFIG);

db.connect(err => {
    if (err) {
        console.error("❌  Could not connect to MySQL:", err.message);
        process.exit(1);
    }
    console.log("✅  Connected to MySQL database:", DB_CONFIG.database);
    importAll();
});

// ── Main ──────────────────────────────────────────────────────────
function importAll() {
    // Get every .csv file in the folder
    let files;
    try {
        files = fs.readdirSync(CSV_FOLDER).filter(f => f.toLowerCase().endsWith(".csv"));
    } catch (e) {
        console.error(`❌  Cannot read folder "${CSV_FOLDER}":`, e.message);
        db.end();
        process.exit(1);
    }

    if (files.length === 0) {
        console.log("⚠️   No CSV files found in", CSV_FOLDER);
        db.end();
        return;
    }

    console.log(`\n📂  Found ${files.length} CSV file(s): ${files.join(", ")}\n`);

    // Process files one at a time (sequentially to avoid overwhelming MySQL)
    let index = 0;

    function next() {
        if (index >= files.length) {
            console.log("\n🎉  All files imported successfully!");
            console.log("👉  Add the table names to DISTRICT_TABLES in server.js");
            db.end();
            return;
        }

        const file      = files[index++];
        const tableName = path.basename(file, ".csv").toLowerCase().replace(/[^a-z0-9_]/g, "_");
        const filePath  = path.join(CSV_FOLDER, file);

        importCSV(filePath, tableName, next);
    }

    next();
}

// ── Import one CSV file into one table ────────────────────────────
function importCSV(filePath, tableName, done) {
    console.log(`⏳  Importing "${path.basename(filePath)}" → table \`${tableName}\` ...`);

    const rows = [];

    fs.createReadStream(filePath)
        .pipe(csv())
        .on("data", row => rows.push(row))
        .on("error", err => {
            console.error(`  ❌  Error reading file:`, err.message);
            done();
        })
        .on("end", () => {
            if (rows.length === 0) {
                console.log(`  ⚠️   No rows found in ${path.basename(filePath)}, skipping.`);
                return done();
            }

            // Column names come from the CSV header row
            const columns = Object.keys(rows[0]);

            createTableAndInsert(tableName, columns, rows, done);
        });
}

// ── Sanitise a CSV header into a safe MySQL column name ───────────
function cleanColName(raw) {
    return raw
        .trim()                        // remove leading/trailing spaces
        .replace(/[`'"]/g, "")         // remove backticks/quotes
        .replace(/\s+/g, "_")          // spaces → underscores
        .replace(/[^a-zA-Z0-9_]/g, "_")// any other bad chars → underscore
        .replace(/_+/g, "_")           // collapse multiple underscores
        .slice(0, 64);                 // MySQL max identifier length is 64
}

// ── Create table (drop if exists) then insert all rows ───────────
function createTableAndInsert(tableName, rawColumns, rows, done) {
    // Clean every column name
    const columns    = rawColumns.map(cleanColName);
    const colMapping = rawColumns.map((raw, i) => ({ raw, clean: columns[i] }));

    // Log any columns that were changed so you can see what happened
    colMapping.forEach(({ raw, clean }) => {
        if (raw !== clean) console.log(`    🔧  Renamed column: "${raw}" → "${clean}"`);
    });

    // Build column definitions — everything as TEXT for safety
    // (you can ALTER the table types later in MySQL Workbench if needed)
    const colDefs = columns
        .map(c => `\`${c}\` TEXT`)
        .join(", ");

    const createSQL = `
        DROP TABLE IF EXISTS \`${tableName}\`;
        CREATE TABLE \`${tableName}\` (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ${colDefs}
        );
    `;

    db.query(createSQL, err => {
        if (err) {
            console.error(`  ❌  Could not create table \`${tableName}\`:`, err.message);
            return done();
        }

        // Build bulk INSERT — read values using original raw header names
        const colList    = columns.map(c => `\`${c}\``).join(", ");
        const insertSQL  = `INSERT INTO \`${tableName}\` (${colList}) VALUES ?`;
        const values     = rows.map(row => rawColumns.map(raw => row[raw] ?? null));

        // Insert in chunks of 500 rows to avoid packet size limits
        insertInChunks(tableName, insertSQL, values, 0, done);
    });
}

// ── Insert rows in chunks of 500 ─────────────────────────────────
function insertInChunks(tableName, sql, values, offset, done) {
    const CHUNK = 500;
    const chunk = values.slice(offset, offset + CHUNK);

    if (chunk.length === 0) {
        console.log(`  ✅  Inserted ${values.length} rows into \`${tableName}\``);
        return done();
    }

    db.query(sql, [chunk], err => {
        if (err) {
            console.error(`  ❌  Insert error on \`${tableName}\`:`, err.message);
            return done();
        }
        insertInChunks(tableName, sql, values, offset + CHUNK, done);
    });
}
