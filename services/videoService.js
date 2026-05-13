// backend/services/videoService.js - COMPLETE VIDEO RENDERING SERVICE

const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const FormData = require('form-data');

class VideoService {
  constructor() {
    this.tempDir = path.join(__dirname, '../temp');
    this.outputDir = path.join(__dirname, '../output/videos');
    this.stabilityApiKey = process.env.STABILITY_API_KEY;
    this.ensureDirectories();
    
    try {
      ffmpeg.setFfmpegPath('ffmpeg');
      console.log('🎬 Video Service initialized with FFmpeg');
    } catch (err) {
      console.warn('⚠️  FFmpeg not found in PATH');
    }
  }

  async ensureDirectories() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
      await fs.mkdir(this.outputDir, { recursive: true });
      await fs.mkdir(path.join(this.tempDir, 'segments'), { recursive: true });
    } catch (err) {
      console.error('Failed to create directories:', err);
    }
  }

  async createVideo(script, images, audioFiles) {
    console.log('\n🎬 ===== STARTING VIDEO CREATION =====');
    console.log(`📊 Scenes: ${script.scenes.length}`);
    console.log(`🖼️  Images: ${images.length}`);
    console.log(`🎤 Audio: ${audioFiles.length}`);

    const videoId = uuidv4();
    const outputPath = path.join(this.outputDir, `${videoId}.mp4`);

    try {
      console.log('\n📹 Creating video segments...');
      const segments = [];
      
      for (let i = 0; i < script.scenes.length; i++) {
        const scene = script.scenes[i];
        const image = images.find(img => img.sceneId === scene.id);
        const audio = audioFiles.find(aud => aud.sceneId === scene.id);

        console.log(`\n  Scene ${scene.id}/${script.scenes.length}:`);
        console.log(`    Duration: ${scene.duration}s`);
        console.log(`    Image: ${image?.path ? 'OK' : 'MISSING'}`);
        console.log(`    Audio: ${audio?.path ? 'OK' : 'SILENT'}`);

        if (!image?.path) {
          console.warn(`    ⚠️  Skipping scene ${scene.id} - no image`);
          continue;
        }

        const segmentPath = await this.createSegment(scene, image.path, audio?.path, i, image.overlayPath);
        segments.push(segmentPath);
        
        console.log(`    ✅ Segment created`);
      }

      if (segments.length === 0) {
        throw new Error('No valid segments created');
      }

      console.log(`\n✅ All ${segments.length} segments created`);

      console.log('\n🔗 Concatenating segments into final video...');
      await this.concatenateSegments(segments, outputPath);
      console.log('✅ Video concatenation complete');

      const stats = await fs.stat(outputPath);
      const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      
      console.log('\n🎉 ===== VIDEO CREATION COMPLETE =====');
      console.log(`📁 Output: ${outputPath}`);
      console.log(`💾 Size: ${fileSizeMB} MB`);
      console.log(`⏱️  Duration: ${script.totalDuration}s`);

      await this.cleanupSegments(segments);

      return {
        videoId,
        path: outputPath,
        url: `/api/videos/stream/${videoId}`,
        size: stats.size,
        duration: script.totalDuration
      };

    } catch (error) {
      console.error('\n❌ ===== VIDEO CREATION FAILED =====');
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      throw error;
    }
  }

  async generateStableVideo(imagePath, sceneId) {
    if (!this.stabilityApiKey) {
      console.warn('⚠️ No Stability API key, falling back to static FFmpeg image');
      return null;
    }

    try {
      console.log(`🎥 Generating Stable Video Diffusion for scene ${sceneId}...`);

      const formData = new FormData();
      formData.append('image', fsSync.createReadStream(imagePath));
      formData.append('seed', 0);
      formData.append('cfg_scale', 1.8);
      formData.append('motion_bucket_id', 127);

      // 1. Submit the image-to-video task
      const submitResponse = await axios.post(
        'https://api.stability.ai/v2beta/image-to-video',
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            'Authorization': `Bearer ${this.stabilityApiKey}`
          }
        }
      );

      const generationId = submitResponse.data.id;
      if (!generationId) {
        throw new Error('Did not receive a generation ID from Stability AI');
      }

      console.log(`   Task submitted. Generation ID: ${generationId}. Polling...`);

      // 2. Poll for the result
      let videoPath = null;
      let retries = 0;
      const maxRetries = 60; // 10 minutes max

      while (retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 10000)); // 10s delay
        
        try {
          const pollResponse = await axios.get(
            `https://api.stability.ai/v2beta/image-to-video/result/${generationId}`,
            {
              headers: {
                'Authorization': `Bearer ${this.stabilityApiKey}`,
                'Accept': 'video/*'
              },
              responseType: 'arraybuffer',
              validateStatus: function (status) {
                return status === 200 || status === 202;
              }
            }
          );

          if (pollResponse.status === 202) {
            console.log(`   Status: In Progress (Attempt ${retries + 1}/${maxRetries})`);
          } else if (pollResponse.status === 200) {
            videoPath = path.join(this.tempDir, `segments`, `svd_${sceneId}_${Date.now()}.mp4`);
            await fs.writeFile(videoPath, pollResponse.data);
            console.log(`   ✅ Stable Video generated at ${videoPath}`);
            break;
          }
        } catch (pollError) {
          console.log(`   ⚠️ Polling error: ${pollError.message}. Retrying...`);
        }

        retries++;
      }

      return videoPath;

    } catch (error) {
      console.warn('⚠️ SVD generation failed, falling back to FFmpeg:', error.message);
      if (error.response?.data) {
        try {
          const dataStr = error.response.data.toString('utf8');
          console.warn('SVD Error Details:', dataStr);
        } catch (e) {
          console.warn('SVD Error status:', error.response.status);
        }
      }
      return null;
    }
  }

  async createSegment(scene, imagePath, audioPath, index, overlayPath) {
    const svdVideoPath = await this.generateStableVideo(imagePath, scene.id);

    return new Promise((resolve, reject) => {
      const segmentPath = path.join(this.tempDir, 'segments', `segment_${index}.mp4`);

      const command = ffmpeg();

      if (svdVideoPath) {
        // We use the generated SVD video and loop it. 
        // -stream_loop -1 guarantees it will repeat until -t or -shortest cuts it off.
        command.input(svdVideoPath)
          .inputOptions([
            '-stream_loop -1',
            `-t ${scene.duration}`
          ]);
      } else {
        command.input(imagePath)
          .inputOptions([
            '-loop 1',
            `-t ${scene.duration}`
          ]);
      }

      let filterComplex = '';

      if (overlayPath && fsSync.existsSync(overlayPath)) {
        command.input(overlayPath);
        filterComplex = `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[bg];[bg][1:v]overlay=0:0[v]`;
      } else {
        filterComplex = `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[v]`;
      }

      if (audioPath && fsSync.existsSync(audioPath)) {
        command.input(audioPath);
        
        command.complexFilter([filterComplex]);
        command.outputOptions([
          '-map', '[v]',
          '-map', `${overlayPath && fsSync.existsSync(overlayPath) ? '2:a' : '1:a'}`,
          '-c:v libx264',
          '-preset fast',
          '-pix_fmt yuv420p',
          '-c:a aac',
          '-b:a 128k',
          '-ar 44100',
          '-shortest'
        ]);
      } else {
        console.log('    Creating silent video segment');
        
        command.complexFilter([filterComplex]);
        command.outputOptions([
          '-map', '[v]',
          '-c:v libx264',
          '-preset fast',
          '-pix_fmt yuv420p',
          '-an'
        ]);
      }

      command
        .on('start', (cmd) => {
          console.log(`    FFmpeg command: ${cmd.substring(0, 150)}...`);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            process.stdout.write(`\r    Progress: ${progress.percent.toFixed(1)}%`);
          }
        })
        .on('end', () => {
          console.log('');
          resolve(segmentPath);
        })
        .on('error', (err) => {
          console.error(`\n    FFmpeg error: ${err.message}`);
          reject(err);
        })
        .save(segmentPath);
    });
  }

  async concatenateSegments(segments, outputPath) {
    return new Promise(async (resolve, reject) => {
      const concatFilePath = path.join(this.tempDir, 'concat_list.txt');
      const concatContent = segments.map(seg => `file '${seg}'`).join('\n');
      await fs.writeFile(concatFilePath, concatContent);

      ffmpeg()
        .input(concatFilePath)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions(['-c copy'])
        .on('start', (cmd) => {
          console.log('FFmpeg concat command:', cmd.substring(0, 150));
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            process.stdout.write(`\rProgress: ${progress.percent.toFixed(1)}%`);
          }
        })
        .on('end', async () => {
          console.log('');
          await fs.unlink(concatFilePath).catch(() => {});
          resolve();
        })
        .on('error', (err) => {
          console.error('Concatenation error:', err.message);
          reject(err);
        })
        .save(outputPath);
    });
  }

  async generateThumbnail(videoPath) {
    return new Promise((resolve, reject) => {
      const thumbnailPath = videoPath.replace('.mp4', '_thumb.jpg');

      ffmpeg(videoPath)
        .screenshots({
          timestamps: ['00:00:01'],
          filename: path.basename(thumbnailPath),
          folder: path.dirname(thumbnailPath),
          size: '1280x720'
        })
        .on('end', () => resolve(thumbnailPath))
        .on('error', reject);
    });
  }

  async cleanupSegments(segments) {
    console.log('\n🧹 Cleaning up temporary segments...');
    for (const segment of segments) {
      try {
        await fs.unlink(segment);
      } catch (err) {
        // Ignore cleanup errors
      }
    }
    console.log('✅ Cleanup complete');
  }

  getVideoUrl(videoId) {
    return `/api/videos/stream/${videoId}`;
  }
}

module.exports = new VideoService();