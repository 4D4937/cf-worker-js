/**
 * Simple File API - Cloudflare Worker
 * 
 * A lightweight file storage API built on Cloudflare Workers and KV storage.
 * Supports basic file operations including upload, download, listing and deletion.
 * 
 * Features:
 * - File Upload: Store files with metadata (size, type, upload time)
 * - File Download: Retrieve files with proper content type
 * - File Listing: Get a list of all stored files with their metadata
 * - File Deletion: Remove files and their associated metadata
 * - CORS Support: Cross-Origin Resource Sharing enabled
 * 
 * Requirements:
 * - Cloudflare Workers
 * - KV Namespace named "FILES"
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    try {
      if (path === '/') {
        const usage = {
          "Simple File API": {
            "Upload": "PUT /{filename}",
            "Download": "GET /{filename}",
            "List": "GET /list",
            "Delete": "DELETE /{filename}",
            "Examples": {
              "Upload": "curl -T file.txt https://bash.zrhe2016.workers.dev/file.txt",
              "Download": "curl https://bash.zrhe2016.workers.dev/file.txt",
              "List": "curl https://bash.zrhe2016.workers.dev/list",
              "Delete": "curl -X DELETE https://bash.zrhe2016.workers.dev/file.txt"
            }
          }
        };
        return new Response(JSON.stringify(usage, null, 2), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (path === '/list') {
        const list = await env.FILES.list();
        const files = await Promise.all(
          list.keys
            .filter(key => !key.name.endsWith(':metadata'))
            .map(async (key) => {
              const metadata = await env.FILES.get(`${key.name}:metadata`, 'json');
              return {
                name: key.name,
                size: metadata?.size || 0,
                time: metadata?.uploadTime 
                  ? new Date(metadata.uploadTime).toLocaleString()
                  : new Date().toLocaleString(),
                type: metadata?.contentType || 'application/octet-stream'
              };
            })
        );
        return new Response(JSON.stringify(files, null, 2), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const fileName = path.slice(1);
      if (!fileName || fileName === '') {
        return new Response('File name is required', { status: 400 });
      }

      if (request.method === 'PUT') {
        const contentType = request.headers.get('Content-Type') || 'application/octet-stream';
        const content = await request.arrayBuffer();
        
        const metadata = {
          contentType,
          size: content.byteLength,
          uploadTime: Date.now()
        };

        await env.FILES.put(fileName, content);
        await env.FILES.put(`${fileName}:metadata`, JSON.stringify(metadata));

        return new Response(JSON.stringify({
          ok: true,
          file: fileName,
          size: metadata.size,
          type: metadata.contentType,
          time: new Date(metadata.uploadTime).toLocaleString()
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (request.method === 'GET') {
        const content = await env.FILES.get(fileName, 'arrayBuffer');
        const metadata = await env.FILES.get(`${fileName}:metadata`, 'json');
        
        if (content === null || metadata === null) {
          return new Response('File not found', { status: 404 });
        }
        
        return new Response(content, {
          headers: { 'Content-Type': metadata.contentType },
        });
      }

      if (request.method === 'DELETE') {
        await env.FILES.delete(fileName);
        await env.FILES.delete(`${fileName}:metadata`);
        return new Response(JSON.stringify({ 
          ok: true, 
          deleted: fileName 
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      return new Response('Invalid request', { status: 405 });
    } catch (err) {
      return new Response('Internal error', { status: 500 });
    }
  },
};
