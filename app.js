const express = require('express');
const { DataAPIClient } = require('@datastax/astra-db-ts');
const cors = require('cors');
const app = express();
require('dotenv').config();

const OpenAI = require('openai');
const openai = new OpenAI({
  apiKey:process.env.OPENAI_API_KEY })

  const client = new DataAPIClient(
    process.env.ASTRA_DB_APPLICATION_TOKEN
  );
  const db = client.db(
    process.env.ASTRA_ENDPOINT,
    {
      namespace: process.env.ASTRA_NAMESPACE,
    }
  );

app.use(cors());
app.use(express.json());

app.post('/api/insert', async (req, res) => {
  try {
    const collection = db.collection('co_pilot_guidance_data');
    await collection.insertOne(req.body);
    res.status(200).send('Document inserted successfully');
  } catch (error) {
    console.error('Error inserting document:', error);
    res.status(500).send('Error inserting document');
  }
});

app.get('/api/find', async (req, res) => {
  try {
    const query = req.query.query || 'What are the water-related disclosures in the BRSR?';
    const similarIdeas = await generateChatResponse(query);
    res.status(200).json({ results: similarIdeas });
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).send('Error fetching documents');
  }
});

async function vectorizeText(text) {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-ada-002', // Specify the embedding model
      input: text,
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('Error vectorizing text:', error);
    throw error;
  }
}

async function fetchSimilarIdeas(query) {
  try {
    const inputVector = await vectorizeText(query);
    const collection = db.collection('co_pilot_guidance_data');

    const documents = await collection.find({}).toArray();

    const results = documents.map((doc) => {
      const similarity = cosineSimilarity(inputVector, doc.vector);
      return { content: doc.content, similarity };
    });

    results.sort((a, b) => b.similarity - a.similarity);

    return results.slice(0, 5);
  } catch (error) {
    console.error('Error fetching similar ideas:', error);
    throw error;
  }
}

function cosineSimilarity(vectorA, vectorB) {
  const dotProduct = vectorA.reduce((sum, val, i) => sum + val * vectorB[i], 0);
  const magnitudeA = Math.sqrt(vectorA.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(vectorB.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}

async function generateChatResponse(query) {
  try {
    const relevantDocs = await fetchSimilarIdeas(query);

    const documentContent = relevantDocs
      .map((doc, index) => `${index + 1}. ${doc.content}`)
      .join('\n\n');

    const prompt = `
      Extract and summarize key information from the document. The database contains the relevant information to answer the question asked.

      Relevant Content:
      ${documentContent || 'No relevant documents found.'}

      Question:
      ${query}

      Please provide a detailed and accurate answer based on the available content.
    `;

    const response = await openai.createCompletion({
      model: 'text-davinci-003',
      prompt: prompt,
      max_tokens: 1500,
      temperature: 0.7,
    });

    return response.data.choices[0].text.trim();
  } catch (error) {
    console.error('Error generating chat response:', error);
    throw error;
  }
}

const PORT = 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
