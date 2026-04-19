const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config({ path: './mini-miles/.env' });

async function list() {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY_1 || process.env.GEMINI_API_KEY);
    // There is no direct listModels in the client class in some versions, 
    // but we can try to fetch them via the GoogleGenAI or use a known list.
    // However, the error message literally suggested calling ListModels.
    // In @google/generative-ai, this is usually on the genAI instance or just models we can trial.
    
    console.log('Testing gemini-1.5-flash-latest...');
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
    const res = await model.generateContent('Hi');
    console.log('Success with gemini-1.5-flash-latest');
    
    console.log('Testing gemini-2.0-flash-exp...');
    const model2 = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
    const res2 = await model2.generateContent('Hi');
    console.log('Success with gemini-2.0-flash-exp');

} catch (e) {
    console.log('Test failed:', e.message);
  }
}

list();
