import './ContrastTests.mjs';

// Run simple express server to serve test-front.html
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

app.use(express.static(__dirname));
//app.use(express.static('public'));

app.get('/', (req, res) => { res.sendFile(__dirname + '/test-front.html'); });

app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});