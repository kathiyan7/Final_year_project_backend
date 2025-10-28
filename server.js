// backend/server.js - COMPLETE FINAL VERSION WITH VIDEO RENDERING

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const fsSync = require('fs');
require('dotenv').config();

// Import Services
const aiService = require('./services/aiService');
const imageService = require('./services/imageService');
const ttsService = require('./services/ttsService');
const videoService = require('./services/videoService');

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================
// MIDDLEWARE SETUP
// ============================================
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ============================================
// DATABASE CONNECTION
// ============================================
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai_learning_platform');
    console.log('✅ Connected to MongoDB');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    console.log('⚠️  Server will continue without database.');
  }
};

connectDB();

// ============================================
// DATABASE MODELS
// ============================================

const VideoSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  title: String,
  inputType: String,
  originalInput: String,
  researchData: Object,
  script: Object,
  visuals: Array,
  videoUrl: String,
  videoPath: String,
  thumbnailUrl: String,
  status: { type: String, default: 'processing' },
  duration: String,
  metadata: {
    researchSources: [String],
    generatedAt: Date,
    aiModel: String,
    processingTime: Number,
    estimatedCost: Number,
    fileSize: Number,
    realVideo: Boolean
  },
  createdAt: { type: Date, default: Date.now }
});

VideoSchema.index({ createdAt: -1 });
VideoSchema.index({ status: 1 });

const Video = mongoose.model('Video', VideoSchema);

// ============================================
// HELPER FUNCTIONS
// ============================================

function calculateDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generateThumbnailUrl(topic) {
  const cleanTopic = encodeURIComponent(topic.substring(0, 30));
  return `https://via.placeholder.com/1280x720/6366f1/ffffff?text=${cleanTopic}`;
}

function calculateCost(script, hasImages = false, hasAudio = false) {
  let cost = 0;
  const estimatedTokens = JSON.stringify(script).length / 4;
  cost += (estimatedTokens / 1000) * 0.002;
  if (hasImages) cost += script.scenes.length * 0.040;
  if (hasAudio) {
    const totalChars = script.scenes.reduce((sum, s) => sum + s.narration.length, 0);
    cost += (totalChars / 1000) * 0.30;
  }
  return parseFloat(cost.toFixed(4));
}

// ============================================
// API ROUTES
// ============================================

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Server is running!',
    timestamp: new Date().toISOString(),
    aiEnabled: !!process.env.GOOGLE_GEMINI_API_KEY,
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    features: {
      aiResearch: !!process.env.GOOGLE_GEMINI_API_KEY,
      videoGeneration: true,
      textToSpeech: !!process.env.ELEVENLABS_API_KEY
    }
  });
});

