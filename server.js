require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const multer = require('multer');
const crypto = require('crypto');
const { getChatCompletion, addTrainingExamples, loadTrainingExamples, fetchTableStructure } = require('./gemini-sdk');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const cloudinary = require('cloudinary').v2;
const { v4: uuidv4 } = require('uuid');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const textract = require('textract');
const xlsx = require('xlsx');
const fs = require('fs-extra');
const WebSocket = require('ws');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Create HTTP server for WebSocket
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('New WebSocket client connected');

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received WebSocket message:', data);

      if (data.type === 'chat') {
        const { messages } = data;
        const userPrompt = messages[messages.length - 1].content;
        
        let response;
        if (userPrompt.toLowerCase().includes("chart") || 
            userPrompt.toLowerCase().includes("graph") ||
            userPrompt.toLowerCase().includes("visualize")) {
          response = await handleChartRequest(messages, userPrompt);
        } 
        else if (isDocumentQuery(userPrompt)) {
          response = await handleDocumentRequest(userPrompt);
        }
        else {
          response = await handleRegularQuery(messages, userPrompt);
        }
        
        ws.send(JSON.stringify(response));
      }
    } catch (error) {
      console.error('WebSocket error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: true,
        message: error.message
      }));
    }
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

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

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Document query detection
function isDocumentQuery(message) {
  const lowerMsg = message.toLowerCase();
  const docPhrases = [
    'meeting minutes', 'who was present', 'attendees of', 
    'what was discussed', 'decisions made', 'action items',
    'present at', 'participants in', 'summary of', 'key points','meeting',
    'document about', 'notes from', 'client review','minutes of meeting', 'mom', 'meeting notes',
    'follow-ups', 'blockers', 'decisions made', 'next steps',
    'risks identified', 'accountability', 'progress update'
  ];

  return docPhrases.some(phrase => lowerMsg.includes(phrase)) || 
         /(meeting|review|discussion|minutes)\s+(for|about|on)/i.test(message);       
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// HTTP Chat endpoint (kept for compatibility)
app.post("/chat", async (req, res) => {
  try {
    const { messages } = req.body;
    const userPrompt = messages[messages.length - 1].content;
    
    if (userPrompt.toLowerCase().includes("chart") || 
        userPrompt.toLowerCase().includes("graph") ||
        userPrompt.toLowerCase().includes("visualize")) {
      const response = await handleChartRequest(messages, userPrompt);
      return res.json(response);
    } 
    else if (isDocumentQuery(userPrompt)) {
      const response = await handleDocumentRequest(userPrompt);
      return res.json(response);
    }
    else {
      const response = await handleRegularQuery(messages, userPrompt);
      return res.json(response);
    }
  } catch (error) {
    console.error("Chat error:", error);
    return res.status(500).json({
      error: true,
      message: error.message,
      human_answer: `Error processing request: ${error.message}`
    });
  }
});

// Request handlers
async function handleChartRequest(messages, userPrompt) {
  const sqlQuery = await getChatCompletion(messages, true);
  const dbResult = await runSqlQuery(sqlQuery);
  const suggestedChartType = suggestChartType(dbResult.rows);
  
  const chartData = {
    labels: [],
    datasets: [{
      label: 'Data Distribution',
      data: []
    }],
    backgroundColor: generateColors(dbResult.rows.length),
    borderColor: '#333',
    borderWidth: 1,
    x_label: dbResult.fields[0].name || 'Category',
    y_label: dbResult.fields[1].name || 'Value',
    suggestedChartType: suggestedChartType
  };

  dbResult.rows.forEach(row => {
    chartData.labels.push(String(row[dbResult.fields[0].name] || row[0]));
    chartData.datasets[0].data.push(Number(row[dbResult.fields[1].name] || row[1]));
  });

  const total = chartData.datasets[0].data.reduce((a, b) => a + b, 0);
  chartData.percentages = chartData.datasets[0].data.map(
    value => ((value / total) * 100).toFixed(1) + '%'
  );
  
  await storeChatHistory(
    userPrompt,
    JSON.stringify(chartData),
    sqlQuery
  );

  return {
    type: 'chart',
    sql_query: sqlQuery,
    chart_data: chartData,
    error: false
  };
}

async function handleDocumentRequest(userPrompt) {
  const projectName = extractProjectName(userPrompt);
  const dateMatch = userPrompt.match(/\b\d{4}-\d{2}-\d{2}\b/) || 
    userPrompt.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/i);
  const client = await pool.connect();
  
  try {
    let query;
    let params=[];
    if (projectName && dateMatch) {
      query = `SELECT * FROM documents WHERE name ILIKE $1 AND name ILIKE $2 ORDER BY created_at DESC LIMIT 3`;
      params = [`%${projectName}%`, `%${dateMatch[0]}%`];
    } 
    else if (projectName) {
      query = `SELECT * FROM documents WHERE name ILIKE $1 ORDER BY SIMILARITY(name, $2) DESC, created_at DESC LIMIT 3`;
      params = [`%${projectName}%`, `${projectName}-%`];
    }
    else if (dateMatch) {
      query = `SELECT * FROM documents WHERE name ILIKE $1 ORDER BY created_at DESC LIMIT 3`;
      params = [`%${dateMatch[0]}%`];
    }
    else {
      query = `SELECT * FROM documents WHERE name ILIKE '%MEETING%' OR name ILIKE '%MOM%' ORDER BY created_at DESC LIMIT 3`;
    }

    const result = await client.query(query, params);

    if (!result.rows.length) {
      let errorMsg = "No meeting minutes found";
      if (projectName) errorMsg += ` for "${projectName}"`;
      if (dateMatch) errorMsg += ` on ${dateMatch[0]}`;
      
      return {
        type: 'error',
        error: true,
        human_answer: errorMsg
      };
    } else {
      const documentResponses = await processDocuments(result.rows, userPrompt);
      await storeChatHistory(
        userPrompt,
        JSON.stringify(documentResponses.map(r => r.answer)),
        null,
        JSON.stringify(documentResponses.map(r => r.document_info))
      );
      
      return {
        type: 'document',
        error: false,
        answers: documentResponses
      };
    }
  } catch (error) {
    console.error("Document processing error:", error);
    return {
      type: 'error',
      error: true,
      message: "Failed to process documents",
      details: error.message
    };
  } finally {
    client.release();
  }
}

