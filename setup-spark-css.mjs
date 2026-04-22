/**
 * setup-spark-css.mjs
 * Works on Windows, Mac, Linux — just needs Node.js
 * Run: node setup-spark-css.mjs
 */

import fs   from "fs";
import path from "path";

const ROOT = process.cwd();

function write(filePath, content) {
  const full = path.join(ROOT, filePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content.trimStart());
  console.log(`  ✅ ${filePath}`);
}

console.log("\n🔥 Setting up spark-css...\n");

// ─────────────────────────────────────────
write("src/compiler/hash.ts", `
export function fnv32a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h  = (Math.imul(h, 0x01000193)) >>> 0;
  }
  return h.toString(36).slice(0, 6);
}
export function toKebab(prop: string): string {
  return prop
    .replace(/([A-Z])/g, m => \`-\${m.toLowerCase()}\`)
    .replace(/^(webkit|moz|ms)/, "-$1");
}
export function classFor(prop: string, value: string, selector?: string): string {
  const key = selector ? \`\${prop}:\${value}:\${selector}\` : \`\${prop}:\${value}\`;
  return \`sc\${fnv32a(key)}\`;
}
`);

// ─────────────────────────────────────────
write("src/compiler/css-gen.ts", `
export interface AtomicRule {
  cls:       string;
  prop:      string;
  value:     string;
  selector?: string;
  order:     number;
}

export function generateCSS(rules: AtomicRule[]): string {
  return [...rules]
    .sort((a, b) => a.order - b.order)
    .map(r => {
      const d = \`\${r.prop}:\${r.value}\`;
      if (!r.selector)                return \`.\${r.cls}{\${d}}\`;
      if (r.selector.startsWith("@")) return \`\${r.selector}{.\${r.cls}{\${d}}}\`;
      if (r.selector.includes("&"))   return \`\${r.selector.replace(/&/g, \`.\${r.cls}\`)}{\${d}}\`;
      return \`.\${r.cls}\${r.selector}{\${d}}\`;
    })
    .join("");
}

export function generateCSSPretty(rules: AtomicRule[]): string {
  const lines = ["/* spark-css — generated */\\n"];
  [...rules].sort((a, b) => a.order - b.order).forEach(r => {
    const d = \`  \${r.prop}: \${r.value};\`;
    if (!r.selector)                lines.push(\`.\${r.cls} {\\n\${d}\\n}\\n\`);
    else if (r.selector.startsWith("@")) lines.push(\`\${r.selector} {\\n  .\${r.cls} {\\n  \${d}\\n  }\\n}\\n\`);
    else if (r.selector.includes("&"))   lines.push(\`\${r.selector.replace(/&/g,\`.\${r.cls}\`)} {\\n\${d}\\n}\\n\`);
    else                            lines.push(\`.\${r.cls}\${r.selector} {\\n\${d}\\n}\\n\`);
  });
  return lines.join("");
}

export function buildClassMeta(rules: AtomicRule[]): Record<string, string> {
  const m: Record<string, string> = {};
  rules.forEach(r => { m[r.cls] = r.selector ? \`\${r.prop}:\${r.selector}\` : r.prop; });
  return m;
}
`);