// ============================================
// VIDEO GENERATION FROM TOPIC
// ============================================
app.post('/api/generate/topic', async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log('\n🎬 ===== VIDEO GENERATION STARTED =====');
    console.log('📝 Topic:', req.body.topic);
    
    const { topic } = req.body;

    if (!topic) {
      return res.status(400).json({ error: 'Topic is required' });
    }

    if (topic.length < 3) {
      return res.status(400).json({ error: 'Topic must be at least 3 characters' });
    }

    if (topic.length > 200) {
      return res.status(400).json({ error: 'Topic too long (max 200 characters)' });
    }

    // Step 1: Research topic
    console.log('\n🔍 Step 1/5: Researching topic with AI...');
    await delay(500);
    const researchData = await aiService.researchTopic(topic);
    console.log('✅ Research complete:', researchData.keyPoints?.length || 0, 'key points');

    // Step 2: Create script
    console.log('\n📜 Step 2/5: Creating educational script...');
    await delay(500);
    const script = await aiService.createScript(researchData);
    console.log('✅ Script complete:', script.scenes?.length || 0, 'scenes');

    // Step 3: Generate images
    console.log('\n🎨 Step 3/5: Generating scene images...');
    await delay(500);
    const images = await imageService.generateSceneImages(script);
    console.log('✅ Images generated:', images.length);

    // Step 4: Generate audio
    console.log('\n🎤 Step 4/5: Generating voiceovers...');
    await delay(500);
    const audioFiles = await ttsService.generateAudioForScenes(script);
    console.log('✅ Audio generated:', audioFiles.length);

    // Step 5: Create video
    console.log('\n🎬 Step 5/5: Rendering MP4 video with FFmpeg...');
    const videoResult = await videoService.createVideo(script, images, audioFiles);
    console.log('✅ Video rendered successfully!');

    const duration = calculateDuration(script.totalDuration);
    const videoUrl = `http://localhost:${PORT}/api/videos/stream/${videoResult.videoId}`;
    const processingTime = Date.now() - startTime;
    const estimatedCost = calculateCost(script, true, !!process.env.ELEVENLABS_API_KEY);

    // Save to database
    let savedVideo = null;
    if (mongoose.connection.readyState === 1) {
      try {
        const video = new Video({
          title: script.title || topic,
          inputType: 'topic',
          originalInput: topic,
          researchData: { overview: researchData.overview, keyPoints: researchData.keyPoints },
          script: script,
          visuals: images.map(img => ({ sceneId: img.sceneId, url: img.url })),
          videoUrl: videoUrl,
          videoPath: videoResult.path,
          thumbnailUrl: generateThumbnailUrl(topic),
          status: 'completed',
          duration: duration,
          metadata: {
            researchSources: [],
            generatedAt: new Date(),
            aiModel: process.env.GOOGLE_GEMINI_API_KEY ? 'gemini-1.5-flash' : 'simulated',
            processingTime: processingTime,
            estimatedCost: estimatedCost,
            fileSize: videoResult.size,
            realVideo: true
          }
        });

        savedVideo = await video.save();
        console.log('✅ Video saved to database');
      } catch (dbError) {
        console.error('⚠️  Database save failed:', dbError.message);
      }
    }

    // Cleanup temporary files
    console.log('\n🧹 Cleaning up temporary files...');
    await imageService.cleanup(images);
    await ttsService.cleanup(audioFiles);

    console.log('\n🎉 ===== VIDEO GENERATION COMPLETED =====');
    console.log(`⏱️  Total time: ${processingTime}ms`);
    console.log(`📊 Stats: ${script.scenes.length} scenes, ${duration} duration`);
    console.log(`💾 Size: ${(videoResult.size / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`💰 Estimated cost: $${estimatedCost}\n`);

    res.json({
      success: true,
      data: {
        topic: topic,
        videoUrl: videoUrl,
        videoPath: videoResult.path,
        script: script,
        duration: duration,
        thumbnail: generateThumbnailUrl(topic),
        visuals: images.map(img => ({ sceneId: img.sceneId, url: img.url })),
        metadata: {
          createdAt: new Date().toISOString(),
          videoId: savedVideo?._id || videoResult.videoId,
          aiPowered: !!process.env.GOOGLE_GEMINI_API_KEY,
          processingTime: processingTime,
          researchSummary: researchData.overview,
          estimatedCost: estimatedCost,
          fileSize: videoResult.size,
          realVideo: true
        }
      }
    });

  } catch (error) {
    console.error('\n❌ ===== VIDEO GENERATION FAILED =====');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    
    res.status(500).json({ 
      error: 'Failed to generate video',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ============================================
// VIDEO GENERATION FROM CONTENT
// ============================================
app.post('/api/generate/content', async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log('\n🎬 ===== CONTENT VIDEO GENERATION STARTED =====');
    console.log('📝 Content length:', req.body.content?.length, 'characters');
    
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    if (content.length < 50) {
      return res.status(400).json({ error: 'Content must be at least 50 characters' });
    }

    if (content.length > 10000) {
      return res.status(400).json({ error: 'Content too long (max 10,000 characters)' });
    }

    console.log('\n🔍 Step 1/5: Analyzing content...');
    await delay(500);
    const analysis = await aiService.analyzeContent(content);
    console.log('✅ Analysis complete');

    console.log('\n📜 Step 2/5: Creating script...');
    await delay(500);
    const script = await aiService.createScriptFromContent(content, analysis);
    console.log('✅ Script complete:', script.scenes?.length || 0, 'scenes');

    console.log('\n🎨 Step 3/5: Generating images...');
    await delay(500);
    const images = await imageService.generateSceneImages(script);
    console.log('✅ Images generated:', images.length);

    console.log('\n🎤 Step 4/5: Generating audio...');
    await delay(500);
    const audioFiles = await ttsService.generateAudioForScenes(script);
    console.log('✅ Audio generated');

    console.log('\n🎬 Step 5/5: Rendering video...');
    const videoResult = await videoService.createVideo(script, images, audioFiles);
    console.log('✅ Video rendered!');

    const duration = calculateDuration(script.totalDuration);
    const videoUrl = `http://localhost:${PORT}/api/videos/stream/${videoResult.videoId}`;
    const processingTime = Date.now() - startTime;
    const estimatedCost = calculateCost(script, true, !!process.env.ELEVENLABS_API_KEY);

    // Save to database
    let savedVideo = null;
    if (mongoose.connection.readyState === 1) {
      try {
        const video = new Video({
          title: script.title || 'Custom Content Video',
          inputType: 'content',
          originalInput: content.substring(0, 500),
          script: script,
          visuals: images.map(img => ({ sceneId: img.sceneId, url: img.url })),
          videoUrl: videoUrl,
          videoPath: videoResult.path,
          status: 'completed',
          duration: duration,
          metadata: {
            generatedAt: new Date(),
            aiModel: process.env.GOOGLE_GEMINI_API_KEY ? 'gemini-1.5-flash' : 'simulated',
            processingTime: processingTime,
            estimatedCost: estimatedCost,
            fileSize: videoResult.size,
            realVideo: true
          }
        });

        savedVideo = await video.save();
      } catch (dbError) {
        console.error('⚠️  Database save failed:', dbError.message);
      }
    }

    // Cleanup
    await imageService.cleanup(images);
    await ttsService.cleanup(audioFiles);

    console.log('\n🎉 ===== CONTENT VIDEO COMPLETED =====');
    console.log(`⏱️  Total time: ${processingTime}ms\n`);

    res.json({
      success: true,
      data: {
        videoUrl: videoUrl,
        script: script,
        duration: duration,
        analysis: analysis,
        thumbnail: generateThumbnailUrl('Custom Content'),
        visuals: images.map(img => ({ sceneId: img.sceneId, url: img.url })),
        metadata: {
          createdAt: new Date().toISOString(),
          videoId: savedVideo?._id || videoResult.videoId,
          aiPowered: !!process.env.GOOGLE_GEMINI_API_KEY,
          processingTime: processingTime,
          estimatedCost: estimatedCost,
          fileSize: videoResult.size,
          realVideo: true
        }
      }
    });

  } catch (error) {
    console.error('\n❌ ===== CONTENT VIDEO FAILED =====');
    console.error('Error:', error.message);
    
    res.status(500).json({ 
      error: 'Failed to generate video from content',
      message: error.message
    });
  }
});