async function handleRegularQuery(messages, userPrompt) {
  const sqlQuery = await getChatCompletion(messages, false);
  const dbResult = await runSqlQuery(sqlQuery);
  const humanAnswer = await convertToHumanReadable(userPrompt, dbResult);
  
  await storeChatHistory(
    userPrompt,
    humanAnswer,
    sqlQuery
  );
  
  return {
    type: 'sql',
    sql_query: sqlQuery,
    db_result: dbResult,
    human_answer: humanAnswer,
    error: false
  };
}

// Additional routes and functions
app.get('/chat-history', async (req, res) => {
  try {
    const { limit = 100, offset = 0, search = '' } = req.query;
    const client = await pool.connect();
    
    try {
      let query = `SELECT * FROM chat_history`;
      let params = [];
      
      if (search) {
        query += ` WHERE user_question ILIKE $1 OR bot_answer ILIKE $1`;
        params.push(`%${search}%`);
      }
      
      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(parseInt(limit), parseInt(offset));
      
      const result = await client.query(query, params);
      
      res.json({
        history: result.rows,
        count: result.rowCount
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ error: "Failed to fetch chat history" });
  }
});

function extractProjectName(query) {
  const withoutDates = query.replace(
    /\b\d{4}-\d{2}-\d{2}\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/gi,
    ''
  ).trim();

  const cleanedQuery = withoutDates
    .replace(/[^\w\s-]/g, '')
    .replace(/\b(what|who|when|where|why|how|was|were|did|does|meeting|mom|review|discussion|minutes)\b/gi, '')
    .trim();

  const patterns = [
    /([A-Za-z0-9-]+)(?=\s+(?:meeting|mom|review|discussion))/i,
    /(?:at|in|for)\s+([A-Za-z0-9-]+)(?=\s|$)/i,
    /\b([A-Za-z0-9-]{3,})\b/i
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(cleanedQuery);
    if (match && match[1]) {
      const potentialName = match[1];
      if (!potentialName.match(/\d{4}/)) {
        return potentialName
          .replace(/\s+/g, '-')
          .toUpperCase();
      }
    }
  }

  return null;
}

async function storeChatHistory(question, answer, sqlQuery = null, documentReferences = null) {
  const client = await pool.connect();
  try {
    const answerString = typeof answer === 'object' ? JSON.stringify(answer) : answer;
    
    await client.query(
      `INSERT INTO chat_history 
       (user_question, bot_answer, sql_query, document_references) 
       VALUES ($1, $2, $3, $4)`,
      [question, answerString, sqlQuery, documentReferences]
    );
  } catch (error) {
    console.error("Error storing chat history:", error);
  } finally {
    client.release();
  }
}

function preprocessDocumentName(name) {
  return name
    .replace(/_/g, '-')
    .replace(/\s+/g, '-')
    .toLowerCase();
}

function suggestChartType(rows) {
  const firstValue = rows[0][0];
  if (isDateLike(firstValue)) {
    return 'line';
  }
  
  if (rows.length <= 5) {
    return 'pie';
  }
  
  return 'bar';
}

function isDateLike(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) || 
         /^\w+ \d{1,2}, \d{4}$/.test(value) ||
         /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value);
}

function generateColors(count) {
  const colors = [];
  const hueStep = 360 / count;
  for (let i = 0; i < count; i++) {
    colors.push(`hsl(${i * hueStep}, 70%, 60%)`);
  }
  return colors;
}

