const sqlite3 = require('sqlite3').verbose();

const DBSOURCE = "db.sqlite";

let db = new sqlite3.Database(DBSOURCE, (err) => {
    if (err) {
      // Cannot open database
      console.error(err.message)
      throw err
    }else{
        console.log('Connected to the SQLite database.');
        db.run(`CREATE TABLE IF NOT EXISTS books (
            id TEXT PRIMARY KEY,
            content TEXT
            )`,
        (err) => {
            if (err) {
                // Table already created
            }else{
                // Table just created, creating some rows
            }
        });
        db.run(`CREATE TABLE IF NOT EXISTS progress (
            bookId TEXT PRIMARY KEY,
            page INTEGER,
            paraIndex INTEGER
            )`,
        (err) => {
            if (err) {
                // Table already created
            }else{
                // Table just created, creating some rows
            }
        });
    }
});


module.exports = db;
