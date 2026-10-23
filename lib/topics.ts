export const TOPICS = [
 {id:'model', name:'基础模型', en:'Foundation models', description:'能力边界、训练方法与多模态演进', color:'#bc7348', icon:'◈'},
 {id:'reasoning', name:'推理与计算', en:'Reasoning & inference', description:'推理能力、测试时计算与推理效率', color:'#7c849e', icon:'⌘'},
 {id:'agent', name:'Agent', en:'Autonomous agents', description:'工具调用、记忆、协作与自主执行', color:'#668c72', icon:'✳'},
 {id:'rsi', name:'递归自我改进', en:'Recursive self-improvement', description:'自我改进、自动研究与能力反馈循环', color:'#ad845a', icon:'∞'},
 {id:'embodied', name:'具身智能', en:'Embodied intelligence', description:'机器人、世界模型与物理环境交互', color:'#6d8e99', icon:'⊞'},
 {id:'workforce', name:'数字员工', en:'Digital workforce', description:'工作流、岗位协作与企业落地', color:'#9b7c9c', icon:'▦'}
];
export type Source = {id:string;url:string;title:string;summary:string;body:string;topic:string;topics:string;author:string;company:string;publishedAt:string|null;collectedAt:string;status:string;facts:string;insight:string;error:string;starred:string};
export type Brief = {id:string;title:string;body:string;sourceIds:string;createdAt:string;kind:string};
export function topicName(id:string){return TOPICS.find(t=>t.id===id)?.name || (id==='unclassified'?'待分类':id);}
