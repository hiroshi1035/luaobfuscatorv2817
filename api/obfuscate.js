// api/obfuscate.js
// Robust Vercel Serverless handler with defensive parsing & error reporting.

export default async function handler(req, res) {
  // CORS for testing
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    // Helper: read raw body as text if req.body not provided
    async function readRawBody() {
      if (req.body && (typeof req.body === 'string' || Buffer.isBuffer(req.body))) {
        return typeof req.body === 'string' ? req.body : req.body.toString('utf8');
      }
      // Node.js request stream (defensive)
      return await new Promise((resolve, reject) => {
        let data = '';
        req.on && req.on('data', chunk => data += chunk);
        req.on && req.on('end', () => resolve(data));
        req.on && req.on('error', err => reject(err));
        // fallback: if no stream events (platform parsed body), return empty
        setTimeout(() => resolve(''), 50);
      });
    }

    // Simple obfuscator (safe and deterministic)
    function simpleObfuscate(code) {
      if (!code) return '';

      // 1) Extract string literals -> placeholders
      const strings = [];
      code = code.replace(/(\"(?:\\.|[^\\\"])*\"|'(?:\\.|[^\\'])*')/g, (m) => {
        const idx = strings.push(m) - 1;
        return `__STR${idx}__`;
      });

      // 2) Remove comments (block and line)
      code = code.replace(/--\[\[[\s\S]*?\]\]/g, '');
      code = code.replace(/(^|\n)\s*--.*(?=\n|$)/g, '\n');

      // 3) Collect local identifiers
      const locals = new Set();
      const localRegex = /\blocal\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
      let m;
      while ((m = localRegex.exec(code)) !== null) locals.add(m[1]);

      // 4) Map locals to short names _a, _b, ...
      const alpha = 'abcdefghijklmnopqrstuvwxyz';
      const shortNames = {};
      let idx = 0;
      for (const name of locals) {
        shortNames[name] = '_' + alpha[(idx++) % alpha.length];
      }
      for (const [orig, rep] of Object.entries(shortNames)) {
        const re = new RegExp('\\b' + orig + '\\b', 'g');
        code = code.replace(re, rep);
      }

      // 5) Minify: collapse spaces and remove empty lines
      code = code
        .split('\n')
        .map(l => l.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join('\n');

      // 6) Encode saved strings as base64 placeholders __B64("...") 
      function toBase64(strLiteral) {
        // strLiteral includes quotes at ends
        const inner = strLiteral.slice(1, -1)
          .replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t')
          .replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        return Buffer.from(inner, 'utf8').toString('base64');
      }

      code = code.replace(/__STR(\d+)__/g, (_, n) => `__B64("${toBase64(strings[Number(n)])}")`);

      return code;
    }

    // Lua base64 decoder string (inlined into output)
    const luaB64 = `
local function __B64(s)
  local b='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  s=s:gsub('[^'..b..'=]','')
  return (s:gsub('.',function(x)
    if x=='=' then return '' end
    local r,f='',(b:find(x)-1)
    for i=6,1,-1 do r=r..(f%2^i-f%2^(i-1)>0 and '1' or '0') end
    return r
  end):gsub('%d%d%d%d%d%d%d%d',function(x)
    local c=0
    for i=1,8 do c=c+(x:sub(i,i)=='1' and 2^(8-i) or 0) end
    return string.char(c)
  end))
end
`;

    const header = "--[[ Made By Hiroshi ]]---- Obfuscated By Hiroshi\n\n";

    if (req.method === 'GET') {
      // Accept small code via query param (URL-encoded). Good only for small scripts.
      let src = req.query && req.query.code ? req.query.code : 'print("Hello Executor!")';
      if (Array.isArray(src)) src = src.join('\n');
      const ob = simpleObfuscate(src);
      const out = header + luaB64 + '\n' + ob;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(200).send(out);
    }

    if (req.method === 'POST') {
      // Read body robustly
      let raw = '';
      if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
        // Vercel/Next may have parsed the JSON
        raw = typeof req.body.code === 'string' ? req.body.code : JSON.stringify(req.body);
      } else {
        raw = await readRawBody();
        // If raw looks like JSON, attempt parse and extract .code
        try {
          const parsed = JSON.parse(raw || '{}');
          if (parsed && typeof parsed.code === 'string') raw = parsed.code;
        } catch (e) {
          // not JSON — keep raw as-is (could be plain text)
        }
      }

      if (!raw || raw.trim().length === 0) {
        return res.status(400).json({ error: 'No code provided in POST body' });
      }

      const ob = simpleObfuscate(raw);
      const out = header + luaB64 + '\n' + ob;

      // Provide download-friendly response
      res.setHeader('Content-Disposition', 'attachment; filename=obfuscated.lua');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(200).send(out);
    }

    // Method not allowed
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    // Log the real error for debugging; return sanitized message
    console.error('Obfuscate handler error:', err && err.stack ? err.stack : err);
    // Return some info to help debugging in Vercel logs (not exposing internal stack to users)
    return res.status(500).json({ error: 'Internal server error', message: String(err && err.message ? err.message : err) });
  }
}      code = code.replace(re, rep);
    }

    // minify
    code = code
      .split('\\n')
      .map((l) => l.replace(/\\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\\n');

    // encode strings
    function toBase64(str) {
      const q = str[0];
      let inner = str.slice(1, -1);
      inner = inner
        .replace(/\\\\n/g, '\\n')
        .replace(/\\\\r/g, '\\r')
        .replace(/\\\\t/g, '\\t')
        .replace(/\\\\'/g, \"'\")
        .replace(/\\\\\\\"/g, '\"')
        .replace(/\\\\\\\\/g, '\\\\');
      return Buffer.from(inner, 'utf8').toString('base64');
    }
    code = code.replace(/__STR(\\d+)__/g, (_, idx) => {
      return `__B64(\"${toBase64(strings[Number(idx)])}\")`;
    });

    return code;
  }

  // Lua base64 decoder
  const luaB64 = `
local function __B64(s)
  local b='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  s=s:gsub('[^'..b..'=]','')
  return (s:gsub('.',function(x)
    if x=='=' then return '' end
    local r,f='',(b:find(x)-1)
    for i=6,1,-1 do r=r..(f%2^i-f%2^(i-1)>0 and '1' or '0') end
    return r
  end):gsub('%d%d%d%d%d%d%d%d',function(x)
    local c=0
    for i=1,8 do c=c+(x:sub(i,i)=='1' and 2^(8-i) or 0) end
    return string.char(c)
  end))
end
`;

  const header = "--[[ Made By Hiroshi ]]---- Obfuscated By Hiroshi\\n\\n";

  if (req.method === 'GET') {
    let src = req.query.code || 'print(\"Hello Executor!\")';
    if (Array.isArray(src)) src = src.join('\\n');
    const out = header + luaB64 + '\\n' + simpleObfuscate(src);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(out);
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'object') body = body.code || '';
    const out = header + luaB64 + '\\n' + simpleObfuscate(body);
    res.setHeader('Content-Disposition', 'attachment; filename=obfuscated.lua');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(out);
  }

  res.status(405).json({ error: 'Method not allowed' });
}
