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
    if(k in VARIANTS){if(typeof v!=="object"){errors.push({message:`Variant '${k}' must be an object`,line:0,col:0,file});continue;}cls.push(...processStyles(v as StyleObject,VARIANTS[k],file,errors));continue;}
    if(k.startsWith("@")){errors.push({message:`At-rules not allowed inside sc.create()`,line:0,col:0,file});continue;}
    if(typeof v==="object"){errors.push({message:`Unknown variant '${k}'. Add via sc.extend().`,line:0,col:0,file});continue;}
    const sv=String(v), c=classFor(k,sv,sel);
    globalRegistry.add({cls:c,prop:toKebab(k),value:sv,selector:sel});
    cls.push(c);
  }
  return cls;
}

function findCalls(src:string): Array<{fullStart:number;fullEnd:number;argSrc:string}> {
  const calls: Array<{fullStart:number;fullEnd:number;argSrc:string}>=[];
  const pat=/\bsc\.create\s*\(\s*/g; let m: RegExpExecArray|null;
  while((m=pat.exec(src))!==null){
    const op=m.index+m[0].length; if(src[op]!=="{") continue;
    let depth=0,inStr=false,strCh="",end=op;
    for(let i=op;i<src.length;i++){
      const ch=src[i];
      if(inStr){if(ch===strCh&&src[i-1]!=="\\")inStr=false;continue;}
      if(ch==='"'||ch==="'"||ch==="`"){inStr=true;strCh=ch;continue;}
      if(ch==="{")depth++;
      if(ch==="}"){depth--;if(depth===0){end=i+1;let pe=end;while(pe<src.length&&/\s/.test(src[pe]))pe++;if(src[pe]===")") pe++;calls.push({fullStart:m.index,fullEnd:pe,argSrc:src.slice(op,end)});break;}}
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
    if(!obj){warnings.push(`[spark-css] Could not parse sc.create() in ${file}`);continue;}
    const resolved: Record<string,string>={};
    for(const [key,styles] of Object.entries(obj)){
      if(typeof styles!=="object"){errors.push({message:`Key '${key}' must be an object`,line:0,col:0,file});continue;}
      resolved[key]=[...new Set(processStyles(styles as StyleObject,undefined,file,errors))].join(" ");
    }
    rules.push(...globalRegistry.getAll().filter(r=>Object.values(resolved).some(v=>v.includes(r.cls))));
    const rep=JSON.stringify(resolved), s2=call.fullStart+offset, e2=call.fullEnd+offset;
    result=result.slice(0,s2)+rep+result.slice(e2); offset+=rep.length-(e2-s2); changed=true;
  }
  if(changed&&!result.includes("sc.")){
    result=result
      .replace(/import\s+\{[^}]*\bsc\b[^}]*\}\s+from\s+["']spark-css[^"']*["'];?\n?/g,"")
      .replace(/import\s+sc\s+from\s+["']spark-css[^"']*["'];?\n?/g,"");
  }
  return {code:result,rules:globalRegistry.getAll(),changed,errors,warnings};
}