// ─────────────────────────────────────────
write("src/compiler/ast-parser.ts", `
export interface ParseError { message: string; line: number; col: number; file: string; }
export type StyleValue  = string | number;
export type StyleObject = { [key: string]: StyleValue | StyleObject };

interface Tok { type: string; value: string; line: number; col: number; }

class Lexer {
  private pos=0; private line=1; private col=1;
  constructor(private src: string) {}
  peek(): Tok { return this.read(false); }
  next(): Tok { return this.read(true);  }
  private read(adv: boolean): Tok {
    this.skipWS();
    if (this.pos >= this.src.length) return {type:"EOF",value:"",line:this.line,col:this.col};
    const sl=this.line, sc=this.col, ch=this.src[this.pos];
    if (ch==="{") { if(adv)this.adv(); return {type:"LBRACE",value:"{",line:sl,col:sc}; }
    if (ch==="}") { if(adv)this.adv(); return {type:"RBRACE",value:"}",line:sl,col:sc}; }
    if (ch===":") { if(adv)this.adv(); return {type:"COLON", value:":",line:sl,col:sc}; }
    if (ch===",") { if(adv)this.adv(); return {type:"COMMA", value:",",line:sl,col:sc}; }
    if (ch==='"'||ch==="'") return {type:"STRING",value:this.rStr(ch,adv),line:sl,col:sc};
    if (ch==="\`")           return {type:"STRING",value:this.rTpl(adv),line:sl,col:sc};
    if (ch==="-"||(ch>="0"&&ch<="9")) return {type:"NUMBER",value:this.rNum(adv),line:sl,col:sc};
    if (ch==="_"||ch==="$"||(ch>="a"&&ch<="z")||(ch>="A"&&ch<="Z"))
      return {type:"IDENT",value:this.rId(adv),line:sl,col:sc};
    if(adv)this.adv(); return {type:"UNKNOWN",value:ch,line:sl,col:sc};
  }
  private adv(){if(this.src[this.pos]==="\\n"){this.line++;this.col=1;}else this.col++;this.pos++;}
  private skipWS(){
    while(this.pos<this.src.length){
      const c=this.src[this.pos];
      if(c===" "||c==="\\t"||c==="\\r"||c==="\\n"){this.adv();continue;}
      if(c==="/"&&this.src[this.pos+1]==="/"){while(this.pos<this.src.length&&this.src[this.pos]!=="\\n")this.adv();continue;}
      if(c==="/"&&this.src[this.pos+1]==="*"){this.adv();this.adv();while(this.pos<this.src.length){if(this.src[this.pos]==="*"&&this.src[this.pos+1]==="/"){this.adv();this.adv();break;}this.adv();}continue;}
      break;
    }
  }
  private rStr(q:string,adv:boolean):string{
    const s=this.pos,sl=this.line,sc=this.col;
    if(adv)this.adv();else this.pos++;
    let r="";
    while(this.pos<this.src.length&&this.src[this.pos]!==q){
      if(this.src[this.pos]==="\\\\"&&adv){this.adv();r+=this.src[this.pos];this.adv();}
      else{r+=this.src[this.pos];if(adv)this.adv();else this.pos++;}
    }
    if(adv)this.adv();else this.pos++;
    if(!adv){this.pos=s;this.line=sl;this.col=sc;}
    return r;
  }
  private rTpl(adv:boolean):string{
    const s=this.pos;if(adv)this.adv();else this.pos++;
    let r="";
    while(this.pos<this.src.length&&this.src[this.pos]!=="\`"){r+=this.src[this.pos];if(adv)this.adv();else this.pos++;}
    if(adv)this.adv();else this.pos++;
    if(!adv)this.pos=s;
    return r;
  }
  private rNum(adv:boolean):string{
    const s=this.pos;let r="";
    if(this.src[this.pos]==="-"){r+="-";if(adv)this.adv();else this.pos++;}
    while(this.pos<this.src.length){const c=this.src[this.pos];if((c>="0"&&c<="9")||c==="."){r+=c;if(adv)this.adv();else this.pos++;}else break;}
    if(!adv)this.pos=s;return r;
  }
  private rId(adv:boolean):string{
    const s=this.pos;let r="";
    while(this.pos<this.src.length){const c=this.src[this.pos];if(c==="_"||c==="$"||c==="-"||(c>="a"&&c<="z")||(c>="A"&&c<="Z")||(c>="0"&&c<="9")){r+=c;if(adv)this.adv();else this.pos++;}else break;}
    if(!adv)this.pos=s;return r;
  }
}

export function parseStyleObject(src: string, file="<unknown>"): {obj:StyleObject|null; errors:ParseError[]} {
  const errors: ParseError[] = [];
  const lex = new Lexer(src);
  function parseObj(): StyleObject|null {
    const t = lex.next();
    if(t.type!=="LBRACE"){errors.push({message:\`Expected '{', got '\${t.value}'\`,line:t.line,col:t.col,file});return null;}
    const res: StyleObject = {};
    while(true){
      const k=lex.peek();
      if(k.type==="RBRACE"){lex.next();break;}
      if(k.type==="EOF"){errors.push({message:"Unexpected end",line:k.line,col:k.col,file});break;}
      let key="";
      if(k.type==="STRING"||k.type==="IDENT"||k.type==="NUMBER") key=lex.next().value;
      else{errors.push({message:\`Bad key '\${k.value}'\`,line:k.line,col:k.col,file});lex.next();}
      const colon=lex.next();
      if(colon.type!=="COLON"){errors.push({message:\`Expected ':' got '\${colon.value}'\`,line:colon.line,col:colon.col,file});continue;}
      const v=lex.peek();
      if(v.type==="LBRACE"){const n=parseObj();if(n&&key)res[key]=n;}
      else if(v.type==="STRING"){lex.next();if(key)res[key]=v.value;}
      else if(v.type==="NUMBER"){lex.next();if(key)res[key]=parseFloat(v.value);}
      else{const t2=lex.next();if(t2.value!=="true"&&t2.value!=="false"&&t2.value!=="null"&&t2.value!=="undefined")errors.push({message:\`Variable '\${t2.value}' not supported — use a literal\`,line:t2.line,col:t2.col,file});}
      if(lex.peek().type==="COMMA")lex.next();
    }
    return res;
  }
  return {obj:parseObj(),errors};
}
`);

