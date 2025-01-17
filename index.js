const express = require('express');
const { DataAPIClient } = require('@datastax/astra-db-ts');
const cors = require('cors');
const app = express();
require("dotenv").config()
app.use(cors());
app.use(express.json());

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

app.post('/api/insert', async (req, res) => {
  try {
    const collection = await db.collection('co_pilot_guidance_data');
    await collection.insertOne(req.body);
    res.status(200).send('Document inserted successfully');
  } catch (error) {
    console.error('Error inserting document:', error);
    res.status(500).send('Error inserting document');
  }
});

app.get('/api/find', async (req, res) => {
 
  try {
    // const collection = await db.collection('co_pilot_guidance_data');
    // const results = await collection.find({}).toArray();
// Vectorize the user's query
const inputVector = await vectorizeText(req.query.inputVector);

// Fetch similar ideas from the database
const similarIdeas = await fetchSimilarIdeas(inputVector);
    
    res.status(200).json({results:similarIdeas});
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).send('Error fetching documents');
  }
});

const PORT = 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
async function fetchSimilarIdeas(inputVector, limit = 2) {
  try {
    const collection = await db.collection('co_pilot_guidance_data');
    const cursor = collection.find({}, {
      vector: inputVector,
      includeSimilarity: true,
      limit,
    });

    const results = [];
    for await (const doc of cursor) {
      
      results.push({ idea: doc.content, similarity: doc.$similarity });
    }
    return results;
  } catch (error) {
    console.error('Error fetching data from Astra DB:', error);
    throw error;
  }
}


async function vectorizeText(text) {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-ada-002', // Specify the embedding model
      input: text,
    });

    // Extract and return the embedding vector
    return response.data[0].embedding;
  } catch (error) {
    console.error('Error vectorizing text:', error);
    throw error;
  }
}


// this function created in fronted
 async function generateChatResponse(query) {
  try {
    // Vectorize the user's query
    const inputVector = await vectorizeText(query);

    // Fetch similar ideas from the database
    const similarIdeas = await fetchSimilarIdeas(inputVector);

    // Format the response using ChatGPT
    const messages = [
      {
        role: 'system',
        content: 'You are a helpful assistant.',
      },
      {
        role: 'user',
        content: `User asked: "${query}". Here are the similar ideas fetched from the database:\n\n${similarIdeas
          .map(
            (idea, index) =>
              `${index + 1}. ${idea.idea} (Similarity: ${idea.similarity.toFixed(
                2
              )})`
          )
          .join('\n')}`,
      },
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: messages,
      max_tokens: 200,
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Error generating ChatGPT response:', error);
    throw error;
  }
}

