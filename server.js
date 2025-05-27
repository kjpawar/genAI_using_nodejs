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
const cloudinary = require('cloudinary').v2;
const { v4: uuidv4 } = require('uuid');

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

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Updated document query detection function
function isDocumentQuery(message) {
  // const docKeywords = ['meeting', 'minutes', 'mom', 'document', 'project'];
  // return docKeywords.some(keyword => message.toLowerCase().includes(keyword));
  const lowerMsg = message.toLowerCase();
  
  // More specific document-related phrases
  const docPhrases = [
    'who was present',
    'attendees of',
    'meeting minutes',
    'client review',
    'what was discussed',
    'decisions made',
    'action items',
    'present at',
    'participants in'
  ];

  // Additional checks for meeting/document context
  const hasMeetingContext = lowerMsg.includes('meeting') || 
                          lowerMsg.includes('review') ||
                          lowerMsg.includes('discussion');

  return docPhrases.some(phrase => lowerMsg.includes(phrase)) || 
         (hasMeetingContext && !lowerMsg.includes('chart'));
}


// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post("/chat", async (req, res) => {
  try {
    const { messages } = req.body;
    const userPrompt = messages[messages.length - 1].content;
    
    // Check for chart request first (highest priority)
    if (userPrompt.toLowerCase().includes("chart") || 
        userPrompt.toLowerCase().includes("graph") ||
        userPrompt.toLowerCase().includes("visualize")) {
   const sqlQuery = await getChatCompletion(messages, true);
      const dbResult = await runSqlQuery(sqlQuery);

      // Determine chart type based on data characteristics
      const suggestedChartType = suggestChartType(dbResult.rows);
      
      const chartData = {
        labels: [],
        datasets: [{
          label: 'Data Distribution',
          data: [],
          backgroundColor: generateColors(dbResult.rows.length),
          borderColor: '#333',
          borderWidth: 1
        }],
        x_label: dbResult.fields[0].name || 'Category',
        y_label: dbResult.fields[1].name || 'Value',
        suggestedChartType: suggestedChartType
      };

      // Process data
      dbResult.rows.forEach(row => {
        chartData.labels.push(String(row[dbResult.fields[0].name] || row[0]));
        chartData.datasets[0].data.push(Number(row[dbResult.fields[1].name] || row[1]));
      });

      // Calculate percentages
      const total = chartData.datasets[0].data.reduce((a, b) => a + b, 0);
      chartData.percentages = chartData.datasets[0].data.map(
        value => ((value / total) * 100).toFixed(1) + '%'
      );

      return res.json({
        sql_query: sqlQuery,
        chart_data: chartData,
        error: false
      });
    }
  
 
    // Then check for document query
    else if (isDocumentQuery(userPrompt)) {
      const projectMatch = userPrompt.match(/website redesign project|project\s+\w+/i);
      const dateMatch = userPrompt.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\b/i);
      
      const client = await pool.connect();
      try {
        let query;
        let params = [];
        
        if (projectMatch && dateMatch) {
          query = `SELECT * FROM documents 
                   WHERE name ILIKE $1 AND name ILIKE $2
                   ORDER BY created_at DESC LIMIT 1`;
          params = [`%${projectMatch[0]}%`, `%${dateMatch[0]}%`];
        } else if (projectMatch) {
          query = `SELECT * FROM documents 
                   WHERE name ILIKE $1
                   ORDER BY created_at DESC LIMIT 1`;
          params = [`%${projectMatch[0]}%`];
        } else if (dateMatch) {
          query = `SELECT * FROM documents 
                   WHERE name ILIKE $1 AND name ILIKE $2
                   ORDER BY created_at DESC LIMIT 1`;
          params = [`%meeting%`, `%${dateMatch[0]}%`];
        } else {
          query = `SELECT * FROM documents 
                   WHERE name ILIKE $1
                   ORDER BY created_at DESC LIMIT 1`;
          params = [`%meeting%`];
        }

        const result = await client.query(query, params);
        const document = result.rows[0];

        if (!document) {
          let errorMsg = "No meeting minutes found";
          if (projectMatch) errorMsg += ` for ${projectMatch[0]}`;
          if (dateMatch) errorMsg += ` on ${dateMatch[0]}`;
          return res.json({ error: true, human_answer: errorMsg });
        }

        const docDateMatch = document.name.match(/(\d{4}-\d{2}-\d{2})|(\w+\s+\d{1,2},\s+\d{4})/);
        const docDate = docDateMatch ? docDateMatch[0] : "unknown date";

        const prompt = `
          Meeting Minutes Document: ${document.name}
          Content URL: ${document.url}
          
          User Question: "${userPrompt}"
          
          Provide ONLY the exact information requested in the question.
          Do not include any additional summaries or sections.
          Be concise and directly answer the question.
        `;

        const genResult = await model.generateContent(prompt);
        const response = await genResult.response;
        
        return res.json({
          error: false,
          human_answer: response.text(),
          document_info: {
            name: document.name,
            date: docDate,
            project: projectMatch ? projectMatch[0] : "General Meeting"
          }
        });
      } finally {
        client.release();
      }
    }
    
  //     try {
  //   const projectMatch = userPrompt.match(/(e[\s-]?commerce|website|platform)\s+\w*/i) || 
  //                      userPrompt.match(/project\s+\w+/i);
    
  //   // Improved date matching that handles multiple formats
  //   const dateMatch = userPrompt.match(
  //     /(\d{4}-\d{2}-\d{2})|(\w+\s+\d{1,2},\s+\d{4})|(\d{1,2}\/\d{1,2}\/\d{4})/i
  //   );

  //   const client = await pool.connect();
  //   try {
  //     let query = `SELECT * FROM documents WHERE `;
  //     let params = [];
  //     let conditions = [];
      
  //     if (projectMatch) {
  //       conditions.push(`name ILIKE $${params.length + 1}`);
  //       params.push(`%${projectMatch[0]}%`);
  //     }
      
  //     // Date condition (if found in query)
  //     if (dateMatch) {
  //       const dateStr = dateMatch[0];
  //       // Convert to ISO format for better matching
  //       const isoDate = new Date(dateStr).toISOString().split('T')[0];
  //       conditions.push(`(name ILIKE $${params.length + 1} OR created_at::date = $${params.length + 2})`);
  //       params.push(`%${dateStr}%`, isoDate);
  //     }
      
  //     // Always include meeting/review terms
  //     conditions.push(`(name ILIKE $${params.length + 1} OR name ILIKE $${params.length + 2})`);
  //     params.push('%meeting%', '%review%');
      
  //     query += conditions.join(' AND ') + ' ORDER BY created_at DESC LIMIT 1';
      
  //     const result = await client.query(query, params);
  //     const document = result.rows[0];

  //     if (!document) {
  //       let errorMsg = "No meeting documents found";
  //       if (projectMatch) errorMsg += ` for ${projectMatch[0]}`;
  //       if (dateMatch) errorMsg += ` on ${dateMatch[0]}`;
  //       return res.json({ error: true, human_answer: errorMsg });
  //     }

  //     // Improved prompt for meeting minutes
  //         const prompt = `
  //           Meeting Document: ${document.name}
  //           Content URL: ${document.url}
            
  //           Answer ONLY the following question:
  //           "${userPrompt}"
            
  //           Requirements:
  //           - List only names and roles if about attendees
  //           - Be specific and factual
  //           - Do not invent information
  //           - If unsure, say "not mentioned in the document"
  //         `;

  //         const genResult = await model.generateContent(prompt);
  //         const response = await genResult.response;
          
  //         return res.json({
  //           error: false,
  //           human_answer: response.text(),
  //           document_info: {
  //             name: document.name,
  //             project: projectMatch ? projectMatch[0] : "General Meeting"
  //           }
  //         });
  //   } finally {
  //     client.release();
  //   }
  // } catch (docError) {
  //   // Error handling
  //   console.error("Document processing error:", docError);
  //       return res.json({
  //         error: true,
  //         human_answer: "Failed to retrieve meeting information. Please try again later."
  //       });
  // }




      // const projectMatch = userPrompt.match(/website redesign project|project\s+\w+/i);
      // const dateMatch = userPrompt.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\b/i);
      
      // const client = await pool.connect();
      // try {
      //   let query;
      //   let params = [];
        
      //   if (projectMatch && dateMatch) {
      //     query = `SELECT * FROM documents 
      //              WHERE name ILIKE $1 AND name ILIKE $2
      //              ORDER BY created_at DESC LIMIT 1`;
      //     params = [`%${projectMatch[0]}%`, `%${dateMatch[0]}%`];
      //   } else if (projectMatch) {
      //     query = `SELECT * FROM documents 
      //              WHERE name ILIKE $1
      //              ORDER BY created_at DESC LIMIT 1`;
      //     params = [`%${projectMatch[0]}%`];
      //   } else if (dateMatch) {
      //     query = `SELECT * FROM documents 
      //              WHERE name ILIKE $1 AND name ILIKE $2
      //              ORDER BY created_at DESC LIMIT 1`;
      //     params = [`%meeting%`, `%${dateMatch[0]}%`];
      //   } else {
      //     query = `SELECT * FROM documents 
      //              WHERE name ILIKE $1
      //              ORDER BY created_at DESC LIMIT 1`;
      //     params = [`%meeting%`];
      //   }

      //   const result = await client.query(query, params);
      //   const document = result.rows[0];

      //   if (!document) {
      //     let errorMsg = "No meeting minutes found";
      //     if (projectMatch) errorMsg += ` for ${projectMatch[0]}`;
      //     if (dateMatch) errorMsg += ` on ${dateMatch[0]}`;
      //     return res.json({ error: true, human_answer: errorMsg });
      //   }

      //   const docDateMatch = document.name.match(/(\d{4}-\d{2}-\d{2})|(\w+\s+\d{1,2},\s+\d{4})/);
      //   const docDate = docDateMatch ? docDateMatch[0] : "unknown date";

      //   const prompt = `
      //     Meeting Minutes Document: ${document.name}
      //     Content URL: ${document.url}
          
      //     User Question: "${userPrompt}"
          
      //     Provide ONLY the exact information requested in the question.
      //     Do not include any additional summaries or sections.
      //     Be concise and directly answer the question.
      //   `;

      //   const genResult = await model.generateContent(prompt);
      //   const response = await genResult.response;
        
      //   return res.json({
      //     error: false,
      //     human_answer: response.text(),
      //     document_info: {
      //       name: document.name,
      //       date: docDate,
      //       project: projectMatch ? projectMatch[0] : "General Meeting"
      //     }
      //   });
      // } finally {
      //   client.release();
      // }
    
    // Otherwise handle as regular SQL query
    else {
      const sqlQuery = await getChatCompletion(messages, false);
      const dbResult = await runSqlQuery(sqlQuery);
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
      human_answer: `Error processing request: ${error.message}`
    });
  }
});
// Helper function to suggest chart type
function suggestChartType(rows) {
  // If we have date-like data in first column, suggest line chart
  const firstValue = rows[0][0];
  if (isDateLike(firstValue)) {
    return 'line';
  }
  
  // If we have 5 or fewer categories, suggest pie chart
  if (rows.length <= 5) {
    return 'pie';
  }
  
  // Default to bar chart
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

// [Rest of your existing routes and helper functions remain the same...]
// (upload-dataset, training-status, upload-document, etc.)



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



// Add this route for document uploads
app.post('/upload-document', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Upload to Cloudinary in the Documents folder
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'Assets/Documents',
      resource_type: 'auto',
      public_id: req.file.originalname
    });

    // Store metadata in PostgreSQL
    const client = await pool.connect();
    try {
      const docId = uuidv4();
      await client.query(
        'INSERT INTO documents (id, name, url, created_at) VALUES ($1, $2, $3, NOW())',
        [docId, req.file.originalname, result.secure_url]
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

    // Clean up the uploaded file
    await fs.remove(req.file.path);
  } catch (error) {
    console.error('Document upload error:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});


// Helper functions
async function runSqlQuery(sqlQuery) {
  const client = await pool.connect();
  try {
    return await client.query(sqlQuery);
  } finally {
    client.release();
  }
}

async function convertToHumanReadable(userPrompt, dbResult) {
  try {
    if (!dbResult.rows.length) {
      return "No matching records found in the database.";
    }

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

Response:
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Human readable conversion error:', error);
    return "Here are the results from your query:\n" + 
           dbResult.rows.map(row => Object.values(row).join(', ')).join('\n');
  }
}

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
  
  const PORT = process.env.PORT || 8000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
})();
