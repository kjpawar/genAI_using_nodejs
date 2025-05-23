require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs-extra');
const path = require('path');
const md5 = require('md5');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODEL_NAME = 'gemini-1.5-flash';
const EXAMPLES_DIR = 'training_examples';
const model = genAI.getGenerativeModel({ model: MODEL_NAME });

// Email configuration
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_SERVER,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

async function fetchTableStructure() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    const client = await pool.connect();
    let tableStructure = "You must assume the following PostgreSQL database schema:\n\nTables:\n";

    // Get tables
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema='public' AND table_type='BASE TABLE'
    `);
    
    for (const table of tablesRes.rows) {
      const tableName = table.table_name;
      tableStructure += `\n${tableName}\n`;

      // Get columns
      const columnsRes = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns 
        WHERE table_name = $1
      `, [tableName]);

      for (const column of columnsRes.rows) {
        tableStructure += `- ${column.column_name} (${column.data_type})\n`;
      }
    }

    // Check revenue (example) - with proper null handling
    let totalRevenue = 0;
    try {
      const revenueRes = await client.query(`
        SELECT SUM(quantity_sold * unit_price) AS total_revenue
        FROM sales_table;
      `);
      totalRevenue = parseFloat(revenueRes.rows[0]?.total_revenue) || 0;
    } catch (error) {
      console.log("Revenue check skipped - sales_table might not exist");
    }

    console.log(`Total Revenue: ${totalRevenue}`);

    // Send email if revenue is low
    if (totalRevenue < 20000) {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_TO,
        subject: "⚠️ Revenue Alert: Low Revenue Detected!",
        html: `
          <html>
          <body>
            <h2 style="color: red;">Revenue Alert 🚨</h2>
            <p>Dear Team,</p>
            <p>The total revenue has dropped below the threshold.</p>
            <p><strong>Current Revenue:</strong> $${totalRevenue.toFixed(2)}</p>
            <p>Please take immediate action.</p>
            <hr>
            <p style="font-size:12px;color:gray;">This is an automated message from the Financial Monitoring System.</p>
          </body>
          </html>
        `
      };

      await transporter.sendMail(mailOptions);
      console.log("✅ Alert Email sent successfully.");
    } else {
      console.log("✅ Revenue is healthy, no email sent.");
    }

    client.release();
    return tableStructure;
  } catch (error) {
    console.error("Error fetching table structure:", error);
    return "";
  } finally {
    await pool.end();
  }
}

async function loadTrainingExamples() {
  const examplesFile = path.join(EXAMPLES_DIR, 'examples.json');
  try {
    if (await fs.pathExists(examplesFile)) {
      return JSON.parse(await fs.readFile(examplesFile, 'utf8'));
    }
  } catch (error) {
    console.error("Error loading examples:", error);
  }
  return { natural_language: [], sql: [] };
}

async function saveTrainingExamples(examples) {
  const tempFile = path.join(EXAMPLES_DIR, 'temp_examples.json');
  const examplesFile = path.join(EXAMPLES_DIR, 'examples.json');
  
  try {
    await fs.writeFile(tempFile, JSON.stringify(examples, null, 2));
    await fs.move(tempFile, examplesFile, { overwrite: true });
  } catch (error) {
    console.error("Error saving examples:", error);
  }
}

async function addTrainingExamples(newNl, newSql) {
  const examples = await loadTrainingExamples();
  const existingHashes = {};
  examples.natural_language.forEach((nl, i) => {
    existingHashes[md5(nl)] = i;
  });

  let added = 0;
  for (let i = 0; i < newNl.length; i++) {
    const nl = newNl[i];
    const sql = newSql[i];
    const nlHash = md5(nl);
    
    if (!existingHashes.hasOwnProperty(nlHash)) {
      examples.natural_language.push(nl);
      examples.sql.push(sql);
      existingHashes[nlHash] = examples.natural_language.length - 1;
      added++;
    }
  }

  if (added > 0) {
    await saveTrainingExamples(examples);
  }
  return added;
}

async function getChatCompletion(messages, chartMode = false) {
  try {
    const userMessage = messages[messages.length - 1].content;
    const examples = await loadTrainingExamples();
    
    let prompt = `Database Expert Instructions:
${await fetchTableStructure()}

Recent Examples:
`;

    // Add most relevant examples
    const recentExamples = examples.natural_language.slice(-3);
    const recentSql = examples.sql.slice(-3);
    for (let i = 0; i < recentExamples.length; i++) {
      prompt += `\nQ: ${recentExamples[i]}\nA: ${recentSql[i]}\n`;
    }
    
    prompt += `
Rules:
- Generate precise PostgreSQL queries
- Use only the schema shown
- Never invent columns

${chartMode ? "CHART REQUEST: Return exactly 2 columns with clear aliases" : ""}

New Query:
Q: ${userMessage}
A: `;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    const sql = text.replace(/```sql|```/g, '').trim();
    return sql;
  } catch (error) {
    console.error("Generation error:", error);
    throw error;
  }
}

module.exports = {
  getChatCompletion,
  addTrainingExamples,
  loadTrainingExamples,
  fetchTableStructure,
  model
};