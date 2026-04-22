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
        test:/\.(ts|tsx|js|jsx)$/,
        exclude:[/node_modules/,/\.spark-css/],
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
