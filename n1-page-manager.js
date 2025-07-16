/**
 * Simple Wiki/CMS System for Cloudflare Workers
 * 
 * This is a lightweight content management system that runs on Cloudflare Workers with KV storage.
 * It provides basic wiki-like functionality including:
 * 
 * Features:
 * - Password protected admin access
 * - Create, read, update, and delete pages
 * - File upload support (including images)
 * - Basic HTML and plain text content support
 * - Simple and clean UI
 * - Page listing and management
 * - Page renaming capability
 * 
 * Security:
 * - Admin authentication via password
 * - Cookie-based session management
 * - HttpOnly cookies for security
 * 
 * Technical Stack:
 * - Runs on Cloudflare Workers
 * - Uses Cloudflare KV for storage
 * - Pure vanilla JavaScript/HTML/CSS
 * - No external dependencies
 * 
 * Routes:
 * - / : Service status
 * - /l : List all pages (requires auth)
 * - /new : Create new page form (requires auth)
 * - /{page} : View page
 * - /{page}/e : Edit page
 * - /{page}/d : Delete page
 * - /{page}/r/{newname} : Rename page
 */
 
 
 const ADMIN_PASSWORD = ''; // Set your access password
const AUTH_COOKIE_NAME = 'auth';
const AUTH_COOKIE_VALUE = 'ok';

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname.split('/').filter(p => p.length > 0);

  try {
    if (path.length === 0) {
      return new Response(JSON.stringify({
        status: 'success',
        message: 'Service is running',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (path.length === 1 && path[0] === 'l') {
      const cookie = request.headers.get('Cookie') || '';
      const authenticated = cookie.includes(`${AUTH_COOKIE_NAME}=${AUTH_COOKIE_VALUE}`);

      if (authenticated) {
        return await listPages();
      }

      if (request.method === 'POST') {
        const formData = await request.formData();
        const password = formData.get('password');

        if (password === ADMIN_PASSWORD) {
          return new Response('', {
            status: 302,
            headers: {
              'Set-Cookie': `${AUTH_COOKIE_NAME}=${AUTH_COOKIE_VALUE}; Path=/; HttpOnly`,
              'Location': '/l'
            }
          });
        } else {
          return new Response(renderLoginForm('Invalid password. Please try again.'), {
            status: 401,
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          });
        }
      }

      return new Response(renderLoginForm(), {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    if (path.length === 1 && path[0] === 'new') {
      const cookie = request.headers.get('Cookie') || '';
      const authenticated = cookie.includes(`${AUTH_COOKIE_NAME}=${AUTH_COOKIE_VALUE}`);
      
      if (!authenticated) {
        return new Response('Unauthorized', { status: 401 });
      }
      
      return serveNewPageForm();
    }

    if (path.length === 1 && path[0] === 'create') {
      const cookie = request.headers.get('Cookie') || '';
      const authenticated = cookie.includes(`${AUTH_COOKIE_NAME}=${AUTH_COOKIE_VALUE}`);
      
      if (!authenticated) {
        return new Response('Unauthorized', { status: 401 });
      }

      if (request.method === 'POST') {
        const formData = await request.formData();
        const pageName = formData.get('pageName');
        const content = formData.get('content');
        
        if (!pageName) {
          return new Response('Page name is required', { status: 400 });
        }
        
        try {
          await KV.put(pageName, content || '');
          return new Response('', {
            status: 302,
            headers: { 'Location': `/${pageName}` }
          });
        } catch (error) {
          console.error('Error creating page:', error);
          return new Response('Failed to create page', { status: 500 });
        }
      }
    }

    const key = path[0];

    if (path.length === 1) {
      return await servePage(request, key);
    }

    if (path.length === 2) {
      if (path[1] === 'e') {
        if (request.method === 'GET') {
          return await serveEditForm(key);
        } else if (request.method === 'POST') {
          return await savePage(request, key);
        }
      } else if (path[1] === 'd') {
        if (request.method === 'GET') {
          return await confirmDeletePage(key);
        } else if (request.method === 'POST') {
          return await deletePage(key);
        }
      }
    }

    if (path.length === 3 && path[1] === 'r') {
      const newKey = path[2];
      return await renamePage(key, newKey);
    }

    return new Response('Not Found', { status: 404 });
  } catch (error) {
    console.error('Error handling request:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

function renderLoginForm(errorMsg = '') {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Login</title>
      <style>
        body {
          font-family: system-ui, -apple-system, sans-serif;
          margin: 40px auto;
          max-width: 650px;
          line-height: 1.6;
          padding: 0 10px;
        }
        form {
          margin: 20px 0;
        }
        input[type="password"] {
          width: 100%;
          padding: 8px;
          margin: 8px 0;
          border: 1px solid #ddd;
        }
        button {
          padding: 8px 16px;
          background: #000;
          color: #fff;
          border: none;
          cursor: pointer;
        }
        .error {
          color: #d00;
          margin: 10px 0;
        }
      </style>
    </head>
    <body>
      <h1>Login Required</h1>
      ${errorMsg ? `<div class="error">${errorMsg}</div>` : ''}
      <form method="POST">
        <div>
          <label for="password">Password:</label>
          <input type="password" id="password" name="password" required>
        </div>
        <button type="submit">Submit</button>
      </form>
    </body>
    </html>
  `;
}

function serveNewPageForm() {
  const form = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Create New Page</title>
      <style>
        body {
          font-family: system-ui, -apple-system, sans-serif;
          margin: 40px auto;
          max-width: 650px;
          line-height: 1.6;
          padding: 0 10px;
        }
        form {
          margin: 20px 0;
        }
        input[type="text"] {
          width: 100%;
          padding: 8px;
          margin: 8px 0;
          border: 1px solid #ddd;
        }
        textarea {
          width: 100%;
          height: 300px;
          margin: 8px 0;
          padding: 8px;
          border: 1px solid #ddd;
          font-family: monospace;
        }
        button {
          padding: 8px 16px;
          background: #000;
          color: #fff;
          border: none;
          cursor: pointer;
        }
        .actions {
          margin: 20px 0;
        }
        .actions a {
          color: #000;
          text-decoration: none;
          margin-right: 15px;
        }
        .actions a:hover {
          text-decoration: underline;
        }
      </style>
    </head>
    <body>
      <div class="actions">
        <a href="/l">← Back to Pages</a>
      </div>
      <h1>Create New Page</h1>
      <form action="/create" method="post">
        <div>
          <label for="pageName">Page Name:</label>
          <input type="text" id="pageName" name="pageName" required>
        </div>
        <div>
          <label for="content">Content:</label>
          <textarea id="content" name="content"></textarea>
        </div>
        <button type="submit">Create Page</button>
      </form>
    </body>
    </html>
  `;
  
  return new Response(form, { 
    status: 200, 
    headers: { 'Content-Type': 'text/html; charset=utf-8' } 
  });
}

async function servePage(request, key) {
  const data = await KV.get(key, { type: "text" });
  
  if (!data) {
    return new Response('Page not found', { 
      status: 404, 
      headers: { 'Content-Type': 'text/plain; charset=utf-8' } 
    });
  }
  
  let parsedData;
  try {
    parsedData = JSON.parse(data);
  } catch (e) {
    if (/<html|<!DOCTYPE|<body|<div|<script|<style/i.test(data)) {
      return new Response(data, { 
        headers: { 'Content-Type': 'text/html; charset=utf-8' } 
      });
    } else {
      const escapedContent = data
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
        
      const htmlResponse = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${decodeURIComponent(key)}</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              margin: 40px auto;
              max-width: 650px;
              line-height: 1.6;
              padding: 0 10px;
            }
            pre {
              background: #f8f8f8;
              padding: 16px;
              overflow-x: auto;
            }
            .actions {
              margin: 20px 0;
            }
            .actions a {
              color: #000;
              text-decoration: none;
              margin-right: 15px;
            }
            .actions a:hover {
              text-decoration: underline;
            }
          </style>
        </head>
        <body>
          <div class="actions">
            <a href="/${key}/e">Edit</a>
            <a href="/l">All Pages</a>
          </div>
          <pre>${escapedContent}</pre>
        </body>
        </html>
      `;
      
      return new Response(htmlResponse, { 
        headers: { 'Content-Type': 'text/html; charset=utf-8' } 
      });
    }
  }
  
  if (parsedData && parsedData.fileName) {
    const { fileName, mimeType, content } = parsedData;
    
    if (mimeType.startsWith('image/')) {
      return serveImagePreview(content);
    } else {
      return serveFileDownload(fileName, mimeType, content);
    }
  } else {
    return new Response(data, { 
      headers: { 'Content-Type': 'text/html; charset=utf-8' } 
    });
  }
}

function serveImagePreview(imageContent) {
  const html = `<!DOCTYPE html>
  <html>
    <head>
      <title>Image Preview</title>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: system-ui, -apple-system, sans-serif;
          margin: 40px auto;
          max-width: 650px;
          line-height: 1.6;
          padding: 0 10px;
        }
        .actions {
          margin: 20px 0;
        }
        .actions a {
          color: #000;
          text-decoration: none;
          margin-right: 15px;
        }
        .actions a:hover {
          text-decoration: underline;
        }
        img {
          max-width: 100%;
          height: auto;
        }
      </style>
    </head>
    <body>
      <div class="actions">
        <a href="javascript:history.back()">Back</a>
        <a href="/l">All Pages</a>
      </div>
      <img src="${imageContent}" alt="Image Preview">
    </body>
  </html>`;
  
  return new Response(html, { 
    headers: { 'Content-Type': 'text/html; charset=utf-8' } 
  });
}

function serveFileDownload(fileName, mimeType, content) {
  const base64Content = content.split('base64,')[1];
  const binaryData = atob(base64Content);
  const arrayBuffer = new Uint8Array(binaryData.length);
  
  for (let i = 0; i < binaryData.length; i++) {
    arrayBuffer[i] = binaryData.charCodeAt(i);
  }
  
  const headers = {
    'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
    'Content-Type': mimeType
  };
  
  return new Response(arrayBuffer, { headers });
}

async function serveEditForm(key) {
  const data = await KV.get(key, { type: "text" }) || "";
  
  const encodedData = data
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n/g, '&#10;')
    .replace(/\r/g, '&#13;')
    .replace(/\t/g, '&#9;');
  
  const form = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Edit Page</title>
      <style>
        body {
          font-family: system-ui, -apple-system, sans-serif;
          margin: 40px auto;
          max-width: 650px;
          line-height: 1.6;
          padding: 0 10px;
        }
        textarea {
          width: 100%;
          height: 300px;
          margin: 10px 0;
          padding: 8px;
          border: 1px solid #ddd;
          font-family: monospace;
        }
        input[type="file"] {
          margin: 10px 0;
        }
        button {
          padding: 8px 16px;
          background: #000;
          color: #fff;
          border: none;
          cursor: pointer;
        }
      </style>
    </head>
    <body>
      <h1>Edit "${decodeURIComponent(key)}"</h1>
      <form action="/${key}/e" method="post" enctype="multipart/form-data">
        <textarea name="content">${encodedData}</textarea>
        <div>
          <input type="file" name="file">
        </div>
        <button type="submit">Save</button>
      </form>
    </body>
    </html>
  `;
  
  return new Response(form, { 
    status: 200, 
    headers: { 'Content-Type': 'text/html; charset=utf-8' } 
  });
}

async function savePage(request, key) {
  try {
    const formData = await request.formData();
    const content = formData.get('content');
    const file = formData.get('file');
    let value;
    
    if (file && file.size > 0) {
      const imageBuffer = await file.arrayBuffer();
      const base64 = arrayBufferToBase64(imageBuffer);
      const mimeType = file.type;
      
      value = JSON.stringify({
        fileName: file.name,
        mimeType: mimeType,
        content: `data:${mimeType};base64,${base64}`
      });
    } else {
      value = content;
    }
    
    await KV.put(key, value);
    
    return new Response('', { 
      status: 302,
      headers: { 'Location': `/${key}` }
    });
  } catch (error) {
    console.error('Error saving page:', error);
    return new Response('Save failed', { status: 500 });
  }
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const byteLength = bytes.byteLength;
  
  for (let i = 0; i < byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  
  return btoa(binary);
}

async function deletePage(key) {
  try {
    await KV.delete(key);
    
    return new Response('', { 
      status: 302,
      headers: { 'Location': '/l' }
    });
  } catch (error) {
    console.error('Error deleting page:', error);
    return new Response('Delete failed', { status: 500 });
  }
}

async function confirmDeletePage(key) {
  const decodedKey = decodeURIComponent(key);
  
  const page = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Confirm Delete</title>
      <style>
        body {
          font-family: system-ui, -apple-system, sans-serif;
          margin: 40px auto;
          max-width: 650px;
          line-height: 1.6;
          padding: 0 10px;
        }
        .actions {
          margin: 20px 0;
        }
        button {
          padding: 8px 16px;
          margin-right: 10px;
          border: none;
          cursor: pointer;
        }
        .delete {
          background: #d00;
          color: #fff;
        }
        .cancel {
          background: #000;
          color: #fff;
        }
      </style>
    </head>
    <body>
      <h1>Confirm Delete</h1>
      <p>Are you sure you want to delete "${decodedKey}"?</p>
      <div class="actions">
        <form action="/${key}/d" method="post" style="display: inline">
          <button type="submit" class="delete">Delete</button>
        </form>
        <a href="/${key}"><button class="cancel">Cancel</button></a>
      </div>
    </body>
    </html>
  `;
  
  return new Response(page, { 
    status: 200, 
    headers: { 'Content-Type': 'text/html; charset=utf-8' } 
  });
}

async function listPages() {
  try {
    const keysResult = await KV.list();
    
    if (keysResult.keys.length === 0) {
      return serveEmptyListPage();
    }
    
    return serveListPage(keysResult.keys);
  } catch (error) {
    console.error('Error listing pages:', error);
    return new Response('Error listing pages', { 
      status: 500, 
      headers: { 'Content-Type': 'text/html; charset=utf-8' } 
    });
  }
}

function serveEmptyListPage() {
  const page = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Pages</title>
      <style>
        body {
          font-family: system-ui, -apple-system, sans-serif;
          margin: 40px auto;
          max-width: 650px;
          line-height: 1.6;
          padding: 0 10px;
        }
        .create-new {
          display: inline-block;
          padding: 8px 16px;
          background: #000;
          color: #fff;
          text-decoration: none;
        }
      </style>
    </head>
    <body>
      <h1>Pages</h1>
      <p>No pages found</p>
      <a href="/new" class="create-new">Create New Page</a>
    </body>
    </html>
  `;
  
  return new Response(page, { 
    status: 200, 
    headers: { 'Content-Type': 'text/html; charset=utf-8' } 
  });
}

function serveListPage(keys) {
  const sortedKeys = [...keys].sort((a, b) => 
    decodeURIComponent(a.name).localeCompare(decodeURIComponent(b.name))
  );
  
  const listHtml = sortedKeys.map(key => 
    `<li>
      <a href="/${key.name}">${decodeURIComponent(key.name)}</a>
      <span class="actions">
        <a href="/${key.name}/e">Edit</a>
        <a href="/${key.name}/d">Delete</a>
      </span>
    </li>`
  ).join('');
  
  const page = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Pages</title>
      <style>
        body {
          font-family: system-ui, -apple-system, sans-serif;
          margin: 40px auto;
          max-width: 650px;
          line-height: 1.6;
          padding: 0 10px;
        }
        ul {
          list-style: none;
          padding: 0;
        }
        li {
          padding: 8px 0;
          border-bottom: 1px solid #eee;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        a {
          color: #000;
          text-decoration: none;
        }
        a:hover {
          text-decoration: underline;
        }
        .actions {
          font-size: 0.9em;
        }
        .actions a {
          margin-left: 10px;
        }
        .create-new {
          display: inline-block;
          padding: 8px 16px;
          background: #000;
          color: #fff;
          text-decoration: none;
          margin-top: 20px;
        }
        .create-new:hover {
          text-decoration: none;
          opacity: 0.9;
        }
      </style>
    </head>
    <body>
      <h1>Pages</h1>
      <ul>${listHtml}</ul>
      <a href="/new" class="create-new">Create New Page</a>
    </body>
    </html>
  `;
  
  return new Response(page, { 
    status: 200, 
    headers: { 'Content-Type': 'text/html; charset=utf-8' } 
  });
}

async function renamePage(oldKey, newKey) {
  try {
    const data = await KV.get(oldKey);
    
    if (!data) {
      return new Response('Original page not found', { 
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
    
    await KV.put(newKey, data);
    await KV.delete(oldKey);
    
    return new Response('', { 
      status: 302,
      headers: { 'Location': `/${newKey}` }
    });
  } catch (error) {
    console.error('Error renaming page:', error);
    return new Response('Rename failed', { status: 500 });
  }
}
