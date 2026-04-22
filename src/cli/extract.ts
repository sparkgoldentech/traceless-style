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
  console.log("\n🔥 spark-css — extracting...\n");
  globalRegistry.clear();
  const files=walk(SRC,[".ts",".tsx",".js",".jsx"]);
  const allErrors: string[]=[];
  let totalFiles=0;
  for(const file of files){
    const src=fs.readFileSync(file,"utf8");
    const r=transform(src,file);
    r.errors.forEach(e=>allErrors.push(`  ❌ ${path.relative(ROOT,e.file)}:${e.line}:${e.col} — ${e.message}`));
    r.warnings.forEach(w=>console.warn(`  ⚠️  ${w}`));
    if(r.changed) totalFiles++;
  }
  const rules=globalRegistry.getAll();
  const css=DEV?generateCSSPretty(rules):generateCSS(rules);
  const meta=buildClassMeta(rules);
  fs.mkdirSync(path.dirname(OUT_CSS),{recursive:true});
  fs.mkdirSync(path.dirname(OUT_META),{recursive:true});
  fs.writeFileSync(OUT_CSS,css);
  fs.writeFileSync(OUT_META,JSON.stringify(meta,null,2));
  if(allErrors.length){ console.error("Errors:\n"+allErrors.join("\n")+"\n"); if(!DEV) process.exit(1); }
  console.log(`✅ spark-css: ${totalFiles} files | ${rules.length} rules | ${css.length} bytes\n`);
}

async function watch(){
  await extract();
  console.log("👀 Watching...\n");
  let t: NodeJS.Timeout;
  fs.watch(SRC,{recursive:true},(_,f)=>{
    if(!f||![".ts",".tsx",".js",".jsx"].includes(path.extname(f))) return;
    clearTimeout(t);
    t=setTimeout(()=>{ console.log(`🔄 ${f}`); extract().catch(console.error); },100);
  });
}

WATCH ? watch().catch(console.error) : extract().catch(e=>{console.error(e);process.exit(1);});
