// backend/services/videoService.js - COMPLETE VIDEO RENDERING SERVICE

const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class VideoService {
  constructor() {
    this.tempDir = path.join(__dirname, '../temp');
    this.outputDir = path.join(__dirname, '../output/videos');
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

        const segmentPath = await this.createSegment(scene, image.path, audio?.path, i);
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

  async createSegment(scene, imagePath, audioPath, index) {
    return new Promise((resolve, reject) => {
      const segmentPath = path.join(this.tempDir, 'segments', `segment_${index}.mp4`);

      const command = ffmpeg();

      command.input(imagePath)
        .inputOptions([
          '-loop 1',
          `-t ${scene.duration}`
        ]);

      if (audioPath && fsSync.existsSync(audioPath)) {
        command.input(audioPath);
        
        command.outputOptions([
          '-c:v libx264',
          '-preset fast',
          '-pix_fmt yuv420p',
          '-c:a aac',
          '-b:a 128k',
          '-ar 44100',
          '-shortest',
          '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1'
        ]);
      } else {
        console.log('    Creating silent video segment');
        
        command.outputOptions([
          '-c:v libx264',
          '-preset fast',
          '-pix_fmt yuv420p',
          '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1',
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