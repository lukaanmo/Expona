// All monetary inputs and outputs are integer cents. No network or model calls.
export const monthKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
const integer=(n,label)=>{if(!Number.isSafeInteger(n)||n<0)throw Error(`${label}必须是非负安全整数`);};
export function runRules(pool,buckets,rules,used={}){
 integer(pool,'资金');const original=pool,balances={};const ids=new Set();
 for(const [id,b] of Object.entries(buckets)){integer(b.balance,'余额');if(b.cap!==undefined)integer(b.cap,'上限');balances[id]=b.balance;}
 for(const r of rules){if(ids.has(r.id))throw Error('规则标识重复');ids.add(r.id);if(!buckets[r.bucket])throw Error('未知资金用途');integer(r.priority,'优先级');if(!['fill','period','percent','remainder'].includes(r.type))throw Error('未知规则类型');if(r.type==='fill'||r.type==='period')integer(r.target,'目标');if(r.limit!==undefined)integer(r.limit,'周期额度');if(r.type==='percent'){integer(r.bps,'比例');if(r.bps>10000)throw Error('比例超限');}if(r.type==='remainder'){integer(r.weight,'权重');if(!r.weight||r.weight>10000)throw Error('权重必须在 1–10000');}integer(used[r.id]??0,'已用额度');}
 const changes=[],details=[];const sorted=rules.filter(r=>r.enabled!==false).sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id));
 const spent={};
 const room=r=>Math.max(0,Math.min((buckets[r.bucket].cap??Number.MAX_SAFE_INTEGER)-balances[r.bucket],(r.limit??Number.MAX_SAFE_INTEGER)-(used[r.id]??0)-(spent[r.id]??0)));
 function give(r,want){const amount=Math.min(pool,want,room(r));balances[r.bucket]+=amount;pool-=amount;spent[r.id]=(spent[r.id]??0)+amount;if(amount)changes.push({id:r.id,bucket:r.bucket,label:r.label,amount});return amount;}
 for(const r of sorted.filter(r=>r.type!=='remainder')){let want=r.type==='fill'?Math.max(0,r.target-balances[r.bucket]):r.type==='period'?Math.max(0,r.target-(used[r.id]??0)):Number(BigInt(original)*BigInt(r.bps)/10000n);want=Math.min(want,room(r));const amount=give(r,want);details.push({label:r.label,want,amount,reason:r.reason||r.type});}
 // Largest remainder apportionment, repeating when a capped bucket fills.
 let active=sorted.filter(r=>r.type==='remainder'&&room(r)>0);
 while(pool&&active.length){const base=pool,weight=active.reduce((a,r)=>a+BigInt(r.weight),0n);const shares=active.map(r=>({r,q:BigInt(base)*BigInt(r.weight)/weight,rem:BigInt(base)*BigInt(r.weight)%weight}));let extra=base-shares.reduce((a,x)=>a+Number(x.q),0);shares.sort((a,b)=>a.rem===b.rem?a.r.id.localeCompare(b.r.id):a.rem>b.rem?-1:1);let moved=0;for(const x of shares){const amount=give(x.r,Number(x.q)+(extra-->0?1:0));moved+=amount;}if(!moved)break;active=active.filter(r=>room(r)>0);}
 if(changes.reduce((a,x)=>a+x.amount,0)+pool!==original)throw Error('资金守恒校验失败');return {changes,details,leftover:pool,balances};
}
export function migrate(s){if(!s)return s;const n=structuredClone(s);n.version??=0;n.ledger??=[];n.periodUsage??={};n.strategy??={mode:'priority',reserveLimit:0,growthWeight:1};n.goals.forEach((g,i)=>g.id??=`goal-${i}`);return n;}
export function finalize(current,next,{id,type,at=new Date().toISOString()} ){
 const before=migrate(current),n=migrate(next);if(before&&n.version!==before.version)throw Error('数据已变化，请重新预览');if(before?.ledger.some(e=>e.id===id))throw Error('此操作已经确认，请勿重复提交');
 const snapshot=s=>s?{accounts:s.accounts,goals:s.goals,living:s.living,reserve:s.reserve,free:s.free,growth:s.growth,strategy:s.strategy,monthly:s.monthly,payday:s.payday,reserveTarget:s.reserveTarget,freeTarget:s.freeTarget,bills:s.bills,periodUsage:s.periodUsage}:null;
 n.version=(before?.version??0)+1;n.ledger=[...(before?.ledger??[]),{id,type,at,before:snapshot(before),after:snapshot(n),allocation:n.pendingAllocation??null}];delete n.pendingAllocation;return n;
}