// ─────────────────────────────────────────
write("src/compiler/extractor.ts", `
import { parseStyleObject, StyleObject, ParseError } from "./ast-parser";
import { classFor, toKebab }                          from "./hash";
import type { AtomicRule }                            from "./css-gen";

export interface TransformResult { code:string; rules:AtomicRule[]; changed:boolean; errors:ParseError[]; warnings:string[]; }

class RuleRegistry {
  private rules = new Map<string, AtomicRule>();
  private order = 0;
  add(r: Omit<AtomicRule,"order">): AtomicRule {
    if(this.rules.has(r.cls)) return this.rules.get(r.cls)!;
    const full={...r,order:this.order++}; this.rules.set(r.cls,full); return full;
  }
  getAll(): AtomicRule[] { return [...this.rules.values()].sort((a,b)=>a.order-b.order); }
  clear(): void { this.rules.clear(); this.order=0; }
}
export const globalRegistry = new RuleRegistry();

export const VARIANTS: Record<string,string> = {
  _hover:":hover", _focus:":focus", _focusWithin:":focus-within", _focusVisible:":focus-visible",
  _active:":active", _visited:":visited", _disabled:":disabled", _checked:":checked",
  _placeholder:"::placeholder", _before:"::before", _after:"::after", _selection:"::selection",
  _dark:":is(.dark *)", _light:":not(.dark) &", _rtl:'[dir="rtl"] &', _ltr:'[dir="ltr"] &',
  _first:":first-child", _last:":last-child", _odd:":nth-child(odd)", _even:":nth-child(even)",
  _empty:":empty", _groupHover:".group:hover &", _groupFocus:".group:focus &",
  _peerFocus:".peer:focus ~ &", _peerChecked:".peer:checked ~ &",
  sm:"@media (min-width:640px)", md:"@media (min-width:768px)",
  lg:"@media (min-width:1024px)", xl:"@media (min-width:1280px)", "2xl":"@media (min-width:1536px)",
  print:"@media print", motionSafe:"@media (prefers-reduced-motion:no-preference)",
  motionReduce:"@media (prefers-reduced-motion:reduce)", darkOS:"@media (prefers-color-scheme:dark)",
};

function processStyles(obj:StyleObject, sel?:string, file="<unknown>", errors:ParseError[]=[]): string[] {
  const cls: string[]=[];
  for(const [k,v] of Object.entries(obj)){
    if(v===undefined||v===null) continue;
    if(k in VARIANTS){if(typeof v!=="object"){errors.push({message:\`Variant '\${k}' must be an object\`,line:0,col:0,file});continue;}cls.push(...processStyles(v as StyleObject,VARIANTS[k],file,errors));continue;}
    if(k.startsWith("@")){errors.push({message:\`At-rules not allowed inside sc.create()\`,line:0,col:0,file});continue;}
    if(typeof v==="object"){errors.push({message:\`Unknown variant '\${k}'. Add via sc.extend().\`,line:0,col:0,file});continue;}
    const sv=String(v), c=classFor(k,sv,sel);
    globalRegistry.add({cls:c,prop:toKebab(k),value:sv,selector:sel});
    cls.push(c);
  }
  return cls;
}

function findCalls(src:string): Array<{fullStart:number;fullEnd:number;argSrc:string}> {
  const calls: Array<{fullStart:number;fullEnd:number;argSrc:string}>=[];
  const pat=/\\bsc\\.create\\s*\\(\\s*/g; let m: RegExpExecArray|null;
  while((m=pat.exec(src))!==null){
    const op=m.index+m[0].length; if(src[op]!=="{") continue;
    let depth=0,inStr=false,strCh="",end=op;
    for(let i=op;i<src.length;i++){
      const ch=src[i];
      if(inStr){if(ch===strCh&&src[i-1]!=="\\\\")inStr=false;continue;}
      if(ch==='"'||ch==="'"||ch==="\`"){inStr=true;strCh=ch;continue;}
      if(ch==="{")depth++;
      if(ch==="}"){depth--;if(depth===0){end=i+1;let pe=end;while(pe<src.length&&/\\s/.test(src[pe]))pe++;if(src[pe]===")") pe++;calls.push({fullStart:m.index,fullEnd:pe,argSrc:src.slice(op,end)});break;}}
    }
  }
  return calls;
}

export function transform(src:string, file:string): TransformResult {
  const errors:ParseError[]=[],warnings:string[]=[],rules:AtomicRule[]=[];
  if(!src.includes("sc.create")) return {code:src,rules:[],changed:false,errors:[],warnings:[]};
  const calls=findCalls(src);
  if(!calls.length) return {code:src,rules:[],changed:false,errors:[],warnings:[]};
  let result=src,offset=0,changed=false;
  for(const call of calls){
    const {obj,errors:pe}=parseStyleObject(call.argSrc,file); errors.push(...pe);
    if(!obj){warnings.push(\`[spark-css] Could not parse sc.create() in \${file}\`);continue;}
    const resolved: Record<string,string>={};
    for(const [key,styles] of Object.entries(obj)){
      if(typeof styles!=="object"){errors.push({message:\`Key '\${key}' must be an object\`,line:0,col:0,file});continue;}
      resolved[key]=[...new Set(processStyles(styles as StyleObject,undefined,file,errors))].join(" ");
    }
    rules.push(...globalRegistry.getAll().filter(r=>Object.values(resolved).some(v=>v.includes(r.cls))));
    const rep=JSON.stringify(resolved), s2=call.fullStart+offset, e2=call.fullEnd+offset;
    result=result.slice(0,s2)+rep+result.slice(e2); offset+=rep.length-(e2-s2); changed=true;
  }
  if(changed&&!result.includes("sc.")){
    result=result
      .replace(/import\\s+\\{[^}]*\\bsc\\b[^}]*\\}\\s+from\\s+["']spark-css[^"']*["'];?\\n?/g,"")
      .replace(/import\\s+sc\\s+from\\s+["']spark-css[^"']*["'];?\\n?/g,"");
  }
  return {code:result,rules:globalRegistry.getAll(),changed,errors,warnings};
}
`);

