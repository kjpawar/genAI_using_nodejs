require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const { Pool } = require('pg');
const multer = require('multer');
const crypto = require('crypto');
const { getChatCompletion, addTrainingExamples, loadTrainingExamples, fetchTableStructure } = require('./gemini-sdk');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const app = express();
const upload = multer({ dest: 'uploads/' });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post("/chat", async (req, res) => {
  try {
    const { messages } = req.body;
    const userPrompt = messages[messages.length - 1].content;
    const chartMode = userPrompt.toLowerCase().includes("chart");

    const sqlQuery = await getChatCompletion(messages, chartMode);
    console.log("Generated SQL:", sqlQuery); // Debug log

    const dbResult = await runSqlQuery(sqlQuery);
    console.log("Database Result:", dbResult); // Debug log

    if (chartMode) {
      // Validate we have data
      if (!dbResult.rows || dbResult.rows.length === 0) {
        throw new Error("No data returned for chart");
      }

      // Extract column names (use aliases if available)
      const xCol = dbResult.fields[0].name;
      const yCol = dbResult.fields[1].name;

      const chartData = {
        x: dbResult.rows.map(row => row[xCol] || row[0]),
        y: dbResult.rows.map(row => row[yCol] || row[1]),
        x_label: xCol,
        y_label: yCol
      };

      console.log("Chart Data:", chartData); // Debug log

      return res.json({
        sql_query: sqlQuery,
        chart_data: chartData,
        error: false
      });
    } else {
      // ... rest of your non-chart code ...
      const humanAnswer = await convertToHumanReadable(userPrompt, dbResult);
      return res.json({
        sql_query: sqlQuery,
        db_result: dbResult,
        human_answer: humanAnswer,
        error: false
      });
    }
  } catch (error) {
    console.error("Chat error:", error);
    return res.status(500).json({
      error: true,
      message: error.message,
      human_answer: `Chart generation failed: ${error.message}`
    });
  }
});


app.post('/upload-dataset', upload.single('file'), async (req, res) => {
  try {
    const content = await fs.readFile(req.file.path, 'utf8');
    
    // Normalize JSON formatting
    const data = JSON.parse(content);
    const normalized = JSON.stringify(data);
    
    // Consistent hashing
    const hash = crypto.createHash('md5').update(normalized).digest('hex');
    
    // Check for existing content (case insensitive)
    const files = await fs.readdir('uploads');
    let exists = false;
    
    for (const file of files) {
      const fileContent = await fs.readFile(path.join('uploads', file), 'utf8');
      const fileHash = crypto.createHash('md5').update(fileContent).digest('hex');
      if (fileHash === hash) {
        exists = true;
        break;
      }
    }
    
    if (exists) {
      await fs.remove(req.file.path);
      return res.json({ 
        status: "exists",
        message: "Dataset already exists." 
      });
    }

    // Process new file
    const filename = `dataset_${Date.now()}.json`;
    await fs.writeFile(path.join('uploads', filename), normalized);
    const added = await addTrainingExamples(data.natural_language, data.sql);
    
    return res.json({
      status: "success",
      added: added,
      total_examples: (await loadTrainingExamples()).natural_language.length
    });

  } catch (error) {
    res.status(500).json({ 
      error: "Upload failed",
      details: error.message 
    });
  }
});

app.get('/training-status', async (req, res) => {
  try {
    const examples = await loadTrainingExamples();
    const stats = await fs.stat(path.join('training_examples', 'examples.json'));
    res.json({
      example_count: examples.natural_language.length,
      last_updated: stats.mtime.getTime() / 1000
    });
  } catch (error) {
    res.json({
      example_count: 0,
      last_updated: null
    });
  }
});

// Helper functions
async function runSqlQuery(sqlQuery) {
  const client = await pool.connect();
  try {
    const result = await client.query(sqlQuery);
    return result;
  } finally {
    client.release();
  }
}

async function convertToHumanReadable(userPrompt, dbResult) {
  try {
    if (!dbResult.rows.length) {
      return "No matching records found in the database.";
    }

    // Prepare data summary for Gemini
    const dataSummary = {
      columns: dbResult.fields.map(f => f.name),
      sampleRows: dbResult.rows.slice(0, 3).map(row => Object.values(row)),
      totalCount: dbResult.rows.length
    };

    const prompt = `
User Question: "${userPrompt}"

Database Query Results:
- Columns: ${dataSummary.columns.join(', ')}
- Total Records: ${dataSummary.totalCount}
- Sample Data: ${JSON.stringify(dataSummary.sampleRows)}

Please generate a concise but informative English response that:
1. Answers the user's question directly
2. Provides relevant insights from the data
3. Uses natural language (no SQL or technical jargon)
4. Highlights any interesting patterns if applicable

Example good response for employee salaries:
"The query found 12 employees earning more than $50,000. The highest paid employees are John Doe ($85,000) and Jane Smith ($78,000). Most high-earners work in the Engineering department."

Response:
`;

    // Get response from Gemini
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Human readable conversion error:', error);
    return "Here are the results from your query:\n" + 
           dbResult.rows.map(row => Object.values(row).join(', ')).join('\n');
  }
}

// async function convertToHumanReadable(userPrompt, dbResult) {
//   try {
//     if (!dbResult.rows.length) {
//       return "No results found.";
//     }

//     let rowsText = dbResult.rows.map(row => 
//       Object.values(row).join(', ')
//     ).join('\n');

//     const secondPrompt = `
// User asked: "${userPrompt}"

// Here is the SQL query result:
// ${rowsText}

// Based on the user's request and the SQL result, generate a human-readable answer.
// Do not show raw data.
// `;

//     // This would use the Gemini API to generate a response
//     // For now, we'll return a simple response
//     return `The query returned ${dbResult.rows.length} results.`;
//   } catch (error) {
//     console.error('Human readable error:', error);
//     return "Couldn't generate human readable answer.";
//   }
// }

// Cleanup old uploads
async function cleanupOldUploads(days = 1) {
  const cutoff = Date.now() - (days * 86400 * 1000);
  const files = await fs.readdir('uploads');
  for (const file of files) {
    const filePath = path.join('uploads', file);
    const stats = await fs.stat(filePath);
    if (stats.mtimeMs < cutoff) {
      await fs.remove(filePath);
    }
  }
}

// Initialize
(async () => {
  await fs.ensureDir('uploads');
  await fs.ensureDir('training_examples');
  await cleanupOldUploads();

  const PORT = process.env.PORT;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
})();