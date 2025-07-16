/**
 * Cloudflare Worker Page Management System
 * 
 * A lightweight CMS (Content Management System) built on Cloudflare Workers.
 * Features:
 * - Create, edit, delete and list pages
 * - Support for text content and file uploads
 * - Basic authentication system
 * - File preview for images
 * - File download for other types
 * - Clean and responsive UI
 * 
 * Main components:
 * 1. Authentication handler
 * 2. Page content server
 * 3. File upload handler
 * 4. Page management functions
 * 5. UI rendering functions
 *
 * Usage:
 * - Deploy to Cloudflare Workers
 * - Set up KV namespace
 * - Configure admin password
 * - Access via browser
 *
 * Security:
 * - Basic cookie-based authentication
 * - Password protection for admin functions
 * 
 * @author Original author
 * @version 1.0
 */


const ADMIN_PASSWORD = ''; // 修改为你的访问密码
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
        message: 'Hello, I am working',
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
          return new Response(renderLoginForm('密码错误，请重试'), {
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
    console.error('处理请求时发生错误:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

// 登录表单渲染
function renderLoginForm(errorMsg = '') {
  return `
    <!DOCTYPE html>
    <html lang="zh">
    <head>
      <meta charset="UTF-8">
      <title>请输入密码</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          background-color: #f7f7f7;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          margin: 0;
        }
        .login-box {
          background: white;
          padding: 30px;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          text-align: center;
          width: 100%;
          max-width: 400px;
        }
        input[type="password"] {
          width: 100%;
          padding: 10px;
          margin-top: 10px;
          margin-bottom: 20px;
          border: 1px solid #ccc;
          border-radius: 5px;
        }
        button {
          padding: 10px 20px;
          background-color: #5cb85c;
          color: white;
          border: none;
          border-radius: 5px;
          cursor: pointer;
        }
        button:hover {
          background-color: #4cae4c;
        }
        .error {
          color: red;
          margin-bottom: 10px;
        }
      </style>
    </head>
    <body>
      <div class="login-box">
        <h2>请输入访问密码</h2>
        ${errorMsg ? `<div class="error">${errorMsg}</div>` : ''}
        <form method="POST">
          <input type="password" name="password" placeholder="密码" required />
          <br />
          <button type="submit">提交</button>
        </form>
      </div>
    </body>
    </html>
  `;
}

/**
 * 提供页面内容
 * @param {Request} request - 客户端请求对象
 * @param {string} key - 页面键名
 * @returns {Response} 页面内容响应
 */
async function servePage(request, key) {
  const data = await KV.get(key, { type: "text" });
  
  if (!data) {
    return new Response('页面未找到', { 
      status: 404, 
      headers: { 'Content-Type': 'text/plain; charset=utf-8' } 
    });
  }
  
  // 尝试解析为JSON格式(文件存储)
  let parsedData;
  try {
    parsedData = JSON.parse(data);
  } catch (e) {
    // 不是JSON，返回普通文本内容，使用pre标签保留格式
    // 检查内容是否已经包含HTML标签
    if (/<html|<!DOCTYPE|<body|<div|<script|<style/i.test(data)) {
      // 已经是HTML内容，直接返回
      return new Response(data, { 
        headers: { 'Content-Type': 'text/html; charset=utf-8' } 
      });
    } else {
      // 纯文本内容，用pre标签包装以保留格式
      const escapedContent = data
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
        
      const htmlResponse = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${decodeURIComponent(key)}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              padding: 20px;
              max-width: 900px;
              margin: 0 auto;
            }
            pre {
              white-space: pre-wrap;
              word-wrap: break-word;
              background-color: #f9f9f9;
              border: 1px solid #ddd;
              padding: 15px;
              border-radius: 5px;
              overflow-x: auto;
            }
            .controls {
              margin-bottom: 20px;
            }
            .controls a {
              display: inline-block;
              margin-right: 10px;
              padding: 5px 10px;
              background-color: #f0f0f0;
              color: #333;
              text-decoration: none;
              border-radius: 3px;
              font-size: 14px;
            }
            .controls a:hover {
              background-color: #e0e0e0;
            }
          </style>
        </head>
        <body>
          <div class="controls">
            <a href="/${key}/e">编辑</a>
            <a href="/l">所有页面</a>
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
  
  // 处理文件内容
  if (parsedData && parsedData.fileName) {
    const { fileName, mimeType, content } = parsedData;
    
    // 图片预览
    if (mimeType.startsWith('image/')) {
      return serveImagePreview(content);
    } else {
      // 文件下载
      return serveFileDownload(fileName, mimeType, content);
    }
  } else {
    // 普通内容 (JSON但不是文件格式)
    return new Response(data, { 
      headers: { 'Content-Type': 'text/html; charset=utf-8' } 
    });
  }
}

/**
 * 展示图片预览页面
 * @param {string} imageContent - 包含base64图片数据的字符串
 * @returns {Response} 图片预览HTML页面
 */
function serveImagePreview(imageContent) {
  const html = `<!DOCTYPE html>
  <html lang="en">
    <head>
      <title>Image Preview</title>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { 
          margin: 0;
          padding: 20px;
          background-color: #f7f7f7;
          min-height: 100vh;
          font-family: Arial, sans-serif;
        }
        .container {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .controls {
          width: 100%;
          max-width: 900px;
          margin-bottom: 20px;
        }
        .controls a {
          display: inline-block;
          margin-right: 10px;
          padding: 5px 10px;
          background-color: #f0f0f0;
          color: #333;
          text-decoration: none;
          border-radius: 3px;
          font-size: 14px;
        }
        .controls a:hover {
          background-color: #e0e0e0;
        }
        .image-wrapper {
          display: flex;
          justify-content: center;
          align-items: center;
          background-color: white;
          padding: 10px;
          border-radius: 5px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        img { 
          max-width: 100%; 
          max-height: 80vh; 
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="controls">
          <a href="javascript:history.back()">返回</a>
          <a href="/l">所有页面</a>
        </div>
        <div class="image-wrapper">
          <img src="${imageContent}" alt="Image Preview">
        </div>
      </div>
    </body>
  </html>`;
  
  return new Response(html, { 
    headers: { 'Content-Type': 'text/html; charset=utf-8' } 
  });
}

/**
 * 提供文件下载
 * @param {string} fileName - 文件名
 * @param {string} mimeType - 文件MIME类型
 * @param {string} content - 文件内容(base64格式)
 * @returns {Response} 文件下载响应
 */
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

/**
 * 提供编辑表单页面
 * @param {string} key - 页面键名
 * @returns {Response} 编辑表单页面
 */
async function serveEditForm(key) {
  const data = await KV.get(key, { type: "text" }) || "";
  
  // 使用HTML实体编码来保存特殊字符
  const encodedData = data
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n/g, '&#10;')  // 换行符
    .replace(/\r/g, '&#13;')  // 回车符
    .replace(/\t/g, '&#9;');  // 制表符
  
  const form = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>编辑页面</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 20px;
          display: flex;
          justify-content: center;
          align-items: flex-start;
          min-height: 100vh;
          background-color: #f7f7f7;
        }
        form {
          width: 100%;
          max-width: 800px;
          background: #fff;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }
        textarea {
          width: 100%;
          height: 300px;
          margin-bottom: 15px;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 5px;
          resize: vertical;
          font-family: monospace;
          white-space: pre;
        }
        input[type="file"] {
          margin-bottom: 15px;
          width: 100%;
        }
        button {
          background-color: #5cb85c;
          color: white;
          padding: 10px 20px;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-size: 16px;
        }
        button:hover {
          background-color: #4cae4c;
        }
        .form-title {
          margin-top: 0;
          margin-bottom: 20px;
          color: #333;
        }
      </style>
    </head>
    <body>
      <form action="/${key}/e" method="post" enctype="multipart/form-data">
        <h2 class="form-title">编辑 "${decodeURIComponent(key)}"</h2>
        <textarea name="content">${encodedData}</textarea>
        <input type="file" name="file">
        <button type="submit">保存</button>
      </form>
    </body>
    </html>
  `;
  
  return new Response(form, { 
    status: 200, 
    headers: { 'Content-Type': 'text/html; charset=utf-8' } 
  });
}

/**
 * 保存页面内容
 * @param {Request} request - 客户端请求对象
 * @param {string} key - 页面键名
 * @returns {Response} 保存结果响应
 */
async function savePage(request, key) {
  try {
    const formData = await request.formData();
    const content = formData.get('content');
    const file = formData.get('file');
    let value;
    
    if (file && file.size > 0) {
      // 处理文件上传
      const imageBuffer = await file.arrayBuffer();
      const base64 = arrayBufferToBase64(imageBuffer);
      const mimeType = file.type;
      
      value = JSON.stringify({
        fileName: file.name,
        mimeType: mimeType,
        content: `data:${mimeType};base64,${base64}`
      });
    } else {
      // 处理文本内容 - 保持原始格式不变
      // 提交的表单内容会自动保留换行符和空格，无需额外处理
      value = content;
    }
    
    await KV.put(key, value);
    
    // 重定向回页面
    return new Response('', { 
      status: 302,
      headers: { 'Location': `/${key}` }
    });
  } catch (error) {
    console.error('保存页面时发生错误:', error);
    return new Response('保存失败', { status: 500 });
  }
}

/**
 * 将ArrayBuffer转换为Base64
 * @param {ArrayBuffer} buffer - 二进制数据
 * @returns {string} Base64编码的字符串
 */
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const byteLength = bytes.byteLength;
  
  for (let i = 0; i < byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  
  return btoa(binary);
}

/**
 * 删除页面
 * @param {string} key - 页面键名
 * @returns {Response} 删除结果响应
 */
async function deletePage(key) {
  try {
    await KV.delete(key);
    
    // 重定向到页面列表
    return new Response('', { 
      status: 302,
      headers: { 'Location': '/l' }
    });
  } catch (error) {
    console.error('删除页面时发生错误:', error);
    return new Response('删除失败', { status: 500 });
  }
}

/**
 * 确认删除页面
 * @param {string} key - 页面键名
 * @returns {Response} 确认删除页面
 */
async function confirmDeletePage(key) {
  const decodedKey = decodeURIComponent(key);
  
  const page = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>确认删除</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
          background-color: #f7f7f7;
        }
        .container {
          text-align: center;
          background: #fff;
          padding: 30px;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
          max-width: 500px;
          width: 90%;
        }
        h2 {
          margin-top: 0;
          color: #333;
        }
        .buttons {
          display: flex;
          justify-content: center;
          gap: 15px;
          margin-top: 20px;
        }
        button {
          padding: 10px 20px;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-size: 16px;
        }
        .delete {
          background-color: #d9534f;
          color: white;
        }
        .delete:hover {
          background-color: #c9302c;
        }
        .cancel {
          background-color: #5bc0de;
          color: white;
        }
        .cancel:hover {
          background-color: #46b8da;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>确认删除</h2>
        <p>您确定要删除 "${decodedKey}" 页面吗？</p>
        <div class="buttons">
          <form action="/${key}/d" method="post">
            <button type="submit" class="delete">删除</button>
          </form>
          <a href="/${key}"><button class="cancel">取消</button></a>
        </div>
      </div>
    </body>
    </html>
  `;
  
  return new Response(page, { 
    status: 200, 
    headers: { 'Content-Type': 'text/html; charset=utf-8' } 
  });
}

/**
 * 列出所有页面
 * @returns {Response} 页面列表响应
 */
async function listPages() {
  try {
    const keysResult = await KV.list();
    
    if (keysResult.keys.length === 0) {
      return serveEmptyListPage();
    }
    
    return serveListPage(keysResult.keys);
  } catch (error) {
    console.error('列出页面时发生错误:', error);
    return new Response('列出页面时发生错误', { 
      status: 500, 
      headers: { 'Content-Type': 'text/html; charset=utf-8' } 
    });
  }
}

/**
 * 提供空页面列表页面
 * @returns {Response} 空页面列表页面
 */
function serveEmptyListPage() {
  const page = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>页面列表</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          margin: 0;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          background-color: #f7f7f7;
        }
        #list-container {
          width: 80%;
          max-width: 600px;
          background: #fff;
          padding: 30px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          border-radius: 8px;
          text-align: center;
        }
        h1 {
          color: #333;
          margin-top: 0;
        }
        p {
          color: #666;
          margin-bottom: 20px;
        }
        .create-new {
          display: inline-block;
          margin-top: 15px;
          padding: 10px 20px;
          background-color: #5cb85c;
          color: white;
          text-decoration: none;
          border-radius: 5px;
        }
        .create-new:hover {
          background-color: #4cae4c;
        }
      </style>
    </head>
    <body>
      <div id="list-container">
        <h1>页面列表</h1>
        <p>当前没有任何页面</p>
        <a href="/new-page/e" class="create-new">创建新页面</a>
      </div>
    </body>
    </html>
  `;
  
  return new Response(page, { 
    status: 200, 
    headers: { 'Content-Type': 'text/html; charset=utf-8' } 
  });
}

/**
 * 提供页面列表页面
 * @param {Array} keys - 页面键数组
 * @returns {Response} 页面列表页面
 */
function serveListPage(keys) {
  // 排序并生成列表HTML
  const sortedKeys = [...keys].sort((a, b) => 
    decodeURIComponent(a.name).localeCompare(decodeURIComponent(b.name))
  );
  
  const listHtml = sortedKeys.map(key => 
    `<li>
      <div class="page-entry">
        <a href="/${key.name}" class="page-link">${decodeURIComponent(key.name)}</a>
        <div class="actions">
          <a href="/${key.name}/e" class="edit" title="编辑">✏️</a>
          <a href="/${key.name}/d" class="delete" title="删除">🗑️</a>
        </div>
      </div>
    </li>`
  ).join('');
  
  const page = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>页面列表</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          margin: 0;
          padding: 20px;
          background-color: #f7f7f7;
          display: flex;
          justify-content: center;
        }
        #list-container {
          width: 100%;
          max-width: 800px;
          background: #fff;
          padding: 30px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          border-radius: 8px;
        }
        h1 {
          color: #333;
          margin-top: 0;
          margin-bottom: 20px;
        }
        ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        li {
          margin-bottom: 4px;
        }
        .page-entry {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 15px;
          border-radius: 4px;
          background-color: #f9f9f9;
          transition: background-color 0.2s;
        }
        .page-entry:hover {
          background-color: #f0f0f0;
        }
        .page-link {
          color: #0366d6;
          text-decoration: none;
          flex-grow: 1;
          font-size: 16px;
        }
        .page-link:hover {
          text-decoration: underline;
        }
        .actions {
          display: flex;
          gap: 10px;
        }
        .actions a {
          text-decoration: none;
          font-size: 16px;
        }
        .create-new {
          display: inline-block;
          margin-top: 20px;
          padding: 10px 20px;
          background-color: #5cb85c;
          color: white;
          text-decoration: none;
          border-radius: 5px;
          font-size: 16px;
        }
        .create-new:hover {
          background-color: #4cae4c;
        }
      </style>
    </head>
    <body>
      <div id="list-container">
        <h1>页面列表</h1>
        <ul>${listHtml}</ul>
        <a href="/new-page/e" class="create-new">创建新页面</a>
      </div>
    </body>
    </html>
  `;
  
  return new Response(page, { 
    status: 200, 
    headers: { 'Content-Type': 'text/html; charset=utf-8' } 
  });
}

/**
 * 重命名页面
 * @param {string} oldKey - 原页面键名
 * @param {string} newKey - 新页面键名
 * @returns {Response} 重命名结果响应
 */
async function renamePage(oldKey, newKey) {
  try {
    const data = await KV.get(oldKey);
    
    if (!data) {
      return new Response('原页面未找到', { 
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
    
    await KV.put(newKey, data);
    await KV.delete(oldKey);
    
    // 重定向到新页面
    return new Response('', { 
      status: 302,
      headers: { 'Location': `/${newKey}` }
    });
  } catch (error) {
    console.error('重命名页面时发生错误:', error);
    return new Response('重命名失败', { status: 500 });
  }
}