// ─────────────────────────────────────────
write("src/types/variants.ts", `
import { VARIANTS } from "../compiler/extractor";
export type VariantKey = keyof typeof VARIANTS;
`);

// ─────────────────────────────────────────
write("src/runtime/index.ts", `
type StyleDef   = { [key: string]: string | number | Record<string, string | number> };
type StyleMap   = Record<string, StyleDef>;
type Resolved<T>= { [K in keyof T]: string };

let __meta: Record<string,string> = {};
export function __setMeta(m: Record<string,string>): void { __meta=m; }

export function merge(...inputs: (string|undefined|null|false)[]): string {
  if(!inputs.some(Boolean)) return "";
  if(!Object.keys(__meta).length) return inputs.filter(Boolean).join(" ");
  const map=new Map<string,string>();
  for(const i of inputs){ if(!i) continue; for(const c of i.split(/\\s+/)){ if(!c) continue; map.set(__meta[c]??c,c); } }
  return [...map.values()].join(" ");
}

export function cx(...inputs: (string|undefined|null|false|Record<string,boolean>)[]): string {
  const out: string[]=[];
  for(const i of inputs){ if(!i) continue; if(typeof i==="string") out.push(i); else Object.entries(i).forEach(([c,on])=>{if(on)out.push(c);}); }
  return out.join(" ");
}

export function create<T extends StyleMap>(map: T): Resolved<T> {
  if(process.env.NODE_ENV==="production")
    console.error("[spark-css] sc.create() ran at runtime in production! Run: npx spark-css extract");
  const r: Record<string,string>={};
  for(const k of Object.keys(map)) r[k]="";
  return r as Resolved<T>;
}

export const sc = { create, merge, cx };
export default sc;
`);

