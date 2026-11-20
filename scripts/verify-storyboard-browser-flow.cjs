/* Real production components/styles in Chromium. All IO is replaced at bundle
 * boundaries, and every network request is intercepted. No production data or
 * provider call is used. Run with the isolated WSL QA runtime. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createRequire } = require('node:module');
const qaRoot = process.env.PROPIG_QA_TOOLS || path.join(os.homedir(), '.local/share/propig-tools');
const qa = createRequire(path.join(qaRoot, 'package.json'));
const { chromium } = qa('playwright-core');
const { build } = qa('esbuild');
const repo = path.resolve(__dirname, '..');
const outputDir = process.env.STORYBOARD_QA_OUTPUT || path.join(os.tmpdir(), 'propig-storyboard-browser-flow');

const mocks = {
  '@/contexts/AuthContext': `const currentUser={uid:'fixture-user'};export const useAuth=()=>({currentUser});`,
  '@/lib/firebase-auth-retry': `export const withFirebaseAuthRetry=(_,fn)=>fn('fixture-token');`,
  '@/hooks/useStoryboardVideoJobs': `import {useSyncExternalStore} from 'react';
    const subscribe=fn=>{window.addEventListener('fixture-jobs',fn);return()=>window.removeEventListener('fixture-jobs',fn)};
    export const useStoryboardVideoJobs=()=>({jobs:useSyncExternalStore(subscribe,()=>window.__fixture.jobs),isReady:true,error:null,retry(){}});`,
  '@/services/imageStoryboardService': `export const imageStoryboardService={};`,
  '@/services/videoStudioService': `export const videoStudioService={
    getStudioRuntimeStatus:async()=>({worker:{compatible:true,message:'ready'},openRouterApiKeyConfigured:true}),
    getVideoEstimate:async()=>({canSubmit:true,estimatedCostUsd:.1,modelName:'Fixture',modelId:'fixture-model',resolvedDuration:6,resolvedResolution:'720p',requestedInputs:{firstFrame:true,lastFrame:false,visualReferences:false,audioMode:'silent'},selectionReasons:[],warnings:[],catalogModelCount:1,compatibleModelCount:1,
      catalog:{source:'cache'},credit:{state:'available',remainingUsd:50,isSufficient:true},policy:{visualInputState:'not_requested',automaticRetryAllowed:false,recommendedActions:[]},capabilities:{firstFrame:true,lastFrame:true,visualReferences:true,audio:true,dialogueLipSync:true}}),
    updateProject:async()=>{},createProject:async()=> 'fixture-video-project',
    submitStudioJob:async input=>{window.__fixture.requests.push(input);return new Promise(resolve=>{window.__fixture.resolveSubmission=resolve})},
    hasStudioJobOnServer:async()=>false,
    updateStudioJob:async input=>{window.__fixture.recoveries.push(input);return {success:true,cancellationRequested:true}},
  };`,
  '@/lib/client/media-download': `export const createDownloadFileName=(name,ext)=>name+'.'+ext;export const downloadRemoteMedia=async url=>{window.__fixture.downloads.push(url)};export const openRemoteMedia=()=>{};`,
  sonner: `export const toast=Object.fromEntries(['success','error','info','warning'].map(key=>[key,(message)=>window.__fixture.notices.push({key,message})]));`,
  '@/components/image-generator/StoryboardProjectFileManager': `export default function FileManager(){return null}`,
};
const entry = `
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import Panel from '@/components/image-generator/StoryboardVideoProductionPanel';
import {ImageStoryboardSchema} from '@/schemas/imageStoryboard';
window.__fixture={jobs:[],requests:[],recoveries:[],downloads:[],notices:[]};
const initial=ImageStoryboardSchema.parse({title:'통합 검증 프로젝트',topic:'합성 데이터의 제작 흐름',logline:'검수와 조립',audience:'일반 시청자',aspectRatio:'16:9',stylePreset:'cinematic',
 artDirection:'부드러운 조명',characterContinuity:'같은 캐릭터',settingContinuity:'동일한 공간',colorAndLighting:'자연광',
 videoProduction:{projectId:'fixture-video-project',qualityMode:'proof'},
 scenes:[1,2].map(order=>({id:'scene-'+order,order,title:order+'번 검증 장면',status:'generated',duration:'6초',
 narrativeBeat:'물건을 바라본다',shotSize:'미디엄 샷',cameraDirection:'고정 카메라',dialogueOrCaption:'',
 visualPrompt:'밝은 실내',imagePrompt:'밝은 실내에서 물건을 바라보는 캐릭터',continuityAnchor:'같은 의상',transition:'컷',negativePrompt:'',
 generatedImage:{id:'image-'+order,url:'https://storyboard-test.invalid/image.png',generatedAt:1},
 video:{status:order===1?'approved':'review',clipId:'clip-'+order,artifactId:'clip-'+order,approvedAt:order===1?1:null,
 videoUrl:'https://storyboard-test.invalid/clip.mp4',motionPrompt:'고정 카메라에서 자연스럽게 움직인다',useNextSceneAsEndFrame:false}}))});
function App(){const [board,setBoard]=useState(initial);const [active,setActive]=useState('scene-1');
 window.__fixture.board=board;window.__fixture.active=active;window.__fixture.setBoard=setBoard;
 return <main><h1>스토리보드 제작 흐름 검증</h1><Panel storyboardId='fixture-board' storyboard={board} referenceAssets={board.referenceAssets}
 activeSceneId={active} onActiveSceneChange={setActive} onDuplicateScene={()=>{}} onOpenImageWorkspace={()=>{window.__fixture.imageOpened=true}}
 onChange={setBoard}/></main>}
createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
`;

async function main() {
  const bundle = await build({ stdin: { contents: entry, resolveDir: repo, sourcefile: 'storyboard-browser-fixture.tsx', loader: 'tsx' },
    absWorkingDir: repo, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"development"' },
    tsconfigRaw: { compilerOptions: { baseUrl: repo, paths: { '@/*': ['./src/*'] } } },
    plugins: [{ name: 'isolated-fixture-io', setup(api) {
      api.onResolve({ filter: /.*/ }, args => mocks[args.path] ? { path: args.path, namespace: 'fixture' } : null);
      api.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'js', resolveDir: repo }));
    } }],
  });
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>스토리보드 격리 검증</title>
    <style>:root{--text-main:#17213a;--text-muted:#626d83;--primary:#335dff;--border-subtle:#dae0eb;--bg-card:#fff;--bg-elevated:#f3f5fa}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:#f6f7fa}main{max-width:1120px;margin:auto;padding:16px}h1{font-size:22px}button,input,textarea,select{font:inherit}</style></head><body><div id="root"></div><script>${bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || path.join(os.homedir(), '.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'), args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage(), errors = [], unmocked = [];
    page.setDefaultTimeout(12000);
    page.on('pageerror', error => { errors.push(error.message); console.error('Fixture render error:', error.message); });
    await context.route('**/*', route => {
      const url = route.request().url();
      if (url === 'https://storyboard-test.invalid/') return route.fulfill({ contentType: 'text/html', body: html });
      if (url.startsWith('https://storyboard-test.invalid/') && url.endsWith('.png')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#ccd8ed"/></svg>' });
      if (url === 'https://storyboard-test.invalid/clip.mp4' || url === 'https://storyboard-test.invalid/final.mp4') return route.fulfill({ status: 204 });
      unmocked.push(url); return route.abort();
    });
    await page.goto('https://storyboard-test.invalid/', { waitUntil: 'domcontentloaded' });
    const journey = page.getByTestId('storyboard-production-journey');
    await journey.getByRole('button', { name: '완성된 장면 영상 검수·승인', exact: true }).click();
    await page.waitForFunction(() => window.__fixture.active === 'scene-2');
    await page.locator('#storyboard-video-scene-scene-2').getByRole('button', { name: '장면 승인', exact: true }).click();
    await journey.getByRole('button', { name: '승인 영상으로 완성본 만들기', exact: true }).click();
    await page.waitForFunction(() => window.__fixture.requests.length === 1);
    assert.deepEqual(await page.evaluate(() => window.__fixture.requests.map(item => item.operation)), ['merge']);
    assert.equal(await journey.locator('button[disabled]').count() > 0, true, 'Pending merge disables duplicate submission');
    await page.evaluate(() => {
      window.__fixture.jobs = [{id:'fixture-merge',userId:'fixture-user',projectId:'fixture-video-project',kind:'merge',status:'queued'}];
      window.dispatchEvent(new Event('fixture-jobs'));
      window.__fixture.resolveSubmission({success:true,jobId:'fixture-merge',status:'queued'});
    });
    await page.waitForFunction(() => window.__fixture.board.videoProduction.finalJobId === 'fixture-merge');
    await page.evaluate(() => {
      window.__fixture.jobs=[{...window.__fixture.jobs[0],status:'completed',clipId:'final-clip',resultVideoUrl:'https://storyboard-test.invalid/final.mp4'}];
      window.dispatchEvent(new Event('fixture-jobs'));
    });
    await journey.getByRole('button', { name: '완성본 다운로드', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__fixture.downloads.length), 1);
    assert.equal(await page.evaluate(() => window.__fixture.requests.length), 1, 'Review and download never create a generation request');
    fs.mkdirSync(outputDir, { recursive: true });
    for (const width of [1365,390]) {
      await page.setViewportSize({ width, height: 900 });
      const metrics = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
      assert.equal(metrics.page <= metrics.viewport, true, `${width}px must not overflow`);
      for (const control of [journey.getByRole('button', { name: '완성본 다운로드', exact: true }), page.getByRole('button', { name: '완성본 받기', exact: true })]) {
        const box = await control.boundingBox();
        assert(box && box.x >= 0 && box.x + box.width <= width, 'Primary delivery actions must remain within the viewport');
      }
      await page.screenshot({ path: path.join(outputDir, `storyboard-flow-${width}.png`), fullPage: true });
    }
    await page.evaluate(() => {
      const fixture = window.__fixture;
      fixture.jobs=[{id:'running-scene',userId:'fixture-user',projectId:'fixture-video-project',kind:'generate',status:'running'}];
      fixture.setBoard(current => ({...current, scenes:current.scenes.map((scene,index)=>({...scene,video:{...scene.video,
        ...(index===0?{status:'rendering',jobId:'running-scene',lastFrameUrl:'https://storyboard-test.invalid/old-frame.png'}:{status:'approved',firstFrameApplied:true})}})),
        videoProduction:{...current.videoProduction,automationRunId:'fixture-run',automationStatus:'running',automationCurrentSceneIndex:0,
          automationCompletedSceneIds:['scene-2'],finalJobId:null,finalStatus:'idle',finalFreshness:'stale'}}));
      window.dispatchEvent(new Event('fixture-jobs'));
    });
    await page.waitForFunction(() => window.__fixture.board.videoProduction.automationStatus==='running');
    await page.evaluate(() => {
      window.__fixture.jobs=[{...window.__fixture.jobs[0],status:'completed',clipId:'new-clip-1',resultVideoUrl:'https://storyboard-test.invalid/clip.mp4',resultFrameUrl:'https://storyboard-test.invalid/new-frame.png'}];
      window.dispatchEvent(new Event('fixture-jobs'));
    });
    await page.waitForFunction(() => window.__fixture.board.videoProduction.automationStatus==='paused').catch(async error => {
      console.error('Expanded-scope fixture state:', await page.evaluate(() => ({ status:window.__fixture.board.videoProduction.automationStatus,
        scenes:window.__fixture.board.scenes.map(scene=>({id:scene.id,status:scene.video.status,firstFrame:scene.video.firstFrameApplied})),
        operations:window.__fixture.requests.map(request=>request.operation), notices:window.__fixture.notices })));
      throw error;
    });
    assert.equal(await page.evaluate(() => window.__fixture.board.scenes[1].video.status), 'brief');
    assert.equal(await page.evaluate(() => window.__fixture.requests.length), 1, 'Newly affected approved scenes cannot generate beyond the confirmed scope');
    assert.equal(await page.evaluate(() => window.__fixture.board.scenes[0].video.clipId), 'new-clip-1', 'The completed request keeps its result while the run pauses');
    if (await page.evaluate(() => window.__fixture.board.scenes[0].video.status === 'review')) {
      await journey.getByRole('button',{name:'완성된 장면 영상 검수·승인',exact:true}).click();
      await page.locator('#storyboard-video-scene-scene-1').getByRole('button',{name:'장면 승인',exact:true}).click();
    }
    await journey.getByRole('button',{name:'이어 만들기 내용 확인',exact:true}).click();
    const approval=page.locator('#storyboard-video-approval');
    await approval.waitFor();
    assert.match(await approval.innerText(), /남은 1개 장면 제작/);
    assert.equal(await approval.getByRole('button',{name:'확인하고 이어 만들기',exact:true}).isDisabled(),true);
    assert.equal(await page.evaluate(() => window.__fixture.requests.length),1, 'Resume still requires a new explicit cost confirmation');
    assert.deepEqual(errors, [], 'Real component render has no page errors');
    assert.deepEqual(unmocked, [], 'Every external request is blocked or replaced');
    console.log('PASS real Chromium: review → approve → merge → latest download; expanded scope pauses and requires confirmation; pending guard; desktop/mobile; zero external IO.');
    console.log(`Synthetic screenshots: ${outputDir}`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
