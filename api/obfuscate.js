// api/obfuscate.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // simple obfuscator
  function simpleObfuscate(code) {
    if (!code) return '';

    // save strings first
    const strings = [];
    code = code.replace(/(\"(?:\\.|[^\"])*\"|'(?:\\.|[^'])*')/g, (m) => {
      const idx = strings.push(m) - 1;
      return `__STR${idx}__`;
    });

    // remove comments
    code = code.replace(/--\\[\\[[\\s\\S]*?\\]\\]/g, '');
    code = code.replace(/(^|\\n)\\s*--.*(?=\\n|$)/g, '\\n');

    // rename locals
    const locals = new Set();
    let m;
    const regex = /\\blocal\\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
    while ((m = regex.exec(code)) !== null) locals.add(m[1]);

    const shortNames = {};
    const alpha = 'abcdefghijklmnopqrstuvwxyz';
    let i = 0;
    for (const name of locals) {
      shortNames[name] = '_' + alpha[i++ % alpha.length];
    }
    for (const [orig, rep] of Object.entries(shortNames)) {
      const re = new RegExp('\\\\b' + orig + '\\\\b', 'g');
      code = code.replace(re, rep);
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
