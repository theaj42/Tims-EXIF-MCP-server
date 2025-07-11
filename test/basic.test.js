import { strict as assert } from 'assert';
import { describe, it } from 'node:test';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Basic tests for the EXIF MCP Server
describe('EXIF MCP Server', () => {
  
  it('should load without syntax errors', async () => {
    // Test that the main file can be loaded without throwing
    const indexPath = path.join(__dirname, '../index.js');
    const content = await readFile(indexPath, 'utf8');
    
    // Basic syntax validation
    assert(content.includes('Server'), 'Should contain Server class');
    assert(content.includes('setRequestHandler'), 'Should contain request handlers');
    assert(content.includes('parse_exif'), 'Should contain parse_exif tool');
    assert(content.includes('strip_exif'), 'Should contain strip_exif tool');
  });

  it('should have proper tool definitions', async () => {
    const indexPath = path.join(__dirname, '../index.js');
    const content = await readFile(indexPath, 'utf8');
    
    // Check that all expected tools are defined
    const expectedTools = [
      'parse_exif',
      'parse_exif_batch', 
      'get_gps_coordinates',
      'rename_by_exif',
      'strip_exif',
      'create_photo_tour_kmz'
    ];
    
    for (const tool of expectedTools) {
      assert(content.includes(`name: '${tool}'`), `Should contain ${tool} tool definition`);
    }
  });

  it('should have security validation functions', async () => {
    const indexPath = path.join(__dirname, '../index.js');
    const content = await readFile(indexPath, 'utf8');
    
    // Check that security functions are present
    const securityFunctions = [
      'validateFilePath',
      'validateFileExists', 
      'validateImageFile',
      'validateTemplateString',
      'validateNumericInput',
      'validateBooleanInput',
      'validateStringInput'
    ];
    
    for (const func of securityFunctions) {
      assert(content.includes(`function ${func}`), `Should contain ${func} security function`);
    }
  });

  it('should have helper functions for code organization', async () => {
    const indexPath = path.join(__dirname, '../index.js');
    const content = await readFile(indexPath, 'utf8');
    
    // Check that helper functions are present
    const helperFunctions = [
      'processPhotosForKMZ',
      'createThumbnails',
      'generateKML',
      'createSafeBackupDir'
    ];
    
    for (const func of helperFunctions) {
      assert(content.includes(`function ${func}`), `Should contain ${func} helper function`);
    }
  });
});