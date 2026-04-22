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
    if (ch==="`")           return {type:"STRING",value:this.rTpl(adv),line:sl,col:sc};
    if (ch==="-"||(ch>="0"&&ch<="9")) return {type:"NUMBER",value:this.rNum(adv),line:sl,col:sc};
    if (ch==="_"||ch==="$"||(ch>="a"&&ch<="z")||(ch>="A"&&ch<="Z"))
      return {type:"IDENT",value:this.rId(adv),line:sl,col:sc};
    if(adv)this.adv(); return {type:"UNKNOWN",value:ch,line:sl,col:sc};
  }
  private adv(){if(this.src[this.pos]==="\n"){this.line++;this.col=1;}else this.col++;this.pos++;}
  private skipWS(){
    while(this.pos<this.src.length){
      const c=this.src[this.pos];
      if(c===" "||c==="\t"||c==="\r"||c==="\n"){this.adv();continue;}
      if(c==="/"&&this.src[this.pos+1]==="/"){while(this.pos<this.src.length&&this.src[this.pos]!=="\n")this.adv();continue;}
      if(c==="/"&&this.src[this.pos+1]==="*"){this.adv();this.adv();while(this.pos<this.src.length){if(this.src[this.pos]==="*"&&this.src[this.pos+1]==="/"){this.adv();this.adv();break;}this.adv();}continue;}
      break;
    }
  }
  private rStr(q:string,adv:boolean):string{
    const s=this.pos,sl=this.line,sc=this.col;
    if(adv)this.adv();else this.pos++;
    let r="";
    while(this.pos<this.src.length&&this.src[this.pos]!==q){
      if(this.src[this.pos]==="\\"&&adv){this.adv();r+=this.src[this.pos];this.adv();}
      else{r+=this.src[this.pos];if(adv)this.adv();else this.pos++;}
    }
    if(adv)this.adv();else this.pos++;
    if(!adv){this.pos=s;this.line=sl;this.col=sc;}
    return r;
  }
  private rTpl(adv:boolean):string{
    const s=this.pos;if(adv)this.adv();else this.pos++;
    let r="";
    while(this.pos<this.src.length&&this.src[this.pos]!=="`"){r+=this.src[this.pos];if(adv)this.adv();else this.pos++;}
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
    if(t.type!=="LBRACE"){errors.push({message:`Expected '{', got '${t.value}'`,line:t.line,col:t.col,file});return null;}
    const res: StyleObject = {};
    while(true){
      const k=lex.peek();
      if(k.type==="RBRACE"){lex.next();break;}
      if(k.type==="EOF"){errors.push({message:"Unexpected end",line:k.line,col:k.col,file});break;}
      let key="";
      if(k.type==="STRING"||k.type==="IDENT"||k.type==="NUMBER") key=lex.next().value;
      else{errors.push({message:`Bad key '${k.value}'`,line:k.line,col:k.col,file});lex.next();}
      const colon=lex.next();
      if(colon.type!=="COLON"){errors.push({message:`Expected ':' got '${colon.value}'`,line:colon.line,col:colon.col,file});continue;}
      const v=lex.peek();
      if(v.type==="LBRACE"){const n=parseObj();if(n&&key)res[key]=n;}
      else if(v.type==="STRING"){lex.next();if(key)res[key]=v.value;}
      else if(v.type==="NUMBER"){lex.next();if(key)res[key]=parseFloat(v.value);}
      else{const t2=lex.next();if(t2.value!=="true"&&t2.value!=="false"&&t2.value!=="null"&&t2.value!=="undefined")errors.push({message:`Variable '${t2.value}' not supported — use a literal`,line:t2.line,col:t2.col,file});}
      if(lex.peek().type==="COMMA")lex.next();
    }
    return res;
  }
  return {obj:parseObj(),errors};
}
