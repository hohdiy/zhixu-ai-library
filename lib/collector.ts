import { TOPICS } from './topics';
export function safeUrl(input:string){
 const u=new URL(input); const h=u.hostname.toLowerCase();
 if(u.protocol!=='https:'||u.username||u.password||u.port||!h.includes('.')||h.includes(':')||/^\d+(\.\d+)*$/.test(h)||/(^|\.)(localhost|local|internal|test|invalid|example)$/.test(h)||h.endsWith('.localhost')||h.endsWith('.local')||h.endsWith('.internal')) throw new Error('请使用可公开访问的 HTTPS 网页链接');
 u.hash=''; for(const k of [...u.searchParams.keys()]) if(k.startsWith('utm_')||['fbclid','gclid'].includes(k))u.searchParams.delete(k);
 return u.toString();
}
function decode(s:string){return s.replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Math.min(Number(n),0x10ffff))).replace(/&#x([a-f0-9]+);/gi,(_,n)=>String.fromCodePoint(Math.min(parseInt(n,16),0x10ffff))).replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');}
export function classify(text:string){const rules:Record<string,RegExp>={model:/\b(llm|foundation model|language model|pretrain|multimodal|gpt|gemini|claude)\b|基础模型|大模型|多模态/gi, reasoning:/\b(reasoning|inference|chain.of.thought|test.time|vllm|sglang)\b|推理|思维链/gi, agent:/\b(agent|tool.use|tool.call|mcp|memory|multi.agent)\b|智能体|工具调用/gi,rsi:/recursive|self.improv|self.evol|automated research|自我改进|自动科研|递归/gi, embodied:/robot|embodied|world model|action model|具身|机器人|世界模型/gi,workforce:/digital employee|workforce|workflow|enterprise|数字员工|工作流|企业|岗位/gi}; const scores=TOPICS.map(t=>({id:t.id,n:(text.match(rules[t.id])||[]).length})).sort((a,b)=>b.n-a.n);return scores.filter(x=>x.n>0).slice(0,3).map(x=>x.id);}
export async function collect(input:string){
 let url=safeUrl(input);let res:Response|undefined;
 for(let i=0;i<4;i++){res=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(16000),headers:{'User-Agent':'ZhixuLibrary/1.0 (personal research collector)','Accept':'text/html,application/xhtml+xml,text/plain'}}); if([301,302,303,307,308].includes(res.status)){const location=res.headers.get('location');if(!location)throw new Error('来源重定向缺少目标'); url=safeUrl(new URL(location,url).toString());continue;}break;}
 if(!res?.ok)throw new Error(`原站暂时无法读取（${res?.status||'超时'}），已保留链接供稍后重试`);
 const type=res.headers.get('content-type')||'';if(!/text\/html|text\/plain|application\/xhtml/.test(type))throw new Error('已保存链接；此来源需要研读工具提取（例如 PDF）');
 const reader=res.body?.getReader();if(!reader)throw new Error('来源没有返回正文');let size=0;let html='';const decoder=new TextDecoder();try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>2_000_000)throw new Error('来源页面过大，已保存链接供研读');html+=decoder.decode(r.value,{stream:true});}}finally{await reader.cancel().catch(()=>{});}
 const meta=(name:string)=>{for(const tag of html.match(/<meta\b[^>]*>/gi)||[]){const attrs:Record<string,string>={};for(const m of tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g))attrs[m[1].toLowerCase()]=decode(m[2]);if(attrs.name===name||attrs.property===name)return attrs.content||'';}return '';};
 const title=(meta('og:title')||decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||new URL(url).hostname)).trim().slice(0,350);
 const plain=decode(html.replace(/<(script|style|nav|header|footer|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<\/(p|div|h[1-6]|article|section|li)>/gi,'\n').replace(/<[^>]+>/g,' ')).replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim().slice(0,45000);
 const summary=(meta('description')||meta('og:description')||plain.slice(0,300)).slice(0,650);
 const published=meta('article:published_time')||meta('date')||meta('citation_publication_date');const date=published&&Number.isFinite(Date.parse(published))?new Date(published).toISOString():null;
 const host=new URL(url).hostname.replace(/^www\./,'');const companies:Record<string,string>={'openai.com':'OpenAI','anthropic.com':'Anthropic','deepmind.google':'Google DeepMind','blog.google':'Google','ai.meta.com':'Meta','huggingface.co':'Hugging Face','nvidia.com':'NVIDIA','deepseek.com':'DeepSeek'};const company=Object.entries(companies).find(([d])=>host===d||host.endsWith('.'+d))?.[1]||'';
 const topics=classify(title+' '+summary+' '+plain.slice(0,12000));
 return {title,summary,body:plain,author:meta('author')||meta('citation_author'),company,publishedAt:date,topic:topics[0]||'unclassified',topics:JSON.stringify(topics)};
}
