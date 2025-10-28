// backend/services/imageService.js - Image Generation with DALL-E or Fallback

const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const { createCanvas, loadImage, registerFont } = require('canvas');

class ImageService {
  constructor() {
    // Check for image generation API keys
    this.hasGemini = !!process.env.GOOGLE_GEMINI_API_KEY;
    
    // Ensure temp directory exists
    this.tempDir = path.join(__dirname, '../temp/images');
    this.ensureDirectory();
    
    console.log(`🎨 Image Service initialized (${this.hasGemini ? 'AI Mode' : 'Template Mode'})`);
  }

  async ensureDirectory() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (err) {
      console.error('Failed to create temp directory:', err);
    }
  }

  /**
   * Generate images for all scenes
   */
  async generateSceneImages(script) {
    console.log(`🎨 Generating images for ${script.scenes.length} scenes...`);
    
    const images = [];
    
    for (const scene of script.scenes) {
      try {
        const imagePath = await this.generateSingleImage(scene);
        images.push({
          sceneId: scene.id,
          path: imagePath,
          url: `file://${imagePath}`
        });
        console.log(`✅ Image ${scene.id}/${script.scenes.length} generated`);
      } catch (error) {
        console.error(`❌ Failed to generate image for scene ${scene.id}:`, error.message);
        // Fallback to template
        const fallbackPath = await this.generateTemplateImage(scene);
        images.push({
          sceneId: scene.id,
          path: fallbackPath,
          url: `file://${fallbackPath}`
        });
      }
      
      // Small delay to avoid rate limits
      await this.delay(500);
    }
    
    console.log(`✅ All ${images.length} scene images generated`);
    return images;
  }

  /**
   * Generate single image (AI or template)
   */
  async generateSingleImage(scene) {
    // For now, use template-based generation
    // You can upgrade to DALL-E later by uncommenting the AI section
    return await this.generateTemplateImage(scene);
    
    /* UNCOMMENT TO USE DALL-E (requires OpenAI API key):
    if (process.env.OPENAI_API_KEY) {
      try {
        return await this.generateWithDALLE(scene);
      } catch (error) {
        console.warn('DALL-E failed, using template:', error.message);
        return await this.generateTemplateImage(scene);
      }
    }
    */
  }

  /**
   * Generate image using DALL-E (Optional - requires OpenAI API)
   */
  async generateWithDALLE(scene) {
    const prompt = `Educational illustration for: ${scene.visualDescription || scene.narration}. 
    Style: Clean, professional, modern, suitable for e-learning. 
    High quality, detailed, no text in image.`;

    const response = await axios.post(
      'https://api.openai.com/v1/images/generations',
      {
        model: "dall-e-3",
        prompt: prompt,
        size: "1792x1024",
        quality: "standard",
        n: 1
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const imageUrl = response.data.data[0].url;
    
    // Download the generated image
    const imagePath = path.join(this.tempDir, `scene_${scene.id}.png`);
    const imageData = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    await fs.writeFile(imagePath, imageData.data);

    return imagePath;
  }

  /**
   * Generate template-based image (FREE - No API needed)
   */
  async generateTemplateImage(scene) {
    const width = 1920;
    const height = 1080;
    
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Better gradient backgrounds
    const gradients = {
      title: {
        colors: ['#667eea', '#764ba2', '#f093fb'],
        style: 'radial'
      },
      diagram: {
        colors: ['#4facfe', '#00f2fe', '#43e97b'],
        style: 'linear'
      },
      concept: {
        colors: ['#fa709a', '#fee140', '#30cfd0'],
        style: 'diagonal'
      },
      animation: {
        colors: ['#a8edea', '#fed6e3', '#fbc2eb'],
        style: 'radial'
      },
      summary: {
        colors: ['#ff9a56', '#ff6a88', '#ffecd2'],
        style: 'linear'
      }
    };

    const sceneGradient = gradients[scene.visualType] || gradients.concept;
    
    // Create dynamic gradient
    let gradient;
    if (sceneGradient.style === 'radial') {
      gradient = ctx.createRadialGradient(width/2, height/2, 100, width/2, height/2, 800);
    } else if (sceneGradient.style === 'diagonal') {
      gradient = ctx.createLinearGradient(0, 0, width, height);
    } else {
      gradient = ctx.createLinearGradient(0, 0, 0, height);
    }
    
    sceneGradient.colors.forEach((color, index) => {
      gradient.addColorStop(index / (sceneGradient.colors.length - 1), color);
    });
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Add animated-style decorative elements
    this.addModernDecorativeElements(ctx, width, height, scene.visualType);

    // Add scene number with modern design
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath();
    ctx.arc(120, 120, 80, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = 'white';
    ctx.font = 'bold 64px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(scene.id, 120, 120);
    ctx.restore();

    // Add main title with shadow effect
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 10;
    
    ctx.fillStyle = 'white';
    ctx.font = 'bold 96px Arial';
    ctx.textAlign = 'center';
    
    const title = this.getSceneTitle(scene);
    ctx.fillText(title, width / 2, height / 3);
    ctx.restore();

    // Add description with better formatting
    const description = scene.visualDescription || scene.narration;
    this.wrapTextModern(ctx, description, width / 2, height / 2 + 100, width - 400, 70);

    // Add visual type indicator
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillRect(50, height - 100, 400, 60);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`📚 ${scene.visualType.toUpperCase()}`, 80, height - 60);
    ctx.restore();

    // Save to file
    const imagePath = path.join(this.tempDir, `scene_${scene.id}.png`);
    const buffer = canvas.toBuffer('image/png');
    await fs.writeFile(imagePath, buffer);

    return imagePath;
  }

  /**
   * Add modern decorative elements
   */
  addModernDecorativeElements(ctx, width, height, visualType) {
    ctx.save();
    
    switch(visualType) {
      case 'title':
        // Floating circles
        for (let i = 0; i < 8; i++) {
          const x = Math.random() * width;
          const y = Math.random() * height;
          const r = 30 + Math.random() * 80;
          ctx.fillStyle = `rgba(255, 255, 255, ${0.05 + Math.random() * 0.1})`;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
        
      case 'diagram':
        // Connected dots pattern
        const dots = [];
        for (let i = 0; i < 12; i++) {
          dots.push({
            x: Math.random() * width,
            y: Math.random() * height
          });
        }
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 2;
        dots.forEach((dot, i) => {
          if (i > 0) {
            ctx.beginPath();
            ctx.moveTo(dots[i-1].x, dots[i-1].y);
            ctx.lineTo(dot.x, dot.y);
            ctx.stroke();
          }
          
          ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
          ctx.beginPath();
          ctx.arc(dot.x, dot.y, 8, 0, Math.PI * 2);
          ctx.fill();
        });
        break;
        
      case 'concept':
        // Abstract shapes
        for (let i = 0; i < 5; i++) {
          const x = Math.random() * width;
          const y = Math.random() * height;
          const size = 100 + Math.random() * 200;
          const rotation = Math.random() * Math.PI;
          
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(rotation);
          ctx.fillStyle = `rgba(255, 255, 255, ${0.05 + Math.random() * 0.08})`;
          ctx.fillRect(-size/2, -size/2, size, size);
          ctx.restore();
        }
        break;
        
      case 'animation':
        // Wave patterns
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 4;
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          for (let x = 0; x <= width; x += 20) {
            const y = height/2 + Math.sin((x + i * 100) / 100) * 100 + i * 50;
            if (x === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }
          ctx.stroke();
        }
        break;
        
      case 'summary':
        // Checkmarks and icons
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.font = 'bold 120px Arial';
        const icons = ['✓', '★', '■', '●'];
        for (let i = 0; i < 6; i++) {
          const x = Math.random() * width;
          const y = Math.random() * height;
          const icon = icons[Math.floor(Math.random() * icons.length)];
          ctx.fillText(icon, x, y);
        }
        break;
    }
    
    ctx.restore();
  }

  /**
   * Get appropriate title for scene
   */
  getSceneTitle(scene) {
    const titles = {
      title: scene.narration.substring(0, 40),
      diagram: 'Understanding the Concept',
      concept: 'Key Ideas',
      animation: 'In Action',
      summary: 'Summary & Takeaways'
    };
    
    return titles[scene.visualType] || scene.visualType.toUpperCase();
  }

  /**
   * Modern text wrapping with better styling
   */
  wrapTextModern(ctx, text, x, y, maxWidth, lineHeight) {
    ctx.save();
    ctx.font = '42px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    
    const words = text.substring(0, 250).split(' ');
    let line = '';
    let lineY = y;
    let lineCount = 0;
    const maxLines = 4;
    
    for (let n = 0; n < words.length && lineCount < maxLines; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && n > 0) {
        ctx.fillText(line, x, lineY);
        line = words[n] + ' ';
        lineY += lineHeight;
        lineCount++;
      } else {
        line = testLine;
      }
    }
    
    if (lineCount < maxLines) {
      ctx.fillText(line, x, lineY);
    }
    
    ctx.restore();
  }

  /**
   * Cleanup temporary images
   */
  async cleanup(images) {
    for (const image of images) {
      try {
        await fs.unlink(image.path);
      } catch (err) {
        console.warn('Cleanup warning:', err.message);
      }
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new ImageService();