// ─────────────────────────────────────────
write("src/plugins/webpack.ts", `
import path  from "path";
import fs    from "fs";
import type { Compiler } from "webpack";
import { transform, globalRegistry } from "../compiler/extractor";
import { generateCSS, buildClassMeta } from "../compiler/css-gen";

const PLUGIN = "SparkCSSPlugin";

export class SparkCSSWebpackPlugin {
  apply(compiler: Compiler) {
    compiler.hooks.beforeCompile.tap(PLUGIN, () => { globalRegistry.clear(); });
    compiler.hooks.afterEmit.tap(PLUGIN, () => {
      const rules=globalRegistry.getAll(), css=generateCSS(rules), meta=buildClassMeta(rules);
      const outDir=path.join(compiler.context,"public");
      fs.mkdirSync(outDir,{recursive:true});
      fs.writeFileSync(path.join(outDir,"spark-css.css"),css);
      const metaDir=path.join(compiler.context,".spark-css");
      fs.mkdirSync(metaDir,{recursive:true});
      fs.writeFileSync(path.join(metaDir,"class-meta.json"),JSON.stringify(meta));
    });
  }
}

export function sparkCSSLoader(
  this: { resourcePath:string; cacheable?:()=>void },
  source: string
): string {
  if(this.cacheable) this.cacheable();
  if(![".ts",".tsx",".js",".jsx"].includes(path.extname(this.resourcePath))) return source;
  if(!source.includes("sc.create")) return source;
  const {code,errors,warnings}=transform(source,this.resourcePath);
  warnings.forEach(w=>console.warn(w));
  errors.forEach(e=>console.error(\`[spark-css] \${path.relative(process.cwd(),e.file)}:\${e.line}:\${e.col} — \${e.message}\`));
  return code;
}
`);

