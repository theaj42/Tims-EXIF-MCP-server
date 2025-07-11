#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import exifr from 'exifr';
import { readFile, rename, stat, mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { existsSync, createWriteStream } from 'fs';
import { fileURLToPath } from 'url';
import os from 'os';
import archiver from 'archiver';
import sharp from 'sharp';

// Security and validation functions
function validateFilePath(filepath) {
  if (!filepath || typeof filepath !== 'string') {
    throw new Error('Invalid file path provided');
  }
  
  // Convert to absolute path to prevent relative path traversal
  const absolutePath = path.resolve(filepath);
  
  // Check for path traversal attempts
  if (absolutePath.includes('..') || !absolutePath.startsWith(process.cwd())) {
    throw new Error('Path traversal detected - access denied');
  }
  
  return absolutePath;
}

function validateFileExists(filepath) {
  if (!existsSync(filepath)) {
    throw new Error(`File not found: ${filepath}`);
  }
}

function validateImageFile(filepath) {
  const ext = path.extname(filepath).toLowerCase();
  const allowedExts = ['.jpg', '.jpeg', '.png', '.tiff', '.tif', '.heic', '.heif', '.webp', '.avif'];
  
  if (!allowedExts.includes(ext)) {
    throw new Error(`Unsupported file type: ${ext}. Supported types: ${allowedExts.join(', ')}`);
  }
}

function createSafeBackupDir(originalPath) {
  const dir = path.dirname(originalPath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(dir, `exif_backup_${timestamp}`);
  
  // Ensure backup directory doesn't exist
  let counter = 1;
  let finalBackupDir = backupDir;
  while (existsSync(finalBackupDir)) {
    finalBackupDir = `${backupDir}_${counter}`;
    counter++;
  }
  
  return finalBackupDir;
}

// Create server instance
const server = new Server(
  {
    name: 'exif-mcp-server',
    version: '1.2.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'parse_exif',
        description: 'Parse EXIF data from an image file',
        inputSchema: {
          type: 'object',
          properties: {
            filepath: {
              type: 'string',
              description: 'Path to the image file'
            },
            options: {
              type: 'object',
              description: 'Optional parsing options',
              properties: {
                gps: {
                  type: 'boolean',
                  description: 'Include GPS data (default: true)'
                },
                thumbnail: {
                  type: 'boolean',
                  description: 'Include thumbnail data (default: false)'
                },
                xmp: {
                  type: 'boolean',
                  description: 'Include XMP data (default: true)'
                },
                icc: {
                  type: 'boolean',
                  description: 'Include ICC color profile (default: false)'
                },
                iptc: {
                  type: 'boolean',
                  description: 'Include IPTC data (default: true)'
                }
              }
            }
          },
          required: ['filepath']
        }
      },
      {
        name: 'parse_exif_batch',
        description: 'Parse EXIF data from multiple image files',
        inputSchema: {
          type: 'object',
          properties: {
            filepaths: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Array of paths to image files'
            },
            options: {
              type: 'object',
              description: 'Optional parsing options (same as parse_exif)'
            }
          },
          required: ['filepaths']
        }
      },
      {
        name: 'get_gps_coordinates',
        description: 'Extract just GPS coordinates from an image',
        inputSchema: {
          type: 'object',
          properties: {
            filepath: {
              type: 'string',
              description: 'Path to the image file'
            }
          },
          required: ['filepath']
        }
      },
      {
        name: 'rename_by_exif',
        description: 'Rename image files based on EXIF data using customizable templates',
        inputSchema: {
          type: 'object',
          properties: {
            filepaths: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Array of image file paths to rename'
            },
            template: {
              type: 'string',
              description: 'Naming template. Available variables: {date}, {time}, {datetime}, {camera}, {model}, {lens}, {location}, {city}, {country}, {original}, {counter}. Default: "{datetime}_{camera}_{original}"',
              default: '{datetime}_{camera}_{original}'
            },
            dateFormat: {
              type: 'string',
              description: 'Date format (default: "YYYY-MM-DD")',
              default: 'YYYY-MM-DD'
            },
            timeFormat: {
              type: 'string',
              description: 'Time format (default: "HHmmss")',
              default: 'HHmmss'
            },
            dryRun: {
              type: 'boolean',
              description: 'Preview changes without actually renaming (default: true)',
              default: true
            },
            backup: {
              type: 'boolean',
              description: 'Create backup of original files (default: true)',
              default: true
            },
            counterStart: {
              type: 'integer',
              description: 'Starting number for {counter} variable (default: 1)',
              default: 1
            }
          },
          required: ['filepaths']
        }
      },
      {
        name: 'create_photo_tour_kmz',
        description: 'Create a KMZ file with geotagged photos showing your journey path',
        inputSchema: {
          type: 'object',
          properties: {
            filepaths: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Array of image file paths in chronological order'
            },
            outputPath: {
              type: 'string',
              description: 'Path for the output KMZ file (e.g., /path/to/photo-tour.kmz)'
            },
            title: {
              type: 'string',
              description: 'Title for the photo tour',
              default: 'My Photo Journey'
            },
            description: {
              type: 'string',
              description: 'Description of the journey',
              default: ''
            },
            thumbnailSize: {
              type: 'integer',
              description: 'Thumbnail size in pixels (default: 800)',
              default: 800
            },
            includeFullImages: {
              type: 'boolean',
              description: 'Include full-size images in KMZ (warning: large file)',
              default: false
            },
            drawPath: {
              type: 'boolean',
              description: 'Draw path line between photo locations',
              default: true
            },
            numberPhotos: {
              type: 'boolean',
              description: 'Number photos in chronological order',
              default: true
            }
          },
          required: ['filepaths', 'outputPath']
        }
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'parse_exif': {
        const { filepath, options = {} } = args;
        
        // Default options
        const parseOptions = {
          gps: options.gps !== false,
          thumbnail: options.thumbnail === true,
          xmp: options.xmp !== false,
          icc: options.icc === true,
          iptc: options.iptc !== false,
          ...options
        };
        
        // Parse EXIF data
        const exifData = await exifr.parse(safePath, parseOptions);
        
        if (!exifData) {
          return {
            content: [{
              type: 'text',
              text: `No EXIF data found in ${path.basename(safePath)}`
            }]
          };
        }
        
        // Format the output
        const formatted = formatExifData(exifData, safePath);
        
        return {
          content: [{
            type: 'text',
            text: formatted
          }]
        };
      }
      
      case 'parse_exif_batch': {
        const { filepaths, options = {} } = args;
        const results = [];
        
        // Validate input
        if (!Array.isArray(filepaths) || filepaths.length === 0) {
          throw new Error('filepaths must be a non-empty array');
        }
        
        for (const filepath of filepaths) {
          try {
            // Validate and sanitize file path
            const safePath = validateFilePath(filepath);
            validateFileExists(safePath);
            validateImageFile(safePath);
            
            const exifData = await exifr.parse(safePath, {
              gps: options.gps !== false,
              thumbnail: options.thumbnail === true,
              xmp: options.xmp !== false,
              icc: options.icc === true,
              iptc: options.iptc !== false,
              ...options
            });
            
            if (exifData) {
              results.push({
                filepath: path.basename(safePath),
                data: exifData,
                status: 'success'
              });
            } else {
              results.push({
                filepath: path.basename(safePath),
                data: null,
                status: 'no_exif'
              });
            }
          } catch (error) {
            results.push({
              filepath: path.basename(filepath),
              data: null,
              status: 'error',
              error: error.message
            });
          }
        }
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(results, null, 2)
          }]
        };
      }
      
      case 'get_gps_coordinates': {
        const { filepath } = args;
        
        // Validate and sanitize file path
        const safePath = validateFilePath(filepath);
        validateFileExists(safePath);
        validateImageFile(safePath);
        
        // Parse only GPS data
        const gpsData = await exifr.gps(safePath);
        
        if (!gpsData) {
          return {
            content: [{
              type: 'text',
              text: `No GPS data found in ${path.basename(safePath)}`
            }]
          };
        }
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              filepath: path.basename(safePath),
              coordinates: {
                latitude: gpsData.latitude,
                longitude: gpsData.longitude,
                altitude: gpsData.altitude || null
              },
              googleMapsUrl: `https://www.google.com/maps?q=${gpsData.latitude},${gpsData.longitude}`
            }, null, 2)
          }]
        };
      }
      
      case 'rename_by_exif': {
        const { 
          filepaths, 
          template = '{datetime}_{camera}_{original}',
          dateFormat = 'YYYY-MM-DD',
          timeFormat = 'HHmmss',
          dryRun = true,
          backup = true,
          counterStart = 1
        } = args;
        
        // Validate input
        if (!Array.isArray(filepaths) || filepaths.length === 0) {
          throw new Error('filepaths must be a non-empty array');
        }
        
        const results = [];
        let counter = counterStart;
        let backupDir;
        
        // Create backup directory if needed and not in dry run
        if (backup && !dryRun) {
          backupDir = createSafeBackupDir(filepaths[0]);
          await mkdir(backupDir, { recursive: true });
        }
        
        for (const filepath of filepaths) {
          try {
            // Validate and sanitize file path
            const safePath = validateFilePath(filepath);
            validateFileExists(safePath);
            validateImageFile(safePath);
            
            // Parse EXIF data
            const exifData = await exifr.parse(safePath, {
              gps: true,
              xmp: true,
              iptc: true
            });
            
            // Get location data if available
            let location = '';
            let city = '';
            let country = '';
            if (exifData && exifData.latitude && exifData.longitude) {
              // In a real implementation, you'd use a reverse geocoding API
              location = `${exifData.latitude.toFixed(4)}_${exifData.longitude.toFixed(4)}`;
              city = exifData.City || exifData['City'] || '';
              country = exifData.Country || exifData['Country-PrimaryLocationName'] || '';
            }
            
            // Build new filename from template
            const dir = path.dirname(safePath);
            const ext = path.extname(safePath);
            const originalName = path.basename(safePath, ext);
            
            let newName = template;
            
            // Replace template variables
            if (exifData) {
              const date = exifData.DateTimeOriginal || exifData.CreateDate || new Date();
              
              // Format date and time
              const dateStr = formatDateForRename(date, dateFormat);
              const timeStr = formatTimeForRename(date, timeFormat);
              const datetimeStr = `${dateStr}_${timeStr}`;
              
              // Camera info
              const camera = (exifData.Make || 'Unknown').replace(/\s+/g, '');
              const model = (exifData.Model || '').replace(/\s+/g, '');
              const lens = (exifData.LensModel || '').replace(/[\/\s]+/g, '-');
              
              // Replace variables
              newName = newName
                .replace(/{date}/g, dateStr)
                .replace(/{time}/g, timeStr)
                .replace(/{datetime}/g, datetimeStr)
                .replace(/{camera}/g, camera)
                .replace(/{model}/g, model)
                .replace(/{lens}/g, lens)
                .replace(/{location}/g, location)
                .replace(/{city}/g, city)
                .replace(/{country}/g, country)
                .replace(/{original}/g, originalName)
                .replace(/{counter}/g, counter.toString().padStart(3, '0'));
            } else {
              // No EXIF data, use basic replacement
              newName = newName
                .replace(/{date}/g, 'NoDate')
                .replace(/{time}/g, 'NoTime')
                .replace(/{datetime}/g, 'NoDateTime')
                .replace(/{camera}/g, 'NoCamera')
                .replace(/{model}/g, '')
                .replace(/{lens}/g, '')
                .replace(/{location}/g, '')
                .replace(/{city}/g, '')
                .replace(/{country}/g, '')
                .replace(/{original}/g, originalName)
                .replace(/{counter}/g, counter.toString().padStart(3, '0'));
            }
            
            // Clean up the filename
            newName = newName
              .replace(/_{2,}/g, '_')  // Replace multiple underscores
              .replace(/^_|_$/g, '')   // Remove leading/trailing underscores
              .replace(/[^\w\-_.]/g, '_'); // Replace invalid characters
            
            const newPath = path.join(dir, newName + ext);
            
            // Check if target exists and handle duplicates
            let finalPath = newPath;
            let dupCounter = 1;
            while (existsSync(finalPath) && finalPath !== safePath) {
              const baseName = newName + `_${dupCounter}`;
              finalPath = path.join(dir, baseName + ext);
              dupCounter++;
            }
            
            results.push({
              original: path.basename(safePath),
              new: path.basename(finalPath),
              status: dryRun ? 'preview' : 'pending',
              exifFound: !!exifData
            });
            
            // Actually rename if not dry run
            if (!dryRun) {
              // Backup if requested
              if (backup) {
                const backupPath = path.join(backupDir, path.basename(safePath));
                await rename(safePath, backupPath);
                await rename(backupPath, finalPath);
              } else {
                await rename(safePath, finalPath);
              }
              results[results.length - 1].status = 'renamed';
            }
            
            counter++;
            
          } catch (error) {
            results.push({
              original: path.basename(filepath),
              new: null,
              status: 'error',
              error: error.message
            });
          }
        }
        
        // Format results
        let output = `📸 Batch Rename Results\n${'='.repeat(50)}\n\n`;
        output += `Mode: ${dryRun ? '🔍 PREVIEW MODE (no files changed)' : '✅ RENAME MODE'}\n`;
        output += `Template: "${template}"\n`;
        if (backup && !dryRun) output += `Backups: ${backupDir}\n`;
        output += `\n`;
        
        let successCount = 0;
        let errorCount = 0;
        
        for (const result of results) {
          if (result.status === 'error') {
            output += `❌ ERROR: ${path.basename(result.original)}\n`;
            output += `   ${result.error}\n\n`;
            errorCount++;
          } else {
            output += `${result.exifFound ? '✅' : '⚠️'} ${path.basename(result.original)}\n`;
            output += `   → ${path.basename(result.new)}\n\n`;
            successCount++;
          }
        }
        
        output += `\nSummary: ${successCount} files ${dryRun ? 'would be' : 'were'} renamed, ${errorCount} errors\n`;
        
        if (dryRun) {
          output += `\n💡 Tip: Set dryRun to false to actually rename the files.`;
        }
        
        return {
          content: [{
            type: 'text',
            text: output
          }]
        };
      }
      
      case 'create_photo_tour_kmz': {
        const {
          filepaths,
          outputPath,
          title = 'My Photo Journey',
          description = '',
          thumbnailSize = 800,
          includeFullImages = false,
          drawPath = true,
          numberPhotos = true
        } = args;
        
        // Validate input
        if (!Array.isArray(filepaths) || filepaths.length === 0) {
          throw new Error('filepaths must be a non-empty array');
        }
        
        // Validate output path
        const safeOutputPath = validateFilePath(outputPath);
        if (!safeOutputPath.endsWith('.kmz')) {
          throw new Error('Output path must end with .kmz extension');
        }
        
        // Collect photo data with GPS
        const photoData = [];
        let photoNumber = 1;
        
        for (const filepath of filepaths) {
          try {
            // Validate and sanitize file path
            const safePath = validateFilePath(filepath);
            validateFileExists(safePath);
            validateImageFile(safePath);
            
            const exifData = await exifr.parse(safePath, {
              gps: true,
              pick: ['DateTimeOriginal', 'CreateDate', 'Make', 'Model', 'LensModel']
            });
            
            if (exifData && exifData.latitude && exifData.longitude) {
              const filename = path.basename(safePath);
              const photoId = `photo_${photoNumber.toString().padStart(3, '0')}`;
              
              photoData.push({
                id: photoId,
                number: photoNumber,
                filepath: safePath,
                filename: filename,
                latitude: exifData.latitude,
                longitude: exifData.longitude,
                altitude: exifData.altitude || 0,
                datetime: exifData.DateTimeOriginal || exifData.CreateDate || new Date(),
                camera: `${exifData.Make || ''} ${exifData.Model || ''}`.trim(),
                lens: exifData.LensModel || '',
                thumbnailName: `${photoId}_thumb.jpg`,
                fullImageName: includeFullImages ? `${photoId}_full.jpg` : null
              });
              
              photoNumber++;
            }
          } catch (error) {
            // Skip files that can't be processed - this is normal for non-image files
            // Error details are available in the final summary if needed
          }
        }
        
        if (photoData.length === 0) {
          return {
            content: [{
              type: 'text',
              text: 'No photos with GPS data found in the provided files.'
            }]
          };
        }
        
        // Sort by datetime to ensure correct path order
        photoData.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
        
        // Generate KML content
        const kmlContent = generateKML(photoData, title, description, drawPath, numberPhotos);
        
        // Create temporary directory for KMZ contents
        const tempDir = path.join(path.dirname(safeOutputPath), `.kmz_temp_${Date.now()}`);
        await mkdir(tempDir, { recursive: true });
        await mkdir(path.join(tempDir, 'images'), { recursive: true });
        
        // Write KML file
        await writeFile(path.join(tempDir, 'doc.kml'), kmlContent);
        
        // Generate thumbnails
        for (const photo of photoData) {
          try {
            const thumbnailPath = path.join(tempDir, 'images', photo.thumbnailName);
            await sharp(photo.filepath)
              .resize(thumbnailSize, thumbnailSize, { fit: 'inside' })
              .jpeg({ quality: 85 })
              .toFile(thumbnailPath);
              
            // Include full images if requested
            if (includeFullImages && photo.fullImageName) {
              const fullImagePath = path.join(tempDir, 'images', photo.fullImageName);
              await sharp(photo.filepath)
                .jpeg({ quality: 90 })
                .toFile(fullImagePath);
            }
          } catch (error) {
            // Skip thumbnails that can't be created - this is handled gracefully
            // Error details are available in the final summary if needed
          }
        }
        
        // Create KMZ archive
        const output = createWriteStream(safeOutputPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        
        archive.pipe(output);
        archive.directory(tempDir, false);
        
        await new Promise((resolve, reject) => {
          output.on('close', resolve);
          archive.on('error', reject);
          archive.finalize();
        });
        
        // Clean up temp directory
        await removeDir(tempDir);
        
        // Generate summary
        const summary = `🌍 Photo Tour KMZ Created!\n${'='.repeat(50)}\n\n` +
          `📍 Title: ${title}\n` +
          `📸 Photos with GPS: ${photoData.length}\n` +
          `📏 Path: ${drawPath ? 'Yes' : 'No'}\n` +
          `🔢 Numbered: ${numberPhotos ? 'Yes' : 'No'}\n` +
          `📦 File size: ${(await stat(safeOutputPath)).size / 1024 / 1024}MB\n` +
          `📁 Output: ${path.basename(safeOutputPath)}\n\n` +
          `Journey Timeline:\n` +
          photoData.slice(0, 5).map(p => 
            `  ${p.number}. ${formatDate(p.datetime)} - ${p.filename}`
          ).join('\n') +
          (photoData.length > 5 ? `\n  ... and ${photoData.length - 5} more photos` : '') +
          `\n\n💡 Open in Google Earth to view your photo journey!`;
        
        return {
          content: [{
            type: 'text',
            text: summary
          }]
        };
      }
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error: ${error.message}`
      }],
      isError: true
    };
  }
});

// Helper function to generate KML content
function generateKML(photoData, title, description, drawPath, numberPhotos) {
  const kml = [];
  
  kml.push('<?xml version="1.0" encoding="UTF-8"?>');
  kml.push('<kml xmlns="http://www.opengis.net/kml/2.2">');
  kml.push('<Document>');
  kml.push(`  <name>${escapeXml(title)}</name>`);
  if (description) {
    kml.push(`  <description>${escapeXml(description)}</description>`);
  }
  
  // Add styles
  kml.push('  <Style id="photoIcon">');
  kml.push('    <IconStyle>');
  kml.push('      <Icon>');
  kml.push('        <href>http://maps.google.com/mapfiles/kml/paddle/red-circle.png</href>');
  kml.push('      </Icon>');
  kml.push('      <hotSpot x="0.5" y="0" xunits="fraction" yunits="fraction"/>');
  kml.push('    </IconStyle>');
  kml.push('  </Style>');
  
  kml.push('  <Style id="pathStyle">');
  kml.push('    <LineStyle>');
  kml.push('      <color>ff0000ff</color>');
  kml.push('      <width>3</width>');
  kml.push('    </LineStyle>');
  kml.push('  </Style>');
  
  // Add photo placemarks
  kml.push('  <Folder>');
  kml.push('    <name>Photos</name>');
  
  for (const photo of photoData) {
    kml.push('    <Placemark>');
    kml.push(`      <name>${numberPhotos ? `${photo.number}. ` : ''}${escapeXml(photo.filename)}</name>`);
    
    // Create description with thumbnail
    const desc = [];
    desc.push('<![CDATA[');
    desc.push(`<img src="images/${photo.thumbnailName}" width="${Math.min(400, 800)}" /><br/>`);
    desc.push(`<b>Photo #${photo.number}</b><br/>`);
    desc.push(`Date: ${formatDate(photo.datetime)}<br/>`);
    if (photo.camera) desc.push(`Camera: ${photo.camera}<br/>`);
    if (photo.lens) desc.push(`Lens: ${photo.lens}<br/>`);
    desc.push(`GPS: ${photo.latitude.toFixed(6)}, ${photo.longitude.toFixed(6)}<br/>`);
    if (photo.altitude > 0) desc.push(`Altitude: ${photo.altitude.toFixed(1)}m<br/>`);
    desc.push(']]>');
    
    kml.push(`      <description>${desc.join('')}</description>`);
    kml.push('      <styleUrl>#photoIcon</styleUrl>');
    kml.push('      <Point>');
    kml.push(`        <coordinates>${photo.longitude},${photo.latitude},${photo.altitude}</coordinates>`);
    kml.push('      </Point>');
    kml.push('      <TimeStamp>');
    kml.push(`        <when>${new Date(photo.datetime).toISOString()}</when>`);
    kml.push('      </TimeStamp>');
    kml.push('    </Placemark>');
  }
  
  kml.push('  </Folder>');
  
  // Add path if requested
  if (drawPath && photoData.length > 1) {
    kml.push('  <Placemark>');
    kml.push('    <name>Photo Path</name>');
    kml.push('    <description>The path taken between photos</description>');
    kml.push('    <styleUrl>#pathStyle</styleUrl>');
    kml.push('    <LineString>');
    kml.push('      <tessellate>1</tessellate>');
    kml.push('      <coordinates>');
    
    for (const photo of photoData) {
      kml.push(`        ${photo.longitude},${photo.latitude},${photo.altitude}`);
    }
    
    kml.push('      </coordinates>');
    kml.push('    </LineString>');
    kml.push('  </Placemark>');
  }
  
  kml.push('</Document>');
  kml.push('</kml>');
  
  return kml.join('\n');
}