// ============================================
// VIDEO STREAMING & DOWNLOAD
// ============================================

// Serve videos directory statically
app.use('/videos', express.static(path.join(__dirname, 'output/videos')));

// Stream video with range support (for HTML5 video player)
app.get('/api/videos/stream/:videoId', (req, res) => {
  const videoPath = path.join(__dirname, 'output/videos', `${req.params.videoId}.mp4`);
  
  console.log('📺 Streaming video request:', req.params.videoId);
  console.log('📁 Video path:', videoPath);
  console.log('📊 File exists:', fsSync.existsSync(videoPath));
  
  if (!fsSync.existsSync(videoPath)) {
    console.error('❌ Video not found:', videoPath);
    return res.status(404).json({ error: 'Video not found' });
  }

  const stat = fsSync.statSync(videoPath);
  const fileSize = stat.size;
  const range = req.headers.range;

  console.log('📦 File size:', fileSize, 'bytes');
  console.log('🔍 Range request:', range || 'None');

  if (range) {
    // Handle range request for video seeking
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    
    const file = fsSync.createReadStream(videoPath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
    };
    
    console.log('✅ Sending range:', `${start}-${end}/${fileSize}`);
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    // Send entire video
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes'
    };
    
    console.log('✅ Sending full video');
    res.writeHead(200, head);
    fsSync.createReadStream(videoPath).pipe(res);
  }
});

