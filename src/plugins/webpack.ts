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
  errors.forEach(e=>console.error(`[spark-css] ${path.relative(process.cwd(),e.file)}:${e.line}:${e.col} — ${e.message}`));
  return code;
}
