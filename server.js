const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');

const app = express();
app.use(cors()); 
app.use(express.json());

app.post('/run', (req, res) => {
    const code = req.body.code;
    
    if (!code) {
        return res.status(400).json({ error: "No Verilog code provided." });
    }

    // Create a unique temporary directory for this student's execution
    const runId = Date.now().toString() + Math.floor(Math.random() * 1000);
    const runDir = path.join('/tmp', runId);
    fs.mkdirSync(runDir, { recursive: true });

    // IMPORTANT: Save as .sv so the compiler natively treats it as SystemVerilog
    const filePath = path.join(runDir, 'design.sv');
    const outPath = path.join(runDir, 'sim.vvp');

    // 1. Save the student's code to a file
    fs.writeFileSync(filePath, code);

    // 2. Compile the code using Icarus Verilog v12 (-g2012)
    exec(`iverilog -g2012 -o ${outPath} ${filePath}`, { timeout: 10000 }, (compileErr, compileStdout, compileStderr) => {
        if (compileErr) {
            fs.rmSync(runDir, { recursive: true, force: true });
            return res.json({ status: "error", output: compileStderr || compileErr.message });
        }

        // 3. Run the compiled simulation using VVP
        exec(`vvp ${outPath}`, { timeout: 10000 }, (runErr, runStdout, runStderr) => {
            
            // NEW: Look for a generated .vcd file BEFORE we clean up the directory
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

            // Clean up the temporary files
            fs.rmSync(runDir, { recursive: true, force: true });

            if (runErr) {
                return res.json({ status: "error", output: runStderr || runErr.message });
            }

            // Send terminal output AND the VCD string back to the portal
            return res.json({ status: "success", output: runStdout, vcd: vcdData });
        });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`SystemVerilog Compilation Server (v12) running on port ${PORT}`);
});