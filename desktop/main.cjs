const {app,BrowserWindow,protocol,net,session}=require('electron');
const path=require('node:path');const fs=require('node:fs');const {pathToFileURL}=require('node:url');
const smoke=process.argv.includes('--smoke-test');
app.setPath('userData',path.join(app.getPath('appData'),'Expona'));
if(smoke)app.setPath('userData',path.join(app.getPath('temp'),'Expona-smoke'));
protocol.registerSchemesAsPrivileged([{scheme:'expona',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
app.setAppUserModelId('com.expona.wallet');
if(!app.requestSingleInstanceLock())app.quit();else{
let win;
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus();}});
app.whenReady().then(async()=>{
 const root=path.join(app.getAppPath(),'dist');
 protocol.handle('expona',req=>{const u=new URL(req.url);const file=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));if(u.host!=='app'||!file.startsWith(root+path.sep))return new Response('Forbidden',{status:403});return net.fetch(pathToFileURL(file).href);});
 session.defaultSession.setPermissionRequestHandler((_w,_p,cb)=>cb(false));
 session.defaultSession.webRequest.onHeadersReceived((details,cb)=>cb({responseHeaders:{...details.responseHeaders,'Content-Security-Policy':["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'none'"]}}));
 win=new BrowserWindow({width:1180,height:850,minWidth:420,minHeight:600,title:'Expona',backgroundColor:'#f8f9fb',autoHideMenuBar:true,show:!smoke,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
 win.setMenu(null);win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',(e,url)=>{if(!url.startsWith('expona://app/'))e.preventDefault();});
 await win.loadURL('expona://app/');
 if(smoke){try{const result=await win.webContents.executeJavaScript(`(async()=>{const title=document.title;const rendered=document.body.innerText.includes('Expona');await navigator.locks.request('smoke',()=>{localStorage.setItem('smoke','ok')});const storage=localStorage.getItem('smoke')==='ok';localStorage.removeItem('smoke');return {title,rendered,storage,secure:isSecureContext,locks:!!navigator.locks};})()`);fs.writeFileSync(path.join(process.env.PORTABLE_EXECUTABLE_DIR || process.cwd(),'desktop-smoke.json'),JSON.stringify(result,null,2));app.exit(Object.values(result).some(v=>v===false)?1:0);}catch(e){fs.writeFileSync(path.join(process.env.PORTABLE_EXECUTABLE_DIR || process.cwd(),'desktop-smoke.json'),JSON.stringify({error:e.message}));app.exit(1);}}
 });app.on('window-all-closed',()=>app.quit());
}

