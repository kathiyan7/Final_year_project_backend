// backend/services/ttsService.js - WITH GOOGLE TTS FALLBACK

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const gTTS = require('gtts');

class TTSService {
  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    this.voiceId = '21m00Tcm4TlvDq8ikWAM';
    
    this.tempDir = path.join(__dirname, '../temp/audio');
    this.ensureDirectory();
    
    if (this.apiKey) {
      console.log('🎤 TTS Service initialized (ElevenLabs + Google TTS fallback)');
    } else {
      console.log('🎤 TTS Service initialized (Google TTS only)');
    }
  }

  async ensureDirectory() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (err) {
      console.error('Failed to create audio directory:', err);
    }
  }

  async generateAudioForScenes(script) {
    console.log(`🎤 Generating audio for ${script.scenes.length} scenes...`);
    
    const audioFiles = [];

    for (const scene of script.scenes) {
      try {
        const audioPath = await this.generateSpeech(scene.narration, scene.id);
        audioFiles.push({
          sceneId: scene.id,
          path: audioPath,
          duration: scene.duration
        });
        console.log(`✅ Audio ${scene.id}/${script.scenes.length} generated`);
      } catch (error) {
        console.error(`❌ Audio generation failed for scene ${scene.id}:`, error.message);
        audioFiles.push({
          sceneId: scene.id,
          path: null,
          duration: scene.duration,
          silent: true
        });
      }

      await this.delay(500);
    }

    const successCount = audioFiles.filter(a => a.path).length;
    console.log(`✅ Audio complete: ${successCount}/${script.scenes.length} with audio`);
    return audioFiles;
  }

  async generateSpeech(text, sceneId) {
    console.log(`🎤 Generating speech for scene ${sceneId}...`);

    // Try ElevenLabs first if API key exists
    if (this.apiKey) {
      try {
        return await this.generateWithElevenLabs(text, sceneId);
      } catch (error) {
        console.warn(`⚠️  ElevenLabs failed: ${error.message}`);
        console.log('   Using Google TTS fallback...');
        return await this.generateWithGoogleTTS(text, sceneId);
      }
    } else {
      // No API key, use Google TTS directly
      return await this.generateWithGoogleTTS(text, sceneId);
    }
  }

  async generateWithElevenLabs(text, sceneId) {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`,
      {
        text: text,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      },
      {
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer',
        timeout: 30000
      }
    );

    const audioPath = path.join(this.tempDir, `scene_${sceneId}.mp3`);
    await fs.writeFile(audioPath, response.data);
    console.log(`   ✅ ElevenLabs audio saved`);
    return audioPath;
  }

  async generateWithGoogleTTS(text, sceneId) {
    return new Promise((resolve, reject) => {
      const audioPath = path.join(this.tempDir, `scene_${sceneId}.mp3`);
      const gtts = new gTTS(text, 'en');
      
      gtts.save(audioPath, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log(`   ✅ Google TTS audio saved`);
          resolve(audioPath);
        }
      });
    });
  }

  async cleanup(audioFiles) {
    for (const audio of audioFiles) {
      if (audio.path) {
        try {
          await fs.unlink(audio.path);
        } catch (err) {
          // Ignore
        }
      }
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new TTSService();