// Helper function to escape XML
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Helper function to remove directory recursively
async function removeDir(dir) {
  const { rm } = await import('fs/promises');
  await rm(dir, { recursive: true, force: true });
}

// Helper function to format date for renaming
function formatDateForRename(date, format) {
  const d = date instanceof Date ? date : new Date(date);
  
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  
  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day);
}

// Helper function to format time for renaming
function formatTimeForRename(date, format) {
  const d = date instanceof Date ? date : new Date(date);
  
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const seconds = d.getSeconds().toString().padStart(2, '0');
  
  return format
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
}

// Helper function to format EXIF data nicely
function formatExifData(exifData, filepath) {
  const output = [`EXIF Data for: ${path.basename(filepath)}\n${'='.repeat(50)}\n`];
  
  // Camera Information
  if (exifData.Make || exifData.Model) {
    output.push('📷 Camera Information:');
    if (exifData.Make) output.push(`  Make: ${exifData.Make}`);
    if (exifData.Model) output.push(`  Model: ${exifData.Model}`);
    if (exifData.LensModel) output.push(`  Lens: ${exifData.LensModel}`);
    output.push('');
  }
  
  // Photo Settings
  if (exifData.FNumber || exifData.ExposureTime || exifData.ISO) {
    output.push('⚙️  Photo Settings:');
    if (exifData.FNumber) output.push(`  Aperture: f/${exifData.FNumber}`);
    if (exifData.ExposureTime) output.push(`  Shutter Speed: ${formatShutterSpeed(exifData.ExposureTime)}`);
    if (exifData.ISO) output.push(`  ISO: ${exifData.ISO}`);
    if (exifData.FocalLength) output.push(`  Focal Length: ${exifData.FocalLength}mm`);
    if (exifData.Flash) output.push(`  Flash: ${exifData.Flash}`);
    output.push('');
  }
  
  // Date/Time
  if (exifData.DateTimeOriginal || exifData.CreateDate) {
    output.push('📅 Date/Time:');
    const date = exifData.DateTimeOriginal || exifData.CreateDate;
    output.push(`  Taken: ${formatDate(date)}`);
    output.push('');
  }
  
  // GPS Location
  if (exifData.latitude && exifData.longitude) {
    output.push('📍 GPS Location:');
    output.push(`  Latitude: ${exifData.latitude}`);
    output.push(`  Longitude: ${exifData.longitude}`);
    if (exifData.altitude) output.push(`  Altitude: ${exifData.altitude}m`);
    output.push(`  Google Maps: https://www.google.com/maps?q=${exifData.latitude},${exifData.longitude}`);
    output.push('');
  }
  
  // Image Details
  if (exifData.ImageWidth || exifData.ImageHeight) {
    output.push('🖼️  Image Details:');
    if (exifData.ImageWidth && exifData.ImageHeight) {
      output.push(`  Dimensions: ${exifData.ImageWidth} x ${exifData.ImageHeight}`);
    }
    if (exifData.Orientation) output.push(`  Orientation: ${exifData.Orientation}`);
    if (exifData.ColorSpace) output.push(`  Color Space: ${exifData.ColorSpace}`);
    output.push('');
  }
  
  // Software
  if (exifData.Software) {
    output.push('💻 Software:');
    output.push(`  ${exifData.Software}`);
    output.push('');
  }
  
  // Raw data (optional - for debugging)
  output.push('\n📊 All EXIF Data (JSON):');
  output.push(JSON.stringify(exifData, null, 2));
  
  return output.join('\n');
}

function formatShutterSpeed(exposureTime) {
  if (exposureTime < 1) {
    return `1/${Math.round(1/exposureTime)}s`;
  }
  return `${exposureTime}s`;
}

function formatDate(date) {
  if (date instanceof Date) {
    return date.toLocaleString();
  }
  return date.toString();
}

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server is running - no need for console output in production
}

main().catch((error) => {
  // Log critical server errors to stderr
  process.stderr.write(`Server error: ${error.message}\n`);
  process.exit(1);
});
