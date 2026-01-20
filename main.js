require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'templates'));

const upload = multer({ dest: '.' });

const PASSWORD = process.env.PASSWORD; // hardcoded environment variable password

const auth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.setHeader('WWW-Authenticate', 'Basic');
        return res.status(401).send('Authentication required');
    }
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
    const [username, password] = credentials.split(':');
    if (password !== PASSWORD && username !== "baltej") {
        return res.status(401).send('Invalid credentials');
    }
    next();
};

app.get('/', auth, (req, res) => {
    fs.readdir('.', (err, files) => {
        if (err) {
            files = [];
        }
        const filteredFiles = files.filter(file => {
            return !file.endsWith('.py') && fs.statSync(file).isFile();
        });
        res.render('index', { files: filteredFiles });
    });
});

app.post('/upload', auth, upload.array('files[]'), (req, res) => {
    res.send('Files successfully uploaded');
});

app.get('/progress', auth, (req, res) => {
    res.json({ progress: 0 });
});

app.get('/download/:filename', auth, (req, res) => {
    const filename = req.params.filename;
    res.download(path.join('.', filename));
});

app.delete('/delete/:filename', auth, (req, res) => {
    const filename = req.params.filename;
    fs.unlink(path.join('.', filename), (err) => {
        if (err) {
            res.status(500).send('Error deleting file');
        } else {
            res.send('File deleted');
        }
    });
});

app.listen(5000, '0.0.0.0', () => {
    console.log('Server running on port 5000');
});