async function extractDocumentText(documentUrl) {
  try {
    let buffer;
    
    if (documentUrl.startsWith('file://')) {
      buffer = await fs.readFile(documentUrl.replace('file://', ''));
    } else {
      const response = await fetch(documentUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const arrayBuffer = await response.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    }

    const ext = documentUrl.split('.').pop().toLowerCase();
    
    switch (ext) {
      case 'pdf':
        const pdfData = await pdf(buffer);
        return pdfData.text;
        
      case 'docx':
      case 'doc':
        const { value } = await mammoth.extractRawText({ buffer });
        return value;
        
      case 'xlsx':
      case 'xls':
        const workbook = xlsx.read(buffer, { type: 'buffer' });
        return workbook.SheetNames.map(sheet => 
          xlsx.utils.sheet_to_csv(workbook.Sheets[sheet])
        ).join('\n\n');
        
      case 'txt':
      case 'csv':
        return buffer.toString('utf8');
        
      default:
        return buffer.toString('utf8');
    }
  } catch (error) {
    console.error("Text extraction failed:", error);
    return null;
  }
}

async function processDocuments(documents, userPrompt) {
  const responses = [];
  
  for (const doc of documents) {
    const docText = await extractDocumentText(doc.url);
    if (!docText) continue;

    let prompt;
    if (/who attended|present/i.test(userPrompt)) {
      prompt = `EXTRACT ATTENDEES ONLY from:\n${docText.substring(0, 15000)}`;
    } else if (/action items|next steps/i.test(userPrompt)) {
      prompt = `LIST ACTION ITEMS from:\n${docText.substring(0, 15000)}`;
    } else {
      prompt = `ANSWER this question: "${userPrompt}" using:\n${docText.substring(0, 15000)}`;
    }

    const result = await model.generateContent(prompt);
    
    responses.push({
      answer: result.response.text(),
      document_info: {
        name: doc.name,
        url: doc.url
      }
    });
  }
  return responses;
}

app.post('/upload-dataset', upload.single('file'), async (req, res) => {
  try {
    const content = await fs.readFile(req.file.path, 'utf8');
    const data = JSON.parse(content);
    const normalized = JSON.stringify(data);
    const hash = crypto.createHash('md5').update(normalized).digest('hex');
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

async function runSqlQuery(sqlQuery) {
  const client = await pool.connect();
  try {
    if (sqlQuery.toLowerCase().includes('this') || 
        sqlQuery.toLowerCase().includes('that') ||
        !sqlQuery.trim().startsWith('SELECT')) {
      throw new Error('Invalid SQL query generated');
    }
    
    console.log("Executing SQL:", sqlQuery);
    const result = await client.query(sqlQuery);
    return result;
  } catch (error) {
    console.error("SQL Error:", {
      query: sqlQuery,
      error: error.message
    });
    throw new Error(`Database error: ${error.message}`);
  } finally {
    client.release();
  }
}

app.post('/upload-document', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'Assets/Documents',
      resource_type: 'auto',
      public_id: req.file.originalname
    });

    const client = await pool.connect();
    try {
      const docId = uuidv4();
      const standardizedName = preprocessDocumentName(req.file.originalname);
      await client.query(
        'INSERT INTO documents (id, name, url, created_at) VALUES ($1, $2, $3, NOW())',
        [docId, standardizedName, result.secure_url]
      );
    
      res.json({
        success: true,
        document: {
          id: docId,
          name: req.file.originalname,
          url: result.secure_url
        }
      });
    } finally {
      client.release();
    }

    await fs.remove(req.file.path);
  } catch (error) {
    console.error('Document upload error:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

async function convertToHumanReadable(userPrompt, dbResult) {
  try {
    if (!dbResult.rows.length) {
      return "No matching records found in the database.";
    }

    const dataSummary = {
      columns: dbResult.fields.map(f => f.name),
      sampleRows: dbResult.rows.slice(0, 10).map(row => Object.values(row)),
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

Response:
`;

// const prompt = `
// User Question: "${userPrompt}"

// Complete Database Results:
// - Columns: ${dataSummary.columns.join(', ')}
// - Total Records: ${dataSummary.totalCount}
// - All Data Rows: ${JSON.stringify(dbResult.rows)}

// Strict Instructions:
// 1. Present ALL results exactly as they appear in the data
// 2. Never suggest any data is missing unless the results array is empty
// 3. Format lists with all items numbered
// 4. Include the exact total count
// 5. If No Additional Insights provided then dont show "Additional Insights:"
// 5. Follow this exact structure:

// [Concise answer to the question]
// 1. [First item]
// 2. [Second item]
// ...
// [Total count] items total
// "Additional Insights:" [Optional analysis]

// Example:
// These employees work in Pune:
// "Complete Results:"
// 1. girish
// 2. Satyam
// 3. shivam
// 4. Payal
// 4 employees total
// "Additional Insights:" The team includes 3 developers and 1 manager.

// Now generate the response for the current query:
// `;


    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Human readable conversion error:', error);
    return "Here are the results from your query:\n" + 
           dbResult.rows.map(row => Object.values(row).join(', ')).join('\n');
  }
}

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
  
  const PORT = process.env.PORT || 8000;
  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`WebSocket server running on ws://localhost:${PORT}`);
  });
})();



