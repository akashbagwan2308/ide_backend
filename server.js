const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');
const jwt = require('jsonwebtoken'); // Added JWT

const app = express();
app.use(cors()); 
app.use(express.json());

// 🔴 SECRET KEY: Store this in Render Environment Variables! 
// IMPORTANT: Both servers MUST use the exact same secret string!
const JWT_SECRET = process.env.JWT_SECRET || "logicsilicon_secure_jwt_key_2024";
const GOOGLE_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzhtk4rISUDJvMb3nLzJq2CBY5cVnm9kAnL_fuW77MLOkoR0-_dS0nKtmCwBjpD3mpAnQ/exec";

// ==========================================
// 1. AUTHENTICATION ENDPOINT
// ==========================================
app.post('/login', async (req, res) => {
    const { email, authString, role } = req.body;

    try {
        const googleResponse = await fetch(GOOGLE_WEB_APP_URL, {
            method: 'POST', 
            headers: {'Content-Type': 'text/plain'}, 
            body: JSON.stringify({ 
                action: 'login', 
                role: role || 'student', 
                email: email, 
                authString: authString 
            })
        });

        const data = await googleResponse.json();

        if (data.status === 'success') {
            const token = jwt.sign(
                { email: email, role: role || 'student' }, 
                JWT_SECRET, 
                { expiresIn: '24h' }
            );

            res.json({ status: 'success', token: token, user: { email, role: role || 'student' } });
        } else {
            res.status(401).json({ status: 'error', message: 'Invalid credentials.' });
        }
    } catch (error) {
        console.error("Auth Error:", error);
        res.status(500).json({ status: 'error', message: 'Internal server error during authentication.' });
    }
});

// ==========================================
// 2. SECURITY MIDDLEWARE
// ==========================================
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ status: "error", output: "Access Denied: No JWT Token Provided." });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ status: "error", output: "Access Denied: Invalid or Expired Token." });
        req.user = user;
        next();
    });
}

// ==========================================
// 3. SECURED COMPILATION ENDPOINT
// ==========================================
// Added 'authenticateToken' to block unauthorized execution
app.post('/run', authenticateToken, (req, res) => {
    const code = req.body.code;
    
    if (!code) {
        return res.status(400).json({ error: "No Verilog code provided." });
    }

    const runId = Date.now().toString() + Math.floor(Math.random() * 1000);
    const runDir = path.join('/tmp', runId);
    fs.mkdirSync(runDir, { recursive: true });

    const filePath = path.join(runDir, 'design.sv');
    const outPath = path.join(runDir, 'sim.vvp');

    fs.writeFileSync(filePath, code);

    exec(`iverilog -g2012 -o ${outPath} ${filePath}`, { timeout: 10000, cwd: runDir }, (compileErr, compileStdout, compileStderr) => {
        if (compileErr) {
            fs.rmSync(runDir, { recursive: true, force: true });
            return res.json({ status: "error", output: compileStderr || compileErr.message });
        }

        exec(`vvp ${outPath}`, { timeout: 10000, cwd: runDir }, (runErr, runStdout, runStderr) => {
            let vcdData = null;
            try {
                const files = fs.readdirSync(runDir);
                const vcdFile = files.find(f => f.endsWith('.vcd'));
                if (vcdFile) {
                    vcdData = fs.readFileSync(path.join(runDir, vcdFile), 'utf8');
                }
            } catch (err) {
                console.error("VCD Read Error:", err);
            }

            fs.rmSync(runDir, { recursive: true, force: true });

            if (runErr) {
                return res.json({ status: "error", output: runStderr || runErr.message });
            }

            return res.json({ status: "success", output: runStdout, vcd: vcdData });
        });
    });
});

// ==========================================
// 4. SECURED GOOGLE DRIVE UPLOAD ENDPOINT
// ==========================================
app.post('/save-drive', authenticateToken, async (req, res) => {
    const { filename, fileBase64, folderId } = req.body;

    if (!filename || !fileBase64 || !folderId) {
        return res.status(400).json({ status: 'error', message: 'Missing required parameters.' });
    }

    try {
        // Forward the request to the hidden Google Apps Script URL
        const googleResponse = await fetch(GOOGLE_WEB_APP_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' }, // Apps Script requires text/plain
            body: JSON.stringify({
                action: 'saveCodeToDrive',
                filename: filename,
                fileBase64: fileBase64,
                folderId: folderId
            })
        });

        // Get raw text first to prevent JSON parse crashes
        const textResponse = await googleResponse.text(); 
        
        try {
            // Attempt to parse it as JSON
            const data = JSON.parse(textResponse);
            res.json(data); 
        } catch (parseError) {
            console.error("Google Apps Script returned an HTML Error Page instead of JSON. Output:", textResponse);
            res.status(500).json({ status: 'error', message: 'Google Apps Script failed to respond properly. Check your New Deployment.' });
        }
        
    } catch (error) {
        console.error("Drive Upload Error:", error);
        res.status(500).json({ status: 'error', message: 'Internal server error while connecting to Google Drive.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Secured SystemVerilog Compilation Server (v12) running on port ${PORT}`);
});