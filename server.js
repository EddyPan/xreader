require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const db = require("./database.js");

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Serve static files from the root directory
app.use(express.static(path.join(__dirname, 'public')));

const HTTP_PORT = 8000;

// Start server
app.listen(HTTP_PORT, () => {
    console.log("Server running on port %PORT%".replace("%PORT%",HTTP_PORT))
});

const crypto = require('crypto');

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Middleware for authentication
// Default token for development: dev-token
const auth = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    const secretKey = process.env.SECRET_KEY;
    const md5Hash = process.env.MD5_HASH;

    if (!token || !secretKey || !md5Hash) {
        return res.status(401).json({ error: "Unauthorized: Missing token or server configuration" });
    }

    const hash = crypto.createHmac('md5', secretKey).update(token).digest('hex');
    
    if (hash === md5Hash) {
        next();
    } else {
        res.status(401).json({ error: "Unauthorized: Invalid token" });
    }
};

// GET /health
app.get("/health", auth, (req, res, next) => {
    res.json({status: "ok"});
});

// POST /book
app.post("/book", auth, (req, res, next) => {
    const { bookId, content } = req.body;
    if (!bookId || !content) {
        return res.status(400).json({ error: "Invalid request body" });
    }

    const sql = 'INSERT OR REPLACE INTO books (id, content) VALUES (?,?)';
    const params = [bookId, content];
    db.run(sql, params, function(err, result) {
        if (err){
            res.status(400).json({"error": err.message})
            return;
        }
        res.json({
            "status": "success"
        })
    });
});

// POST /sync
app.post("/sync", auth, (req, res, next) => {
    const { bookId, progress } = req.body;
    if (!bookId || !progress || progress.page === undefined || progress.paraIndex === undefined) {
        return res.status(400).json({ error: "Invalid request body" });
    }

    const sql = 'INSERT OR REPLACE INTO progress (bookId, page, paraIndex) VALUES (?,?,?)';
    const params = [bookId, progress.page, progress.paraIndex];
    db.run(sql, params, function(err, result) {
        if (err){
            res.status(400).json({"error": err.message})
            return;
        }
        res.json({
            "status": "success"
        })
    });
});

// GET /sync/:bookId
app.get("/sync/:bookId", auth, (req, res, next) => {
    const { bookId } = req.params;
    const sql = "select * from progress where bookId = ?";
    const params = [bookId];
    db.get(sql, params, (err, row) => {
        if (err) {
          res.status(400).json({"error":err.message});
          return;
        }
        if (row) {
            res.json({
                bookId: row.bookId,
                progress: {
                    page: row.page,
                    paraIndex: row.paraIndex
                }
            });
        } else {
            res.status(404).json({ error: "Not Found" });
        }
      });
});

// Default response for any other request
app.use(function(req, res){
    res.status(404);
});