// ─────────────────────────────────────────
write("src/cli/extract.ts", `
#!/usr/bin/env node
import fs   from "fs";
import path from "path";
import { transform, globalRegistry } from "../compiler/extractor";
import { generateCSS, generateCSSPretty, buildClassMeta } from "../compiler/css-gen";

const args    = process.argv.slice(2);
const WATCH   = args.includes("--watch");
const DEV     = args.includes("--dev");
const ROOT    = process.cwd();
const SRC     = path.join(ROOT,"src");
const OUT_CSS = path.join(ROOT,"public","spark-css.css");
const OUT_META= path.join(ROOT,".spark-css","class-meta.json");

function walk(dir:string, exts:string[], files:string[]=[]): string[] {
  if(!fs.existsSync(dir)) return files;
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    if(e.name.startsWith(".")||e.name==="node_modules") continue;
    const full=path.join(dir,e.name);
    if(e.isDirectory()) walk(full,exts,files);
    else if(exts.includes(path.extname(e.name))) files.push(full);
  }
  return files;
}

async function extract(){
  console.log("\\n🔥 spark-css — extracting...\\n");
  globalRegistry.clear();
  const files=walk(SRC,[".ts",".tsx",".js",".jsx"]);
  const allErrors: string[]=[];
  let totalFiles=0;
  for(const file of files){
    const src=fs.readFileSync(file,"utf8");
    const r=transform(src,file);
    r.errors.forEach(e=>allErrors.push(\`  ❌ \${path.relative(ROOT,e.file)}:\${e.line}:\${e.col} — \${e.message}\`));
    r.warnings.forEach(w=>console.warn(\`  ⚠️  \${w}\`));
    if(r.changed) totalFiles++;
  }
  const rules=globalRegistry.getAll();
  const css=DEV?generateCSSPretty(rules):generateCSS(rules);
  const meta=buildClassMeta(rules);
  fs.mkdirSync(path.dirname(OUT_CSS),{recursive:true});
  fs.mkdirSync(path.dirname(OUT_META),{recursive:true});
  fs.writeFileSync(OUT_CSS,css);
  fs.writeFileSync(OUT_META,JSON.stringify(meta,null,2));
  if(allErrors.length){ console.error("Errors:\\n"+allErrors.join("\\n")+"\\n"); if(!DEV) process.exit(1); }
  console.log(\`✅ spark-css: \${totalFiles} files | \${rules.length} rules | \${css.length} bytes\\n\`);
}

async function watch(){
  await extract();
  console.log("👀 Watching...\\n");
  let t: NodeJS.Timeout;
  fs.watch(SRC,{recursive:true},(_,f)=>{
    if(!f||![".ts",".tsx",".js",".jsx"].includes(path.extname(f))) return;
    clearTimeout(t);
    t=setTimeout(()=>{ console.log(\`🔄 \${f}\`); extract().catch(console.error); },100);
  });
}

WATCH ? watch().catch(console.error) : extract().catch(e=>{console.error(e);process.exit(1);});
`);

// ─────────────────────────────────────────
write("src/nextjs.ts", `
import path from "path";
import fs   from "fs";
import type { NextConfig } from "next";
import { SparkCSSWebpackPlugin, sparkCSSLoader } from "./plugins/webpack";
export { SparkCSSWebpackPlugin };

export function withSparkCSS(nextConfig: NextConfig = {}): NextConfig {
  return {
    ...nextConfig,
    webpack(config, ctx) {
      config.module.rules.unshift({
        test:/\\.(ts|tsx|js|jsx)$/,
        exclude:[/node_modules/,/\\.spark-css/],
        use:[{loader:require.resolve("./plugins/webpack")}],
      });
      config.plugins=[...(config.plugins??[]),new SparkCSSWebpackPlugin()];
      const origEntry=config.entry;
      config.entry=async()=>{
        const entries=await(typeof origEntry==="function"?origEntry():Promise.resolve(origEntry));
        const cssPath=path.join(process.cwd(),"public/spark-css.css");
        try{if(!fs.existsSync(cssPath))fs.writeFileSync(cssPath,"");}catch{}
        return entries;
      };
      if(typeof nextConfig.webpack==="function") return nextConfig.webpack(config,ctx);
      return config;
    },
  };
}
`);

