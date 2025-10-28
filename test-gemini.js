const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function testGemini() {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);
  
  console.log('Testing Gemini models...\n');
  
  // Test different model names
  const modelsToTry = [
    'gemini-pro',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest'
  ];
  
  for (const modelName of modelsToTry) {
    try {
      console.log(`\nTrying model: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent('Say hello');
      const response = await result.response;
      const text = response.text();
      console.log(`✅ SUCCESS! Model works: ${modelName}`);
      console.log(`Response: ${text.substring(0, 50)}...\n`);
      break;
    } catch (error) {
      console.log(`❌ Failed: ${error.message}`);
    }
  }
}

testGemini();