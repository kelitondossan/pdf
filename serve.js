const express = require('express');
const cors = require('cors');
const app = express();
const fs = require('fs');
const PDFParser = require('pdf-parse');
const path = require('path');
const mysql = require('mysql2');
const PDFExtract = require('pdf.js-extract').PDFExtract;

class Pdf {
  static async getPDFText(source) {
    const pdfData = await PDFParser(source);
    return pdfData.text;
  }
}

app.use(cors());
app.use(express.json());

app.get('/ping', (req, res) => res.send('pong'));
const pdfExtract = new PDFExtract();
const options = {};

// Rota para extrair dados específicos do PDF e enviar para o frontend
// Rota para extrair dados específicos do PDF e enviar para o frontend
app.get('/file/:filename', async (req, res) => {
  const folderPath = path.join(__dirname, 'Faturas');
  const filePath = path.join(folderPath, req.params.filename);

  if (!fs.existsSync(filePath)) {
    res.status(404).send('Arquivo não encontrado');
    return;
  }

  const fileBuffer = fs.readFileSync(filePath);

  pdfExtract.extractBuffer(fileBuffer, options, (err, data) => {
    if (err) {
      return res.status(500).send('Erro ao extrair texto do PDF');
    }

    const pdfText = data.pages.map((page) => page.content.map((item) => item.str).join(' ')).join('\n');
    console.log('Texto completo do PDF:', pdfText);

    // Mova a chamada da função para cá
    extractDataFromPdf(pdfText);

    res.json({ filename: req.params.filename, pdfText });
  });
});

function extractDataFromPdf(pdfText) {
  const data = {};

  const numeroClienteMatch = pdfText.match(/Nº DO CLIENTE\s*:\s*(\d+)/i);
  if (numeroClienteMatch) {
    data.numeroCliente = numeroClienteMatch[1].trim();
  }

  const referenciaMatch = pdfText.match(/Referente a\s*:\s*(\w+\/\d+)/i);
  if (referenciaMatch) {
    data.referencia = referenciaMatch[1].trim();
  }

  const valoresFaturadosMatch = pdfText.match(/Valores Faturados([\s\S]*?)TOTAL([\s\S]*?)Histórico de Consumo/i);
  if (valoresFaturadosMatch) {
    const valoresFaturadosText = valoresFaturadosMatch[1];
    const valoresFaturadosLines = valoresFaturadosText.split('\n');

    for (const line of valoresFaturadosLines) {
      const columns = line.split(/\s{2,}/);

      if (columns.length === 5) {
        const itemName = columns[0].trim();
        const quantity = parseFloat(columns[1]);
        const unitPrice = parseFloat(columns[2]);
        const total = parseFloat(columns[3]);
        const taxes = parseFloat(columns[4]);

        data[itemName] = { quantity, unitPrice, total, taxes };
      }
    }
  }

  const historicoConsumoMatch = pdfText.match(/Histórico de Consumo([\s\S]*?)Reservado ao Fisco/i);
  if (historicoConsumoMatch) {
    const historicoConsumoText = historicoConsumoMatch[1];
    const historicoConsumoLines = historicoConsumoText.split('\n');

    for (const line of historicoConsumoLines) {
      const columns = line.split(/\s+/);

      if (columns.length === 4) {
        const mesAno = columns[0].trim();
        const consKwh = parseInt(columns[1], 10);

        data.historicoConsumo = data.historicoConsumo || {};
        data.historicoConsumo[mesAno] = consKwh;
      }
    }
  }

  return data;
}


app.get('/file/:filename', async (req, res) => {
  const folderPath = path.join(__dirname, 'Faturas');
  const filePath = path.join(folderPath, req.params.filename);

  if (!fs.existsSync(filePath)) {
    res.status(404).send('Arquivo não encontrado');
    return;
  }

  const fileBuffer = fs.readFileSync(filePath);

  pdfExtract.extractBuffer(fileBuffer, options, (err, data) => {
    if (err) {
      return res.status(500).send('Erro ao extrair texto do PDF');
    }

    const pdfText = data.pages.map((page) => page.content.map((item) => item.str).join(' ')).join('\n');
    console.log('Texto completo do PDF:', pdfText);

    // Chame a função para extrair informações relevantes
    const extractedData = extractDataFromPdf(pdfText);

    res.json({ filename: req.params.filename, pdfText, extractedData });
  });
});



app.get('/files', (req, res) => {
  const folderPath = path.join(__dirname, 'Faturas');
  const files = fs.readdirSync(folderPath).filter(file => file.endsWith('.pdf'));
  res.json(files);
});

app.get('/index.html', (req, res) => {
    const indexPath = path.join(__dirname, 'index.html');
    res.sendFile(indexPath);
  });


 // Rota para inserir os dados no banco de dados MySQL
app.post('/insert-data', async (req, res) => {
  const pdfData = req.body.pdfData;
  console.log('Dados do PDF:', pdfData);


  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: 'faturas',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  try {
    // Estabelecer a conexão com o banco de dados
    const connection = pool.promise();

    // Inserir os dados na tabela items_fatura
    await connection.query('INSERT INTO items_fatura (pdf_data) VALUES (?)', [pdfData]);
    const [result] = await connection.query('INSERT INTO pdf_texts (pdf_data) VALUES (?)', [pdfData]);

    // Obter o ID do registro inserido
    const pdfTextId = result.insertId;
    console.log('Dados inseridos no banco de dados com sucesso.');
    res.status(200).send('Dados inseridos no banco de dados com sucesso');
  } catch (error) {
    console.error('Erro ao inserir dados no banco de dados:', error);
    res.status(500).send('Erro ao inserir dados no banco de dados');
  } finally {
    // Fechar a conexão com o banco de dados
    pool.end();
  }
});

const PORT = 3333;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