// Download video endpoint
app.get('/api/videos/download/:videoId', (req, res) => {
  const videoPath = path.join(__dirname, 'output/videos', `${req.params.videoId}.mp4`);
  
  console.log('⬇️  Download request:', req.params.videoId);
  console.log('📁 Path:', videoPath);
  
  if (fsSync.existsSync(videoPath)) {
    const filename = `LearnAI_${req.params.videoId}.mp4`;
    console.log('✅ Sending file:', filename);
    res.download(videoPath, filename);
  } else {
    console.error('❌ File not found');
    res.status(404).json({ error: 'Video not found' });
  }
});

// ============================================
// DATABASE ROUTES
// ============================================

app.get('/api/videos', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json({ success: true, count: 0, videos: [], message: 'Database not connected' });
    }

    const videos = await Video.find().sort({ createdAt: -1 }).limit(20).select('-researchData');
    res.json({ success: true, count: videos.length, videos: videos });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/video/:id', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const video = await Video.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    res.json({ success: true, data: video });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/video/:id', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const video = await Video.findByIdAndDelete(req.params.id);
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Delete video file
    if (video.videoPath && fsSync.existsSync(video.videoPath)) {
      fsSync.unlinkSync(video.videoPath);
    }

    console.log('🗑️  Video deleted:', req.params.id);
    res.json({ success: true, message: 'Video deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json({
        success: true,
        stats: { totalVideos: 0, completedVideos: 0, processingVideos: 0, recentVideos: [] }
      });
    }

    const totalVideos = await Video.countDocuments();
    const completedVideos = await Video.countDocuments({ status: 'completed' });
    const processingVideos = await Video.countDocuments({ status: 'processing' });
    const recentVideos = await Video.find().sort({ createdAt: -1 }).limit(5).select('title createdAt duration status');

    res.json({
      success: true,
      stats: { totalVideos, completedVideos, processingVideos, recentVideos }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ERROR HANDLING
// ============================================

app.use((err, req, res, next) => {
  console.error('💥 Unhandled Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

app.use((req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.path,
    method: req.method
  });
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received. Shutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n🛑 SIGINT received. Shutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
  console.log('\n🚀 ================================');
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log('🚀 ================================');
  console.log('📡 API Endpoints:');
  console.log(`   GET  /api/health`);
  console.log(`   POST /api/generate/topic`);
  console.log(`   POST /api/generate/content`);
  console.log(`   GET  /api/videos`);
  console.log(`   GET  /api/video/:id`);
  console.log(`   DELETE /api/video/:id`);
  console.log(`   GET  /api/stats`);
  console.log(`   GET  /api/videos/stream/:videoId`);
  console.log(`   GET  /api/videos/download/:videoId`);
  console.log('🚀 ================================');
  console.log(`🤖 AI: ${process.env.GOOGLE_GEMINI_API_KEY ? '✅ Gemini Enabled' : '⚠️  Simulation Mode'}`);
  console.log(`🎤 TTS: ${process.env.ELEVENLABS_API_KEY ? '✅ ElevenLabs Enabled' : '⚠️  Silent Mode'}`);
  
  setTimeout(() => {
    console.log(`💾 Database: ${mongoose.connection.readyState === 1 ? '✅ Connected' : '⚠️  Disconnected'}`);
  }, 2000);
  
  console.log('🚀 ================================\n');
});

module.exports = app;