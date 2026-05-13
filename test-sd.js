// backend/test-sd.js
require('dotenv').config();
const imageService = require('./services/imageService');

async function testStableDiffusion() {
    console.log('🧪 Testing Stable Diffusion Integration...');

    if (!process.env.STABILITY_API_KEY) {
        console.error('❌ STABILITY_API_KEY is missing in .env');
        return;
    }

    const testScene = {
        id: 'test_1',
        visualDescription: 'A futuristic city with flying cars and green skyscrapers, sunny day',
        visualType: 'concept',
        narration: 'The city of the future is clean and efficient.'
    };

    try {
        console.log('Sending request to Stability AI...');
        const imagePath = await imageService.generateSingleImage(testScene);
        console.log('✅ Success! Image generated at:', imagePath);
    } catch (error) {
        console.error('❌ Failed:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
    }
}

testStableDiffusion();
