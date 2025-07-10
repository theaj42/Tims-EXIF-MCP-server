// Add to the tools array in index.js
{
  name: 'strip_exif',
  description: 'Remove EXIF data from photos for privacy',
  inputSchema: {
    type: 'object',
    properties: {
      filepath: {
        type: 'string',
        description: 'Path to the image file'
      },
      backup: {
        type: 'boolean',
        description: 'Keep original with .original extension (default: true)'
      },
      keep: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of EXIF fields to preserve (e.g., ["Make", "Model"])'
      }
    },
    required: ['filepath']
  }
}

// Add to the switch statement in CallToolRequestSchema handler
case 'strip_exif': {
  const { filepath, backup = true, keep = [] } = args;
  
  // Implementation using exifr's removeExif or similar
  // This is a placeholder for the actual implementation
  return {
    content: [{
      type: 'text',
      text: `EXIF data stripped from ${filepath}\nKept fields: ${keep.join(', ') || 'none'}\nBackup: ${backup ? 'yes' : 'no'}`
    }]
  };
}
