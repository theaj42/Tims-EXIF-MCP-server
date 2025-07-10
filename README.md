# EXIF MCP Server

An MCP (Model Context Protocol) server for parsing EXIF metadata from photos and creating geotagged tours. Built for Tim! 📸

## Features

- Parse complete EXIF data from images
- Batch processing for multiple images
- Extract just GPS coordinates with Google Maps links
- Batch rename files based on EXIF data
- **NEW: Create KMZ photo tours for Google Earth** 🌍
- Beautiful formatted output with emojis
- Support for various metadata types (GPS, XMP, IPTC, etc.)

## Installation

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Add to Claude Desktop config:
   ```json
   {
     "mcpServers": {
       "exif": {
         "command": "node",
         "args": ["/path/to/exif-mcp-server/index.js"]
       }
     }
   }
   ```

## Usage

The server provides five tools:

### `parse_exif`
Parse EXIF data from a single image:
```javascript
{
  "filepath": "/path/to/image.jpg",
  "options": {
    "gps": true,      // Include GPS data (default: true)
    "thumbnail": false, // Include thumbnail (default: false)
    "xmp": true,      // Include XMP data (default: true)
    "icc": false,     // Include ICC profile (default: false)
    "iptc": true      // Include IPTC data (default: true)
  }
}
```

### `parse_exif_batch`
Parse EXIF data from multiple images:
```javascript
{
  "filepaths": [
    "/path/to/image1.jpg",
    "/path/to/image2.jpg"
  ],
  "options": { /* same as above */ }
}
```

### `get_gps_coordinates`
Extract just GPS coordinates:
```javascript
{
  "filepath": "/path/to/image.jpg"
}
```

### `rename_by_exif`
Batch rename files based on their EXIF data:
```javascript
{
  "filepaths": [
    "/path/to/IMG_001.jpg",
    "/path/to/DSC_002.jpg"
  ],
  "template": "{datetime}_{camera}_{counter}",
  "dryRun": true,  // Preview mode (default: true)
  "backup": true   // Create backups (default: true)
}
```

### `create_photo_tour_kmz` ✨ NEW!
Create a KMZ file with geotagged photos for Google Earth:
```javascript
{
  "filepaths": [
    "/path/to/photo1.jpg",
    "/path/to/photo2.jpg",
    "/path/to/photo3.jpg"
  ],
  "outputPath": "/path/to/my-vacation.kmz",
  "title": "Summer Vacation 2024",
  "description": "Our amazing trip through Italy",
  "numberPhotos": true,      // Number photos chronologically
  "drawPath": true,          // Draw path between locations
  "thumbnailSize": 800,      // Thumbnail size in pixels
  "includeFullImages": false // Include full-res images (large file!)
}
```

## KMZ Photo Tours 🌍

The new `create_photo_tour_kmz` tool creates interactive photo tours that can be viewed in Google Earth. Features include:

### Automatic Features
- **Chronological ordering** - Photos sorted by date taken
- **Numbered waypoints** - Each photo numbered in sequence (1, 2, 3...)
- **Path visualization** - Line showing the route between photo locations
- **Thumbnail previews** - Click markers to see photo thumbnails
- **Photo metadata** - Date, time, camera, GPS coordinates displayed
- **Timeline animation** - Google Earth can animate through your journey

### Usage Examples

**Basic photo tour:**
```
"Create a KMZ file from all photos in my Italy trip folder"
```

**Detailed tour with options:**
```
"Create a photo tour KMZ called 'Chicago-Architecture-Walk.kmz' with title 'Chicago Architecture Tour' and draw the walking path between photos"
```

**High-quality version:**
```
"Make a KMZ with full-resolution images included for my portfolio presentation"
```

### What Gets Created

The KMZ file contains:
- KML document with all photo locations
- Numbered markers for each photo (1, 2, 3...)
- Thumbnail images (default 800px)
- Optional full-resolution images
- Path line connecting photos in chronological order
- Rich descriptions with camera metadata

### Viewing Your Photo Tour

1. **Google Earth Pro** (recommended):
   - Open the KMZ file
   - Use the time slider to animate through photos
   - Click markers to see photo details
   - Follow the numbered path of your journey

2. **Google Earth Web**:
   - Upload to Google My Maps
   - Share with others via link

3. **Google Earth Mobile**:
   - View on your phone/tablet
   - Great for sharing trip memories

## Rename Templates

The `rename_by_exif` tool supports these template variables:

- `{date}` - Date taken (YYYY-MM-DD)
- `{time}` - Time taken (HHmmss)
- `{datetime}` - Combined date and time
- `{camera}` - Camera make (e.g., Canon, Nikon)
- `{model}` - Camera model (e.g., EOS R5)
- `{lens}` - Lens model
- `{location}` - GPS coordinates
- `{city}` - City name (if available in EXIF)
- `{country}` - Country name (if available in EXIF)
- `{original}` - Original filename (without extension)
- `{counter}` - Sequential number (001, 002, etc.)

## Complete Workflow Example

Here's how to organize and share a photo journey:

1. **Rename photos chronologically:**
   ```
   "Rename all photos in the trip folder using {date}_{time}_{counter} to put them in order"
   ```

2. **Create the photo tour:**
   ```
   "Create a KMZ tour from the renamed photos with title 'Pacific Coast Road Trip 2024'"
   ```

3. **Result:**
   - Photos renamed: `2024-07-09_143022_001.jpg`, `2024-07-09_151545_002.jpg`, etc.
   - KMZ file with numbered markers showing your exact route
   - Click any marker to see the photo and details
   - Timeline shows progression of your journey

## Tips for Best Results

1. **Enable GPS on your camera/phone** before taking photos
2. **Take photos in chronological order** for accurate path drawing
3. **Use meaningful filenames** before creating the tour
4. **Preview with smaller thumbnail sizes** to reduce file size
5. **Include full images only** for special presentations (creates large files)

## Supported Formats

- JPEG/JPG
- PNG (limited EXIF support)
- TIFF
- HEIC/HEIF
- WebP
- AVIF

## License

MIT - Have fun with it, Tim!
