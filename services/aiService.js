// backend/services/aiService.js - GOOGLE GEMINI VERSION (FREE!) - FIXED

const { GoogleGenerativeAI } = require('@google/generative-ai');

class AIService {
  constructor() {
    if (!process.env.GOOGLE_GEMINI_API_KEY) {
      console.warn('⚠️  WARNING: GOOGLE_GEMINI_API_KEY not found.');
      this.genAI = null;
    } else {
      try {
        this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);
        // Try these in order until one works:
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
        console.log('✅ Google Gemini initialized successfully');
      } catch (error) {
        console.error('❌ Gemini initialization failed:', error.message);
        this.genAI = null;
      }
    }
  }

  /**
   * Research a topic using Google Gemini
   */
  async researchTopic(topic) {
    console.log(`🔍 Researching topic: ${topic}`);

    // If no API key, use simulation
    if (!this.genAI) {
      return this.simulateResearch(topic);
    }

    try {
      const prompt = `You are an expert educator and researcher. Research the topic: "${topic}".

Provide a JSON response with:
1. overview - A brief 2-3 sentence overview
2. keyPoints - Array of 5 key concepts that should be covered
3. difficulty - One of: "beginner", "intermediate", "advanced"
4. examples - Array of 3 real-world applications or examples

Respond ONLY with valid JSON, no markdown or extra text.`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      console.log('Raw Gemini response:', text);

      // Try to parse JSON response
      let research;
      try {
        // Remove markdown code blocks if present
        const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        research = JSON.parse(cleanText);
      } catch (e) {
        console.warn('Failed to parse JSON, extracting data...');
        // Fallback: extract JSON from text
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          research = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('Invalid AI response format');
        }
      }

      console.log('✅ Research completed with Gemini');

      return {
        topic,
        overview: research.overview || research.summary || `Educational content about ${topic}`,
        keyPoints: research.keyPoints || research.key_concepts || research.concepts || [],
        difficulty: research.difficulty || 'intermediate',
        examples: research.examples || research.applications || [],
        researchedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Gemini research error:', error.message);
      // Fallback to simulation if Gemini fails
      return this.simulateResearch(topic);
    }
  }

  /**
   * Analyze user-provided content
   */
  async analyzeContent(content) {
    console.log('🔍 Analyzing content...');

    if (!this.genAI) {
      return this.simulateAnalysis(content);
    }

    try {
      const prompt = `Analyze this educational content and provide a JSON response with:
1. topics - Array of main topics covered
2. keyPoints - Array of 5 key concepts to visualize
3. difficulty - "beginner", "intermediate", or "advanced"
4. suggestedDuration - Suggested video duration in seconds

Content: ${content.substring(0, 2000)}

Respond ONLY with valid JSON.`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      let analysis;
      try {
        const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        analysis = JSON.parse(cleanText);
      } catch (e) {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysis = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('Invalid response');
        }
      }

      console.log('✅ Content analyzed with Gemini');

      return {
        topics: analysis.topics || analysis.main_topics || ['General Topic'],
        keyPoints: analysis.keyPoints || analysis.key_concepts || analysis.concepts || [],
        difficulty: analysis.difficulty || 'medium',
        suggestedDuration: analysis.suggestedDuration || analysis.duration || 180,
        wordCount: content.split(' ').length
      };

    } catch (error) {
      console.error('❌ Content analysis error:', error.message);
      return this.simulateAnalysis(content);
    }
  }

  /**
   * Create educational video script using Gemini
   */
  async createScript(researchData) {
    console.log('📜 Creating educational script with Gemini...');

    if (!this.genAI) {
      return this.simulateScript(researchData);
    }

    try {
      const prompt = `Create an educational video script for: "${researchData.topic}"

Overview: ${researchData.overview}
Key Points: ${researchData.keyPoints.join(', ')}

Create 6-8 scenes with this structure:
- Scene 1: Engaging introduction (30 seconds)
- Scenes 2-6: Main concepts (45-60 seconds each)
- Final Scene: Summary and conclusion (30 seconds)

For each scene provide:
{
  "title": "video title",
  "scenes": [
    {
      "id": 1,
      "duration": 30,
      "narration": "what the narrator says - engaging and clear",
      "visualDescription": "what should be shown on screen",
      "visualType": "diagram" | "concept" | "summary",
      "stableDiffusionPrompt": "Detailed prompt for Stable Diffusion to generate a clean, text-free, diagrammatic or flowchart visualization of this scene's concept."
    }
  ]
}

Respond ONLY with valid JSON.`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      let script;
      try {
        const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        script = JSON.parse(cleanText);
      } catch (e) {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          script = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('Invalid script format');
        }
      }

      // Calculate total duration
      script.totalDuration = script.scenes.reduce((sum, scene) => sum + (scene.duration || 30), 0);

      console.log(`✅ Script created with Gemini: ${script.scenes.length} scenes, ${script.totalDuration}s total`);

      return script;

    } catch (error) {
      console.error('❌ Script creation error:', error.message);
      return this.simulateScript(researchData);
    }
  }

  /**
   * Create script from user content
   */
  async createScriptFromContent(content, analysis) {
    console.log('📜 Creating script from content with Gemini...');

    if (!this.genAI) {
      return this.simulateScriptFromContent(content, analysis);
    }

    try {
      const prompt = `Transform this content into an educational video script with 5-7 scenes:

Content: ${content.substring(0, 2000)}

Key Points: ${analysis.keyPoints.join(', ')}

Create scenes with narration and visual descriptions.
Respond with JSON in this format:
{
  "title": "video title",
  "scenes": [
    {
      "id": number,
      "duration": seconds,
      "narration": "text",
      "visualDescription": "description",
      "visualType": "diagram|concept|summary",
      "stableDiffusionPrompt": "Detailed prompt for Stable Diffusion to generate a clean, text-free, diagrammatic or flowchart visualization of this scene's concept."
    }
  ]
}

Respond ONLY with valid JSON.`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      let script;
      try {
        const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        script = JSON.parse(cleanText);
      } catch (e) {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          script = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('Invalid script format');
        }
      }

      script.totalDuration = script.scenes.reduce((sum, scene) => sum + (scene.duration || 30), 0);

      console.log('✅ Script created from content with Gemini');
      return script;

    } catch (error) {
      console.error('❌ Script creation error:', error.message);
      return this.simulateScriptFromContent(content, analysis);
    }
  }

  /**
   * Find a semantically matching topic from existing topics
   */
  async findMatchingTopic(userTopic, existingTopics) {
    console.log('🔍 Checking for semantic matches...');

    if (!this.genAI || existingTopics.length === 0) {
      return null;
    }

    try {
      // Chunk topics to avoid token limits if necessary, but for now assuming reasonable size
      const prompt = `I have a list of existing educational video topics:
${JSON.stringify(existingTopics)}

User requested: "${userTopic}"

Determine if the user's request is semantically equivalent to any existing topic (e.g., "Maths" == "Mathematics", "AI" == "Artificial Intelligence").
If a match is found, respond with the EXACT string of the existing topic from the list.
If no match is found, respond with "null".
Respond ONLY with the topic string or "null".`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text().trim().replace(/^"|"$/g, ''); // Remove quotes if present

      if (text !== 'null' && existingTopics.includes(text)) {
        console.log(`✅ Semantic match found: "${userTopic}" -> "${text}"`);
        return text;
      }

      return null;

    } catch (error) {
      console.error('❌ Semantic check error:', error.message);
      return null;
    }
  }

  // ============================================
  // SIMULATION FUNCTIONS (Fallback when no API key)
  // ============================================

  simulateResearch(topic) {
    console.log('ℹ️  Using simulated research (no API key)');
    return {
      topic: topic,
      overview: `${topic} is an important subject that encompasses various concepts and applications. This educational video will cover the fundamental principles and real-world relevance of ${topic}.`,
      keyPoints: [
        `Introduction to ${topic} fundamentals`,
        `Core principles and theories of ${topic}`,
        `Practical applications in real world`,
        `Advanced concepts and techniques`,
        `Future trends and developments in ${topic}`
      ],
      difficulty: 'intermediate',
      examples: [
        'Real-world application example 1',
        'Industry use case example',
        'Practical demonstration scenario'
      ],
      researchedAt: new Date().toISOString()
    };
  }

  simulateAnalysis(content) {
    console.log('ℹ️  Using simulated analysis (no API key)');
    const words = content.split(' ');
    const sentences = content.split('.').filter(s => s.trim().length > 20);

    return {
      topics: ['Main Topic', 'Supporting Concepts', 'Applications'],
      keyPoints: sentences.slice(0, 5).map(s => s.trim()),
      difficulty: 'medium',
      suggestedDuration: Math.min(words.length * 2, 300),
      wordCount: words.length
    };
  }

  simulateScript(researchData) {
    console.log('ℹ️  Using simulated script (no API key)');
    return {
      title: researchData.topic,
      scenes: [
        {
          id: 1,
          duration: 30,
          narration: `Welcome! Today we're exploring ${researchData.topic}. Get ready to learn something amazing!`,
          visualDescription: `Title screen with "${researchData.topic}" in bold, modern typography with educational graphics`,
          visualType: 'title'
        },
        ...researchData.keyPoints.slice(0, 5).map((point, idx) => ({
          id: idx + 2,
          duration: 45,
          narration: `Let's understand ${point}. This concept is crucial for grasping the fundamentals and will help you apply this knowledge effectively.`,
          visualDescription: `Diagram showing ${point}`,
          visualType: 'diagram',
          stableDiffusionPrompt: `A clear flow chart diagrammatic representation of: ${point}. Educative flowchart, structured diagram, mind map, clean lines, high quality, abstract nodes and connections. No text.`
        })),
        {
          id: 7,
          duration: 30,
          narration: `That wraps up our lesson on ${researchData.topic}. Remember these key concepts and keep learning!`,
          visualDescription: 'Summary screen with key takeaways and call to action',
          visualType: 'summary'
        }
      ],
      totalDuration: 30 + (45 * 5) + 30
    };
  }

  simulateScriptFromContent(content, analysis) {
    console.log('ℹ️  Using simulated script (no API key)');
    const sentences = content.split('.').filter(s => s.trim().length > 20);

    return {
      title: 'Educational Content Video',
      scenes: sentences.slice(0, 6).map((sentence, idx) => ({
        id: idx + 1,
        duration: 30,
        narration: sentence.trim(),
        visualDescription: `Visual representation illustrating: ${sentence.substring(0, 50)}...`,
        visualType: 'diagram',
        stableDiffusionPrompt: `A clear flow chart diagrammatic representation illustrating ${sentence.substring(0, 50)}. Educative flowchart, structured diagram, mind map. No text.`
      })),
      totalDuration: Math.min(sentences.length, 6) * 30
    };
  }
}

// Export singleton instance
module.exports = new AIService();