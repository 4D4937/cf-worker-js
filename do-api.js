/**
 * DigitalOcean Droplet Management API Service
 * 
 * This service provides a RESTful API interface to manage DigitalOcean Droplets,
 * implemented as a Cloudflare Worker. It supports the following operations:
 * 
 * Endpoints:
 * - GET /           : Display API usage documentation
 * - POST /          : Create a new Ubuntu droplet with pre-configured settings
 * - GET /<id>       : Retrieve a droplet's public IP address
 * - DELETE /delete-all : Remove all droplets (up to 200)
 * 
 * Features:
 * - Automatic cloud-init configuration for new droplets
 * - CORS support for cross-origin requests
 * - Error handling and status reporting
 * - Random name generation for new droplets
 * 
 * Security Note:
 * - Requires a valid DigitalOcean API token
 * - Implements CORS headers for browser security
 * 
 * Technical Details:
 * - Uses Ubuntu 22.04 LTS as base image
 * - Configures SSH access and root password
 * - Deploys on s-4vcpu-8gb-240gb-intel instance type
 * - Singapore (sgp1) region deployment
 */

// src/index.js

/**
 * Generate a random hexadecimal string of the given length (must be even)
 * @param {number} len - Length of the returned string
 * @returns {string} Random hex string
 */
function genRandomHex(len = 8) {
  const arr = new Uint8Array(len / 2);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Insert your DigitalOcean API token here
const DO_TOKEN = "";	//your do token

// CORS headers configuration
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/+|\/+$/g, '');

    // 0. GET / → Show usage examples
    if (request.method === "GET" && path === "") {
      const usage = `
DigitalOcean Droplet API Usage Examples:

1. Create a Droplet (POST /)
   curl -X POST https://do.zrhe2016.workers.dev/

   Response:
   {
     "success": true,
     "id": 12345678
   }

2. Get Droplet IP (GET /<id>)
   curl --request GET https://do.zrhe2016.workers.dev//12345678

   Response:
   {
     "success": true,
     "ip": "203.0.113.42"
   }

3. Delete All Droplets (DELETE /delete-all)
   curl --request DELETE https://do.zrhe2016.workers.dev/delete-all

   Response:
   {
     "success": true,
     "deleted": [12345678, 87654321],
     "failed": []
   }
`;
      return new Response(usage.trim(), {
        status: 200,
        headers: {
          "Content-Type": "text/plain;charset=UTF-8",
          ...CORS_HEADERS
        }
      });
    }

    // 1. Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    // 2. POST / → Create a new Droplet
    if (request.method === "POST" && path === "") {
      try {
        const name = `droplet-${genRandomHex(8)}`;
        const cloudInit = `#cloud-config
package_update: true
runcmd:
- ufw disable
- sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config
- sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config
- systemctl restart sshd
- echo "root:pass" | chpasswd
- cd /root
- git clone https://github.com/ccollicutt/install-kubernetes
`;
        const dropletConfig = {
          name,
          size: "s-4vcpu-8gb-240gb-intel",
          region: "sgp1",
          image: "ubuntu-22-04-x64",
          vpc_uuid: "cef01daf-51d0-437f-adc6-f52b87fabb9a",
          user_data: cloudInit
        };

        const resp = await fetch("https://api.digitalocean.com/v2/droplets", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${DO_TOKEN}`
          },
          body: JSON.stringify(dropletConfig)
        });
        const data = await resp.json();

        return new Response(JSON.stringify({
          success: resp.ok,
          id: data.droplet?.id ?? null
        }), {
          status: resp.ok ? 200 : resp.status,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS
          }
        });
      } catch (e) {
        return new Response(JSON.stringify({
          success: false,
          id: null
        }), {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS
          }
        });
      }
    }

    // 3. GET /<id> → Retrieve Droplet IP
    if (request.method === "GET" && path && path !== "delete-all") {
      const id = path;
      try {
        const resp = await fetch(`https://api.digitalocean.com/v2/droplets/${id}`, {
          headers: { "Authorization": `Bearer ${DO_TOKEN}` }
        });
        const data = await resp.json();

        const ipv4Entry = data.droplet?.networks?.v4?.find(n => n.type === "public");
        const ip = ipv4Entry ? ipv4Entry.ip_address : null;

        return new Response(JSON.stringify({
          success: Boolean(ip),
          ip
        }), {
          status: resp.ok ? 200 : resp.status,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS
          }
        });
      } catch (e) {
        return new Response(JSON.stringify({
          success: false,
          ip: null
        }), {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS
          }
        });
      }
    }

    // 4. DELETE /delete-all → Delete all Droplets (up to 200 per request)
    if (request.method === "DELETE" && path === "delete-all") {
      try {
        const listResp = await fetch("https://api.digitalocean.com/v2/droplets?per_page=200", {
          headers: { "Authorization": `Bearer ${DO_TOKEN}` }
        });
        const listData = await listResp.json();
        const droplets = listData.droplets || [];

        const results = await Promise.all(droplets.map(d =>
          fetch(`https://api.digitalocean.com/v2/droplets/${d.id}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${DO_TOKEN}` }
          }).then(r => ({ id: d.id, ok: r.ok, status: r.status }))
        ));

        return new Response(JSON.stringify({
          success: true,
          deleted: results.filter(r => r.ok).map(r => r.id),
          failed: results.filter(r => !r.ok).map(r => ({ id: r.id, status: r.status }))
        }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS
          }
        });
      } catch (e) {
        return new Response(JSON.stringify({
          success: false,
          error: e.message
        }), {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS
          }
        });
      }
    }

    // 5. Fallback for unsupported routes/methods
    if (request.method === "GET") {
      return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
    }
    return new Response("Method Not Allowed", {
      status: 405,
      headers: CORS_HEADERS
    });
  }
};