// ─────────────────────────────────────────
write("package.json", JSON.stringify({
  name: "spark-css",
  version: "1.0.0",
  description: "Zero-runtime atomic CSS-in-JS. Build-time. Safe AST parser. Webpack + Turbopack. No Babel.",
  author: "Spark Golden Tech",
  license: "MIT",
  main:   "./dist/runtime/index.js",
  module: "./dist/runtime/index.mjs",
  types:  "./dist/runtime/index.d.ts",
  bin:    { "spark-css": "./dist/cli/extract.js" },
  exports: {
    ".":         { import:"./dist/runtime/index.mjs", require:"./dist/runtime/index.js", types:"./dist/runtime/index.d.ts" },
    "./nextjs":  { import:"./dist/nextjs.mjs",        require:"./dist/nextjs.js",        types:"./dist/nextjs.d.ts" },
    "./webpack": { import:"./dist/plugins/webpack.mjs",require:"./dist/plugins/webpack.js",types:"./dist/plugins/webpack.d.ts" },
  },
  files: ["dist","README.md"],
  scripts: {
    build: "tsup",
    dev:   "tsup --watch",
    test:  "node test/test.mjs",
    prepublishOnly: "npm run build && npm test",
  },
  peerDependencies: { react: ">=18.0.0" },
  peerDependenciesMeta: { next:{ optional:true }, webpack:{ optional:true } },
  devDependencies: {
    "@types/node":    "^20.0.0",
    "@types/react":   "^19.0.0",
    "@types/webpack": "^5.0.0",
    next:             ">=15.0.0",
    tsup:             "^8.0.0",
    typescript:       "^5.0.0",
    webpack:          "^5.0.0",
  },
}, null, 2));

// ─────────────────────────────────────────
write("tsconfig.json", JSON.stringify({
  compilerOptions: {
    target: "ES2020", module: "NodeNext", moduleResolution: "NodeNext",
    lib: ["ES2020","DOM"], strict: true, declaration: true,
    declarationMap: true, sourceMap: true, outDir: "./dist",
    rootDir: "./src", skipLibCheck: true, esModuleInterop: true, jsx: "react-jsx",
  },
  include: ["src"],
  exclude: ["node_modules","dist","test"],
}, null, 2));

// ─────────────────────────────────────────
write("tsup.config.ts", `
import { defineConfig } from "tsup";
export default defineConfig([
  { entry:{"runtime/index":"src/runtime/index.ts"}, format:["cjs","esm"], dts:true, clean:false, minify:true, treeshake:true, external:["react","react-dom","next","webpack"], outDir:"dist" },
  { entry:{nextjs:"src/nextjs.ts"},                 format:["cjs","esm"], dts:true, clean:false, minify:true, external:["react","next","webpack","path","fs"], outDir:"dist" },
  { entry:{"plugins/webpack":"src/plugins/webpack.ts"}, format:["cjs","esm"], dts:true, clean:false, minify:false, external:["webpack","path","fs"], outDir:"dist" },
  { entry:{"cli/extract":"src/cli/extract.ts"},     format:["cjs"], dts:false, clean:false, minify:false, external:["path","fs"], outDir:"dist", banner:{js:"#!/usr/bin/env node"} },
]);
`);

// ─────────────────────────────────────────
write(".gitignore", `node_modules/\ndist/\n.spark-css/\n*.log\n.DS_Store\n`);

// ─────────────────────────────────────────
console.log("\n🎉 All files created successfully!\n");
console.log("Next steps:");
console.log("  1.  npm install");
console.log("  2.  npm run build");
console.log("  3.  git init && git add . && git commit -m 'initial commit'");
console.log("  4.  Push to GitHub\n");
