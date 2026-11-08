import {runRules,migrate,monthKey} from './strategy.js';
export const total=s=>s.accounts.reduce((a,x)=>a+x.balance,0);
export const saved=s=>s.growth+s.goals.reduce((a,x)=>a+x.saved,0);
export const assigned=s=>s.living+s.reserve+s.free+saved(s);
export const available=s=>total(s)-assigned(s);
export function cents(v){if(String(v).trim()==='')throw Error('请输入金额');const n=Number(v);if(!Number.isFinite(n)||n<0||n>1e10)throw Error('请输入有效的非负金额');return Math.round(n*100)}
export function nextPay(day,now=new Date()){let d=new Date(now.getFullYear(),now.getMonth(),Math.min(day,new Date(now.getFullYear(),now.getMonth()+1,0).getDate()));if(d<=now)d=new Date(now.getFullYear(),now.getMonth()+1,Math.min(day,new Date(now.getFullYear(),now.getMonth()+2,0).getDate()));return d}
export function needs(s,now=new Date()){const end=nextPay(s.payday,now);const start=new Date(now.getFullYear(),now.getMonth(),now.getDate());let budget=0;for(let d=new Date(start);d<end;d.setDate(d.getDate()+1)){budget+=s.monthly/new Date(d.getFullYear(),d.getMonth()+1,0).getDate();for(const b of s.bills){if(d.getDate()===Math.min(b.day,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()))budget+=b.amount}}return Math.round(budget)}
export function allocate(s,now=new Date()){
 const n=migrate(s),pool=available(n);if(pool<0)throw Error('请先处理余额核对产生的缺口');
 const period=monthKey(now),used=n.periodUsage[period]??{},buckets={},rules=[];
 for(const key of ['living','reserve','free','growth'])buckets[key]={balance:n[key]};
 const fill=(id,label,target,priority,extra={})=>rules.push({id,bucket:id,label,type:'fill',target,priority,reason:'按当前余额补足目标，不重复预留',...extra});
 fill('living','必要支出',needs(n,now),0);fill('reserve','备用金',n.reserveTarget,1,n.strategy.reserveLimit?{limit:n.strategy.reserveLimit}:{});fill('free','自由支配',n.freeTarget,2);
 for(const [i,g] of [...n.goals].sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id)).entries()){
  buckets[g.id]={balance:g.saved,cap:g.target};
  if(n.strategy.mode==='dynamic'&&g.due){const end=new Date(g.due+'T23:59:59');if(!Number.isFinite(+end))throw Error('目标日期无效');const months=Math.max(1,(end.getFullYear()-now.getFullYear())*12+end.getMonth()-now.getMonth()+1);const done=used['pace-'+g.id]??0;rules.push({id:'pace-'+g.id,bucket:g.id,label:g.name+' · 本月进度',type:'period',target:Math.ceil((Math.max(0,g.target-g.saved)+done)/months),priority:10+i,reason:'剩余缺口按含本月的日历月数平摊；本月已分配额度会扣除'});}
  if(n.strategy.mode==='dynamic')rules.push({id:'rest-'+g.id,bucket:g.id,label:g.name,type:'remainder',weight:Math.max(1,Math.floor(100/Math.max(1,g.priority))),priority:100+i});else rules.push({id:g.id,bucket:g.id,label:g.name,type:'fill',target:g.target,priority:10+i,reason:'按目标优先级补足'});
 }
 rules.push({id:'growth',bucket:'growth',label:'未来增长储备',type:'remainder',weight:n.strategy.growthWeight||1,priority:10000});
 const result=runRules(pool,buckets,rules,used);for(const key of ['living','reserve','free','growth'])n[key]=result.balances[key];n.goals.forEach(g=>g.saved=result.balances[g.id]);
 n.periodUsage[period]={...used};for(const c of result.changes)n.periodUsage[period][c.id]=(n.periodUsage[period][c.id]??0)+c.amount;
 n.pendingAllocation={period,mode:n.strategy.mode,changes:result.changes,details:result.details};
 return {state:n,changes:result.changes,details:result.details,shortfall:Math.max(0,needs(n,now)-n.living)};
}
export function reconcile(s,balances){if(balances.length!==s.accounts.length||balances.some(x=>!Number.isSafeInteger(x)||x<0))throw Error('账户余额无效');const n=structuredClone(s);n.accounts.forEach((a,i)=>a.balance=balances[i]);n.free-=Math.min(n.free,Math.max(0,-available(n)));return n}
